/**
 * منصة العمل — الخادم
 * الخطوة 5: أوامر الشراء
 */

const USERS_SHEET = 'الموظفون';
const USER_HEADERS = ['username', 'name', 'passwordHash', 'salt', 'role', 'active', 'createdAt'];
const ROLES = ['admin', 'employee', 'viewer'];
const SESSION_HOURS = 6;
const SESSION_PREFIX = 'SESSION_';

/** تعريف جداول البيانات — كل قسم جديد نضيفه هنا */
const TABLES = {
  orders: {
    sheet: 'أوامر الشراء',
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
      // الحسابات
      case 'login':        return json_(login_(data.username, data.password));
      case 'me':           return json_(me_(data.token));
      case 'logout':       return json_(logout_(data.token));
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
   أوامر الشراء
========================================= */

function listOrders_(data) {
  requireUser_(data.token);
  const orders = readAll_('orders').sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { success: true, orders: orders };
}

function saveOrder_(data) {
  const user = requireUser_(data.token);
  requireRole_(user, ['admin', 'employee']);
  const input = data.order || {};
  const order = cleanOrder_(input);

  return withLock_(() => {
    const all = readAll_('orders');
    const existing = input.id ? all.find(o => o.id === String(input.id)) : null;

    if (input.id && !existing) throw new Error('الأمر غير موجود، ربما حذفه شخص آخر');
    if (all.some(o => o.poNo.toLowerCase() === order.poNo.toLowerCase() && o.id !== String(input.id || ''))) {
      throw new Error('رقم الأمر ' + order.poNo + ' مستخدم مسبقًا');
    }

    const now = nowText_();
    if (existing) {
      if (existing.status === 'معتمد' && user.role !== 'admin') {
        throw new Error('الأمر معتمد، تعديله للمدير فقط');
      }
      Object.assign(order, {
        id: existing.id, status: existing.status,
        createdBy: existing.createdBy, createdAt: existing.createdAt,
        approvedBy: existing.approvedBy, approvedAt: existing.approvedAt
      });
    } else {
      const isAdmin = user.role === 'admin';
      Object.assign(order, {
        id: Utilities.getUuid(),
        status: isAdmin ? 'معتمد' : 'بانتظار الاعتماد',
        createdBy: user.username, createdAt: now,
        approvedBy: isAdmin ? user.username : '', approvedAt: isAdmin ? now : ''
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
  requireRole_(user, ['admin']);

  return withLock_(() => {
    const order = readAll_('orders').find(o => o.id === String(data.id));
    if (!order) throw new Error('الأمر غير موجود');
    const now = nowText_();
    Object.assign(order, { status: 'معتمد', approvedBy: user.username, approvedAt: now, updatedBy: user.username, updatedAt: now });
    writeRecord_('orders', order);
    return { success: true, order: order, message: 'تم اعتماد الأمر ' + order.poNo };
  });
}

function deleteOrder_(data) {
  const user = requireUser_(data.token);
  requireRole_(user, ['admin']);

  return withLock_(() => {
    const row = findRow_('orders', data.id);
    if (!row) throw new Error('الأمر غير موجود');
    tableSheet_('orders').deleteRow(row);
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
  const tz = Session.getScriptTimeZone();

  return values.slice(1).filter(r => r[0] !== '').map(r => {
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

function findRow_(key, id) {
  const sheet = tableSheet_(key);
  const last = sheet.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
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
  const r = findRow_(key, obj.id) || sheet.getLastRow() + 1;
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
   تسجيل الدخول والجلسات
========================================= */

function login_(username, password) {
  username = cleanUsername_(username);
  password = String(password || '');
  if (!username || !password) throw new Error('أدخل اسم المستخدم وكلمة المرور');

  const user = findUser_(username);
  if (!user || !user.active || !sameText_(hash_(password, user.salt), user.passwordHash)) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = { username: user.username, expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000 };
  CacheService.getScriptCache().put(SESSION_PREFIX + token, JSON.stringify(session), SESSION_HOURS * 3600);

  return { success: true, token: token, user: publicUser_(user) };
}

function me_(token) {
  return { success: true, user: publicUser_(requireUser_(token)) };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  return { success: true };
}

function requireUser_(token) {
  token = String(token || '');
  const raw = token ? CacheService.getScriptCache().get(SESSION_PREFIX + token) : null;
  if (!raw) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');

  const session = JSON.parse(raw);
  const user = Date.now() < session.expiresAt ? findUser_(session.username) : null;
  if (!user || !user.active) {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
    throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');
  }
  return user;
}

function requireRole_(user, roles) {
  if (roles.indexOf(user.role) < 0) throw new Error('ليس لديك صلاحية لهذه العملية');
}

/* =========================================
   الحسابات
========================================= */

function createUser_(username, name, password, role) {
  username = cleanUsername_(username);
  name = String(name || '').trim();
  password = String(password || '');

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('اسم المستخدم: حروف إنجليزية صغيرة أو أرقام فقط، من 3 إلى 30 حرفًا');
  }
  if (!name) throw new Error('أدخل الاسم');
  if (password.length < 8) throw new Error('كلمة المرور 8 أحرف على الأقل');
  if (ROLES.indexOf(role) < 0) throw new Error('الدور غير صحيح');
  if (findUser_(username)) throw new Error('اسم المستخدم موجود مسبقًا');

  const salt = Utilities.getUuid();
  usersSheet_().appendRow([username, name, hash_(password, salt), salt, role, true, new Date()]);
  return { success: true, message: 'تم إنشاء الحساب: ' + username };
}

function findUser_(username) {
  const values = usersSheet_().getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(r[0]).toLowerCase() === username) {
      return {
        username: String(r[0]),
        name: String(r[1]),
        passwordHash: String(r[2]),
        salt: String(r[3]),
        role: String(r[4]),
        active: r[5] === true || String(r[5]).toUpperCase() === 'TRUE'
      };
    }
  }
  return null;
}

function publicUser_(u) {
  return { username: u.username, name: u.name, role: u.role };
}

function usersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET);
    sheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
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
  usersSheet_();
  secret_();
  Object.keys(TABLES).forEach(k => header_(k));
  SpreadsheetApp.getUi().alert('✅ تم تجهيز قاعدة البيانات');
}

function menuCreateAdmin() {
  const ui = SpreadsheetApp.getUi();
  if (usersSheet_().getLastRow() > 1) {
    ui.alert('يوجد حساب مسبقًا. إنشاء المدير الأول متاح مرة واحدة فقط.');
    return;
  }
  const name = ask_('الاسم الكامل:');
  if (name === null) return;
  const username = ask_('اسم المستخدم (إنجليزي صغير، مثال: hamza):');
  if (username === null) return;
  const password = ask_('كلمة المرور (8 أحرف على الأقل):');
  if (password === null) return;

  try {
    ui.alert('✅ ' + createUser_(username, name, password, 'admin').message);
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
    ui.alert('✅ تسجيل الدخول ناجح\n\nالاسم: ' + r.user.name + '\nالدور: ' + r.user.role);
  } catch (err) {
    ui.alert('❌ ' + err.message);
  }
}

function ask_(question) {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('منصة العمل', question, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText() : null;
}