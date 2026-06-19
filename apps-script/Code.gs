/**
 * AuditFlow LINE Audit Coach
 * Backend สำหรับ Google Apps Script + Google Sheet + LINE Messaging API
 *
 * Script Properties ที่ต้องตั้ง:
 * - SPREADSHEET_ID
 * - LINE_CHANNEL_ACCESS_TOKEN
 */

const SHEETS = {
  USERS: 'Users',
  TASKS: 'AuditTasks',
  FINDINGS: 'AuditFindings',
  SUMMARY: 'DailySummary',
  SETTINGS: 'Settings',
  TEMPLATES: 'TaskTemplates'
};

const HEADERS = {
  Users: ['userId', 'displayName', 'role', 'team', 'status', 'registeredAt', 'lastSeenAt'],
  AuditTasks: ['taskId', 'title', 'description', 'auditArea', 'ownerUserId', 'ownerName', 'team', 'priority', 'risk', 'status', 'dueDate', 'sourceTemplateId', 'notes', 'completedAt', 'updatedAt', 'createdAt'],
  AuditFindings: ['findingId', 'taskId', 'userId', 'displayName', 'severity', 'description', 'status', 'createdAt', 'updatedAt'],
  DailySummary: ['summaryId', 'date', 'userId', 'displayName', 'type', 'highPriorityCount', 'pendingCount', 'overdueCount', 'dueSoonCount', 'highRiskCount', 'doneCount', 'newFindingCount', 'weightedScore', 'payloadJson', 'sentAt'],
  Settings: ['key', 'value', 'description', 'updatedAt'],
  TaskTemplates: ['templateId', 'auditArea', 'title', 'description', 'defaultPriority', 'defaultRisk', 'dueOffsetDays', 'active']
};

function doGet() {
  return jsonOutput({ ok: true, service: 'AuditFlow LINE Audit Coach' });
}

function doPost(e) {
  try {
    setupSheets();
    const body = parsePostBody(e);

    // registration จาก LIFF/web
    if (body.action === 'registerUser') {
      const result = registerUser(body);
      return jsonOutput({ ok: true, result });
    }

    // task sync จากหน้าเว็บ AuditFlow
    if (body.action === 'upsertAuditTask') {
      const result = upsertAuditTask(body.task || {});
      return jsonOutput({ ok: true, result });
    }

    // sync หลายงานจากหน้าเว็บ AuditFlow
    if (body.action === 'bulkUpsertAuditTasks') {
      const result = bulkUpsertAuditTasks(body.tasks || []);
      return jsonOutput({ ok: true, result });
    }

    // webhook จาก LINE Messaging API
    if (Array.isArray(body.events)) {
      body.events.forEach(handleLineEvent);
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ ok: false, error: 'Unknown payload' });
  } catch (error) {
    console.error(error);
    return jsonOutput({ ok: false, error: String(error) });
  }
}

function parsePostBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function setupSheets() {
  Object.keys(HEADERS).forEach(name => {
    const sheet = getOrCreateSheet(name);
    const headers = HEADERS[name];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isEmpty = firstRow.every(value => value === '');
    if (isEmpty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(name) {
  const ss = getSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readRows(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(value => value !== '')).map((row, index) => {
    const item = { _row: index + 2 };
    headers.forEach((key, i) => item[key] = row[i]);
    return item;
  });
}

function appendRow(sheetName, object) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = HEADERS[sheetName];
  sheet.appendRow(headers.map(key => object[key] ?? ''));
}

function updateRow(sheetName, rowNumber, object) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = HEADERS[sheetName];
  const values = headers.map(key => object[key] ?? '');
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function registerUser(payload) {
  const now = new Date();
  const users = readRows(SHEETS.USERS);
  const existing = users.find(user => user.userId === payload.userId);
  const user = {
    userId: payload.userId,
    displayName: payload.displayName || '',
    role: payload.role || 'auditor',
    team: payload.team || '',
    status: 'active',
    registeredAt: existing ? existing.registeredAt : now,
    lastSeenAt: now
  };

  if (existing) updateRow(SHEETS.USERS, existing._row, user);
  else appendRow(SHEETS.USERS, user);

  pushLineMessage(user.userId, {
    type: 'text',
    text: `ลงทะเบียน Audit Coach สำเร็จ\nคุณ ${user.displayName}\nRole: ${user.role}\nTeam: ${user.team}`
  });

  return user;
}

function upsertAuditTask(payload) {
  const now = new Date();
  const taskId = String(payload.taskId || payload.id || '').trim().toUpperCase();
  if (!taskId) throw new Error('Missing taskId');

  const tasks = readRows(SHEETS.TASKS);
  const existing = tasks.find(item => String(item.taskId).toUpperCase() === taskId);
  const task = {
    taskId,
    title: payload.title || '',
    description: payload.description || payload.desc || '',
    auditArea: payload.auditArea || payload.branch || payload.type || '',
    ownerUserId: payload.ownerUserId || '',
    ownerName: payload.ownerName || payload.owner || '',
    team: payload.team || payload.branch || '',
    priority: normalizePriority(payload.priority || payload.risk || 'medium'),
    risk: normalizeRisk(payload.risk || 'medium'),
    status: normalizeTaskStatus(payload.status || 'todo'),
    dueDate: formatDate(payload.dueDate || payload.due),
    sourceTemplateId: payload.sourceTemplateId || '',
    notes: payload.notes || payload.note || '',
    completedAt: normalizeTaskStatus(payload.status || '') === 'done' ? (payload.completedAt || now) : (payload.completedAt || ''),
    updatedAt: now,
    createdAt: existing ? existing.createdAt : (payload.createdAt || now)
  };

  if (existing) updateRow(SHEETS.TASKS, existing._row, task);
  else appendRow(SHEETS.TASKS, task);

  return task;
}

function bulkUpsertAuditTasks(list) {
  if (!Array.isArray(list)) throw new Error('tasks must be an array');
  const results = list.filter(Boolean).map(upsertAuditTask);
  return { count: results.length };
}

function normalizeRisk(value) {
  const key = String(value || '').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(key)) return key;
  if (key === 'ต่ำ') return 'low';
  if (key === 'สูง') return 'high';
  return 'medium';
}

function normalizePriority(value) {
  return normalizeRisk(value);
}

function normalizeTaskStatus(value) {
  const key = String(value || '').toLowerCase();
  const map = {
    planning: 'todo',
    fieldwork: 'in_progress',
    review: 'review',
    done: 'done',
    pending: 'pending',
    todo: 'todo',
    in_progress: 'in_progress'
  };
  return map[key] || 'todo';
}

function handleLineEvent(event) {
  if (!event || event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  touchUser(userId);
  const result = parseAuditCommand(event.message.text, userId);
  replyLineMessage(event.replyToken, result.messages);
}

function touchUser(userId) {
  const users = readRows(SHEETS.USERS);
  const user = users.find(item => item.userId === userId);
  if (!user) return;
  user.lastSeenAt = new Date();
  updateRow(SHEETS.USERS, user._row, user);
}

function parseAuditCommand(text, userId) {
  const raw = String(text || '').trim();
  const parts = raw.split(/\s+/);
  const command = (parts[0] || '').toLowerCase();
  const taskId = (parts[1] || '').toUpperCase();

  if (['done', 'pending'].includes(command) && taskId) {
    const status = command === 'done' ? 'done' : 'pending';
    const task = updateTaskStatus(taskId, status, userId);
    return textResult(task ? `อัปเดต ${taskId} เป็น ${status} แล้ว` : `ไม่พบงาน ${taskId}`);
  }

  if (command === 'note' && taskId) {
    const note = raw.replace(/^note\s+\S+\s*/i, '').trim();
    const task = updateTaskNote(taskId, note, userId);
    return textResult(task ? `บันทึก note ให้ ${taskId} แล้ว` : `ไม่พบงาน ${taskId}`);
  }

  if (command === 'risk' && taskId) {
    const risk = (parts[2] || '').toLowerCase();
    if (!['low', 'medium', 'high', 'critical'].includes(risk)) {
      return textResult('กรุณาระบุ risk เป็น low, medium, high หรือ critical');
    }
    const task = updateTaskRisk(taskId, risk, userId);
    return textResult(task ? `ปรับ risk ของ ${taskId} เป็น ${risk} แล้ว` : `ไม่พบงาน ${taskId}`);
  }

  if (command === 'finding' && taskId) {
    const description = raw.replace(/^finding\s+\S+\s*/i, '').trim();
    const finding = createAuditFinding(taskId, userId, description, 'medium');
    return textResult(finding ? `สร้าง finding ของ ${taskId} แล้ว` : `ไม่พบงาน ${taskId}`);
  }

  if (raw === 'งานวันนี้') return { messages: [buildTaskListFlex('งานวันนี้', getTodayTasks(userId))] };
  if (raw === 'งานค้าง') return { messages: [buildTaskListFlex('งานค้าง', getPendingTasks(userId))] };
  if (raw === 'สรุป') return { messages: [buildSummaryFlex('สรุป Audit', buildSummary(userId, 'manual'))] };

  return textResult('คำสั่งที่ใช้ได้: done INV-001, pending TAX-003, note INV-001 ข้อความ, risk PAY-002 high, finding INV-001 ข้อความ, งานวันนี้, งานค้าง, สรุป');
}

function updateTaskStatus(taskId, status, userId) {
  const tasks = readRows(SHEETS.TASKS);
  const task = tasks.find(item => String(item.taskId).toUpperCase() === taskId);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date();
  if (status === 'done') task.completedAt = new Date();
  updateRow(SHEETS.TASKS, task._row, task);
  return task;
}

function updateTaskNote(taskId, note, userId) {
  const tasks = readRows(SHEETS.TASKS);
  const task = tasks.find(item => String(item.taskId).toUpperCase() === taskId);
  if (!task) return null;
  task.notes = note;
  task.updatedAt = new Date();
  updateRow(SHEETS.TASKS, task._row, task);
  return task;
}

function updateTaskRisk(taskId, risk, userId) {
  const tasks = readRows(SHEETS.TASKS);
  const task = tasks.find(item => String(item.taskId).toUpperCase() === taskId);
  if (!task) return null;
  task.risk = risk;
  task.updatedAt = new Date();
  updateRow(SHEETS.TASKS, task._row, task);
  return task;
}

function createAuditFinding(taskId, userId, description, severity) {
  const task = readRows(SHEETS.TASKS).find(item => String(item.taskId).toUpperCase() === taskId);
  if (!task) return null;
  const user = findUser(userId);
  const now = new Date();
  const finding = {
    findingId: `F-${Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss')}`,
    taskId,
    userId,
    displayName: user ? user.displayName : '',
    severity,
    description,
    status: 'open',
    createdAt: now,
    updatedAt: now
  };
  appendRow(SHEETS.FINDINGS, finding);
  return finding;
}

function createDailyAuditTasks() {
  setupSheets();
  const templates = readRows(SHEETS.TEMPLATES).filter(item => String(item.active).toUpperCase() !== 'FALSE');
  const users = readRows(SHEETS.USERS).filter(user => user.status === 'active');
  const now = new Date();

  users.forEach(user => {
    templates.forEach(template => {
      const due = addDays(now, Number(template.dueOffsetDays || 0));
      const taskId = `${template.auditArea || 'AUD'}-${Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMdd')}-${String(Math.floor(Math.random() * 900) + 100)}`;
      appendRow(SHEETS.TASKS, {
        taskId,
        title: template.title,
        description: template.description,
        auditArea: template.auditArea,
        ownerUserId: user.userId,
        ownerName: user.displayName,
        team: user.team,
        priority: template.defaultPriority || 'medium',
        risk: template.defaultRisk || 'medium',
        status: 'todo',
        dueDate: formatDate(due),
        sourceTemplateId: template.templateId,
        notes: '',
        completedAt: '',
        updatedAt: now,
        createdAt: now
      });
    });
  });
}

function sendMorningAuditSummary() {
  sendSummaryToAllUsers('morning');
}

function sendEveningAuditSummary() {
  sendSummaryToAllUsers('evening');
}

function sendSummaryToAllUsers(type) {
  setupSheets();
  const users = readRows(SHEETS.USERS).filter(user => user.status === 'active');
  users.forEach(user => {
    const summary = buildSummary(user.userId, type);
    saveDailySummary(user, type, summary);
    pushLineMessage(user.userId, buildSummaryFlex(type === 'morning' ? 'Morning Audit Summary' : 'Evening Audit Summary', summary));
  });
}

function buildSummary(userId, type) {
  const tasks = getUserTasks(userId);
  const findings = readRows(SHEETS.FINDINGS);
  const today = formatDate(new Date());
  const doneToday = tasks.filter(task => formatDate(task.completedAt) === today);
  const newFindings = findings.filter(item => item.userId === userId && formatDate(item.createdAt) === today);
  const pending = tasks.filter(task => !['done'].includes(String(task.status).toLowerCase()));
  const overdue = pending.filter(isOverdueTask);
  const dueSoon = pending.filter(isDueSoonTask);
  const highPriority = tasks.filter(task => isToday(task.dueDate) && ['high', 'critical'].includes(String(task.priority).toLowerCase()));
  const highRisk = pending.filter(task => ['high', 'critical'].includes(String(task.risk).toLowerCase()));

  return {
    type,
    highPriority,
    pending,
    overdue,
    dueSoon,
    highRisk,
    doneToday,
    newFindings,
    weightedScore: calculateWeightedScore(tasks)
  };
}

function saveDailySummary(user, type, summary) {
  const now = new Date();
  appendRow(SHEETS.SUMMARY, {
    summaryId: `${formatDate(now)}:${user.userId}:${type}`,
    date: formatDate(now),
    userId: user.userId,
    displayName: user.displayName,
    type,
    highPriorityCount: summary.highPriority.length,
    pendingCount: summary.pending.length,
    overdueCount: summary.overdue.length,
    dueSoonCount: summary.dueSoon.length,
    highRiskCount: summary.highRisk.length,
    doneCount: summary.doneToday.length,
    newFindingCount: summary.newFindings.length,
    weightedScore: summary.weightedScore,
    payloadJson: JSON.stringify(summary, null, 0),
    sentAt: now
  });
}

function getUserTasks(userId) {
  return readRows(SHEETS.TASKS).filter(task => task.ownerUserId === userId);
}

function getTodayTasks(userId) {
  return getUserTasks(userId).filter(task => isToday(task.dueDate));
}

function getPendingTasks(userId) {
  return getUserTasks(userId).filter(task => String(task.status).toLowerCase() !== 'done' && (isOverdueTask(task) || ['todo', 'pending', 'in_progress', 'review'].includes(String(task.status).toLowerCase())));
}

function findUser(userId) {
  return readRows(SHEETS.USERS).find(user => user.userId === userId);
}

function isToday(value) {
  return formatDate(value) === formatDate(new Date());
}

function isOverdueTask(task) {
  const due = parseDate(task.dueDate);
  return due && due < startOfToday() && String(task.status).toLowerCase() !== 'done';
}

function isDueSoonTask(task) {
  const due = parseDate(task.dueDate);
  if (!due) return false;
  const today = startOfToday();
  const soon = addDays(today, 3);
  return due >= today && due <= soon;
}

function calculateWeightedScore(tasks) {
  if (!tasks.length) return 100;
  const riskWeight = { low: 1, medium: 2, high: 3, critical: 5 };
  let total = 0;
  let earned = 0;
  tasks.forEach(task => {
    const weight = riskWeight[String(task.risk || 'medium').toLowerCase()] || 2;
    total += weight;
    if (String(task.status).toLowerCase() === 'done') earned += weight;
    else if (isOverdueTask(task)) earned -= weight;
  });
  return Math.max(0, Math.round((earned / total) * 100));
}

function buildTaskListFlex(title, tasks) {
  const rows = tasks.slice(0, 10).map(task => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      { type: 'text', text: `${task.taskId} ${task.title}`, weight: 'bold', size: 'sm', wrap: true },
      { type: 'text', text: `Status: ${task.status} | Risk: ${task.risk} | Due: ${formatDate(task.dueDate)}`, size: 'xs', color: '#667085', wrap: true }
    ]
  }));

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg' },
          ...(rows.length ? rows : [{ type: 'text', text: 'ไม่มีรายการ', size: 'sm', color: '#667085' }])
        ]
      }
    }
  };
}

function buildSummaryFlex(title, summary) {
  const metrics = [
    ['High Priority วันนี้', summary.highPriority.length],
    ['งานค้าง', summary.pending.length],
    ['ใกล้ deadline', summary.dueSoon.length],
    ['High Risk', summary.highRisk.length],
    ['เสร็จวันนี้', summary.doneToday.length],
    ['Finding ใหม่', summary.newFindings.length],
    ['Overdue', summary.overdue.length],
    ['Weighted Score', `${summary.weightedScore}%`]
  ];

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg' },
          ...metrics.map(([label, value]) => ({
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: label, size: 'sm', color: '#667085', flex: 4 },
              { type: 'text', text: String(value), size: 'sm', weight: 'bold', align: 'end', flex: 2 }
            ]
          }))
        ]
      }
    }
  };
}

function textResult(text) {
  return { messages: [{ type: 'text', text }] };
}

function replyLineMessage(replyToken, messages) {
  const token = getLineToken();
  if (!token || !replyToken) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify({ replyToken, messages: normalizeMessages(messages) }),
    muteHttpExceptions: true
  });
}

function pushLineMessage(to, messageOrMessages) {
  const token = getLineToken();
  if (!token || !to) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify({ to, messages: normalizeMessages(messageOrMessages) }),
    muteHttpExceptions: true
  });
}

function normalizeMessages(value) {
  if (Array.isArray(value)) return value.slice(0, 5);
  return [value];
}

function getLineToken() {
  return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
}

function jsonOutput(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const date = new Date(value);
  if (isNaN(date)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDays(value, days) {
  const date = parseDate(value) || new Date();
  date.setDate(date.getDate() + days);
  return date;
}
