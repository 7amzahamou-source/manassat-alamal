/**
 * منصة العمل — الأساس
 * الدخول والخروج، القائمة حسب الصلاحيات، والأدوات المشتركة.
 * كل صفحة في ملف خاص (orders.js، models.js، dashboard.js، orders.js… workflow.js، users.js) وتسجّل نفسها بـ registerPage.
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
  files: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  workflow: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M17.5 8L13.5 16M6.5 8l4 8"/></svg>',
  report: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 18v-3M12 18v-6M15 18v-4"/></svg>',
  rates: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
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
  if (page && page.everyone) return 'view';   // صفحات للجميع (مثل خريطة سير العمل)
  if (isAdmin()) return 'full';
  return (currentUser.perms || {})[pageKey] || 'none';
}

const can = (pageKey, need) => LEVEL_RANK[level(pageKey)] >= LEVEL_RANK[need];
const myPages = () => PAGES.filter(p => !p.everyone && can(p.key, 'view'));
let lastPage = '';

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

/** مجموعات القائمة الجانبية (الترتيب هنا = ترتيب الظهور) */
const NAV_GROUPS = [
  ['عام', ['dashboard', 'report']],
  ['المشتريات', ['orders', 'models']],
  ['الشحن', ['shipments', 'shipped', 'rates']],
  ['الحاويات والتخليص', ['containers', 'receive', 'files']],
  ['الإدارة', ['users']]
];
/** موانئ الوصول في أسعار الشحن (المفتاح، الاسم، متغيّر لون الخط في الرسم) */
const RATE_DESTS = [['dmm', 'الدمام', '--s1'], ['jed', 'جدة', '--s2'], ['rbg', 'رابغ', '--s3']];

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function showApp(user) {
  currentUser = user;
  const first = String(user.name || '').trim().split(/\s+/)[0] || user.name;
  const h = new Date().getHours();
  $('userName').textContent = user.name;
  $('userRole').textContent = isAdmin() ? 'مدير المنصة' : (user.dept || 'موظف');
  $('userAvatar').textContent = String(user.name || '؟').trim().charAt(0).toUpperCase();
  $('greetText').textContent = (h < 12 ? 'صباح الخير، ' : 'مساء الخير، ') + first;
  $('todayText').textContent = DAY_NAMES[new Date().getDay()] + ' ' + today();
  buildNav();
}

/** يبني القائمة من الصفحات المسموحة فقط، مقسّمة بمجموعات */
function buildNav() {
  const list = myPages();
  const grouped = NAV_GROUPS.map(([title, keys]) => [title, list.filter(p => keys.includes(p.key))]);
  const other = list.filter(p => !NAV_GROUPS.some(([, keys]) => keys.includes(p.key)));
  if (other.length) grouped.push(['أخرى', other]);
  $('sideNav').innerHTML = grouped.filter(([, pages]) => pages.length).map(([title, pages]) =>
    `<div class="nav-group">${title}</div>` + pages.map(p =>
      `<button type="button" data-page="${p.key}">${p.icon || ''}<span>${esc(p.title)}</span></button>`).join('')).join('');
  document.body.classList.toggle('single-page', list.length <= 1);
  PAGES.forEach(p => $('page-' + p.key).classList.add('hide'));
  showScreen('appScreen');

  $('noAccess').classList.toggle('hide', list.length > 0);
  if (!list.length) return sessionStorage.getItem('page') === 'workflow' && goTo('workflow');

  const saved = sessionStorage.getItem('page');
  goTo(list.some(p => p.key === saved) || saved === 'workflow' ? saved : list[0].key);
}

function goTo(key) {
  const page = PAGES.find(p => p.key === key);
  if (!page || !can(key, 'view')) return;
  const prev = sessionStorage.getItem('page');
  if (prev && prev !== key && prev !== 'workflow') lastPage = prev;
  sessionStorage.setItem('page', key);
  $('noAccess').classList.add('hide');
  PAGES.forEach(p => $('page-' + p.key).classList.toggle('hide', p.key !== key));
  document.querySelectorAll('#sideNav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === key));
  document.body.classList.remove('nav-open');
  window.scrollTo(0, 0);
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
  $('workflowBtn').addEventListener('click', () => goTo('workflow'));
  $('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
  $('sideNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (btn) goTo(btn.dataset.page);
  });
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  PAGES.forEach(p => p.init && p.init());
  start();
});
