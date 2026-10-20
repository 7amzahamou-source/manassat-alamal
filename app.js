/**
 * منصة العمل — الأساس
 * الدخول والخروج، القائمة حسب الصلاحيات، والأدوات المشتركة.
 * كل صفحة في ملف خاص (orders.js، models.js، shipping.js، containers.js، users.js) وتسجّل نفسها بـ registerPage.
 */
const $ = id => document.getElementById(id);

const DEPTS = ['قسم التكييف', 'قسم الأجهزة المنزلية', 'قسم الأنظمة الأمنية', 'قسم الطاقة الشمسية',
  'قسم مصنع العدادات', 'قسم مصنع التكييف', 'قسم مصنع قواطع الكهرباء', 'قسم البطاريات', 'قسم آخر'];

/** مستويات الصلاحية */
const LEVELS = { none: 'لا يظهر', view: 'عرض فقط', edit: 'إضافة وتعديل', full: 'كامل (اعتماد وحذف)' };
const LEVEL_RANK = { none: 0, view: 1, edit: 2, full: 3 };

/** أيقونات القائمة */
const ICONS = {
  orders: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h5"/></svg>',
  models: '<svg viewBox="0 0 24 24"><path d="M12 2l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/></svg>',
  shipments: '<svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  shipped: '<svg viewBox="0 0 24 24"><path d="M2 20h20"/><path d="M4 17l-1-5h18l-2 5"/><path d="M8 12V7h8v5"/></svg>',
  containers: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="13" rx="1.5"/><path d="M6 7v13M10 7v13M14 7v13M18 7v13M2 7l3-4h14l3 4"/></svg>',
  receive: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4a3.5 3.5 0 0 1 0 7M22 21c0-3-2-5-5-5.4"/></svg>'
};

let currentUser = null;
const PAGES = [];   // الصفحات المسجّلة بالترتيب

/* ===== أدوات مساعدة ===== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n, cur) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + (cur ? ' ' + cur : '');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const options = (list, first) => (first !== undefined ? `<option value="">${first}</option>` : '') + list.map(x => `<option>${esc(x)}</option>`).join('');

/** حالة شهادة SASO للموديل: { label, cls, attention } */
function certInfo(m) {
  if (!m || !m.cert || m.cert === 'لا تحتاج') return { label: 'لا تحتاج', cls: 'gray', key: 'none', attention: false };
  if (m.cert === 'صادرة') {
    if (m.certExp && m.certExp < today()) return { label: 'منتهية', cls: 'bad', key: 'expired', attention: true };
    if (m.certExp && (new Date(m.certExp) - new Date(today())) / 864e5 <= 30) {
      return { label: 'تنتهي ' + m.certExp, cls: 'wait', key: 'soon', attention: true };
    }
    return { label: 'صادرة', cls: 'ok', key: 'ok', attention: false };
  }
  return { label: m.cert, cls: m.cert === 'قيد الإصدار' ? 'wait' : 'bad', key: 'pending', attention: true };
}

/** عدد الأيام بين تاريخين yyyy-mm-dd */
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** الأيام المجانية للحاوية: آخر يوم مجاني، والمتبقي أو التأخير */
function freeTime(c) {
  if (!c.dischargeDate || c.freeDays === '' || c.freeDays == null) return null;
  const last = addDays(c.dischargeDate, Number(c.freeDays));
  const end = c.emptyReturnDate || today();
  const left = daysBetween(end, last);
  let cls = 'ok', label;
  if (c.emptyReturnDate) {
    label = left >= 0 ? 'أُعيد ضمن المدة' : `أُعيد متأخرًا ${-left} يوم`;
    cls = left >= 0 ? 'gray' : 'bad';
  } else if (left < 0) { label = `متأخر ${-left} يوم`; cls = 'bad'; }
  else if (left <= 3) { label = left === 0 ? 'آخر يوم مجاني' : `باقي ${left} يوم`; cls = 'wait'; }
  else label = `باقي ${left} يوم`;
  return { last, left, label, cls, alert: !c.emptyReturnDate && left <= 3 };
}

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function busy(btn, text) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return () => { btn.disabled = false; btn.textContent = old; };
}

/* ===== الصلاحيات ===== */

const isAdmin = () => !!currentUser && currentUser.role === 'admin';

/** مستوى صلاحية المستخدم الحالي على صفحة */
function level(pageKey) {
  if (!currentUser) return 'none';
  const page = PAGES.find(p => p.key === pageKey);
  if (page && page.adminOnly) return isAdmin() ? 'full' : 'none';
  if (isAdmin()) return 'full';
  return (currentUser.perms || {})[pageKey] || 'none';
}

const can = (pageKey, need) => LEVEL_RANK[level(pageKey)] >= LEVEL_RANK[need];
const myPages = () => PAGES.filter(p => can(p.key, 'view'));

/** تسجيل صفحة: { key, title, icon, adminOnly, levels, init(), show() } */
function registerPage(page) {
  PAGES.push(page);
}

/* ===== الشاشات والتنقل ===== */

function showScreen(id) {
  ['loadingScreen', 'loginScreen', 'appScreen'].forEach(s => $(s).classList.toggle('hide', s !== id));
}

function showLogin(message) {
  currentUser = null;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  $('password').value = '';
  showScreen('loginScreen');
  $('loginError').textContent = message || '';
  $('username').focus();
}

function showApp(user) {
  currentUser = user;
  $('userName').textContent = user.name;
  $('userRole').textContent = isAdmin() ? 'مدير' : (user.dept || 'موظف');
  buildNav();
}

/** يبني القائمة من الصفحات المسموحة فقط */
function buildNav() {
  const list = myPages();
  $('sideNav').innerHTML = list.map(p =>
    `<button type="button" data-page="${p.key}">${p.icon || ''}<span>${esc(p.title)}</span></button>`).join('');
  document.body.classList.toggle('single-page', list.length <= 1);
  PAGES.forEach(p => $('page-' + p.key).classList.add('hide'));
  showScreen('appScreen');

  $('noAccess').classList.toggle('hide', list.length > 0);
  if (!list.length) return;

  const saved = sessionStorage.getItem('page');
  goTo(list.some(p => p.key === saved) ? saved : list[0].key);
}

function goTo(key) {
  const page = PAGES.find(p => p.key === key);
  if (!page || !can(key, 'view')) return;
  sessionStorage.setItem('page', key);
  PAGES.forEach(p => $('page-' + p.key).classList.toggle('hide', p.key !== key));
  document.querySelectorAll('#sideNav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === key));
  page.show();
}

/* ===== الدخول والخروج ===== */

async function handleLogin(event) {
  event.preventDefault();
  $('loginError').textContent = '';
  const done = busy($('loginBtn'), 'جارٍ الدخول…');
  try {
    const result = await API.login($('username').value, $('password').value);
    sessionStorage.setItem('token', result.token);
    sessionStorage.removeItem('page');
    showApp(result.user);
  } catch (err) {
    $('loginError').textContent = err.message;
  } finally {
    done();
  }
}

function handleLogout() {
  const token = API.token();
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('page');
  showLogin();
  if (token) API.logout(token).catch(() => {});
}

async function start() {
  const token = API.token();
  if (!token) return showLogin();
  try {
    const result = await API.me(token);
    showApp(result.user);
  } catch (err) {
    sessionStorage.removeItem('token');
    showLogin();
  }
}

window.addEventListener('session-expired', () => {
  sessionStorage.removeItem('token');
  showLogin('انتهت الجلسة، سجّل الدخول مجددًا');
});

document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('sideNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (btn) goTo(btn.dataset.page);
  });
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  PAGES.forEach(p => p.init && p.init());
  start();
});
