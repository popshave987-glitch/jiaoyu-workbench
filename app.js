/* ============================================================
   教育工作台 · 纯静态单用户版
   数据存本机 IndexedDB，不上传任何服务器
   ============================================================ */

const DB_NAME = 'chems_teach_v1';
const STORE = 'kv';
const KEYS = ['students', 'contacts', 'assessments', 'feedbacks', 'plans'];
const S = { students: [], contacts: [], assessments: [], feedbacks: [], plans: [] };

/* ---------------- 存储 ---------------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadAll() {
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
async function saveKey(key) {
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
  { id: 'contacts', t: '家长沟通', i: '💬' },
  { id: 'assessments', t: '新生测评', i: '📊' },
  { id: 'feedbacks', t: '上课反馈', i: '📝' },
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
    `<h3>${title}</h3>${bodyHTML}<div class="modal-actions">
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
    assessments: viewAssessments, feedbacks: viewFeedbacks,
    plans: viewPlans, data: viewData,
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
      <button data-act="quick" data-q="feedback">＋ 写反馈</button>
    </div>
    <div class="section-title"><h2>最近添加的学生</h2><a href="#/students" style="font-size:12px;color:#028090;text-decoration:none">全部 →</a></div>
    ${recent}
  `;
}

function studentCard(s, compact) {
  const tags = [];
  if (s.grade) tags.push(`<span class="tag">${esc(s.grade)}</span>`);
  (s.subjects || '').split(/[，,、\s]+/).filter(Boolean).forEach(x => tags.push(`<span class="tag">${esc(x)}</span>`));
  (s.status ? [s.status] : []).forEach(x => tags.push(`<span class="tag gray">${esc(x)}</span>`));
  const cnt = {
    c: S.contacts.filter(x => x.sid === s.id).length,
    a: S.assessments.filter(x => x.sid === s.id).length,
    f: S.feedbacks.filter(x => x.sid === s.id).length,
  };
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
      <button class="btn sm" data-act="add-feedback" data-sid="${s.id}">写反馈</button>
      <button class="btn sm danger" data-act="del-student" data-id="${s.id}">删除</button>
    </div>
    <div class="meta" style="margin-top:8px">沟通 ${cnt.c} 条 · 测评 ${cnt.a} 份 · 反馈 ${cnt.f} 条</div>`}
  </div>`;
}

/* ---------------- 学生 ---------------- */
let stuQ = '', stuFilter = '';
function filteredStudents() {
  let list = S.students.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (stuQ) {
    const q = stuQ.toLowerCase();
    list = list.filter(s => (s.name + s.school + s.parent + s.note).toLowerCase().includes(q));
  }
  if (stuFilter) list = list.filter(s => s.grade === stuFilter);
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
  const grades = [...new Set(S.students.map(s => s.grade).filter(Boolean))];
  return `
    <div class="searchbar">
      <input id="stuQ" placeholder="搜索学生 / 学校 / 家长" value="${esc(stuQ)}" autocomplete="off">
      <select id="stuFilter">
        <option value="">全部年级</option>
        ${grades.map(g => `<option ${g === stuFilter ? 'selected' : ''}>${esc(g)}</option>`).join('')}
      </select>
    </div>
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
let fbSid = '';
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
function viewFeedbacks() {
  let list = S.feedbacks.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (fbSid) list = list.filter(f => f.sid === fbSid);
  return `
    <div class="notice blue" style="margin-bottom:12px">上课反馈：填完点「复制反馈」发文字；有错题照片时，点「分享(含照片)」可连同图片一起发。</div>
    <div class="searchbar">
      <select id="fbSid"><option value="">全部学生</option>
        ${S.students.map(s => `<option value="${s.id}" ${s.id === fbSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="section-title"><h2>共 ${list.length} 条</h2>${pageActions('feedbacks','add-feedback','＋ 写反馈')}</div>
    ${list.map(f => {
    const photos = f.photos || [];
    return `<div class="card">
      <div class="row"><strong>${esc(studentName(f.sid))}</strong>
        <span class="tag">${esc(f.subject || '化学')}</span>
        <span class="tag ${f.rating === '待加强' ? 'amber' : f.rating === '优秀' ? '' : 'gray'}">${esc(f.rating || '良好')}</span>
        <span class="spacer"></span><span class="meta">${esc(f.date || '')}</span></div>
      ${(f.topic || (f.points && f.points.length)) ? `<div class="meta" style="margin-top:6px">考点：<b>${esc(f.topic || '')}</b></div>
      <div class="chips" style="margin-top:6px">${(f.points || []).map(p => `<span class="chip lv${p.lv}">${esc(p.t)} · ${POINT_LV[p.lv]}</span>`).join('')}</div>` : ''}
      <div style="margin-top:8px;font-size:13px;line-height:1.75">
        ${(f.notes || f.content) ? `<div><b style="color:#028090">课堂笔记：</b>${esc(f.notes || f.content)}</div>` : ''}
        ${f.performance ? `<div><b style="color:#028090">课堂表现：</b>${esc(f.performance)}</div>` : ''}
        ${(f.homework || f.task) ? `<div><b style="color:#028090">课后作业：</b>${esc(f.homework || f.task)}</div>` : ''}
        ${(f.progress || f.good) ? `<div><b style="color:#0B6B5B">进步点：</b>${esc(f.progress || f.good)}</div>` : ''}
        ${f.weak ? `<div><b style="color:#A3312B">需要加强点：</b>${esc(f.weak)}</div>` : ''}
        ${f.dictation ? `<div><b style="color:#8B5E00">默写检查情况：</b>${esc(f.dictation)}</div>` : ''}
      </div>
      ${photos.length ? `<div class="photos">${photos.map((p, i) => `<div class="photo"><img src="${p}" alt="错题 ${i + 1}"><button data-act="view-photo" data-id="${f.id}" data-idx="${i}">⤢</button></div>`).join('')}</div>` : ''}
      <div class="btns">
        <button class="btn sm" data-act="copy-feedback" data-id="${f.id}">复制反馈</button>
        ${photos.length ? `<button class="btn sm primary" data-act="share-feedback" data-id="${f.id}">分享(含照片)</button>
        <button class="btn sm" data-act="dl-photos" data-id="${f.id}">下载照片</button>` : ''}
        <button class="btn sm" data-act="edit-feedback" data-id="${f.id}">编辑</button>
        <button class="btn sm danger" data-act="del-feedback" data-id="${f.id}">删除</button>
      </div>
    </div>`;
  }).join('') || `<div class="empty">还没有上课反馈</div>`}
  `;
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
  const list = CHEM_TOPICS[topic] || [];
  pointBuf = list.map(t => {
    const old = (f && f.points || []).find(x => x.t === t);
    return { t, lv: old ? old.lv : 0 };
  });
}
function renderPointChips() {
  const box = document.getElementById('pointBox');
  if (!box) return;
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
  try { return JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function saveAiCfg(cfg) {
  try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch (_) { }
}
function aiReady() { const c = aiCfg(); return !!(c.key && c.model); }

async function aiGeneratePoints() {
  const cfg = aiCfg();
  if (!cfg.key || !cfg.model) return toast('请先在「数据与备份」里填豆包 API Key 和模型');
  const topic = currentTopic();
  if (!topic) return toast('请先填写本节考点主题');

  const btn = document.querySelector('[data-act="ai-points"]');
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  try {
    const res = await fetch(cfg.endpoint || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是初中/高中化学老师，只输出 JSON，不要解释。' },
          { role: 'user', content: `请列出「${topic}」这个主题最常考的 6 个具体考点，每个不超过 12 个字，面向中学生。只输出 JSON 字符串数组，例如 ["考点1","考点2"]。` },
        ],
      }),
    });
    if (!res.ok) throw new Error('接口返回 ' + res.status);
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('返回格式不对');
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || !arr.length) throw new Error('没有拿到考点');
    pointBuf = arr.slice(0, 8).map(t => ({ t: String(t).slice(0, 20), lv: 0 }));
    renderPointChips();
    toast('已生成 ' + pointBuf.length + ' 个考点，点一下标记掌握情况');
  } catch (e) {
    toast('生成失败：' + (e && e.message ? e.message : '网络错误'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'AI 生成考点'; }
  }
}

function formFeedback(f) {
  f = f || {};
  return field('学生姓名', `<select name="sid">${studentOptions(f.sid)}</select>`) +
    `<div class="grid2">
      ${field('科目', combo('subject', f.subject, '化学', COMBO_SRC.subject()))}
      ${field('日期', input('date', f.date || today(), '', 'date'))}
    </div>` +
    field('本节考点', combo('topic', f.topic, '如 氧化还原反应 / 溶液与溶解度曲线', Object.keys(CHEM_TOPICS)), '填主题后自动列出考点，点一下切换：会 → 半会 → 不会') +
    field('考点掌握', `<div class="row" style="justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11.5px;color:#64748B">点一下切换：会 → 半会 → 不会</span>
      <button type="button" class="btn sm" data-act="ai-points">AI 生成考点</button>
    </div><div id="pointBox" class="chips"></div>`) +
    field('课堂笔记', textarea('notes', f.notes || f.content, '本次讲了 CO₂ 的制取、装置气密性检查…')) +
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
课堂笔记：${f.notes || f.content || '—'}
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

/* ---------------- 数据与备份 ---------------- */
let expSid = '';
function viewData() {
  const counts = KEYS.map(k => `<div class="meta">${({ students: '学生', contacts: '沟通记录', assessments: '测评', feedbacks: '反馈', plans: '规划' })[k]}：<b>${S[k].length}</b> 条</div>`).join('');
  return `
    <div class="notice" style="margin-bottom:12px">
      数据只存在这台设备的浏览器里，不会上传。<b>换设备或清缓存前，请先导出备份。</b>
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
        <button class="btn" data-act="xlsx-feedbacks">上课反馈</button>
        <button class="btn" data-act="xlsx-plans">学习规划</button>
      </div>
      <div style="margin-top:10px"><button class="btn primary block" data-act="json-export">导出全部数据（JSON 备份）</button></div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        导出为 .xlsx：表头加粗、冻结首行、可筛选。手机上请下载后用 WPS/Excel 打开（浏览器内预览可能显示空白）。JSON 用于整库恢复。
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">豆包 AI（可选）</h3>
      <div class="meta">填写后，「AI 生成考点」按钮才生效。Key 只存在这台设备，不上传。</div>
      <div class="field" style="margin-top:10px">
        <label>API Key</label>
        <input id="aiKey" type="password" placeholder="粘贴方舟 API Key" value="${esc(aiCfg().key || '')}" autocomplete="off">
      </div>
      <div class="field">
        <label>模型 / 接入点 ID</label>
        <input id="aiModel" placeholder="如 doubao-seed-1-6-250615 或 ep-xxxx" value="${esc(aiCfg().model || '')}" autocomplete="off">
      </div>
      <div class="btns">
        <button class="btn primary" data-act="save-ai">保存</button>
        <button class="btn" data-act="clear-ai">清除</button>
      </div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">
        在火山方舟控制台「在线推理」里创建接入点后复制。新用户有免费额度，超出按量计费。
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
  o.points = pointBuf.filter(p => p && p.t).map(p => ({ t: p.t, lv: p.lv }));
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
  feedback: (sid) => { photoBuf = []; initPoints({ topic: '' }); openModal('写上课反馈', formFeedback({ sid }), '保存', (f) => saveFeedback(formData(f))); renderPhotoPrev(); renderPointChips(); },
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
    if (id === 'stuFilter') { stuFilter = e.target.value; refreshStudentList(); }
    if (id === 'conSid') { conSid = e.target.value; render(); }
    if (id === 'assSid') { assSid = e.target.value; render(); }
    if (id === 'fbSid') { fbSid = e.target.value; render(); }
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
    if (act === 'add-contact') { if (!S.students.length) return toast('请先添加学生'); return OPEN.contact(sid); }
    if (act === 'add-assessment') { if (!S.students.length) return toast('请先添加学生'); return OPEN.assessment(sid); }
    if (act === 'add-feedback') { if (!S.students.length) return toast('请先添加学生'); return OPEN.feedback(sid); }
    if (act === 'add-plan') { if (!S.students.length) return toast('请先添加学生'); return OPEN.plan(sid); }

    if (act === 'export-page') {
      const mod = t.dataset.mod;
      const sid = ({ contacts: conSid, assessments: assSid, feedbacks: fbSid, plans: plSid, students: '' })[mod] || '';
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
      const k = (document.getElementById('aiKey').value || '').trim();
      const m = (document.getElementById('aiModel').value || '').trim();
      if (!k || !m) return toast('Key 和模型都要填');
      saveAiCfg({ key: k, model: m });
      render();
      return toast('已保存，写反馈时可以点「AI 生成考点」');
    }
    if (act === 'clear-ai') {
      if (!confirm('清除已保存的豆包 Key？')) return;
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
      exportExcel(act.slice(5), expSid);
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
