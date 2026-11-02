/* ============================================================
   教育工作台 · 纯静态单用户版
   数据存本机 IndexedDB，不上传任何服务器
   ============================================================ */

const DB_NAME = 'chems_teach_v1';
const STORE = 'kv';
const KEYS = ['students', 'contacts', 'assessments', 'feedbacks', 'plans', 'renewals'];
const S = { students: [], contacts: [], assessments: [], feedbacks: [], plans: [], renewals: [] };

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
      if (c) { if (KEYS.includes(c.key)) S[c.key] = c.value || []; c.continue(); }
      else res();
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
  { id: 'renewals', t: '续费管理', i: '💰' },
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
    plans: viewPlans, renewals: viewRenewals, data: viewData,
  }[current] || viewHome)();
  document.getElementById('view').innerHTML = v;
  document.getElementById('fab').style.display = current === 'data' || current === 'home' ? 'none' : 'flex';
}

/* ---------------- 首页 ---------------- */
function viewHome() {
  const active = S.students.filter(s => s.status !== '已结课').length;
  const weekContacts = S.contacts.filter(c => daysTo(c.date) <= 0 && daysTo(c.date) >= -6).length;
  const due = S.renewals.filter(r => { const d = daysTo(r.nextDue); return d !== null && d <= 7; });
  const ongoing = S.plans.filter(p => (p.tasks || []).some(t => !t.done)).length;

  const dueList = due.slice(0, 4).map(r => {
    const d = daysTo(r.nextDue);
    return `<div class="card tap" data-act="go-renewals">
      <div class="row"><strong>${esc(studentName(r.sid))}</strong>
      <span class="tag ${d < 0 ? 'warn' : 'amber'}">${d < 0 ? '逾期 ' + (-d) + ' 天' : d === 0 ? '今天到期' : d + ' 天后到期'}</span>
      <span class="spacer"></span><span class="meta">${esc(r.service || '')}</span></div>
    </div>`;
  }).join('') || `<div class="empty">暂无临近续费</div>`;

  const recent = S.students.slice(0, 3).map(s => studentCard(s, true)).join('') || `<div class="empty">还没有学生，点右下角「+」添加第一个</div>`;

  return `
    <div class="stats">
      <div class="stat"><div class="num">${active}</div><div class="lbl">在读学生</div></div>
      <div class="stat"><div class="num">${weekContacts}</div><div class="lbl">近 7 天沟通</div></div>
      <div class="stat ${due.length ? 'warn' : ''}"><div class="num">${due.length}</div><div class="lbl">待续费提醒</div></div>
      <div class="stat"><div class="num">${ongoing}</div><div class="lbl">进行中规划</div></div>
    </div>
    <div class="quick">
      <button data-act="quick" data-q="student">＋ 添加学生</button>
      <button data-act="quick" data-q="contact">＋ 记沟通</button>
      <button data-act="quick" data-q="assessment">＋ 新测评</button>
      <button data-act="quick" data-q="feedback">＋ 写反馈</button>
    </div>
    <div class="section-title"><h2>待续费</h2><span class="hint">7 天内</span></div>
    ${dueList}
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
function viewStudents() {
  const grades = [...new Set(S.students.map(s => s.grade).filter(Boolean))];
  let list = S.students.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (stuQ) {
    const q = stuQ.toLowerCase();
    list = list.filter(s => (s.name + s.school + s.parent + s.note).toLowerCase().includes(q));
  }
  if (stuFilter) list = list.filter(s => s.grade === stuFilter);
  return `
    <div class="searchbar">
      <input id="stuQ" placeholder="搜索学生 / 学校 / 家长" value="${esc(stuQ)}">
      <select id="stuFilter">
        <option value="">全部年级</option>
        ${grades.map(g => `<option ${g === stuFilter ? 'selected' : ''}>${esc(g)}</option>`).join('')}
      </select>
    </div>
    <div class="section-title"><h2>共 ${list.length} 人</h2><span class="hint">在读 ${S.students.filter(s => s.status !== '已结课').length} 人</span></div>
    ${list.map(s => studentCard(s, false)).join('') || `<div class="empty">没有匹配的学生</div>`}
  `;
}

function formStudent(s) {
  s = s || {};
  return field('学生姓名', input('name', s.name, '如 李明轩')) +
    `<div class="grid2">
      ${field('年级', input('grade', s.grade, '如 初三'))}
      ${field('学校', input('school', s.school, '如 实验中学'))}
    </div>
    ${field('科目', input('subjects', s.subjects, '化学'))}
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
    <div class="section-title"><h2>共 ${list.length} 条</h2><span class="hint">按日期倒序</span></div>
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
      ${field('科目', input('subject', a.subject, '化学'))}
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
    <div class="notice blue" style="margin-bottom:12px">上课反馈：填「内容 / 掌握 / 待加强 / 作业」，点复制直接发给家长。</div>
    <div class="searchbar">
      <select id="fbSid"><option value="">全部学生</option>
        ${S.students.map(s => `<option value="${s.id}" ${s.id === fbSid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    ${list.map(f => {
    const photos = f.photos || [];
    return `<div class="card">
      <div class="row"><strong>${esc(studentName(f.sid))}</strong>
        <span class="tag">${esc(f.subject || '化学')}</span>
        <span class="tag ${f.rating === '待加强' ? 'amber' : f.rating === '优秀' ? '' : 'gray'}">${esc(f.rating || '良好')}</span>
        <span class="spacer"></span><span class="meta">${esc(f.date || '')}</span></div>
      <div style="margin-top:8px;font-size:13px;line-height:1.75">
        ${f.performance ? `<div><b style="color:#028090">课堂表现：</b>${esc(f.performance)}</div>` : ''}
        ${(f.notes || f.content) ? `<div><b style="color:#028090">课堂笔记：</b>${esc(f.notes || f.content)}</div>` : ''}
        ${(f.homework || f.task) ? `<div><b style="color:#028090">课后作业：</b>${esc(f.homework || f.task)}</div>` : ''}
        ${(f.progress || f.good) ? `<div><b style="color:#0B6B5B">进步点：</b>${esc(f.progress || f.good)}</div>` : ''}
        ${f.weak ? `<div><b style="color:#A3312B">需要加强：</b>${esc(f.weak)}</div>` : ''}
        ${f.dictation ? `<div><b style="color:#8B5E00">默写检查：</b>${esc(f.dictation)}</div>` : ''}
      </div>
      ${photos.length ? `<div class="photos">${photos.map((p, i) => `<div class="photo"><img src="${p}" alt="错题 ${i + 1}"><button data-act="view-photo" data-id="${f.id}" data-idx="${i}">⤢</button></div>`).join('')}</div>` : ''}
      <div class="btns">
        <button class="btn sm" data-act="copy-feedback" data-id="${f.id}">复制反馈</button>
        <button class="btn sm" data-act="edit-feedback" data-id="${f.id}">编辑</button>
        <button class="btn sm danger" data-act="del-feedback" data-id="${f.id}">删除</button>
      </div>
    </div>`;
  }).join('') || `<div class="empty">还没有上课反馈</div>`}
  `;
}
function formFeedback(f) {
  f = f || {};
  return field('学生', `<select name="sid">${studentOptions(f.sid)}</select>`) +
    `<div class="grid2">
      ${field('科目', input('subject', f.subject, '化学'))}
      ${field('日期', input('date', f.date || today(), '', 'date'))}
    </div>` +
    field('课堂表现', input('performance', f.performance, '专注 / 积极提问 / 后半段走神')) +
    field('课堂笔记', textarea('notes', f.notes || f.content, '本次讲了 CO₂ 的制取、装置气密性检查…')) +
    field('课后作业', textarea('homework', f.homework || f.task, '练习册 P32 1-5；默写 3 个方程式')) +
    field('进步点', input('progress', f.progress || f.good, '方程式配平正确率明显提高')) +
    field('需要加强', input('weak', f.weak, '装置气密性检查的表述仍不完整')) +
    field('默写检查', input('dictation', f.dictation, '化学式默写 8/10，错 H₂CO₃、Fe(OH)₃')) +
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
课堂表现：${f.performance || '—'}
课堂笔记：${f.notes || f.content || '—'}
课后作业：${f.homework || f.task || '—'}
进步点：${f.progress || f.good || '—'}
需要加强：${f.weak || '—'}
默写检查：${f.dictation || '—'}${photos ? `\n（错题照片 ${photos} 张，随消息发送）` : ''}
—— 车老师`;
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
      ${field('科目', input('subject', p.subject, '化学'))}
      ${field('结束日期', input('end', p.end, '', 'date'))}
    </div>` +
    field('阶段目标', input('goal', p.goal, '掌握几何证明…')) +
    field('任务清单（每行一条）', `<textarea name="tasks">${esc(tasksText)}</textarea>`, '每天 2 道计算题\n每周一次错题回顾');
}

/* ---------------- 续费 ---------------- */
function viewRenewals() {
  const list = S.renewals.slice().sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''));
  const overdue = list.filter(r => { const d = daysTo(r.nextDue); return d !== null && d < 0; });
  return `
    ${overdue.length ? `<div class="notice" style="margin-bottom:12px">⚠️ ${overdue.length} 名学生已逾期续费：${overdue.map(r => esc(studentName(r.sid))).join('、')}</div>` : ''}
    ${list.map(r => {
    const d = daysTo(r.nextDue);
    const badge = d === null ? '<span class="tag gray">未设到期</span>'
      : d < 0 ? `<span class="tag warn">逾期 ${-d} 天</span>`
        : d === 0 ? '<span class="tag amber">今天到期</span>'
          : `<span class="tag ${d <= 7 ? 'amber' : 'gray'}">${d} 天后到期</span>`;
    return `<div class="card">
        <div class="row"><strong>${esc(studentName(r.sid))}</strong>${badge}
          <span class="spacer"></span><span class="meta">${esc(r.nextDue || '')}</span></div>
        <div class="meta" style="margin-top:6px">${esc(r.service || '')} · ${esc(r.cycle || '')} · ${money(r.amount)}</div>
        <div class="meta">上次缴费：${esc(r.lastPay || '—')}</div>
        <div class="btns">
          <button class="btn sm primary" data-act="pay" data-id="${r.id}">记一次缴费</button>
          <button class="btn sm" data-act="edit-renewal" data-id="${r.id}">编辑</button>
          <button class="btn sm danger" data-act="del-renewal" data-id="${r.id}">删除</button>
        </div>
      </div>`;
  }).join('') || `<div class="empty">还没有续费记录</div>`}
  `;
}
function formRenewal(r) {
  r = r || {};
  return field('学生', `<select name="sid">${studentOptions(r.sid)}</select>`) +
    `<div class="grid2">
      ${field('服务', input('service', r.service, '晚辅 / 上课'))}
      ${field('周期', `<select name="cycle">${['月', '季', '半年', '年'].map(x => `<option ${r.cycle === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
    </div>
    <div class="grid2">
      ${field('金额', input('amount', r.amount, '2000', 'number'))}
      ${field('上次缴费', input('lastPay', r.lastPay, '', 'date'))}
    </div>` +
    field('下次到期', input('nextDue', r.nextDue, '', 'date'));
}
function addCycle(dateStr, cycle) {
  const d = new Date((dateStr || today()) + 'T00:00:00');
  const n = { '月': 1, '季': 3, '半年': 6, '年': 12 }[cycle] || 1;
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------------- 数据与备份 ---------------- */
function viewData() {
  const counts = KEYS.map(k => `<div class="meta">${({ students: '学生', contacts: '沟通记录', assessments: '测评', feedbacks: '反馈', plans: '规划', renewals: '续费' })[k]}：<b>${S[k].length}</b> 条</div>`).join('');
  return `
    <div class="notice" style="margin-bottom:12px">
      数据只存在这台设备的浏览器里，不会上传。<b>换设备或清缓存前，请先导出备份。</b>
    </div>
    <div class="card">
      <h3 style="margin-top:0">数据量</h3>${counts}
    </div>
    <div class="card">
      <h3 style="margin-top:0">导出</h3>
      <div class="data-row">
        <button class="btn" data-act="csv-students">学生 CSV</button>
        <button class="btn" data-act="csv-contacts">沟通 CSV</button>
        <button class="btn" data-act="csv-assess">测评 CSV</button>
        <button class="btn" data-act="csv-feedback">反馈 CSV</button>
        <button class="btn" data-act="csv-plans">规划 CSV</button>
        <button class="btn" data-act="csv-renewals">续费 CSV</button>
      </div>
      <div style="margin-top:10px"><button class="btn primary block" data-act="json-export">导出全部数据（JSON 备份）</button></div>
      <div class="tip" style="margin-top:8px;font-size:12px;color:#64748B">CSV 用 Excel/WPS 直接打开；JSON 用于换手机、换电脑时整库恢复。</div>
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

/* ---------------- CSV ---------------- */
function toCSV(rows) {
  return '\ufeff' + rows.map(r => r.map(c => {
    const s = String(c == null ? '' : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}
function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const CSV = {
  students: () => [['姓名', '年级', '学校', '科目', '状态', '家长', '电话', '备注', '建档日期']].concat(
    S.students.map(s => [s.name, s.grade, s.school, s.subjects, s.status, s.parent, s.phone, s.note, s.created])),
  contacts: () => [['日期', '学生', '方式', '内容', '跟进']].concat(
    S.contacts.map(c => [c.date, studentName(c.sid), c.type, c.content, c.follow])),
  assessments: () => [['日期', '学生', '科目', '得分', '满分', '等级', '优势', '薄弱', '目标']].concat(
    S.assessments.map(a => [a.date, studentName(a.sid), a.subject, a.score, a.total, a.level, a.strong, a.weak, a.goal])),
  feedbacks: () => [['日期', '学生', '科目', '评价', '课堂表现', '课堂笔记', '课后作业', '进步点', '需要加强', '默写检查', '错题照片数']].concat(
    S.feedbacks.map(f => [f.date, studentName(f.sid), f.subject, f.rating, f.performance,
    f.notes || f.content, f.homework || f.task, f.progress || f.good, f.weak, f.dictation, (f.photos || []).length])),
  plans: () => [['学生', '科目', '目标', '开始', '结束', '任务', '完成数', '总数']].concat(
    S.plans.map(p => [studentName(p.sid), p.subject, p.goal, p.start, p.end,
    (p.tasks || []).map(t => (t.done ? '✓' : '·') + t.t).join(' | '),
    (p.tasks || []).filter(t => t.done).length, (p.tasks || []).length])),
  renewals: () => [['学生', '服务', '周期', '金额', '上次缴费', '下次到期']].concat(
    S.renewals.map(r => [studentName(r.sid), r.service, r.cycle, r.amount, r.lastPay, r.nextDue])),
};

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
function saveRenewal(o, id) {
  if (!o.sid) return toast('请先添加学生');
  if (id) Object.assign(S.renewals.find(x => x.id === id), o);
  else S.renewals.push({ id: uid(), ...o });
  saveKey('renewals'); closeModal(); render(); toast('已保存');
}

/* ---------------- 各模块新增入口 ---------------- */
const OPEN = {
  student: () => openModal('添加学生', formStudent(), '保存', (f) => saveStudent(formData(f))),
  contact: (sid) => openModal('记录家长沟通', formContact({ sid }), '保存', (f) => saveContact(formData(f))),
  assessment: (sid) => openModal('新建测评报告', formAssessment({ sid }), '保存', (f) => saveAssessment(formData(f))),
  feedback: (sid) => { photoBuf = []; openModal('写上课反馈', formFeedback({ sid }), '保存', (f) => saveFeedback(formData(f))); renderPhotoPrev(); },
  plan: (sid) => openModal('创建学习规划', formPlan({ sid }), '保存', (f) => savePlan(formData(f))),
  renewal: (sid) => openModal('添加续费记录', formRenewal({ sid }), '保存', (f) => saveRenewal(formData(f))),
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
    const map = { students: 'student', contacts: 'contact', assessments: 'assessment', feedbacks: 'feedback', plans: 'plan', renewals: 'renewal' };
    const fn = OPEN[map[current]];
    if (!fn) return;
    if (current !== 'students' && !S.students.length) return toast('请先添加学生');
    fn();
  };

  // 输入筛选
  document.addEventListener('input', (e) => {
    if (e.target.id === 'stuQ') { stuQ = e.target.value; render(); const i = document.getElementById('stuQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  });
  document.addEventListener('change', async (e) => {
    const id = e.target.id;
    if (id === 'stuFilter') { stuFilter = e.target.value; render(); }
    if (id === 'conSid') { conSid = e.target.value; render(); }
    if (id === 'assSid') { assSid = e.target.value; render(); }
    if (id === 'fbSid') { fbSid = e.target.value; render(); }
    if (id === 'plSid') { plSid = e.target.value; render(); }
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
    if (act === 'go-renewals') { location.hash = '#/renewals'; return; }

    if (act === 'edit-student') return openModal('编辑学生', formStudent(studentById(id)), '保存', f => saveStudent(formData(f), id));
    if (act === 'del-student') {
      if (!confirm('删除该学生及其全部记录？')) return;
      S.students = S.students.filter(x => x.id !== id);
      ['contacts', 'assessments', 'feedbacks', 'plans', 'renewals'].forEach(k => { S[k] = S[k].filter(x => x.sid !== id); saveKey(k); });
      await saveKey('students'); render(); return toast('已删除');
    }
    if (act === 'add-contact') return OPEN.contact(sid);
    if (act === 'add-assessment') return OPEN.assessment(sid);
    if (act === 'add-feedback') return OPEN.feedback(sid);
    if (act === 'add-plan') return OPEN.plan(sid);
    if (act === 'add-renewal') return OPEN.renewal(sid);

    if (act === 'edit-contact') return openModal('编辑沟通', formContact(S.contacts.find(x => x.id === id)), '保存', f => saveContact(formData(f), id));
    if (act === 'del-contact') { if (!confirm('删除这条沟通记录？')) return; S.contacts = S.contacts.filter(x => x.id !== id); await saveKey('contacts'); render(); return; }

    if (act === 'edit-assess') return openModal('编辑测评', formAssessment(S.assessments.find(x => x.id === id)), '保存', f => saveAssessment(formData(f), id));
    if (act === 'del-assess') { if (!confirm('删除这份测评？')) return; S.assessments = S.assessments.filter(x => x.id !== id); await saveKey('assessments'); render(); return; }
    if (act === 'copy-assess') { const a = S.assessments.find(x => x.id === id); if (a) copyText(assessText(a), '测评已复制，去微信粘贴'); return; }

    if (act === 'edit-feedback') {
      const f0 = S.feedbacks.find(x => x.id === id);
      photoBuf = (f0.photos || []).slice();
      openModal('编辑反馈', formFeedback(f0), '保存', f => saveFeedback(formData(f), id));
      renderPhotoPrev();
      return;
    }
    if (act === 'del-feedback') { if (!confirm('删除这条反馈？')) return; S.feedbacks = S.feedbacks.filter(x => x.id !== id); await saveKey('feedbacks'); render(); return; }
    if (act === 'copy-feedback') { const f = S.feedbacks.find(x => x.id === id); if (f) copyText(feedbackText(f), '反馈已复制，去微信粘贴'); return; }
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

    if (act === 'edit-renewal') return openModal('编辑续费', formRenewal(S.renewals.find(x => x.id === id)), '保存', f => saveRenewal(formData(f), id));
    if (act === 'del-renewal') { if (!confirm('删除这条续费记录？')) return; S.renewals = S.renewals.filter(x => x.id !== id); await saveKey('renewals'); render(); return; }
    if (act === 'pay') {
      const r = S.renewals.find(x => x.id === id);
      if (!r) return;
      r.lastPay = today();
      r.nextDue = addCycle(today(), r.cycle);
      await saveKey('renewals'); render(); return toast('已记录缴费，到期日已顺延');
    }

    // 数据页
    if (act.startsWith('csv-')) {
      const k = act.slice(4);
      const map = { students: 'students', contacts: 'contacts', assess: 'assessments', feedback: 'feedbacks', plans: 'plans', renewals: 'renewals' };
      const key = map[k] || k;
      download(`${key}_${today()}.csv`, toCSV(CSV[key]()), 'text/csv;charset=utf-8');
      return toast('已导出 CSV');
    }
    if (act === 'json-export') {
      download(`教学助手备份_${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
      return toast('已导出备份');
    }
    if (act === 'clear-all') {
      if (!confirm('清空全部数据且不可恢复，确定？')) return;
      KEYS.forEach(k => S[k] = []);
      await Promise.all(KEYS.map(saveKey)); render(); return toast('已清空');
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
  bind();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
})();
