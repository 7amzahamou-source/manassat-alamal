/**
 * منصة العمل — الخادم
 * الخطوة 12: البيان الجمركي لكل حاوية + فترة السماح من التعميد
 */

const SESSION_HOURS = 6;
const SESSION_PREFIX = 'SESSION_';

/**
 * صفحات المنصة ومستويات الصلاحية المتاحة لكل صفحة.
 * none = لا يظهر، view = عرض فقط، edit = إضافة وتعديل، full = كامل (اعتماد وحذف)
 * المدير له كل الصلاحيات تلقائيًا. كل صفحة جديدة نضيفها هنا.
 */
const PAGES = {
  orders: ['none', 'view', 'edit', 'full'],
  models: ['none', 'view', 'edit', 'full'],
  shipments: ['none', 'view', 'edit', 'full'],
  shipped: ['none', 'view', 'edit', 'full'],
  containers: ['none', 'view', 'edit', 'full'],
  receive: ['none', 'edit'],
  files: ['none', 'view', 'edit', 'full']
};

const CERT_STATES = ['لا تحتاج', 'غير مصدرة', 'قيد الإصدار', 'صادرة'];
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
  },
  models: {
    sheet: 'قاعدة الموديلات',
    key: 'id',
    headers: ['id', 'code', 'department', 'factory', 'brand', 'description', 'unit', 'perContainer',
              'cert', 'certNo', 'certExp', 'status', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'],
    json: [],
    numbers: ['perContainer']
  },
  shipments: {
    sheet: 'الشحنات',
    key: 'id',
    headers: ['id', 'requestCode', 'poId', 'poNo', 'supplier', 'department', 'invoiceNo', 'port', 'readyDate',
              'lines', 'totalQty', 'totalContainers', 'status', 'serial', 'approvalNo', 'forwarder',
              'shipDate', 'eta', 'arrivalPort', 'broker', 'freight', 'freightCurrency',
              'inspection', 'inspectionNote', 'notes',
              'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'shippedBy', 'shippedAt', 'freeDays'],
    json: ['lines'],
    numbers: ['totalQty', 'totalContainers', 'freight']
  },
  containers: {
    sheet: 'الحاويات',
    key: 'id',
    headers: ['id', 'shipmentId', 'serial', 'invoiceNo', 'poNo', 'department', 'seq', 'containerNo', 'size',
              'model', 'qty', 'spareParts', 'arrivalPort', 'eta', 'dischargeDate', 'freeDays', 'warehouse',
              'receivedDate', 'receivedQty', 'receivedBy', 'emptyReturnDate', 'notes',
              'createdAt', 'updatedBy', 'updatedAt', 'declarationNo'],
    json: [],
    numbers: ['seq', 'qty']
  },
  files: {
    sheet: 'ملفات الشحنات',
    key: 'serial',
    headers: ['serial', 'billOfLading', 'shippingLine', 'vessel', 'actualArrival', 'docs',
              'declarationNo', 'declarationDate', 'releaseDate', 'exchangeRate', 'costs', 'vat',
              'claimAmount', 'claimStatus', 'claimNotes', 'notes', 'status', 'closedBy', 'closedAt',
              'updatedBy', 'updatedAt', 'declarations'],
    json: ['docs', 'costs', 'declarations'],
    numbers: []
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
      // قاعدة الموديلات
      case 'listModels':   return json_(listModels_(data));
      case 'saveModel':    return json_(saveModel_(data));
      case 'deleteModel':  return json_(deleteModel_(data));
      case 'importModels': return json_(importModels_(data));
      // الشحن
      case 'listShipments':     return json_(listShipments_(data));
      case 'shipmentOptions':   return json_(shipmentOptions_(data));
      case 'createShipment':    return json_(createShipment_(data));
      case 'updateShipment':    return json_(updateShipment_(data));
      case 'confirmShipment':   return json_(confirmShipment_(data));
      case 'unconfirmShipment': return json_(unconfirmShipment_(data));
      case 'deleteShipment':    return json_(deleteShipment_(data));
      // الحاويات
      case 'listContainers':    return json_(listContainers_(data));
      case 'updateContainer':   return json_(updateContainer_(data));
      case 'addContainer':      return json_(addContainer_(data));
      case 'bulkContainers':    return json_(bulkUpdateContainers_(data));
      case 'deleteContainer':   return json_(deleteContainer_(data));
      case 'findContainer':     return json_(findContainer_(data));
      case 'receiveContainer':  return json_(receiveContainer_(data));
      // ملفات الشحنات
      case 'listFiles':         return json_(listFiles_(data));
      case 'saveFile':          return json_(saveFile_(data));
      case 'closeFile':         return json_(closeFile_(data));
      case 'reopenFile':        return json_(reopenFile_(data));
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
  const shipments = readAll_('shipments');
  const orders = readAll_('orders')
    .filter(o => deptAllowed_(user, o.department))
    .map(o => {
      // تقدم الشحن لكل أمر
      const mine = shipments.filter(s => s.poId === o.id);
      o.requestedQty = mine.reduce((t, s) => t + (Number(s.totalQty) || 0), 0);
      o.shippedQty = mine.filter(s => s.status === SHIPPED).reduce((t, s) => t + (Number(s.totalQty) || 0), 0);
      return o;
    })
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
    if (existing) {
      // ما تنزل كمية موديل عن اللي انطلب شحنه
      const req = requestedByModel_(existing.id, readAll_('shipments'), '');
      const qty = {};
      const names = {};
      existing.items.concat(order.items).forEach(i => { names[i.model.toLowerCase()] = i.model; });
      order.items.forEach(i => { const k = i.model.toLowerCase(); qty[k] = (qty[k] || 0) + i.qty; });
      Object.keys(req).forEach(k => {
        if (req[k] > (qty[k] || 0)) throw new Error('الموديل ' + (names[k] || k) + ' مطلوب شحن ' + req[k] + ' منه؛ لا يمكن تقليل كميته عن ذلك');
      });
    }
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
    if (readAll_('shipments').some(s => s.poId === order.id)) throw new Error('لا يمكن حذف أمر عليه طلبات شحن');
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
   قاعدة الموديلات
========================================= */

/**
 * القائمة متاحة لمن له صلاحية على الموديلات، أو على أوامر الشراء
 * (حتى تتعبّى بيانات الموديل تلقائيًا عند إدخال الأوامر).
 */
function listModels_(data) {
  const user = requireUser_(data.token);
  if (level_(user, 'models') === 'none' && level_(user, 'orders') === 'none') {
    throw new Error('ليس لديك صلاحية لهذه العملية');
  }
  const models = readAll_('models')
    .filter(m => !m.department || deptAllowed_(user, m.department))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { success: true, models: models };
}

function saveModel_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'models', 'edit');
  const input = data.model || {};
  const model = cleanModel_(input, user);

  return withLock_(() => {
    const all = readAll_('models');
    const existing = input.id ? all.find(m => m.id === String(input.id)) : null;
    if (input.id && !existing) throw new Error('الموديل غير موجود، ربما حذفه شخص آخر');
    if (existing && existing.department && !deptAllowed_(user, existing.department)) {
      throw new Error('هذا الموديل يخص قسمًا آخر');
    }
    if (all.some(m => m.code.toLowerCase() === model.code.toLowerCase() && m.id !== String(input.id || ''))) {
      throw new Error('الموديل ' + model.code + ' موجود مسبقًا');
    }

    const now = nowText_();
    Object.assign(model, existing
      ? { id: existing.id, createdBy: existing.createdBy, createdAt: existing.createdAt }
      : { id: Utilities.getUuid(), createdBy: user.username, createdAt: now });
    model.updatedBy = user.username;
    model.updatedAt = now;

    writeRecord_('models', model);
    return { success: true, model: model, message: existing ? 'تم تحديث الموديل' : 'تم حفظ الموديل' };
  });
}

function deleteModel_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'models', 'full');

  return withLock_(() => {
    const model = readAll_('models').find(m => m.id === String(data.id));
    if (!model) throw new Error('الموديل غير موجود');
    if (model.department && !deptAllowed_(user, model.department)) throw new Error('هذا الموديل يخص قسمًا آخر');
    tableSheet_('models').deleteRow(findRow_('models', model.id));
    return { success: true, message: 'تم حذف الموديل ' + model.code };
  });
}

/**
 * استيراد مجموعة موديلات دفعة واحدة:
 * الموديل الموجود بنفس الكود يتحدّث، والجديد يُضاف. السطور الخاطئة تُتجاوز وتُذكر في النتيجة.
 */
function importModels_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'models', 'edit');
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) throw new Error('لا توجد بيانات للاستيراد');
  if (rows.length > 2000) throw new Error('الحد الأقصى 2000 موديل في المرة الواحدة');

  return withLock_(() => {
    const all = readAll_('models');
    const byCode = {};
    all.forEach(m => { byCode[m.code.toLowerCase()] = m; });

    const now = nowText_();
    const toWrite = {};
    const errors = [];
    let added = 0, updated = 0;

    rows.forEach((input, i) => {
      try {
        const model = cleanModel_(input, user);
        const key = model.code.toLowerCase();
        const existing = byCode[key];
        if (existing && existing.department && !deptAllowed_(user, existing.department)) {
          throw new Error('الموديل موجود ويخص قسمًا آخر');
        }
        if (existing) {
          Object.assign(model, { id: existing.id, createdBy: existing.createdBy, createdAt: existing.createdAt });
          if (!toWrite[key]) updated++;
        } else {
          Object.assign(model, { id: Utilities.getUuid(), createdBy: user.username, createdAt: now });
          added++;
        }
        model.updatedBy = user.username;
        model.updatedAt = now;
        byCode[key] = model;
        toWrite[key] = model;
      } catch (err) {
        errors.push({ row: Number(input.row) || i + 1, message: err.message });
      }
    });

    writeMany_('models', Object.keys(toWrite).map(k => toWrite[k]));
    return { success: true, added: added, updated: updated, errors: errors };
  });
}

/** يتحقق من بيانات الموديل وينظفها */
function cleanModel_(m, user) {
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const model = {
    code: text(m.code, 60),
    department: text(m.department, 60),
    factory: text(m.factory),
    brand: text(m.brand),
    description: text(m.description, 500),
    unit: text(m.unit, 30) || 'قطعة',
    perContainer: Number(String(m.perContainer == null ? '' : m.perContainer).replace(/,/g, '')) || 0,
    cert: text(m.cert, 30) || 'لا تحتاج',
    certNo: text(m.certNo, 60),
    certExp: text(m.certExp, 10),
    status: m.status === 'غير فعال' ? 'غير فعال' : 'فعال'
  };

  if (!model.code) throw new Error('أدخل كود الموديل');
  if (model.perContainer < 0) throw new Error('الكمية في الحاوية غير صحيحة');
  if (CERT_STATES.indexOf(model.cert) < 0) throw new Error('حالة الشهادة غير معروفة: ' + model.cert);
  if (model.certExp && !/^\d{4}-\d{2}-\d{2}$/.test(model.certExp)) throw new Error('تاريخ انتهاء الشهادة غير صحيح');

  // الموظف المرتبط بقسم: موديلاته تُسجّل على قسمه
  if (!isAdmin_(user) && user.dept) model.department = user.dept;
  return model;
}

/* =========================================
   الشحن: طلبات الشحن والبضاعة المشحونة
========================================= */

const SHIPPED = 'تم الشحن';
const FIRST_SERIAL = 18000;

/** حالة الطلب للعرض: قيد التصنيع قبل تاريخ الجاهزية، جاهزة للشحن بعده */
function shipState_(s) {
  if (s.status === SHIPPED) return SHIPPED;
  return s.readyDate && s.readyDate > todayText_() ? 'قيد التصنيع' : 'جاهزة للشحن';
}

/** الكمية المطلوب شحنها لكل موديل في أمر شراء (من كل الطلبات، باستثناء طلب معيّن) */
function requestedByModel_(poId, shipments, excludeId) {
  const sum = {};
  shipments.forEach(s => {
    if (s.poId !== poId || s.id === excludeId) return;
    (s.lines || []).forEach(l => {
      const k = String(l.model).toLowerCase();
      sum[k] = (sum[k] || 0) + (Number(l.qty) || 0);
    });
  });
  return sum;
}

/** بنود أمر الشراء مع المتاح للشحن */
function poAvailability_(po, shipments, excludeId) {
  const req = requestedByModel_(po.id, shipments, excludeId);
  const ordered = {};
  (po.items || []).forEach(i => {
    const k = String(i.model).toLowerCase();
    if (!ordered[k]) ordered[k] = { model: i.model, description: i.description, qty: 0, containers: 0 };
    ordered[k].qty += Number(i.qty) || 0;
    ordered[k].containers += Number(i.containers) || 0;
  });
  return Object.keys(ordered).map(k => {
    const o = ordered[k];
    const requested = req[k] || 0;
    return { model: o.model, description: o.description, ordered: o.qty, itemContainers: o.containers,
             requested: requested, available: Math.max(0, o.qty - requested) };
  });
}

function listShipments_(data) {
  const user = requireUser_(data.token);
  const shipped = data.scope === 'shipped';
  requirePage_(user, shipped ? 'shipped' : 'shipments', 'view');
  const counts = {};
  if (shipped) {
    readAll_('containers').forEach(c => {
      const k = c.shipmentId;
      counts[k] = counts[k] || { total: 0, received: 0 };
      counts[k].total++;
      if (c.receivedDate) counts[k].received++;
    });
  }
  const list = readAll_('shipments')
    .filter(s => (s.status === SHIPPED) === shipped && deptAllowed_(user, s.department))
    .map(s => Object.assign(s, { state: shipState_(s) }, shipped ? {
      containerRows: (counts[s.id] || {}).total || 0,
      receivedContainers: (counts[s.id] || {}).received || 0
    } : {}))
    .sort((a, b) => shipped
      ? (Number(b.serial) - Number(a.serial)) || b.shipDate.localeCompare(a.shipDate)
      : a.readyDate.localeCompare(b.readyDate) || a.createdAt.localeCompare(b.createdAt));
  return { success: true, shipments: list };
}

/** أوامر الشراء المعتمدة اللي فيها كميات متاحة للشحن (لنافذة طلب الشحن) */
function shipmentOptions_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'shipments', 'edit');
  const shipments = readAll_('shipments');
  const perContainer = {};
  readAll_('models').forEach(m => { if (m.perContainer) perContainer[m.code.toLowerCase()] = m.perContainer; });

  const orders = readAll_('orders')
    .filter(o => o.status === 'معتمد' && deptAllowed_(user, o.department))
    .map(o => ({
      id: o.id, poNo: o.poNo, supplier: o.supplier, department: o.department, date: o.date,
      lines: poAvailability_(o, shipments, '').map(l =>
        Object.assign(l, { perContainer: perContainer[String(l.model).toLowerCase()] || 0 }))
    }))
    .filter(o => o.lines.some(l => l.available > 0))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { success: true, orders: orders };
}

function createShipment_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'shipments', 'edit');
  const input = data.shipment || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);

  const invoiceNo = text(input.invoiceNo, 60);
  const port = text(input.port, 60).toUpperCase();
  const readyDate = text(input.readyDate, 10);
  if (!invoiceNo) throw new Error('أدخل رقم الفاتورة');
  if (!port) throw new Error('أدخل ميناء التحميل');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readyDate)) throw new Error('حدد تاريخ جاهزية البضاعة');

  return withLock_(() => {
    const po = readAll_('orders').find(o => o.id === String(input.poId));
    if (!po) throw new Error('أمر الشراء غير موجود');
    if (po.status !== 'معتمد') throw new Error('أمر الشراء غير معتمد بعد');
    if (!deptAllowed_(user, po.department)) throw new Error('هذا الأمر يخص قسمًا آخر');

    const all = readAll_('shipments');
    const avail = {};
    poAvailability_(po, all, '').forEach(l => { avail[String(l.model).toLowerCase()] = l; });

    const lines = (Array.isArray(input.lines) ? input.lines : [])
      .map(l => ({ model: text(l.model, 60), qty: Number(l.qty) || 0, containers: Number(l.containers) || 0 }))
      .filter(l => l.qty > 0);
    if (!lines.length) throw new Error('حدد كمية أكبر من صفر لموديل واحد على الأقل');

    lines.forEach(l => {
      const a = avail[l.model.toLowerCase()];
      if (!a) throw new Error('الموديل ' + l.model + ' غير موجود في أمر الشراء');
      if (l.qty > a.available) throw new Error('الكمية المطلوبة للموديل ' + l.model + ' أكبر من المتاح (' + a.available + ')');
      if (l.containers < 0) throw new Error('عدد الحاويات غير صحيح');
      l.model = a.model;
      l.description = a.description;
    });

    // كود الطلب: الميناء-BASIC-اليوم-الشهر-السنة-رقم
    const d = todayText_().split('-');
    const prefix = port.replace(/\s+/g, '_') + '-BASIC-' + d[2] + d[1] + d[0] + '-';
    const seq = all.reduce((mx, s) => s.requestCode.indexOf(prefix) === 0
      ? Math.max(mx, Number(s.requestCode.slice(prefix.length)) || 0) : mx, 0) + 1;

    const now = nowText_();
    const shipment = {
      id: Utilities.getUuid(),
      requestCode: prefix + ('00' + seq).slice(-3),
      poId: po.id, poNo: po.poNo, supplier: po.supplier, department: po.department,
      invoiceNo: invoiceNo, port: port, readyDate: readyDate,
      lines: lines,
      totalQty: lines.reduce((s, l) => s + l.qty, 0),
      totalContainers: lines.reduce((s, l) => s + l.containers, 0),
      status: 'طلب', serial: '',
      approvalNo: '', forwarder: '', shipDate: '', eta: '', arrivalPort: '', broker: '',
      freight: 0, freightCurrency: 'USD', inspection: 'لم يُفحص', inspectionNote: '',
      notes: text(input.notes, 500),
      createdBy: user.username, createdAt: now, updatedBy: user.username, updatedAt: now,
      shippedBy: '', shippedAt: ''
    };
    writeRecord_('shipments', shipment);
    shipment.state = shipState_(shipment);
    return { success: true, shipment: shipment, message: 'تم إنشاء طلب الشحن ' + shipment.requestCode };
  });
}

/** تحديث بيانات الشحن (قبل التعميد وبعده) */
function updateShipment_(data) {
  const user = requireUser_(data.token);
  const input = data.shipment || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const date = (v, label) => {
    v = text(v, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' غير صحيح');
    return v;
  };

  return withLock_(() => {
    const s = readAll_('shipments').find(x => x.id === String(input.id));
    if (!s) throw new Error('الشحنة غير موجودة');
    if (!deptAllowed_(user, s.department)) throw new Error('هذه الشحنة تخص قسمًا آخر');
    requirePage_(user, s.status === SHIPPED ? 'shipped' : 'shipments', 'edit');

    const fields = {
      invoiceNo: text(input.invoiceNo, 60) || s.invoiceNo,
      approvalNo: text(input.approvalNo, 60),
      forwarder: text(input.forwarder),
      shipDate: date(input.shipDate, 'تاريخ الشحن'),
      eta: date(input.eta, 'تاريخ الوصول المتوقع'),
      arrivalPort: text(input.arrivalPort, 60),
      broker: text(input.broker),
      freight: Number(input.freight) || 0,
      freightCurrency: text(input.freightCurrency, 5) || 'USD',
      inspection: ['لم يُفحص', 'مجتاز', 'مرفوض', 'معفى'].indexOf(input.inspection) >= 0 ? input.inspection : s.inspection,
      inspectionNote: text(input.inspectionNote),
      notes: text(input.notes, 500),
      freeDays: input.freeDays === '' || input.freeDays == null ? '' : Math.max(0, Math.round(Number(input.freeDays) || 0))
    };
    if (s.status !== SHIPPED) {
      const rd = date(input.readyDate, 'تاريخ الجاهزية');
      if (rd) fields.readyDate = rd;
    } else {
      if (!fields.shipDate) throw new Error('تاريخ الشحن مطلوب للشحنة المعمّدة');
      if (!fields.arrivalPort) throw new Error('ميناء الوصول مطلوب للشحنة المعمّدة');
      if (fields.freeDays === '') throw new Error('فترة السماح مطلوبة للشحنة المعمّدة');
    }

    Object.assign(s, fields, { updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('shipments', s);
    if (s.status === SHIPPED) {
      // تحديث بيانات الحاويات المرتبطة (الفاتورة، ميناء الوصول، الوصول المتوقع)
      const mine = readAll_('containers').filter(c => c.shipmentId === s.id);
      mine.forEach(c => {
        c.invoiceNo = s.invoiceNo;
        c.eta = s.eta;
        if (!c.receivedDate) c.arrivalPort = s.arrivalPort;
        if (!c.emptyReturnDate) c.freeDays = s.freeDays;   // فترة السماح مربوطة بالشحنة
      });
      writeMany_('containers', mine);
    }
    s.state = shipState_(s);
    return { success: true, shipment: s, message: 'تم حفظ بيانات الشحن' };
  });
}

/** تعميد الشحن: تنتقل الشحنة إلى البضاعة المشحونة وتأخذ رقم تسلسل */
function confirmShipment_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'shipments', 'full');
  updateShipment_(data);   // يحفظ آخر البيانات المدخلة أولًا

  return withLock_(() => {
    const all = readAll_('shipments');
    const s = all.find(x => x.id === String((data.shipment || {}).id));
    if (!s) throw new Error('الشحنة غير موجودة');
    if (s.status === SHIPPED) throw new Error('الشحنة معمّدة مسبقًا');

    const missing = [];
    if (!s.shipDate) missing.push('تاريخ الشحن');
    if (!s.arrivalPort) missing.push('ميناء الوصول');
    if (!s.invoiceNo) missing.push('رقم الفاتورة');
    if (!s.approvalNo) missing.push('رقم الاعتماد');
    if (s.freeDays === '' || s.freeDays == null) missing.push('فترة السماح (الأيام المجانية)');
    if (missing.length) throw new Error('لتعميد الشحن أكمل: ' + missing.join('، '));
    if (['مجتاز', 'معفى'].indexOf(s.inspection) < 0) {
      throw new Error('لا يمكن تعميد الشحن قبل اجتياز فحص ما قبل الشحن (أو تسجيله «معفى»)');
    }

    // نفس الفاتورة = نفس التسلسل
    const shipped = all.filter(x => x.status === SHIPPED);
    const same = shipped.find(x => x.invoiceNo.toLowerCase() === s.invoiceNo.toLowerCase());
    const maxSerial = shipped.reduce((mx, x) => Math.max(mx, Number(x.serial) || 0), FIRST_SERIAL - 1);
    s.serial = same ? same.serial : String(maxSerial + 1);

    const now = nowText_();
    Object.assign(s, { status: SHIPPED, shippedBy: user.username, shippedAt: now, updatedBy: user.username, updatedAt: now });
    writeRecord_('shipments', s);
    s.state = SHIPPED;
    const n = createContainersFor_(s);
    s.containerRows = n;
    s.receivedContainers = 0;
    return { success: true, shipment: s, message: 'تم تعميد الشحن — التسلسل ' + s.serial + (n ? ' — أُنشئت ' + n + ' حاوية في المتابعة' : '') };
  });
}

/** إلغاء التعميد: ترجع الشحنة إلى طلبات الشحن */
function unconfirmShipment_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'shipped', 'full');

  return withLock_(() => {
    const s = readAll_('shipments').find(x => x.id === String(data.id));
    if (!s) throw new Error('الشحنة غير موجودة');
    if (!deptAllowed_(user, s.department)) throw new Error('هذه الشحنة تخص قسمًا آخر');
    if (s.status !== SHIPPED) throw new Error('الشحنة غير معمّدة');
    const mine = readAll_('containers').filter(c => c.shipmentId === s.id);
    if (mine.some(c => c.receivedDate)) throw new Error('لا يمكن إلغاء التعميد: فيه حاويات مستلمة من هذه الشحنة');
    const file = readAll_('files').find(f => f.serial === s.serial);
    if (file && file.status === 'مقفل') throw new Error('لا يمكن إلغاء التعميد: ملف الشحنة مقفل');
    deleteWhere_('containers', c => c.shipmentId === s.id);
    Object.assign(s, { status: 'طلب', serial: '', shippedBy: '', shippedAt: '', updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('shipments', s);
    s.state = shipState_(s);
    return { success: true, shipment: s, message: 'أُلغي تعميد الشحنة ' + s.requestCode };
  });
}

function deleteShipment_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'shipments', 'full');

  return withLock_(() => {
    const s = readAll_('shipments').find(x => x.id === String(data.id));
    if (!s) throw new Error('الشحنة غير موجودة');
    if (!deptAllowed_(user, s.department)) throw new Error('هذه الشحنة تخص قسمًا آخر');
    if (s.status === SHIPPED) throw new Error('الشحنة معمّدة؛ ألغِ التعميد أولًا من صفحة البضاعة المشحونة');
    tableSheet_('shipments').deleteRow(findRow_('shipments', s.id));
    return { success: true, message: 'تم حذف طلب الشحن ' + s.requestCode };
  });
}

/* =========================================
   الحاويات: المتابعة والاستلام
========================================= */

const CONTAINER_SIZES = ['20', '40', '40HC', '45'];

/** حالة الحاوية */
function containerState_(c) {
  if (c.emptyReturnDate) return 'أُعيد الفارغ';
  if (c.receivedDate) return 'استلمت';
  if (c.dischargeDate) return 'في الميناء';
  return 'في الطريق';
}

/** ينشئ سطور الحاويات لشحنة معمّدة (مرة واحدة)، ويوزّع الموديلات حسب حاويات كل بند */
function createContainersFor_(s) {
  if (readAll_('containers').some(c => c.shipmentId === s.id)) return 0;
  const rows = [];
  (s.lines || []).forEach(l => {
    const n = Math.max(0, Math.round(Number(l.containers) || 0));
    if (!n) return;
    const per = Math.floor((Number(l.qty) || 0) / n);
    for (let i = 0; i < n; i++) {
      rows.push({ model: l.model, qty: i === n - 1 ? (Number(l.qty) || 0) - per * (n - 1) : per });
    }
  });
  const total = Math.max(1, Math.round(Number(s.totalContainers) || 0), rows.length);
  while (rows.length < total) rows.push({ model: '', qty: 0 });

  const now = nowText_();
  writeMany_('containers', rows.map((r, i) => ({
    id: Utilities.getUuid(), shipmentId: s.id, serial: s.serial, invoiceNo: s.invoiceNo, poNo: s.poNo,
    department: s.department, seq: i + 1, containerNo: '', size: '', model: r.model, qty: r.qty, spareParts: '',
    arrivalPort: s.arrivalPort, eta: s.eta, dischargeDate: '', freeDays: s.freeDays, warehouse: '', declarationNo: '',
    receivedDate: '', receivedQty: '', receivedBy: '', emptyReturnDate: '', notes: '',
    createdAt: now, updatedBy: '', updatedAt: now
  })));
  return rows.length;
}

function cleanDecl_(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
}

/** تاريخ فسح بيان كل حاوية (من ملف الشحنة) */
function declReleases_() {
  const map = {};
  readAll_('files').forEach(f => {
    const d = f.declarations && !Array.isArray(f.declarations) ? f.declarations : {};
    Object.keys(d).forEach(no => { map[f.serial + '|' + no] = d[no] || {}; });
  });
  return map;
}

function withDecl_(c, rel) {
  const d = c.declarationNo ? rel[c.serial + '|' + c.declarationNo] || {} : {};
  return Object.assign(c, { state: containerState_(c), declReleaseDate: d.release || '' });
}

function listContainers_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'containers', 'view');
  const rel = declReleases_();
  const list = readAll_('containers')
    .filter(c => deptAllowed_(user, c.department))
    .map(c => withDecl_(c, rel))
    .sort((a, b) => (Number(b.serial) - Number(a.serial)) || (Number(a.seq) - Number(b.seq)));
  return { success: true, containers: list };
}

function cleanContainerNo_(v) {
  const no = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  if (no && !/^[A-Z]{4}\d{7}$/.test(no)) throw new Error('رقم الحاوية غير صحيح: 4 حروف ثم 7 أرقام (مثال MSCU1234567)');
  return no;
}

/** ما يتكرر رقم الحاوية في حاويات ما رجع فارغها */
function checkDuplicateNo_(all, no, id) {
  if (!no) return;
  const dup = all.find(c => c.id !== id && c.containerNo === no && !c.emptyReturnDate);
  if (dup) throw new Error('الحاوية ' + no + ' مسجلة مسبقًا في التسلسل ' + dup.serial);
}

function updateContainer_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'containers', 'edit');
  const input = data.container || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const date = (v, label) => {
    v = text(v, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' غير صحيح');
    return v;
  };

  return withLock_(() => {
    const all = readAll_('containers');
    const c = all.find(x => x.id === String(input.id));
    if (!c) throw new Error('الحاوية غير موجودة');
    if (!deptAllowed_(user, c.department)) throw new Error('هذه الحاوية تخص قسمًا آخر');

    const no = cleanContainerNo_(input.containerNo);
    checkDuplicateNo_(all, no, c.id);
    const size = CONTAINER_SIZES.indexOf(input.size) >= 0 ? input.size : '';
    const fields = {
      containerNo: no, size: size,
      model: text(input.model, 60), qty: Number(input.qty) || 0, spareParts: text(input.spareParts),
      arrivalPort: text(input.arrivalPort, 60),
      dischargeDate: date(input.dischargeDate, 'تاريخ التفريغ'),
      declarationNo: cleanDecl_(input.declarationNo),
      warehouse: text(input.warehouse, 60),
      receivedDate: date(input.receivedDate, 'تاريخ الاستلام'),
      receivedQty: input.receivedQty === '' || input.receivedQty == null ? '' : Math.max(0, Number(input.receivedQty) || 0),
      emptyReturnDate: date(input.emptyReturnDate, 'تاريخ إرجاع الفارغ'),
      notes: text(input.notes, 500)
    };
    if (fields.receivedDate && !fields.containerNo) throw new Error('أدخل رقم الحاوية قبل تسجيل الاستلام');
    if (fields.emptyReturnDate && !fields.receivedDate) throw new Error('سجّل الاستلام قبل إرجاع الفارغ');
    if (fields.receivedDate && fields.dischargeDate && fields.receivedDate < fields.dischargeDate) {
      throw new Error('تاريخ الاستلام قبل تاريخ التفريغ');
    }
    if (fields.receivedDate && !c.receivedDate) fields.receivedBy = user.username;
    if (!fields.receivedDate) fields.receivedBy = '';

    Object.assign(c, fields, { updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('containers', c);
    withDecl_(c, declReleases_());
    return { success: true, container: c, message: 'تم حفظ الحاوية' + (c.containerNo ? ' ' + c.containerNo : '') };
  });
}

/** تعديل جماعي: رقم البيان و/أو تاريخ التفريغ لمجموعة حاويات */
function bulkUpdateContainers_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'containers', 'edit');
  const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
  const f = data.fields || {};
  if (!ids.length) throw new Error('حدد حاوية واحدة على الأقل');
  const decl = f.declarationNo !== undefined && f.declarationNo !== '' ? cleanDecl_(f.declarationNo) : null;
  const disc = f.dischargeDate !== undefined && f.dischargeDate !== '' ? String(f.dischargeDate).trim() : null;
  if (disc && !/^\d{4}-\d{2}-\d{2}$/.test(disc)) throw new Error('تاريخ التفريغ غير صحيح');
  if (decl === null && disc === null) throw new Error('أدخل رقم البيان أو تاريخ التفريغ');

  return withLock_(() => {
    const all = readAll_('containers');
    const picked = all.filter(c => ids.indexOf(c.id) >= 0);
    if (picked.length !== ids.length) throw new Error('بعض الحاويات غير موجودة، حدّث الصفحة');
    picked.forEach(c => {
      if (!deptAllowed_(user, c.department)) throw new Error('بعض الحاويات تخص قسمًا آخر');
      if (disc && c.receivedDate && c.receivedDate < disc) throw new Error('الحاوية ' + (c.containerNo || c.seq) + ' مستلمة قبل تاريخ التفريغ المدخل');
    });
    const now = nowText_();
    picked.forEach(c => {
      if (decl !== null) c.declarationNo = decl;
      if (disc !== null) c.dischargeDate = disc;
      c.updatedBy = user.username;
      c.updatedAt = now;
    });
    writeMany_('containers', picked);
    const rel = declReleases_();
    return { success: true, containers: picked.map(c => withDecl_(c, rel)), message: 'تم تحديث ' + picked.length + ' حاوية' };
  });
}

/** إضافة حاوية لنفس الشحنة (لو عدد الحاويات الفعلي أكثر من المسجّل) */
function addContainer_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'containers', 'full');

  return withLock_(() => {
    const all = readAll_('containers');
    const base = all.find(x => x.id === String(data.id));
    if (!base) throw new Error('الحاوية غير موجودة');
    if (!deptAllowed_(user, base.department)) throw new Error('هذه الحاوية تخص قسمًا آخر');
    const seq = all.filter(x => x.shipmentId === base.shipmentId).reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0) + 1;
    const now = nowText_();
    const c = {
      id: Utilities.getUuid(), shipmentId: base.shipmentId, serial: base.serial, invoiceNo: base.invoiceNo,
      poNo: base.poNo, department: base.department, seq: seq, containerNo: '', size: '', model: '', qty: 0,
      spareParts: '', arrivalPort: base.arrivalPort, eta: base.eta, dischargeDate: base.dischargeDate,
      freeDays: base.freeDays, declarationNo: base.declarationNo, warehouse: '', receivedDate: '', receivedQty: '', receivedBy: '',
      emptyReturnDate: '', notes: '', createdAt: now, updatedBy: user.username, updatedAt: now
    };
    writeRecord_('containers', c);
    c.state = containerState_(c);
    return { success: true, container: c, message: 'أُضيفت حاوية رقم ' + seq + ' للتسلسل ' + c.serial };
  });
}

function deleteContainer_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'containers', 'full');

  return withLock_(() => {
    const all = readAll_('containers');
    const c = all.find(x => x.id === String(data.id));
    if (!c) throw new Error('الحاوية غير موجودة');
    if (!deptAllowed_(user, c.department)) throw new Error('هذه الحاوية تخص قسمًا آخر');
    if (c.receivedDate) throw new Error('لا يمكن حذف حاوية مستلمة');
    if (all.filter(x => x.shipmentId === c.shipmentId).length <= 1) throw new Error('هذه آخر حاوية في الشحنة');
    tableSheet_('containers').deleteRow(findRow_('containers', c.id));
    return { success: true, message: 'تم حذف الحاوية' };
  });
}

/* ===== شاشة الاستلام (للمستودع) ===== */

function findContainer_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'receive', 'edit');
  const q = String(data.q || '').toUpperCase().replace(/[\s-]/g, '');
  if (q.length < 4) return { success: true, containers: [] };
  const rel = declReleases_();
  const list = readAll_('containers')
    .filter(c => c.containerNo && c.containerNo.indexOf(q) >= 0 && deptAllowed_(user, c.department))
    .map(c => withDecl_(c, rel))
    .sort((a, b) => (a.receivedDate ? 1 : 0) - (b.receivedDate ? 1 : 0))
    .slice(0, 10);
  return { success: true, containers: list };
}

function receiveContainer_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'receive', 'edit');
  const input = data.receipt || {};
  const date = String(input.receivedDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('حدد تاريخ الاستلام');
  if (date > todayText_()) throw new Error('تاريخ الاستلام في المستقبل');
  const warehouse = String(input.warehouse || '').trim().slice(0, 60);
  if (!warehouse) throw new Error('اختر المستودع');

  return withLock_(() => {
    const c = readAll_('containers').find(x => x.id === String(input.id));
    if (!c) throw new Error('الحاوية غير موجودة');
    if (!deptAllowed_(user, c.department)) throw new Error('هذه الحاوية تخص قسمًا آخر');
    if (c.receivedDate) throw new Error('الحاوية مستلمة مسبقًا بتاريخ ' + c.receivedDate);

    const qty = input.receivedQty === '' || input.receivedQty == null ? Number(c.qty) || '' : Math.max(0, Number(input.receivedQty) || 0);
    const note = String(input.notes || '').trim().slice(0, 300);
    Object.assign(c, {
      receivedDate: date, receivedQty: qty, warehouse: warehouse, receivedBy: user.username,
      notes: note ? (c.notes ? c.notes + ' | ' : '') + 'الاستلام: ' + note : c.notes,
      updatedBy: user.username, updatedAt: nowText_()
    });
    writeRecord_('containers', c);
    c.state = containerState_(c);
    return { success: true, container: c, message: 'تم استلام الحاوية ' + c.containerNo };
  });
}

/* =========================================
   ملفات الشحنات والتخليص (ملف لكل تسلسل)
========================================= */

const FILE_DOCS = ['invoice', 'packing', 'origin', 'saber', 'insurance', 'hbl', 'mbl', 'telex', 'bank', 'freightInvoice'];
const FILE_COSTS = ['freight', 'duty', 'port', 'clearance', 'transport', 'storage', 'saber', 'other'];

function fileState_(f) {
  if (f.status === 'مقفل') return 'مقفل';
  const decls = f.declarations || [];
  const released = decls.filter(d => d.release).length;
  if (decls.length && released === decls.length && !f.noDeclContainers) return 'مفسوحة';
  if (released) return 'مفسوحة جزئيًا';
  if (decls.length) return 'تحت التخليص';
  if (f.actualArrival || f.firstDischarge) return 'وصلت - بانتظار البيان';
  return 'في البحر';
}

/** يجمع بيانات الشحنات والحاويات وأسعار أوامر الشراء لكل تسلسل */
function buildFiles_(user) {
  const orders = {};
  readAll_('orders').forEach(o => { orders[o.id] = o; });
  const saved = {};
  readAll_('files').forEach(f => { saved[f.serial] = f; });
  const cnt = {};
  readAll_('containers').forEach(c => {
    const k = c.serial;
    cnt[k] = cnt[k] || { total: 0, received: 0, firstDischarge: '', decl: {}, noDecl: 0 };
    cnt[k].total++;
    if (c.declarationNo) cnt[k].decl[c.declarationNo] = (cnt[k].decl[c.declarationNo] || 0) + 1;
    else cnt[k].noDecl++;
    if (c.receivedDate) cnt[k].received++;
    if (c.dischargeDate && (!cnt[k].firstDischarge || c.dischargeDate < cnt[k].firstDischarge)) cnt[k].firstDischarge = c.dischargeDate;
  });

  const groups = {};
  readAll_('shipments').filter(s => s.status === SHIPPED).forEach(s => {
    const g = groups[s.serial] = groups[s.serial] || {
      serial: s.serial, invoiceNo: s.invoiceNo, poNos: [], suppliers: [], departments: [],
      port: s.port, arrivalPort: s.arrivalPort, eta: s.eta, shipDate: s.shipDate,
      broker: s.broker, forwarder: s.forwarder, freightOrig: 0, freightCurrency: s.freightCurrency || 'USD',
      currency: '', goodsValue: 0, totalQty: 0, lines: [], shipmentIds: []
    };
    g.shipmentIds.push(s.id);
    if (g.poNos.indexOf(s.poNo) < 0) g.poNos.push(s.poNo);
    if (g.suppliers.indexOf(s.supplier) < 0) g.suppliers.push(s.supplier);
    if (g.departments.indexOf(s.department) < 0) g.departments.push(s.department);
    if (!g.broker && s.broker) g.broker = s.broker;
    if (!g.forwarder && s.forwarder) g.forwarder = s.forwarder;
    g.freightOrig += Number(s.freight) || 0;

    const po = orders[s.poId] || { items: [], currency: 'USD' };
    if (!g.currency) g.currency = po.currency || 'USD';
    (s.lines || []).forEach(l => {
      const item = (po.items || []).find(i => String(i.model).toLowerCase() === String(l.model).toLowerCase()) || {};
      const price = Number(item.price) || 0;
      const qty = Number(l.qty) || 0;
      g.lines.push({ model: l.model, poNo: s.poNo, qty: qty, price: price, value: Math.round(qty * price * 100) / 100 });
      g.goodsValue += qty * price;
      g.totalQty += qty;
    });
  });

  return Object.keys(groups).map(k => {
    const g = groups[k];
    g.goodsValue = Math.round(g.goodsValue * 100) / 100;
    const c = cnt[k] || { total: 0, received: 0, firstDischarge: '', decl: {}, noDecl: 0 };
    const f = saved[k] || {};
    const savedDecl = f.declarations && !Array.isArray(f.declarations) ? f.declarations : {};
    const declarations = Object.keys(c.decl).sort().map(no => ({
      no: no, containers: c.decl[no], date: (savedDecl[no] || {}).date || '', release: (savedDecl[no] || {}).release || ''
    }));
    const file = Object.assign(g, {
      containers: c.total, receivedContainers: c.received, firstDischarge: c.firstDischarge,
      declarations: declarations, noDeclContainers: c.noDecl,
      billOfLading: f.billOfLading || '', shippingLine: f.shippingLine || '', vessel: f.vessel || '',
      actualArrival: f.actualArrival || '', docs: f.docs && !Array.isArray(f.docs) ? f.docs : {},
      exchangeRate: f.exchangeRate || '', costs: f.costs && !Array.isArray(f.costs) ? f.costs : {},
      vat: f.vat || '', claimAmount: f.claimAmount || '', claimStatus: f.claimStatus || '', claimNotes: f.claimNotes || '',
      notes: f.notes || '', status: f.status || 'مفتوح', closedBy: f.closedBy || '', closedAt: f.closedAt || '',
      updatedBy: f.updatedBy || '', updatedAt: f.updatedAt || ''
    });
    file.state = fileState_(file);
    return file;
  })
    .filter(f => f.departments.some(d => deptAllowed_(user, d)))
    .sort((a, b) => Number(b.serial) - Number(a.serial));
}

function listFiles_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'files', 'view');
  return { success: true, files: buildFiles_(user) };
}

function getFile_(user, serial) {
  const f = buildFiles_(user).find(x => x.serial === String(serial));
  if (!f) throw new Error('الملف غير موجود أو يخص قسمًا آخر');
  return f;
}

function saveFile_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'files', 'edit');
  const input = data.file || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const date = (v, label) => {
    v = text(v, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' غير صحيح');
    return v;
  };
  const money = (v, label) => {
    if (v === '' || v == null) return '';
    const n = Number(String(v).replace(/,/g, ''));
    if (!(n >= 0)) throw new Error(label + ' غير صحيح');
    return Math.round(n * 100) / 100;
  };

  return withLock_(() => {
    const f = getFile_(user, input.serial);
    if (f.status === 'مقفل') throw new Error('الملف مقفل؛ أعد فتحه أولًا للتعديل');

    const docs = {};
    FILE_DOCS.forEach(d => { docs[d] = !!(input.docs && input.docs[d]); });
    const costs = {};
    FILE_COSTS.forEach(c => { costs[c] = money(input.costs && input.costs[c], 'التكلفة'); });

    // تواريخ البيانات: فقط البيانات الموجودة على حاويات هذه الشحنة
    const declarations = {};
    const known = {};
    f.declarations.forEach(d => { known[d.no] = true; });
    (Array.isArray(input.declarations) ? input.declarations : []).forEach(d => {
      const no = cleanDecl_(d.no);
      if (!known[no]) return;
      const dd = date(d.date, 'تاريخ البيان ' + no);
      const rd = date(d.release, 'تاريخ فسح البيان ' + no);
      if (rd && dd && rd < dd) throw new Error('تاريخ فسح البيان ' + no + ' قبل تاريخ البيان');
      declarations[no] = { date: dd, release: rd };
    });

    const rec = {
      serial: f.serial,
      billOfLading: text(input.billOfLading, 60), shippingLine: text(input.shippingLine, 60), vessel: text(input.vessel, 100),
      actualArrival: date(input.actualArrival, 'تاريخ الوصول الفعلي'),
      docs: docs,
      declarations: declarations,
      exchangeRate: money(input.exchangeRate, 'سعر الصرف'),
      costs: costs, vat: money(input.vat, 'ضريبة الاستيراد'),
      claimAmount: money(input.claimAmount, 'مبلغ المطالبة'),
      claimStatus: ['', 'مفتوحة', 'مقبولة', 'مرفوضة', 'مُسددة'].indexOf(input.claimStatus) >= 0 ? input.claimStatus : '',
      claimNotes: text(input.claimNotes, 500), notes: text(input.notes, 500),
      status: 'مفتوح', closedBy: '', closedAt: '',
      updatedBy: user.username, updatedAt: nowText_()
    };

    writeRecord_('files', rec);
    return { success: true, file: getFile_(user, f.serial), message: 'تم حفظ ملف الشحنة ' + f.serial };
  });
}

function closeFile_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'files', 'full');
  saveFile_(data);   // يحفظ آخر التعديلات أولًا

  return withLock_(() => {
    const f = getFile_(user, (data.file || {}).serial);
    const missing = [];
    if (f.noDeclContainers) missing.push('رقم البيان لـ ' + f.noDeclContainers + ' حاوية (من متابعة الحاويات)');
    const notReleased = f.declarations.filter(d => !d.release).map(d => d.no);
    if (notReleased.length) missing.push('تاريخ فسح البيان ' + notReleased.join('، '));
    if (!f.containers || f.receivedContainers < f.containers) missing.push('استلام كل الحاويات (' + f.receivedContainers + ' من ' + f.containers + ')');
    if (f.claimStatus === 'مفتوحة') missing.push('إغلاق المطالبة المفتوحة');
    if (missing.length) throw new Error('لإقفال الملف أكمل: ' + missing.join('، '));

    const rec = readAll_('files').find(x => x.serial === f.serial);
    Object.assign(rec, { status: 'مقفل', closedBy: user.username, closedAt: nowText_(), updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('files', rec);
    return { success: true, file: getFile_(user, f.serial), message: 'تم إقفال ملف الشحنة ' + f.serial };
  });
}

function reopenFile_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'files', 'full');

  return withLock_(() => {
    const f = getFile_(user, data.serial);
    if (f.status !== 'مقفل') throw new Error('الملف غير مقفل');
    const rec = readAll_('files').find(x => x.serial === f.serial);
    Object.assign(rec, { status: 'مفتوح', closedBy: '', closedAt: '', updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('files', rec);
    return { success: true, file: getFile_(user, f.serial), message: 'أُعيد فتح ملف الشحنة ' + f.serial };
  });
}

/** يحذف كل السطور اللي تحقق الشرط (من تحت لفوق) */
function deleteWhere_(key, test) {
  const t = TABLES[key];
  const sheet = tableSheet_(key);
  const head = header_(key);
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const values = sheet.getRange(2, 1, last - 1, head.length).getValues();
  let n = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    const o = {};
    head.forEach((h, j) => { o[h] = String(values[i][j]); });
    if (o[t.key] !== '' && test(o)) { sheet.deleteRow(i + 2); n++; }
  }
  return n;
}

function todayText_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
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

/** يكتب عدة سجلات دفعة واحدة (أسرع بكثير من سجل سجل عند الاستيراد) */
function writeMany_(key, records) {
  if (!records.length) return;
  const t = TABLES[key];
  const sheet = tableSheet_(key);
  const head = header_(key);
  const ki = head.indexOf(t.key);
  const last = sheet.getLastRow();
  const data = last > 1 ? sheet.getRange(2, 1, last - 1, head.length).getValues() : [];
  const index = {};
  data.forEach((r, i) => { index[String(r[ki]).toLowerCase()] = i; });

  records.forEach(obj => {
    const row = head.map(h => {
      const v = obj[h];
      if (v == null) return '';
      return t.json.indexOf(h) >= 0 ? JSON.stringify(v) : v;
    });
    const k = String(obj[t.key]).toLowerCase();
    if (index[k] !== undefined) data[index[k]] = row;
    else { index[k] = data.length; data.push(row); }
  });

  const range = sheet.getRange(2, 1, data.length, head.length);
  range.setNumberFormat('@');
  range.setValues(data.map(r => r.map(v => v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v)));
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
