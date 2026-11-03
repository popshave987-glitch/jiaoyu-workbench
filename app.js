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
  { id: 'contacts', t: '家长沟通', i: '💬' },
  { id: 'assessments', t: '新生测评', i: '📊' },
  { id: 'plans', t: '学习规划', i: '🎯' },
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
    plans: viewPlans, courses: viewCourses, data: viewData,
  }[current] || viewHome)();
  document.getElementById('view').innerHTML = v;
  document.getElementById('fab').style.display = current === 'data' || current === 'home' ? 'none' : 'flex';
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

function compressImage(file, max, quality) {
  max = max || 1280; quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/jpeg', quality);
      // 单张控制在 ~300KB 内
      let q = quality;
      while (out.length > 400000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}
function renderPhotoPrev() {
  const box = document.getElementById('photoPrev');
  if (!box) return;
  box.innerHTML = photoBuf.map((p, i) =>
    `<div class="photo"><img src="${p}" alt="错题 ${i + 1}"><button data-act="del-photo" data-idx="${i}">×</button></div>`
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
  const models = [cfg.model];
  if (cfg.model !== 'glm-4-flash') models.push('glm-4-flash');
  const keyOrder = cfg.keys.map((k, i) => i);
  if (aiPreferred.key) keyOrder.sort((a, b) => (cfg.keys[a] === aiPreferred.key ? -1 : 0) - (cfg.keys[b] === aiPreferred.key ? -1 : 0));
  if (aiPreferred.model) models.sort((a, b) => (b === aiPreferred.model ? 1 : 0) - (a === aiPreferred.model ? 1 : 0));
  const errs = [];
  for (const i of keyOrder) {
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.keys[i] },
            body: JSON.stringify({
              model,
              temperature: opt.temperature != null ? opt.temperature : 0.2,
              max_tokens: opt.maxTokens || 900,
              thinking: { type: 'disabled' },
              messages,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1200 * (attempt + 1)); continue; }
            errs.push('Key' + (i + 1) + ':' + codeMsg(res.status)); break;
          }
          const data = await res.json();
          const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
          if (!text) { errs.push('Key' + (i + 1) + ':空'); break; }
          aiPreferred = { key: cfg.keys[i], model };
          return { text, kIdx: i, model };
        } catch (e) {
          clearTimeout(timer);
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
    pointBuf = arr.slice(0, 8).map(t => ({ t: String(t).slice(0, 16), on: false, busy: false }));
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
        out = [o.key && ('要点：' + String(o.key).trim()), o.wrong && ('易错：' + String(o.wrong).trim())].filter(Boolean).join('；');
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
  const files = photos.map((p, i) => dataUrlToFile(p, `${studentName(f.sid)}_错题${i + 1}.jpg`));
  if (files.length && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ text, files }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(text, '文字已复制；照片请用「下载照片」后一起发送');
  if (files.length) downloadPhotos(f);
}
function downloadPhotos(f) {
  (f.photos || []).forEach((p, i) => {
    const a = document.createElement('a');
    a.href = p;
    a.download = `${studentName(f.sid)}_错题${i + 1}.jpg`;
    a.click();
  });
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
    cls, `上课日期：${fmtCn(c.date)}     授课教师：__________`, groups[cls], s => courseFb(cid, s.id)));
  if (!sheets.length) return toast('没有可导出的学生');
  downloadBlob(`${fileSafe(c.date)}_${fileSafe(courseTitle(c))}_课后反馈表.xlsx`, xlsxSheets(sheets));
  toast(`已导出 ${sheets.length} 个班`);
}

function exportRoster() {
  if (!S.students.length) return toast('还没有学生');
  const groups = groupByClass(S.students);
  const sheets = Object.keys(groups).sort().map(cls => tplSheet(
    cls, '上课日期：____ 年 __ 月 __ 日     授课教师：__________', groups[cls], () => null));
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
        <button class="btn" data-act="export-db">导出数据库（.db）</button>
        <button class="btn" data-act="import-db">导入数据库</button>
      </div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        .db 是完整数据库（含照片）。换手机时在新手机上先装 App，再到这里「导入数据库」，选之前导出的 .db 即可整库恢复。导入会覆盖本机数据。
      </div>` : ''}
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        导出为 .xlsx：表头加粗、冻结首行、可筛选。手机上请下载后用 WPS/Excel 打开（浏览器内预览可能显示空白）。JSON 用于整库恢复。
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
function downloadBlob(name, blob) {
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
    const map = { students: 'student', contacts: 'contact', assessments: 'assessment', feedbacks: 'feedback', plans: 'plan' };
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
  document.addEventListener('change', async (e) => {
    const id = e.target.id;
    if (id === 'conSid') { conSid = e.target.value; render(); }
    if (id === 'assSid') { assSid = e.target.value; render(); }
    if (id === 'plSid') { plSid = e.target.value; render(); }
    if (id === 'expSid') { expSid = e.target.value; }
    if (e.target.matches('[data-act="toggle-task"]')) {
      const p = S.plans.find(x => x.id === e.target.dataset.pid);
      if (p) { p.tasks[+e.target.dataset.idx].done = e.target.checked; await saveKey('plans'); render(); }
    }
    if (e.target.name === 'photos' && e.target.files && e.target.files.length) {
      toast('正在处理照片…');
      const files = [...e.target.files];
      for (const file of files) {
        if (photoBuf.length >= 12) { toast('最多 12 张'); break; }
        try { photoBuf.push(await compressImage(file)); } catch (_) { toast('有图片读取失败'); }
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
      if (!hasNative()) return toast('网页版不支持导出 .db，请用 APK');
      try {
        const r = String(NATIVE.exportDb() || '');
        if (r.indexOf('ERR:') === 0) return toast('导出失败：' + r.slice(4));
        return toast('已生成数据库文件，在分享面板选「保存到文件」或发到微信');
      } catch (e) { return toast('导出失败：' + (e.message || e)); }
    }
    if (act === 'import-db') {
      if (!hasNative()) return toast('网页版不支持导入 .db');
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
function route() {
  const h = (location.hash || '#/home').replace('#/', '');
  current = NAV.some(n => n.id === h) ? h : 'home';
  render();
  closeDrawer();
  window.scrollTo(0, 0);
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
