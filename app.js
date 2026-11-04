/* ============================================================
   教育工作台 · 纯静态单用户版
   数据存本机 IndexedDB，不上传任何服务器
   ============================================================ */

const DB_NAME = 'chems_teach_v1';
const STORE = 'kv';
const KEYS = ['students', 'contacts', 'assessments', 'feedbacks', 'plans', 'courses'];
const S = { students: [], contacts: [], assessments: [], feedbacks: [], plans: [], courses: [] };

/* ---------------- 存储 ---------------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const NATIVE = (typeof window !== 'undefined' && window.NativeDB) ? window.NativeDB : null;
function hasNative() { return !!(NATIVE && typeof NATIVE.loadAll === 'function'); }

async function loadIDB() {
  const db = await openDB();
  await new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly');
    const cur = tx.objectStore(STORE).openCursor();
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        if (KEYS.includes(c.key)) {
          const rec = c.value;
          S[c.key] = (rec && Array.isArray(rec.v)) ? rec.v : [];
        }
        c.continue();
      } else res();
    };
  });
  db.close();
}

async function loadAll() {
  if (hasNative()) {
    let parsed = null;
    try { parsed = JSON.parse(NATIVE.loadAll() || '{}'); } catch (_) { parsed = null; }
    if (parsed) {
      const total = KEYS.reduce((n, k) => n + ((parsed[k] || []).length), 0);
      if (total > 0) {
        KEYS.forEach(k => { S[k] = Array.isArray(parsed[k]) ? parsed[k] : []; });
        return;
      }
    }
    // SQLite 为空 → 从旧版 IndexedDB 迁移一次
    await loadIDB();
    if (KEYS.some(k => S[k].length)) await Promise.all(KEYS.map(saveKey));
    return;
  }
  await loadIDB();
}

async function saveKey(key) {
  if (hasNative()) {
    try {
      NATIVE.save(key, JSON.stringify(S[key] || []));
      scheduleBackup();
      return;
    } catch (e) { }
  }
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ k: key, v: S[key] });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
  scheduleBackup();
}

/* ---------------- 本机自动备份（localStorage 镜像） ---------------- */
const LS_KEY = 'jiaoyu_auto_backup_v1';
let backupTimer = null;

function makeSnapshot() {
  const data = {};
  KEYS.forEach(k => {
    data[k] = (S[k] || []).map(item => {
      const copy = { ...item };
      if (Array.isArray(copy.photos)) { copy.photoCount = copy.photos.length; delete copy.photos; }
      return copy;
    });
  });
  return { at: new Date().toISOString(), data };
}
function writeBackup() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(makeSnapshot())); } catch (_) { }
}
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(writeBackup, 800);
}
function readBackup() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    if (!b || !b.data) return null;
    const total = KEYS.reduce((n, k) => n + ((b.data[k] || []).length), 0);
    return { at: b.at, data: b.data, total };
  } catch (_) { return null; }
}
function backupInfo() {
  const b = readBackup();
  if (!b) return '暂无自动备份';
  const t = new Date(b.at);
  const pad = n => String(n).padStart(2, '0');
  return `${t.getMonth() + 1}月${t.getDate()}日 ${pad(t.getHours())}:${pad(t.getMinutes())} · ${b.total} 条`;
}

/* ---------------- 工具 ---------------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const money = (n) => n == null || n === '' ? '—' : '¥' + Number(n).toLocaleString('zh-CN');
const initials = (name) => (String(name || '学').slice(0, 1));
function daysTo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(today() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}
function studentName(sid) { const s = S.students.find(x => x.id === sid); return s ? s.name : '（已删除学生）'; }
function studentById(sid) { return S.students.find(x => x.id === sid); }
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(26,26,46,.92);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:90;max-width:80%;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}
async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg || '已复制');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg || '已复制'); } catch (_) { toast('复制失败，请长按手动复制'); }
    ta.remove();
  }
}

/* ---------------- 导航 ---------------- */
const NAV = [
  { id: 'home', t: '工作台首页', i: '🏠' },
  { id: 'students', t: '学生管理', i: '👥' },
  { id: 'courses', t: '课程管理', i: '🎒' },
  { id: 'stats', t: '数据统计', i: '📈' },
  { id: 'exports', t: '下载管理', i: '📥' },
  { id: 'contacts', t: '家长沟通', i: '💬' },
  { id: 'assessments', t: '新生测评', i: '📊' },
  { id: 'plans', t: '学习规划', i: '🎯' },
  { id: 'ai', t: 'AI 助手', i: '🤖' },
  { id: 'data', t: '数据与备份', i: '🗂️' },
];
let current = 'home';

function renderNav() {
  document.getElementById('nav').innerHTML = NAV.map(n =>
    `<a href="#/${n.id}" class="${n.id === current ? 'active' : ''}"><span class="ico">${n.i}</span>${n.t}</a>`
  ).join('');
  const item = NAV.find(n => n.id === current);
  document.getElementById('pageTitle').textContent = item ? item.t : '教育工作台';
}

/* ---------------- 弹窗 ---------------- */
let modalOk = null;
function openModal(title, bodyHTML, okText, onOk) {
  document.getElementById('modal').innerHTML =
    `<div class="modal-bar"><button class="modal-x" data-act="modal-cancel" aria-label="关闭">✕</button></div><h3>${title}</h3>${bodyHTML}<div class="modal-actions">
      <button class="btn" data-act="modal-cancel">取消</button>
      <button class="btn primary" data-act="modal-ok">${okText || '保存'}</button>
    </div>`;
  modalOk = onOk;
  document.getElementById('modalWrap').classList.add('show');
}
function closeModal() {
  document.getElementById('modalWrap').classList.remove('show');
  modalOk = null;
  if (typeof hideCombo === 'function') hideCombo();
}
function field(label, inner, tip) {
  return `<div class="field"><label>${label}</label>${inner}${tip ? `<div class="tip">${tip}</div>` : ''}</div>`;
}
function input(name, val, ph, type) {
  return `<input name="${name}" type="${type || 'text'}" value="${esc(val || '')}" placeholder="${esc(ph || '')}">`;
}
function textarea(name, val, ph) {
  return `<textarea name="${name}" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea>`;
}
function studentOptions(sel) {
  return S.students.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}${s.grade ? ' · ' + esc(s.grade) : ''}</option>`).join('');
}

/* ---------------- 可搜索下拉（可输入 + 可选 + 可筛选） ---------------- */
function uniq(arr) {
  return [...new Set(arr.filter(x => x != null && String(x).trim()))].map(x => String(x).trim());
}
const COMBO_SRC = {
  name: () => uniq(S.students.map(s => s.name)),
  grade: () => uniq(['初一', '初二', '初三', '高一', '高二', '高三'].concat(S.students.map(s => s.grade))),
  school: () => uniq(S.students.map(s => s.school)),
  cls: () => uniq(['九慧1班', '九慧2班', '九慧小3班', '高一班'].concat(S.students.map(s => s.cls))),
  topic: () => uniq(Object.keys(CHEM_TOPICS).concat(S.feedbacks.map(f => f.topic))),
  subject: () => uniq(['化学', '数学', '物理', '英语', '语文', '生物'].concat(
    S.students.flatMap(s => String(s.subjects || '').split(/[，,、\s]+/)))),
};
function combo(name, value, ph, options) {
  return `<div class="combo-wrap">
    <input name="${name}" value="${esc(value || '')}" placeholder="${esc(ph || '')}"
      autocomplete="off" data-combo data-opts="${esc(JSON.stringify(options))}">
    <span class="caret">▾</span>
  </div>`;
}

let comboPop = null, comboInput = null, comboList = [], comboIdx = -1;

function ensurePop() {
  if (!comboPop) {
    comboPop = document.createElement('div');
    comboPop.className = 'combo-pop';
    comboPop.hidden = true;
    document.body.appendChild(comboPop);
  }
  return comboPop;
}
function showCombo(input) {
  const opts = JSON.parse(input.dataset.opts || '[]');
  const q = (input.value || '').trim().toLowerCase();
  comboList = opts.filter(o => String(o).toLowerCase().includes(q));
  comboInput = input;
  comboIdx = comboList.findIndex(o => String(o) === input.value.trim());

  const pop = ensurePop();
  pop.innerHTML = comboList.length
    ? comboList.map((o, i) => `<div class="combo-item ${i === comboIdx ? 'active' : ''}" data-i="${i}">${esc(o)}</div>`).join('')
    : `<div class="combo-empty">没有匹配项，可直接输入</div>`;

  const r = input.getBoundingClientRect();
  pop.style.width = Math.max(r.width, 160) + 'px';
  pop.style.left = Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8) + 'px';
  const h = Math.min(pop.scrollHeight || 200, 216);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight && r.top - 6 - h > 0) top = r.top - 6 - h;
  pop.style.top = top + 'px';
  pop.hidden = false;
}
function hideCombo() {
  if (comboPop) comboPop.hidden = true;
  comboInput = null; comboIdx = -1;
}
function pickCombo(i) {
  const input = comboInput;
  if (!input || i < 0 || i >= comboList.length) return;
  input.value = comboList[i];
  hideCombo();
  if (input.focus) input.focus();
  if (input.name === 'topic') { initPoints({ topic: input.value }); renderPointChips(); }
}
function formData(root) {
  const o = {};
  [...root.querySelectorAll('input[name],select[name],textarea[name]')]
    .forEach(el => { o[el.name] = (el.value || '').trim(); });
  return o;
}

/* ---------------- 渲染分发 ---------------- */
function render() {
  renderNav();
  const v = ({
    home: viewHome, students: viewStudents, contacts: viewContacts,
    assessments: viewAssessments,
    plans: viewPlans, courses: viewCourses, ai: viewAi, stats: viewStats, exports: viewExports, data: viewData,
  }[current] || viewHome)();
  document.getElementById('view').innerHTML = v;
  const fabPages = ['students', 'courses', 'contacts', 'assessments', 'plans'];
  document.getElementById('fab').style.display = fabPages.includes(current) ? 'block' : 'none';
}

/* ---------------- 首页 ---------------- */
function viewHome() {
  const active = S.students.filter(s => s.status !== '已结课').length;
  const weekContacts = S.contacts.filter(c => daysTo(c.date) <= 0 && daysTo(c.date) >= -6).length;
  const ongoing = S.plans.filter(p => (p.tasks || []).some(t => !t.done)).length;

  const recent = S.students.slice(0, 3).map(s => studentCard(s, true)).join('') || `<div class="empty">还没有学生，点右下角「+」添加第一个</div>`;

  return `
    <div class="stats">
      <div class="stat"><div class="num">${active}</div><div class="lbl">在读学生</div></div>
      <div class="stat"><div class="num">${weekContacts}</div><div class="lbl">近 7 天沟通</div></div>
      <div class="stat"><div class="num">${S.assessments.length}</div><div class="lbl">新生测评</div></div>
      <div class="stat"><div class="num">${ongoing}</div><div class="lbl">进行中规划</div></div>
    </div>
    <div class="quick">
      <button data-act="quick" data-q="student">＋ 添加学生</button>
      <button data-act="quick" data-q="contact">＋ 记沟通</button>
      <button data-act="quick" data-q="assessment">＋ 新测评</button>
    </div>
    <div class="section-title"><h2>最近添加的学生</h2><a href="#/students" style="font-size:12px;color:#028090;text-decoration:none">全部 →</a></div>
    ${recent}
  `;
}

function studentCard(s, compact) {
  const tags = [];
  tags.push(`<span class="tag cls">${esc(classOf(s))}</span>`);
  if (s.grade) tags.push(`<span class="tag">${esc(s.grade)}</span>`);
  (s.subjects || '').split(/[，,、\s]+/).filter(Boolean).forEach(x => tags.push(`<span class="tag">${esc(x)}</span>`));
  (s.status ? [s.status] : []).forEach(x => tags.push(`<span class="tag gray">${esc(x)}</span>`));
  const cnt = {
    c: S.contacts.filter(x => x.sid === s.id).length,
    a: S.assessments.filter(x => x.sid === s.id).length,
  };
  const att = S.courses.filter(x => (x.sids || []).includes(s.id) && String(x.date || '') <= today()).length;
  const hasToday = S.courses.some(x => (x.sids || []).includes(s.id) && x.date === today());
  return `<div class="card">
    <div class="card-head">
      <div class="avatar">${esc(initials(s.name))}</div>
      <div style="flex:1;min-width:0">
        <h3>${esc(s.name)}</h3>
        <div class="meta">${esc(s.school || '')}${s.parent ? ' · 家长 ' + esc(s.parent) : ''}${s.phone ? ' ' + esc(s.phone) : ''}</div>
      </div>
      <button class="btn sm" data-act="edit-student" data-id="${s.id}">编辑</button>
    </div>
    <div class="tags">${tags.join('') || '<span class="tag gray">未填标签</span>'}</div>
    ${s.note ? `<div class="meta" style="margin-top:8px">备注：${esc(s.note)}</div>` : ''}
    ${compact ? '' : `<div class="btns">
      <button class="btn sm" data-act="add-contact" data-sid="${s.id}">记沟通</button>
      <button class="btn sm" data-act="add-assessment" data-sid="${s.id}">做测评</button>
      <button class="btn sm" data-act="student-pdf" data-id="${s.id}">导出 PDF</button>
      <button class="btn sm danger" data-act="del-student" data-id="${s.id}">删除</button>
    </div>
    <div class="card-foot">
      <span class="meta">沟通 ${cnt.c} 条 · 测评 ${cnt.a} 份 · 已上 ${att} 节课</span>
      ${hasToday ? `<span class="today-badge">📅 今日有课</span>` : ''}
    </div>`}
  </div>`;
}

/* ---------------- 学生 ---------------- */
let stuQ = '', stuCls = '';
function filteredStudents() {
  let list = S.students.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (stuQ) {
    const q = stuQ.toLowerCase();
    list = list.filter(s => (s.name + s.school + s.parent + s.note + classOf(s)).toLowerCase().includes(q));
  }
  if (stuCls) list = list.filter(s => classOf(s) === stuCls);
  return list;
}
function studentListHTML() {
  const list = filteredStudents();
  return list.map(s => studentCard(s, false)).join('') || `<div class="empty">没有匹配的学生</div>`;
}
function updateStuCount() {
  const cnt = document.getElementById('stuCount');
  if (cnt) cnt.textContent = `共 ${filteredStudents().length} 人`;
}
function refreshStudentList() {
  const box = document.getElementById('stuList');
  if (box) box.innerHTML = studentListHTML();
  updateStuCount();
}
function viewStudents() {
  const classes = [...new Set(S.students.map(s => classOf(s)))];
  const tabs = [''].concat(classes);
  const tabHTML = tabs.map(c => {
    const label = c || '全部';
    const n = c ? S.students.filter(s => classOf(s) === c).length : S.students.length;
    return `<button class="cls-tab${stuCls === c ? ' active' : ''}" data-act="filter-cls" data-cls="${esc(c)}">${esc(label)}<span class="n">${n}</span></button>`;
  }).join('');
  return `
    <div class="searchbar">
      <input id="stuQ" placeholder="搜索学生 / 班级 / 学校" value="${esc(stuQ)}" autocomplete="off">
    </div>
    <div class="cls-bar">${tabHTML}</div>
    <div class="section-title"><h2 id="stuCount">共 ${filteredStudents().length} 人</h2>${pageActions('students','add-student','＋ 添加学生')}</div>
    <div id="stuList">${studentListHTML()}</div>
  `;
}

function pageActions(mod, addAct, addLabel) {
  return `<div class="row" style="gap:8px">
    <button class="btn sm" data-act="export-page" data-mod="${mod}">导出</button>
    ${addAct ? `<button class="btn sm primary" data-act="${addAct}">${addLabel}</button>` : ''}
  </div>`;
}
function formStudent(s) {
  s = s || {};
  return field('学生姓名', combo('name', s.name, '如 李明轩', COMBO_SRC.name())) +
    `<div class="grid2">
      ${field('年级', combo('grade', s.grade, '如 初三', COMBO_SRC.grade()))}
      ${field('学校', combo('school', s.school, '如 实验中学', COMBO_SRC.school()))}
    </div>
    ${field('班级', combo('cls', s.cls, '如 九慧1班', COMBO_SRC.cls()), '导出反馈表按班级分 sheet，建议都填')}
    ${field('科目', combo('subjects', s.subjects, '化学', COMBO_SRC.subject()), '填过科目会自动出现在下拉里')}
    <div class="grid2">
      ${field('状态', `<select name="status">
        ${['在读', '重点', '薄弱', '已结课'].map(x => `<option ${s.status === x ? 'selected' : ''}>${x}</option>`).join('')}
      </select>`)}
      ${field('家长称呼', input('parent', s.parent, '如 李妈妈'))}
    </div>
    ${field('家长电话', input('phone', s.phone, '手机号', 'tel'))}
    ${field('备注', textarea('note', s.note, '薄弱点、上课时间、目标分…'))}`;
}

/* ---------------- 沟通 ---------------- */
let conSid = '';
function viewContacts() {
  let list = S.contacts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (conSid) list = list.filter(c => c.sid === conSid);
  return `
    <div class="searchbar">
      <select id="conSid">
        <option value="">全部学生</option>
        ${S.students.map(s => `<option value="${s.id}" ${s.id === conSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="section-title"><h2>共 ${list.length} 条</h2>${pageActions('contacts','add-contact','＋ 记沟通')}</div>
    ${list.map(c => `<div class="card">
      <div class="row"><span class="tag">${esc(c.type || '微信')}</span><strong>${esc(studentName(c.sid))}</strong>
        <span class="spacer"></span><span class="meta">${esc(c.date || '')}</span></div>
      <div style="margin-top:8px;white-space:pre-wrap">${esc(c.content || '')}</div>
      ${c.follow ? `<div class="tag amber" style="margin-top:10px;display:inline-block">跟进：${esc(c.follow)}</div>` : ''}
      <div class="btns">
        <button class="btn sm" data-act="edit-contact" data-id="${c.id}">编辑</button>
        <button class="btn sm danger" data-act="del-contact" data-id="${c.id}">删除</button>
      </div>
    </div>`).join('') || `<div class="empty">还没有沟通记录</div>`}
  `;
}
function formContact(c) {
  c = c || {};
  return field('学生', `<select name="sid">${studentOptions(c.sid)}</select>`) +
    `<div class="grid2">
      ${field('方式', `<select name="type">${['微信', '电话', '面谈', '家长会'].map(x => `<option ${c.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
      ${field('日期', input('date', c.date || today(), '', 'date'))}
    </div>
    ${field('沟通内容', textarea('content', c.content, '家长反馈 / 沟通要点'))}` +
    field('跟进事项', input('follow', c.follow, '下周重点辅导力学部分'));
}

/* ---------------- 测评 ---------------- */
let assSid = '';
function viewAssessments() {
  let list = S.assessments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (assSid) list = list.filter(a => a.sid === assSid);
  return `
    <div class="notice blue" style="margin-bottom:12px">新生测评：填完分数与强弱项，点「复制给家长」直接发微信。</div>
    <div class="searchbar">
      <select id="assSid"><option value="">全部学生</option>
        ${S.students.map(s => `<option value="${s.id}" ${s.id === assSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="section-title"><h2>共 ${list.length} 份</h2>${pageActions('assessments','add-assessment','＋ 新建测评')}</div>
    ${list.map(a => `<div class="card">
      <div class="row"><strong>${esc(studentName(a.sid))}</strong>
        <span class="tag ${a.level === '薄弱' ? 'warn' : a.level === '优秀' ? '' : 'amber'}">${esc(a.subject || '')} ${esc(a.level || '')}</span>
        <span class="spacer"></span><span class="meta">${esc(a.date || '')}</span></div>
      <div class="meta" style="margin-top:4px">得分 ${esc(a.score || '—')} / ${esc(a.total || '—')}</div>
      <div style="margin-top:8px;font-size:13.5px;line-height:1.7">
        ${a.strong ? `<div><b style="color:#0B6B5B">优势：</b>${esc(a.strong)}</div>` : ''}
        ${a.weak ? `<div><b style="color:#A3312B">薄弱：</b>${esc(a.weak)}</div>` : ''}
        ${a.goal ? `<div><b style="color:#028090">目标：</b>${esc(a.goal)}</div>` : ''}
      </div>
      <div class="btns">
        <button class="btn sm" data-act="copy-assess" data-id="${a.id}">复制给家长</button>
        <button class="btn sm" data-act="edit-assess" data-id="${a.id}">编辑</button>
        <button class="btn sm danger" data-act="del-assess" data-id="${a.id}">删除</button>
      </div>
    </div>`).join('') || `<div class="empty">还没有测评报告</div>`}
  `;
}
function formAssessment(a) {
  a = a || {};
  return field('学生', `<select name="sid">${studentOptions(a.sid)}</select>`) +
    `<div class="grid2">
      ${field('科目', combo('subject', a.subject, '化学', COMBO_SRC.subject()))}
      ${field('等级', `<select name="level">${['优秀', '一般', '薄弱'].map(x => `<option ${a.level === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
    </div>
    <div class="grid2">
      ${field('得分', input('score', a.score, '72', 'number'))}
      ${field('满分', input('total', a.total, '100', 'number'))}
    </div>` +
    field('测评日期', input('date', a.date || today(), '', 'date')) +
    field('优势', textarea('strong', a.strong, '化学用语、基础实验操作…')) +
    field('薄弱', textarea('weak', a.weak, '溶解度曲线、实验探究…')) +
    field('阶段目标', textarea('goal', a.goal, '2 个月内把探究题得分率提到 60%'));
}
function assessText(a) {
  const st = studentById(a.sid);
  return `【${st ? st.name : '学生'} · ${a.subject || ''} 学情测评】
日期：${a.date || '—'}
得分：${a.score || '—'} / ${a.total || '—'}（${a.level || ''}）
优势：${a.strong || '—'}
薄弱：${a.weak || '—'}
阶段目标：${a.goal || '—'}
—— 车老师`;
}

/* ---------------- 反馈 ---------------- */
let photoBuf = [];   // 当前弹窗里的错题照片（压缩后的 dataURL）

const NATIVE_ORIGIN = (typeof location !== 'undefined') ? location.origin : '';
function photoURL(p) {
  if (typeof p === 'string' && p.indexOf('data:') === 0) return p;
  return NATIVE_ORIGIN + '/photos/' + encodeURIComponent(String(p || ''));
}
function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error || new Error('读取失败'));
    fr.readAsDataURL(file);
  });
}
async function photoToFile(p, name) {
  if (typeof p === 'string' && p.indexOf('data:') === 0) return dataUrlToFile(p, name);
  const blob = await (await fetch(photoURL(p))).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
async function migratePhotosToFiles() {
  if (!hasNative() || typeof NATIVE.savePhoto !== 'function') return;
  let changed = false;
  for (const f of S.feedbacks) {
    const arr = f.photos || [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (typeof p === 'string' && p.indexOf('data:') === 0) {
        try {
          const mime = (p.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
          const name = String(NATIVE.savePhoto('', mime, (p.split(',')[1] || '')));
          if (name && name.indexOf('ERR:') !== 0) { arr[i] = name; changed = true; }
        } catch (_) { }
      }
    }
  }
  if (changed) await saveKey('feedbacks');
}

function renderPhotoPrev() {
  const box = document.getElementById('photoPrev');
  if (!box) return;
  box.innerHTML = photoBuf.map((p, i) =>
    `<div class="photo"><img src="${photoURL(p)}" alt="错题 ${i + 1}"><button data-act="del-photo" data-idx="${i}">×</button></div>`
  ).join('');
}
function openPhoto(src) {
  document.getElementById('modal').innerHTML =
    `<img src="${src}" style="width:100%;border-radius:10px;display:block">
     <div class="modal-actions"><button class="btn" data-act="modal-cancel">关闭</button></div>`;
  document.getElementById('modalWrap').classList.add('show');
}
/* ---------------- 内置化学考点库（离线可用，不花钱） ---------------- */
const CHEM_TOPICS = {
  '化学用语': ['元素符号与名称', '化学式书写', '化合价规则', '离子符号', '化学方程式配平'],
  '空气与氧气': ['空气成分与用途', '氧气性质', '实验室制氧气', '燃烧与灭火', '缓慢氧化'],
  '质量守恒与方程式': ['质量守恒定律', '方程式书写条件', '配平方法', '简单计算', '反应类型判断'],
  '碳和碳的氧化物': ['CO₂ 制取与检验', 'CO₂ 性质', 'CO 还原性', '碳单质', '温室效应'],
  '金属与金属材料': ['金属活动性顺序', '金属与酸反应', '金属与盐溶液', '合金', '金属资源保护'],
  '溶液与溶解度曲线': ['溶解度概念', '曲线读图', '饱和与不饱和', '溶质质量分数', '结晶方法'],
  '酸碱盐': ['酸碱指示剂', '常见酸的性质', '常见碱的性质', '盐与复分解', 'pH 与中和反应'],
  '实验基本操作与气体制备': ['仪器与操作', '气密性检查', '装置选择', '收集与验满', '误差分析'],
  '氧化还原反应': ['氧化剂与还原剂判断', '化合价升降与电子转移', '氧化还原方程式配平', '常见氧化剂还原剂', '氧化性与还原性强弱'],
  '离子反应': ['电解质与非电解质', '离子方程式书写', '离子共存判断', '离子检验', '离子反应本质'],
  '物质的量': ['物质的量与摩尔', '摩尔质量', '气体摩尔体积', '物质的量浓度', '配制一定浓度溶液'],
  '钠及其化合物': ['钠的性质', '氧化钠与过氧化钠', '碳酸钠与碳酸氢钠', '焰色试验', '钠的保存与用途'],
};
const POINT_LV = ['不会', '半会', '会'];
let pointBuf = [];

function currentTopic() {
  const el = document.querySelector('#modal [name=topic]');
  return el ? el.value.trim() : '';
}
function initPoints(f) {
  const topic = (f && f.topic || '').trim();
  const old = (f && f.points) || [];
  if (old.length) { pointBuf = old.map(p => ({ t: p.t, on: p.on !== undefined ? !!p.on : true, busy: false })); return; }
  const list = CHEM_TOPICS[topic] || [];
  pointBuf = list.map(t => ({ t, on: false, busy: false }));
}
function renderPointChips() {
  const box = document.getElementById('pointBox');
  if (!box) return;
  box.innerHTML = pointBuf.length
    ? pointBuf.map((p, i) => `<button type="button" class="chip note${p.on ? ' on' : ''}${p.busy ? ' busy' : ''}" data-act="toggle-note" data-idx="${i}" title="${esc(p.t)}" ${p.busy ? 'disabled' : ''}>${p.busy ? '生成中… ' : ''}${esc(p.t)}</button>`).join('')
    : `<div class="tip" style="font-size:12px;color:#94A3B8">还没有考点：先填主题，再点「AI 生成考点」</div>`;
  return;
  const topic = currentTopic();
  if (!pointBuf.length) {
    const list = CHEM_TOPICS[topic] || [];
    if (list.length) pointBuf = list.map(t => ({ t, lv: 0 }));
  }
  if (!pointBuf.length) {
    box.innerHTML = `<div class="tip">${topic ? '没有内置考点，可点「AI 生成考点」，或直接在下面手写' : '先在上面填或选一个考点主题'}</div>`;
    return;
  }
  box.innerHTML = pointBuf.map((p, i) => {
    const lv = p.lv || 0;
    return `<button type="button" class="chip lv${lv}" data-act="toggle-point" data-idx="${i}">${esc(p.t)} · ${POINT_LV[lv]}</button>`;
  }).join('');
}

/* ---------------- 豆包 AI（可选，自带 Key） ---------------- */
const AI_KEY = 'doubao_ai_cfg_v1';
function aiCfg() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; } catch (_) { c = {}; }
  if (!Array.isArray(c.keys)) c.keys = c.key ? [c.key] : [];
  // 本机没填时，用内置配置
  const built = window.APP_AI;
  if (!c.keys.length && built && Array.isArray(built.keys) && built.keys.length) {
    c.keys = built.keys.slice();
    c.model = c.model || built.model || '';
    c.endpoint = c.endpoint || built.endpoint || '';
    c.builtin = true;
  }
  if (!c.model && built && built.model) c.model = built.model;
  return c;
}
function saveAiCfg(cfg) {
  try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch (_) { }
}
function aiReady() { const c = aiCfg(); return !!(c.keys && c.keys.length && c.model); }

const aiDetailCache = {};
let aiPreferred = { key: '', model: '' };  // 上次成功的组合，下次优先

async function aiChat(messages, opt) {
  opt = opt || {};
  const cfg = aiCfg();
  if (!cfg.keys.length || !cfg.model) throw new Error('未配置 API Key');
  const endpoint = cfg.endpoint || 'https://api.z.ai/api/paas/v4/chat/completions';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const codeMsg = (c) => c === 401 ? 'Key无效或未实名' : c === 403 ? '无权限' : c === 429 ? '模型繁忙' : c >= 500 ? '服务异常' : String(c);
  const models = opt.model ? [opt.model] : [cfg.model];
  if (!opt.model && cfg.model !== 'glm-4-flash') models.push('glm-4-flash');
  const keyOrder = cfg.keys.map((k, i) => i);
  if (aiPreferred.key) keyOrder.sort((a, b) => (cfg.keys[a] === aiPreferred.key ? -1 : 0) - (cfg.keys[b] === aiPreferred.key ? -1 : 0));
  if (!opt.model && aiPreferred.model) models.sort((a, b) => (b === aiPreferred.model ? 1 : 0) - (a === aiPreferred.model ? 1 : 0));
  const userAborted = () => !!(opt.signal && opt.signal.aborted);
  const errs = [];
  for (const i of keyOrder) {
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController();
        if (opt.signal) {
          if (opt.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          opt.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
        }
        const timer = setTimeout(() => ctrl.abort(), 25000);
        try {
          const body = {
            model,
            temperature: opt.temperature != null ? opt.temperature : 0.2,
            max_tokens: opt.model ? Math.min(opt.maxTokens || 900, 1024) : (opt.maxTokens || 900),
            messages,
          };
          // glm-4v-flash 等视觉模型不支持 thinking 参数，带上会返回 400
          if (!opt.model) body.thinking = { type: 'disabled' };
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.keys[i] },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1200 * (attempt + 1)); continue; }
            let detail = '';
            try {
              const eb = await res.json();
              detail = (eb && eb.error && (eb.error.message || eb.error.code)) || '';
            } catch (_) { }
            errs.push('Key' + (i + 1) + ':' + codeMsg(res.status) + (detail ? ' ' + String(detail).slice(0, 40) : ''));
            break;
          }
          const data = await res.json();
          const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
          if (!text) { errs.push('Key' + (i + 1) + ':空'); break; }
          aiPreferred = { key: cfg.keys[i], model };
          return { text, kIdx: i, model };
        } catch (e) {
          clearTimeout(timer);
          if (userAborted()) throw new Error('已停止');
          if (e.name === 'AbortError' && attempt < 2) { await sleep(800); continue; }
          errs.push('Key' + (i + 1) + ':' + (e.name === 'AbortError' ? '超时' : '网络/跨域')); break;
        }
      }
    }
  }
  throw new Error([...new Set(errs)].slice(0, 4).join(' / ') || '未知错误');
}

async function aiGeneratePoints() {
  const cfg = aiCfg();
  if (!cfg.keys.length || !cfg.model) return toast('请先在「数据与备份」里填 API Key 和模型');
  const topic = currentTopic();
  if (!topic) return toast('请先填写本节考点主题');
  const btn = document.querySelector('[data-act="ai-points"]');
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  try {
    const { text, kIdx } = await aiChat([
      { role: 'system', content: '你是初中/高中化学老师，只输出 JSON 数组，不要解释。' },
      { role: 'user', content: `请列出「${topic}」最常考的 6 个考点名称，每个 4–12 个字，简短、能直接当标签。只输出 JSON 字符串数组，例如 ["氧化还原本质","电子守恒配平"]。` },
    ], { maxTokens: 260, temperature: 0.3 });
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('格式异常');
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) throw new Error('返回为空');
    pointBuf = arr.slice(0, 8).map(t => ({ t: aiText(t).slice(0, 16), on: false, busy: false }));
    renderPointChips();
    prefetchPointDetails();
    toast('已生成 ' + pointBuf.length + ' 个考点（Key' + (kIdx + 1) + '），点选后自动写详细笔记');
  } catch (e) {
    const fallback = CHEM_TOPICS[topic] || [];
    if (fallback.length) {
      pointBuf = fallback.map(t => ({ t, on: false, busy: false }));
      renderPointChips();
      toast('AI 暂不可用（' + String(e.message || e).slice(0, 24) + '），已用内置考点');
    } else {
      toast('AI 暂不可用：' + String(e.message || e).slice(0, 40));
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'AI 生成考点'; }
}

function aiText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(aiText).filter(Boolean).join('；');
  if (typeof v === 'object') {
    for (const k of ['text', 'content', 'note', 'value', 'detail', 'key', 'point', 'desc', 'description']) {
      const t = aiText(v[k]);
      if (t) return t;
    }
    return Object.values(v).map(aiText).filter(Boolean).join('；');
  }
  return String(v);
}

const aiDetailInflight = {};

function aiDetailPromise(label) {
  if (aiDetailCache[label]) return Promise.resolve(aiDetailCache[label]);
  if (aiDetailInflight[label]) return aiDetailInflight[label];
  const task = (async () => {
    const { text } = await aiChat([
      { role: 'system', content: '你是资深初高中化学教师，讲解专业、准确，只输出 JSON。' },
      { role: 'user', content: `针对考点「${label}」，面向中学生写课堂笔记内容：\n1) key：完整讲解 180–220 字，须包含定义或原理、规律或公式、典型反应（写化学方程式）以及适用条件或实验现象；\n2) wrong：常见易错点 50–70 字，说明学生最容易错在哪、正确做法是什么。\n只输出 JSON：{"key":"…","wrong":"…"}` },
    ], { maxTokens: 900 });
    const m = text.match(/\{[\s\S]*\}/);
    let out = '';
    if (m) {
      try {
        const o = JSON.parse(m[0]);
        const k = aiText(o.key), w = aiText(o.wrong);
        out = [k && ('要点：' + k), w && ('易错：' + w)].filter(Boolean).join('；');
      } catch (_) { }
    }
    if (!out) out = String(text).replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s*\n+\s*/g, '；').slice(0, 400);
    aiDetailCache[label] = out;
    return out;
  })();
  aiDetailInflight[label] = task;
  task.catch(() => { }).then(() => { delete aiDetailInflight[label]; });
  return task;
}

/* 生成标签后后台并发预取详情，点选时基本秒出 */
function prefetchPointDetails() {
  const labels = pointBuf.map(p => p.t).filter(t => t && !aiDetailCache[t]);
  if (!labels.length) return;
  let idx = 0;
  const worker = async () => {
    while (idx < labels.length) {
      const t = labels[idx++];
      try { await aiDetailPromise(t); } catch (_) { }
    }
  };
  worker(); worker();
}

function formFeedback(f) {
  f = f || {};
  return `<input type="hidden" name="courseId" value="${esc(f.courseId || '')}">` +
    field('学生姓名', `<select name="sid">${studentOptions(f.sid)}</select>`) +
    `<div class="grid2">
      ${field('科目', combo('subject', f.subject, '化学', COMBO_SRC.subject()))}
      ${field('日期', input('date', f.date || today(), '', 'date'))}
    </div>` +
    field('本节考点', combo('topic', f.topic, '选过或输新的主题，再点 AI 生成', COMBO_SRC.topic()), '如 氧化还原反应 / 溶液与溶解度曲线') +
    field('考点选择', `<div class="row" style="justify-content:space-between;margin-bottom:6px">
      <span style="font-size:11.5px;color:#64748B">点一项写进课堂笔记；再点一次整行删掉</span>
      <button type="button" class="btn sm" data-act="ai-points">AI 生成考点</button>
    </div><div id="pointBox" class="chips"></div>`) +
    field('课堂笔记', `<div class="rt-tool">
        <button type="button" class="rt-btn" data-act="rt-bold"><b>B</b></button>
        <button type="button" class="rt-btn" data-act="rt-li">• 项目</button>
        <button type="button" class="rt-btn" data-act="rt-clear">清空</button>
      </div><div class="rt" id="notesEditor" contenteditable="true" data-ph="点 AI 生成考点，或手动写本节内容…"></div>
      <input type="hidden" name="notes" value="">`, '支持加粗、项目符号；手动改过也能按行删除考点') +
    field('课堂表现', input('performance', f.performance, '专注 / 积极提问 / 后半段走神')) +
    field('课后作业', textarea('homework', f.homework || f.task, '练习册 P32 1-5；默写 3 个方程式')) +
    field('进步点', input('progress', f.progress || f.good, '方程式配平正确率明显提高')) +
    field('需要加强点', input('weak', f.weak, '装置气密性检查的表述仍不完整')) +
    field('默写检查情况', input('dictation', f.dictation, '化学式默写 8/10，错 H₂CO₃、Fe(OH)₃')) +
    field('错题拍照', `<input type="file" name="photos" accept="image/*" multiple>
      <div class="tip">可拍多张，自动压缩后存在本机；没有就留空。</div>
      <div class="photos" id="photoPrev"></div>`) +
    field('评价', `<select name="rating">${['优秀', '良好', '待加强'].map(x => `<option ${f.rating === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`);
}
function feedbackText(f) {
  const st = studentById(f.sid);
  const photos = (f.photos || []).length;
  return `【${st ? st.name : '学生'} · ${f.subject || '化学'} 课堂反馈】
日期：${f.date || '—'}
课堂笔记：${htmlToNotes(f.notes || f.content || '') || '—'}
课堂表现：${f.performance || '—'}
课后作业：${f.homework || f.task || '—'}
进步点：${f.progress || f.good || '—'}
需要加强点：${f.weak || '—'}
默写检查情况：${f.dictation || '—'}${f.topic ? `\n本节考点：${f.topic}` : ''}${(f.points || []).length ? `\n考点掌握：${f.points.map(p => `${p.t}（${['不会', '半会', '会'][p.lv]}）`).join('、')}` : ''}${photos ? `\n（错题照片 ${photos} 张，随消息发送）` : ''}
—— 车老师`;
}

/* 分享/保存错题照片 */
function dataUrlToFile(dataUrl, name) {
  const parts = String(dataUrl).split(',');
  const mime = (parts[0].match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
  const bin = atob(parts[1] || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
async function shareFeedback(f) {
  const text = feedbackText(f);
  const photos = f.photos || [];
  const files = [];
  for (let i = 0; i < photos.length; i++) {
    try { files.push(await photoToFile(photos[i], `${studentName(f.sid)}_错题${i + 1}.jpg`)); } catch (_) { }
  }
  if (files.length && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ text, files }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(text, '文字已复制；照片请用「下载照片」后一起发送');
  if (files.length) downloadPhotos(f);
}
async function downloadPhotos(f) {
  const photos = f.photos || [];
  if (hasNative() && typeof NATIVE.saveToGallery === 'function') {
    let ok = 0, share = 0, legacy = 0;
    for (const p of photos) {
      if (typeof p === 'string' && p.indexOf('data:') === 0) { legacy++; continue; }
      const r = String(NATIVE.saveToGallery(p) || '');
      if (r === 'OK') ok++; else if (r === 'SHARE') share++;
    }
    if (ok) return toast(`已保存 ${ok} 张到相册「Pictures/教育工作台」`);
    if (share) return toast('系统版本较低，请用「分享(含照片)」保存');
    if (legacy) return toast('旧格式照片请用「分享(含照片)」保存');
    return toast('没有可保存的照片');
  }
  for (let i = 0; i < photos.length; i++) {
    try {
      const p = photos[i];
      const isData = typeof p === 'string' && p.indexOf('data:') === 0;
      const href = isData ? p : URL.createObjectURL(await (await fetch(photoURL(p))).blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = `${studentName(f.sid)}_错题${i + 1}.jpg`;
      a.click();
      if (!isData) setTimeout(() => URL.revokeObjectURL(href), 1500);
    } catch (_) { }
  }
  toast('照片已下载到相册/下载目录');
}
/* ---------------- 富文本笔记 + 考点选择 ---------------- */
function noteEditor() { return document.getElementById('notesEditor'); }
function elText(el) { return el ? (el.innerText != null ? el.innerText : el.textContent) : ''; }
function noteEls() { const ed = noteEditor(); return ed ? [...ed.querySelectorAll('.nli')] : []; }
function syncNotes() {
  const ed = noteEditor();
  const hidden = document.querySelector('#modal [name=notes]');
  if (ed && hidden) hidden.value = ed.innerHTML;
}
function renderNotesEditor(notes) {
  const ed = noteEditor(); if (!ed) return;
  const raw = String(notes || '');
  ed.innerHTML = /<[a-z][\s\S]*>/i.test(raw)
    ? raw
    : raw.split('\n').filter(l => l.trim()).map(l => `<div>${esc(l)}</div>`).join('');
  pointBuf.forEach(p => { p.on = noteEls().some(el => el.dataset.tag === p.t || elText(el).includes(p.t)); });
  syncNotes();
  renderPointChips();
}
async function toggleNotePoint(i) {
  const p = pointBuf[i]; const ed = noteEditor();
  if (!p || !ed || p.busy) return;
  const pick = (el) => el.dataset.tag === p.t || elText(el).includes(p.t);
  if (p.on) {
    p.on = false;
    noteEls().filter(pick).forEach(el => el.remove());
    syncNotes(); renderPointChips();
    return;
  }
  p.on = true; p.busy = true;
  renderPointChips();
  const el = document.createElement('div');
  el.className = 'nli';
  el.dataset.tag = p.t;
  el.textContent = `${p.t}：生成中…`;
  ed.appendChild(el);
  syncNotes();
  try {
    const detail = await aiDetailPromise(p.t);
    el.textContent = `${p.t}｜${detail}`;
  } catch (e) {
    el.textContent = p.t;
    toast('要点生成失败（' + String(e.message || e).slice(0, 24) + '），可稍后再点');
  }
  p.busy = false;
  syncNotes(); renderPointChips();
}

function addBulletLine() {
  const ed = noteEditor(); if (!ed) return;
  const d = document.createElement('div');
  d.className = 'nli'; d.innerHTML = '<br>';
  ed.appendChild(d);
  const r = document.createRange(); r.selectNodeContents(d); r.collapse(true);
  const sel = window.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(r); }
  ed.focus(); syncNotes();
}
function htmlToNotes(html) {
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  const items = [...box.querySelectorAll('.nli')].map(el => '• ' + elText(el).replace(/\s+/g, ' ').trim());
  const rest = [...box.childNodes]
    .filter(n => !(n.nodeType === 1 && n.classList && n.classList.contains('nli')))
    .map(n => elText(n).trim()).filter(Boolean);
  const out = [...items, ...rest].join('\n').trim();
  return out || elText(box).trim();
}

/* ---------------- 规划 ---------------- */
let plSid = '';
function viewPlans() {
  let list = S.plans.slice();
  if (plSid) list = list.filter(p => p.sid === plSid);
  return `
    <div class="searchbar">
      <select id="plSid"><option value="">全部学生</option>
        ${S.students.map(s => `<option value="${s.id}" ${s.id === plSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="section-title"><h2>共 ${list.length} 个规划</h2>${pageActions('plans','add-plan','＋ 创建规划')}</div>
    ${list.map(p => {
    const tasks = p.tasks || [];
    const done = tasks.filter(t => t.done).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    return `<div class="card">
        <div class="row"><strong>${esc(studentName(p.sid))}</strong><span class="tag">${esc(p.subject || '')}</span>
          <span class="spacer"></span><span class="meta">${esc(p.end || '')}</span></div>
        <div class="meta" style="margin-top:4px">${esc(p.goal || '')}</div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="meta">${done}/${tasks.length} 完成 · ${pct}%</div>
        <div>${tasks.map((t, i) => `<label class="task">
          <input type="checkbox" data-act="toggle-task" data-pid="${p.id}" data-idx="${i}" ${t.done ? 'checked' : ''}>
          <span class="${t.done ? 'done' : ''}">${esc(t.t)}</span></label>`).join('')}</div>
        <div class="btns">
          <button class="btn sm" data-act="add-task" data-id="${p.id}">＋ 加任务</button>
          <button class="btn sm" data-act="edit-plan" data-id="${p.id}">编辑</button>
          <button class="btn sm danger" data-act="del-plan" data-id="${p.id}">删除</button>
        </div>
      </div>`;
  }).join('') || `<div class="empty">还没有学习规划</div>`}
  `;
}
function formPlan(p) {
  p = p || {};
  const tasksText = (p.tasks || []).map(t => t.t).join('\n');
  return field('学生', `<select name="sid">${studentOptions(p.sid)}</select>`) +
    `<div class="grid2">
      ${field('科目', combo('subject', p.subject, '化学', COMBO_SRC.subject()))}
      ${field('结束日期', input('end', p.end, '', 'date'))}
    </div>` +
    field('阶段目标', input('goal', p.goal, '掌握几何证明…')) +
    field('任务清单（每行一条）', `<textarea name="tasks">${esc(tasksText)}</textarea>`, '每天 2 道计算题\n每周一次错题回顾');
}

/* ---------------- 课程管理 ---------------- */
const COURSE_SUBJECTS = ['化学', '数学', '物理', '英语', '语文', '生物', '历史', '地理', '政治'];
const DEFAULT_TIMES = { start: '08:00', end: '17:00' };
const TEACHER_NAME = '车老师---车金露';
let curCourse = '';
let coursePick = null; // Set<sid>：导出勾选，默认全选

function classOf(s) { return (s && String(s.cls || '').trim()) || '未分班'; }
function courseById(id) { return S.courses.find(c => c.id === id); }
function courseStudents(c) { return ((c && c.sids) || []).map(id => studentById(id)).filter(Boolean); }
function courseFb(cid, sid) {
  const list = S.feedbacks.filter(f => f.courseId === cid && f.sid === sid);
  return list[list.length - 1] || null;
}
function fmtCn(dateStr) {
  if (!dateStr) return '____ 年 __ 月 __ 日';
  const p = String(dateStr).split('-');
  return p.length === 3 ? `${+p[0]} 年 ${+p[1]} 月 ${+p[2]} 日` : dateStr;
}
function groupByClass(students) {
  const g = {};
  students.forEach(s => { const k = classOf(s); (g[k] = g[k] || []).push(s); });
  return g;
}

function viewCourses() {
  if (curCourse && courseById(curCourse)) return viewCourseDetail(courseById(curCourse));
  curCourse = '';
  const list = S.courses.slice().sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.created || '').localeCompare(String(a.created || '')));
  return `
    <div class="notice" style="margin-bottom:12px">先建课程、勾选学生；课后点进课程逐个写反馈，最后导出反馈表。</div>
    <div class="section-title"><h2>共 ${list.length} 个课程</h2>
      <div class="row" style="gap:8px"><button class="btn sm primary" data-act="add-course">＋ 新建课程</button></div>
    </div>
    ${list.map(c => {
    const total = (c.sids || []).length;
    const done = (c.sids || []).filter(sid => courseFb(c.id, sid)).length;
    return `<div class="card">
        <div class="row"><span class="course-emoji">🎒</span><strong>${esc(c.name)}</strong>
          <span class="tag">${esc(c.subject || '化学')}</span><span class="spacer"></span>
          <span class="meta">${esc(c.date || '')}</span></div>
        <div class="meta" style="margin-top:4px">${esc(c.start || DEFAULT_TIMES.start)}–${esc(c.end || DEFAULT_TIMES.end)} · ${total} 名学生 · 已写反馈 ${done}/${total}</div>
        ${c.note ? `<div class="meta">${esc(c.note)}</div>` : ''}
        <div class="btns">
          <button class="btn sm primary" data-act="open-course" data-id="${c.id}">进入课程</button>
          <button class="btn sm" data-act="export-course" data-id="${c.id}">导出反馈表</button>
          <button class="btn sm" data-act="edit-course" data-id="${c.id}">编辑</button>
          <button class="btn sm danger" data-act="del-course" data-id="${c.id}">删除</button>
        </div>
      </div>`;
  }).join('') || `<div class="empty">还没有课程，点「＋ 新建课程」开始</div>`}`;
}

function viewCourseDetail(c) {
  const stus = courseStudents(c);
  if (!coursePick || coursePick._cid !== c.id) { coursePick = new Set(c.sids || []); coursePick._cid = c.id; }
  const groups = groupByClass(stus);
  return `
    <div class="course-head">
      <button class="btn sm" data-act="back-courses">← 返回</button>
      <strong style="font-size:16px">${esc(c.name)}</strong>
      <span class="tag">${esc(c.subject || '化学')}</span>
    </div>
    <div class="meta" style="margin:6px 2px 12px">${esc(c.date || '')} · ${esc(c.start || DEFAULT_TIMES.start)}–${esc(c.end || DEFAULT_TIMES.end)} · ${stus.length} 名学生</div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">导出范围</h3>
        <div class="row" style="gap:6px">
          <button class="btn sm" data-act="pick-all">全选</button>
          <button class="btn sm" data-act="pick-none">全不选</button>
        </div>
      </div>
      <div class="tip" style="margin:6px 0;font-size:12px;color:#64748B">默认全部学生；取消勾选可不导出该学生。按班级自动分 sheet。</div>
      ${Object.keys(groups).sort().map(cls => `<div class="pick-group">${esc(cls)}</div>` +
      groups[cls].map(s => `<label class="pick-row">
          <input type="checkbox" data-act="pick-sid" data-sid="${s.id}" ${coursePick.has(s.id) ? 'checked' : ''}>
          <span>${esc(s.name)}</span><span class="meta">${esc(classOf(s))}${courseFb(c.id, s.id) ? ' · 已反馈' : ''}</span>
        </label>`).join('')).join('')}
      <div class="btns" style="margin-top:10px">
        <button class="btn primary block" data-act="export-course-now" data-id="${c.id}">导出反馈表（已选 ${coursePick.size} 人）</button>
      </div>
    </div>
    <div class="section-title"><h2>逐个学生写反馈</h2><div class="meta">共 ${stus.length} 人</div></div>
    ${stus.map(s => {
    const f = courseFb(c.id, s.id);
    return `<div class="card">
        <div class="row"><strong>${esc(s.name)}</strong><span class="tag">${esc(classOf(s))}</span>
          <span class="spacer"></span>${f ? `<span class="badge done">已反馈</span>` : `<span class="badge">待反馈</span>`}</div>
        ${f ? `<div class="meta" style="margin-top:4px">课堂表现：${esc(f.performance || '—')}${f.progress ? ` · 进步点：${esc(f.progress)}` : ''}${(f.photos || []).length ? ` · 错题照片 ${(f.photos || []).length} 张` : ''}</div>` : ''}
        <div class="btns">
          <button class="btn sm primary" data-act="course-feedback" data-id="${c.id}" data-sid="${s.id}">${f ? '编辑反馈' : '写反馈'}</button>
          ${(f && (f.photos || []).length) ? `<button class="btn sm" data-act="dl-photos" data-id="${f.id}">下载错题照片</button>` : ''}
        </div>
      </div>`;
  }).join('') || `<div class="empty">这个课程还没选学生</div>`}`;
}

function formCourse(c) {
  c = c || {};
  const sids = new Set(c.sids || []);
  const groups = groupByClass(S.students);
  const pickList = Object.keys(groups).sort().map(cls => `<div class="pick-group">${esc(cls)}</div>` +
    groups[cls].map(s => `<label class="pick-row" data-pick-row data-kw="${esc((s.name + ' ' + classOf(s) + ' ' + (s.school || '')).toLowerCase())}">
      <input type="checkbox" name="courseSids" value="${s.id}" ${sids.has(s.id) ? 'checked' : ''}>
      <span>${esc(s.name)}</span><span class="meta">${esc(classOf(s))}</span>
    </label>`).join('')).join('');
  return field('课程名称', input('name', c.name, '如 九慧1班 周三晚辅')) +
    `<div class="grid2">
      ${field('科目', `<select name="subject">${COURSE_SUBJECTS.map(x => `<option ${c.subject === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
      ${field('日期', input('date', c.date || today(), '', 'date'))}
    </div>
    <div class="grid2">
      ${field('开始时间', input('start', c.start || DEFAULT_TIMES.start, '', 'time'))}
      ${field('结束时间', input('end', c.end || DEFAULT_TIMES.end, '', 'time'))}
    </div>
    ${field('备注', textarea('note', c.note, '本节进度、注意事项…'))}
    ${field('选择学生', `<input id="pickQ" placeholder="搜索姓名 / 班级" oninput="filterPick(this.value)" autocomplete="off">
      <div class="pick-list" id="pickList">${pickList || '<div class="empty">还没有学生，先去学生管理添加</div>'}</div>`, '勾选本次课参加的学生')}`;
}
function filterPick(q) {
  q = String(q || '').trim().toLowerCase();
  document.querySelectorAll('#pickList [data-pick-row]').forEach(r => {
    r.style.display = (!q || (r.dataset.kw || '').indexOf(q) > -1) ? '' : 'none';
  });
}

function saveCourse(o, id) {
  if (!o.name) return toast('请填课程名称');
  const sids = [...document.getElementById('modal').querySelectorAll('input[name="courseSids"]:checked')].map(x => x.value);
  if (!sids.length) return toast('至少勾选一个学生');
  const data = {
    name: o.name.trim(), subject: o.subject || '化学', date: o.date || today(),
    start: o.start || DEFAULT_TIMES.start, end: o.end || DEFAULT_TIMES.end,
    note: o.note || '', sids,
  };
  if (id) Object.assign(courseById(id), data);
  else {
    const nid = uid();
    S.courses.push({ id: nid, created: Date.now(), ...data });
    curCourse = nid;
  }
  saveKey('courses'); closeModal(); render(); toast('已保存');
}

function openCourseFeedback(cid, sid) {
  const c = courseById(cid); if (!c) return;
  const old = courseFb(cid, sid);
  photoBuf = (old && old.photos) ? old.photos.slice() : [];
  initPoints(old || { topic: '' });
  if (old && (old.points || []).length) pointBuf = old.points.slice();
  openModal(`写反馈 · ${studentName(sid)}`, formFeedback({ sid, courseId: cid, date: c.date, subject: c.subject, ...(old || {}) }),
    '保存', f => saveFeedback(formData(f), old ? old.id : null));
  renderPhotoPrev(); renderPointChips(); renderNotesEditor(old ? (old.notes || old.content) : '');
}

/* ---------------- 课后反馈表（模板导出） ---------------- */
const TPL_WIDTHS = [6.7, 12.7, 10.7, 15.7, 30.7, 30.7, 16.7, 15.7];
const TPL_HEADERS = ['编号', '学生姓名', '课堂表现', '课后作业订正', '进步点', '需要加强的点', '默写检查情况', '备注'];
const TPL_GUIDE = '填写说明：① 课堂表现按 1–5 星评分；② 课后作业订正填“全部完成 / 部分完成 / 未完成”，并注明未订正题号；③ 进步点与需加强的点各写 1–2 句具体、可观察的事实；④ 默写检查记录错处（如“化学式错 2 处”“未参加”）。';

function pointsBrief(f) {
  return (f.points || []).map(p => `${p.t}（${['不会', '半会', '会'][p.lv]}）`).join('；');
}
function tplSheet(cls, subtitle, students, fbOf) {
  const rows = [
    [],
    [{ v: '智汇尚学 · 课后学情反馈表', s: 2 }],
    [{ v: `班级：${cls}     课次：第 ______ 次课`, s: 0 }, '', '', '', { v: subtitle, s: 0 }],
    TPL_HEADERS.map(v => ({ v, s: 1 })),
  ];
  students.forEach((s, i) => {
    const f = fbOf(s) || {};
    rows.push([
      { v: i + 1, s: 4 }, { v: s.name, s: 4 },
      { v: f.performance || '', s: 0 },
      { v: f.homework || f.task || '', s: 0 },
      { v: f.progress || f.good || '', s: 0 },
      { v: f.weak || '', s: 0 },
      { v: f.dictation || '', s: 0 },
      { v: htmlToNotes(f.notes || f.content || ''), s: 0 },
    ]);
  });
  rows.push([{ v: TPL_GUIDE, s: 3 }]);
  return {
    name: cls, rows, widths: TPL_WIDTHS, heights: [8, 26, 20, 22],
    merges: ['A2:H2', 'A3:D3', 'E3:H3', `A${rows.length}:H${rows.length}`],
  };
}
function fileSafe(x) { return String(x == null ? '' : x).replace(/[\\/:*?"<>|]/g, '').trim(); }
function courseTitle(c) {
  let t = String((c && c.name) || '课程');
  const known = [...new Set(S.students.map(s => String(s.cls || '').trim()).filter(Boolean))]
    .sort((x, y) => y.length - x.length);
  known.forEach(k => { t = t.split(k).join(' '); });
  return t.replace(/[\s\-_·]+/g, ' ').trim() || '课程';
}

function exportCourse(cid, onlySids) {
  const c = courseById(cid); if (!c) return;
  const sids = (onlySids && onlySids.length) ? onlySids : (c.sids || []);
  if (!sids.length) return toast('没有可导出的学生');
  const groups = groupByClass(sids.map(studentById).filter(Boolean));
  const sheets = Object.keys(groups).sort().map(cls => tplSheet(
    cls, `上课日期：${fmtCn(c.date)}     授课教师：${TEACHER_NAME}`, groups[cls], s => courseFb(cid, s.id)));
  if (!sheets.length) return toast('没有可导出的学生');
  downloadBlob(`${fileSafe(c.date)}_${fileSafe(courseTitle(c))}_课后反馈表.xlsx`, xlsxSheets(sheets));
  toast(`已导出 ${sheets.length} 个班`);
}

function exportRoster() {
  if (!S.students.length) return toast('还没有学生');
  const groups = groupByClass(S.students);
  const sheets = Object.keys(groups).sort().map(cls => tplSheet(
    cls, `上课日期：____ 年 __ 月 __ 日     授课教师：${TEACHER_NAME}`, groups[cls], () => null));
  downloadBlob(`学生名单_${today()}.xlsx`, xlsxSheets(sheets));
  toast('已导出学生名单');
}

/* 多工作簿导出（模板样式） */
function sheetXmlTpl(sp) {
  const rows = sp.rows || [];
  const cols = sp.widths && sp.widths.length
    ? `<cols>${sp.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, ri) => {
    const cells = (row || []).map((c, ci) => {
      const ref = colName(ci) + (ri + 1);
      const isObj = c && typeof c === 'object';
      const st = isObj ? (c.s || 0) : 0;
      const v = isObj ? c.v : c;
      const sAttr = st ? ` s="${st}"` : '';
      if (v == null || v === '') return `<c r="${ref}"${sAttr}/>`;
      if (typeof v === 'number') return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('');
    const h = sp.heights && sp.heights[ri] ? ` ht="${sp.heights[ri]}" customHeight="1"` : '';
    return `<row r="${ri + 1}"${h}>${cells}</row>`;
  }).join('');
  const merges = (sp.merges || []).length
    ? `<mergeCells count="${sp.merges.length}">${sp.merges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XLSX_NS}"><sheetData>${body}</sheetData>${merges}${cols}</worksheet>`;
}
function cleanSheetName(n, i) {
  let s = String(n || ('表' + (i + 1))).replace(/[\\/?*\[\]:]/g, '').slice(0, 31);
  return s || ('表' + (i + 1));
}
function xlsxSheets(sheets) {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XLSX_NS}">
<fonts count="4"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="14"/><name val="Microsoft YaHei"/></font><font><sz val="10.5"/><color rgb="FF64748B"/><name val="Microsoft YaHei"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F4F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB7C9CE"/></left><right style="thin"><color rgb="FFB7C9CE"/></right><top style="thin"><color rgb="FFB7C9CE"/></top><bottom style="thin"><color rgb="FFB7C9CE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const ctOverrides = sheets.map((sp, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map((sp, i) => `<sheet name="${xmlEsc(cleanSheetName(sp.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const rels = sheets.map((sp, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>`;

  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ctOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${XLSX_NS}" xmlns:r="${REL_NS}"><sheets>${sheetTags}</sheets></workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
    },
    { name: 'xl/styles.xml', data: styles },
    ...sheets.map((sp, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXmlTpl(sp) })),
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* 网页版：生成打印页，浏览器「另存为 PDF」 */
function exportPdfWeb(sid) {
  const st = studentById(sid);
  if (!st) return;
  const list = S.feedbacks.filter(f => f.sid === sid)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const items = list.map((f, i) => {
    const rows = [
      ['课堂表现', f.performance],
      ['课后作业', f.homework || f.task],
      ['进步点', f.progress || f.good],
      ['需要加强', f.weak],
      ['默写检查', f.dictation],
    ].filter(x => x[1]);
    const notes = htmlToNotes(f.notes || f.content || '');
    const photos = (f.photos || []).map(p => `<img src="${photoURL(p)}" alt="错题">`).join('');
    return `<section>
      <h2>反馈 ${i + 1} &nbsp; ${esc(f.date || '')} &nbsp; ${esc(f.subject || '化学')}</h2>
      ${f.topic ? `<p><b>考点：</b>${esc(f.topic)}</p>` : ''}
      ${rows.map(r => `<p><b>${r[0]}：</b>${esc(r[1])}</p>`).join('')}
      ${notes ? `<p><b>课堂笔记：</b><br>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${photos ? `<div class="photos">${photos}</div>` : ''}
    </section>`;
  }).join('') || '<p>还没有反馈记录</p>';

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(st.name)}_课堂反馈_${today()}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#334155;margin:28px 26px;font-size:13px;line-height:1.8}
  h1{font-size:19px;color:#028090;margin:0 0 6px}
  .sub{color:#64748B;font-size:12px;margin:0 0 14px;border-bottom:1px solid #E2E8F0;padding-bottom:10px}
  section{margin:0 0 16px;page-break-inside:avoid}
  h2{font-size:14px;color:#0F172A;margin:0 0 6px}
  p{margin:2px 0}
  b{color:#028090}
  .photos{margin-top:6px;display:flex;flex-direction:column;gap:8px}
  .photos img{width:100%;max-height:240px;object-fit:contain;border:1px solid #E2E8F0;border-radius:6px}
  @media print{body{margin:10mm} section{page-break-inside:avoid} img{page-break-inside:avoid}}
</style></head><body>
<h1>车老师 · 学生课堂反馈</h1>
<p class="sub">${esc(st.name)} &nbsp; ${esc(classOf(st))} &nbsp; 导出日期：${today()} &nbsp; 共 ${list.length} 条反馈</p>
${items}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},350)});<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return toast('浏览器拦截了弹窗，请允许弹窗后重试');
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/* ---------------- AI 助手（白名单动作，仅本机数据） ---------------- */
const AI_SESSIONS_KEY = 'ai_sessions_v1';
const AI_CHAT_KEY = 'ai_assistant_chat_v1';   // 旧版单会话，用于升级迁移
const AI_COLUMNS = {
  students: ['姓名', '班级', '年级', '学校', '状态', '家长', '电话', '备注'],
  courses: ['日期', '课程', '科目', '开始', '结束', '学生数', '已反馈', '备注'],
  feedbacks: ['日期', '学生', '班级', '科目', '评价', '考点', '课堂表现', '进步点', '需加强', '默写'],
};
const AI_MAX_SESSIONS = 20;
const AI_MAX_MSGS = 30;
let aiSessions = [];
let aiActive = '';
let aiLog = [];
let aiBusy = false;
let aiAbort = null;
let aiAttach = null;   // {kind:'image'|'text', dataUrl?, text?, name}

function aiSessionNew() {
  return { id: 's_' + Date.now() + '_' + Math.floor(Math.random() * 900 + 100), title: '新对话', created: Date.now(), updated: Date.now(), msgs: [] };
}
function aiCur() { return aiSessions.find(x => x.id === aiActive) || null; }
function aiTitleOf(msgs) {
  const m = (msgs || []).find(x => x.role === 'u');
  const t = m ? String(m.text).split('\n')[0].replace(/\s+/g, ' ').slice(0, 18) : '';
  return t || '新对话';
}
function loadAiLog() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(AI_SESSIONS_KEY) || '[]'); } catch (_) { arr = []; }
  aiSessions = (Array.isArray(arr) ? arr : []).filter(x => x && Array.isArray(x.msgs));
  if (!aiSessions.length) {
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(AI_CHAT_KEY) || '[]'); } catch (_) { legacy = []; }
    const s = aiSessionNew();
    if (Array.isArray(legacy) && legacy.length) { s.msgs = legacy.slice(-AI_MAX_MSGS); s.title = aiTitleOf(legacy); }
    aiSessions = [s];
  }
  if (!aiActive || !aiSessions.some(x => x.id === aiActive)) {
    const sorted = aiSessions.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    aiActive = sorted[0].id;
  }
  aiLog = aiCur().msgs;
}
function saveAiLog() {
  const s = aiCur();
  if (!s) return;
  s.msgs = aiLog.slice(-AI_MAX_MSGS);
  s.updated = Date.now();
  s.title = aiTitleOf(s.msgs);
  aiSessions.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  while (aiSessions.length > AI_MAX_SESSIONS) aiSessions.pop();
  try { localStorage.setItem(AI_SESSIONS_KEY, JSON.stringify(aiSessions)); } catch (_) { }
}
function aiSwitchSession(id) {
  if (!aiSessions.some(x => x.id === id)) return;
  aiActive = id;
  aiLog = aiCur().msgs;
  aiAttach = null;
  render();
}

function aiSnapshot(question) {
  const stu = S.students.slice(0, 40).map(st => {
    const x = studentStats(st.id);
    return {
      姓名: st.name, 班级: classOf(st), 状态: st.status || '', 课次: x.courses,
      反馈数: x.fbs, 均分: x.avg ? +x.avg.toFixed(2) : null, 最近上课: x.lastCourse || '',
    };
  });
  const courses = S.courses.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 20)
    .map(c => ({
      日期: c.date || '', 课程: courseTitle(c), 科目: c.subject || '', 学生数: (c.sids || []).length,
      已反馈: (c.sids || []).filter(sid => courseFb(c.id, sid)).length,
    }));
  const fbs = S.feedbacks.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 15)
    .map(f => ({
      日期: f.date || '', 学生: studentName(f.sid), 评价: f.rating || '',
      考点: String(f.topic || '').slice(0, 20), 需加强: String(f.weak || '').slice(0, 30),
    }));
  const q = String(question || '');
  const hit = S.students.filter(st => q.includes(st.name)).slice(0, 3);
  const detail = hit.map(st => {
    const x = studentStats(st.id);
    const list = S.feedbacks.filter(f => f.sid === st.id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 15)
      .map(f => ({
        日期: f.date || '', 科目: f.subject || '', 评价: f.rating || '', 考点: f.topic || '',
        课堂表现: f.performance || '', 课后作业: f.homework || f.task || '',
        进步点: f.progress || f.good || '', 需加强: f.weak || '', 默写: f.dictation || '',
        笔记: htmlToNotes(f.notes || f.content || '').replace(/\s+/g, ' ').slice(0, 100),
      }));
    return {
      姓名: st.name, 班级: classOf(st), 年级: st.grade || '', 学校: st.school || '', 状态: st.status || '',
      课次: x.courses, 反馈数: x.fbs, 平均评价: x.avg ? +x.avg.toFixed(2) : null,
      最近上课: x.lastCourse || '', 反馈记录: list,
    };
  });
  return { 学生: stu, 最近课程: courses, 最近反馈: fbs, 命中的学生详情: detail };
}

function aiSystemPrompt() {
  return [
    '你是「教育工作台」App 内置助手。你只能通过白名单动作读写本机数据，不能执行任意代码，也不能访问外部系统。',
    '可用动作：',
    '1) {"type":"none"} 只回答问题/分析数据。',
    '2) {"type":"create_course","args":{"name":"课程名","subject":"化学","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","students":["姓名",...]}} 新建课程（系统会先请用户确认）。',
    '3) {"type":"create_student","args":{"name":"姓名","cls":"班级（如 高二1班）","grade":"年级（可选）","school":"学校（可选）","phone":"手机号（可选，不校验格式）","status":"在读/已结课（可选）","note":"备注（可选）"}} 新建学生（系统先请用户确认，并自动查重）。',
    '4) {"type":"export","args":{"name":"文件名(不含扩展名)","source":"students|courses|feedbacks","columns":["列名"...],"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}} 导出定制 CSV 到下载历史。',
    '导出列必须在白名单内：',
    JSON.stringify(AI_COLUMNS),
    '硬性规则（必须遵守）：',
    '- 只能使用快照里出现的数据，禁止编造任何姓名、日期、分数、评价或事件。',
    '- 某个字段在快照里为空，就写「未记录」，不要猜。',
    '- 做学生报表时，必须写清数据范围（如「基于 2026-10-01 ~ 2026-11-03 的 6 条反馈」）和总课次。',
    '- 如果快照里没有用户问的学生，回答「没有找到该学生」并列出快照里最接近的几个姓名；不要虚构。',
    '- 回答用中文，结论在前、依据在后；数据不足就说不足；结尾给一条可执行建议。',
    '- 重要：任何新增/修改必须通过 action 返回，由系统弹出确认卡；严禁在 reply 里直接说「已添加」「已创建」「已保存」等完成语句（除非本轮 action 已执行）。',
    '输出格式必须严格为单个 JSON 对象：{"reply":"给用户看的文字","action":{"type":"none"}}。不要输出 JSON 以外的任何内容。',
  ].join('\n');
}

function aiParse(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const o = JSON.parse(t.slice(a, b + 1));
      return { reply: String(o.reply || ''), action: o.action || { type: 'none' } };
    } catch (_) { }
  }
  return { reply: t, action: { type: 'none' } };
}

async function aiRun(text, signal, imageDataUrl) {
  const history = aiLog.filter(m => m.role !== 'sys').slice(-6).map(m => ({
    role: m.role === 'u' ? 'user' : 'assistant', content: m.text,
  }));
  const messages = [
    { role: 'system', content: aiSystemPrompt() },
    { role: 'system', content: '当前数据快照（JSON）：' + JSON.stringify(aiSnapshot(text)) },
    ...history,
    imageDataUrl
      ? { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }] }
      : { role: 'user', content: text },
  ];
  const r = await aiChat(messages, {
    temperature: 0.1, maxTokens: 1200, signal,
    model: imageDataUrl ? 'glm-4v-flash' : '',
  });
  return aiParse(r.text);
}

function aiScrollBottom() {
  const c = document.getElementById('aiChat');
  if (c) c.scrollTop = c.scrollHeight;
}

function aiPrettyUser(t) {
  let x = String(t || '');
  const i = x.indexOf('】');
  if (i > 0 && x.indexOf('【文件') >= 0) x = x.slice(0, i + 1) + '\n[文件内容已折叠]';
  if (x.length > 240) x = x.slice(0, 240) + '\n…（已省略）';
  return x;
}

function aiRenderMsgs() {
  return aiLog.map((m, i) => {
    if (m.role === 'u') return `<div class="ai-b ai-b-u">${esc(aiPrettyUser(m.text)).replace(/\n/g, '<br>')}</div>`;
    let extra = '';
    if (m.action && m.action.type === 'create_student' && m.status === 'pending') {
      const a = m.action.args || {};
      return `<div class="ai-b ai-b-a">${esc(m.text).replace(/\n/g, '<br>')}
      <div class="ai-confirm">
        <div class="ai-confirm-t">将新建学生（可直接修改）</div>
        <div class="ai-edit">
          <label>姓名<input data-f="name" value="${esc(a.name || '')}"></label>
          <label>班级<input data-f="cls" value="${esc(a.cls || '')}" placeholder="如 高二1班"></label>
          <label>年级<input data-f="grade" value="${esc(a.grade || '')}"></label>
          <label>学校<input data-f="school" value="${esc(a.school || '')}"></label>
          <label>手机<input data-f="phone" value="${esc(a.phone || '')}"></label>
          <label>备注<input data-f="note" value="${esc(a.note || '')}"></label>
        </div>
        <div class="ai-confirm-d">${esc(a.name || '')} · ${esc(a.cls || '未填班级')} · ${esc(a.grade || '')}<br>${esc(a.school || '')} ${esc(a.phone ? '· ' + a.phone : '')}</div>
        <div class="btns"><button class="btn sm primary" data-act="ai-confirm" data-idx="${i}">确认添加</button>
        <button class="btn sm" data-act="ai-cancel" data-idx="${i}">取消</button></div>
      </div></div>`;
    }
    if (m.action && m.action.type === 'create_course' && m.status === 'pending') {
      const a = m.action.args || {};
      extra = `<div class="ai-confirm">
        <div class="ai-confirm-t">将新建课程（可直接修改）</div>
        <div class="ai-edit">
          <label>课程名<input data-f="name" value="${esc(a.name || '')}"></label>
          <label>科目<input data-f="subject" value="${esc(a.subject || '化学')}"></label>
          <label>日期<input data-f="date" type="date" value="${esc(a.date || '')}"></label>
          <label>开始<input data-f="start" value="${esc(a.start || '')}" placeholder="HH:mm"></label>
          <label>结束<input data-f="end" value="${esc(a.end || '')}" placeholder="HH:mm"></label>
          <label class="wide">学生<input data-f="students" value="${esc((a.students || []).join('、'))}" placeholder="多人用、分隔"></label>
        </div>
        <div class="ai-confirm-d">${esc(a.name || '')} · ${esc(a.subject || '化学')} · ${esc(a.date || '')} ${esc(a.start || '')}-${esc(a.end || '')}<br>学生：${esc((a.students || []).join('、') || '')}</div>
        <div class="btns"><button class="btn sm primary" data-act="ai-confirm" data-idx="${i}">确认创建</button>
        <button class="btn sm" data-act="ai-cancel" data-idx="${i}">取消</button></div>
      </div>`;
    }
    return `<div class="ai-b ai-b-a">${esc(m.text).replace(/\n/g, '<br>')}${extra}</div>`;
  }).join('');
}

function viewAi() {
  loadAiLog();
  return `
    <div class="card ai-card">
      <div class="ai-head">
        <h3 style="margin:0">🤖 AI 助手 <span class="tag gray">本机数据</span></h3>
        <div class="ai-head-btns">
          <button class="btn sm" data-act="ai-new">新开对话</button>
          <button class="btn sm danger" data-act="ai-del">删除对话</button>
        </div>
      </div>
      <div class="ai-sess">
        <select id="aiSession">
          ${aiSessions.map(s => `<option value="${s.id}" ${s.id === aiActive ? 'selected' : ''}>${esc(s.title)} · ${new Date(s.updated || s.created || 0).toLocaleDateString('zh-CN')}</option>`).join('')}
        </select>
        <span class="meta">共 ${aiSessions.length} 个对话</span>
      </div>
      <div class="meta">可以问数据、让我帮你建课程、按需导出定制表格（导出会进「下载管理」）。只能调用白名单功能，不会改代码，数据只走你配置的智谱接口。对话仅存本机，点右上角可随时清理。</div>
      <div class="ai-chat" id="aiChat">${aiRenderMsgs() || '<div class="ai-b ai-b-a">你好，我是她的助手。可以问我：这周谁没上课？本月反馈写完没？把 10 月的反馈导成表格。</div>'}</div>
      <div class="ai-chips">
        <button class="chip" data-act="ai-chip" data-q="给我这周的整体情况：课次、反馈、谁没上课">本周概览</button>
        <button class="chip" data-act="ai-chip" data-q="哪些学生超过两周没上课了？">久未上课</button>
        <button class="chip" data-act="ai-chip" data-q="把本月的反馈记录导出成表格">导出本月反馈</button>
        <button class="chip" data-act="ai-chip" data-q="帮我新建一节明天的化学课，学生有${esc(S.students[0] ? S.students[0].name : '某学生')}">新建课程</button>
        <button class="chip" data-act="ai-chip" data-q="出一份${esc(S.students[0] ? S.students[0].name : '某学生')}最近的课堂表现和学习要点报表">学生报表</button>
      </div>
      <div class="ai-attach-row">
        <button class="btn sm" data-act="ai-attach">📎 图片 / 文件</button>
        <input type="file" id="aiFile" accept="image/*,.txt,.csv,.md,.json,.xlsx,.xls" hidden>
        ${aiAttach ? `<span class="ai-attach-chip">${aiAttach.kind === 'image' ? '🖼️' : '📄'} ${esc(aiAttach.name)}${aiAttach.note ? ' · ' + esc(aiAttach.note) : ''}<button data-act="ai-unattach">×</button></span>` : '<span class="meta" style="font-size:11.5px">支持图片、txt/csv、Excel（xlsx/xls）</span>'}
      </div>
      ${aiAttach && aiAttach.kind === 'image' ? `<div class="ai-preview"><img src="${aiAttach.dataUrl}" alt="预览"></div>` : ''}
      <div class="ai-input">
        <textarea id="aiInput" rows="2" placeholder="例如：帮我把九慧1班的学生导成表格"></textarea>
        <button class="btn primary" data-act="ai-send">发送</button>
      </div>
    </div>
  `;
}

function aiExportRows(source, columns, from, to) {
  let rows = [];
  if (source === 'students') {
    rows = S.students.map(st => ({
      姓名: st.name, 班级: classOf(st), 年级: st.grade || '', 学校: st.school || '', 状态: st.status || '',
      家长: st.parent || '', 电话: st.phone || '', 备注: st.note || '',
    }));
  } else if (source === 'courses') {
    rows = S.courses.map(c => ({
      日期: c.date || '', 课程: courseTitle(c), 科目: c.subject || '', 开始: c.start || '', 结束: c.end || '',
      学生数: (c.sids || []).length, 已反馈: (c.sids || []).filter(sid => courseFb(c.id, sid)).length, 备注: c.note || '',
    }));
  } else if (source === 'feedbacks') {
    rows = S.feedbacks.map(f => ({
      日期: f.date || '', 学生: studentName(f.sid), 班级: classOf(studentById(f.sid) || {}), 科目: f.subject || '',
      评价: f.rating || '', 考点: f.topic || '', 课堂表现: f.performance || '',
      进步点: f.progress || f.good || '', 需加强: f.weak || '', 默写: f.dictation || '',
    }));
  } else {
    return null;
  }
  if (from) rows = rows.filter(r => String(r.日期 || '').slice(0, 10) >= from);
  if (to) rows = rows.filter(r => String(r.日期 || '').slice(0, 10) <= to);
  const cols = (columns && columns.length ? columns : AI_COLUMNS[source]).filter(c => AI_COLUMNS[source].includes(c));
  return { rows, cols: cols.length ? cols : AI_COLUMNS[source] };
}

function aiCsv(rows, cols) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [cols.map(q).join(',')];
  rows.forEach(r => lines.push(cols.map(c => q(r[c])).join(',')));
  return '\ufeff' + lines.join('\r\n');
}

async function aiExecute(m) {
  const act = m.action || { type: 'none' };
  if (act.type === 'export') {
    const a = act.args || {};
    const built = aiExportRows(a.source, a.columns, a.from, a.to);
    if (!built || !built.rows.length) { m.text += '\n（没有匹配的数据，已经按当前条件查过了）'; return; }
    const safe = String(a.name || ('导出_' + today())).replace(/[\\/:*?"<>|]/g, '');
    await downloadBlob(safe + '.csv', new Blob([aiCsv(built.rows, built.cols)], { type: 'text/csv' }));
    m.text += `\n已导出 ${built.rows.length} 行 · ${built.cols.join('、')}`;
  }
}

const AI_BLOCK_WORDS = ['删除', '删掉', '删了', '删', '移除', '清空', '清除', '清掉', '清一下', '作废', '撤销', '干掉', '销毁', '抹掉', '销毁', 'delete', 'remove', 'drop', 'truncate'];
function aiBlockedWord(q) {
  const t = String(q || '').toLowerCase();
  return AI_BLOCK_WORDS.find(w => t.includes(String(w).toLowerCase())) || '';
}
function aiStudentConflict(a) {
  const name = String(a.name || '').trim();
  if (!name) return '学生姓名缺失，请手动添加';
  const dup = S.students.find(st => st.name === name && (!a.cls || classOf(st) === a.cls));
  if (dup) return `已存在同名学生（${dup.name} · ${classOf(dup)}），请手动添加或换一个区分方式`;
  return '';
}
function aiCourseConflict(a) {
  const name = String(a.name || '').trim();
  const date = String(a.date || '').trim();
  if (!name || !date) return '课程名称或日期缺失，请手动创建';
  const dup = S.courses.find(c => String(c.date || '') === date && courseTitle(c) === name);
  if (dup) return `已存在同日同名课程（${dup.date} ${courseTitle(dup)}），请手动创建或直接编辑原课程`;
  const names = Array.isArray(a.students) ? a.students : [];
  const same = names.filter(n => S.students.filter(st => st.name === n).length > 1);
  if (same.length) return `学生姓名重名：${same.join('、')}，请手动创建并指定具体学生`;
  return '';
}
function aiBusyUi(on) {
  const btn = document.querySelector('[data-act="ai-send"]');
  if (btn) {
    btn.disabled = false;
    btn.textContent = on ? '停止' : '发送';
    btn.classList.toggle('danger', !!on);
  }
  document.querySelectorAll('.ai-chips .chip').forEach(b => { b.disabled = !!on; });
  const inp = document.getElementById('aiInput');
  if (inp) inp.disabled = !!on;
}

const AI_IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif'];
const AI_TXT_EXT = ['txt', 'csv', 'md', 'json'];
const AI_XLS_EXT = ['xlsx', 'xls'];
function aiFileKind(file) {
  const n = String(file.name || '').toLowerCase();
  const ext = n.split('.').pop();
  if (AI_IMG_EXT.includes(ext) || String(file.type || '').startsWith('image/')) return 'image';
  if (AI_XLS_EXT.includes(ext)) return 'excel';
  if (AI_TXT_EXT.includes(ext)) return 'text';
  return 'blocked';
}
function aiShrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = fr.result;
    };
    fr.onerror = () => reject(fr.error || new Error('读取失败'));
    fr.readAsDataURL(file);
  });
}
async function aiReadSheet(file) {
  if (typeof XLSX === 'undefined') throw new Error('Excel 解析组件没加载（请检查网络后重开）');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('表格是空的');
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
  const lines = csv.split('\n').slice(0, 60).map(l => l.slice(0, 300));
  return { text: lines.join('\n').slice(0, 15000), rows: Math.min(60, csv.split('\n').length), sheet: wb.SheetNames[0] };
}
async function aiPickFile(file) {
  const kind = aiFileKind(file);
  if (kind === 'blocked') {
    toast('暂不支持该文件：只支持图片、txt/csv/md/json、Excel（xlsx/xls）');
    return;
  }
  try {
    if (kind === 'image') {
      if (file.size > 12 * 1024 * 1024) return toast('图片太大（>12MB），请先裁小');
      const dataUrl = await aiShrinkImage(file);
      aiAttach = { kind: 'image', dataUrl, name: file.name || '图片' };
    } else if (kind === 'excel') {
      const r = await aiReadSheet(file);
      aiAttach = { kind: 'text', text: r.text, name: file.name, note: `已读取「${r.sheet}」前 ${r.rows} 行` };
    } else {
      if (file.size > 300 * 1024) return toast('文本文件太大（>300KB）');
      const text = await file.text();
      aiAttach = { kind: 'text', text: text.slice(0, 15000), name: file.name };
    }
    render();
    toast('已添加：' + file.name);
  } catch (e) {
    toast('读取失败：' + (e.message || e));
  }
}

async function aiSend(text) {
  if (!aiReady()) return toast('请先在「数据与备份」里填写 API Key 和模型');
  let q = String(text || '').trim();
  if (aiAttach && aiAttach.kind === 'text') {
    q = (q || '请分析这个文件内容') + '\n\n【文件 ' + aiAttach.name + '】\n' + aiAttach.text;
  }
  if (!q && !aiAttach) return;
  const img = aiAttach && aiAttach.kind === 'image' ? aiAttach.dataUrl : null;
  const raw = String(text || '').trim();
  const shown = (raw || (aiAttach ? '（未输入文字）' : '（图片）')) +
    (aiAttach ? `\n[${aiAttach.kind === 'image' ? '图片' : '文件'}：${aiAttach.name}]` : '');
  if (aiBusy) return;
  const blocked = aiBlockedWord(q);
  if (blocked) {
    aiLog.push({ role: 'u', text: q });
    aiLog.push({ role: 'a', text: `为避免误操作，「${blocked}」这类操作不在 AI 里执行。\n请到对应页面手动删除（删除前会二次确认），谢谢。` });
    saveAiLog(); render();
    return;
  }
  aiLog.push({ role: 'u', text: shown });
  saveAiLog(); render();
  setTimeout(aiScrollBottom, 20);
  const box = document.getElementById('aiChat');
  if (box) box.innerHTML += '<div class="ai-b ai-b-a ai-thinking">思考中…</div>';
  aiBusy = true;
  aiAbort = new AbortController();
  aiBusyUi(true);
  try {
    const r = await aiRun(q, aiAbort.signal, img);
    const ALLOWED = ['none', 'create_course', 'create_student', 'export'];
    const type = (r.action && r.action.type) || 'none';
    if (!ALLOWED.includes(type)) {
      r.action = { type: 'none' };
      r.reply = (r.reply || '') + '\n\n⚠️ 该操作不在白名单（只支持查询、建课、导出），已拦截。';
    }
    if (type === 'none' && /(已添加|已创建|添加成功|创建成功|已保存|已入库|已完成添加)/.test(r.reply || '')) {
      r.reply = (r.reply || '') + '\n\n⚠️ 系统没有执行任何写入（我没有收到确认卡片）。请重新发送这条指令，并在弹出的确认卡上点「确认」。';
    }
    const m = { role: 'a', text: r.reply || '（没有内容）', action: r.action };
    if (r.action && (r.action.type === 'create_course' || r.action.type === 'create_student')) m.status = 'pending';
    aiLog.push(m); saveAiLog();
    if (r.action && r.action.type === 'export') await aiExecute(m);
  } catch (e) {
    if (String(e.message || e) === '已停止') toast('已停止');
    else aiLog.push({ role: 'a', text: '出错了：' + (e.message || e) });
  }
  aiBusy = false;
  aiAbort = null;
  aiAttach = null;
  saveAiLog(); render();
  aiBusyUi(false);
  setTimeout(aiScrollBottom, 30);
  setTimeout(() => { const c = document.getElementById('aiChat'); if (c) c.scrollTop = c.scrollHeight; }, 30);
}

/* ---------------- 数据统计 ---------------- */
let statSid = '';

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function fmtMD(s) { const p = String(s).split('-'); return p.length === 3 ? `${+p[1]}月${+p[2]}日` : s; }

function barsHTML(items, unit) {
  const max = Math.max(1, ...items.map(x => x.v));
  return items.map(x => `<div class="bar-row">
      <span class="bar-label">${esc(x.k)}</span>
      <span class="bar-track"><i style="width:${Math.round(x.v / max * 100)}%"></i></span>
      <span class="bar-val">${x.v}${unit || ''}</span>
    </div>`).join('') || '<div class="empty">暂无数据</div>';
}

function lineChartHTML(points) {
  if (!points.length) return '<div class="empty">暂无数据</div>';
  const W = 320, H = 150, pl = 30, pr = 12, pt = 12, pb = 26;
  const maxV = Math.max(3, ...points.map(p => p.v));
  const iw = W - pl - pr, ih = H - pt - pb;
  const step = points.length > 1 ? iw / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pl + step * i, pt + ih - (p.v / maxV) * ih]);
  let line = '', dots = '', labels = '', vals = '';
  points.forEach((p, i) => {
    const [x, y] = xy[i];
    line += (i ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#028090"/>`;
    vals += `<text x="${x.toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#0F766E">${p.v}</text>`;
    const show = points.length <= 6 || i % 2 === 0;
    if (show) labels += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#94A3B8">${esc(p.l)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="#E2E8F0"/>
    <path d="${line}" fill="none" stroke="#028090" stroke-width="1.6" stroke-linejoin="round"/>
    ${dots}${vals}${labels}</svg>`;
}

function studentStats(sid) {
  const fbs = S.feedbacks.filter(f => f.sid === sid);
  const ratingV = { '优秀': 3, '良好': 2, '待加强': 1 };
  const avg = fbs.length ? fbs.reduce((n, f) => n + (ratingV[f.rating || '良好'] || 2), 0) / fbs.length : 0;
  const myCourses = S.courses.filter(c => (c.sids || []).includes(sid) && c.date);
  const lastCourse = myCourses.map(c => String(c.date)).sort().pop() || '';
  const lastFb = fbs.map(f => String(f.date || '')).sort().pop() || '';
  const photos = fbs.reduce((n, f) => n + ((f.photos || []).length), 0);
  return { courses: myCourses.length, fbs: fbs.length, avg, lastCourse, lastFb, photos };
}
function daysSince(d) {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00').getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
function dictationRate(text) {
  const m = String(text || '').match(/(\d+)\s*[\/／]\s*(\d+)/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  if (!b) return null;
  return Math.min(100, Math.round(a / b * 100));
}

function viewStats() {
  const month = today().slice(0, 7);
  const active = S.students.filter(st => st.status !== '已结课').length;
  const fbMonth = S.feedbacks.filter(f => String(f.date || '').startsWith(month)).length;
  const crMonth = S.courses.filter(c => String(c.date || '').startsWith(month)).length;

  // 待办：未写反馈的课
  const pend = S.courses
    .filter(c => c.date && c.date <= today() && (c.sids || []).length)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(c => {
      const miss = (c.sids || []).filter(sid => !courseFb(c.id, sid));
      return { c, miss };
    }).filter(x => x.miss.length).slice(0, 6);

  // 待办：久未上课（≥14 天）
  const inactive = S.students.filter(st => st.status !== '已结课').map(st => {
    const s2 = studentStats(st.id);
    const d = daysSince(s2.lastCourse);
    return { st, d, s2 };
  }).filter(x => x.d === null || x.d >= 14).sort((a, b) => (b.d === null ? 999 : b.d) - (a.d === null ? 999 : a.d)).slice(0, 8);

  // 待办：久未沟通（≥30 天）
  const noContact = S.students.map(st => {
    const cs = S.contacts.filter(c => c.sid === st.id).map(c => String(c.date || '')).sort().pop() || '';
    return { st, d: daysSince(cs), last: cs };
  }).filter(x => x.d === null || x.d >= 30).sort((a, b) => (b.d === null ? 999 : b.d) - (a.d === null ? 999 : a.d)).slice(0, 6);

  // 学生明细
  const rows = S.students.map(st => ({ st, s2: studentStats(st.id) }))
    .sort((a, b) => b.s2.courses - a.s2.courses || b.s2.fbs - a.s2.fbs);

  // 进步趋势 + 默写正确率
  const withFb = S.students.filter(st => S.feedbacks.some(f => f.sid === st.id));
  if (!statSid || !S.students.some(st => st.id === statSid)) statSid = withFb.length ? withFb[0].id : '';
  const ratingV = { '优秀': 3, '良好': 2, '待加强': 1 };
  const myFb = S.feedbacks.filter(f => f.sid === statSid)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-10);
  const progPts = myFb.map(f => ({ l: String(f.date || '').slice(5), v: ratingV[f.rating || '良好'] || 2 }));
  const dictPts = myFb.map(f => ({ l: String(f.date || '').slice(5), v: dictationRate(f.dictation) })).filter(p => p.v !== null);

  // 班级人数
  const clsMap = {};
  S.students.forEach(st => { const k = classOf(st); clsMap[k] = (clsMap[k] || 0) + 1; });
  const clsRows = Object.keys(clsMap).map(k => ({ k, v: clsMap[k] })).sort((a, b) => b.v - a.v);

  const todoItem = (title, tone, body, count) => `<div class="todo">
      <div class="todo-h"><b>${title}</b><span class="tag ${tone}">${count}</span></div>
      ${body}
    </div>`;

  const pendBody = pend.length ? pend.map(x => `<div class="todo-line">
      <span>${esc(x.c.date)} · ${esc(courseTitle(x.c))}</span>
      <span class="meta">缺 ${x.miss.length} 人：${esc(x.miss.map(sid => studentName(sid)).join('、'))}</span>
    </div>`).join('') : '<div class="meta">全部课程反馈已补齐 👍</div>';

  const inactBody = inactive.length ? inactive.map(x => `<div class="todo-line">
      <span>${esc(x.st.name)} <i class="meta">${esc(classOf(x.st))}</i></span>
      <span class="meta">${x.d === null ? '还没上过课' : '已 ' + x.d + ' 天没上课'}</span>
    </div>`).join('') : '<div class="meta">所有在读学生近期都有课</div>';

  const contactBody = noContact.length ? noContact.map(x => `<div class="todo-line">
      <span>${esc(x.st.name)} <i class="meta">${esc(classOf(x.st))}</i></span>
      <span class="meta">${x.d === null ? '从未沟通' : x.d + ' 天没沟通'}</span>
    </div>`).join('') : '<div class="meta">家长沟通都还算及时</div>';

  return `
    <div class="beta-bar">🧪 <b>测试功能</b>：样本还少，指标口径会随数据量调整；数据多了之后会加更多实用统计（趋势对比、薄弱点、续费预警等）。</div>

    <div class="stat-grid">
      <div class="stat-card"><b>${active}</b><span>在读学生</span><i>共 ${S.students.length} 人</i></div>
      <div class="stat-card"><b>${crMonth}</b><span>本月课次</span><i>累计 ${S.courses.length} 节</i></div>
      <div class="stat-card"><b>${fbMonth}</b><span>本月反馈</span><i>累计 ${S.feedbacks.length} 条</i></div>
      <div class="stat-card"><b>${pend.length}</b><span>待补反馈</span><i>最近未齐的课</i></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">要做的事</h3>
      ${todoItem('未写反馈', 'amber', pendBody, pend.length + ' 节')}
      ${todoItem('久未上课', 'gray', inactBody, inactive.length + ' 人')}
      ${todoItem('久未联系家长', 'gray', contactBody, noContact.length + ' 人')}
    </div>

    <div class="card">
      <h3 style="margin-top:0">学生明细</h3>
      <div class="meta">按上课次数排序，点学生可查看趋势</div>
      <div class="mini-table">
        <div class="mt-head"><span>学生</span><span>课次</span><span>反馈</span><span>均分</span><span>最近上课</span></div>
        ${rows.map(r => `<div class="mt-row">
          <span>${esc(r.st.name)}<i>${esc(classOf(r.st))}</i></span>
          <span>${r.s2.courses}</span>
          <span>${r.s2.fbs}</span>
          <span>${r.s2.avg ? r.s2.avg.toFixed(1) : '—'}</span>
          <span>${r.s2.lastCourse ? String(r.s2.lastCourse).slice(5) : '—'}</span>
        </div>`).join('') || '<div class="empty">还没有学生</div>'}
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">单个学生趋势</h3>
      <div class="field" style="margin-bottom:8px">
        <select id="statSid">
          ${withFb.map(st => `<option value="${st.id}" ${st.id === statSid ? 'selected' : ''}>${esc(st.name)} · ${esc(classOf(st))}</option>`).join('') || '<option value="">还没有反馈</option>'}
        </select>
      </div>
      <div class="meta">评价趋势（3=优秀 2=良好 1=待加强）</div>
      ${lineChartHTML(progPts)}
      <div class="meta" style="margin-top:10px">默写正确率（从「默写检查」里解析 8/10 → 80%）</div>
      ${dictPts.length ? lineChartHTML(dictPts) : '<div class="empty" style="padding:8px 0">还没有可解析的默写分数</div>'}
    </div>

    <div class="card">
      <h3 style="margin-top:0">班级人数分布</h3>
      ${barsHTML(clsRows, ' 人')}
    </div>
  `;
}

/* 导出成功横幅 */
let dlBannerTimer = null;
let expFocus = '';
function onAnyDocClick(e) {
  if (e.target && e.target.closest && e.target.closest('#dlBanner')) return;
  dismissDownloadBanner();
}
function dismissDownloadBanner() {
  const b = document.getElementById('dlBanner');
  if (b) b.remove();
  if (dlBannerTimer) { clearTimeout(dlBannerTimer); dlBannerTimer = null; }
  document.removeEventListener('click', onAnyDocClick, true);
}
function focusExport(id) {
  const el = document.querySelector(`[data-eid="${id}"]`);
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('focus');
  setTimeout(() => el.classList.remove('focus'), 1800);
}
function showDownloadBanner(name, id) {
  dismissDownloadBanner();
  const b = document.createElement('div');
  b.id = 'dlBanner';
  b.innerHTML = `<span class="dl-ic">✅</span><span class="dl-txt"><b>下载成功</b><i>${esc(name)}</i></span><span class="dl-go">查看 ›</span>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('show'));
  dlBannerTimer = setTimeout(dismissDownloadBanner, 5000);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissDownloadBanner();
    if (!id) return;
    expFocus = id;
    if (location.hash === '#/exports') render();
    else location.hash = '#/exports';
    setTimeout(() => focusExport(id), 180);
  });
  setTimeout(() => document.addEventListener('click', onAnyDocClick, true), 0);
}

/* ---------------- 下载管理 ---------------- */
let expQ = '';
function fmtSize(n) {
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}
function exportIcon(mime, name) {
  const m = String(mime || ''), n = String(name || '');
  if (/zip/i.test(m) || /\.zip$/i.test(n)) return '🗜️';
  if (/pdf/i.test(m) || /\.pdf$/i.test(n)) return '📄';
  if (/json/i.test(m) || /\.json$/i.test(n)) return '🧾';
  return '📊';
}
function viewExports() {
  if (!hasNative() || typeof NATIVE.listExports !== 'function') {
    return `<div class="notice">下载管理仅在安卓 App 中可用。</div>`;
  }
  let rows = [];
  try { rows = JSON.parse(NATIVE.listExports() || '[]'); } catch (_) { rows = []; }
  const ts = (r) => {
    const m = String(r.id || '').match(/e_(\d+)/);
    return m ? +m[1] : 0;
  };
  rows.sort((a, b) => ts(b) - ts(a) || String(b.created || '').localeCompare(String(a.created || '')));
  const q = expQ.trim().toLowerCase();
  if (q) rows = rows.filter(r => String(r.name || '').toLowerCase().includes(q) || String(r.created || '').includes(q));
  return `
    <div class="searchbar"><input id="expQ" placeholder="搜文件名或日期，如 反馈表、2026-11-03" value="${esc(expQ)}"></div>
    <div class="section-title"><h2>共 ${rows.length} 个文件</h2><div class="meta">最新导出排在最上面 · 存于「下载/教育工作台」</div></div>
    ${rows.map(r => `<div class="card" data-eid="${r.id}">
      <div class="row"><strong>${exportIcon(r.mime, r.name)} ${esc(r.name)}</strong><span class="spacer"></span><span class="meta">${esc(r.created || '')}</span></div>
      <div class="meta">${fmtSize(r.size)}</div>
      <div class="btns">
        <button class="btn sm primary" data-act="exp-open" data-id="${r.id}">直接打开</button>
        <button class="btn sm" data-act="exp-loc" data-id="${r.id}">所在位置</button>
        <button class="btn sm danger" data-act="exp-del" data-id="${r.id}">删除</button>
      </div>
    </div>`).join('') || '<div class="empty">还没有导出记录，去课程里导出反馈表试试</div>'}
  `;
}

/* ---------------- 数据与备份 ---------------- */
let expSid = '';
function viewData() {
  const counts = KEYS.map(k => `<div class="meta">${({ students: '学生', contacts: '沟通记录', assessments: '测评', feedbacks: '反馈', plans: '规划', courses: '课程' })[k]}：<b>${S[k].length}</b> 条</div>`).join('');
  return `
    <div class="notice" style="margin-bottom:12px">
      数据只存在这台设备（${hasNative() ? 'SQLite 数据库' : '浏览器 IndexedDB'}），不会上传。<b>换设备或卸载前，请先导出备份。</b>
    </div>
    <div class="card">
      <h3 style="margin-top:0">数据量</h3>${counts}
    </div>
    <div class="card">
      <h3 style="margin-top:0">本机自动备份</h3>
      <div class="meta">最近备份：<b>${esc(backupInfo())}</b></div>
      <div class="tip" style="margin-top:6px;font-size:12px;color:#64748B">
        每次修改后约 1 秒自动写入本机备份（不含照片）。若发现记录为空，可从这里找回。
      </div>
      <div style="margin-top:10px">
        <button class="btn" data-act="restore-backup">从自动备份恢复</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">导出 Excel</h3>
      <div class="field" style="margin-bottom:10px">
        <label>导出范围</label>
        <select id="expSid">
          <option value="">全部学生</option>
          ${S.students.map(s => `<option value="${s.id}" ${s.id === expSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="data-row">
        <button class="btn" data-act="xlsx-students">学生</button>
        <button class="btn" data-act="xlsx-contacts">家长沟通</button>
        <button class="btn" data-act="xlsx-assessments">新生测评</button>
        <button class="btn" data-act="xlsx-plans">学习规划</button>
      </div>
      <div style="margin-top:10px"><button class="btn primary block" data-act="json-export">导出全部数据（JSON 备份）</button></div>
      ${hasNative() ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="export-db">导出备份包（.zip）</button>
        <button class="btn" data-act="import-db">导入备份包</button>
      </div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        .zip 是完整备份包（数据库 + 原图照片）。换手机时先装 App，再到这里「导入备份包」，选之前导出的 .zip 即可整库恢复。导入会覆盖本机数据。
      </div>` : ''}
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        导出为 .xlsx：表头加粗、冻结首行、可筛选。手机上请下载后用 WPS/Excel 打开（浏览器内预览可能显示空白）。${hasNative() ? 'APK 里导出的文件保存在「下载/教育工作台」文件夹。' : 'JSON 用于整库恢复。'}
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">智谱 GLM（可选 · 有免费模型）</h3>
      <div class="meta">填写后，「AI 生成考点」按钮才生效。Key 只存在这台设备，不上传。免费模型推荐 glm-4.7-flash / glm-4.5-flash。</div>
      <div class="field" style="margin-top:10px">
        <label>API Key（可填多个，一行一个，用完自动换下一个）</label>
        <textarea id="aiKeys" placeholder="每行一个 Key" style="min-height:84px">${esc((aiCfg().keys || []).join('\n'))}</textarea>
      </div>
      <div class="field">
        <label>模型 / 接入点 ID</label>
        <input id="aiModel" placeholder="如 glm-4.7-flash（免费） / glm-4.5-flash" value="${esc(aiCfg().model || '')}" autocomplete="off">
      </div>
      <div class="field">
        <label>接口地址（留空 = 智谱）</label>
        <input id="aiEndpoint" placeholder="https://api.z.ai/api/paas/v4/chat/completions" value="${esc(aiCfg().endpoint || '')}" autocomplete="off">
        <div class="tip" style="font-size:11.5px;color:#64748B">换服务商时改这里；留空默认用 api.z.ai（智谱海外域名，允许网页直连）</div>
      </div>
      <div class="btns">
        <button class="btn primary" data-act="save-ai">保存</button>
        <button class="btn" data-act="clear-ai">清除</button>
      </div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        在智谱开放平台（bigmodel.cn）「API Keys」页创建后复制。Flash 系列模型免费（有并发限制）。
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">导入 / 恢复</h3>
      <input type="file" id="importFile" accept="application/json,.json" style="width:100%">
      <div class="tip" style="margin-top:6px;font-size:12px;color:#64748B">选择之前导出的 JSON，会覆盖当前数据。</div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">其他</h3>
      <div class="btns">
        <button class="btn" data-act="print">打印当前页</button>
        <button class="btn danger" data-act="clear-all">清空全部数据</button>
      </div>
    </div>
    <div class="notice blue">
      两端同步办法：手机「导出 JSON」→ 微信发给自己 → 电脑「导入 / 恢复」。或反过来。一周同步一次就够。
    </div>
  `;
}

/* ---------------- 导出（.xlsx，表头加粗） ---------------- */
const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xmlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
function colName(i) {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  chunks.forEach(c => { out.set(c, p); p += c.length; });
  central.forEach(c => { out.set(c, p); p += c.length; });

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  out.set(eocd, p);
  return out;
}
function sheetXml(rows, widths) {
  const cols = widths && widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, ri) => {
    const cells = row.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      const st = ri === 0 ? ' s="1"' : '';
      if (v == null || v === '') return `<c r="${ref}"${st}/>`;
      if (typeof v === 'number') return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}"${ri === 0 ? ' ht="24" customHeight="1"' : ''}>${cells}</row>`;
  }).join('');
  const lastCol = colName(((rows[0] || []).length) - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${XLSX_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData><autoFilter ref="A1:${lastCol}${rows.length}"/></worksheet>`;
}
function xlsxBlob(rows, widths, sheetName) {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${XLSX_NS}">
<fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F4F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD3E3E7"/></left><right style="thin"><color rgb="FFD3E3E7"/></right><top style="thin"><color rgb="FFD3E3E7"/></top><bottom style="thin"><color rgb="FFD3E3E7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${XLSX_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${xmlEsc(sheetName || '导出')}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`
    },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows, widths) },
  ];

  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error || new Error('读取失败'));
    fr.readAsDataURL(blob);
  });
}

async function downloadBlob(name, blob) {
  if (hasNative() && typeof NATIVE.saveFile === 'function') {
    try {
      const b64 = await blobToBase64(blob);
      const r = String(NATIVE.saveFile(name, blob.type || 'application/octet-stream', b64) || '');
      if (r.indexOf('ERR:') === 0) return toast('保存失败：' + r.slice(4));
      if (r.indexOf('SHARE:') === 0) return toast('文件已生成，请在弹出的分享面板选择保存位置');
      const parts = r.split('|');
      if (parts[0] === 'OK') return showDownloadBanner(parts[2] || name, parts[1] || '');
      return toast('已保存到「' + r + '」：' + name);
    } catch (e) {
      return toast('保存失败：' + (e.message || e));
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- 导出数据源（可按学生筛选） ---------------- */
const EXPORT_DEF = {
  students: {
    sheet: '学生', widths: [12, 8, 16, 10, 8, 12, 16, 28, 12],
    rows: (sid) => [
      ['姓名', '年级', '学校', '科目', '状态', '家长', '电话', '备注', '建档日期'],
      ...S.students.filter(s => !sid || s.id === sid)
        .map(s => [s.name, s.grade, s.school, s.subjects, s.status, s.parent, s.phone, s.note, s.created]),
    ],
  },
  contacts: {
    sheet: '家长沟通', widths: [12, 10, 8, 46, 28],
    rows: (sid) => [
      ['日期', '学生姓名', '沟通方式', '沟通内容', '跟进事项'],
      ...S.contacts.filter(c => !sid || c.sid === sid)
        .map(c => [c.date, studentName(c.sid), c.type, c.content, c.follow]),
    ],
  },
  assessments: {
    sheet: '新生测评', widths: [12, 10, 8, 8, 8, 8, 30, 30, 30],
    rows: (sid) => [
      ['日期', '学生姓名', '科目', '得分', '满分', '等级', '优势', '薄弱', '阶段目标'],
      ...S.assessments.filter(a => !sid || a.sid === sid)
        .map(a => [a.date, studentName(a.sid), a.subject, a.score, a.total, a.level, a.strong, a.weak, a.goal]),
    ],
  },
  feedbacks: {
    sheet: '上课反馈', widths: [12, 10, 9, 28, 28, 28, 24, 24, 24, 10],
    rows: (sid) => [
      ['日期', '学生姓名', '科目', '本节考点', '考点掌握', '课堂笔记', '课堂表现', '课后作业', '进步点', '需要加强点', '默写检查情况', '错题照片数'],
      ...S.feedbacks.filter(f => !sid || f.sid === sid)
        .map(f => [f.date, studentName(f.sid), f.subject, f.topic || '',
        (f.points || []).map(p => `${p.t}（${['不会', '半会', '会'][p.lv]}）`).join('；'),
        f.notes || f.content, f.performance, f.homework || f.task, f.progress || f.good,
        f.weak, f.dictation, (f.photos || []).length]),
    ],
  },
  plans: {
    sheet: '学习规划', widths: [10, 8, 30, 12, 12, 46, 8, 8],
    rows: (sid) => [
      ['学生姓名', '科目', '阶段目标', '开始日期', '结束日期', '任务清单', '已完成', '总任务'],
      ...S.plans.filter(p => !sid || p.sid === sid)
        .map(p => [studentName(p.sid), p.subject, p.goal, p.start, p.end,
        (p.tasks || []).map(t => (t.done ? '✓ ' : '· ') + t.t).join('；'),
        (p.tasks || []).filter(t => t.done).length, (p.tasks || []).length]),
    ],
  },
};
/* 计算列宽：中文按 2 个字符宽，长文本列设上限，日期列保证够宽 */
function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    w += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
  }
  return w;
}
const LONG_COLS = ['课堂笔记', '课后作业', '阶段目标', '备注', '沟通内容', '任务清单', '优势', '薄弱', '跟进事项', '考点掌握'];
function calcWidths(rows) {
  const headers = (rows[0] || []).map(String);
  return headers.map((h, i) => {
    const isDate = h.includes('日期') || h.includes('缴费') || h.includes('到期');
    const isLong = LONG_COLS.includes(h);
    let w = displayWidth(h) + 3;
    const limit = Math.min(rows.length, 300);
    for (let r = 1; r < limit; r++) {
      const cell = String(rows[r][i] == null ? '' : rows[r][i]);
      const lineW = Math.max(...cell.split('\n').map(displayWidth), 0);
      if (lineW + 2 > w) w = lineW + 2;
    }
    const min = isDate ? 15 : 9;
    const cap = isDate ? 18 : (isLong ? 34 : 22);
    return Math.max(min, Math.min(w, cap));
  });
}

function exportExcel(key, sid) {
  const d = EXPORT_DEF[key];
  if (!d) return;
  const rows = d.rows(sid);
  if (rows.length <= 1) return toast('所选范围内没有数据');
  const who = sid ? studentName(sid) : '全部';
  downloadBlob(`${d.sheet}_${who}_${today()}.xlsx`, xlsxBlob(rows, calcWidths(rows), d.sheet));
  toast('已导出 Excel');
}
/* ---------------- 表单提交 ---------------- */
function saveStudent(o, id) {
  if (!o.name) return toast('请填学生姓名');
  if (id) {
    Object.assign(studentById(id), o, { status: o.status });
  } else {
    S.students.push({ id: uid(), created: today(), ...o });
  }
  saveKey('students'); closeModal(); render(); toast('已保存');
}
function saveContact(o, id) {
  if (!o.sid) return toast('请先添加学生');
  if (!o.content) return toast('请填沟通内容');
  if (id) Object.assign(S.contacts.find(x => x.id === id), o);
  else S.contacts.push({ id: uid(), ...o });
  saveKey('contacts'); closeModal(); render(); toast('已保存');
}
function saveAssessment(o, id) {
  if (!o.sid) return toast('请先添加学生');
  if (id) Object.assign(S.assessments.find(x => x.id === id), o);
  else S.assessments.push({ id: uid(), ...o });
  saveKey('assessments'); closeModal(); render(); toast('已保存');
}
function saveFeedback(o, id) {
  if (!o.sid) return toast('请先添加学生');
  delete o.photos;
  o.photos = photoBuf.slice();
  o.topic = (o.topic || '').trim();
  const ed = document.getElementById('notesEditor');
  if (ed) {
    o.notes = ed.innerHTML;
    o.notesText = elText(ed).trim();
  }
  o.points = pointBuf.filter(p => p && p.t).map(p => ({ t: p.t, on: !!p.on }));
  if (id) Object.assign(S.feedbacks.find(x => x.id === id), o);
  else S.feedbacks.push({ id: uid(), ...o });
  saveKey('feedbacks'); closeModal(); render(); toast('已保存');
}
function savePlan(o, id) {
  if (!o.sid) return toast('请先添加学生');
  const tasks = (o.tasks || '').split('\n').map(t => t.trim()).filter(Boolean);
  const old = id ? S.plans.find(x => x.id === id) : null;
  const merged = tasks.map(t => {
    const prev = old && (old.tasks || []).find(x => x.t === t);
    return { t, done: prev ? prev.done : false };
  });
  const payload = { sid: o.sid, subject: o.subject, goal: o.goal, end: o.end, tasks: merged };
  if (id) Object.assign(old, payload);
  else S.plans.push({ id: uid(), start: today(), ...payload });
  saveKey('plans'); closeModal(); render(); toast('已保存');
}

/* ---------------- 各模块新增入口 ---------------- */
const OPEN = {
  student: () => openModal('添加学生', formStudent(), '保存', (f) => saveStudent(formData(f))),
  contact: (sid) => openModal('记录家长沟通', formContact({ sid }), '保存', (f) => saveContact(formData(f))),
  assessment: (sid) => openModal('新建测评报告', formAssessment({ sid }), '保存', (f) => saveAssessment(formData(f))),
  feedback: (sid) => { photoBuf = []; initPoints({ topic: '' }); openModal('写上课反馈', formFeedback({ sid }), '保存', (f) => saveFeedback(formData(f))); renderPhotoPrev(); renderPointChips(); renderNotesEditor(''); },
  plan: (sid) => openModal('创建学习规划', formPlan({ sid }), '保存', (f) => savePlan(formData(f))),
};

/* ---------------- 事件 ---------------- */
function bind() {
  document.getElementById('menuBtn').onclick = () => {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('scrim').classList.add('show');
  };
  document.getElementById('scrim').onclick = closeDrawer;
  document.getElementById('exportBtn').onclick = () => { location.hash = '#/data'; };
  document.getElementById('fab').onclick = () => {
    if (current === 'courses') {
      if (!S.students.length) return toast('请先添加学生');
      return openModal('新建课程', formCourse(), '保存', f => saveCourse(formData(f)));
    }
    const map = { students: 'student', contacts: 'contact', assessments: 'assessment', plans: 'plan' };
    const fn = OPEN[map[current]];
    if (!fn) return;
    if (current !== 'students' && !S.students.length) return toast('请先添加学生');
    fn();
  };

  // 输入筛选（搜索框只刷新列表，避免打断中文输入法）
  let stuTimer = null, stuComposing = false;
  document.addEventListener('compositionstart', (e) => {
    if (e.target.id === 'stuQ') stuComposing = true;
  });
  document.addEventListener('compositionend', (e) => {
    if (e.target.id === 'stuQ') {
      stuComposing = false;
      stuQ = e.target.value;
      updateStuCount();
      clearTimeout(stuTimer);
      stuTimer = setTimeout(refreshStudentList, 120);
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.matches && e.target.matches('input[data-combo]')) {
      showCombo(e.target);
      if (e.target.name === 'topic') { initPoints({ topic: e.target.value }); renderPointChips(); }
      return;
    }
    if (e.target.id === 'stuQ') {
      stuQ = e.target.value;
      updateStuCount();
      if (stuComposing) return;
      clearTimeout(stuTimer);
      stuTimer = setTimeout(refreshStudentList, 250);
    }
  });

  // 可搜索下拉：聚焦/键盘
  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches('input[data-combo]')) showCombo(e.target);
  });
  document.addEventListener('keydown', (e) => {
    if (!comboInput || document.activeElement !== comboInput) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!comboList.length) return;
      comboIdx = e.key === 'ArrowDown'
        ? Math.min(comboIdx + 1, comboList.length - 1)
        : Math.max(comboIdx - 1, 0);
      [...comboPop.querySelectorAll('.combo-item')].forEach((el, i) => el.classList.toggle('active', i === comboIdx));
      const act = comboPop.querySelector('.combo-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (comboPop && !comboPop.hidden && comboIdx >= 0) { e.preventDefault(); pickCombo(comboIdx); }
    } else if (e.key === 'Escape') {
      hideCombo();
    }
  });
  document.addEventListener('scroll', hideCombo, true);
  window.addEventListener('resize', hideCombo);
  document.addEventListener('input', (e) => {
    if (e.target.id === 'expQ') {
      expQ = e.target.value;
      render();
      setTimeout(() => {
        const el = document.getElementById('expQ');
        if (el) { el.focus(); const v = el.value; el.setSelectionRange(v.length, v.length); }
      }, 0);
    }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id === 'statSid') { statSid = e.target.value; render(); return; }
    const id = e.target.id;
    if (e.target.id === 'aiSession') { aiSwitchSession(e.target.value); return; }
    if (e.target.id === 'aiFile') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) await aiPickFile(f);
      return;
    }
    if (id === 'conSid') { conSid = e.target.value; render(); }
    if (id === 'assSid') { assSid = e.target.value; render(); }
    if (id === 'plSid') { plSid = e.target.value; render(); }
    if (id === 'expSid') { expSid = e.target.value; }
    if (e.target.matches('[data-act="toggle-task"]')) {
      const p = S.plans.find(x => x.id === e.target.dataset.pid);
      if (p) { p.tasks[+e.target.dataset.idx].done = e.target.checked; await saveKey('plans'); render(); }
    }
    if (e.target.name === 'photos' && e.target.files && e.target.files.length) {
      toast('正在保存原图…');
      const files = [...e.target.files];
      for (const file of files) {
        if (photoBuf.length >= 12) { toast('最多 12 张'); break; }
        try {
          const dataUrl = await readAsDataURL(file);
          if (hasNative() && typeof NATIVE.savePhoto === 'function') {
            const mime = (dataUrl.match(/^data:([^;]+);/) || [])[1] || file.type || 'image/jpeg';
            const name = String(NATIVE.savePhoto('', mime, (String(dataUrl).split(',')[1] || '')));
            if (name.indexOf('ERR:') === 0) throw new Error(name);
            photoBuf.push(name);
          } else {
            photoBuf.push(dataUrl);   // 网页版：原图不压缩
          }
        } catch (e) { toast('有图片保存失败：' + String(e.message || e).slice(0, 20)); }
      }
      e.target.value = '';
      renderPhotoPrev();
      return;
    }
    if (id === 'importFile' && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      try {
        const obj = JSON.parse(text);
        if (!obj || typeof obj !== 'object') throw 0;
        if (!confirm('导入会覆盖当前全部数据，确定？')) return;
        KEYS.forEach(k => { if (Array.isArray(obj[k])) S[k] = obj[k]; });
        await Promise.all(KEYS.map(saveKey));
        render(); toast('导入成功');
      } catch (_) { toast('文件格式不对'); }
    }
  });

  // 点击动作
  document.addEventListener('click', async (e) => {
    // 下拉选择
    const popHit = e.target.closest('.combo-pop');
    if (popHit) {
      const it = e.target.closest('.combo-item');
      if (it) pickCombo(+it.dataset.i);
      return;
    }
    if (!e.target.closest('.combo-wrap')) hideCombo();

    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const id = t.dataset.id;
    const sid = t.dataset.sid;

    if (act === 'modal-cancel') return closeModal();
    if (act === 'modal-ok') {
      const form = document.getElementById('modal').querySelector('form') || document.getElementById('modal');
      if (modalOk) modalOk(form);
      return;
    }
    if (act === 'quick') {
      const q = t.dataset.q;
      if (q !== 'student' && !S.students.length) return toast('请先添加学生');
      return OPEN[q] && OPEN[q]();
    }

    if (act === 'edit-student') return openModal('编辑学生', formStudent(studentById(id)), '保存', f => saveStudent(formData(f), id));
    if (act === 'ai-attach') {
      const f = document.getElementById('aiFile');
      if (f) f.click();
      return;
    }
    if (act === 'ai-unattach') { aiAttach = null; render(); return; }
    if (act === 'ai-new') {
      if (!aiLog.length) return;   // 当前对话没有内容，不重复新开
      const s = aiSessionNew();
      aiSessions.unshift(s);
      aiActive = s.id;
      aiLog = s.msgs;
      aiAttach = null;
      saveAiLog(); render();
      toast('已新开对话（原对话已保留）');
      return;
    }
    if (act === 'ai-del') {
      if (!confirm('删除当前这个对话？删除后不可恢复。')) return;
      aiSessions = aiSessions.filter(x => x.id !== aiActive);
      if (!aiSessions.length) aiSessions = [aiSessionNew()];
      aiActive = aiSessions[0].id;
      aiLog = aiCur().msgs;
      aiAttach = null;
      try { localStorage.setItem(AI_SESSIONS_KEY, JSON.stringify(aiSessions)); } catch (_) { }
      render();
      toast('已删除当前对话');
      return;
    }
    if (act === 'ai-send') {
      if (aiBusy) {
        try { if (aiAbort) aiAbort.abort(); } catch (_) { }
        return;
      }
      const inp = document.getElementById('aiInput');
      aiSend(inp ? inp.value : '');
      if (inp) inp.value = '';
      return;
    }
    if (act === 'ai-chip') return aiSend(t.dataset.q);
    if (act === 'ai-confirm') {
      const i = +t.dataset.idx;
      const m = aiLog[i];
      if (!m || !m.action) return;
      const card = t.closest('.ai-confirm');
      const a = Object.assign({}, m.action.args || {});
      if (card) {
        card.querySelectorAll('[data-f]').forEach(inp => {
          const k = inp.getAttribute('data-f'), v = String(inp.value || '').trim();
          if (k === 'students') a.students = v ? v.split(/[、,，]/).map(x => x.trim()).filter(Boolean) : [];
          else a[k] = v;
        });
      }
      m.action.args = a;
      if (m.action.type === 'create_student') {
        const c = aiStudentConflict(a);
        if (c) {
          m.status = 'done';
          m.text += '\n⚠️ ' + c;
          saveAiLog(); render();
          return toast(c);
        }
        S.students.push({
          id: uid(), created: today(), name: String(a.name).trim(), cls: a.cls || '未分班',
          grade: a.grade || '', school: a.school || '', phone: a.phone || '',
          status: a.status || '在读', note: a.note || '',
        });
        saveKey('students');
        m.status = 'done';
        m.text += `\n✅ 已添加学生：${a.name}（${a.cls || '未分班'}）`;
        saveAiLog(); render();
        toast('学生已添加');
        return;
      }
      const conflict = aiCourseConflict(a);
      if (conflict) {
        m.status = 'done';
        m.text += '\n⚠️ ' + conflict;
        saveAiLog(); render();
        return toast(conflict);
      }
      const names = Array.isArray(a.students) ? a.students : [];
      const sids = S.students.filter(st => names.includes(st.name)).map(st => st.id);
      if (!a.name || !a.date) return toast('课程信息不完整，请补充名称和日期');
      if (!sids.length) return toast('没找到对应学生，请用系统里已有的姓名');
      S.courses.push({
        id: uid(), created: Date.now(), name: a.name, subject: a.subject || '化学', date: a.date,
        start: a.start || DEFAULT_TIMES.start, end: a.end || DEFAULT_TIMES.end, note: a.note || '', sids,
      });
      saveKey('courses');
      m.status = 'done';
      m.text += `\n✅ 已创建：${a.name}（${a.date}，${sids.length} 名学生）`;
      saveAiLog(); render();
      toast('课程已创建');
      return;
    }
    if (act === 'ai-cancel') {
      const i = +t.dataset.idx;
      if (aiLog[i]) { aiLog[i].status = 'done'; aiLog[i].text += '\n已取消'; saveAiLog(); render(); }
      return;
    }
    if (act === 'exp-open') {
      if (!hasNative()) return;
      try {
        const r = String(NATIVE.openExport(id) || '');
        if (r.indexOf('ERR:') === 0) toast('打开失败：' + r.slice(4));
      } catch (e) { toast('打开失败'); }
      return;
    }
    if (act === 'exp-loc') {
      if (!hasNative()) return;
      try { NATIVE.openExportLocation(id); } catch (e) { toast('无法打开文件夹'); }
      return;
    }
    if (act === 'exp-del') {
      if (!hasNative()) return;
      if (!confirm('删除这个文件？此操作不可撤销。')) return;
      if (!confirm('再确认一次：将从手机「下载/教育工作台」中彻底删除。')) return;
      try {
        const r = String(NATIVE.deleteExport(id) || '');
        if (r === 'OK') { toast('已删除'); render(); } else toast('删除失败：' + r);
      } catch (e) { toast('删除失败'); }
      return;
    }
    if (act === 'student-pdf') {
      if (!hasNative() || typeof NATIVE.exportStudentPdf !== 'function') {
        if (exportPdfWeb(id)) toast('已打开打印页，选择「另存为 PDF」即可');
        return;
      }
      try {
        const r = String(NATIVE.exportStudentPdf(id, studentName(id)) || '');
        if (r.indexOf('ERR:') === 0) return toast('导出失败：' + r.slice(4));
        const parts = r.split('|');
        if (parts[0] === 'OK') return showDownloadBanner(parts[2] || '反馈 PDF', parts[1] || '');
        return toast('PDF 已生成，选择「保存到文件」或发微信');
      } catch (e) { return toast('导出失败：' + (e.message || e)); }
    }
    if (act === 'del-student') {
      if (!confirm('删除该学生及其全部记录？')) return;
      S.students = S.students.filter(x => x.id !== id);
      ['contacts', 'assessments', 'feedbacks', 'plans'].forEach(k => { S[k] = S[k].filter(x => x.sid !== id); saveKey(k); });
      await saveKey('students'); render(); return toast('已删除');
    }
    if (act === 'add-student') return OPEN.student();
    if (act === 'filter-cls') { stuCls = t.dataset.cls || ''; render(); return; }
    if (act === 'toggle-note') { toggleNotePoint(+t.dataset.idx); return; }
    if (act === 'rt-bold') { document.execCommand('bold'); syncNotes(); return; }
    if (act === 'rt-li') { addBulletLine(); return; }
    if (act === 'rt-clear') {
      const ed = noteEditor();
      if (ed) ed.innerHTML = '';
      pointBuf.forEach(p => { p.on = false; });
      syncNotes(); renderPointChips(); return;
    }
    if (act === 'add-contact') { if (!S.students.length) return toast('请先添加学生'); return OPEN.contact(sid); }
    if (act === 'add-assessment') { if (!S.students.length) return toast('请先添加学生'); return OPEN.assessment(sid); }
    if (act === 'add-feedback') { if (!S.students.length) return toast('请先添加学生'); return OPEN.feedback(sid); }
    if (act === 'add-plan') { if (!S.students.length) return toast('请先添加学生'); return OPEN.plan(sid); }

    // 课程
    if (act === 'add-course') { if (!S.students.length) return toast('请先添加学生'); return openModal('新建课程', formCourse(), '保存', f => saveCourse(formData(f))); }
    if (act === 'edit-course') return openModal('编辑课程', formCourse(courseById(id)), '保存', f => saveCourse(formData(f), id));
    if (act === 'del-course') {
      if (!confirm('删除这个课程？（已写的反馈会保留）')) return;
      S.courses = S.courses.filter(x => x.id !== id);
      if (curCourse === id) curCourse = '';
      await saveKey('courses'); render(); return;
    }
    if (act === 'open-course') { curCourse = id; coursePick = null; render(); return; }
    if (act === 'back-courses') { curCourse = ''; coursePick = null; render(); return; }
    if (act === 'export-course') return exportCourse(id, null);
    if (act === 'export-course-now') return exportCourse(id, [...(coursePick || [])]);
    if (act === 'course-feedback') return openCourseFeedback(id, t.dataset.sid);
    if (act === 'pick-all') { coursePick = new Set(courseStudents(courseById(curCourse)).map(x => x.id)); coursePick._cid = curCourse; render(); return; }
    if (act === 'pick-none') { coursePick = new Set(); coursePick._cid = curCourse; render(); return; }
    if (act === 'pick-sid') {
      if (!coursePick) { coursePick = new Set(); coursePick._cid = curCourse; }
      if (t.checked) coursePick.add(t.dataset.sid); else coursePick.delete(t.dataset.sid);
      render(); return;
    }

    if (act === 'export-page') {
      const mod = t.dataset.mod;
      const sid = ({ contacts: conSid, assessments: assSid, plans: plSid, students: '' })[mod] || '';
      if (mod === 'students') return exportRoster();
      exportExcel(mod, sid);
      return;
    }
    if (act === 'edit-contact') return openModal('编辑沟通', formContact(S.contacts.find(x => x.id === id)), '保存', f => saveContact(formData(f), id));
    if (act === 'del-contact') { if (!confirm('删除这条沟通记录？')) return; S.contacts = S.contacts.filter(x => x.id !== id); await saveKey('contacts'); render(); return; }

    if (act === 'edit-assess') return openModal('编辑测评', formAssessment(S.assessments.find(x => x.id === id)), '保存', f => saveAssessment(formData(f), id));
    if (act === 'del-assess') { if (!confirm('删除这份测评？')) return; S.assessments = S.assessments.filter(x => x.id !== id); await saveKey('assessments'); render(); return; }
    if (act === 'copy-assess') { const a = S.assessments.find(x => x.id === id); if (a) copyText(assessText(a), '测评已复制，去微信粘贴'); return; }

    if (act === 'edit-feedback') {
      const f0 = S.feedbacks.find(x => x.id === id);
      photoBuf = (f0.photos || []).slice();
      initPoints(f0);
      openModal('编辑反馈', formFeedback(f0), '保存', f => saveFeedback(formData(f), id));
      renderPhotoPrev(); renderPointChips();
      return;
    }
    if (act === 'del-feedback') { if (!confirm('删除这条反馈？')) return; S.feedbacks = S.feedbacks.filter(x => x.id !== id); await saveKey('feedbacks'); render(); return; }
    if (act === 'copy-feedback') { const f = S.feedbacks.find(x => x.id === id); if (f) copyText(feedbackText(f), '反馈已复制，去微信粘贴'); return; }
    if (act === 'share-feedback') { const f = S.feedbacks.find(x => x.id === id); if (f) { shareFeedback(f); } return; }
    if (act === 'dl-photos') { const f = S.feedbacks.find(x => x.id === id); if (f) downloadPhotos(f); return; }
    if (act === 'ai-points') { aiGeneratePoints(); return; }
    if (act === 'save-ai') {
      const raw = (document.getElementById('aiKeys').value || '').split('\n').map(x => x.trim()).filter(Boolean);
      const m = (document.getElementById('aiModel').value || '').trim();
      const ep = (document.getElementById('aiEndpoint').value || '').trim();
      if (!raw.length || !m) return toast('至少一个 Key，且模型要填');
      saveAiCfg({ keys: raw, model: m, endpoint: ep });
      render();
      return toast('已保存，写反馈时可以点「AI 生成考点」');
    }
    if (act === 'clear-ai') {
      if (!confirm('清除已保存的 API Key？')) return;
      try { localStorage.removeItem(AI_KEY); } catch (_) { }
      render();
      return toast('已清除');
    }
    if (act === 'toggle-point') {
      const i = +t.dataset.idx;
      if (pointBuf[i]) { pointBuf[i].lv = (pointBuf[i].lv + 1) % 3; renderPointChips(); }
      return;
    }
    if (act === 'del-photo') { photoBuf.splice(+t.dataset.idx, 1); renderPhotoPrev(); return; }
    if (act === 'view-photo') {
      const f = S.feedbacks.find(x => x.id === id);
      if (f && f.photos) openPhoto(f.photos[+t.dataset.idx]);
      return;
    }

    if (act === 'edit-plan') return openModal('编辑规划', formPlan(S.plans.find(x => x.id === id)), '保存', f => savePlan(formData(f), id));
    if (act === 'del-plan') { if (!confirm('删除这个规划？')) return; S.plans = S.plans.filter(x => x.id !== id); await saveKey('plans'); render(); return; }
    if (act === 'add-task') {
      const p = S.plans.find(x => x.id === id);
      const txt = prompt('新增一条任务：');
      if (!txt) return;
      p.tasks.push({ t: txt.trim(), done: false });
      await saveKey('plans'); render(); return;
    }


    // 数据页
    if (act.startsWith('xlsx-')) {
      if (act === 'xlsx-students') return exportRoster();
      exportExcel(act.slice(5), expSid);
      return;
    }
    if (act === 'export-db') {
      if (!hasNative()) return toast('网页版不支持导出备份包，请用 APK');
      try {
        const r = String(NATIVE.exportDb() || '');
        if (r.indexOf('ERR:') === 0) return toast('导出失败：' + r.slice(4));
        const parts = r.split('|');
        if (parts[0] === 'OK') return showDownloadBanner(parts[2] || '备份包', parts[1] || '');
        return toast('已生成备份包，在分享面板选「保存到文件」或发到微信');
      } catch (e) { return toast('导出失败：' + (e.message || e)); }
    }
    if (act === 'import-db') {
      if (!hasNative()) return toast('网页版不支持导入备份包');
      if (!confirm('导入会覆盖本机全部数据且不可撤销，确定继续？')) return;
      try { NATIVE.importDb(); } catch (e) { toast('无法打开文件选择器'); }
      return;
    }
    if (act === 'json-export') {
      download(`教学助手备份_${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
      writeBackup();
      return toast('已导出备份');
    }
    if (act === 'clear-all') {
      if (!confirm('清空全部数据且不可恢复，确定？')) return;
      KEYS.forEach(k => S[k] = []);
      try { localStorage.removeItem(LS_KEY); } catch (_) { }
      await Promise.all(KEYS.map(saveKey)); render(); return toast('已清空');
    }
    if (act === 'restore-backup') {
      const b = readBackup();
      if (!b || !b.total) return toast('没有可用的自动备份');
      if (!confirm(`将用「${backupInfo()}」的备份覆盖当前数据，确定？\n（文字记录可恢复，错题照片无法恢复）`)) return;
      KEYS.forEach(k => { S[k] = Array.isArray(b.data[k]) ? b.data[k] : []; });
      await Promise.all(KEYS.map(saveKey));
      render();
      return toast('已从自动备份恢复');
    }
    if (act === 'print') return window.print();
  });
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
}

/* ---------------- 路由 ---------------- */
function markTabs() {
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === current);
  });
}
function route() {
  const h = (location.hash || '#/home').replace('#/', '');
  current = NAV.some(n => n.id === h) ? h : 'home';
  render();
  markTabs();
  closeDrawer();
  window.scrollTo(0, 0);
  markTabs();
}

/* ---------------- 启动 ---------------- */
(async function boot() {
  await loadAll();
  KEYS.forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });

  // 记录为空但本机有自动备份 → 询问恢复
  const total = KEYS.reduce((n, k) => n + S[k].length, 0);
  const bak = readBackup();
  if (total === 0 && bak && bak.total > 0) {
    if (confirm(`本机记录为空。\n检测到自动备份（${backupInfo()}），是否恢复？\n（文字记录可恢复，错题照片无法恢复）`)) {
      KEYS.forEach(k => { S[k] = Array.isArray(bak.data[k]) ? bak.data[k] : []; });
      await Promise.all(KEYS.map(saveKey));
    }
  } else if (total > 0) {
    writeBackup();
  }

  // 请求浏览器不要回收本站存储
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => { });
  }

  bind();
  window.addEventListener('hashchange', route);
  route();

  // APK：每天首次打开自动把数据库发到邮箱（无网/失败都静默）
  if (hasNative() && typeof NATIVE.autoBackup === 'function') {
    try { NATIVE.autoBackup(); } catch (_) { }
  }
  if (hasNative()) migratePhotosToFiles().catch(() => { });
  if ('serviceWorker' in navigator) {
    const hadSW = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => { });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadSW) location.reload();
      });
    }).catch(() => { });
  }
})();
