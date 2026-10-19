/**
 * منصة العمل — منطق الواجهة
 * الخطوة 5: أوامر الشراء
 */
const $ = id => document.getElementById(id);

const ROLE_NAMES = { admin: 'مدير', employee: 'موظف', viewer: 'مراقب' };
const DEPTS = ['قسم التكييف', 'قسم الأجهزة المنزلية', 'قسم الأنظمة الأمنية', 'قسم الطاقة الشمسية',
  'قسم مصنع العدادات', 'قسم مصنع التكييف', 'قسم مصنع قواطع الكهرباء', 'قسم البطاريات', 'قسم آخر'];
const ORDER_FIELDS = ['poNo', 'date', 'department', 'supplier', 'currency', 'incoterm', 'payMethod', 'depositPct', 'notes'];

let currentUser = null;
let orders = [];        // كل الأوامر القادمة من الخادم
let editing = null;     // الأمر المفتوح في النافذة (null = أمر جديد)
let items = [];         // بنود الأمر المفتوح
let formReadOnly = false;

/* ===== أدوات مساعدة ===== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n, cur) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + (cur ? ' ' + cur : '');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const options = (list, first) => (first ? `<option value="">${first}</option>` : '') + list.map(x => `<option>${esc(x)}</option>`).join('');
const statusTag = s => `<span class="tag ${s === 'معتمد' ? 'ok' : 'wait'}">${esc(s)}</span>`;
const containersOf = o => (o.items || []).reduce((s, i) => s + (Number(i.containers) || 0), 0);

const canEdit = () => currentUser && currentUser.role !== 'viewer';
const isAdmin = () => currentUser && currentUser.role === 'admin';

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

/* ===== الشاشات ===== */

function showScreen(id) {
  ['loadingScreen', 'loginScreen', 'appScreen'].forEach(s => $(s).classList.toggle('hide', s !== id));
}

function showLogin(message) {
  currentUser = null;
  orders = [];
  $('password').value = '';
  showScreen('loginScreen');
  $('loginError').textContent = message || '';
  $('username').focus();
}

function showApp(user) {
  currentUser = user;
  $('userName').textContent = user.name;
  $('userRole').textContent = ROLE_NAMES[user.role] || user.role;
  $('newOrderBtn').classList.toggle('hide', !canEdit());
  showScreen('appScreen');
  loadOrders();
}

/* ===== الدخول والخروج ===== */

async function handleLogin(event) {
  event.preventDefault();
  $('loginError').textContent = '';
  const done = busy($('loginBtn'), 'جارٍ الدخول…');
  try {
    const result = await API.login($('username').value, $('password').value);
    sessionStorage.setItem('token', result.token);
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
  showLogin();
  if (token) API.logout(token).catch(() => {});
}

window.addEventListener('session-expired', () => {
  sessionStorage.removeItem('token');
  if ($('orderDialog').open) $('orderDialog').close();
  showLogin('انتهت الجلسة، سجّل الدخول مجددًا');
});

/* ===== قائمة أوامر الشراء ===== */

async function loadOrders() {
  $('ordersBody').innerHTML = '<tr><td colspan="9" class="empty">جارٍ تحميل الأوامر…</td></tr>';
  try {
    const result = await API.listOrders();
    orders = result.orders || [];
    renderOrders();
  } catch (err) {
    $('ordersBody').innerHTML = `<tr><td colspan="9" class="empty">${esc(err.message)}</td></tr>`;
  }
}

function filteredOrders() {
  const q = $('search').value.trim().toLowerCase();
  const dept = $('filterDept').value;
  const status = $('filterStatus').value;
  return orders.filter(o =>
    (!q || [o.poNo, o.supplier, ...(o.items || []).map(i => i.model)].join(' ').toLowerCase().includes(q)) &&
    (!dept || o.department === dept) &&
    (!status || o.status === status));
}

function renderOrders() {
  const list = filteredOrders();

  $('stats').innerHTML = [
    ['عدد الأوامر', list.length],
    ['معتمدة', list.filter(o => o.status === 'معتمد').length],
    ['بانتظار الاعتماد', list.filter(o => o.status !== 'معتمد').length],
    ['إجمالي الحاويات', num(list.reduce((s, o) => s + containersOf(o), 0))]
  ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join('');

  if (!list.length) {
    const msg = orders.length ? 'لا توجد أوامر مطابقة للبحث.' : 'لا توجد أوامر بعد. اضغط «أمر شراء جديد» لإضافة أول أمر.';
    $('ordersBody').innerHTML = `<tr><td colspan="9" class="empty">${msg}</td></tr>`;
    return;
  }

  $('ordersBody').innerHTML = list.map(o => `
    <tr data-id="${esc(o.id)}">
      <td><b>${esc(o.poNo)}</b></td>
      <td>${esc(o.date)}</td>
      <td>${esc(o.department)}</td>
      <td>${esc(o.supplier)}</td>
      <td class="num">${(o.items || []).length}</td>
      <td class="num">${num(o.totalQty)}</td>
      <td class="num">${num(containersOf(o)) || '—'}</td>
      <td class="num">${o.totalValue ? money(o.totalValue, o.currency) : '—'}</td>
      <td>${statusTag(o.status)}</td>
    </tr>`).join('');
}

/* ===== نافذة أمر الشراء ===== */

function openOrder(order) {
  editing = order || null;
  const o = order || { date: today(), currency: 'USD', incoterm: 'FOB', payMethod: 'T/T', items: [] };
  formReadOnly = !canEdit() || (o.status === 'معتمد' && !isAdmin());

  $('dlgTitle').textContent = order ? 'أمر الشراء ' + order.poNo : 'أمر شراء جديد';
  $('dlgStatus').innerHTML = order ? statusTag(order.status) : '';
  ORDER_FIELDS.forEach(f => { $('f_' + f).value = o[f] ?? ''; });
  if (!o.depositPct) $('f_depositPct').value = '';

  document.querySelectorAll('#orderForm .grid input, #orderForm .grid select').forEach(el => { el.disabled = formReadOnly; });
  $('saveBtn').classList.toggle('hide', formReadOnly);
  $('addItemBtn').classList.toggle('hide', formReadOnly);
  $('approveBtn').classList.toggle('hide', !(isAdmin() && order && order.status !== 'معتمد'));
  $('deleteBtn').classList.toggle('hide', !(isAdmin() && order));

  $('dlgMeta').textContent = order
    ? `أنشأه ${order.createdBy} في ${order.createdAt}` +
      (order.approvedBy ? ` — اعتمده ${order.approvedBy} في ${order.approvedAt}` : '') +
      ` — آخر تعديل: ${order.updatedBy} في ${order.updatedAt}`
    : '';
  if (formReadOnly && order && canEdit()) $('dlgMeta').textContent += ' — الأمر معتمد، التعديل للمدير فقط.';

  items = (o.items || []).map(i => ({ ...i }));
  if (!items.length) items.push({});
  drawItems();

  $('formError').textContent = '';
  $('orderDialog').showModal();
  if (!formReadOnly && !order) $('f_poNo').focus();
}

function drawItems() {
  $('itemsBody').innerHTML = items.map((i, n) => `
    <tr>
      <td><input data-n="${n}" data-f="model" class="w-model" value="${esc(i.model)}"></td>
      <td><input data-n="${n}" data-f="description" class="w-desc" value="${esc(i.description)}"></td>
      <td><input data-n="${n}" data-f="qty" type="number" min="0" step="any" value="${esc(i.qty)}"></td>
      <td><input data-n="${n}" data-f="price" type="number" min="0" step="any" value="${esc(i.price)}"></td>
      <td><input data-n="${n}" data-f="containers" type="number" min="0" step="1" value="${esc(i.containers)}"></td>
      <td class="num" id="line${n}"></td>
      <td>${formReadOnly ? '' : `<button type="button" class="btn small danger" data-remove="${n}" aria-label="حذف البند">✕</button>`}</td>
    </tr>`).join('');
  if (formReadOnly) $('itemsBody').querySelectorAll('input').forEach(el => { el.disabled = true; });
  calcTotals();
}

function calcTotals() {
  const cur = $('f_currency').value;
  let qty = 0, cnt = 0, val = 0;
  items.forEach((i, n) => {
    const line = (Number(i.qty) || 0) * (Number(i.price) || 0);
    qty += Number(i.qty) || 0;
    cnt += Number(i.containers) || 0;
    val += line;
    const cell = $('line' + n);
    if (cell) cell.textContent = line ? money(line) : '—';
  });
  $('totQty').textContent = num(qty);
  $('totCnt').textContent = num(cnt);
  $('totVal').textContent = money(val, cur);
}

function readForm() {
  const order = { id: editing ? editing.id : '' };
  ORDER_FIELDS.forEach(f => { order[f] = $('f_' + f).value; });
  order.items = items.filter(i => String(i.model || '').trim() || Number(i.qty));
  return order;
}

/** يضع الأمر المحفوظ في القائمة المحلية بدل إعادة تحميل كل شيء */
function putLocal(order) {
  orders = orders.filter(o => o.id !== order.id).concat(order)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  renderOrders();
}

async function saveOrder(event) {
  event.preventDefault();
  if (formReadOnly) return;
  $('formError').textContent = '';
  const done = busy($('saveBtn'), 'جارٍ الحفظ…');
  try {
    const result = await API.saveOrder(readForm());
    putLocal(result.order);
    $('orderDialog').close();
    toast(result.message + (result.order.status === 'معتمد' ? '' : ' — بانتظار اعتماد المدير'));
  } catch (err) {
    $('formError').textContent = err.message;
  } finally {
    done();
  }
}

async function approveOrder() {
  if (!editing) return;
  $('formError').textContent = '';
  const done = busy($('approveBtn'), 'جارٍ الاعتماد…');
  try {
    const result = await API.approveOrder(editing.id);
    putLocal(result.order);
    $('orderDialog').close();
    toast(result.message);
  } catch (err) {
    $('formError').textContent = err.message;
  } finally {
    done();
  }
}

async function deleteOrder() {
  if (!editing || !confirm('حذف أمر الشراء ' + editing.poNo + ' نهائيًا؟')) return;
  $('formError').textContent = '';
  const done = busy($('deleteBtn'), 'جارٍ الحذف…');
  try {
    await API.deleteOrder(editing.id);
    orders = orders.filter(o => o.id !== editing.id);
    renderOrders();
    $('orderDialog').close();
    toast('تم حذف الأمر ' + editing.poNo);
  } catch (err) {
    $('formError').textContent = err.message;
  } finally {
    done();
  }
}

/* ===== عند فتح الصفحة ===== */

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

document.addEventListener('DOMContentLoaded', () => {
  // القوائم المنسدلة
  $('filterDept').innerHTML = options(DEPTS, 'كل الأقسام');
  $('f_department').innerHTML = options(DEPTS, 'اختر القسم');

  // الدخول والخروج
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', handleLogout);

  // القائمة
  $('refreshBtn').addEventListener('click', loadOrders);
  $('newOrderBtn').addEventListener('click', () => openOrder(null));
  ['search', 'filterDept', 'filterStatus'].forEach(id => $(id).addEventListener('input', renderOrders));
  $('ordersBody').addEventListener('click', e => {
    const row = e.target.closest('tr[data-id]');
    if (row) openOrder(orders.find(o => o.id === row.dataset.id));
  });

  // النافذة
  $('orderForm').addEventListener('submit', saveOrder);
  $('orderForm').addEventListener('input', () => { $('formError').textContent = ''; });
  $('approveBtn').addEventListener('click', approveOrder);
  $('deleteBtn').addEventListener('click', deleteOrder);
  $('f_currency').addEventListener('change', calcTotals);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $('orderDialog').close()));

  // البنود
  $('addItemBtn').addEventListener('click', () => { items.push({}); drawItems(); });
  $('itemsBody').addEventListener('input', e => {
    const { n, f } = e.target.dataset;
    if (n === undefined) return;
    items[n][f] = e.target.value;
    calcTotals();
  });
  $('itemsBody').addEventListener('click', e => {
    const n = e.target.dataset.remove;
    if (n === undefined) return;
    items.splice(Number(n), 1);
    if (!items.length) items.push({});
    drawItems();
  });

  start();
});
