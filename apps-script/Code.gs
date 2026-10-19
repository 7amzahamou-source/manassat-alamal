/**
 * منصة العمل — الخادم
 * الخطوة 7: الموظفون والصلاحيات
 */

const SESSION_HOURS = 6;
const SESSION_PREFIX = 'SESSION_';

/**
 * صفحات المنصة ومستويات الصلاحية المتاحة لكل صفحة.
 * none = لا يظهر، view = عرض فقط، edit = إضافة وتعديل، full = كامل (اعتماد وحذف)
 * المدير له كل الصلاحيات تلقائيًا. كل صفحة جديدة نضيفها هنا.
 */
const PAGES = {
  orders: ['none', 'view', 'edit', 'full']
};
const LEVEL_RANK = { none: 0, view: 1, edit: 2, full: 3 };

/** تعريف جداول البيانات */
const TABLES = {
  users: {
    sheet: 'الموظفون',
    key: 'username',
    headers: ['username', 'name', 'passwordHash', 'salt', 'role', 'active', 'createdAt', 'dept', 'perms', 'lastLogin'],
    json: ['perms'],
    numbers: []
  },
  orders: {
    sheet: 'أوامر الشراء',
    key: 'id',
    headers: ['id', 'poNo', 'date', 'department', 'supplier', 'currency', 'incoterm', 'payMethod',
              'depositPct', 'notes', 'status', 'items', 'totalQty', 'totalValue',
              'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'approvedBy', 'approvedAt'],
    json: ['items'],
    numbers: ['depositPct', 'totalQty', 'totalValue']
  }
};

/* =========================================
   نقاط الاتصال
========================================= */

function doGet() {
  return json_({
    success: true,
    message: 'الخادم يعمل',
    sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
    time: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    switch (data.action) {
      // الدخول
      case 'login':        return json_(login_(data.username, data.password));
      case 'me':           return json_(me_(data.token));
      case 'logout':       return json_(logout_(data.token));
      // الموظفون (للمدير فقط)
      case 'listUsers':    return json_(listUsers_(data));
      case 'saveUser':     return json_(saveUser_(data));
      case 'deleteUser':   return json_(deleteUser_(data));
      // أوامر الشراء
      case 'listOrders':   return json_(listOrders_(data));
      case 'saveOrder':    return json_(saveOrder_(data));
      case 'approveOrder': return json_(approveOrder_(data));
      case 'deleteOrder':  return json_(deleteOrder_(data));
      default: throw new Error('العملية غير مدعومة');
    }
  } catch (err) {
    return json_({ success: false, message: err.message });
  }
}

/* =========================================
   الصلاحيات
========================================= */

function isAdmin_(user) {
  return user.role === 'admin';
}

/** مستوى صلاحية المستخدم على صفحة */
function level_(user, page) {
  if (isAdmin_(user)) return 'full';
  return (user.perms && user.perms[page]) || 'none';
}

function requirePage_(user, page, need) {
  if (LEVEL_RANK[level_(user, page)] < LEVEL_RANK[need]) {
    throw new Error('ليس لديك صلاحية لهذه العملية');
  }
}

function requireAdmin_(user) {
  if (!isAdmin_(user)) throw new Error('هذه العملية للمدير فقط');
}

/** الموظف المرتبط بقسم لا يتعامل إلا مع بيانات قسمه */
function deptAllowed_(user, dept) {
  return isAdmin_(user) || !user.dept || user.dept === dept;
}

/* =========================================
   الدخول والجلسات
========================================= */

function login_(username, password) {
  password = String(password || '');
  if (!cleanUsername_(username) || !password) throw new Error('أدخل اسم المستخدم وكلمة المرور');

  const user = getUser_(username);
  if (!user || !sameText_(hash_(password, user.salt), user.passwordHash)) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  if (!user.active) throw new Error('هذا الحساب موقوف، تواصل مع المدير');

  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = { username: user.username, expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000 };
  CacheService.getScriptCache().put(SESSION_PREFIX + token, JSON.stringify(session), SESSION_HOURS * 3600);

  withLock_(() => {
    const fresh = getUser_(user.username);
    fresh.lastLogin = nowText_();
    writeRecord_('users', storedUser_(fresh));
  });

  return { success: true, token: token, user: publicUser_(user) };
}

function me_(token) {
  return { success: true, user: publicUser_(requireUser_(token)) };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  return { success: true };
}

/** يتحقق من الجلسة ويعيد المستخدم بصلاحياته الحالية من الشيت */
function requireUser_(token) {
  token = String(token || '');
  const raw = token ? CacheService.getScriptCache().get(SESSION_PREFIX + token) : null;
  if (!raw) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');

  const session = JSON.parse(raw);
  const user = Date.now() < session.expiresAt ? getUser_(session.username) : null;
  if (!user || !user.active) {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
    throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');
  }
  return user;
}

/* =========================================
   الموظفون
========================================= */

function listUsers_(data) {
  requireAdmin_(requireUser_(data.token));
  const users = readAll_('users').map(normUser_).map(publicUser_)
    .sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || a.name.localeCompare(b.name, 'ar'));
  return { success: true, users: users };
}

function saveUser_(data) {
  const me = requireUser_(data.token);
  requireAdmin_(me);
  const input = data.user || {};
  const isNew = input.isNew === true;
  const username = cleanUsername_(input.username);
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const role = input.role === 'admin' ? 'admin' : 'user';
  const dept = role === 'admin' ? '' : String(input.dept || '').trim().slice(0, 60);
  const active = input.active !== false;

  if (!name) throw new Error('أدخل اسم الموظف');
  if (isNew && !/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('اسم المستخدم: حروف إنجليزية صغيرة أو أرقام فقط، من 3 إلى 30 حرفًا');
  }
  if (isNew && password.length < 8) throw new Error('كلمة المرور 8 أحرف على الأقل');
  if (!isNew && password && password.length < 8) throw new Error('كلمة المرور الجديدة 8 أحرف على الأقل');

  // الصلاحيات: فقط الصفحات والمستويات المعروفة
  const perms = {};
  if (role !== 'admin') {
    Object.keys(PAGES).forEach(page => {
      const v = input.perms && input.perms[page];
      perms[page] = PAGES[page].indexOf(v) >= 0 ? v : 'none';
    });
  }

  return withLock_(() => {
    const all = readAll_('users').map(normUser_);
    const existing = all.find(u => u.username === username);

    if (isNew && existing) throw new Error('اسم المستخدم ' + username + ' مستخدم مسبقًا');
    if (!isNew && !existing) throw new Error('الموظف غير موجود');

    if (!isNew && existing.username === me.username && (role !== 'admin' || !active)) {
      throw new Error('لا يمكنك إلغاء صلاحية المدير أو إيقاف حسابك أنت');
    }

    const user = existing || { username: username, createdAt: nowText_(), lastLogin: '' };
    Object.assign(user, { name: name, role: role, dept: dept, perms: perms, active: active });
    if (password) {
      user.salt = Utilities.getUuid();
      user.passwordHash = hash_(password, user.salt);
    }

    const after = all.filter(u => u.username !== username).concat(user);
    if (!after.some(u => u.role === 'admin' && u.active)) {
      throw new Error('لازم يبقى مدير واحد فعّال على الأقل');
    }

    writeRecord_('users', storedUser_(user));
    return { success: true, user: publicUser_(user), message: isNew ? 'تم إنشاء حساب ' + name : 'تم حفظ بيانات ' + name };
  });
}

function deleteUser_(data) {
  const me = requireUser_(data.token);
  requireAdmin_(me);
  const username = cleanUsername_(data.username);
  if (username === me.username) throw new Error('لا يمكنك حذف حسابك أنت');

  return withLock_(() => {
    const all = readAll_('users').map(normUser_);
    if (!all.some(u => u.username === username)) throw new Error('الموظف غير موجود');
    if (!all.some(u => u.username !== username && u.role === 'admin' && u.active)) {
      throw new Error('لازم يبقى مدير واحد فعّال على الأقل');
    }
    tableSheet_('users').deleteRow(findRow_('users', username));
    return { success: true, message: 'تم حذف الحساب' };
  });
}

function getUser_(username) {
  username = cleanUsername_(username);
  if (!username) return null;
  const u = readAll_('users').find(x => x.username.toLowerCase() === username);
  return u ? normUser_(u) : null;
}

/** يوحّد شكل بيانات الموظف (يدعم الحسابات القديمة) */
function normUser_(u) {
  return {
    username: String(u.username).toLowerCase(),
    name: String(u.name || u.username),
    passwordHash: String(u.passwordHash || ''),
    salt: String(u.salt || ''),
    role: u.role === 'admin' ? 'admin' : 'user',
    active: String(u.active).toUpperCase() === 'TRUE',
    createdAt: String(u.createdAt || ''),
    dept: String(u.dept || ''),
    perms: u.perms && !Array.isArray(u.perms) ? u.perms : {},
    lastLogin: String(u.lastLogin || '')
  };
}

/** ما يُحفظ في الشيت */
function storedUser_(u) {
  return Object.assign({}, u, { active: u.active ? 'TRUE' : 'FALSE' });
}

/** ما يُرسل للواجهة — بدون كلمة المرور المشفرة */
function publicUser_(u) {
  return {
    username: u.username, name: u.name, role: u.role, dept: u.dept, perms: u.perms,
    active: u.active, createdAt: u.createdAt, lastLogin: u.lastLogin
  };
}

function createFirstAdmin_(username, name, password) {
  username = cleanUsername_(username);
  name = String(name || '').trim();
  password = String(password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('اسم المستخدم: حروف إنجليزية صغيرة أو أرقام فقط، من 3 إلى 30 حرفًا');
  }
  if (!name) throw new Error('أدخل الاسم');
  if (password.length < 8) throw new Error('كلمة المرور 8 أحرف على الأقل');

  const salt = Utilities.getUuid();
  writeRecord_('users', storedUser_({
    username: username, name: name, passwordHash: hash_(password, salt), salt: salt,
    role: 'admin', active: true, createdAt: nowText_(), dept: '', perms: {}, lastLogin: ''
  }));
  return { success: true, message: 'تم إنشاء حساب المدير: ' + username };
}

/* =========================================
   أوامر الشراء
========================================= */

function listOrders_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'orders', 'view');
  const orders = readAll_('orders')
    .filter(o => deptAllowed_(user, o.department))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { success: true, orders: orders };
}

function saveOrder_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'orders', 'edit');
  const input = data.order || {};
  const order = cleanOrder_(input);
  const full = level_(user, 'orders') === 'full';

  if (!deptAllowed_(user, order.department)) throw new Error('لا يمكنك إضافة أوامر لقسم غير قسمك');

  return withLock_(() => {
    const all = readAll_('orders');
    const existing = input.id ? all.find(o => o.id === String(input.id)) : null;

    if (input.id && !existing) throw new Error('الأمر غير موجود، ربما حذفه شخص آخر');
    if (existing && !deptAllowed_(user, existing.department)) throw new Error('هذا الأمر يخص قسمًا آخر');
    if (all.some(o => o.poNo.toLowerCase() === order.poNo.toLowerCase() && o.id !== String(input.id || ''))) {
      throw new Error('رقم الأمر ' + order.poNo + ' مستخدم مسبقًا');
    }

    const now = nowText_();
    if (existing) {
      if (existing.status === 'معتمد' && !full) throw new Error('الأمر معتمد، تعديله يحتاج صلاحية كاملة');
      Object.assign(order, {
        id: existing.id, status: existing.status,
        createdBy: existing.createdBy, createdAt: existing.createdAt,
        approvedBy: existing.approvedBy, approvedAt: existing.approvedAt
      });
    } else {
      Object.assign(order, {
        id: Utilities.getUuid(),
        status: full ? 'معتمد' : 'بانتظار الاعتماد',
        createdBy: user.username, createdAt: now,
        approvedBy: full ? user.username : '', approvedAt: full ? now : ''
      });
    }
    order.updatedBy = user.username;
    order.updatedAt = now;

    writeRecord_('orders', order);
    return { success: true, order: order, message: existing ? 'تم تحديث الأمر' : 'تم حفظ الأمر' };
  });
}

function approveOrder_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'orders', 'full');

  return withLock_(() => {
    const order = readAll_('orders').find(o => o.id === String(data.id));
    if (!order) throw new Error('الأمر غير موجود');
    if (!deptAllowed_(user, order.department)) throw new Error('هذا الأمر يخص قسمًا آخر');
    const now = nowText_();
    Object.assign(order, { status: 'معتمد', approvedBy: user.username, approvedAt: now, updatedBy: user.username, updatedAt: now });
    writeRecord_('orders', order);
    return { success: true, order: order, message: 'تم اعتماد الأمر ' + order.poNo };
  });
}

function deleteOrder_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'orders', 'full');

  return withLock_(() => {
    const order = readAll_('orders').find(o => o.id === String(data.id));
    if (!order) throw new Error('الأمر غير موجود');
    if (!deptAllowed_(user, order.department)) throw new Error('هذا الأمر يخص قسمًا آخر');
    tableSheet_('orders').deleteRow(findRow_('orders', order.id));
    return { success: true, message: 'تم حذف الأمر' };
  });
}

/** يتحقق من بيانات الأمر وينظفها ويحسب الإجماليات */
function cleanOrder_(o) {
  const text = v => String(v == null ? '' : v).trim();
  const order = {
    poNo: text(o.poNo),
    date: text(o.date),
    department: text(o.department),
    supplier: text(o.supplier),
    currency: text(o.currency) || 'USD',
    incoterm: text(o.incoterm) || 'FOB',
    payMethod: text(o.payMethod) || 'T/T',
    depositPct: Number(o.depositPct) || 0,
    notes: text(o.notes)
  };

  if (!order.poNo) throw new Error('أدخل رقم أمر الشراء');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.date)) throw new Error('حدد تاريخ الأمر');
  if (!order.department) throw new Error('اختر القسم');
  if (!order.supplier) throw new Error('أدخل المورد / المصنع');
  if (order.depositPct < 0 || order.depositPct > 100) throw new Error('الدفعة المقدمة بين 0 و 100%');

  const items = (Array.isArray(o.items) ? o.items : [])
    .map(i => ({
      model: text(i.model),
      description: text(i.description),
      qty: Number(i.qty) || 0,
      price: Number(i.price) || 0,
      containers: Number(i.containers) || 0
    }))
    .filter(i => i.model || i.qty);

  if (!items.length) throw new Error('أضف بندًا واحدًا على الأقل');
  items.forEach((i, n) => {
    if (!i.model) throw new Error('البند ' + (n + 1) + ': أدخل الموديل');
    if (!(i.qty > 0)) throw new Error('البند ' + (n + 1) + ': الكمية يجب أن تكون أكبر من صفر');
    if (i.price < 0 || i.containers < 0) throw new Error('البند ' + (n + 1) + ': قيمة غير صحيحة');
  });

  order.items = items;
  order.totalQty = items.reduce((s, i) => s + i.qty, 0);
  order.totalValue = Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
  return order;
}

/* =========================================
   طبقة الجداول (مشتركة لكل الأقسام)
========================================= */

function tableSheet_(key) {
  const t = TABLES[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(t.sheet);
  if (!sheet) {
    sheet = ss.insertSheet(t.sheet);
    sheet.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** يقرأ صف العناوين، ويضيف أي عمود جديد معرّف في TABLES وغير موجود في الشيت */
function header_(key) {
  const t = TABLES[key];
  const sheet = tableSheet_(key);
  const head = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
  while (head.length && head[head.length - 1] === '') head.pop();
  const missing = t.headers.filter(h => head.indexOf(h) < 0);
  if (missing.length) {
    sheet.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    return head.concat(missing);
  }
  return head;
}

function readAll_(key) {
  const t = TABLES[key];
  const values = tableSheet_(key).getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(String);
  const ki = head.indexOf(t.key);
  const tz = Session.getScriptTimeZone();

  return values.slice(1).filter(r => ki >= 0 && r[ki] !== '').map(r => {
    const o = {};
    t.headers.forEach(h => {
      const i = head.indexOf(h);
      let v = i >= 0 ? r[i] : '';
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      if (t.json.indexOf(h) >= 0) {
        try { v = v ? JSON.parse(v) : []; } catch (e) { v = []; }
      } else if (t.numbers.indexOf(h) >= 0) {
        v = Number(v) || 0;
      } else {
        v = String(v);
      }
      o[h] = v;
    });
    return o;
  });
}

/** رقم السطر حسب قيمة المفتاح (id أو username) */
function findRow_(key, value) {
  const t = TABLES[key];
  const sheet = tableSheet_(key);
  const last = sheet.getLastRow();
  if (last < 2 || value === '' || value == null) return 0;
  const col = header_(key).indexOf(t.key) + 1;
  const vals = sheet.getRange(2, col, last - 1, 1).getValues();
  const target = String(value).toLowerCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).toLowerCase() === target) return i + 2;
  }
  return 0;
}

/** يكتب سجلًا واحدًا: يحدّث سطره إن وُجد، أو يضيفه في آخر الجدول */
function writeRecord_(key, obj) {
  const t = TABLES[key];
  const sheet = tableSheet_(key);
  const head = header_(key);
  const row = head.map(h => {
    const v = obj[h];
    if (v == null) return '';
    return t.json.indexOf(h) >= 0 ? JSON.stringify(v) : v;
  });
  const r = findRow_(key, obj[t.key]) || sheet.getLastRow() + 1;
  const range = sheet.getRange(r, 1, 1, row.length);
  range.setNumberFormat('@');   // نص عادي حتى لا يغيّر الشيت التواريخ والأرقام
  range.setValues([row]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('الخادم مشغول بحفظ آخر، حاول مرة ثانية');
  try { return fn(); } finally { lock.releaseLock(); }
}

function nowText_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/* =========================================
   التشفير وأدوات مساعدة
========================================= */

function hash_(password, salt) {
  let value = salt + '|' + password;
  const secret = secret_();
  for (let i = 0; i < 1000; i++) {
    value = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret));
  }
  return value;
}

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('PLATFORM_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PLATFORM_SECRET', s);
  }
  return s;
}

function sameText_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanUsername_(v) {
  return String(v || '').trim().toLowerCase();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================
   قائمة «منصة العمل» داخل ملف الشيت
========================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('منصة العمل')
    .addItem('1) تجهيز قاعدة البيانات', 'menuSetup')
    .addItem('2) إنشاء حساب المدير الأول', 'menuCreateAdmin')
    .addSeparator()
    .addItem('اختبار تسجيل الدخول', 'menuTestLogin')
    .addToUi();
}

function menuSetup() {
  secret_();
  Object.keys(TABLES).forEach(k => header_(k));
  SpreadsheetApp.getUi().alert('✅ تم تجهيز قاعدة البيانات');
}

function menuCreateAdmin() {
  const ui = SpreadsheetApp.getUi();
  if (readAll_('users').length) {
    ui.alert('يوجد حساب مسبقًا. أضف بقية الحسابات من صفحة «الموظفون» داخل المنصة.');
    return;
  }
  const name = ask_('الاسم الكامل:');
  if (name === null) return;
  const username = ask_('اسم المستخدم (إنجليزي صغير، مثال: hamza):');
  if (username === null) return;
  const password = ask_('كلمة المرور (8 أحرف على الأقل):');
  if (password === null) return;

  try {
    ui.alert('✅ ' + createFirstAdmin_(username, name, password).message);
  } catch (err) {
    ui.alert('❌ ' + err.message);
  }
}

function menuTestLogin() {
  const ui = SpreadsheetApp.getUi();
  const username = ask_('اسم المستخدم:');
  if (username === null) return;
  const password = ask_('كلمة المرور:');
  if (password === null) return;

  try {
    const r = login_(username, password);
    ui.alert('✅ تسجيل الدخول ناجح\n\nالاسم: ' + r.user.name + '\nالنوع: ' + (r.user.role === 'admin' ? 'مدير' : 'موظف'));
  } catch (err) {
    ui.alert('❌ ' + err.message);
  }
}

function ask_(question) {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('منصة العمل', question, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText() : null;
}
