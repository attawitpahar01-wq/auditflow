// AuditFlow Cloud v2.0
// สิ่งที่แก้จาก v1:
// 1) ใช้ Google Login แทน Email/Password
// 2) ตัด Firebase Storage ออก เพราะใช้ Google Drive Evidence Link แทน
// 3) ใช้ Firestore สำหรับเก็บงานแบบ Online
//
// วิธีใช้งานจริง:
// - นำ firebaseConfig จาก Firebase Console มาแทนค่าด้านล่าง
// - Firebase Console > Authentication > Sign-in method > Google > Enable
// - Firebase Console > Firestore Database > Create database
// - Deploy ขึ้น Firebase Hosting

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
let currentUser = null;
let tasks = [];
let demoMode = false;

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

const defaultOwners = ["Manager", "Supervisor", "Auditor 1", "Auditor 2", "Auditor 3", "Auditor 4", "Auditor 5"];
const statuses = [
  { key:"planning", label:"Planning" },
  { key:"fieldwork", label:"Fieldwork" },
  { key:"review", label:"Review" },
  { key:"done", label:"Done" }
];

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function seedTasks(){
  return [
    {id:"demo1",title:"FA-03 วิเคราะห์ความเคลื่อนไหวสินทรัพย์",desc:"ตรวจ Rollforward และ Exception",branch:"SPT",owner:"Supervisor",risk:"High",status:"fieldwork",due:"2026-06-15",type:"Working Paper",evidence:[{name:"ตัวอย่าง Google Drive Folder",url:"https://drive.google.com/"}]},
    {id:"demo2",title:"ITGC-03 User Access Review",desc:"สอบทานสิทธิ์ผู้ใช้งานระบบสำคัญ",branch:"SPR",owner:"Auditor 1",risk:"Critical",status:"planning",due:"2026-06-20",type:"Working Paper",evidence:[]},
    {id:"demo3",title:"Follow-up Action Plan ประเด็น Antivirus",desc:"ติดตามแผนต่ออายุ License และ Update Agent",branch:"SRR",owner:"Auditor 2",risk:"High",status:"review",due:"2026-06-10",type:"Follow-up",evidence:[]}
  ];
}

function localLoad(){
  tasks = JSON.parse(localStorage.getItem("auditflow_cloud_v2_tasks") || "null") || seedTasks();
  render();
}
function localSave(){
  localStorage.setItem("auditflow_cloud_v2_tasks", JSON.stringify(tasks));
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
  $("filter-branch").innerHTML = branchHtml;
  $("task-branch").innerHTML = branches.map(b=>`<option value="${b.code}">${b.name}</option>`).join("");
  $("filter-owner").innerHTML = `<option value="all">ทุกคน</option>` + defaultOwners.map(o=>`<option>${o}</option>`).join("");
}
function branchName(code){return branches.find(b=>b.code===code)?.name || code;}
function isOverdue(t){return t.status!=="done" && t.due && new Date(t.due) < new Date(new Date().toDateString());}
function evidenceCount(t){return Array.isArray(t.evidence) ? t.evidence.length : 0;}

function render(){
  renderStats();
  renderKanban();
  renderTable();
  renderEvidence();
}
function renderStats(){
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
function filteredTasks(){
  const br = $("filter-branch").value;
  const ow = $("filter-owner").value;
  return tasks.filter(t => (br==="all" || t.branch===br) && (ow==="all" || t.owner===ow));
}
function card(t){
  return `<div class="task-card">
    <h4>${escapeHtml(t.title)}</h4>
    <div class="meta">
      <span class="pill">${escapeHtml(branchName(t.branch))}</span>
      <span class="pill">${escapeHtml(t.owner)}</span>
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
  const list = filteredTasks();
  $("kanban-board").innerHTML = statuses.map(s=>`<div class="column"><h3>${s.label} (${list.filter(t=>t.status===s.key).length})</h3>${list.filter(t=>t.status===s.key).map(card).join("") || '<p class="meta">ไม่มีงาน</p>'}</div>`).join("");
}
function renderTable(){
  $("task-table").innerHTML = tasks.map(t=>`<tr>
    <td>${escapeHtml(t.title)}</td>
    <td>${escapeHtml(branchName(t.branch))}</td>
    <td>${escapeHtml(t.owner)}</td>
    <td>${escapeHtml(t.risk)}</td>
    <td class="${isOverdue(t)?'overdue':''}">${escapeHtml(t.due)}</td>
    <td>${escapeHtml(statuses.find(s=>s.key===t.status)?.label || t.status)}</td>
    <td><span class="count-badge">${evidenceCount(t)}</span></td>
    <td><button class="btn secondary small" onclick="window.editTask('${escapeHtml(t.id)}')">แก้ไข</button></td>
  </tr>`).join("");
}
function renderEvidence(){
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
  $("task-owner").value = t?.owner || currentUser?.displayName || defaultOwners[0];
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
  if (url) {
    list.push({ name: name || url, url });
  }
  return list;
}

async function saveTask(e){
  e.preventDefault();
  const id = $("task-id").value || crypto.randomUUID();
  const existing = tasks.find(t => t.id === id);
  const task = {
    id,
    title: $("task-title").value.trim(),
    desc: $("task-desc").value.trim(),
    branch: $("task-branch").value,
    owner: $("task-owner").value.trim(),
    risk: $("task-risk").value,
    status: $("task-status").value,
    due: $("task-due").value,
    type: $("task-type").value,
    evidence: buildEvidence(existing),
    updatedBy: currentUser?.email || "Demo Mode",
    updatedAtText: new Date().toISOString()
  };

  if (firebaseReady && currentUser && !demoMode) {
    await setDoc(doc(db,"tasks",id), {...task, updatedAt: serverTimestamp()}, { merge: true });
    showToast("บันทึกงานบน Firestore แล้ว");
  } else {
    tasks = existing ? tasks.map(t=>t.id===id?task:t) : [task, ...tasks];
    localSave();
    showToast("บันทึกงานใน Demo/localStorage แล้ว");
  }
  closeModal();
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
  unsubscribeTasks = null;
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
  unsubscribeTasks = onSnapshot(collection(db,"tasks"), snap => {
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!tasks.length) {
      // ไม่ seed ลง Firestore อัตโนมัติ เพื่อไม่ให้สร้างข้อมูลโดยไม่ตั้งใจ
      render();
    } else {
      render();
    }
  }, error => {
    console.error(error);
    alert("อ่านข้อมูล Firestore ไม่สำเร็จ: " + error.message);
  });
}

function bind(){
  document.querySelectorAll(".nav").forEach(b=>{
    b.onclick = () => {
      document.querySelectorAll(".nav,.view").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      $("view-" + b.dataset.view).classList.add("active");
      $("page-title").textContent = b.textContent;
    };
  });
  $("btn-open-modal").onclick = () => openModal();
  $("btn-close-modal").onclick = closeModal;
  $("task-form").onsubmit = saveTask;
  $("btn-delete").onclick = deleteTask;
  $("filter-branch").onchange = render;
  $("filter-owner").onchange = render;
  $("btn-google-login").onclick = loginWithGoogle;
  $("btn-demo-login").onclick = demoLogin;
  $("btn-logout").onclick = logout;
  window.editTask = id => openModal(tasks.find(t=>t.id===id));
}

function start(){
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
