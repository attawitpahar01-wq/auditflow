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
      getDocs,  
      updateDoc,
      deleteDoc,
      doc,
      onSnapshot,
      serverTimestamp,
      query,
      orderBy,
      where
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
    let actionPlans = [];
    let evidenceRecords = [];
    let systemUsers = [];
    let branchMasters = [];
    let auditMasters = [];
    let currentSystemUser = null;
    let currentUserRole = null;
    let roleLoaded = false;
    let teamMembersById = {};
    let teamMembersByName = {};
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

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        userInfo.innerText = `${user.displayName} (${user.email})`;
        loginBtn.classList.add("hidden");
        logoutBtn.classList.remove("hidden");
        appDiv.classList.remove("hidden");
        await ensureCurrentSystemUser();
        listenFindings();
        listenActionPlans();
        listenEvidence();
        listenSystemUsers();
        listenBranchMaster();
        listenAuditMaster();
        applyPermissionUI();
        showPage("pageDashboard");
      } else {
        currentUser = null;
        currentSystemUser = null;
        currentUserRole = null;
        roleLoaded = false;
        userInfo.innerText = "ยังไม่ได้เข้าสู่ระบบ";
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
        appDiv.classList.add("hidden");
      }
    });

    function listenFindings() {
      const q = query(
  collection(db, "audit_findings"),
  orderBy("createdAt", "desc")
);

      onSnapshot(q, (snapshot) => {
        findings = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
          
        filteredFindings = findings;
          
        renderDashboard();
        renderTable();
        if (document.getElementById("reportTable")) loadAuditReport();
      });
    }

    function getOwnerDisplayName(f) {
      if (!f) return "Unassigned";

      const ownerName = getDisplayableOwnerText(f.ownerName);
      if (ownerName) return ownerName;

      if (f.ownerId && teamMembersById[f.ownerId]) {
        return teamMembersById[f.ownerId].name || "Unassigned";
      }

      if (f.owner && teamMembersById[f.owner]) {
        return teamMembersById[f.owner].name || "Unassigned";
      }

      const owner = getDisplayableOwnerText(f.owner);
      if (owner) return owner;

      return "Unassigned";
    }

    function getDisplayableOwnerText(value) {
      if (!value) return "";

      const text = normalizeOwnerName(value);
      if (!text || isFirestoreDocumentId(text)) return "";

      return teamMembersByName[getOwnerNameKey(text)]?.name || text;
    }

    function normalizeOwnerName(value) {
      return String(value)
        .normalize("NFKC")
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getOwnerNameKey(value) {
      return normalizeOwnerName(value).toLowerCase();
    }

    function isFirestoreDocumentId(value) {
      return typeof value === "string" &&
        /^[A-Za-z0-9]{16,}$/.test(value);
    }

    window.saveFinding = async function () {
      const docId = getValue("docId");
      const currentFinding = docId ? findings.find(f => f.id === docId) : null;

      if (!canEditFinding(currentFinding)) {
        alert("You do not have permission to save this finding");
        return;
      }

      const ownerSelect = document.getElementById("owner");
      const selectedOwner =
        ownerSelect && ownerSelect.selectedIndex >= 0
          ? ownerSelect.options[ownerSelect.selectedIndex]
          : null;
      const selectedOwnerId = getValue("owner");
      const selectedOwnerName =
        (selectedOwner && selectedOwner.dataset.name) ||
        selectedOwnerId ||
        "";
      const selectedOwnerRole =
        (selectedOwner && selectedOwner.dataset.role) || "";

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
        ownerId: selectedOwnerId,
        ownerName: selectedOwnerName,
        ownerRole: selectedOwnerRole,
        owner: selectedOwnerName,
        dueDate: getValue("dueDate"),
        status: getValue("status"),
        evidenceLink: getValue("evidenceLink"),
        ownerResponse: getValue("ownerResponse"),
        revisedDueDate: getValue("revisedDueDate"),
        progressPercent: Number(getValue("progressPercent")),
        mapStatus: getValue("mapStatus"),
        updatedAt: serverTimestamp()
      };

      if (docId) {
        if (data.status === "Closed") {
          data.closedAt = serverTimestamp();
        }
        await updateDoc(doc(db, "audit_findings", docId), data);
      } else {
        data.createdBy = currentUser.email;
        data.createdAt = serverTimestamp();
        data.workflowStatus = "Draft";
        data.supervisorReviewStatus = "Pending";
        data.managerApprovalStatus = "Pending";
        data.approvalHistory = [];
        await addDoc(collection(db, "audit_findings"), data);
      }

      resetForm();
      alert("บันทึกข้อมูลเรียบร้อย");
    };

    window.editFinding = function (id) {
      const f = findings.find(x => x.id === id);
      if (!f) return;

      if (!canEditFinding(f)) {
        alert("You do not have permission to edit this finding");
        return;
      }

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
      setValue("owner", getOwnerFormValue(f));
      setValue("dueDate", f.dueDate);
      setValue("status", f.status);
      setValue("evidenceLink", f.evidenceLink);
      setValue("ownerResponse", f.ownerResponse);
      setValue("revisedDueDate", f.revisedDueDate);
      setValue("progressPercent", f.progressPercent);
      setValue("mapStatus", f.mapStatus);
      showPage("pageForm");
      window.scrollTo(0, 0);
    };

    window.deleteFinding = async function (id) {
      if (!canDeleteFinding()) {
        alert("You do not have permission to delete findings");
        return;
      }
      if (!confirm("ยืนยันลบ Finding นี้?")) return;
      await deleteDoc(doc(db, "audit_findings", id));
    };

    window.renderTable = function () {
      const tbody = document.getElementById("findingTable");
      if (!tbody) return;

      const branch = normalizeFilterValue(getValue("registerFilterBranch"));
      const risk = normalizeFilterValue(getValue("registerFilterRisk"));
      const status = normalizeFilterValue(getValue("registerFilterStatus"));

      let filtered = findings.filter(f => {
        return (!branch || f.branch === branch)
          && (!risk || f.riskLevel === risk)
          && (!status || f.status === status);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="15" class="table-empty">No findings found</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(f => {
        const aging = calculateAging(f.dueDate, f.status);
        const riskClass = f.riskLevel === "High" ? "risk-high" :
                          f.riskLevel === "Medium" ? "risk-medium" : "risk-low";
        const workflowStatus = getWorkflowStatus(f);

        return `
          <tr>
            <td>${f.findingId || ""}</td>
            <td>${f.branch || ""}</td>
            <td>${f.auditArea || ""}</td>
            <td class="${riskClass}">${f.riskLevel || ""}</td>
            <td>${f.status || ""}</td>
            <td>${getOwnerDisplayName(f)}</td>
            <td>${f.dueDate || ""}</td>
            <td>${aging}</td>
            <td>${f.mapStatus || "-"}</td>
            <td>${f.progressPercent || 0}%</td>
            <td><span class="workflow-badge ${getWorkflowStatusClass(workflowStatus)}">${workflowStatus}</span></td>
            <td>${f.supervisorReviewStatus || "Pending"}</td>
            <td>${f.managerApprovalStatus || "Pending"}</td>
            <td>${renderApprovalActions(f)}</td>
            <td>
              ${canEditFinding(f) ? `<button onclick="editFinding('${f.id}')">แก้ไข</button>` : ""}
              ${canEditFinding(f) ? `<button onclick="createActionPlanFromFinding('${f.id}')">Create Action Plan</button>` : ""}
              ${canEditFinding(f) ? `<button onclick="createEvidenceRequestFromFinding('${f.id}')">Create Evidence Request</button>` : ""}
              ${canDeleteFinding() ? `<button class="danger" onclick="deleteFinding('${f.id}')">ลบ</button>` : ""}
            </td>
          </tr>
        `;
      }).join("");
    };

    function normalizeFilterValue(value) {
      return value === "All" ? "" : value;
    }

    function getWorkflowStatus(finding) {
      if (finding?.workflowStatus) return finding.workflowStatus;
      if (finding?.status === "Follow-up" || finding?.status === "Closed") return "Issued";
      return "Draft";
    }

    function getWorkflowStatusClass(status) {
      return String(status || "Draft")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }

    function getApprovalHistory(finding) {
      return Array.isArray(finding?.approvalHistory) ? finding.approvalHistory : [];
    }

    function createApprovalHistoryEntry(action, comment = "") {
      return {
        action,
        by: currentUser?.email || "",
        date: new Date(),
        comment
      };
    }

    function renderApprovalActions(finding) {
      const status = getWorkflowStatus(finding);
      const buttons = [];

      if (canSubmitFinding(finding) && (status === "Draft" || status === "Rejected")) {
        buttons.push(`<button type="button" onclick="submitFindingForReview('${finding.id}')">Submit for Review</button>`);
      }

      if (canSupervisorReview() && status === "Pending Supervisor Review") {
        buttons.push(`<button type="button" onclick="approveSupervisorReview('${finding.id}')">Approve Review</button>`);
        buttons.push(`<button type="button" class="danger" onclick="rejectSupervisorReview('${finding.id}')">Reject</button>`);
      }

      if (canManagerApprove() && status === "Pending Manager Approval") {
        buttons.push(`<button type="button" onclick="approveManagerIssue('${finding.id}')">Approve Issue</button>`);
        buttons.push(`<button type="button" class="danger" onclick="rejectManagerApproval('${finding.id}')">Reject</button>`);
      }

      buttons.push(`<button type="button" class="secondary" onclick="showApprovalHistory('${finding.id}')">History</button>`);
      return buttons.join(" ");
    }

    async function updateFindingWorkflow(findingId, updates, action, comment = "") {
      const finding = findings.find(f => f.id === findingId);
      if (!finding) {
        alert("Finding not found");
        return;
      }

      await updateDoc(doc(db, "audit_findings", findingId), {
        ...updates,
        approvalHistory: [
          ...getApprovalHistory(finding),
          createApprovalHistoryEntry(action, comment)
        ],
        updatedAt: serverTimestamp()
      });
    }

    window.submitFindingForReview = async function (findingId) {
      const finding = findings.find(f => f.id === findingId);
      if (!finding) return alert("Finding not found");
      if (!canSubmitFinding(finding)) return alert("You do not have permission to submit this finding");

      const status = getWorkflowStatus(finding);
      if (status !== "Draft" && status !== "Rejected") return alert("This finding cannot be submitted now");

      await updateFindingWorkflow(findingId, {
        workflowStatus: "Pending Supervisor Review",
        supervisorReviewStatus: "Pending",
        supervisorReviewBy: "",
        supervisorReviewDate: "",
        supervisorReviewComment: "",
        managerApprovalStatus: "Pending",
        managerApprovalBy: "",
        managerApprovalDate: "",
        managerApprovalComment: "",
        rejectedReason: ""
      }, "Submitted for Supervisor Review");
    };

    window.approveSupervisorReview = async function (findingId) {
      if (!canSupervisorReview()) return alert("Only Supervisor can approve supervisor review");

      await updateFindingWorkflow(findingId, {
        workflowStatus: "Pending Manager Approval",
        supervisorReviewStatus: "Approved",
        supervisorReviewBy: currentUser?.email || "",
        supervisorReviewDate: serverTimestamp(),
        supervisorReviewComment: ""
      }, "Supervisor Review Approved");
    };

    window.rejectSupervisorReview = async function (findingId) {
      if (!canSupervisorReview()) return alert("Only Supervisor can reject supervisor review");

      const comment = prompt("Reject reason") || "";
      if (!comment.trim()) return;

      await updateFindingWorkflow(findingId, {
        workflowStatus: "Rejected",
        supervisorReviewStatus: "Rejected",
        supervisorReviewBy: currentUser?.email || "",
        supervisorReviewDate: serverTimestamp(),
        supervisorReviewComment: comment,
        rejectedReason: comment
      }, "Supervisor Review Rejected", comment);
    };

    window.approveManagerIssue = async function (findingId) {
      if (!canManagerApprove()) return alert("Only Audit Manager can approve issue");

      await updateFindingWorkflow(findingId, {
        workflowStatus: "Issued",
        managerApprovalStatus: "Approved",
        managerApprovalBy: currentUser?.email || "",
        managerApprovalDate: serverTimestamp(),
        managerApprovalComment: "",
        issuedDate: serverTimestamp(),
        status: "Follow-up"
      }, "Manager Issue Approved");
    };

    window.rejectManagerApproval = async function (findingId) {
      if (!canManagerApprove()) return alert("Only Audit Manager can reject manager approval");

      const comment = prompt("Reject reason") || "";
      if (!comment.trim()) return;

      await updateFindingWorkflow(findingId, {
        workflowStatus: "Rejected",
        managerApprovalStatus: "Rejected",
        managerApprovalBy: currentUser?.email || "",
        managerApprovalDate: serverTimestamp(),
        managerApprovalComment: comment,
        rejectedReason: comment
      }, "Manager Approval Rejected", comment);
    };

    window.showApprovalHistory = function (findingId) {
      const finding = findings.find(f => f.id === findingId);
      if (!finding) return alert("Finding not found");

      const history = getApprovalHistory(finding);
      if (history.length === 0) {
        alert("No approval history");
        return;
      }

      alert(history.map(item => {
        const date = formatApprovalHistoryDate(item.date);
        const comment = item.comment ? `\nComment: ${item.comment}` : "";
        return `${date}\n${item.action || "-"}\nBy: ${item.by || "-"}${comment}`;
      }).join("\n\n"));
    };

    function formatApprovalHistoryDate(value) {
      if (!value) return "-";
      if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function getOwnerFormValue(f) {
      if (!f) return "";
      if (f.ownerId) return f.ownerId;
      if (f.owner && teamMembersById[f.owner]) return f.owner;

      const ownerName = getDisplayableOwnerText(f.ownerName || f.owner);
      if (!ownerName) return "";

      return teamMembersByName[getOwnerNameKey(ownerName)]?.id || ownerName;
    }

    window.createActionPlanFromFinding = async function (findingDocId) {
      const finding = findings.find(f => f.id === findingDocId);
      if (!finding) {
        alert("Finding not found");
        return;
      }
      if (!canEditOperationalData()) {
        alert("You do not have permission to create action plans");
        return;
      }

      const existing = await getDocs(query(
        collection(db, "action_plans"),
        where("findingDocId", "==", findingDocId)
      ));

      if (!existing.empty) {
        alert("Action Plan already exists for this finding");
        return;
      }

      const ownerName =
        getDisplayableOwnerText(finding.ownerName || finding.owner) ||
        getOwnerDisplayName(finding);
      const ownerId =
        finding.ownerId ||
        (finding.owner && teamMembersById[finding.owner] ? finding.owner : "") ||
        teamMembersByName[getOwnerNameKey(ownerName)]?.id ||
        "";
      const ownerRole =
        finding.ownerRole ||
        (ownerId && teamMembersById[ownerId]?.role) ||
        "";

      const data = {
        findingDocId,
        findingId: finding.findingId || "",
        branch: finding.branch || "",
        auditArea: finding.auditArea || "",
        riskLevel: finding.riskLevel || "",
        findingCondition: finding.condition || "",
        recommendation: finding.recommendation || "",
        actionOwnerId: ownerId,
        actionOwnerName: ownerName,
        actionOwnerRole: ownerRole,
        managementResponse: "",
        correctiveAction: finding.recommendation || "",
        originalDueDate: finding.dueDate || "",
        revisedDueDate: "",
        actionStatus: "Not Started",
        evidenceLink: finding.evidenceLink || "",
        iaVerificationStatus: "Pending Review",
        iaVerificationComment: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.email || ""
      };

      await addDoc(collection(db, "action_plans"), data);
      alert("Action Plan created successfully");
      showPage("pageActionPlan");
    };

    function listenActionPlans() {
      const q = query(
        collection(db, "action_plans"),
        orderBy("createdAt", "desc")
      );

      onSnapshot(q, (snapshot) => {
        actionPlans = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        renderActionPlanDashboard();
        if (document.getElementById("reportTable")) loadAuditReport();
      });
    }

    function renderActionPlanDashboard() {
      ensureActionPlanPageMarkup();
      renderActionPlanKPIs();
      renderActionPlanTable();
    }

    function ensureActionPlanPageMarkup() {
      const page = document.getElementById("pageActionPlan");
      if (!page || document.getElementById("actionPlanTable")) return;

      page.innerHTML = `
        <div class="card">
          <h3>Management Action Plan</h3>

          <div class="action-plan-kpis">
            <div class="action-plan-kpi">
              <span>Total Action Plans</span>
              <strong id="actionPlanTotal">0</strong>
            </div>
            <div class="action-plan-kpi">
              <span>Not Started</span>
              <strong id="actionPlanNotStarted">0</strong>
            </div>
            <div class="action-plan-kpi">
              <span>In Progress</span>
              <strong id="actionPlanInProgress">0</strong>
            </div>
            <div class="action-plan-kpi">
              <span>Overdue</span>
              <strong id="actionPlanOverdue">0</strong>
            </div>
            <div class="action-plan-kpi">
              <span>Completed</span>
              <strong id="actionPlanCompleted">0</strong>
            </div>
          </div>

          <div class="action-plan-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Finding ID</th>
                  <th>Branch</th>
                  <th>Audit Area</th>
                  <th>Risk</th>
                  <th>Action Owner</th>
                  <th>Corrective Action</th>
                  <th>Original Due Date</th>
                  <th>Revised Due Date</th>
                  <th>Action Status</th>
                  <th>IA Verification</th>
                  <th>Evidence</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="actionPlanTable"></tbody>
            </table>
          </div>
        </div>

        <div id="actionPlanEditModal" class="modal-overlay hidden">
          <div class="modal-box action-plan-modal">
            <div class="modal-header">
              <h2>Edit Action Plan</h2>
              <button type="button" class="modal-close" onclick="closeActionPlanEditor()">&times;</button>
            </div>

            <input type="hidden" id="actionPlanEditId">

            <div class="action-plan-form">
              <div>
                <label>Management Response</label>
                <textarea id="editManagementResponse"></textarea>
              </div>
              <div>
                <label>Corrective Action</label>
                <textarea id="editCorrectiveAction"></textarea>
              </div>
              <div>
                <label>Revised Due Date</label>
                <input id="editRevisedDueDate" type="date">
              </div>
              <div>
                <label>Action Status</label>
                <select id="editActionStatus">
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
              <div>
                <label>Evidence Link</label>
                <input id="editActionEvidenceLink" placeholder="Google Drive Link">
              </div>
              <div>
                <label>IA Verification</label>
                <select id="editIaVerificationStatus">
                  <option value="Pending Review">Pending Review</option>
                  <option value="Verified">Verified</option>
                  <option value="Not Verified">Not Verified</option>
                </select>
              </div>
              <div class="action-plan-form-full">
                <label>IA Verification Comment</label>
                <textarea id="editIaVerificationComment"></textarea>
              </div>
            </div>

            <div class="action-plan-modal-actions">
              <button type="button" onclick="saveActionPlanEdit()">Save</button>
              <button type="button" class="secondary" onclick="closeActionPlanEditor()">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderActionPlanKPIs() {
      const total = actionPlans.length;
      const notStarted = actionPlans.filter(p => getCalculatedActionStatus(p) === "Not Started").length;
      const inProgress = actionPlans.filter(p => getCalculatedActionStatus(p) === "In Progress").length;
      const overdue = actionPlans.filter(p => getCalculatedActionStatus(p) === "Overdue").length;
      const completed = actionPlans.filter(p => getCalculatedActionStatus(p) === "Completed").length;

      setText("actionPlanTotal", total);
      setText("actionPlanNotStarted", notStarted);
      setText("actionPlanInProgress", inProgress);
      setText("actionPlanOverdue", overdue);
      setText("actionPlanCompleted", completed);
    }

    function renderActionPlanTable() {
      const tbody = document.getElementById("actionPlanTable");
      if (!tbody) return;

      if (actionPlans.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="12" class="table-empty">No action plans found</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = actionPlans.map(plan => {
        const status = getCalculatedActionStatus(plan);
        const evidence = plan.evidenceLink
          ? `<a href="${plan.evidenceLink}" target="_blank" rel="noopener">Open</a>`
          : "-";

        return `
          <tr>
            <td>${plan.findingId || "-"}</td>
            <td>${plan.branch || "-"}</td>
            <td>${plan.auditArea || "-"}</td>
            <td>${plan.riskLevel || "-"}</td>
            <td>${plan.actionOwnerName || "-"}</td>
            <td>${plan.correctiveAction || "-"}</td>
            <td>${plan.originalDueDate || "-"}</td>
            <td>${plan.revisedDueDate || "-"}</td>
            <td><span class="action-status ${getActionStatusClass(status)}">${status}</span></td>
            <td>${plan.iaVerificationStatus || "-"}</td>
            <td>${evidence}</td>
            <td>
              ${canEditOperationalData() ? `<button onclick="editActionPlan('${plan.id}')">Edit</button>` : ""}
              ${canDelete() ? `<button class="danger" onclick="deleteActionPlan('${plan.id}')">Delete</button>` : ""}
            </td>
          </tr>
        `;
      }).join("");
    }

    window.editActionPlan = function (id) {
      if (!canEditOperationalData()) {
        alert("You do not have permission to edit action plans");
        return;
      }

      const plan = actionPlans.find(p => p.id === id);
      if (!plan) return;

      setValue("actionPlanEditId", plan.id);
      setValue("editManagementResponse", plan.managementResponse);
      setValue("editCorrectiveAction", plan.correctiveAction);
      setValue("editRevisedDueDate", plan.revisedDueDate);
      setValue("editActionStatus", plan.actionStatus || "Not Started");
      setValue("editActionEvidenceLink", plan.evidenceLink);
      setValue("editIaVerificationStatus", plan.iaVerificationStatus || "Pending Review");
      setValue("editIaVerificationComment", plan.iaVerificationComment);

      const modal = document.getElementById("actionPlanEditModal");
      if (modal) modal.classList.remove("hidden");
    };

    window.closeActionPlanEditor = function () {
      const modal = document.getElementById("actionPlanEditModal");
      if (modal) modal.classList.add("hidden");
    };

    window.saveActionPlanEdit = async function () {
      if (!canEditOperationalData()) {
        alert("You do not have permission to edit action plans");
        return;
      }

      const id = getValue("actionPlanEditId");
      if (!id) return;

      await updateDoc(doc(db, "action_plans", id), {
        managementResponse: getValue("editManagementResponse"),
        correctiveAction: getValue("editCorrectiveAction"),
        revisedDueDate: getValue("editRevisedDueDate"),
        actionStatus: getValue("editActionStatus"),
        evidenceLink: getValue("editActionEvidenceLink"),
        iaVerificationStatus: getValue("editIaVerificationStatus"),
        iaVerificationComment: getValue("editIaVerificationComment"),
        updatedAt: serverTimestamp()
      });

      closeActionPlanEditor();
      alert("Action Plan updated successfully");
    };

    window.deleteActionPlan = async function (id) {
      if (!canDelete()) {
        alert("Only Supervisor can delete action plans");
        return;
      }

      if (!confirm("Delete this Action Plan?")) return;

      await deleteDoc(doc(db, "action_plans", id));
      alert("Action Plan deleted successfully");
    };

    function getCalculatedActionStatus(plan) {
      if ((plan.actionStatus || "") === "Completed") return "Completed";
      if (isActionPlanOverdue(plan)) return "Overdue";
      return plan.actionStatus || "Not Started";
    }

    function isActionPlanOverdue(plan) {
      const dueDate = plan.revisedDueDate || plan.originalDueDate;
      if (!dueDate || (plan.actionStatus || "") === "Completed") return false;

      return new Date(dueDate) < new Date(new Date().toDateString());
    }

    function getActionStatusClass(status) {
      if (status === "Completed") return "completed";
      if (status === "In Progress") return "in-progress";
      if (status === "Overdue") return "overdue";
      return "not-started";
    }

    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.innerText = value;
    }

    window.createEvidenceRequestFromFinding = async function (findingDocId) {
      const finding = findings.find(f => f.id === findingDocId);
      if (!finding) {
        alert("Finding not found");
        return;
      }
      if (!canEditOperationalData()) {
        alert("You do not have permission to create evidence requests");
        return;
      }

      const existing = await getDocs(query(
        collection(db, "audit_evidence"),
        where("findingDocId", "==", findingDocId)
      ));

      if (!existing.empty) {
        alert("Evidence request already exists for this finding");
        return;
      }

      const ownerName =
        getDisplayableOwnerText(finding.ownerName || finding.owner) ||
        getOwnerDisplayName(finding);
      const ownerId =
        finding.ownerId ||
        (finding.owner && teamMembersById[finding.owner] ? finding.owner : "") ||
        teamMembersByName[getOwnerNameKey(ownerName)]?.id ||
        "";
      const ownerRole =
        finding.ownerRole ||
        (ownerId && teamMembersById[ownerId]?.role) ||
        "";

      const data = {
        findingDocId,
        findingId: finding.findingId || "",
        branch: finding.branch || "",
        auditArea: finding.auditArea || "",
        riskLevel: finding.riskLevel || "",
        evidenceName: `Evidence for ${finding.findingId || "-"}`,
        evidenceDescription: finding.recommendation || finding.condition || "",
        requestedBy: currentUser?.email || "",
        ownerId,
        ownerName,
        ownerRole,
        evidenceLink: finding.evidenceLink || "",
        dueDate: finding.dueDate || "",
        status: "Pending Review",
        reviewComment: "",
        reviewedBy: "",
        reviewedDate: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.email || ""
      };

      await addDoc(collection(db, "audit_evidence"), data);
      alert("Evidence request created successfully");
      showPage("pageEvidence");
    };

    function listenEvidence() {
      const q = query(
        collection(db, "audit_evidence"),
        orderBy("createdAt", "desc")
      );

      onSnapshot(q, (snapshot) => {
        evidenceRecords = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        renderEvidenceCenter();
        if (document.getElementById("reportTable")) loadAuditReport();
      });
    }

    function renderEvidenceCenter() {
      ensureEvidencePageMarkup();
      renderEvidenceKPIs();
      renderEvidenceTable();
    }

    function ensureEvidencePageMarkup() {
      const page = document.getElementById("pageEvidence");
      if (!page || document.getElementById("evidenceTable")) return;

      page.innerHTML = `
        <div class="card">
          <h3>Evidence Center</h3>

          <div class="evidence-kpis">
            <div class="evidence-kpi">
              <span>Total Evidence</span>
              <strong id="evidenceTotal">0</strong>
            </div>
            <div class="evidence-kpi">
              <span>Pending Review</span>
              <strong id="evidencePending">0</strong>
            </div>
            <div class="evidence-kpi">
              <span>Accepted</span>
              <strong id="evidenceAccepted">0</strong>
            </div>
            <div class="evidence-kpi">
              <span>Rejected / Need More Info</span>
              <strong id="evidenceRejectedNeedInfo">0</strong>
            </div>
          </div>

          <div class="evidence-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Finding ID</th>
                  <th>Branch</th>
                  <th>Audit Area</th>
                  <th>Risk</th>
                  <th>Evidence Name</th>
                  <th>Owner</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Evidence Link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="evidenceTable"></tbody>
            </table>
          </div>
        </div>

        <div id="evidenceEditModal" class="modal-overlay hidden">
          <div class="modal-box evidence-modal">
            <div class="modal-header">
              <h2>Edit Evidence</h2>
              <button type="button" class="modal-close" onclick="closeEvidenceEditor()">&times;</button>
            </div>

            <input type="hidden" id="evidenceEditId">

            <div class="evidence-form">
              <div>
                <label>Evidence Name</label>
                <input id="editEvidenceName">
              </div>
              <div>
                <label>Due Date</label>
                <input id="editEvidenceDueDate" type="date">
              </div>
              <div class="evidence-form-full">
                <label>Evidence Description</label>
                <textarea id="editEvidenceDescription"></textarea>
              </div>
              <div>
                <label>Evidence Link</label>
                <input id="editEvidenceLink" placeholder="Google Drive Link">
              </div>
              <div>
                <label>Status</label>
                <select id="editEvidenceStatus">
                  <option value="Pending Review">Pending Review</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Need More Info">Need More Info</option>
                </select>
              </div>
              <div class="evidence-form-full">
                <label>Review Comment</label>
                <textarea id="editEvidenceReviewComment"></textarea>
              </div>
            </div>

            <div class="evidence-modal-actions">
              <button type="button" onclick="saveEvidenceEdit()">Save</button>
              <button type="button" class="secondary" onclick="closeEvidenceEditor()">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderEvidenceKPIs() {
      const pending = evidenceRecords.filter(e => e.status === "Pending Review").length;
      const accepted = evidenceRecords.filter(e => e.status === "Accepted").length;
      const rejectedNeedInfo = evidenceRecords.filter(e =>
        e.status === "Rejected" ||
        e.status === "Need More Info"
      ).length;

      setText("evidenceTotal", evidenceRecords.length);
      setText("evidencePending", pending);
      setText("evidenceAccepted", accepted);
      setText("evidenceRejectedNeedInfo", rejectedNeedInfo);
    }

    function renderEvidenceTable() {
      const tbody = document.getElementById("evidenceTable");
      if (!tbody) return;

      if (evidenceRecords.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="table-empty">No evidence requests found</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = evidenceRecords.map(e => {
        const link = e.evidenceLink
          ? `<a href="${e.evidenceLink}" target="_blank" rel="noopener">Open Link</a>`
          : "-";

        return `
          <tr>
            <td>${e.findingId || "-"}</td>
            <td>${e.branch || "-"}</td>
            <td>${e.auditArea || "-"}</td>
            <td>${e.riskLevel || "-"}</td>
            <td>${e.evidenceName || "-"}</td>
            <td>${e.ownerName || "-"}</td>
            <td>${e.dueDate || "-"}</td>
            <td><span class="evidence-status ${getEvidenceStatusClass(e.status)}">${e.status || "-"}</span></td>
            <td>${link}</td>
            <td>${canEditOperationalData() ? `<button onclick="editEvidence('${e.id}')">Edit</button>` : ""}</td>
          </tr>
        `;
      }).join("");
    }

    window.editEvidence = function (id) {
      if (!canEditOperationalData()) {
        alert("You do not have permission to edit evidence");
        return;
      }

      const evidence = evidenceRecords.find(e => e.id === id);
      if (!evidence) return;

      setValue("evidenceEditId", evidence.id);
      setValue("editEvidenceName", evidence.evidenceName);
      setValue("editEvidenceDescription", evidence.evidenceDescription);
      setValue("editEvidenceLink", evidence.evidenceLink);
      setValue("editEvidenceDueDate", evidence.dueDate);
      setValue("editEvidenceStatus", evidence.status || "Pending Review");
      setValue("editEvidenceReviewComment", evidence.reviewComment);

      const modal = document.getElementById("evidenceEditModal");
      if (modal) modal.classList.remove("hidden");
    };

    window.closeEvidenceEditor = function () {
      const modal = document.getElementById("evidenceEditModal");
      if (modal) modal.classList.add("hidden");
    };

    window.saveEvidenceEdit = async function () {
      if (!canEditOperationalData()) {
        alert("You do not have permission to edit evidence");
        return;
      }

      const id = getValue("evidenceEditId");
      if (!id) return;

      const status = getValue("editEvidenceStatus");
      const data = {
        evidenceName: getValue("editEvidenceName"),
        evidenceDescription: getValue("editEvidenceDescription"),
        evidenceLink: getValue("editEvidenceLink"),
        dueDate: getValue("editEvidenceDueDate"),
        status,
        reviewComment: getValue("editEvidenceReviewComment"),
        updatedAt: serverTimestamp()
      };

      if (status === "Accepted" || status === "Rejected" || status === "Need More Info") {
        data.reviewedBy = currentUser?.email || "";
        data.reviewedDate = serverTimestamp();
      }

      await updateDoc(doc(db, "audit_evidence", id), data);
      closeEvidenceEditor();
      alert("Evidence updated successfully");
    };

    function getEvidenceStatusClass(status) {
      if (status === "Accepted") return "accepted";
      if (status === "Rejected") return "rejected";
      if (status === "Need More Info") return "need-info";
      return "pending";
    }

    window.loadAuditReport = function () {
      ensureReportPageMarkup();
      populateReportFilters();

      const rows = getFilteredReportRows();
      renderReportKPIs(rows);
      renderReportTable(rows);
      renderAuditCommitteeSummary(rows);
    };

    function ensureReportPageMarkup() {
      const page = document.getElementById("pageReport");
      if (!page || document.getElementById("reportTable")) return;

      page.innerHTML = `
        <div class="card">
          <h3>Audit Report Center</h3>

          <div class="report-kpis">
            <div class="report-kpi">
              <span>Total Findings</span>
              <strong id="reportTotalFindings">0</strong>
            </div>
            <div class="report-kpi">
              <span>High Risk Findings</span>
              <strong id="reportHighRisk">0</strong>
            </div>
            <div class="report-kpi">
              <span>Open Findings</span>
              <strong id="reportOpenFindings">0</strong>
            </div>
            <div class="report-kpi">
              <span>Closed Findings</span>
              <strong id="reportClosedFindings">0</strong>
            </div>
            <div class="report-kpi">
              <span>Overdue Action Plans</span>
              <strong id="reportOverdueActions">0</strong>
            </div>
          </div>

          <div class="report-filter-grid">
            <div>
              <label>Year</label>
              <select id="reportFilterYear" onchange="loadAuditReport()"></select>
            </div>
            <div>
              <label>Branch</label>
              <select id="reportFilterBranch" onchange="loadAuditReport()"></select>
            </div>
            <div>
              <label>Audit Area</label>
              <select id="reportFilterAuditArea" onchange="loadAuditReport()"></select>
            </div>
            <div>
              <label>Risk Level</label>
              <select id="reportFilterRisk" onchange="loadAuditReport()"></select>
            </div>
            <div>
              <label>Status</label>
              <select id="reportFilterStatus" onchange="loadAuditReport()"></select>
            </div>
            <div>
              <label>Owner</label>
              <select id="reportFilterOwner" onchange="loadAuditReport()"></select>
            </div>
          </div>

          <div class="report-actions">
            <button type="button" onclick="exportAuditExcel()">Export Excel</button>
            <button type="button" onclick="exportAuditPDF()">Export PDF</button>
          </div>

          <div class="report-summary-grid">
            <div>
              <h4>Executive Summary</h4>
              <div id="reportExecutiveSummary"></div>
            </div>
            <div>
              <h4>Top High Risk Issues</h4>
              <div id="reportTopHighRisk"></div>
            </div>
            <div>
              <h4>Aging Summary</h4>
              <div id="reportAgingSummary"></div>
            </div>
            <div>
              <h4>Outstanding Corrective Actions</h4>
              <div id="reportOutstandingActions"></div>
            </div>
          </div>

          <div class="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Finding ID</th>
                  <th>Branch</th>
                  <th>Audit Area</th>
                  <th>Risk Level</th>
                  <th>Condition</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Action Status</th>
                  <th>Evidence Status</th>
                </tr>
              </thead>
              <tbody id="reportTable"></tbody>
            </table>
          </div>
        </div>
      `;
    }

    function getReportRows() {
      const plansByFinding = {};
      actionPlans.forEach(plan => {
        if (plan.findingDocId && !plansByFinding[plan.findingDocId]) {
          plansByFinding[plan.findingDocId] = plan;
        }
      });

      const evidenceByFinding = {};
      evidenceRecords.forEach(evidence => {
        if (evidence.findingDocId && !evidenceByFinding[evidence.findingDocId]) {
          evidenceByFinding[evidence.findingDocId] = evidence;
        }
      });

      return findings.map(finding => {
        const plan = plansByFinding[finding.id] || {};
        const evidence = evidenceByFinding[finding.id] || {};

        return {
          findingDocId: finding.id,
          findingId: finding.findingId || "",
          year: getReportYear(finding),
          branch: finding.branch || "",
          auditArea: finding.auditArea || "",
          riskLevel: finding.riskLevel || "",
          condition: finding.condition || "",
          owner: getOwnerDisplayName(finding),
          status: finding.status || "",
          dueDate: finding.dueDate || "",
          actionStatus: plan.id ? getCalculatedActionStatus(plan) : "-",
          evidenceStatus: evidence.status || "-",
          actionPlan: plan,
          evidence
        };
      });
    }

    function getFilteredReportRows() {
      const year = getReportFilterValue("reportFilterYear");
      const branch = getReportFilterValue("reportFilterBranch");
      const auditArea = getReportFilterValue("reportFilterAuditArea");
      const risk = getReportFilterValue("reportFilterRisk");
      const status = getReportFilterValue("reportFilterStatus");
      const owner = getReportFilterValue("reportFilterOwner");

      return getReportRows().filter(row =>
        (!year || row.year === year) &&
        (!branch || row.branch === branch) &&
        (!auditArea || row.auditArea === auditArea) &&
        (!risk || row.riskLevel === risk) &&
        (!status || row.status === status) &&
        (!owner || row.owner === owner)
      );
    }

    function populateReportFilters() {
      const rows = getReportRows();
      setReportSelectOptions("reportFilterYear", uniqueSorted(rows.map(r => r.year).filter(Boolean)), "All Years");
      setReportSelectOptions("reportFilterBranch", uniqueSorted(rows.map(r => r.branch).filter(Boolean)), "All Branches");
      setReportSelectOptions("reportFilterAuditArea", uniqueSorted(rows.map(r => r.auditArea).filter(Boolean)), "All Audit Areas");
      setReportSelectOptions("reportFilterRisk", ["High", "Medium", "Low"], "All Risk Levels");
      setReportSelectOptions("reportFilterStatus", uniqueSorted(rows.map(r => r.status).filter(Boolean)), "All Statuses");
      setReportSelectOptions("reportFilterOwner", uniqueSorted(rows.map(r => r.owner).filter(Boolean)), "All Owners");
    }

    function setReportSelectOptions(id, values, allLabel) {
      const select = document.getElementById(id);
      if (!select) return;

      const selected = select.value;
      select.innerHTML = `<option value="">${allLabel}</option>` +
        values.map(value => `<option value="${value}">${value}</option>`).join("");

      if (values.includes(selected)) select.value = selected;
    }

    function renderReportKPIs(rows) {
      setText("reportTotalFindings", rows.length);
      setText("reportHighRisk", rows.filter(r => r.riskLevel === "High").length);
      setText("reportOpenFindings", rows.filter(r => r.status !== "Closed").length);
      setText("reportClosedFindings", rows.filter(r => r.status === "Closed").length);
      setText("reportOverdueActions", rows.filter(r => r.actionStatus === "Overdue").length);
    }

    function renderReportTable(rows) {
      const tbody = document.getElementById("reportTable");
      if (!tbody) return;

      if (rows.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="table-empty">No report data found</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = rows.map(row => `
        <tr>
          <td>${row.findingId || "-"}</td>
          <td>${row.branch || "-"}</td>
          <td>${row.auditArea || "-"}</td>
          <td>${row.riskLevel || "-"}</td>
          <td>${row.condition || "-"}</td>
          <td>${row.owner || "-"}</td>
          <td>${row.status || "-"}</td>
          <td>${row.dueDate || "-"}</td>
          <td>${row.actionStatus || "-"}</td>
          <td>${row.evidenceStatus || "-"}</td>
        </tr>
      `).join("");
    }

    function renderAuditCommitteeSummary(rows) {
      const total = rows.length;
      const highRisk = rows.filter(r => r.riskLevel === "High");
      const open = rows.filter(r => r.status !== "Closed");
      const overdueActions = rows.filter(r => r.actionStatus === "Overdue");

      setHtml("reportExecutiveSummary", `
        <p>${total} findings in scope. ${open.length} remain open and ${highRisk.length} are high risk.</p>
      `);

      setHtml("reportTopHighRisk", listHtml(
        highRisk.slice(0, 5).map(r => `${r.findingId || "-"} - ${r.auditArea || "-"} (${r.owner || "-"})`)
      ));

      setHtml("reportAgingSummary", `
        <p>0-30 days: ${countAgingBucket(rows, 0, 30)}</p>
        <p>31-60 days: ${countAgingBucket(rows, 31, 60)}</p>
        <p>Over 60 days: ${countAgingBucket(rows, 61, Infinity)}</p>
      `);

      setHtml("reportOutstandingActions", listHtml(
        overdueActions.slice(0, 5).map(r => `${r.findingId || "-"} - ${r.actionStatus} (${r.dueDate || "-"})`)
      ));
    }

    window.exportAuditExcel = function () {
      if (!window.XLSX) {
        alert("SheetJS library is not loaded");
        return;
      }

      const rows = getFilteredReportRows().map(row => ({
        "Finding ID": row.findingId,
        Branch: row.branch,
        "Audit Area": row.auditArea,
        "Risk Level": row.riskLevel,
        Condition: row.condition,
        Owner: row.owner,
        Status: row.status,
        "Due Date": row.dueDate,
        "Action Status": row.actionStatus,
        "Evidence Status": row.evidenceStatus
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Finding Summary");
      XLSX.writeFile(workbook, `AuditFlow_Report_${getTodayStamp()}.xlsx`);
    };

    window.exportAuditPDF = function () {
      const jsPDF = window.jspdf?.jsPDF;
      if (!jsPDF) {
        alert("jsPDF library is not loaded");
        return;
      }

      const rows = getFilteredReportRows();
      const doc = new jsPDF();
      const high = rows.filter(r => r.riskLevel === "High");
      const medium = rows.filter(r => r.riskLevel === "Medium");
      const low = rows.filter(r => r.riskLevel === "Low");
      const openHigh = rows.filter(r => r.riskLevel === "High" && r.status !== "Closed");
      const overdueActions = rows.filter(r => r.actionStatus === "Overdue");

      let y = 14;
      doc.setFontSize(16);
      doc.text("Audit Committee Report", 14, y);
      y += 10;

      doc.setFontSize(11);
      [
        `Total Findings: ${rows.length}`,
        `High Risk Findings: ${high.length}`,
        `Open Findings: ${rows.filter(r => r.status !== "Closed").length}`,
        `Closed Findings: ${rows.filter(r => r.status === "Closed").length}`,
        `Overdue Action Plans: ${overdueActions.length}`,
        `Risk Summary: High ${high.length}, Medium ${medium.length}, Low ${low.length}`
      ].forEach(line => {
        doc.text(line, 14, y);
        y += 7;
      });

      y += 4;
      doc.setFontSize(13);
      doc.text("Open High Risk", 14, y);
      y += 8;
      doc.setFontSize(10);
      addPdfLines(doc, openHigh.map(r => `${r.findingId || "-"} - ${r.auditArea || "-"} - ${r.owner || "-"}`), y);

      y = 150;
      doc.setFontSize(13);
      doc.text("Overdue Action Plans", 14, y);
      y += 8;
      doc.setFontSize(10);
      addPdfLines(doc, overdueActions.map(r => `${r.findingId || "-"} - ${r.auditArea || "-"} - Due ${r.dueDate || "-"}`), y);

      doc.save(`AuditFlow_Report_${getTodayStamp()}.pdf`);
    };

    function getReportFilterValue(id) {
      return document.getElementById(id)?.value || "";
    }

    function getReportYear(finding) {
      if (finding.dueDate) return String(new Date(finding.dueDate).getFullYear());
      if (finding.findingId) {
        const match = String(finding.findingId).match(/20\d{2}/);
        if (match) return match[0];
      }
      if (finding.createdAt?.toDate) return String(finding.createdAt.toDate().getFullYear());
      return "";
    }

    function uniqueSorted(values) {
      return [...new Set(values)].sort();
    }

    function setHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    function listHtml(items) {
      if (!items.length) return "<p>No items</p>";
      return `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
    }

    function countAgingBucket(rows, min, max) {
      return rows.filter(row => {
        if (!row.dueDate || row.status === "Closed") return false;
        const age = Math.floor((new Date() - new Date(row.dueDate)) / (1000 * 60 * 60 * 24));
        return age >= min && age <= max;
      }).length;
    }

    function getTodayStamp() {
      const d = new Date();
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ].join("");
    }

    function addPdfLines(doc, lines, startY) {
      let y = startY;
      const safeLines = lines.length ? lines : ["No items"];

      safeLines.slice(0, 10).forEach(line => {
        doc.text(String(line).slice(0, 95), 14, y);
        y += 6;
      });
    }

    async function ensureCurrentSystemUser() {
      if (!currentUser?.email) return;

      try {
        const existing = await getDocs(query(
          collection(db, "system_users"),
          where("email", "==", currentUser.email)
        ));

        if (!existing.empty) {
          const docSnap = existing.docs[0];
          currentSystemUser = {
            id: docSnap.id,
            ...docSnap.data()
          };
          currentUserRole = currentSystemUser.systemRole || "Auditor";
          roleLoaded = true;
          return;
        }

        const data = {
          email: currentUser.email,
          displayName: currentUser.displayName || currentUser.email,
          systemRole: "Auditor",
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser.email
        };

        const docRef = await addDoc(collection(db, "system_users"), data);
        currentSystemUser = {
          id: docRef.id,
          ...data
        };
        currentUserRole = "Auditor";
        roleLoaded = true;
        await syncSystemUserToAuditTeam(docRef.id, data);
      } catch (error) {
        console.warn("Unable to load system user role. Temporary access allowed.", error);
        currentSystemUser = null;
        currentUserRole = null;
        roleLoaded = false;
      }
    }

    function listenSystemUsers() {
      onSnapshot(query(collection(db, "system_users"), orderBy("email")), (snapshot) => {
        systemUsers = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        if (currentUser?.email) {
          const ownUser = systemUsers.find(u => u.email === currentUser.email);
          if (ownUser) {
            currentSystemUser = ownUser;
            currentUserRole = ownUser.systemRole || "Auditor";
            roleLoaded = true;
          }
        }

        applyPermissionUI();
        renderSettingDashboard();
        renderTable();
      });
    }

    function listenBranchMaster() {
      onSnapshot(query(collection(db, "branch_master"), orderBy("branchCode")), (snapshot) => {
        branchMasters = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        seedDefaultBranchesIfEmpty();
        renderSettingDashboard();
      });
    }

    function listenAuditMaster() {
      onSnapshot(query(collection(db, "audit_master"), orderBy("type")), (snapshot) => {
        auditMasters = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })).sort((a, b) =>
          `${a.type || ""}-${a.code || ""}`.localeCompare(`${b.type || ""}-${b.code || ""}`)
        );

        seedDefaultAuditMastersIfEmpty();
        renderSettingDashboard();
      });
    }

    async function seedDefaultBranchesIfEmpty() {
      if (branchMasters.length > 0 || window.__branchSeedStarted) return;
      window.__branchSeedStarted = true;

      const defaults = [
        ["SPR", "สินแพทย์รามอินทรา"],
        ["SRR", "สินแพทย์เสรีรักษ์"],
        ["SPT", "สินแพทย์เทพารักษ์"],
        ["SPS", "สินแพทย์ศรีนครินทร์"],
        ["SPL", "สินแพทย์ลำลูกกา"],
        ["SPK", "สินแพทย์กาญจนบุรี"],
        ["SPN", "สินแพทย์นครปฐม"]
      ];

      for (const [branchCode, branchName] of defaults) {
        await addDoc(collection(db, "branch_master"), {
          branchCode,
          branchName,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    async function seedDefaultAuditMastersIfEmpty() {
      if (auditMasters.length > 0 || window.__auditMasterSeedStarted) return;
      window.__auditMasterSeedStarted = true;

      const defaults = [
        ...["Fixed Asset", "ITGC", "Procurement", "Revenue", "Inventory", "Payroll", "PDPA", "Compliance"].map(name => ({
          type: "auditArea",
          code: name,
          name
        })),
        ...["High", "Medium", "Low"].map(name => ({
          type: "riskLevel",
          code: name,
          name
        })),
        ...["Open", "In Progress", "Follow-up", "Closed"].map(name => ({
          type: "status",
          code: name,
          name
        }))
      ];

      for (const item of defaults) {
        await addDoc(collection(db, "audit_master"), {
          ...item,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    function getCurrentUserRole() {
      if (!roleLoaded) {
        console.warn("User role is not loaded. Temporary access allowed.");
        return null;
      }

      return currentUserRole || currentSystemUser?.systemRole || null;
    }

    function canEdit() {
      return canEditFinding();
    }

    function canDelete() {
      return canDeleteFinding();
    }

    function canManageSetting() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return role === "Supervisor";
    }

    function canViewReport() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return ["Audit Manager", "Supervisor", "Senior Auditor", "Auditor", "Management Viewer"].includes(role);
    }

    function canSubmitFinding(finding = null) {
      const role = getCurrentUserRole();
      if (!role) return true;
      if (role === "Senior Auditor") return true;
      if (role === "Auditor") return canEditFinding(finding);
      return false;
    }

    function canSupervisorReview() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return role === "Supervisor";
    }

    function canManagerApprove() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return role === "Audit Manager";
    }

    function canEditFinding(finding = null) {
      const role = getCurrentUserRole();
      if (!role) return true;

      if (["Audit Manager", "Supervisor", "Senior Auditor"].includes(role)) return true;
      if (role === "Auditor") {
        const status = finding ? getWorkflowStatus(finding) : null;
        if (!finding) return true;
        const ownerEmail = finding.ownerId ? teamMembersById[finding.ownerId]?.email : "";
        const isOwnFinding =
          finding.createdBy === currentUser?.email ||
          ownerEmail === currentUser?.email;
        return isOwnFinding && (status === "Draft" || status === "Rejected");
      }

      return false;
    }

    function canDeleteFinding() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return role === "Supervisor";
    }

    function canEditOperationalData() {
      const role = getCurrentUserRole();
      if (!role) return true;
      return ["Audit Manager", "Supervisor", "Senior Auditor", "Auditor"].includes(role);
    }

    window.getCurrentUserRole = getCurrentUserRole;
    window.canEdit = canEdit;
    window.canDelete = canDelete;
    window.canManageSetting = canManageSetting;
    window.canViewReport = canViewReport;
    window.canSubmitFinding = canSubmitFinding;
    window.canSupervisorReview = canSupervisorReview;
    window.canManagerApprove = canManagerApprove;
    window.canEditFinding = canEditFinding;
    window.canDeleteFinding = canDeleteFinding;
    window.canEditOperationalData = canEditOperationalData;

    function canAccessPage(pageId) {
      const role = getCurrentUserRole();
      if (!role) return true;

      if (pageId === "pageSetting") return canManageSetting();

      if (role === "Management Viewer") {
        return ["pageDashboard", "pageRegister", "pageActionPlan", "pageEvidence", "pageReport"].includes(pageId);
      }

      return true;
    }

    function applyPermissionUI() {
      const role = getCurrentUserRole();

      document.querySelectorAll(".sidebar button").forEach(btn => {
        btn.style.display = "";
      });

      const settingBtn = document.querySelector(".sidebar button[onclick*='pageSetting']");
      if (settingBtn) {
        settingBtn.style.display = canManageSetting() ? "" : "none";
      }

      if (role === "Management Viewer") {
        document.querySelectorAll(".sidebar button").forEach(btn => {
          const click = btn.getAttribute("onclick") || "";
          const allowed =
            click.includes("pageDashboard") ||
            click.includes("pageRegister") ||
            click.includes("pageActionPlan") ||
            click.includes("pageEvidence") ||
            click.includes("pageReport");
          btn.style.display = allowed ? "" : "none";
        });
      }
    }

    function ensureSettingPageMarkup() {
      const page = document.getElementById("pageSetting");
      if (!page || document.getElementById("systemUserTable")) return;

      page.innerHTML = `
        <div class="card">
          <h3>System Setting</h3>

          <div class="setting-grid">
            <section class="setting-panel">
              <h4>User Role Management</h4>
              <div class="setting-form-grid">
                <input type="hidden" id="systemUserEditId">
                <div>
                  <label>Email</label>
                  <input id="systemUserEmail" placeholder="user@example.com">
                </div>
                <div>
                  <label>Display Name</label>
                  <input id="systemUserDisplayName" placeholder="Display name">
                </div>
                <div>
                  <label>System Role</label>
                  <select id="systemUserRole">
                    <option value="Audit Manager">Audit Manager</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Senior Auditor">Senior Auditor</option>
                    <option value="Auditor">Auditor</option>
                    <option value="Management Viewer">Management Viewer</option>
                  </select>
                </div>
                <label class="setting-check">
                  <input id="systemUserActive" type="checkbox" checked>
                  Active
                </label>
                <button type="button" onclick="saveSystemUser()">Save User</button>
                <button type="button" class="secondary" onclick="clearSystemUserForm()">Clear</button>
              </div>
              <div class="setting-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="systemUserTable"></tbody>
                </table>
              </div>
            </section>

            <section class="setting-panel">
              <h4>Branch Master Data</h4>
              <div class="setting-form-grid">
                <input type="hidden" id="branchEditId">
                <div>
                  <label>Branch Code</label>
                  <input id="branchCode" placeholder="SPR">
                </div>
                <div>
                  <label>Branch Name</label>
                  <input id="branchName" placeholder="Branch name">
                </div>
                <label class="setting-check">
                  <input id="branchActive" type="checkbox" checked>
                  Active
                </label>
                <button type="button" onclick="saveBranchMaster()">Save Branch</button>
                <button type="button" class="secondary" onclick="clearBranchForm()">Clear</button>
              </div>
              <div class="setting-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="branchMasterTable"></tbody>
                </table>
              </div>
            </section>

            <section class="setting-panel setting-panel-wide">
              <h4>Audit Master Data</h4>
              <div class="setting-form-grid">
                <input type="hidden" id="auditMasterEditId">
                <div>
                  <label>Type</label>
                  <select id="auditMasterType">
                    <option value="auditArea">auditArea</option>
                    <option value="riskCategory">riskCategory</option>
                    <option value="status">status</option>
                    <option value="riskLevel">riskLevel</option>
                  </select>
                </div>
                <div>
                  <label>Code</label>
                  <input id="auditMasterCode" placeholder="Code">
                </div>
                <div>
                  <label>Name</label>
                  <input id="auditMasterName" placeholder="Name">
                </div>
                <label class="setting-check">
                  <input id="auditMasterActive" type="checkbox" checked>
                  Active
                </label>
                <button type="button" onclick="saveAuditMaster()">Save Master</button>
                <button type="button" class="secondary" onclick="clearAuditMasterForm()">Clear</button>
              </div>
              <div class="setting-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Active</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="auditMasterTable"></tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      `;
    }

    function renderSettingDashboard() {
      ensureSettingPageMarkup();
      renderSystemUsers();
      renderBranchMasters();
      renderAuditMasters();
    }

    function renderSystemUsers() {
      const tbody = document.getElementById("systemUserTable");
      if (!tbody) return;

      tbody.innerHTML = systemUsers.map(user => `
        <tr>
          <td>${user.email || "-"}</td>
          <td>${user.displayName || "-"}</td>
          <td>${user.systemRole || "-"}</td>
          <td>${user.active ? "Yes" : "No"}</td>
          <td>
            <button type="button" onclick="editSystemUser('${user.id}')">Edit</button>
            ${canDelete() ? `<button type="button" class="danger" onclick="deleteSystemUser('${user.id}')">Delete</button>` : ""}
          </td>
        </tr>
      `).join("");
    }

    function renderBranchMasters() {
      const tbody = document.getElementById("branchMasterTable");
      if (!tbody) return;

      tbody.innerHTML = branchMasters.map(branch => `
        <tr>
          <td>${branch.branchCode || "-"}</td>
          <td>${branch.branchName || "-"}</td>
          <td>${branch.active ? "Yes" : "No"}</td>
          <td>
            <button type="button" onclick="editBranchMaster('${branch.id}')">Edit</button>
            ${canDelete() ? `<button type="button" class="danger" onclick="deleteBranchMaster('${branch.id}')">Delete</button>` : ""}
          </td>
        </tr>
      `).join("");
    }

    function renderAuditMasters() {
      const tbody = document.getElementById("auditMasterTable");
      if (!tbody) return;

      tbody.innerHTML = auditMasters.map(item => `
        <tr>
          <td>${item.type || "-"}</td>
          <td>${item.code || "-"}</td>
          <td>${item.name || "-"}</td>
          <td>${item.active ? "Yes" : "No"}</td>
          <td>
            <button type="button" onclick="editAuditMaster('${item.id}')">Edit</button>
            ${canDelete() ? `<button type="button" class="danger" onclick="deleteAuditMaster('${item.id}')">Delete</button>` : ""}
          </td>
        </tr>
      `).join("");
    }

    window.saveSystemUser = async function () {
      if (!canManageSetting()) return alert("Only Supervisor can manage settings");

      const id = getValue("systemUserEditId");
      const data = {
        email: getValue("systemUserEmail").trim(),
        displayName: getValue("systemUserDisplayName").trim(),
        systemRole: getValue("systemUserRole"),
        active: document.getElementById("systemUserActive")?.checked || false,
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.email || ""
      };

      if (!data.email) return alert("Please enter email");

      let systemUserId = id;
      if (id) {
        await updateDoc(doc(db, "system_users", id), data);
      } else {
        data.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, "system_users"), data);
        systemUserId = docRef.id;
      }

      await syncSystemUserToAuditTeam(systemUserId, data);
      clearSystemUserForm();
    };

    async function syncSystemUserToAuditTeam(systemUserId, userData) {
      if (!systemUserId || !userData) return;

      const email = (userData.email || "").trim();
      const systemRole = userData.systemRole || "Auditor";
      const status = userData.active ? "Active" : "Inactive";

      const bySystemUser = await getDocs(query(
        collection(db, "audit_team"),
        where("systemUserId", "==", systemUserId)
      ));

      const byEmail = email
        ? await getDocs(query(
            collection(db, "audit_team"),
            where("email", "==", email)
          ))
        : { empty: true, docs: [] };

      const existingDoc = !bySystemUser.empty
        ? bySystemUser.docs[0]
        : (!byEmail.empty ? byEmail.docs[0] : null);

      if (systemRole === "Management Viewer") {
        if (existingDoc) {
          await updateDoc(doc(db, "audit_team", existingDoc.id), {
            status: "Inactive",
            source: "system_users",
            systemUserId,
            updatedAt: serverTimestamp()
          });
        }
        return;
      }

      const auditTeamData = {
        name: userData.displayName || email,
        email,
        role: systemRole,
        status,
        source: "system_users",
        systemUserId,
        updatedAt: serverTimestamp()
      };

      if (existingDoc) {
        await updateDoc(doc(db, "audit_team", existingDoc.id), auditTeamData);
      } else {
        await addDoc(collection(db, "audit_team"), {
          ...auditTeamData,
          createdAt: serverTimestamp()
        });
      }
    }

    window.syncSystemUserToAuditTeam = syncSystemUserToAuditTeam;

    window.clearSystemUserForm = function () {
      setValue("systemUserEditId", "");
      setValue("systemUserEmail", "");
      setValue("systemUserDisplayName", "");
      setValue("systemUserRole", "Auditor");
      const active = document.getElementById("systemUserActive");
      if (active) active.checked = true;
    };

    window.editSystemUser = function (id) {
      const user = systemUsers.find(u => u.id === id);
      if (!user) return;

      setValue("systemUserEditId", user.id);
      setValue("systemUserEmail", user.email);
      setValue("systemUserDisplayName", user.displayName);
      setValue("systemUserRole", user.systemRole || "Auditor");
      const active = document.getElementById("systemUserActive");
      if (active) active.checked = !!user.active;
    };

    window.deleteSystemUser = async function (id) {
      if (!canDelete()) return alert("Only Supervisor can delete settings data");
      if (!confirm("Delete this user?")) return;
      const linkedTeam = await getDocs(query(
        collection(db, "audit_team"),
        where("systemUserId", "==", id)
      ));

      for (const teamDoc of linkedTeam.docs) {
        await updateDoc(doc(db, "audit_team", teamDoc.id), {
          status: "Inactive",
          updatedAt: serverTimestamp()
        });
      }

      await deleteDoc(doc(db, "system_users", id));
    };

    window.saveBranchMaster = async function () {
      if (!canManageSetting()) return alert("Only Supervisor can manage settings");

      const id = getValue("branchEditId");
      const data = {
        branchCode: getValue("branchCode").trim(),
        branchName: getValue("branchName").trim(),
        active: document.getElementById("branchActive")?.checked || false,
        updatedAt: serverTimestamp()
      };

      if (!data.branchCode || !data.branchName) return alert("Please enter branch code and name");

      if (id) {
        await updateDoc(doc(db, "branch_master", id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "branch_master"), data);
      }

      clearBranchForm();
    };

    window.clearBranchForm = function () {
      setValue("branchEditId", "");
      setValue("branchCode", "");
      setValue("branchName", "");
      const active = document.getElementById("branchActive");
      if (active) active.checked = true;
    };

    window.editBranchMaster = function (id) {
      const branch = branchMasters.find(b => b.id === id);
      if (!branch) return;

      setValue("branchEditId", branch.id);
      setValue("branchCode", branch.branchCode);
      setValue("branchName", branch.branchName);
      const active = document.getElementById("branchActive");
      if (active) active.checked = !!branch.active;
    };

    window.deleteBranchMaster = async function (id) {
      if (!canDelete()) return alert("Only Supervisor can delete settings data");
      if (!confirm("Delete this branch?")) return;
      await deleteDoc(doc(db, "branch_master", id));
    };

    window.loadBranchDropdowns = function () {
      const activeBranches = branchMasters.filter(branch => branch.active);
      return activeBranches.map(branch => ({
        code: branch.branchCode,
        name: branch.branchName
      }));
    };

    window.saveAuditMaster = async function () {
      if (!canManageSetting()) return alert("Only Supervisor can manage settings");

      const id = getValue("auditMasterEditId");
      const data = {
        type: getValue("auditMasterType"),
        code: getValue("auditMasterCode").trim(),
        name: getValue("auditMasterName").trim(),
        active: document.getElementById("auditMasterActive")?.checked || false,
        updatedAt: serverTimestamp()
      };

      if (!data.type || !data.code || !data.name) return alert("Please enter type, code, and name");

      if (id) {
        await updateDoc(doc(db, "audit_master", id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "audit_master"), data);
      }

      clearAuditMasterForm();
    };

    window.clearAuditMasterForm = function () {
      setValue("auditMasterEditId", "");
      setValue("auditMasterType", "auditArea");
      setValue("auditMasterCode", "");
      setValue("auditMasterName", "");
      const active = document.getElementById("auditMasterActive");
      if (active) active.checked = true;
    };

    window.editAuditMaster = function (id) {
      const item = auditMasters.find(m => m.id === id);
      if (!item) return;

      setValue("auditMasterEditId", item.id);
      setValue("auditMasterType", item.type);
      setValue("auditMasterCode", item.code);
      setValue("auditMasterName", item.name);
      const active = document.getElementById("auditMasterActive");
      if (active) active.checked = !!item.active;
    };

    window.deleteAuditMaster = async function (id) {
      if (!canDelete()) return alert("Only Supervisor can delete settings data");
      if (!confirm("Delete this master data?")) return;
      await deleteDoc(doc(db, "audit_master", id));
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

    renderCriticalFinding();
    renderAgingAnalysis();
    renderRiskSeveritySummary();
    renderManagementActionTracker();
    renderTeamDashboard();
    renderKanban();}

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
        getOwnerDisplayName(f), f.dueDate, f.status, f.evidenceLink
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
      const key = getOwnerDisplayName(f);
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
const owner = getOwnerDisplayName(f);
data[owner] =
(data[owner] || 0) + 1;
});
let html="";
const max = Math.max(...Object.values(data), 1);
Object.keys(data).forEach(owner=>{
const width = Math.max((data[owner] / max) * 100, 8);
html += `
<div class="bar-row" style="display:grid;grid-template-columns:180px 1fr 48px;align-items:center;gap:12px;margin:10px 0;">
<div>${owner}</div>
<div class="bar-bg" style="height:10px;border-radius:999px;background:#1e293b;overflow:hidden;">
<div class="bar-fill"
style="width:${width}%;height:100%;border-radius:999px;background:#38bdf8;">
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
const owner = getOwnerDisplayName(f);
if(!owners[owner]){
owners[owner]={
total:0,
open:0,
overdue:0,
closed:0
};
}
owners[owner].total++;
if(f.status==="Closed"){
owners[owner].closed++;
}
else {
owners[owner].open++;
}
if(isOverdue(f.dueDate, f.status)){
owners[owner].overdue++;
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
<td>${owners[o].open}</td>
<td><span class="team-overdue-count">${owners[o].overdue}</span></td>
<td>${owners[o].closed}</td>
<td>
<div class="team-progress-cell">
<div class="team-progress-bar">
<div style="width:${pct}%"></div>
</div>
<span>${pct}%</span>
</div>
</td>
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

  const counts = {
    Planning: 0,
    Fieldwork: 0,
    Review: 0,
    Follow: 0,
    Closed: 0
  };

  findings.forEach(f => {
    let stage = "Fieldwork";
    let column = columns.Fieldwork;

    if (f.status === "Open") stage = "Planning";
    if (f.status === "In Progress") stage = "Fieldwork";
    if (f.mapStatus === "Verified") stage = "Review";
    if (f.mapStatus === "Implemented") stage = "Follow";
    if (f.status === "Closed") stage = "Closed";

    column = columns[stage];

    if (!column) return;
    counts[stage]++;

    let riskClass = "kanban-risk-low";
    if (f.riskLevel === "High") riskClass = "kanban-risk-high";
    if (f.riskLevel === "Medium") riskClass = "kanban-risk-medium";

    column.innerHTML += `
      <div class="kanban-card ${riskClass}">
        <div class="kanban-card-title">${f.findingId || "-"}</div>
        <div class="kanban-card-area">${f.auditArea || "-"}</div>
        <div class="kanban-card-meta">
          <span class="kanban-pill">${f.riskLevel || "-"}</span>
          <span>${f.dueDate || "-"}</span>
        </div>
        <div class="kanban-card-owner">Owner: ${getOwnerDisplayName(f)}</div>
      </div>
    `;
  });

  Object.keys(columns).forEach(stage => {
    const header = document.querySelector(`[data-kanban-stage="${stage}"]`);
    if (header) header.innerText = counts[stage];

    if (columns[stage] && counts[stage] === 0) {
      columns[stage].innerHTML = `<div class="kanban-empty">No findings</div>`;
    }
  });
}
/* ======================================
   AuditFlow V3 Final Page Navigation
====================================== */
window.showPage = function(pageId) {

  if (!canAccessPage(pageId)) {
    alert("You do not have permission to access this page");
    pageId = "pageDashboard";
  }


  // ซ่อนทุกหน้า
  document.querySelectorAll(".page-section").forEach(page => {

    page.classList.add("hidden");

    page.classList.remove("active-page");

    page.style.display = "none";

  });



  // เปิดหน้าที่เลือก
  const target = document.getElementById(pageId);


  if (target) {

    target.classList.remove("hidden");

    target.classList.add("active-page");

    target.style.display = "block";

  }



  // โหลด Owner เมื่อเข้า Add/Edit Finding
  if (pageId === "pageForm") {

    setTimeout(() => {

      if (window.loadOwnerDropdown) {

        window.loadOwnerDropdown();

      }

    },300);

  }

  if (pageId === "pageActionPlan") {
    ensureActionPlanPageMarkup();
    renderActionPlanDashboard();
  }

  if (pageId === "pageEvidence") {
    ensureEvidencePageMarkup();
    renderEvidenceCenter();
  }

  if (pageId === "pageReport") {
    ensureReportPageMarkup();
    loadAuditReport();
  }

  if (pageId === "pageSetting") {
    if (!canManageSetting()) {
      alert("Only Supervisor can manage system settings");
      showPage("pageDashboard");
      return;
    }
    ensureSettingPageMarkup();
    renderSettingDashboard();
  }



  // active menu
  document.querySelectorAll(".sidebar button").forEach(btn => {

    btn.classList.remove("active");


    const click =
      btn.getAttribute("onclick") || "";


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
    renderCriticalFinding();
    renderAgingAnalysis();
};
function renderCriticalFinding(){

const box = document.getElementById("criticalFindingList");

if(!box) return;

const data =
getDashboardData()
.filter(f =>
f.riskLevel === "High" &&
f.status !== "Closed"
)
.slice(0,5);


box.innerHTML =
data.map(f => `

<tr>
<td>${f.findingId || "-"}</td>
<td>${f.riskLevel}</td>
<td>${getOwnerDisplayName(f)}</td>
<td>${calculateAging(f.dueDate,f.status)}</td>
</tr>

`).join("");

}


function renderAgingAnalysis(){

const box = document.getElementById("agingAnalysis");

if(!box) return;


let d30 = 0;
let d60 = 0;
let d90 = 0;


getDashboardData()
.filter(f => f.status !== "Closed")
.forEach(f => {

let aging =
Number(calculateAging(f.dueDate,f.status));


if(aging <= 30) d30++;
else if(aging <= 60) d60++;
else d90++;

});


box.innerHTML = `

<div class="aging-row">
🟢 0-30 Days <b>${d30}</b>
</div>

<div class="aging-row">
🟡 31-60 Days <b>${d60}</b>
</div>

<div class="aging-row">
🔴 >60 Days <b>${d90}</b>
</div>

`;

}
function renderRiskSeveritySummary() {
  const data = getDashboardData();

  let low = 0;
  let medium = 0;
  let high = 0;
  let critical = 0;

  data.forEach(f => {
    const impact = Number(f.impact || 1);
    const likelihood = Number(f.likelihood || 1);
    const score = impact * likelihood;

    if (score <= 4) low++;
    else if (score <= 9) medium++;
    else if (score <= 16) high++;
    else critical++;
  });

  const lowEl = document.getElementById("riskScoreLow");
  const mediumEl = document.getElementById("riskScoreMedium");
  const highEl = document.getElementById("riskScoreHigh");
  const criticalEl = document.getElementById("riskScoreCritical");

  if (lowEl) lowEl.innerText = low;
  if (mediumEl) mediumEl.innerText = medium;
  if (highEl) highEl.innerText = high;
  if (criticalEl) criticalEl.innerText = critical;
}
function renderManagementActionTracker() {
  const data = getDashboardData();

  const closed = data.filter(f =>
    f.mapStatus === "Closed" ||
    f.status === "Closed"
  ).length;

  const inProgress = data.filter(f =>
    f.mapStatus === "In Progress" ||
    f.status === "In Progress" ||
    f.status === "Open"
  ).length;

  const overdue = data.filter(f =>
    isOverdue(f.dueDate, f.status)
  ).length;

  const total = closed + inProgress;
  const rate = total === 0 ? 0 : Math.round((closed / total) * 100);

  const actionClosedEl = document.getElementById("actionClosed");
  const actionProgressEl = document.getElementById("actionProgress");
  const actionOverdueEl = document.getElementById("actionOverdue");
  const actionRateEl = document.getElementById("actionRate");

  if (actionClosedEl) actionClosedEl.innerText = closed;
  if (actionProgressEl) actionProgressEl.innerText = inProgress;
  if (actionOverdueEl) actionOverdueEl.innerText = overdue;
  if (actionRateEl) actionRateEl.innerText = rate + "%";
}
// ===============================
// Team Management Modal
// ===============================
const btnManageTeam = document.getElementById("btnManageTeam");
const teamModal = document.getElementById("teamModal");
const btnCloseTeamModal = document.getElementById("btnCloseTeamModal");

if (btnManageTeam && teamModal) {
  btnManageTeam.addEventListener("click", () => {
    teamModal.classList.remove("hidden");
  });
}

if (btnCloseTeamModal && teamModal) {
  btnCloseTeamModal.addEventListener("click", () => {
    teamModal.classList.add("hidden");
  });
}

if (teamModal) {
  teamModal.addEventListener("click", (e) => {
    if (e.target === teamModal) {
      teamModal.classList.add("hidden");
    }
  });
}
window.openTeamModal = function () {
  const modal = document.getElementById("teamModal");

  if (!modal) {
    alert("ไม่พบ teamModal ใน index.html");
    return;
  }

  modal.classList.remove("hidden");
};
// ===============================
// Team Management Firestore
// ===============================

const teamRef = collection(db, "audit_team");

window.saveAuditor = async function () {
  const id = document.getElementById("editTeamId")?.value || "";
  const name = document.getElementById("auditorName")?.value.trim();
  const role = document.getElementById("auditorRole")?.value;
  const status = document.getElementById("auditorStatus")?.value;

  if (!name) {
    alert("กรุณาระบุชื่อ Auditor");
    return;
  }

  const data = {
    name,
    role,
    status,
    updatedAt: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "audit_team", id), data);
  } else {
    await addDoc(teamRef, {
      ...data,
      createdAt: serverTimestamp()
    });
  }

  clearTeamForm();
};

window.clearTeamForm = function () {
  document.getElementById("editTeamId").value = "";
  document.getElementById("auditorName").value = "";
  document.getElementById("auditorRole").value = "Auditor";
  document.getElementById("auditorStatus").value = "Active";
};

window.editAuditor = function (id, name, role, status) {
  document.getElementById("editTeamId").value = id;
  document.getElementById("auditorName").value = name;
  document.getElementById("auditorRole").value = role;
  document.getElementById("auditorStatus").value = status;
};

window.deleteAuditor = async function (id) {
  if (!canDelete()) {
    alert("Only Supervisor can delete team members");
    return;
  }
  if (!confirm("ยืนยันการลบ Auditor รายนี้?")) return;

  await deleteDoc(doc(db, "audit_team", id));

  alert("ลบ Auditor เรียบร้อย");
};

function listenAuditTeam() {
  const body = document.getElementById("teamTableBody");
  if (!body) return;

  onSnapshot(query(teamRef, orderBy("name")), (snapshot) => {
    body.innerHTML = "";
    const nextTeamMembersById = {};
    const nextTeamMembersByName = {};

    snapshot.forEach((docSnap) => {
      const t = {
        id: docSnap.id,
        ...docSnap.data()
      };
      nextTeamMembersById[docSnap.id] = t;
      const nameKey = getOwnerNameKey(t.name || "");
      if (nameKey) {
        nextTeamMembersByName[nameKey] = t;
      }

      body.innerHTML += `
  <tr>
    <td>${t.name || "-"}</td>
    <td>${t.email || "-"}</td>
    <td>${t.role || "-"}</td>
    <td>${t.status || "-"}</td>
    <td><span class="source-badge ${t.source === "system_users" ? "system-user" : "manual"}">${t.source === "system_users" ? "System User" : "Manual"}</span></td>
    <td>
      <button type="button" onclick="editAuditor(
        ${JSON.stringify(docSnap.id)},
        ${JSON.stringify(t.name || "")},
        ${JSON.stringify(t.role || "")},
        ${JSON.stringify(t.status || "")}
      )">
        Edit
      </button>

      ${canDelete() ? `<button type="button" onclick="deleteAuditor('${docSnap.id}')">
        Delete
      </button>` : ""}
    </td>
  </tr>
`;
    });

    teamMembersById = nextTeamMembersById;
    teamMembersByName = nextTeamMembersByName;
    renderDashboard();
    renderTable();
  });
}

listenAuditTeam();
/* ==============================
   Load Active Auditor to Owner Dropdown
============================== */

function loadOwnerDropdown() {
  const ownerSelect = document.getElementById("owner");

  if (!ownerSelect) return;
  const selectedOwnerId = ownerSelect.value;

  onSnapshot(
    query(collection(db, "audit_team"), orderBy("name")),
    (snapshot) => {
      const currentOwnerId = ownerSelect.value || selectedOwnerId;
      ownerSelect.innerHTML = `
        <option value="">
          -- เลือกผู้รับผิดชอบ --
        </option>
      `;
      const nextTeamMembersById = {};
      const nextTeamMembersByName = {};

      snapshot.forEach((docSnap) => {
        const t = {
          id: docSnap.id,
          ...docSnap.data()
        };
        nextTeamMembersById[docSnap.id] = t;
        const nameKey = getOwnerNameKey(t.name || "");
        if (nameKey) {
          nextTeamMembersByName[nameKey] = t;
        }

        if (t.status === "Active") {
        ownerSelect.innerHTML += `
        <option 
        value="${docSnap.id}"
        data-name="${t.name}"
        data-role="${t.role}">
        ${t.name} (${t.role})
      </option>`;
        }
      });

      if (currentOwnerId) {
        ownerSelect.value = currentOwnerId;
      }

      teamMembersById = {
        ...teamMembersById,
        ...nextTeamMembersById
      };
      teamMembersByName = {
        ...teamMembersByName,
        ...nextTeamMembersByName
      };
      renderDashboard();
      renderTable();
    }
  );
}

loadOwnerDropdown();
