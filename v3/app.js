import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
    import {
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      signOut,
      onAuthStateChanged
    } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

    import {
      getFirestore,
      collection,
      addDoc,
      updateDoc,
      deleteDoc,
      doc,
      onSnapshot,
      serverTimestamp,
      query,
      orderBy
    } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

   const firebaseConfig = {
  apiKey: "AIzaSyB2pb9YEhmeJhhT6W8Ek1oRug3TtWSqbMM",
  authDomain: "auditflow-18f1e.firebaseapp.com",
  projectId: "auditflow-18f1e",
  storageBucket: "auditflow-18f1e.firebasestorage.app",
  messagingSenderId: "454180070741",
  appId: "1:454180070741:web:17a1b77698f1136750fbdc",
  measurementId: "G-XTXT1YFGME"
};

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    let currentUser = null;
    let findings = [];
    let filteredFindings = [];
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const appDiv = document.getElementById("app");
    const userInfo = document.getElementById("userInfo");

    loginBtn.onclick = async () => {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    };

    logoutBtn.onclick = async () => {
      await signOut(auth);
    };

    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        userInfo.innerText = `${user.displayName} (${user.email})`;
        loginBtn.classList.add("hidden");
        logoutBtn.classList.remove("hidden");
        appDiv.classList.remove("hidden");
        listenFindings();
        showPage("pageDashboard");
      } else {
        currentUser = null;
        userInfo.innerText = "ยังไม่ได้เข้าสู่ระบบ";
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
        appDiv.classList.add("hidden");
      }
    });

    function listenFindings() {
      const q = query(collection(db, "audit_findings"), orderBy("createdAt", "desc"));

      onSnapshot(q, (snapshot) => {
        findings = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
          
        filteredFindings = findings;
          
        renderDashboard();
        renderTable();
      });
    }

    window.saveFinding = async function () {
      const data = {
        findingId: getValue("findingId") || generateFindingId(),
        branch: getValue("branch"),
        auditArea: getValue("auditArea"),
        condition: getValue("condition"),
        criteria: getValue("criteria"),
        cause: getValue("cause"),
        effectRisk: getValue("effectRisk"),
        recommendation: getValue("recommendation"),
        riskLevel: getValue("riskLevel"),
        impact: Number(getValue("impact")),
        likelihood: Number(getValue("likelihood")),
        riskScore:
          Number(getValue("impact")) *
          Number(getValue("likelihood")),
        owner: getValue("owner"),
        dueDate: getValue("dueDate"),
        status: getValue("status"),
        evidenceLink: getValue("evidenceLink"),
        ownerResponse: getValue("ownerResponse"),
        revisedDueDate: getValue("revisedDueDate"),
        progressPercent: Number(getValue("progressPercent")),
        mapStatus: getValue("mapStatus"),
        updatedAt: serverTimestamp()
      };

      const docId = getValue("docId");

      if (docId) {
        if (data.status === "Closed") {
          data.closedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "audit_findings", docId), data);
      } else {
        data.createdBy = currentUser.email;
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "audit_findings"), data);
      }

      resetForm();
      alert("บันทึกข้อมูลเรียบร้อย");
    };

    window.editFinding = function (id) {
      const f = findings.find(x => x.id === id);
      if (!f) return;

      setValue("docId", f.id);
      setValue("findingId", f.findingId);
      setValue("branch", f.branch);
      setValue("auditArea", f.auditArea);
      setValue("condition", f.condition);
      setValue("criteria", f.criteria);
      setValue("cause", f.cause);
      setValue("effectRisk", f.effectRisk);
      setValue("recommendation", f.recommendation);
      setValue("riskLevel", f.riskLevel);
      setValue("impact", f.impact);
      setValue("likelihood", f.likelihood);
      setValue("owner", f.owner);
      setValue("dueDate", f.dueDate);
      setValue("status", f.status);
      setValue("evidenceLink", f.evidenceLink);
      setValue("ownerResponse", f.ownerResponse);
      setValue("revisedDueDate", f.revisedDueDate);
      setValue("progressPercent", f.progressPercent);
      setValue("mapStatus", f.mapStatus);
      window.scrollTo(0, 0);
    };

    window.deleteFinding = async function (id) {
      if (!confirm("ยืนยันลบ Finding นี้?")) return;
      await deleteDoc(doc(db, "audit_findings", id));
    };

    window.renderTable = function () {
      const tbody = document.getElementById("findingTable");
      const branch = getValue("filterBranch");
      const risk = getValue("filterRisk");
      const status = getValue("filterStatus");

      let filtered = findings.filter(f => {
        return (!branch || f.branch === branch)
          && (!risk || f.riskLevel === risk)
          && (!status || f.status === status);
      });

      tbody.innerHTML = filtered.map(f => {
        const aging = calculateAging(f.dueDate, f.status);
        const riskClass = f.riskLevel === "High" ? "risk-high" :
                          f.riskLevel === "Medium" ? "risk-medium" : "risk-low";

        return `
          <tr>
            <td>${f.findingId || ""}</td>
            <td>${f.branch || ""}</td>
            <td>${f.auditArea || ""}</td>
            <td class="${riskClass}">${f.riskLevel || ""}</td>
            <td>${f.status || ""}</td>
            <td>${f.owner || ""}</td>
            <td>${f.dueDate || ""}</td>
            <td>${aging}</td>
            <td>${f.mapStatus || "-"}</td>
            <td>${f.progressPercent || 0}%</td>
            <td>
              <button onclick="editFinding('${f.id}')">แก้ไข</button>
              <button class="danger" onclick="deleteFinding('${f.id}')">ลบ</button>
            </td>
          </tr>
        `;
      }).join("");
    };

function renderDashboard() {
    const data = filteredFindings;

    const total = data.length;
    const high = data.filter(f => f.riskLevel === "High").length;
    const open = data.filter(f => f.status !== "Closed").length;
    const overdue = data.filter(f => isOverdue(f.dueDate, f.status)).length;

    document.getElementById("totalFinding").innerText = total;
    document.getElementById("highRisk").innerText = high;
    document.getElementById("openFinding").innerText = open;
    document.getElementById("overdueFinding").innerText = overdue;

    renderRiskHeatmap();
    renderExecutiveDashboard();
    renderCharts();
    renderTeamDashboard();
    renderKanban();
}

    function calculateAging(dueDate, status) {
      if (!dueDate || status === "Closed") return "-";

      const today = new Date();
      const due = new Date(dueDate);
      const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));

      if (diff > 0) return `Overdue ${diff} วัน`;
      if (diff === 0) return "ครบกำหนดวันนี้";
      return `เหลือ ${Math.abs(diff)} วัน`;
    }

    function isOverdue(dueDate, status) {
      if (!dueDate || status === "Closed") return false;
      return new Date(dueDate) < new Date(new Date().toDateString());
    }

    window.exportCSV = function () {
      const headers = [
        "Finding ID", "Branch", "Audit Area", "Condition", "Criteria",
        "Cause", "Effect/Risk", "Recommendation", "Risk Level",
        "Owner", "Due Date", "Status", "Evidence Link"
      ];

      const rows = findings.map(f => [
        f.findingId, f.branch, f.auditArea, f.condition, f.criteria,
        f.cause, f.effectRisk, f.recommendation, f.riskLevel,
        f.owner, f.dueDate, f.status, f.evidenceLink
      ]);

      let csv = [headers, ...rows]
        .map(row => row.map(value => `"${(value || "").toString().replaceAll('"', '""')}"`).join(","))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "AuditFlow_v3_Finding_Register.csv";
      a.click();
    };

    window.resetForm = function () {
      [
      "docId", "findingId", "auditArea", "condition", "criteria",
      "cause", "effectRisk", "recommendation", "owner", "dueDate", "evidenceLink",
      "ownerResponse", "revisedDueDate", "progressPercent"
      ].forEach(id => setValue(id, ""));

      setValue("branch", "SPR");
      setValue("riskLevel", "High");
      setValue("impact", "3");
      setValue("likelihood", "3");
      setValue("status", "Open");
      setValue("progressPercent", "0");
      setValue("mapStatus", "Not Started");
    };

    function generateFindingId() {
      const year = new Date().getFullYear();
      const running = String(findings.length + 1).padStart(3, "0");
      return `AF-${year}-${running}`;
    }

    function getValue(id) {
      return document.getElementById(id).value;
    }

    function setValue(id, value) {
      document.getElementById(id).value = value || "";
    }
    function renderRiskHeatmap() {
 const container =
 document.getElementById("riskHeatmap");
 if (!container) return;
 let html = `<div class="heatmap">`;
 html += `<div></div>`;
 for (let i = 1; i <= 5; i++) {
 html += `
 <div class="heatmap-label">
 Impact ${i}
 </div>`;
 }
 for (let likelihood = 5; likelihood >= 1; likelihood--) {
 html += `
 <div class="heatmap-label">
 L${likelihood}
 </div>`;
 for (let impact = 1; impact <= 5; impact++) {
 const score = impact * likelihood;
 const count =
 findings.filter(f =>
 Number(f.impact) === impact &&
 Number(f.likelihood) === likelihood
 ).length;
 let cls = "hm-low";
 if (score >= 13) {
 cls = "hm-high";
 }
 else if (score >= 6) {
 cls = "hm-medium";
 }
 html += `
 <div class="heatmap-cell ${cls}">
 ${count}
 <br>
 Score ${score}
 </div>`;
 }
 }
 html += "</div>";
 container.innerHTML = html;
}
// Executive Dashboard
function renderExecutiveDashboard() {
  const data = getDashboardData();

  const total = data.length;
  const closed = data.filter(f => f.status === "Closed").length;

  const completionRate =
    total === 0 ? 0 : Math.round((closed / total) * 100);

  const criticalAction =
    data.filter(f =>
      f.riskLevel === "High" &&
      f.status !== "Closed"
    ).length;

  const completionEl = document.getElementById("completionRate");
  if (completionEl) completionEl.innerText = completionRate + "%";

  const criticalEl = document.getElementById("criticalAction");
  if (criticalEl) criticalEl.innerText = criticalAction;
}
function getDashboardData() {
    return filteredFindings;
}    
function countBy(field) {
 const result = {};
 getDashboardData().forEach(f => {
 const key =
 f[field] || "ไม่ระบุ";
 result[key] = (result[key] || 0) + 1;});return result;}
function renderBarChart(id, data) {
 const box =
 document.getElementById(id);
 if (!box) return;
 const max =
 Math.max(...Object.values(data), 1);
 let html = "";
 Object.keys(data).forEach(key => {
 const value = data[key];
 const width =
 (value / max) * 100;
 html += `
 <div class="bar-row">
 <div>${key}</div>
 <div class="bar-bg">
 <div class="bar-fill"
 style="width:${width}%">
 </div>
 </div>
 <div>${value}</div>
 </div>`;});box.innerHTML = html;}
    function countOpenByOwner() {
  const result = {};
  getDashboardData().forEach(f => {
    if (f.status !== "Closed") {
      const key = f.owner || "ไม่ระบุ Owner";
      result[key] = (result[key] || 0) + 1;
    }
  });

  return result;
}
let chartProgressObj, chartRiskObj, chartBranchObj, chartWorkloadObj;

function renderCharts() {
  setTimeout(() => {
    renderProgressChart();
    renderRiskChart();
    renderBranchChart();
    renderWorkloadChart();
  }, 300);
}
function createOrUpdateChart(canvasId, config, chartObjName) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");

  if (window[chartObjName]) {
    window[chartObjName].destroy();
  }

  window[chartObjName] = new Chart(ctx, config);
}
function renderProgressChart() {
    const data = getDashboardData();
    const total = data.length;
    const closed = data.filter(f => f.status === "Closed").length;
    const open = total - closed;

    createOrUpdateChart("chartProgress", {
    type: "doughnut",
    data: {
        labels: ["Closed", "Open"],
        datasets: [{
            data: [closed, open],
            backgroundColor: ["#38bdf8", "#fb7185"],
            borderColor: "#0f172a",
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
            legend: {
                position: "top"
            }
        }
    }
}, "chartProgressObj");
}
function renderRiskChart() {
  const data = getDashboardData();

  const low = data.filter(f => (f.riskLevel || "").toLowerCase() === "low").length;
  const medium = data.filter(f => (f.riskLevel || "").toLowerCase() === "medium").length;
  const high = data.filter(f => (f.riskLevel || "").toLowerCase() === "high").length;

  createOrUpdateChart("chartRisk", {
    type: "doughnut",
    data: {
      labels: ["Low", "Medium", "High"],
      datasets: [{
        data: [low, medium, high],
        backgroundColor: ["#22c55e", "#f59e0b", "#fb7185"],
        borderColor: "#0f172a",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "top" }
      }
    }
  }, "chartRiskObj");
}
function renderBranchChart() {
    const data = countBy("branch");

    createOrUpdateChart("chartBranch", {
        type: "bar",
        data: {
            labels: Object.keys(data),
            datasets: [{
                label: "Finding",
                data: Object.values(data),
                backgroundColor: "#38bdf8",
                borderRadius: 10,
                barThickness: 38
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: "top"
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: "#94a3b8"
                    },
                    grid: {
                        color: "rgba(148,163,184,0.08)"
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#94a3b8",
                        precision: 0
                    },
                    grid: {
                        color: "rgba(148,163,184,0.08)"
                    }
                }
            }
        }
    }, "chartBranchObj");
}
function renderWorkloadChart() {
    const data = countOpenByOwner();

    createOrUpdateChart("chartWorkload", {
        type: "bar",
        data: {
            labels: Object.keys(data),
            datasets: [{
                label: "Open Action",
                data: Object.values(data),
                backgroundColor: "#818cf8",
                borderRadius: 10,
                barThickness: 38
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: true,
                    position: "top"
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: "#94a3b8"
                    },
                    grid: {
                        color: "rgba(148,163,184,0.08)"
                    }
                },

                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#94a3b8",
                        precision: 0
                    },
                    grid: {
                        color: "rgba(148,163,184,0.08)"
                    }
                }
            }
        }
    }, "chartWorkloadObj");
}
function renderTeamDashboard(){
const total = findings.length;
const progress =
findings.filter(f =>
f.status === "In Progress"
).length;
const follow =
findings.filter(f =>
f.status !== "Closed"
).length;
const closed =
findings.filter(f =>
f.status === "Closed"
).length;
document.getElementById("teamTotal").innerText = total;
document.getElementById("teamProgress").innerText = progress;
document.getElementById("teamFollow").innerText = follow;
document.getElementById("teamClosed").innerText = closed;
renderTeamWorkload();
renderTeamTable();
}
function renderTeamWorkload(){
const data = {};
findings.forEach(f=>{
const owner = f.owner || "ไม่ระบุ";
data[owner] =
(data[owner] || 0) + 1;
});
let html="";
Object.keys(data).forEach(owner=>{
html += `
<div class="bar-row">
<div>${owner}</div>
<div class="bar-bg">
<div class="bar-fill"
style="width:${data[owner]*10}%">
</div>
</div>
<div>${data[owner]}</div>
</div>
`;
});
document.getElementById("teamWorkload").innerHTML = html;
}
function renderTeamTable(){
const owners = {};
findings.forEach(f=>{
const owner = f.owner || "ไม่ระบุ";
if(!owners[owner]){
owners[owner]={
total:0,
closed:0
};
}
owners[owner].total++;
if(f.status==="Closed"){
owners[owner].closed++;
}
});
let html="";
Object.keys(owners).forEach(o=>{
const pct =
Math.round(
(owners[o].closed /
owners[o].total)*100
);
html +=`
<tr>
<td>${o}</td>
<td>${owners[o].total}</td>
<td>${owners[o].closed}</td>
<td>${pct}%</td>
</tr>
`;
});
document.getElementById("teamTable").innerHTML = html;}
function renderKanban() {
  const columns = {
    Planning: document.getElementById("kanbanPlanning"),
    Fieldwork: document.getElementById("kanbanFieldwork"),
    Review: document.getElementById("kanbanReview"),
    Follow: document.getElementById("kanbanFollow"),
    Closed: document.getElementById("kanbanClosed")
  };

  Object.values(columns).forEach(c => {
    if (c) c.innerHTML = "";
  });

  findings.forEach(f => {
    let column = columns.Fieldwork;

    if (f.status === "Open") column = columns.Planning;
    if (f.status === "In Progress") column = columns.Fieldwork;
    if (f.mapStatus === "Verified") column = columns.Review;
    if (f.mapStatus === "Implemented") column = columns.Follow;
    if (f.status === "Closed") column = columns.Closed;

    if (!column) return;

    let riskClass = "kanban-risk-low";
    if (f.riskLevel === "High") riskClass = "kanban-risk-high";
    if (f.riskLevel === "Medium") riskClass = "kanban-risk-medium";

    column.innerHTML += `
      <div class="kanban-card ${riskClass}">
        <div class="kanban-card-title">${f.findingId || "-"}</div>
        <div>${f.auditArea || ""}</div>
        <hr>
        <div>Risk: ${f.riskLevel || "-"}</div>
        <div>Owner: ${f.owner || "-"}</div>
        <div>Due: ${f.dueDate || "-"}</div>
      </div>
    `;
  });
}
/* ======================================
   AuditFlow V3 Final Page Navigation
====================================== */

window.showPage = function(pageId) {

    // ซ่อนทุกหน้า
    document.querySelectorAll(".page-section").forEach(page => {

        page.classList.remove("active-page");
        page.style.display = "none";

    });


    // เปิดหน้าที่เลือก
    const target = document.getElementById(pageId);

    if (target) {

        target.classList.add("active-page");
        target.style.display = "block";

    }


    // active menu
    document.querySelectorAll(".sidebar button").forEach(btn => {

        btn.classList.remove("active");

        const click = btn.getAttribute("onclick") || "";

        if (click.includes(pageId)) {

            btn.classList.add("active");

        }

    });


    window.scrollTo(0,0);

};


/* หน้าแรก */
document.addEventListener("DOMContentLoaded", () => {

    showPage("pageDashboard");

});
window.applyDashboardFilter = function () {

    const branch =
    document.getElementById("filterBranch")?.value || "All";

    const risk =
    document.getElementById("filterRisk")?.value || "All";

    const status =
    document.getElementById("filterStatus")?.value || "All";


    filteredFindings = findings.filter(f => {

        return (
            (branch === "All" || f.branch === branch) &&
            (risk === "All" || f.riskLevel === risk) &&
            (status === "All" || f.status === status)
        );

    });


    renderDashboard();
    renderCharts();

};
