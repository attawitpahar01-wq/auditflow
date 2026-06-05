// AuditFlow Cloud v3.0 - Team Master + Progress Engine
// Upgrade from v2.0:
// 1) เพิ่ม Team Master ผ่าน Firestore collection: teamMembers
// 2) งานเก็บ ownerId + ownerName เพื่อให้ Dashboard รายคนคำนวณแม่นยำ
// 3) รองรับงานเดิมที่มีเฉพาะ owner โดย Match ชื่ออัตโนมัติ

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
  setDoc,
  doc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
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

let app, auth, db, provider;
let firebaseReady = false;
let unsubscribeTasks = null;
let unsubscribeTeam = null;
let currentUser = null;
let tasks = [];
let teamMembers = [];
let demoMode = false;
let teamSeedStarted = false;
let chartProgress = null;
let chartRisk = null;
let chartStatusBranch = null;
let chartWorkload = null;

try {
  firebaseReady = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE") && !firebaseConfig.apiKey.includes("...");
  if (firebaseReady) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
  }
} catch (error) {
  console.error("Firebase init error:", error);
  firebaseReady = false;
}

const branches = [
  { code:"SPR", name:"โรงพยาบาล สินแพทย์รามอินทรา (SPR)" },
  { code:"SRR", name:"โรงพยาบาล สินแพทย์เสรีรักษ์ (SRR)" },
  { code:"SPT", name:"โรงพยาบาล สินแพทย์เทพารักษ์ (SPT)" },
  { code:"SPS", name:"โรงพยาบาล สินแพทย์ศรีนครินทร์ (SPS)" },
  { code:"SPL", name:"โรงพยาบาล สินแพทย์ลำลูกกา (SPL)" },
  { code:"SPK", name:"โรงพยาบาล สินแพทย์กาญจนบุรี (SPK)" },
  { code:"SPN", name:"โรงพยาบาล สินแพทย์นครปฐม (SPN)" }
];

const defaultTeamMembers = [
  { id:"TM001", avatar:"N", name:"วิรชา วิบูลย์รส", role:"Senior Auditor", active:true, aliases:["น.วิรชา", "น วิรชา", "วิรชา", "N. วิรชา", "N วิรชา"] },
  { id:"TM002", avatar:"I", name:"ไอซเราะห์ สามะ", role:"Auditor", active:true, aliases:["ไอซเราะห์", "I.ไอซเราะห์", "I ไอซเราะห์"] },
  { id:"TM003", avatar:"P", name:"พรทิพา บุญช่วย", role:"Auditor", active:true, aliases:["พรทิพา", "P.พรทิพา", "P พรทิพา"] },
  { id:"TM004", avatar:"N", name:"อรรถวิทย์ พาหาร", role:"Supervisor", active:true, aliases:["นัท", "คุณนัท", "อรรถวิทย์", "N.อรรถวิทย์", "N อรรถวิทย์", "Supervisor"] },
  { id:"TM005", avatar:"S", name:"สุเทพ คงทอง", role:"Auditor", active:true, aliases:["สุเทพ", "S.สุเทพ", "S สุเทพ"] }
];

const statuses = [
  { key:"planning", label:"รอดำเนินการ" },
  { key:"fieldwork", label:"กำลังดำเนินการ" },
  { key:"review", label:"รอตรวจทาน" },
  { key:"done", label:"เสร็จสิ้น" }
];

const $ = id => document.getElementById(id);
const has = id => Boolean($(id));
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const normalize = value => String(value ?? "").toLowerCase().replace(/^(คุณ|นาย|นางสาว|นาง)\s*/g, "").replace(/[.\s\-_/]/g, "").trim();

function seedTasks(){
  return [
    {id:"demo1",title:"FA-03 วิเคราะห์ความเคลื่อนไหวสินทรัพย์",desc:"ตรวจ Rollforward และ Exception",branch:"SPT",ownerId:"TM004",owner:"อรรถวิทย์ พาหาร",risk:"High",status:"fieldwork",due:"2026-06-15",type:"Working Paper",evidence:[{name:"ตัวอย่าง Google Drive Folder",url:"https://drive.google.com/"}]},
    {id:"demo2",title:"ITGC-03 User Access Review",desc:"สอบทานสิทธิ์ผู้ใช้งานระบบสำคัญ",branch:"SPR",ownerId:"TM001",owner:"วิรชา วิบูลย์รส",risk:"Critical",status:"planning",due:"2026-06-20",type:"Working Paper",evidence:[]},
    {id:"demo3",title:"Follow-up Action Plan ประเด็น Antivirus",desc:"ติดตามแผนต่ออายุ License และ Update Agent",branch:"SRR",ownerId:"TM002",owner:"ไอซเราะห์ สามะ",risk:"High",status:"review",due:"2026-06-10",type:"Follow-up",evidence:[]}
  ];
}

function activeTeam(){
  const list = teamMembers.length ? teamMembers : defaultTeamMembers;
  return list.filter(m => m.active !== false).sort((a,b)=>(a.name||"").localeCompare(b.name||"", "th"));
}

function findMemberByOwner(owner, ownerId){
  if (ownerId) {
    const exact = teamMembers.find(m => m.id === ownerId) || defaultTeamMembers.find(m => m.id === ownerId);
    if (exact) return exact;
  }
  const key = normalize(owner);
  if (!key) return null;
  const list = [...teamMembers, ...defaultTeamMembers];
  return list.find(m => {
    const names = [m.name, m.avatar, ...(m.aliases || [])];
    return names.some(x => normalize(x) === key || normalize(x).includes(key) || key.includes(normalize(x)));
  }) || null;
}

function ownerName(t){
  const m = findMemberByOwner(t.owner, t.ownerId);
  return m?.name || t.owner || "ไม่ระบุ";
}

function ownerIdForTask(t){
  return t.ownerId || findMemberByOwner(t.owner, t.ownerId)?.id || "unassigned";
}

function localLoad(){
  teamMembers = JSON.parse(localStorage.getItem("auditflow_cloud_v3_team") || "null") || defaultTeamMembers;
  tasks = JSON.parse(localStorage.getItem("auditflow_cloud_v2_tasks") || "null") || seedTasks();
  refreshTeamOptions();
  render();
}
function localSave(){
  localStorage.setItem("auditflow_cloud_v2_tasks", JSON.stringify(tasks));
  render();
}
function localSaveTeam(){
  localStorage.setItem("auditflow_cloud_v3_team", JSON.stringify(teamMembers));
  refreshTeamOptions();
  render();
}

function showToast(message){
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function fillOptions(){
  const branchHtml = `<option value="all">ทุกสาขา</option>` + branches.map(b=>`<option value="${b.code}">${b.name}</option>`).join("");
  if (has("filter-branch")) $("filter-branch").innerHTML = branchHtml;
  if (has("task-branch")) $("task-branch").innerHTML = branches.map(b=>`<option value="${b.code}">${b.name}</option>`).join("");
  refreshTeamOptions();
}

function refreshTeamOptions(){
  const members = activeTeam();
  const options = members.map(m=>`<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}${m.role ? " — " + escapeHtml(m.role) : ""}</option>`).join("");
  if (has("filter-owner")) $("filter-owner").innerHTML = `<option value="all">ทุกคน</option>` + options;

  const current = has("task-owner") ? $("task-owner") : null;
  if (current && current.tagName !== "SELECT") {
    const select = document.createElement("select");
    select.id = "task-owner";
    select.required = true;
    current.replaceWith(select);
  }
  if (has("task-owner")) {
    $("task-owner").innerHTML = `<option value="" disabled>เลือกผู้รับผิดชอบ</option>` + options;
    if (!$("task-owner").value && members[0]) $("task-owner").value = members[0].id;
  }
  if (has("team-owner-list")) {
    $("team-owner-list").innerHTML = members.map(m=>`<option value="${escapeHtml(m.name)}"></option>`).join("");
  }
}

function branchName(code){return branches.find(b=>b.code===code)?.name || code;}
function isOverdue(t){return t.status!=="done" && t.due && new Date(t.due) < new Date(new Date().toDateString());}
function evidenceCount(t){return Array.isArray(t.evidence) ? t.evidence.length : 0;}
function statusLabel(key){return statuses.find(s=>s.key===key)?.label || key;}

function render(){
  renderStats();
  renderExecutiveAnalytics();
  renderTeamDashboard();
  renderKanban();
  renderTable();
  renderEvidence();
}

function renderStats(){
  if (!has("stat-total")) return;
  $("stat-total").textContent = tasks.length;
  $("stat-high").textContent = tasks.filter(t=>["High","Critical"].includes(t.risk)).length;
  $("stat-overdue").textContent = tasks.filter(isOverdue).length;
  $("stat-done").textContent = tasks.filter(t=>t.status==="done").length;
  $("branch-summary").innerHTML = branches.map(b=>{
    const list = tasks.filter(t=>t.branch===b.code);
    const done = list.filter(t=>t.status==="done").length;
    return `<div class="branch-item"><strong>${b.name}</strong><br><span>${list.length} งาน | เสร็จ ${done} งาน | Overdue ${list.filter(isOverdue).length}</span></div>`;
  }).join("");
}


function chartColors(){
  return {
    planning:"#3b82f6",
    fieldwork:"#f59e0b",
    review:"#a855f7",
    done:"#10b981",
    critical:"#ef4444",
    high:"#f97316",
    medium:"#facc15",
    low:"#22c55e",
    grid:"rgba(148,163,184,.14)",
    text:"#cbd5e1"
  };
}

function makeOrUpdateChart(existing, canvasId, config){
  if (!has(canvasId) || typeof Chart === "undefined") return existing;
  const ctx = $(canvasId);
  if (existing) {
    existing.data = config.data;
    existing.options = config.options;
    existing.update();
    return existing;
  }
  return new Chart(ctx, config);
}

function renderExecutiveAnalytics(){
  if (!has("chart-progress")) return;
  const c = chartColors();
  const total = tasks.length;
  const planning = tasks.filter(t=>t.status === "planning").length;
  const fieldwork = tasks.filter(t=>t.status === "fieldwork").length;
  const review = tasks.filter(t=>t.status === "review").length;
  const done = tasks.filter(t=>t.status === "done").length;
  const open = Math.max(total - done, 0);
  const completionPct = total ? Math.round(done / total * 100) : 0;
  if (has("kpi-completion-rate")) $("kpi-completion-rate").textContent = completionPct + "%";

  const baseOptions = {
    responsive:true,
    maintainAspectRatio:false,
    plugins:{
      legend:{labels:{color:c.text, font:{family:"Sarabun"}}},
      tooltip:{titleFont:{family:"Sarabun"}, bodyFont:{family:"Sarabun"}}
    }
  };

  chartProgress = makeOrUpdateChart(chartProgress, "chart-progress", {
    type:"doughnut",
    data:{
      labels:["เสร็จสิ้น", "คงเหลือ"],
      datasets:[{data:[done, open], backgroundColor:[c.done,"#263247"], borderWidth:0, cutout:"72%"}]
    },
    options:{...baseOptions, plugins:{...baseOptions.plugins, legend:{position:"bottom", labels:{color:c.text, font:{family:"Sarabun"}}}}}
  });

  const riskLabels = ["Critical", "High", "Medium", "Low"];
  const riskData = riskLabels.map(r => tasks.filter(t => t.risk === r).length);
  chartRisk = makeOrUpdateChart(chartRisk, "chart-risk", {
    type:"doughnut",
    data:{labels:riskLabels, datasets:[{data:riskData, backgroundColor:[c.critical,c.high,c.medium,c.low], borderWidth:0, cutout:"62%"}]},
    options:{...baseOptions, plugins:{...baseOptions.plugins, legend:{position:"bottom", labels:{color:c.text, font:{family:"Sarabun"}}}}}
  });

  chartStatusBranch = makeOrUpdateChart(chartStatusBranch, "chart-status-branch", {
    type:"bar",
    data:{
      labels:branches.map(b=>b.code),
      datasets:[
        {label:"Planning", data:branches.map(b=>tasks.filter(t=>t.branch===b.code && t.status==="planning").length), backgroundColor:c.planning},
        {label:"Fieldwork", data:branches.map(b=>tasks.filter(t=>t.branch===b.code && t.status==="fieldwork").length), backgroundColor:c.fieldwork},
        {label:"Review", data:branches.map(b=>tasks.filter(t=>t.branch===b.code && t.status==="review").length), backgroundColor:c.review},
        {label:"Done", data:branches.map(b=>tasks.filter(t=>t.branch===b.code && t.status==="done").length), backgroundColor:c.done}
      ]
    },
    options:{...baseOptions, scales:{x:{stacked:true, ticks:{color:c.text, font:{family:"Sarabun"}}, grid:{color:c.grid}}, y:{stacked:true, beginAtZero:true, ticks:{color:c.text, precision:0, font:{family:"Sarabun"}}, grid:{color:c.grid}}}}
  });

  const members = activeTeam();
  chartWorkload = makeOrUpdateChart(chartWorkload, "chart-workload", {
    type:"bar",
    data:{
      labels:members.map(m=>m.name.split(" ")[0]),
      datasets:[
        {label:"งานทั้งหมด", data:members.map(m=>tasks.filter(t=>ownerIdForTask(t)===m.id).length), backgroundColor:"#60a5fa"},
        {label:"เสร็จสิ้น", data:members.map(m=>tasks.filter(t=>ownerIdForTask(t)===m.id && t.status==="done").length), backgroundColor:c.done}
      ]
    },
    options:{...baseOptions, indexAxis:"y", scales:{x:{beginAtZero:true, ticks:{color:c.text, precision:0, font:{family:"Sarabun"}}, grid:{color:c.grid}}, y:{ticks:{color:c.text, font:{family:"Sarabun"}}, grid:{color:c.grid}}}}
  });

  if (has("audit-insights")) {
    const overdue = tasks.filter(isOverdue).length;
    const highOpen = tasks.filter(t=>["High","Critical"].includes(t.risk) && t.status!=="done").length;
    const busiest = members.map(m=>({m, n:tasks.filter(t=>ownerIdForTask(t)===m.id && t.status!=="done").length})).sort((a,b)=>b.n-a.n)[0];
    $("audit-insights").innerHTML = `
      <div class="mini-kpi-grid">
        <div class="mini-kpi"><span>Completion</span><strong>${completionPct}%</strong></div>
        <div class="mini-kpi"><span>Open</span><strong>${open}</strong></div>
        <div class="mini-kpi"><span>Overdue</span><strong>${overdue}</strong></div>
        <div class="mini-kpi"><span>High Risk Open</span><strong>${highOpen}</strong></div>
      </div>
      <div class="insight-item"><div class="insight-icon">✓</div><div><strong>งานเสร็จสิ้น ${done}/${total} งาน</strong><span>Completion Rate ปัจจุบัน ${completionPct}%</span></div></div>
      <div class="insight-item"><div class="insight-icon">⚠</div><div><strong>งานความเสี่ยงสูงที่ยังเปิดอยู่ ${highOpen} งาน</strong><span>ควรติดตามสถานะและกำหนดเจ้าของงานให้ชัดเจน</span></div></div>
      <div class="insight-item"><div class="insight-icon">👥</div><div><strong>ภาระงานเปิดสูงสุด: ${escapeHtml(busiest?.m?.name || "-")}</strong><span>${busiest?.n || 0} งานที่ยังไม่เสร็จ</span></div></div>`;
  }
}

function renderTeamDashboard(){
  if (!has("team-total")) return;
  const total = tasks.length;
  const pending = tasks.filter(t=>t.status === "planning").length;
  const progress = tasks.filter(t=>["fieldwork", "review"].includes(t.status)).length;
  const done = tasks.filter(t=>t.status === "done").length;
  const pct = total ? Math.round(done / total * 100) : 0;

  $("team-total").textContent = total;
  $("team-pending").textContent = pending;
  $("team-progress").textContent = progress;
  $("team-done").textContent = done;
  $("team-percent").textContent = pct + "%";
  const donut = $("team-percent")?.closest(".donut-ring");
  if (donut) donut.style.setProperty("--pct", pct + "%");
  $("team-pending-text").textContent = pending;
  $("team-progress-text").textContent = progress;
  $("team-done-text").textContent = done;

  const rows = activeTeam().map(member => {
    const list = tasks.filter(t => ownerIdForTask(t) === member.id);
    const memberDone = list.filter(t => t.status === "done").length;
    const memberPct = list.length ? Math.round(memberDone / list.length * 100) : 0;
    const open = list.length - memberDone;
    const overdue = list.filter(isOverdue).length;
    return `<div class="member-progress-item">
      <div class="member-avatar">${escapeHtml(member.avatar || member.name?.[0] || "?")}</div>
      <div>
        <div class="member-name">${escapeHtml(member.name)}</div>
        <div class="member-meta">${escapeHtml(member.role || "Auditor")} · ทั้งหมด ${list.length} | เปิด ${open} | เสร็จ ${memberDone} | เกินกำหนด ${overdue}</div>
        <div class="member-bar"><span style="width:${memberPct}%"></span></div>
      </div>
      <div class="member-percent">${memberPct}%</div>
    </div>`;
  }).join("");
  $("team-member-summary").innerHTML = rows || '<p class="meta">ยังไม่มีทีมงาน</p>';

  if (has("team-task-table")) {
    $("team-task-table").innerHTML = tasks.map(t=>`<tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(ownerName(t))}</td>
      <td>${escapeHtml(branchName(t.branch))}</td>
      <td>${escapeHtml(t.risk)}</td>
      <td class="${isOverdue(t)?'overdue':''}">${escapeHtml(t.due)}</td>
      <td>${escapeHtml(statusLabel(t.status))}</td>
    </tr>`).join("") || '<tr><td colspan="6">ยังไม่มีงาน</td></tr>';
  }
}

function filteredTasks(){
  const br = has("filter-branch") ? $("filter-branch").value : "all";
  const ow = has("filter-owner") ? $("filter-owner").value : "all";
  return tasks.filter(t => (br==="all" || t.branch===br) && (ow==="all" || ownerIdForTask(t)===ow));
}

function card(t){
  return `<div class="task-card">
    <h4>${escapeHtml(t.title)}</h4>
    <div class="meta">
      <span class="pill">${escapeHtml(branchName(t.branch))}</span>
      <span class="pill">${escapeHtml(ownerName(t))}</span>
      <span class="pill risk-${escapeHtml(t.risk)}">${escapeHtml(t.risk)}</span>
      <span class="pill">${escapeHtml(t.type || "Working Paper")}</span>
      ${isOverdue(t)?'<span class="pill overdue">Overdue</span>':''}
    </div>
    <p>${escapeHtml(t.desc||"")}</p>
    <div class="meta"><span class="count-badge">Evidence ${evidenceCount(t)}</span></div>
    <button class="btn secondary small" onclick="window.editTask('${escapeHtml(t.id)}')">แก้ไข</button>
  </div>`;
}

function renderKanban(){
  if (!has("kanban-board")) return;
  const list = filteredTasks();
  $("kanban-board").innerHTML = statuses.map(s=>`<div class="column"><h3>${s.label} (${list.filter(t=>t.status===s.key).length})</h3>${list.filter(t=>t.status===s.key).map(card).join("") || '<p class="meta">ไม่มีงาน</p>'}</div>`).join("");
}

function renderTable(){
  if (!has("task-table")) return;
  $("task-table").innerHTML = tasks.map(t=>`<tr>
    <td>${escapeHtml(t.title)}</td>
    <td>${escapeHtml(branchName(t.branch))}</td>
    <td>${escapeHtml(ownerName(t))}</td>
    <td>${escapeHtml(t.risk)}</td>
    <td class="${isOverdue(t)?'overdue':''}">${escapeHtml(t.due)}</td>
    <td>${escapeHtml(statusLabel(t.status))}</td>
    <td><span class="count-badge">${evidenceCount(t)}</span></td>
    <td><button class="btn secondary small" onclick="window.editTask('${escapeHtml(t.id)}')">แก้ไข</button></td>
  </tr>`).join("");
}

function renderEvidence(){
  if (!has("evidence-list")) return;
  const items = tasks.flatMap(t => (t.evidence || []).map(e => ({task:t.title, branch:t.branch, ...e})));
  $("evidence-list").innerHTML = items.length ? items.map(e=>`<div class="branch-item"><strong>${escapeHtml(e.task)}</strong><br><span>${escapeHtml(branchName(e.branch))}</span><br><a class="link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.name || e.url)}</a></div>`).join("") : '<p class="meta">ยังไม่มี Evidence Link</p>';
}

function openModal(t=null){
  $("task-modal").classList.remove("hidden");
  $("btn-delete").classList.toggle("hidden", !t);
  $("modal-title").textContent = t ? "แก้ไขงาน" : "สร้างงานใหม่";
  $("task-id").value = t?.id || "";
  $("task-title").value = t?.title || "";
  $("task-desc").value = t?.desc || "";
  $("task-branch").value = t?.branch || "SPR";
  refreshTeamOptions();
  const members = activeTeam();
  const member = findMemberByOwner(t?.owner || t?.ownerName, t?.ownerId);
  $("task-owner").value = member?.id || members[0]?.id || "";
  $("task-risk").value = t?.risk || "Medium";
  $("task-status").value = t?.status || "planning";
  $("task-due").value = t?.due || "";
  $("task-type").value = t?.type || "Working Paper";
  $("evidence-name").value = "";
  $("evidence-url").value = "";
}
function closeModal(){
  $("task-modal").classList.add("hidden");
  $("task-form").reset();
}

function buildEvidence(existing){
  const list = [...(existing?.evidence || [])];
  const name = $("evidence-name").value.trim();
  const url = $("evidence-url").value.trim();
  if (url) list.push({ name: name || url, url });
  return list;
}

async function saveTask(e){
  e.preventDefault();
  const members = activeTeam();
  const selectedMember = members.find(m => m.id === $("task-owner").value) || members[0] || null;
  if (!selectedMember) {
    alert("ยังไม่มีรายชื่อทีมงาน กรุณาเพิ่มสมาชิกทีมก่อนสร้างงาน");
    openTeamModal();
    return;
  }
  if (!$("task-title").value.trim()) {
    alert("กรุณาระบุชื่องาน");
    return;
  }
  const id = $("task-id").value || crypto.randomUUID();
  const existing = tasks.find(t => t.id === id);
  const task = {
    id,
    title: $("task-title").value.trim(),
    desc: $("task-desc").value.trim(),
    branch: $("task-branch").value,
    ownerId: selectedMember.id,
    owner: selectedMember.name,
    ownerName: selectedMember.name,
    risk: $("task-risk").value,
    status: $("task-status").value,
    due: $("task-due").value,
    type: $("task-type").value,
    evidence: buildEvidence(existing),
    updatedBy: currentUser?.email || "Demo Mode",
    updatedAtText: new Date().toISOString()
  };

  try {
    if (firebaseReady && currentUser && !demoMode) {
      await setDoc(doc(db,"tasks",id), {...task, updatedAt: serverTimestamp()}, { merge: true });
      showToast("บันทึกงานบน Firestore แล้ว");
    } else {
      tasks = existing ? tasks.map(t=>t.id===id?task:t) : [task, ...tasks];
      localSave();
      showToast("บันทึกงานใน Demo/localStorage แล้ว");
    }
    closeModal();
  } catch (error) {
    console.error("Save task error:", error);
    alert("บันทึกงานไม่สำเร็จ: " + (error.message || error));
  }
}

async function deleteTask(){
  const id = $("task-id").value;
  if (!id || !confirm("ยืนยันลบงานนี้?")) return;
  if (firebaseReady && currentUser && !demoMode) {
    await deleteDoc(doc(db,"tasks",id));
    showToast("ลบงานจาก Firestore แล้ว");
  } else {
    tasks = tasks.filter(t=>t.id!==id);
    localSave();
    showToast("ลบงานจาก Demo/localStorage แล้ว");
  }
  closeModal();
}

function openTeamModal(){
  renderTeamEditor();
  $("team-modal").classList.remove("hidden");
}
function closeTeamModal(){
  $("team-modal").classList.add("hidden");
}
function renderTeamEditor(){
  const source = teamMembers.length ? teamMembers : defaultTeamMembers;
  const list = source.length ? source : [{id:crypto.randomUUID(), avatar:"", name:"", role:"Auditor", active:true}];
  $("team-editor-list").innerHTML = `
    <div class="team-editor-header"><span>ชื่อย่อ</span><span>ชื่อ-นามสกุล</span><span>ตำแหน่ง</span><span>สถานะ</span><span></span></div>
    ${list.map(m => teamEditorRow(m)).join("")}
    <div class="team-editor-hint">หมายเหตุ: ชื่อย่อใช้แสดงเป็น Avatar วงกลม ส่วนตำแหน่งใช้แสดงใน Dashboard และช่องผู้รับผิดชอบ</div>
  `;
}
function teamEditorRow(m={}){
  const id = m.id || crypto.randomUUID();
  const role = m.role || "Auditor";
  const roleOptions = ["Manager", "Supervisor", "Senior Auditor", "Auditor", "Trainee"]
    .map(r => `<option value="${r}" ${r===role ? "selected" : ""}>${r}</option>`).join("");
  return `<div class="team-editor-row" data-member-id="${escapeHtml(id)}" style="grid-template-columns:70px 1.3fr 1fr 90px 44px;">
    <input class="team-avatar-input" value="${escapeHtml(m.avatar || "")}" placeholder="เช่น N" maxlength="2" />
    <input class="team-name-input" value="${escapeHtml(m.name || "")}" placeholder="ชื่อ-นามสกุล" />
    <select class="team-role-input">${roleOptions}</select>
    <label style="display:flex;align-items:center;gap:6px;color:#cbd5e1;font-size:13px"><input class="team-active-input" type="checkbox" ${m.active !== false ? "checked" : ""}/> ใช้งาน</label>
    <button type="button" class="icon-btn" onclick="this.closest('.team-editor-row').remove()">×</button>
  </div>`;
}
function addTeamMemberRow(){
  if (!has("team-editor-list")) return;
  const html = teamEditorRow({id:crypto.randomUUID(), avatar:"", name:"", role:"Auditor", active:true});
  const hint = $("team-editor-list").querySelector(".team-editor-hint");
  if (hint) hint.insertAdjacentHTML("beforebegin", html);
  else $("team-editor-list").insertAdjacentHTML("beforeend", html);
}
async function resetTeamMembers(){
  if (!confirm("ต้องการรีเซ็ตทีมงานกลับเป็นค่าเริ่มต้นใช่หรือไม่?")) return;
  const resetTeam = defaultTeamMembers.map(m => ({...m}));
  try {
    if (firebaseReady && currentUser && !demoMode) {
      const oldIds = teamMembers.map(m => m.id);
      const resetIds = resetTeam.map(m => m.id);
      await Promise.all([
        ...resetTeam.map(m => setDoc(doc(db,"teamMembers",m.id), {...m, updatedBy: currentUser.email, updatedAt: serverTimestamp()}, { merge: true })),
        ...oldIds.filter(id => !resetIds.includes(id)).map(id => deleteDoc(doc(db,"teamMembers",id)))
      ]);
    } else {
      teamMembers = resetTeam;
      localSaveTeam();
    }
    teamMembers = resetTeam;
    refreshTeamOptions();
    renderTeamEditor();
    render();
    showToast("รีเซ็ตทีมงานแล้ว");
  } catch (error) {
    console.error("Reset team error:", error);
    alert("รีเซ็ตทีมงานไม่สำเร็จ: " + (error.message || error));
  }
}

async function saveTeamMembers(e){
  e.preventDefault();
  const rows = [...document.querySelectorAll(".team-editor-row")];
  const newTeam = rows.map(row => {
    const name = row.querySelector(".team-name-input")?.value.trim() || "";
    return {
      id: row.dataset.memberId || crypto.randomUUID(),
      avatar: row.querySelector(".team-avatar-input")?.value.trim() || name?.[0] || "?",
      name,
      role: row.querySelector(".team-role-input")?.value.trim() || "Auditor",
      active: row.querySelector(".team-active-input")?.checked !== false,
      aliases: []
    };
  }).filter(m => m.name);

  if (!newTeam.length) {
    alert("กรุณาระบุชื่อทีมงานอย่างน้อย 1 คน หรือกดปุ่ม รีเซ็ตทีมเริ่มต้น");
    addTeamMemberRow();
    return;
  }

  try {
    if (firebaseReady && currentUser && !demoMode) {
      const oldIds = teamMembers.map(m => m.id);
      const newIds = newTeam.map(m => m.id);
      await Promise.all([
        ...newTeam.map(m => setDoc(doc(db,"teamMembers",m.id), {...m, updatedBy: currentUser.email, updatedAt: serverTimestamp()}, { merge: true })),
        ...oldIds.filter(id => !newIds.includes(id)).map(id => deleteDoc(doc(db,"teamMembers",id)))
      ]);
      teamMembers = newTeam;
      showToast("บันทึกทีมงานบน Firestore แล้ว");
    } else {
      teamMembers = newTeam;
      localSaveTeam();
      showToast("บันทึกทีมงานใน Demo/localStorage แล้ว");
    }
    refreshTeamOptions();
    render();
    closeTeamModal();
  } catch (error) {
    console.error("Save team error:", error);
    alert("บันทึกทีมงานไม่สำเร็จ: " + (error.message || error));
  }
}

async function seedTeamToFirestore(){
  if (teamSeedStarted || !firebaseReady || !currentUser || demoMode) return;
  teamSeedStarted = true;
  try {
    await Promise.all(defaultTeamMembers.map(m => setDoc(doc(db,"teamMembers",m.id), {...m, createdBy: currentUser.email, createdAt: serverTimestamp()}, { merge: true })));
  } catch (error) {
    console.error("Seed team error:", error);
  }
}

async function loginWithGoogle(){
  if (!firebaseReady) {
    alert("ยังไม่ได้ใส่ Firebase Config ในไฟล์ app.js กรุณาวาง Config จริงก่อน หรือกด Demo Mode เพื่อทดสอบ");
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    alert("Login ไม่สำเร็จ: " + (error.message || error));
  }
}
function demoLogin(){
  demoMode = true;
  currentUser = { displayName: "Demo Mode", email: "demo@auditflow.local" };
  showApp(currentUser);
  localLoad();
}
async function logout(){
  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeTeam) unsubscribeTeam();
  unsubscribeTasks = null;
  unsubscribeTeam = null;
  if (firebaseReady && currentUser && !demoMode) await signOut(auth);
  demoMode = false;
  currentUser = null;
  $("login-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
}
function showApp(user){
  $("login-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("current-user-name").textContent = user.displayName || "Google User";
  $("current-user-email").textContent = user.email || "-";
}
function subscribeFirestore(user){
  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeTeam) unsubscribeTeam();

  unsubscribeTeam = onSnapshot(collection(db,"teamMembers"), snap => {
    teamMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!teamMembers.length) {
      teamMembers = defaultTeamMembers.map(m => ({...m}));
      seedTeamToFirestore();
    }
    refreshTeamOptions();
    render();
  }, error => {
    console.error(error);
    alert("อ่านข้อมูลทีมงาน Firestore ไม่สำเร็จ: " + error.message);
  });

  unsubscribeTasks = onSnapshot(collection(db,"tasks"), snap => {
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, error => {
    console.error(error);
    alert("อ่านข้อมูลงาน Firestore ไม่สำเร็จ: " + error.message);
  });
}

function bind(){
  document.querySelectorAll(".nav").forEach(b=>{
    b.onclick = () => {
      document.querySelectorAll(".nav,.view").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const view = $("view-" + b.dataset.view);
      if (view) view.classList.add("active");
      $("page-title").textContent = b.textContent.trim();
    };
  });
  if (has("btn-open-modal")) $("btn-open-modal").onclick = () => openModal();
  if (has("btn-close-modal")) $("btn-close-modal").onclick = closeModal;
  if (has("task-form")) $("task-form").onsubmit = saveTask;
  if (has("btn-delete")) $("btn-delete").onclick = deleteTask;
  if (has("filter-branch")) $("filter-branch").onchange = render;
  if (has("filter-owner")) $("filter-owner").onchange = render;
  if (has("btn-google-login")) $("btn-google-login").onclick = loginWithGoogle;
  if (has("btn-demo-login")) $("btn-demo-login").onclick = demoLogin;
  if (has("btn-logout")) $("btn-logout").onclick = logout;
  if (has("btn-open-team-modal")) $("btn-open-team-modal").onclick = openTeamModal;
  if (has("btn-close-team-modal")) $("btn-close-team-modal").onclick = closeTeamModal;
  if (has("btn-add-member")) $("btn-add-member").onclick = addTeamMemberRow;
  if (has("btn-reset-team")) $("btn-reset-team").onclick = resetTeamMembers;
  if (has("team-form")) $("team-form").onsubmit = saveTeamMembers;
  window.editTask = id => openModal(tasks.find(t=>t.id===id));
}

function start(){
  teamMembers = defaultTeamMembers;
  fillOptions();
  bind();
  if (firebaseReady) {
    onAuthStateChanged(auth, user => {
      if (user) {
        demoMode = false;
        currentUser = user;
        showApp(user);
        subscribeFirestore(user);
      } else if (!demoMode) {
        currentUser = null;
        $("login-screen").classList.remove("hidden");
        $("app").classList.add("hidden");
      }
    });
  }
}
start();
