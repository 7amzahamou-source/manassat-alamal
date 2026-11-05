/**
 * منصة العمل — الخادم
 * الخطوة 34: البلاغات (الموظف يرفع مشكلته، والمدير يرد ويحلها) + إيميل للمدير
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
  files: ['none', 'view', 'edit', 'full'],
  dashboard: ['none', 'view'],
  report: ['none', 'view'],
  rates: ['none', 'view', 'edit', 'full'],
  lcs: ['none', 'view', 'edit', 'full']
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
              'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'approvedBy', 'approvedAt', 'ports', 'contact'],
    json: ['items', 'ports'],
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
              'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'shippedBy', 'shippedAt', 'freeDays', 'lcId', 'invoiceValue'],
    json: ['lines'],
    numbers: ['totalQty', 'totalContainers', 'freight', 'invoiceValue']
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
              'updatedBy', 'updatedAt', 'declarations', 'hblNo', 'insurer'],
    json: ['docs', 'costs', 'declarations'],
    numbers: []
  },
  rates: {
    sheet: 'أسعار الشحن',
    key: 'date',
    headers: ['date', 'prices', 'updatedBy', 'updatedAt'],
    json: ['prices'],
    numbers: []
  },
  lcs: {
    sheet: 'الاعتمادات البنكية',
    key: 'id',
    headers: ['id', 'lcNo', 'bank', 'supplier', 'currency', 'amount', 'tolerance', 'payType', 'usanceDays',
              'issueDate', 'expiryDate', 'latestShipDate', 'presentationDays', 'partial',
              'pos', 'amendments', 'presentations', 'charges', 'status', 'notes',
              'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'closedBy', 'closedAt', 'incoterm', 'usanceFrom',
              'insurer', 'goodsType', 'origin'],
    json: ['pos', 'amendments', 'presentations', 'charges'],
    numbers: ['amount', 'tolerance', 'usanceDays', 'presentationDays']
  },
  tickets: {
    sheet: 'البلاغات',
    key: 'id',
    headers: ['id', 'no', 'title', 'type', 'priority', 'description', 'ref', 'status', 'createdBy', 'createdByName', 'department',
              'createdAt', 'updatedAt', 'assignedTo', 'resolvedBy', 'resolvedAt', 'resolution', 'messages',
              'seenByAdmin', 'seenByUser', 'lastBy'],
    json: ['messages'],
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
      // لوحة الإدارة
      case 'dashboard':         return json_(dashboard_(data));
      // تقرير الإدارة العليا وأسعار الشحن
      case 'report':            return json_(report_(data));
      case 'listRates':         return json_(listRates_(data));
      case 'saveRates':         return json_(saveRates_(data));
      case 'deleteRates':       return json_(deleteRates_(data));
      // الاعتمادات البنكية
      case 'listLcs':           return json_(listLcs_(data));
      case 'saveLc':            return json_(saveLc_(data));
      case 'closeLc':           return json_(closeLc_(data));
      case 'reopenLc':          return json_(reopenLc_(data));
      case 'deleteLc':          return json_(deleteLc_(data));
      // استيراد البيانات من Excel (للمدير)
      case 'importData':        return json_(importData_(data));
      // البلاغات
      case 'listMyTickets':     return json_(listMyTickets_(data));
      case 'createTicket':      return json_(createTicket_(data));
      case 'myTicketAction':    return json_(myTicketAction_(data));
      case 'listTickets':       return json_(listTickets_(data));
      case 'ticketAction':      return json_(ticketAction_(data));
      case 'ticketBadges':      return json_(ticketBadges_(data));
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
  const lcs = readAll_('lcs');
  const today = todayText_();
  const orders = readAll_('orders')
    .filter(o => deptAllowed_(user, o.department))
    .map(o => {
      // تقدم الشحن لكل أمر
      const mine = shipments.filter(s => s.poId === o.id);
      o.requestedQty = mine.reduce((t, s) => t + (Number(s.totalQty) || 0), 0);
      o.shippedQty = mine.filter(s => s.status === SHIPPED).reduce((t, s) => t + (Number(s.totalQty) || 0), 0);
      o.lcs = lcs.filter(l => (l.pos || []).some(p => p.poId === o.id)).map(l => {
        const e = lcEffective_(l);
        return { id: l.id, lcNo: l.lcNo, bank: l.bank, amount: e.amount, currency: l.currency, payType: l.payType,
                 usanceDays: l.usanceDays, expiry: e.expiry, state: lcState_(l, today) };
      });
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
    if (readAll_('lcs').some(l => (l.pos || []).some(p => p.poId === order.id))) throw new Error('لا يمكن حذف أمر مربوط باعتماد بنكي');
    tableSheet_('orders').deleteRow(findRow_('orders', order.id));
    return { success: true, message: 'تم حذف الأمر' };
  });
}

/** شروط التسليم المعتمدة (C&F = CFR) */
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
function cleanIncoterm_(v) {
  v = String(v || '').trim().toUpperCase().replace('C&F', 'CFR').replace('CNF', 'CFR');
  return INCOTERMS.indexOf(v) >= 0 ? v : '';
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
    incoterm: cleanIncoterm_(o.incoterm),
    ports: (Array.isArray(o.ports) ? o.ports : String(o.ports || '').split(/[,،\n]/))
      .map(p => cleanPort_(p)).filter((p, i, a) => p && a.indexOf(p) === i).slice(0, 10),
    payMethod: text(o.payMethod) || 'T/T',
    depositPct: Number(o.depositPct) || 0,
    contact: text(o.contact).slice(0, 100),
    notes: text(o.notes)
  };

  if (!order.poNo) throw new Error('أدخل رقم أمر الشراء');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.date)) throw new Error('حدد تاريخ الأمر');
  if (!order.department) throw new Error('اختر القسم');
  if (!order.supplier) throw new Error('أدخل المورد / المصنع');
  if (!order.incoterm) throw new Error('اختر شرط التسليم (Incoterm)');
  if (!order.ports.length) throw new Error('أضف ميناء شحن واحد على الأقل');
  if (order.depositPct < 0 || order.depositPct > 100) throw new Error('الدفعة المقدمة بين 0 و 100%');

  const items = (Array.isArray(o.items) ? o.items : [])
    .map(i => ({
      model: text(i.model),
      description: text(i.description),
      qty: Number(i.qty) || 0,
      containers: Number(i.containers) || 0
    }))
    .filter(i => i.model || i.qty);

  if (!items.length) throw new Error('أضف بندًا واحدًا على الأقل');
  items.forEach((i, n) => {
    if (!i.model) throw new Error('البند ' + (n + 1) + ': أدخل الموديل');
    if (!(i.qty > 0)) throw new Error('البند ' + (n + 1) + ': الكمية يجب أن تكون أكبر من صفر');
    if (i.containers < 0) throw new Error('البند ' + (n + 1) + ': قيمة غير صحيحة');
  });

  order.items = items;
  order.totalQty = items.reduce((s, i) => s + i.qty, 0);
  order.totalValue = '';   // بدون أسعار: القيمة تُسجّل على الفاتورة في طلب الشحن
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
  const lcNo = {};
  const allShipments = readAll_('shipments');
  const orders = readAll_('orders');
  const lcViews = lcViews_(readAll_('lcs'), allShipments, orders);
  const payOf = {};
  orders.forEach(o => { payOf[o.id] = o.payMethod; });
  lcViews.forEach(l => { lcNo[l.id] = l.lcNo; });
  const list = allShipments
    .filter(s => (s.status === SHIPPED) === shipped && deptAllowed_(user, s.department))
    .map(s => Object.assign(s, {
      state: shipState_(s), lcNo: (lcNo[s.lcId] || ''), payMethod: payOf[s.poId] || '',
      lcChoices: lcChoices_(lcViews, s.poId)
    }, shipped ? {
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

  const lcs = lcViews_(readAll_('lcs'), shipments, readAll_('orders'));
  const orders = readAll_('orders')
    .filter(o => o.status === 'معتمد' && deptAllowed_(user, o.department))
    .map(o => ({
      id: o.id, poNo: o.poNo, supplier: o.supplier, department: o.department, date: o.date,
      payMethod: o.payMethod, currency: o.currency, incoterm: o.incoterm, ports: o.ports || [], lcs: lcChoices_(lcs, o.id),
      lines: poAvailability_(o, shipments, '').map(l =>
        Object.assign(l, { perContainer: perContainer[String(l.model).toLowerCase()] || 0 }))
    }))
    .filter(o => o.lines.some(l => l.available > 0))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { success: true, orders: orders };
}

/** الاعتمادات المفتوحة اللي تغطي أمر شراء (لقائمة الاختيار في الشحن) */
function lcChoices_(views, poId) {
  return views.filter(l => l.state !== 'مقفل' && (l.pos || []).some(p => p.poId === poId))
    .map(l => ({ id: l.id, lcNo: l.lcNo, bank: l.bank, currency: l.currency, available: l.available,
                 expiry: l.effExpiry, latestShip: l.effLatestShip, state: l.state }));
}

/** يتحقق من ربط الشحنة باعتماد (عند الإنشاء/التعديل) */
function checkLcLink_(lcId, poId) {
  if (!lcId) return '';
  const lc = readAll_('lcs').find(l => l.id === String(lcId));
  if (!lc) throw new Error('الاعتماد البنكي غير موجود');
  if (lc.status === 'مقفل') throw new Error('الاعتماد ' + lc.lcNo + ' مقفل');
  if (!(lc.pos || []).some(p => p.poId === poId)) throw new Error('الاعتماد ' + lc.lcNo + ' لا يغطي أمر الشراء هذا');
  return lc.id;
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
    if (money_(input.invoiceValue) < 0) throw new Error('قيمة الفاتورة غير صحيحة');

    lines.forEach(l => {
      const a = avail[l.model.toLowerCase()];
      if (!a) throw new Error('الموديل ' + l.model + ' غير موجود في أمر الشراء');
      if (l.qty > a.available) throw new Error('الكمية المطلوبة للموديل ' + l.model + ' أكبر من المتاح (' + a.available + ')');
      if (l.containers < 0) throw new Error('عدد الحاويات غير صحيح');
      l.model = a.model;
      l.description = a.description;
    });

    // كود الطلب: الميناء-REQ-اليوم الشهر السنة-رقم
    const d = todayText_().split('-');
    const prefix = port.replace(/\s+/g, '_') + '-REQ-' + d[2] + d[1] + d[0] + '-';
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
      shippedBy: '', shippedAt: '', freeDays: '',
      lcId: checkLcLink_(input.lcId, po.id),
      invoiceValue: money_(input.invoiceValue)
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
      freeDays: input.freeDays === '' || input.freeDays == null ? '' : Math.max(0, Math.round(Number(input.freeDays) || 0)),
      invoiceValue: input.invoiceValue === undefined ? s.invoiceValue : money_(input.invoiceValue)
    };
    if (fields.invoiceValue < 0) throw new Error('قيمة الفاتورة غير صحيحة');
    if (input.lcId !== undefined && String(input.lcId || '') !== String(s.lcId || '')) {
      if (s.lcId) {
        const old = readAll_('lcs').find(l => l.id === s.lcId);
        if (old && (old.presentations || []).some(p => p.shipmentId === s.id && p.status !== 'مرفوضة')) {
          throw new Error('مستندات هذه الشحنة مقدمة على الاعتماد ' + old.lcNo + '؛ لا يمكن تغيير الاعتماد');
        }
      }
      fields.lcId = checkLcLink_(input.lcId, s.poId);
    }
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
    if (!s.approvalNo) missing.push('رقم اعتماد الشحن');
    if (s.freeDays === '' || s.freeDays == null) missing.push('فترة السماح (الأيام المجانية)');
    if (missing.length) throw new Error('لتعميد الشحن أكمل: ' + missing.join('، '));
    if (['مجتاز', 'معفى'].indexOf(s.inspection) < 0) {
      throw new Error('لا يمكن تعميد الشحن قبل اجتياز فحص ما قبل الشحن (أو تسجيله «معفى»)');
    }
    checkLcForShipment_(s, all);

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
    if (readAll_('lcs').some(l => (l.presentations || []).some(p => p.shipmentId === s.id && p.status !== 'مرفوضة'))) {
      throw new Error('لا يمكن إلغاء التعميد: مستندات هذه الشحنة مقدمة للبنك');
    }
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
    g.goodsValue += Number(s.invoiceValue) || 0;
    if (!(Number(s.invoiceValue) > 0)) g.missingValue = (g.missingValue || 0) + 1;

    const po = orders[s.poId] || { items: [], currency: 'USD' };
    if (!g.currency) g.currency = po.currency || 'USD';
    (s.lines || []).forEach(l => {
      const qty = Number(l.qty) || 0;
      g.lines.push({ model: l.model, poNo: s.poNo, qty: qty });
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
      hblNo: f.hblNo || '', insurer: f.insurer || '',
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
      hblNo: text(input.hblNo, 60), insurer: text(input.insurer, 100),
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

/* =========================================
   لوحة الإدارة
========================================= */

function addDaysText_(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function daysBetweenText_(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
}

/** الأيام المجانية للحاوية: آخر يوم والمتبقي (سالب = متأخر) */
function freeTimeOf_(c, today) {
  if (!c.dischargeDate || c.freeDays === '' || c.freeDays == null) return null;
  const last = addDaysText_(c.dischargeDate, Number(c.freeDays) || 0);
  return { last: last, left: daysBetweenText_(c.emptyReturnDate || today, last) };
}

function dashboard_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'dashboard', 'view');
  const today = todayText_();
  const in14 = addDaysText_(today, 14);

  const orders = readAll_('orders').filter(o => deptAllowed_(user, o.department));
  const shipments = readAll_('shipments').filter(s => deptAllowed_(user, s.department));
  const containers = readAll_('containers').filter(c => deptAllowed_(user, c.department));
  const models = readAll_('models').filter(m => m.status !== 'غير فعال' && (!m.department || deptAllowed_(user, m.department)));
  const files = buildFiles_(user);

  const pending = shipments.filter(s => s.status !== SHIPPED).map(s => Object.assign(s, { state: shipState_(s) }));
  const shipped = shipments.filter(s => s.status === SHIPPED);
  containers.forEach(c => { c.state = containerState_(c); c.free = freeTimeOf_(c, today); });
  const cCount = st => containers.filter(c => c.state === st).length;

  // ===== الأرقام العامة =====
  const approved = orders.filter(o => o.status === 'معتمد');
  const orderedQty = approved.reduce((t, o) => t + (Number(o.totalQty) || 0), 0);
  const shippedQty = shipped.filter(s => approved.some(o => o.id === s.poId))
    .reduce((t, s) => t + (Number(s.totalQty) || 0), 0);

  // ===== مسار البضاعة =====
  const pipeline = [
    { key: 'approval', label: 'بانتظار الاعتماد', unit: 'أمر', value: orders.length - approved.length, page: 'orders' },
    { key: 'mfg', label: 'قيد التصنيع', unit: 'طلب', value: pending.filter(s => s.state === 'قيد التصنيع').length, page: 'shipments' },
    { key: 'ready', label: 'جاهزة للشحن', unit: 'طلب', value: pending.filter(s => s.state === 'جاهزة للشحن').length, page: 'shipments' },
    { key: 'sea', label: 'في البحر', unit: 'حاوية', value: cCount('في الطريق'), page: 'containers' },
    { key: 'port', label: 'في الميناء', unit: 'حاوية', value: cCount('في الميناء'), page: 'containers' },
    { key: 'received', label: 'مستلمة بالمستودع', unit: 'حاوية', value: cCount('استلمت'), page: 'containers' },
    { key: 'returned', label: 'أُعيد الفارغ', unit: 'حاوية', value: cCount('أُعيد الفارغ'), page: 'containers' }
  ];

  // ===== التنبيهات =====
  const alerts = [];
  const add = (level, count, text, page) => { if (count) alerts.push({ level: level, count: count, text: text, page: page }); };
  const overdue = containers.filter(c => c.free && !c.emptyReturnDate && c.free.left < 0);
  const ending = containers.filter(c => c.free && !c.emptyReturnDate && c.free.left >= 0 && c.free.left <= 3);
  add('bad', overdue.length, 'حاوية تجاوزت فترة السماح (أرضيات)', 'containers');
  add('wait', ending.length, 'حاوية تنتهي فترة سماحها خلال 3 أيام', 'containers');
  add('wait', containers.filter(c => c.state === 'في الميناء' && !c.declarationNo).length, 'حاوية في الميناء بدون بيان جمركي', 'containers');
  add('wait', containers.filter(c => c.state === 'في الميناء').filter(c => daysBetweenText_(c.dischargeDate, today) > 7).length,
    'حاوية في الميناء من أكثر من 7 أيام ولم تُستلم', 'containers');
  add('wait', containers.filter(c => c.state === 'في الطريق' && !c.containerNo).length, 'حاوية مشحونة بدون رقم', 'containers');
  add('wait', orders.length - approved.length, 'أمر شراء بانتظار الاعتماد', 'orders');
  add('wait', pending.filter(s => s.state === 'جاهزة للشحن' && daysBetweenText_(s.readyDate, today) > 7).length,
    'طلب شحن جاهز من أكثر من 7 أيام ولم يُعمّد', 'shipments');
  add('wait', pending.filter(s => s.state === 'جاهزة للشحن' && ['مجتاز', 'معفى'].indexOf(s.inspection) < 0).length,
    'طلب شحن جاهز ولم يجتز الفحص', 'shipments');
  add('wait', files.filter(f => f.state === 'وصلت - بانتظار البيان').length, 'ملف شحنة وصل وبانتظار البيان', 'files');
  add('wait', files.filter(f => f.state === 'مفسوحة').length, 'ملف شحنة مفسوح ولم يُقفل', 'files');
  const certExpired = models.filter(m => m.cert === 'صادرة' && m.certExp && m.certExp < today).length;
  const certSoon = models.filter(m => m.cert === 'صادرة' && m.certExp && m.certExp >= today && daysBetweenText_(today, m.certExp) <= 30).length;
  add('bad', certExpired, 'موديل شهادة SASO منتهية', 'models');
  add('wait', certSoon, 'موديل شهادة SASO تنتهي خلال 30 يوم', 'models');
  add('wait', models.filter(m => m.cert === 'غير مصدرة' || m.cert === 'قيد الإصدار').length, 'موديل شهادة SASO غير مصدرة أو قيد الإصدار', 'models');
  const lcViews = lcAlerts_(user, pending, add);
  if (isAdmin_(user)) {
    const tk = readAll_('tickets').filter(t => TICKET_OPEN.indexOf(t.status) >= 0);
    add('bad', tk.filter(t => t.priority === 'عاجلة').length, 'بلاغ عاجل مفتوح من الموظفين', 'tickets');
    add('wait', tk.filter(t => t.priority !== 'عاجلة' && (t.status === 'جديد' || t.status === 'معاد فتحه')).length, 'بلاغ جديد من الموظفين', 'tickets');
  }
  alerts.sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));

  // ===== الحاويات حسب الأيام المجانية =====
  const freeList = containers.filter(c => c.free && !c.emptyReturnDate && c.free.left <= 7)
    .sort((a, b) => a.free.left - b.free.left).slice(0, 10)
    .map(c => ({ containerNo: c.containerNo, serial: c.serial, declarationNo: c.declarationNo, state: c.state,
                 warehouse: c.warehouse, last: c.free.last, left: c.free.left }));

  // ===== الوصول خلال 14 يوم =====
  const arrivals = shipped.filter(s => s.eta && s.eta <= in14)
    .map(s => {
      const mine = containers.filter(c => c.shipmentId === s.id);
      return { serial: s.serial, invoiceNo: s.invoiceNo, poNo: s.poNo, eta: s.eta, port: s.port, arrivalPort: s.arrivalPort,
               containers: mine.length || Number(s.totalContainers) || 0, atSea: mine.filter(c => c.state === 'في الطريق').length };
    })
    .filter(a => a.atSea > 0)
    .sort((a, b) => a.eta.localeCompare(b.eta)).slice(0, 10);

  // ===== أكبر الموردين والموانئ (عدد الحاويات المشحونة) =====
  const top = keyOf => {
    const m = {};
    shipped.forEach(s => {
      const k = keyOf(s) || '—';
      m[k] = (m[k] || 0) + (containers.filter(c => c.shipmentId === s.id).length || Number(s.totalContainers) || 0);
    });
    return Object.keys(m).map(k => ({ name: k, value: m[k] })).sort((a, b) => b.value - a.value).slice(0, 5);
  };

  return {
    success: true,
    today: today,
    kpis: {
      orders: orders.length, approvedOrders: approved.length,
      orderedQty: orderedQty, shippedQty: shippedQty,
      containers: containers.length, inTransit: cCount('في الطريق') + cCount('في الميناء'),
      openFiles: files.filter(f => f.state !== 'مقفل').length, closedFiles: files.filter(f => f.state === 'مقفل').length,
      overdue: overdue.length,
      openLcs: lcViews.filter(l => l.state !== 'مقفل').length
    },
    pipeline: pipeline,
    alerts: alerts,
    freeList: freeList,
    arrivals: arrivals,
    topSuppliers: top(s => s.supplier),
    topPorts: top(s => s.port)
  };
}

/* =========================================
   أسعار الشحن (إدخال يومي)
========================================= */

/** موانئ الوصول في أسعار الشحن */
const RATE_DESTS = ['dmm', 'jed', 'rbg'];   // الدمام، جدة، رابغ

const DEFAULT_PORTS = ['NINGBO', 'SHANGHAI', 'SHEKOU', 'NANSHA', 'QINGDAO', 'XIAMEN', 'TIANJIN', 'HONG KONG'];

function cleanPort_(p) {
  return String(p || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40);
}

function readRates_() {
  return readAll_('rates')
    .map(r => ({ date: r.date, prices: r.prices && !Array.isArray(r.prices) ? r.prices : {}, updatedBy: r.updatedBy, updatedAt: r.updatedAt }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** قائمة الموانئ: الافتراضية + اللي انسعّرت قبل + اللي انشحن منها */
function ratePorts_(rates) {
  const set = {};
  DEFAULT_PORTS.forEach(p => { set[p] = true; });
  rates.forEach(r => Object.keys(r.prices).forEach(p => { set[p] = true; }));
  readAll_('shipments').forEach(s => { if (s.port) set[cleanPort_(s.port)] = true; });
  return Object.keys(set);
}

function listRates_(data) {
  const user = requireUser_(data.token);
  if (level_(user, 'rates') === 'none' && level_(user, 'report') === 'none') throw new Error('ليس لديك صلاحية لهذه العملية');
  const rates = readRates_();
  return { success: true, rates: rates, ports: ratePorts_(rates) };
}

function saveRates_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'rates', 'edit');
  const date = String(data.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('حدد تاريخ الأسعار');
  if (date > todayText_()) throw new Error('تاريخ الأسعار في المستقبل');

  const prices = {};
  const input = data.prices || {};
  Object.keys(input).forEach(p => {
    const port = cleanPort_(p);
    if (!port) return;
    const v = {};
    RATE_DESTS.forEach(k => {
      const raw = input[p] && input[p][k];
      if (raw === '' || raw == null) return;
      const n = Number(String(raw).replace(/,/g, ''));
      if (!(n > 0) || n > 100000) throw new Error('سعر غير صحيح لميناء ' + port);
      v[k] = Math.round(n);
    });
    if (Object.keys(v).length) prices[port] = v;
  });
  if (!Object.keys(prices).length) throw new Error('أدخل سعرًا واحدًا على الأقل');

  return withLock_(() => {
    const exists = readAll_('rates').some(r => r.date === date);
    writeRecord_('rates', { date: date, prices: prices, updatedBy: user.username, updatedAt: nowText_() });
    const rates = readRates_();
    return { success: true, rates: rates, ports: ratePorts_(rates),
             message: (exists ? 'تم تحديث أسعار ' : 'تم حفظ أسعار ') + date + ' (' + Object.keys(prices).length + ' ميناء)' };
  });
}

function deleteRates_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'rates', 'full');
  return withLock_(() => {
    const row = findRow_('rates', String(data.date));
    if (!row) throw new Error('لا توجد أسعار بهذا التاريخ');
    tableSheet_('rates').deleteRow(row);
    const rates = readRates_();
    return { success: true, rates: rates, ports: ratePorts_(rates), message: 'تم حذف أسعار ' + data.date };
  });
}

/** آخر سعر لكل ميناء ووجهة، والسعر اللي قبله للمقارنة */
function latestRates_(rates) {
  const out = {};
  rates.forEach(r => Object.keys(r.prices).forEach(p => {
    out[p] = out[p] || {};
    RATE_DESTS.forEach(k => {
      const v = r.prices[p][k];
      if (!v) return;
      const cur = out[p][k];
      out[p][k] = { value: v, date: r.date, prev: cur ? cur.value : null, prevDate: cur ? cur.date : '' };
    });
  }));
  return Object.keys(out).sort().map(p => {
    const row = { port: p };
    RATE_DESTS.forEach(k => { row[k] = out[p][k] || null; });
    return row;
  });
}

/* =========================================
   تقرير الإدارة العليا
========================================= */

function report_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'report', 'view');
  const today = todayText_();

  const shipments = readAll_('shipments').filter(s => deptAllowed_(user, s.department));
  const containers = readAll_('containers').filter(c => deptAllowed_(user, c.department));
  containers.forEach(c => { c.state = containerState_(c); c.free = freeTimeOf_(c, today); });

  // ===== البضائع (على مستوى البند) =====
  const lineRows = list => {
    const rows = [];
    list.forEach(s => (s.lines || []).forEach(l => rows.push({
      poNo: s.poNo, supplier: s.supplier, model: l.model, qty: Number(l.qty) || 0, containers: Number(l.containers) || 0,
      invoiceNo: s.invoiceNo, port: s.port, readyDate: s.readyDate, requestCode: s.requestCode,
      serial: s.serial, shipDate: s.shipDate, eta: s.eta, arrivalPort: s.arrivalPort, inspection: s.inspection
    })));
    return rows;
  };
  const pending = shipments.filter(s => s.status !== SHIPPED);
  const mfg = pending.filter(s => shipState_(s) === 'قيد التصنيع').sort((a, b) => a.readyDate.localeCompare(b.readyDate));
  const ready = pending.filter(s => shipState_(s) === 'جاهزة للشحن').sort((a, b) => a.readyDate.localeCompare(b.readyDate));

  // المشحونة: الشحنات المعمّدة اللي ما اكتمل استلام حاوياتها
  const openShipped = shipments.filter(s => s.status === SHIPPED)
    .filter(s => {
      const mine = containers.filter(c => c.shipmentId === s.id);
      return !mine.length || mine.some(c => !c.receivedDate);
    })
    .sort((a, b) => (a.eta || '9').localeCompare(b.eta || '9'));

  // ===== الحاويات حسب المرحلة =====
  const cRow = c => ({
    containerNo: c.containerNo, serial: c.serial, poNo: c.poNo, invoiceNo: c.invoiceNo, model: c.model, qty: Number(c.qty) || 0,
    arrivalPort: c.arrivalPort, eta: c.eta, dischargeDate: c.dischargeDate, declarationNo: c.declarationNo,
    warehouse: c.warehouse, receivedDate: c.receivedDate,
    freeLast: c.free ? c.free.last : '', freeLeft: c.free ? c.free.left : null
  });
  const bySerial = (a, b) => (Number(a.serial) - Number(b.serial)) || (Number(a.seq) - Number(b.seq));
  const atSea = containers.filter(c => c.state === 'في الطريق').sort(bySerial).map(cRow);
  const noDecl = containers.filter(c => c.state === 'في الميناء' && !c.declarationNo).sort(bySerial).map(cRow);
  const inYard = containers.filter(c => c.state === 'في الميناء' && c.declarationNo).sort(bySerial).map(cRow);
  const received = containers.filter(c => c.state === 'استلمت')
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)).map(cRow);
  const returned = containers.filter(c => c.state === 'أُعيد الفارغ').length;

  // ===== حسب المستودع =====
  const wh = {};
  containers.filter(c => c.receivedDate).forEach(c => {
    const k = c.warehouse || 'غير محدد';
    wh[k] = wh[k] || { warehouse: k, containers: 0, notReturned: 0, qty: 0, models: {} };
    wh[k].containers++;
    if (!c.emptyReturnDate) wh[k].notReturned++;
    const q = Number(c.receivedQty !== '' ? c.receivedQty : c.qty) || 0;
    wh[k].qty += q;
    if (c.model) wh[k].models[c.model] = (wh[k].models[c.model] || 0) + q;
  });
  const warehouses = Object.keys(wh).map(k => {
    const w = wh[k];
    w.models = Object.keys(w.models).map(m => ({ model: m, qty: w.models[m] })).sort((a, b) => b.qty - a.qty);
    return w;
  }).sort((a, b) => b.containers - a.containers);

  const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const rates = readRates_();

  return {
    success: true,
    today: today,
    goods: {
      mfg: lineRows(mfg),
      ready: lineRows(ready),
      shipped: lineRows(openShipped)
    },
    containers: { atSea: atSea, noDecl: noDecl, inYard: inYard, received: received, returned: returned },
    summary: {
      mfg: { qty: sum(lineRows(mfg), 'qty'), containers: sum(lineRows(mfg), 'containers'), requests: mfg.length },
      ready: { qty: sum(lineRows(ready), 'qty'), containers: sum(lineRows(ready), 'containers'), requests: ready.length },
      shipped: { qty: sum(lineRows(openShipped), 'qty'), containers: sum(lineRows(openShipped), 'containers'), invoices: openShipped.length }
    },
    warehouses: warehouses,
    rates: { latest: latestRates_(rates), lastDate: rates.length ? rates[rates.length - 1].date : '' },
    lcs: lcReport_(user)
  };
}

/* =========================================
   الاعتمادات البنكية (L/C)
   الاعتماد ممكن يغطي أكثر من أمر شراء، والأمر ممكن يكون له أكثر من اعتماد
========================================= */

const LC_PAY_TYPES = ['اطلاع', 'آجل'];
const LC_PRES_STATES = ['مقدمة', 'بها ملاحظات', 'مقبولة', 'مرفوضة'];
const round2_ = v => Math.round((Number(v) || 0) * 100) / 100;

/** القيم الفعلية بعد التعديلات (المبلغ، الصلاحية، آخر موعد شحن) */
function lcEffective_(l) {
  let amount = Number(l.amount) || 0, expiry = l.expiryDate, latest = l.latestShipDate;
  (l.amendments || []).forEach(a => {
    amount += Number(a.amountDelta) || 0;
    if (a.newExpiry) expiry = a.newExpiry;
    if (a.newLatestShip) latest = a.newLatestShip;
  });
  return { amount: round2_(amount), expiry: expiry || '', latest: latest || '' };
}

function lcState_(l, today) {
  if (l.status === 'مقفل') return 'مقفل';
  const e = lcEffective_(l);
  if (e.expiry && e.expiry < today) return 'منتهي';
  return 'مفتوح';
}

/** قيمة الشحنة = إجمالي الفاتورة (ما فيه أسعار وحدات في المنصة) */
function shipmentValue_(s) {
  return round2_(Number(s.invoiceValue) || 0);
}

/** رقم مبلغ (يقبل الفواصل) */
function money_(v) {
  return round2_(String(v == null ? '' : v).replace(/,/g, ''));
}

/** المستخدم من الاعتماد: المستندات المقدمة + الشحنات المعمّدة اللي ما قُدّمت مستنداتها */
function lcUsed_(l, shipments, ordersById, excludeShipmentId) {
  const pres = (l.presentations || []).filter(p => p.status !== 'مرفوضة' && p.shipmentId !== excludeShipmentId);
  const presented = {};
  let used = 0;
  pres.forEach(p => { used += Number(p.amount) || 0; if (p.shipmentId) presented[p.shipmentId] = true; });
  shipments.filter(s => s.lcId === l.id && s.status === SHIPPED && s.id !== excludeShipmentId && !presented[s.id])
    .forEach(s => { used += shipmentValue_(s); });
  return round2_(used);
}

/** عرض محسوب لكل اعتماد */
function lcViews_(lcs, shipments, orders) {
  const today = todayText_();
  const ordersById = {};
  orders.forEach(o => { ordersById[o.id] = o; });
  return lcs.map(l => {
    const e = lcEffective_(l);
    const limit = round2_(e.amount * (1 + (Number(l.tolerance) || 0) / 100));
    const used = lcUsed_(l, shipments, ordersById, '');
    const linked = shipments.filter(s => s.lcId === l.id).map(s => ({
      id: s.id, requestCode: s.requestCode, serial: s.serial, invoiceNo: s.invoiceNo, poNo: s.poNo,
      shipDate: s.shipDate, readyDate: s.readyDate, status: s.status, totalQty: s.totalQty,
      totalContainers: s.totalContainers, value: shipmentValue_(s)
    }));
    // السداد بالتاريخ: المقبولة اللي حلّ تاريخ استحقاقها = مسددة، اللي لسه = غير مستحقة (آجل)
    const t = { paid: 0, due: 0, notDue: 0, pending: 0, committed: 0 };
    const pres = (l.presentations || []).map(p => {
      const amount = Number(p.amount) || 0;
      let bucket = 'مرفوضة', remaining = 0;
      if (p.status !== 'مرفوضة') {
        if (p.status !== 'مقبولة') { bucket = 'بانتظار قبول البنك'; remaining = amount; t.pending += amount; }
        else if (p.dueDate && p.dueDate > today) { bucket = 'غير مستحقة'; remaining = amount; t.notDue += amount; }
        else { bucket = 'مسددة'; t.paid += amount; }
      }
      return Object.assign({}, p, {
        remaining: round2_(remaining), bucket: bucket, paid: bucket === 'مسددة',
        daysLeft: p.dueDate ? daysBetweenText_(today, p.dueDate) : null
      });
    });
    const presented = {};
    pres.filter(p => p.status !== 'مرفوضة' && p.shipmentId).forEach(p => { presented[p.shipmentId] = true; });
    linked.filter(s => s.status === SHIPPED && !presented[s.id]).forEach(s => { t.committed += s.value; });
    const unpaid = pres.filter(p => p.status !== 'مرفوضة' && p.remaining > 0.005);
    const paid = t.paid;
    const schedule = unpaid.filter(p => p.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(p => ({ invoiceNo: p.invoiceNo, serial: p.serial, dueDate: p.dueDate, amount: p.remaining, daysLeft: p.daysLeft, bucket: p.bucket }));
    let state = lcState_(l, today);
    if (state === 'مفتوح' && limit - used <= 0.005) state = 'مستخدم بالكامل';
    return Object.assign({}, l, {
      effAmount: e.amount, effExpiry: e.expiry, effLatestShip: e.latest, limit: limit,
      used: used, available: round2_(limit - used), paid: round2_(paid),
      due: round2_(t.due), notDue: round2_(t.notDue), pendingAccept: round2_(t.pending), committed: round2_(t.committed),
      balanceBefore: round2_(limit - paid), schedule: schedule,
      charges: l.charges || [], chargesTotal: round2_((l.charges || []).reduce((t, c) => t + (Number(c.amount) || 0), 0)),
      presentations: pres, unpaid: unpaid.length,
      nextDue: schedule.length ? schedule[0].dueDate : '',
      daysToExpiry: e.expiry ? daysBetweenText_(today, e.expiry) : null,
      daysToLatestShip: e.latest ? daysBetweenText_(today, e.latest) : null,
      shipments: linked, state: state
    });
  });
}

/** شرط تعميد الشحن لأوامر L/C: اعتماد صالح ورصيد كافي */
function checkLcForShipment_(s, allShipments) {
  const orders = readAll_('orders');
  const po = orders.find(o => o.id === s.poId);
  const needs = po && po.payMethod === 'L/C';
  if (!s.lcId) {
    if (needs) throw new Error('أمر الشراء ' + s.poNo + ' طريقة دفعه L/C: اختر الاعتماد البنكي للشحنة قبل التعميد');
    return;
  }
  const lc = readAll_('lcs').find(l => l.id === s.lcId);
  if (!lc) throw new Error('الاعتماد البنكي المرتبط بالشحنة غير موجود');
  const today = todayText_();
  const e = lcEffective_(lc);
  if (lc.status === 'مقفل') throw new Error('الاعتماد ' + lc.lcNo + ' مقفل');
  if (!(lc.pos || []).some(p => p.poId === s.poId)) throw new Error('الاعتماد ' + lc.lcNo + ' لا يغطي أمر الشراء ' + s.poNo);
  if (e.expiry && e.expiry < today) throw new Error('الاعتماد ' + lc.lcNo + ' منتهي الصلاحية (' + e.expiry + ') — يحتاج تعديل تمديد');
  if (e.latest && s.shipDate > e.latest) throw new Error('تاريخ الشحن ' + s.shipDate + ' بعد آخر موعد شحن في الاعتماد ' + lc.lcNo + ' (' + e.latest + ') — يحتاج تعديل');
  if (e.expiry && s.shipDate > e.expiry) throw new Error('تاريخ الشحن بعد صلاحية الاعتماد ' + lc.lcNo);
  const ordersById = {};
  orders.forEach(o => { ordersById[o.id] = o; });
  const limit = e.amount * (1 + (Number(lc.tolerance) || 0) / 100);
  const avail = round2_(limit - lcUsed_(lc, allShipments, ordersById, s.id));
  const value = shipmentValue_(s);
  if (!(value > 0)) throw new Error('سجّل «قيمة الفاتورة» للشحنة قبل التعميد — تنخصم من رصيد الاعتماد ' + lc.lcNo);
  if (value > avail + 0.005) {
    throw new Error('قيمة الشحنة ' + value + ' ' + lc.currency + ' أكبر من رصيد الاعتماد ' + lc.lcNo + ' المتاح (' + avail + ') — يحتاج تعديل زيادة مبلغ');
  }
}

/** يقيّد الاعتمادات بالأقسام: يظهر الاعتماد لو أحد أوامره من قسم الموظف (أو ما له أوامر) */
function lcAllowed_(user, l, ordersById) {
  const pos = l.pos || [];
  return !pos.length || pos.some(p => ordersById[p.poId] && deptAllowed_(user, ordersById[p.poId].department));
}

function listLcs_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'lcs', 'view');
  const orders = readAll_('orders');
  const ordersById = {};
  orders.forEach(o => { ordersById[o.id] = o; });
  const lcsRaw = readAll_('lcs');
  const views = lcViews_(lcsRaw, readAll_('shipments'), orders)
    .filter(l => lcAllowed_(user, l, ordersById))
    .sort((a, b) => (a.state === 'مقفل') - (b.state === 'مقفل') || String(b.issueDate).localeCompare(String(a.issueDate)));

  // أوامر الشراء المعتمدة مع مقدار تغطيتها بالاعتمادات
  const covered = {};
  lcsRaw.forEach(l => (l.pos || []).forEach(p => { (covered[p.poId] = covered[p.poId] || []).push(l.lcNo); }));
  const poOptions = orders.filter(o => o.status === 'معتمد' && deptAllowed_(user, o.department))
    .map(o => ({ id: o.id, poNo: o.poNo, supplier: o.supplier, currency: o.currency, payMethod: o.payMethod, incoterm: cleanIncoterm_(o.incoterm),
                 totalQty: Number(o.totalQty) || 0, otherLcs: covered[o.id] || [], department: o.department }))
    .sort((a, b) => (b.payMethod === 'L/C') - (a.payMethod === 'L/C') || String(a.poNo).localeCompare(String(b.poNo)));
  return { success: true, lcs: views, poOptions: poOptions, today: todayText_() };
}

function saveLc_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'lcs', 'edit');
  const input = data.lc || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const date = (v, label, required) => {
    v = text(v, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' غير صحيح');
    if (!v && required) throw new Error('حدد ' + label);
    return v;
  };
  const amt = v => round2_(String(v == null ? '' : v).replace(/,/g, ''));

  const lc = {
    lcNo: text(input.lcNo, 60),
    bank: text(input.bank, 100),
    supplier: text(input.supplier, 150),
    currency: text(input.currency, 5) || 'USD',
    amount: amt(input.amount),
    tolerance: Math.max(0, Math.min(20, Number(input.tolerance) || 0)),
    payType: LC_PAY_TYPES.indexOf(input.payType) >= 0 ? input.payType : 'اطلاع',
    incoterm: cleanIncoterm_(input.incoterm),
    usanceDays: Math.max(0, Math.round(Number(input.usanceDays) || 0)),
    usanceFrom: ['الشحن', 'القبول', 'التقديم'].indexOf(input.usanceFrom) >= 0 ? input.usanceFrom : 'الشحن',
    issueDate: date(input.issueDate, 'تاريخ الفتح', true),
    expiryDate: date(input.expiryDate, 'تاريخ انتهاء الصلاحية', true),
    latestShipDate: date(input.latestShipDate, 'آخر موعد للشحن', true),
    presentationDays: Math.max(0, Math.round(Number(input.presentationDays) || 21)),
    partial: input.partial === 'غير مسموح' ? 'غير مسموح' : 'مسموح',
    insurer: text(input.insurer, 100),
    goodsType: text(input.goodsType, 300),
    origin: text(input.origin, 150),
    notes: text(input.notes, 500)
  };
  if (!lc.lcNo) throw new Error('أدخل رقم الاعتماد');
  if (!lc.bank) throw new Error('أدخل اسم البنك');
  if (!(lc.amount > 0)) throw new Error('أدخل مبلغ الاعتماد');
  if (!lc.incoterm) throw new Error('اختر شرط التسليم (Incoterm)');
  if (lc.payType === 'آجل' && !lc.usanceDays) throw new Error('حدد عدد أيام الدفع الآجل');
  if (lc.payType === 'اطلاع') lc.usanceDays = 0;
  if (lc.expiryDate < lc.issueDate) throw new Error('تاريخ الانتهاء قبل تاريخ الفتح');
  if (lc.latestShipDate > lc.expiryDate) throw new Error('آخر موعد للشحن بعد صلاحية الاعتماد');

  // التعديلات
  lc.amendments = (Array.isArray(input.amendments) ? input.amendments : [])
    .map(a => ({ date: date(a.date, 'تاريخ التعديل'), desc: text(a.desc, 200), amountDelta: amt(a.amountDelta),
                 newExpiry: date(a.newExpiry, 'الصلاحية الجديدة'), newLatestShip: date(a.newLatestShip, 'آخر شحن جديد') }))
    .filter(a => a.date || a.desc || a.amountDelta || a.newExpiry || a.newLatestShip);
  lc.amendments.forEach((a, i) => {
    a.no = i + 1;
    if (!a.date) throw new Error('التعديل ' + a.no + ': حدد التاريخ');
  });
  const e = lcEffective_(lc);
  if (!(e.amount > 0)) throw new Error('مبلغ الاعتماد بعد التعديلات لازم يكون أكبر من صفر');
  if (e.latest > e.expiry) throw new Error('آخر موعد للشحن (بعد التعديلات) بعد صلاحية الاعتماد');

  // المصاريف البنكية
  lc.charges = (Array.isArray(input.charges) ? input.charges : [])
    .map(c => ({ date: date(c.date, 'تاريخ المصروف'), desc: text(c.desc, 150), amount: amt(c.amount), currency: text(c.currency, 5) || 'SAR' }))
    .filter(c => c.desc || c.amount);
  lc.charges.forEach((c, i) => { if (!c.desc) throw new Error('المصروف ' + (i + 1) + ': أدخل الوصف'); });

  return withLock_(() => {
    const all = readAll_('lcs');
    const existing = input.id ? all.find(l => l.id === String(input.id)) : null;
    if (input.id && !existing) throw new Error('الاعتماد غير موجود، ربما حذفه شخص آخر');
    if (existing && existing.status === 'مقفل') throw new Error('الاعتماد مقفل؛ أعد فتحه أولًا');
    if (all.some(l => l.lcNo.toLowerCase() === lc.lcNo.toLowerCase() && l.id !== String(input.id || ''))) {
      throw new Error('رقم الاعتماد ' + lc.lcNo + ' مستخدم مسبقًا');
    }

    const orders = readAll_('orders');
    const ordersById = {};
    orders.forEach(o => { ordersById[o.id] = o; });
    const shipments = readAll_('shipments');

    // تخصيص أوامر الشراء
    const seen = {};
    lc.pos = (Array.isArray(input.pos) ? input.pos : []).filter(p => p && p.poId).map(p => {
      const o = ordersById[String(p.poId)];
      if (!o) throw new Error('أمر شراء غير موجود في الاعتماد');
      if (seen[o.id]) throw new Error('أمر الشراء ' + o.poNo + ' مكرر في الاعتماد');
      seen[o.id] = true;
      if (!deptAllowed_(user, o.department)) throw new Error('أمر الشراء ' + o.poNo + ' يخص قسمًا آخر');
      if (o.currency !== lc.currency) throw new Error('عملة أمر الشراء ' + o.poNo + ' (' + o.currency + ') تختلف عن عملة الاعتماد');
      return { poId: o.id, poNo: o.poNo };
    });
    if (!lc.pos.length) throw new Error('اربط الاعتماد بأمر شراء واحد على الأقل');
    if (existing) {
      const linked = shipments.filter(s => s.lcId === existing.id);
      const lost = linked.find(s => !seen[s.poId]);
      if (lost) throw new Error('لا يمكن إزالة أمر الشراء ' + lost.poNo + ': عليه شحنة مربوطة بهذا الاعتماد');
    }

    // تقديم المستندات للبنك
    const linkedById = {};
    shipments.filter(s => existing && s.lcId === existing.id).forEach(s => { linkedById[s.id] = s; });
    lc.presentations = (Array.isArray(input.presentations) ? input.presentations : []).map((p, i) => {
      const label = 'التقديم ' + (i + 1) + ': ';
      const s = p.shipmentId ? linkedById[String(p.shipmentId)] : null;
      if (p.shipmentId && !s) throw new Error(label + 'الشحنة غير مربوطة بهذا الاعتماد');
      if (s && s.status !== SHIPPED) throw new Error(label + 'الشحنة ' + s.requestCode + ' غير معمّدة بعد');
      const r = {
        id: text(p.id, 60) || Utilities.getUuid(),
        shipmentId: s ? s.id : '', serial: s ? s.serial : '', invoiceNo: s ? s.invoiceNo : text(p.invoiceNo, 60),
        presentedDate: date(p.presentedDate, 'تاريخ التقديم', true),
        amount: amt(p.amount),
        discrepancies: text(p.discrepancies, 500),
        status: LC_PRES_STATES.indexOf(p.status) >= 0 ? p.status : 'مقدمة',
        acceptedDate: date(p.acceptedDate, 'تاريخ القبول'),
        dueDate: date(p.dueDate, 'تاريخ الاستحقاق'),
        paidDate: '', paidAmount: ''
      };
      if (!(r.amount > 0)) throw new Error(label + 'أدخل مبلغ المستندات');
      if (r.discrepancies && r.status === 'مقدمة') r.status = 'بها ملاحظات';
      if (r.status === 'مقبولة' && !r.acceptedDate) r.acceptedDate = r.presentedDate;
      // الاستحقاق: اطلاع = عند القبول، آجل = تاريخ الشحن (البوليصة) + أيام الآجل
      // آجل: تاريخ البداية حسب شرط الاعتماد (الشحن/البوليصة، القبول، أو التقديم) + أيام الآجل (30 / 60 / 90 …)
      if (!r.dueDate && r.status === 'مقبولة') {
        const base = lc.usanceFrom === 'القبول' ? r.acceptedDate
          : lc.usanceFrom === 'التقديم' ? r.presentedDate
          : ((s && s.shipDate) || r.presentedDate);
        r.dueDate = lc.payType === 'آجل' ? addDaysText_(base, lc.usanceDays) : r.acceptedDate;
      }
      if (s && s.shipDate && e.latest && s.shipDate > e.latest && !r.discrepancies) {
        r.discrepancies = 'شحن متأخر عن آخر موعد في الاعتماد';
      }
      return r;
    });
    const dupShip = {};
    lc.presentations.filter(p => p.shipmentId && p.status !== 'مرفوضة').forEach(p => {
      if (dupShip[p.shipmentId]) throw new Error('الشحنة ' + p.invoiceNo + ' لها أكثر من تقديم ساري');
      dupShip[p.shipmentId] = true;
    });

    const now = nowText_();
    if (existing) {
      Object.assign(lc, { id: existing.id, status: existing.status || 'مفتوح', createdBy: existing.createdBy, createdAt: existing.createdAt,
                          closedBy: existing.closedBy, closedAt: existing.closedAt });
    } else {
      Object.assign(lc, { id: Utilities.getUuid(), status: 'مفتوح', createdBy: user.username, createdAt: now, closedBy: '', closedAt: '' });
    }
    // ما يتجاوز المستخدم المبلغ
    const used = lcUsed_(lc, shipments, ordersById, '');
    if (used > e.amount * (1 + lc.tolerance / 100) + 0.005) {
      throw new Error('المستخدم من الاعتماد (' + used + ') أكبر من مبلغه بعد التعديلات');
    }
    lc.updatedBy = user.username;
    lc.updatedAt = now;
    writeRecord_('lcs', lc);
    const view = lcViews_([lc], shipments, orders)[0];
    return { success: true, lc: view, message: existing ? 'تم حفظ الاعتماد ' + lc.lcNo : 'تم فتح الاعتماد ' + lc.lcNo };
  });
}

function closeLc_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'lcs', 'full');
  return withLock_(() => {
    const lc = readAll_('lcs').find(l => l.id === String(data.id));
    if (!lc) throw new Error('الاعتماد غير موجود');
    if (lc.status === 'مقفل') throw new Error('الاعتماد مقفل مسبقًا');
    const today = todayText_();
    const open = (lc.presentations || []).filter(p => p.status !== 'مرفوضة' &&
      !(p.status === 'مقبولة' && p.dueDate && p.dueDate <= today));
    if (open.length) throw new Error('لا يمكن إقفال الاعتماد: فيه ' + open.length + ' تقديم مستندات لم يحلّ تاريخ استحقاقه أو لم يقبله البنك');
    const presented = {};
    (lc.presentations || []).filter(p => p.status !== 'مرفوضة').forEach(p => { presented[p.shipmentId] = true; });
    const notPresented = readAll_('shipments').filter(x => x.lcId === lc.id && x.status === SHIPPED && !presented[x.id]);
    if (notPresented.length) {
      throw new Error('لا يمكن إقفال الاعتماد: شحنات معمّدة عليه لم تُقدَّم مستنداتها (' + notPresented.map(x => x.invoiceNo).join('، ') + ')');
    }
    const now = nowText_();
    Object.assign(lc, { status: 'مقفل', closedBy: user.username, closedAt: now, updatedBy: user.username, updatedAt: now });
    writeRecord_('lcs', lc);
    return { success: true, message: 'تم إقفال الاعتماد ' + lc.lcNo };
  });
}

function reopenLc_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'lcs', 'full');
  return withLock_(() => {
    const lc = readAll_('lcs').find(l => l.id === String(data.id));
    if (!lc) throw new Error('الاعتماد غير موجود');
    Object.assign(lc, { status: 'مفتوح', closedBy: '', closedAt: '', updatedBy: user.username, updatedAt: nowText_() });
    writeRecord_('lcs', lc);
    return { success: true, message: 'أُعيد فتح الاعتماد ' + lc.lcNo };
  });
}

function deleteLc_(data) {
  const user = requireUser_(data.token);
  requirePage_(user, 'lcs', 'full');
  return withLock_(() => {
    const lc = readAll_('lcs').find(l => l.id === String(data.id));
    if (!lc) throw new Error('الاعتماد غير موجود');
    if (readAll_('shipments').some(s => s.lcId === lc.id)) throw new Error('لا يمكن حذف الاعتماد: عليه شحنات مربوطة');
    if ((lc.presentations || []).length) throw new Error('لا يمكن حذف الاعتماد: عليه مستندات مقدمة');
    tableSheet_('lcs').deleteRow(findRow_('lcs', lc.id));
    return { success: true, message: 'تم حذف الاعتماد ' + lc.lcNo };
  });
}

/** تنبيهات الاعتمادات للوحة الإدارة */
function lcAlerts_(user, pending, add) {
  const orders = readAll_('orders');
  const ordersById = {};
  orders.forEach(o => { ordersById[o.id] = o; });
  const today = todayText_();
  const views = lcViews_(readAll_('lcs'), readAll_('shipments'), orders).filter(l => lcAllowed_(user, l, ordersById));
  const open = views.filter(l => l.state === 'مفتوح' || l.state === 'مستخدم بالكامل');
  const pres = [];
  views.forEach(l => l.presentations.forEach(p => pres.push(p)));
  add('bad', views.filter(l => l.state === 'منتهي' && l.available > 0.005).length, 'اعتماد بنكي منتهي وفيه رصيد', 'lcs');
  add('wait', open.filter(l => l.daysToExpiry != null && l.daysToExpiry <= 15).length, 'اعتماد بنكي تنتهي صلاحيته خلال 15 يوم', 'lcs');
  add('wait', open.filter(l => l.available > 0.005 && l.daysToLatestShip != null && l.daysToLatestShip >= 0 && l.daysToLatestShip <= 15).length,
    'اعتماد بنكي آخر موعد شحن فيه خلال 15 يوم', 'lcs');
  add('bad', pres.filter(p => p.status === 'بها ملاحظات').length, 'تقديم مستندات للبنك عليه ملاحظات (Discrepancies)', 'lcs');
  add('wait', pres.filter(p => p.bucket === 'غير مستحقة' && daysBetweenText_(today, p.dueDate) <= 7).length,
    'دفعة اعتماد تُسدد خلال 7 أيام (حسب تاريخ الاستحقاق)', 'lcs');
  const lcPo = {};
  orders.forEach(o => { if (o.payMethod === 'L/C') lcPo[o.id] = true; });
  add('bad', pending.filter(s => lcPo[s.poId] && s.state === 'جاهزة للشحن' && !s.lcId).length,
    'طلب شحن L/C جاهز بدون اعتماد بنكي', 'shipments');
  return views;
}

/** ملخص الاعتمادات لتقرير الإدارة العليا */
function lcReport_(user) {
  const orders = readAll_('orders');
  const ordersById = {};
  orders.forEach(o => { ordersById[o.id] = o; });
  const views = lcViews_(readAll_('lcs'), readAll_('shipments'), orders)
    .filter(l => l.state !== 'مقفل' && lcAllowed_(user, l, ordersById))
    .sort((a, b) => String(a.effExpiry).localeCompare(String(b.effExpiry)));
  return views.map(l => ({
    lcNo: l.lcNo, bank: l.bank, supplier: l.supplier, currency: l.currency, payType: l.payType, incoterm: l.incoterm || '',
    pos: (l.pos || []).map(p => p.poNo).join('، '), amount: l.effAmount, used: l.used, available: l.available,
    paid: l.paid, due: l.due, notDue: l.notDue, latestShip: l.effLatestShip, expiry: l.effExpiry, daysToExpiry: l.daysToExpiry,
    nextDue: l.nextDue, state: l.state
  }));
}

/* =========================================
   استيراد البيانات من Excel (للمدير فقط)
   الملف يُقرأ ويُنظّف في المتصفح، وهنا نحفظه:
   الموجود يتحدّث (بالمفتاح) والجديد ينضاف — ينفع تعيده أكثر من مرة.
========================================= */

const IMPORT_TAG = 'مستورد من Excel';

function importData_(data) {
  const user = requireUser_(data.token);
  requireAdmin_(user);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return withLock_(() => {
    if (data.kind === 'orders') return importOrders_(user, rows, !!data.addModels);
    if (data.kind === 'lcs') return importLcs_(user, rows);
    if (data.kind === 'shipments') return importShipments_(user, rows, data.assumeReturn !== false);
    if (data.kind === 'containers') return importContainers_(user, rows, data.assumeReturn !== false);
    throw new Error('نوع استيراد غير معروف');
  });
}

const impText_ = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
const impDate_ = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const impKey_ = v => String(v || '').toLowerCase();

/** أوامر الشراء (+ الموديلات الجديدة) — المفتاح: رقم الأمر */
function importOrders_(user, rows, addModels) {
  const all = readAll_('orders');
  const byNo = {};
  all.forEach(o => { byNo[impKey_(o.poNo)] = o; });
  const now = nowText_();
  const out = [], errors = [];
  let added = 0, updated = 0;

  rows.forEach(r => {
    try {
      const poNo = impText_(r.poNo, 80);
      if (!poNo) throw new Error('رقم أمر فاضي');
      const items = (r.items || []).map(i => ({
        model: impText_(i.model, 120), description: impText_(i.description, 200),
        qty: Number(i.qty) || 0, containers: Number(i.containers) || 0
      })).filter(i => i.model);
      const ex = byNo[impKey_(poNo)];
      const o = Object.assign({}, ex || {}, {
        poNo: poNo, date: impDate_(r.date) || (ex && ex.date) || todayText_(),
        department: impText_(r.department, 60) || (ex && ex.department) || 'قسم آخر',
        supplier: impText_(r.supplier, 150) || (ex && ex.supplier) || '',
        currency: impText_(r.currency, 5) || 'USD',
        incoterm: cleanIncoterm_(r.incoterm) || (ex && ex.incoterm) || '',
        payMethod: ['T/T', 'L/C', 'D/P'].indexOf(r.payMethod) >= 0 ? r.payMethod : 'T/T',
        depositPct: ex ? ex.depositPct : 0,
        ports: (r.ports || []).map(cleanPort_).filter((p, i, a) => p && a.indexOf(p) === i).slice(0, 10),
        contact: impText_(r.contact, 100),
        notes: impText_(r.notes, 500),
        items: items,
        totalQty: items.reduce((t, i) => t + i.qty, 0), totalValue: '',
        status: 'معتمد', updatedBy: user.username, updatedAt: now
      });
      if (!o.ports.length && ex) o.ports = ex.ports || [];
      if (ex) { updated++; }
      else {
        Object.assign(o, { id: Utilities.getUuid(), createdBy: user.username + ' (' + IMPORT_TAG + ')', createdAt: now,
                           approvedBy: user.username, approvedAt: now });
        added++;
      }
      byNo[impKey_(poNo)] = o;
      out.push(o);
    } catch (err) {
      errors.push((r.poNo || '?') + ': ' + err.message);
    }
  });
  writeMany_('orders', out);

  // الموديلات الجديدة فقط (الموجودة ما تتغيّر)
  let models = 0;
  if (addModels) {
    const existing = {};
    readAll_('models').forEach(m => { existing[impKey_(m.code)] = true; });
    const newModels = {};
    rows.forEach(r => (r.items || []).forEach(i => {
      const code = impText_(i.model, 120);
      const k = impKey_(code);
      if (!code || existing[k] || newModels[k]) return;
      newModels[k] = {
        id: Utilities.getUuid(), code: code, department: impText_(r.department, 60), factory: impText_(r.factory, 80),
        brand: impText_(r.factory, 80), description: impText_(i.description, 200), unit: 'طقم', perContainer: 0,
        cert: '', certNo: '', certExp: '', status: 'فعال',
        createdBy: user.username + ' (' + IMPORT_TAG + ')', createdAt: now, updatedBy: user.username, updatedAt: now
      };
    }));
    const list = Object.keys(newModels).map(k => newModels[k]);
    writeMany_('models', list);
    models = list.length;
  }
  return { success: true, added: added, updated: updated, models: models, errors: errors };
}

/** الاعتمادات — المفتاح: رقم الاعتماد. التعديلات والمصاريف والإقفال الموجودة تبقى */
function importLcs_(user, rows) {
  const all = readAll_('lcs');
  const byNo = {};
  all.forEach(l => { byNo[impKey_(l.lcNo)] = l; });
  const poByNo = {};
  readAll_('orders').forEach(o => { poByNo[impKey_(o.poNo)] = o; });
  const now = nowText_();
  const out = [], errors = [];
  let added = 0, updated = 0;

  rows.forEach(r => {
    try {
      const lcNo = impText_(r.lcNo, 60).toUpperCase();
      if (!lcNo) throw new Error('رقم اعتماد فاضي');
      const ex = byNo[impKey_(lcNo)];
      const pos = [];
      (r.poNos || []).forEach(no => {
        const o = poByNo[impKey_(no)];
        if (o && !pos.some(p => p.poId === o.id)) pos.push({ poId: o.id, poNo: o.poNo });
      });
      const expiry = impDate_(r.expiryDate);
      const l = Object.assign({ amendments: [], presentations: [], charges: [], status: 'مفتوح' }, ex || {}, {
        lcNo: lcNo, bank: impText_(r.bank, 100), supplier: impText_(r.supplier, 150),
        currency: impText_(r.currency, 5) || 'USD', amount: round2_(r.amount), tolerance: ex ? ex.tolerance : 0,
        payType: Number(r.usanceDays) > 0 ? 'آجل' : 'اطلاع', usanceDays: Math.max(0, Math.round(Number(r.usanceDays) || 0)),
        usanceFrom: (ex && ex.usanceFrom) || 'الشحن', incoterm: cleanIncoterm_(r.incoterm) || (ex && ex.incoterm) || '',
        issueDate: impDate_(r.issueDate), expiryDate: expiry,
        latestShipDate: (ex && ex.latestShipDate) || impDate_(r.latestShipDate) || expiry,
        presentationDays: ex ? ex.presentationDays : 21, partial: ex ? ex.partial : 'مسموح',
        insurer: impText_(r.insurer, 100), goodsType: impText_(r.goodsType, 300), origin: impText_(r.origin, 150),
        notes: impText_(r.notes, 500) || (ex && ex.notes) || '',
        pos: pos.length ? pos : (ex ? ex.pos : []),
        updatedBy: user.username, updatedAt: now
      });
      if (ex) updated++;
      else {
        Object.assign(l, { id: Utilities.getUuid(), createdBy: user.username + ' (' + IMPORT_TAG + ')', createdAt: now, closedBy: '', closedAt: '' });
        added++;
      }
      byNo[impKey_(lcNo)] = l;
      out.push(l);
    } catch (err) {
      errors.push((r.lcNo || '?') + ': ' + err.message);
    }
  });
  writeMany_('lcs', out);
  return { success: true, added: added, updated: updated, errors: errors };
}

/**
 * الفواتير (شحنة لكل أمر شراء + فاتورة) — المفتاح: رقم الأمر + رقم الفاتورة.
 * تنعمل الحاويات (40HC) وملف الشحنة وتقديم المستندات للبنك للمربوطة باعتماد.
 */
function importShipments_(user, rows, assumeReturn) {
  const orders = readAll_('orders');
  const poByNo = {};
  orders.forEach(o => { poByNo[impKey_(o.poNo)] = o; });
  const lcs = readAll_('lcs');
  const lcByNo = {};
  lcs.forEach(l => { lcByNo[impKey_(l.lcNo)] = l; });
  const all = readAll_('shipments');
  const byKey = {};
  all.forEach(s => { byKey[impKey_(s.poNo) + '|' + impKey_(s.invoiceNo)] = s; });
  const containers = readAll_('containers');
  const cByShip = {};
  containers.forEach(c => { (cByShip[c.shipmentId] = cByShip[c.shipmentId] || []).push(c); });
  const files = {};
  readAll_('files').forEach(f => { files[f.serial] = f; });

  const now = nowText_();
  const outS = [], outC = [], outF = {}, touchedLc = {}, errors = [];
  let added = 0, updated = 0, newContainers = 0;

  rows.forEach(r => {
    try {
      const po = poByNo[impKey_(r.poNo)];
      if (!po) throw new Error('أمر الشراء ' + r.poNo + ' غير موجود');
      const invoiceNo = impText_(r.invoiceNo, 60);
      if (!invoiceNo) throw new Error('رقم فاتورة فاضي');
      const lines = (r.lines || []).map(l => ({ model: impText_(l.model, 120), qty: Number(l.qty) || 0, containers: Number(l.containers) || 0,
        description: impText_(l.description, 200) })).filter(l => l.model && l.qty > 0);
      if (!lines.length) throw new Error('الفاتورة ' + invoiceNo + ' بدون كميات');

      const key = impKey_(po.poNo) + '|' + impKey_(invoiceNo);
      const ex = byKey[key];
      const shipped = !!impText_(r.serial);
      const lc = r.lcNo ? lcByNo[impKey_(r.lcNo)] : null;
      const s = Object.assign({}, ex || {}, {
        poId: po.id, poNo: po.poNo, supplier: po.supplier, department: impText_(r.department, 60) || po.department,
        invoiceNo: invoiceNo, port: cleanPort_(r.port) || (ex && ex.port) || '—',
        readyDate: impDate_(r.readyDate) || impDate_(r.shipDate) || (ex && ex.readyDate) || todayText_(),
        lines: lines, totalQty: lines.reduce((t, l) => t + l.qty, 0),
        totalContainers: Math.max(0, Math.round(Number(r.totalContainers) || 0)),
        status: shipped ? SHIPPED : 'طلب', serial: shipped ? impText_(r.serial, 20) : '',
        forwarder: impText_(r.forwarder, 100), shipDate: impDate_(r.shipDate), eta: impDate_(r.eta),
        arrivalPort: impText_(r.arrivalPort, 60), broker: impText_(r.broker, 100),
        inspection: (ex && ex.inspection && ex.inspection !== 'لم يُفحص') ? ex.inspection : (shipped ? 'معفى' : 'لم يُفحص'),
        inspectionNote: (ex && ex.inspectionNote) || (shipped ? IMPORT_TAG : ''),
        invoiceValue: round2_(r.invoiceValue), lcId: lc ? lc.id : '',
        updatedBy: user.username, updatedAt: now
      });
      if (!ex) {
        Object.assign(s, {
          id: Utilities.getUuid(), requestCode: 'EXCEL-' + invoiceNo.replace(/\s+/g, ''), approvalNo: '',
          freight: 0, freightCurrency: 'USD', notes: IMPORT_TAG, freeDays: '',
          createdBy: user.username + ' (' + IMPORT_TAG + ')', createdAt: now,
          shippedBy: shipped ? user.username : '', shippedAt: shipped ? now : ''
        });
        added++;
      } else updated++;
      byKey[key] = s;
      outS.push(s);

      // الحاويات: تنعمل مرة وحدة (40HC)، والموجودة تتعبّى خاناتها الفاضية بس
      if (shipped) {
        const decl = cleanDecl_(r.declarationNo);
        const recv = impDate_(r.receivedDate);
        const mine = cByShip[s.id] || [];
        if (!mine.length && s.totalContainers > 0) {
          const plan = [];
          lines.forEach(l => {
            const n = Math.round(l.containers || 0);
            const per = n ? Math.floor(l.qty / n) : 0;
            for (let i = 0; i < n; i++) plan.push({ model: l.model, qty: i === n - 1 ? l.qty - per * (n - 1) : per });
          });
          while (plan.length < s.totalContainers) plan.push({ model: '', qty: 0 });
          plan.slice(0, Math.max(s.totalContainers, plan.length)).forEach((p, i) => {
            outC.push({
              id: Utilities.getUuid(), shipmentId: s.id, serial: s.serial, invoiceNo: s.invoiceNo, poNo: s.poNo,
              department: s.department, seq: i + 1, containerNo: '', size: '40HC', model: p.model, qty: p.qty, spareParts: '',
              arrivalPort: s.arrivalPort, eta: s.eta, dischargeDate: '', freeDays: '', warehouse: '',
              declarationNo: decl, receivedDate: recv, receivedQty: '', receivedBy: recv ? IMPORT_TAG : '',
              emptyReturnDate: recv && assumeReturn ? recv : '',
              notes: recv && assumeReturn ? IMPORT_TAG + ' — إرجاع الفارغ مفترض بتاريخ الاستلام' : IMPORT_TAG,
              createdAt: now, updatedBy: user.username, updatedAt: now
            });
            newContainers++;
          });
        } else {
          mine.forEach(c => {
            let ch = false;
            if (decl && !c.declarationNo) { c.declarationNo = decl; ch = true; }
            if (recv && !c.receivedDate) { c.receivedDate = recv; ch = true; }
            if (c.serial !== s.serial) { c.serial = s.serial; ch = true; }
            if (ch) { c.updatedBy = user.username; c.updatedAt = now; outC.push(c); }
          });
        }

        // ملف الشحنة: نعبّي الخانات الفاضية فقط (ما نمسح شي عدّلته في المنصة)
        const f = outF[s.serial] || files[s.serial] || { serial: s.serial, docs: {}, costs: {}, declarations: {}, status: 'مفتوح' };
        const fx = r.file || {};
        const fill = (k, v) => { v = impText_(v, 150); if (v && !f[k]) f[k] = v; };
        fill('shippingLine', fx.shippingLine); fill('vessel', fx.vessel); fill('billOfLading', fx.mblNo);
        fill('hblNo', fx.hblNo); fill('insurer', fx.insurer);
        f.docs = f.docs && !Array.isArray(f.docs) ? f.docs : {};
        if (fx.hblNo) f.docs.hbl = true;
        if (fx.mblNo) f.docs.mbl = true;
        if (fx.bankDocs) f.docs.bank = true;
        if (fx.docsPresent) f.docs.invoice = f.docs.packing = true;
        f.costs = f.costs && !Array.isArray(f.costs) ? f.costs : {};
        if (fx.duty && (f.costs.duty === '' || f.costs.duty == null)) f.costs.duty = round2_(fx.duty);
        if (fx.declText && String(f.notes || '').indexOf(fx.declText) < 0) {
          f.notes = impText_((f.notes ? f.notes + ' — ' : '') + 'بيانات جمركية من Excel: ' + fx.declText, 500);
        }
        if (!f.updatedBy) { f.updatedBy = user.username; f.updatedAt = now; }
        outF[s.serial] = f;

        // تقديم المستندات للبنك: مقبولة، والاستحقاق = تاريخ الشحن + أيام الآجل (السداد بالتاريخ)
        if (lc && s.invoiceValue > 0 && s.shipDate) {
          lc.presentations = Array.isArray(lc.presentations) ? lc.presentations : [];
          const due = lc.payType === 'آجل' ? addDaysText_(s.shipDate, Number(lc.usanceDays) || 0) : s.shipDate;
          const p = lc.presentations.find(x => x.shipmentId === s.id);
          if (p) {
            if (p.imported) Object.assign(p, { amount: s.invoiceValue, serial: s.serial, invoiceNo: s.invoiceNo, dueDate: due });
          } else {
            lc.presentations.push({ id: Utilities.getUuid(), shipmentId: s.id, serial: s.serial, invoiceNo: s.invoiceNo,
              presentedDate: s.shipDate, amount: s.invoiceValue, discrepancies: '', status: 'مقبولة',
              acceptedDate: s.shipDate, dueDate: due, paidDate: '', paidAmount: '', imported: true });
          }
          touchedLc[lc.id] = lc;
        }
      }
    } catch (err) {
      errors.push((r.invoiceNo || '?') + ' / ' + (r.poNo || '?') + ': ' + err.message);
    }
  });

  writeMany_('shipments', outS);
  writeMany_('containers', outC);
  writeMany_('files', Object.keys(outF).map(k => outF[k]));
  writeMany_('lcs', Object.keys(touchedLc).map(k => touchedLc[k]));
  return { success: true, added: added, updated: updated, containers: newContainers,
           presentations: Object.keys(touchedLc).length, errors: errors };
}

/**
 * ملف الحاويات: لكل فاتورة (برقم الفاتورة، وإلا بالتسلسل) نحدّث سطور الحاويات:
 * نطابق برقم الحاوية، وإلا نعبّي سطر بدون رقم، وإلا نضيف سطر جديد. السطور الفاضية الزايدة تنشال.
 */
const impCn_ = v => String(v || '').toUpperCase().replace(/[\s\-\/]/g, '');

function importContainers_(user, groups, assumeReturn) {
  const shipments = readAll_('shipments').filter(s => s.status === SHIPPED);
  const byInv = {}, bySerial = {};
  shipments.forEach(s => {
    (byInv[String(s.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g, '')] = byInv[String(s.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g, '')] || []).push(s);
    (bySerial[s.serial] = bySerial[s.serial] || []).push(s);
  });
  const all = readAll_('containers');
  const now = nowText_();
  const out = {}, remove = {}, errors = [];
  let matched = 0, created = 0, removed = 0;
  const files = {};
  readAll_('files').forEach(f => { files[f.serial] = f; });
  const outF = {}, outS = {};

  groups.forEach(g => {
    try {
      const ik = String(g.invoiceNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ships = (ik && byInv[ik]) || (g.serial && bySerial[String(g.serial)]) || null;
      if (!ships) throw new Error('الفاتورة غير موجودة في المنصة (استورد ملف الشحنات أول)');
      const ids = {};
      ships.forEach(s => { ids[s.id] = s; });
      const mine = all.filter(c => ids[c.shipmentId]).sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
      const used = {};
      const shipFor = model => {
        const k = String(model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return ships.find(s => (s.lines || []).some(l => String(l.model).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) === k.slice(0, 10))) || ships[0];
      };
      const seen = {};
      (g.rows || []).forEach(r => {
        const no = impCn_(r.containerNo || '');
        if (no && seen[no]) return;
        if (no) seen[no] = true;
        let c = no ? mine.find(x => !used[x.id] && impCn_(x.containerNo) === no) : null;
        if (!c) c = mine.find(x => !used[x.id] && !x.containerNo);
        if (c) matched++;
        else {
          const s = shipFor(r.model);
          c = { id: Utilities.getUuid(), shipmentId: s.id, serial: s.serial, invoiceNo: s.invoiceNo, poNo: s.poNo, department: s.department,
                seq: mine.length + 1, containerNo: '', size: '40HC', model: '', qty: 0, spareParts: '', arrivalPort: s.arrivalPort, eta: s.eta,
                dischargeDate: '', freeDays: s.freeDays, warehouse: '', declarationNo: '', receivedDate: '', receivedQty: '', receivedBy: '',
                emptyReturnDate: '', notes: '', createdAt: now, updatedBy: '', updatedAt: now };
          mine.push(c);
          created++;
        }
        used[c.id] = true;
        const ret = impDate_(r.emptyReturnDate);
        const wasAssumed = String(c.notes || '').indexOf('مفترض') >= 0;
        const recvAll = impDate_(r.receivedDate) || c.receivedDate;
        const back = ret || (assumeReturn && recvAll ? (wasAssumed || !c.emptyReturnDate ? recvAll : c.emptyReturnDate)
                                                     : (wasAssumed ? '' : c.emptyReturnDate));
        Object.assign(c, {
          containerNo: no || c.containerNo, size: c.size || '40HC',
          model: impText_(r.model, 120) || c.model, qty: Number(r.qty) || c.qty || 0,
          eta: impDate_(r.eta) || c.eta, arrivalPort: impText_(r.arrivalPort, 60) || c.arrivalPort,
          declarationNo: cleanDecl_(r.declarationNo) || c.declarationNo,
          warehouse: impText_(r.warehouse, 60) || c.warehouse,
          receivedDate: recvAll, receivedBy: recvAll ? (c.receivedBy || IMPORT_TAG) : c.receivedBy,
          emptyReturnDate: back,
          notes: impText_([r.notes, back && !ret ? 'إرجاع الفارغ مفترض بتاريخ الاستلام' : '', IMPORT_TAG].filter(Boolean).join(' — '), 500),
          updatedBy: user.username, updatedAt: now
        });
        out[c.id] = c;
        // البوليصة والمخلص: نعبّي الفاضي بس
        const s = ids[c.shipmentId];
        if (s && r.broker && !s.broker && !/^\d{4}-/.test(r.broker)) { s.broker = impText_(r.broker, 100); outS[s.id] = s; }
        if (s && r.bl) {
          const f = outF[s.serial] || files[s.serial];
          if (f && !f.billOfLading) { f.billOfLading = impText_(r.bl, 60); outF[s.serial] = f; }
        }
      });
      // السطور الفاضية الزايدة (من الاستيراد السابق) تنشال إذا الملف غطّى الفاتورة
      mine.filter(c => !used[c.id] && !c.containerNo && !c.receivedDate).forEach(c => { remove[c.id] = true; removed++; });
    } catch (err) {
      errors.push((g.invoiceNo || g.serial || '?') + ': ' + err.message);
    }
  });

  writeMany_('containers', Object.keys(out).map(k => out[k]));
  if (Object.keys(remove).length) deleteWhere_('containers', c => remove[c.id]);
  writeMany_('shipments', Object.keys(outS).map(k => outS[k]));
  writeMany_('files', Object.keys(outF).map(k => outF[k]));
  return { success: true, matched: matched, created: created, removed: removed, errors: errors };
}

/* =========================================
   البلاغات: الموظف يرفع مشكلته، والمدير يرد / يتولاها / يحلها
   الحالات: جديد ← قيد المعالجة ← بانتظار الموظف ← محلولة (← معاد فتحه)
========================================= */

const TICKET_TYPES = ['مشكلة في المنصة', 'مشكلة في شحنة أو حاوية', 'طلب صلاحية', 'اقتراح', 'أخرى'];
const TICKET_PRIORITIES = ['عادية', 'مهمة', 'عاجلة'];
const TICKET_OPEN = ['جديد', 'قيد المعالجة', 'بانتظار الموظف', 'معاد فتحه'];
const PLATFORM_URL = 'https://7amzahamou-source.github.io/manassat-alamal/';

/** إيميل المدير: من Script properties (NOTIFY_EMAIL) وإلا صاحب السكربت */
function adminEmail_() {
  const p = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (p) return p;
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}

function notifyAdmin_(subject, body) {
  const to = adminEmail_();
  if (!to) return false;
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body + '\n\nافتح المنصة: ' + PLATFORM_URL, name: 'منصة سلاسل الإمداد' });
    return true;
  } catch (e) { return false; }
}

/** الشكل اللي يرجع للمتصفح */
function ticketView_(t) {
  const msgs = Array.isArray(t.messages) ? t.messages : [];
  const last = msgs.length ? msgs[msgs.length - 1].at : t.createdAt;
  return Object.assign({}, t, {
    messages: msgs,
    open: TICKET_OPEN.indexOf(t.status) >= 0,
    ageDays: Math.max(0, daysBetweenText_(String(t.createdAt).slice(0, 10), todayText_())),
    idleDays: Math.max(0, daysBetweenText_(String(last).slice(0, 10), todayText_())),
    seenByAdmin: String(t.seenByAdmin) === 'true', seenByUser: String(t.seenByUser) !== 'false'
  });
}

const prioRank_ = p => { const r = { 'عاجلة': 0, 'مهمة': 1, 'عادية': 2 }[p]; return r === undefined ? 3 : r; };
const sortTickets_ = (a, b) => (b.open - a.open) || prioRank_(a.priority) - prioRank_(b.priority) ||
  String(a.createdAt).localeCompare(String(b.createdAt)) * (a.open ? 1 : -1);

/** بلاغات الموظف نفسه */
function listMyTickets_(data) {
  const user = requireUser_(data.token);
  const list = readAll_('tickets').filter(t => t.createdBy === user.username).map(ticketView_)
    .sort((a, b) => (b.open - a.open) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return { success: true, tickets: list };
}

function createTicket_(data) {
  const user = requireUser_(data.token);
  const input = data.ticket || {};
  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const t = {
    title: text(input.title, 120), type: TICKET_TYPES.indexOf(input.type) >= 0 ? input.type : 'أخرى',
    priority: TICKET_PRIORITIES.indexOf(input.priority) >= 0 ? input.priority : 'عادية',
    description: text(input.description, 3000), ref: text(input.ref, 100)
  };
  if (!t.title) throw new Error('اكتب عنوان المشكلة');
  if (!t.description) throw new Error('اشرح المشكلة في الوصف');
  const saved = withLock_(() => {
    const all = readAll_('tickets');
    const max = all.reduce((m, x) => Math.max(m, Number(String(x.no).replace(/\D/g, '')) || 0), 0);
    const now = nowText_();
    Object.assign(t, {
      id: Utilities.getUuid(), no: 'T-' + String(max + 1).padStart(4, '0'), status: 'جديد',
      createdBy: user.username, createdByName: user.name, department: user.dept || '', createdAt: now, updatedAt: now,
      assignedTo: '', resolvedBy: '', resolvedAt: '', resolution: '', messages: [],
      seenByAdmin: 'false', seenByUser: 'true', lastBy: 'user'
    });
    writeRecord_('tickets', t);
    return t;
  });
  notifyAdmin_('بلاغ جديد ' + saved.no + ' (' + saved.priority + '): ' + saved.title,
    'من: ' + user.name + (user.dept ? ' — ' + user.dept : '') + '\nالنوع: ' + saved.type + '\nالأولوية: ' + saved.priority +
    (saved.ref ? '\nمرتبط بـ: ' + saved.ref : '') + '\n\n' + saved.description);
  return { success: true, ticket: ticketView_(saved), message: 'انرفع البلاغ ' + saved.no + ' ووصل للمدير' };
}

/** الموظف: رد / تأكيد الحل / إعادة فتح */
function myTicketAction_(data) {
  const user = requireUser_(data.token);
  const msg = String(data.text || '').trim().slice(0, 3000);
  const t = withLock_(() => {
    const t = readAll_('tickets').find(x => x.id === String(data.id));
    if (!t || t.createdBy !== user.username) throw new Error('البلاغ غير موجود');
    t.messages = Array.isArray(t.messages) ? t.messages : [];
    const now = nowText_();
    if (data.op === 'reply') {
      if (!msg) throw new Error('اكتب ردك');
      if (t.status === 'محلولة') throw new Error('البلاغ محلول؛ أعد فتحه إذا المشكلة باقية');
      t.messages.push({ by: user.username, name: user.name, role: 'user', at: now, text: msg });
      if (t.status === 'بانتظار الموظف') t.status = 'قيد المعالجة';
    } else if (data.op === 'reopen') {
      if (t.status !== 'محلولة') throw new Error('البلاغ مو محلول');
      t.messages.push({ by: user.username, name: user.name, role: 'user', at: now, text: msg || 'المشكلة ما انحلت', action: 'أعاد فتح البلاغ' });
      t.status = 'معاد فتحه';
    } else if (data.op === 'seen') {
      t.seenByUser = 'true';
      writeRecord_('tickets', t);
      return t;
    } else throw new Error('عملية غير معروفة');
    Object.assign(t, { updatedAt: now, seenByAdmin: 'false', seenByUser: 'true', lastBy: 'user' });
    writeRecord_('tickets', t);
    return t;
  });
  if (data.op !== 'seen') {
    notifyAdmin_((data.op === 'reopen' ? 'إعادة فتح ' : 'رد على ') + t.no + ': ' + t.title, user.name + ':\n' + (msg || 'المشكلة ما انحلت'));
  }
  return { success: true, ticket: ticketView_(t), message: data.op === 'reopen' ? 'أُعيد فتح البلاغ' : 'وصل ردك' };
}

/** المدير: كل البلاغات */
function listTickets_(data) {
  const user = requireUser_(data.token);
  requireAdmin_(user);
  const list = readAll_('tickets').map(ticketView_).sort(sortTickets_);
  return { success: true, tickets: list, types: TICKET_TYPES, today: todayText_() };
}

/** المدير: رد/توجيه، أتولاها، تم الحل، إعادة فتح، تمت المشاهدة */
function ticketAction_(data) {
  const user = requireUser_(data.token);
  requireAdmin_(user);
  const msg = String(data.text || '').trim().slice(0, 3000);
  return withLock_(() => {
    const t = readAll_('tickets').find(x => x.id === String(data.id));
    if (!t) throw new Error('البلاغ غير موجود');
    t.messages = Array.isArray(t.messages) ? t.messages : [];
    const now = nowText_();
    const add = action => t.messages.push({ by: user.username, name: user.name, role: 'admin', at: now, text: msg, action: action || '' });
    let message = '';
    if (data.op === 'seen') {
      t.seenByAdmin = 'true';
      writeRecord_('tickets', t);
      return { success: true, ticket: ticketView_(t) };
    } else if (data.op === 'reply') {
      if (!msg) throw new Error('اكتب ردك أو توجيهك للموظف');
      add('توجيه للموظف');
      t.status = 'بانتظار الموظف';
      message = 'وصل ردك للموظف';
    } else if (data.op === 'take') {
      add('تولّى المدير البلاغ');
      Object.assign(t, { status: 'قيد المعالجة', assignedTo: user.username });
      message = 'البلاغ صار عندك (قيد المعالجة)';
    } else if (data.op === 'resolve') {
      if (!msg) throw new Error('اكتب وش انسوّى لحل المشكلة');
      add('تم الحل');
      Object.assign(t, { status: 'محلولة', resolvedBy: user.username, resolvedAt: now, resolution: msg });
      message = 'تم إغلاق البلاغ كـ «محلولة»';
    } else if (data.op === 'reopen') {
      add('أعاد فتح البلاغ');
      Object.assign(t, { status: 'قيد المعالجة', resolvedBy: '', resolvedAt: '', resolution: '' });
      message = 'أُعيد فتح البلاغ';
    } else throw new Error('عملية غير معروفة');
    Object.assign(t, { updatedAt: now, seenByAdmin: 'true', seenByUser: 'false', lastBy: 'admin' });
    writeRecord_('tickets', t);
    return { success: true, ticket: ticketView_(t), message: message };
  });
}

/** الأرقام الصغيرة في القائمة: للمدير البلاغات غير المقروءة، وللموظف الردود الجديدة */
function ticketBadges_(data) {
  const user = requireUser_(data.token);
  const all = readAll_('tickets');
  return {
    success: true,
    admin: isAdmin_(user) ? all.filter(t => String(t.seenByAdmin) !== 'true').length : 0,
    adminOpen: isAdmin_(user) ? all.filter(t => TICKET_OPEN.indexOf(t.status) >= 0).length : 0,
    mine: all.filter(t => t.createdBy === user.username && String(t.seenByUser) === 'false').length
  };
}

/** من قائمة الشيت: يرسل إيميل تجربة (وأول مرة يطلب صلاحية الإيميل) */
function menuTestEmail() {
  const ok = notifyAdmin_('تجربة إيميل البلاغات', 'إذا وصلك هذا الإيميل فتنبيهات البلاغات شغّالة ✅');
  SpreadsheetApp.getUi().alert(ok ? '✅ انرسل إيميل تجربة إلى ' + adminEmail_() : '✗ ما قدرت أرسل الإيميل — تأكد من الصلاحيات');
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
    .addItem('مسح أسعار الوحدات القديمة من أوامر الشراء', 'menuClearPrices')
    .addSeparator()
    .addItem('اختبار إيميل البلاغات', 'menuTestEmail')
    .addSeparator()
    .addItem('⚠️ مسح كل بيانات المنصة', 'menuWipe')
    .addToUi();
}

function menuSetup() {
  secret_();
  Object.keys(TABLES).forEach(k => header_(k));
  SpreadsheetApp.getUi().alert('✅ تم تجهيز قاعدة البيانات');
}

/** يمسح سعر الوحدة من بنود كل أوامر الشراء وقيمة الأمر (مرة وحدة) */
function menuClearPrices() {
  if (ask_('مسح أسعار الوحدات وقيمة الأمر من كل أوامر الشراء؟ (اكتب نعم)') !== 'نعم') return;
  const orders = readAll_('orders');
  orders.forEach(o => {
    o.items = (o.items || []).map(i => { const c = Object.assign({}, i); delete c.price; return c; });
    o.totalValue = '';
  });
  writeMany_('orders', orders);
  SpreadsheetApp.getUi().alert('✅ تم مسح الأسعار من ' + orders.length + ' أمر شراء');
}

/**
 * يمسح بيانات المنصة: أوامر الشراء، الشحنات، الحاويات، ملفات الشحنات، الاعتمادات
 * (واختياريًا قاعدة الموديلات وأسعار الشحن). الموظفون والصلاحيات ما تنمسح.
 * قبل المسح تنعمل نسخة احتياطية كاملة من الشيت في Google Drive.
 */
function menuWipe() {
  const ui = SpreadsheetApp.getUi();
  const main = ['orders', 'shipments', 'containers', 'files', 'lcs', 'tickets'];
  const names = main.map(k => '• ' + TABLES[k].sheet).join('\n');
  const ok = ask_('راح ينمسح كل اللي في هذي الأوراق:\n' + names +
    '\n\nالموظفون وصلاحياتهم ما تنمسح، وتنعمل نسخة احتياطية قبل المسح.\n\nللتأكيد اكتب كلمة: مسح');
  if (ok !== 'مسح') { ui.alert('ما انمسح شي.'); return; }
  const extra = [];
  if (ui.alert('قاعدة الموديلات', 'تبي تمسح «' + TABLES.models.sheet + '» بعد؟', ui.ButtonSet.YES_NO) === ui.Button.YES) extra.push('models');
  if (ui.alert('أسعار الشحن', 'تبي تمسح «' + TABLES.rates.sheet + '» بعد؟', ui.ButtonSet.YES_NO) === ui.Button.YES) extra.push('rates');

  // نسخة احتياطية قبل أي مسح
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backup = '';
  try {
    const copy = ss.copy(ss.getName() + ' — نسخة احتياطية ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm'));
    backup = copy.getUrl();
  } catch (err) {
    if (ui.alert('ما قدرت أسوي نسخة احتياطية', 'السبب: ' + err.message + '\n\nتكمل المسح بدون نسخة؟', ui.ButtonSet.YES_NO) !== ui.Button.YES) {
      ui.alert('ما انمسح شي.');
      return;
    }
  }

  const done = withLock_(() => main.concat(extra).map(k => {
    const sheet = tableSheet_(k);
    const n = Math.max(0, sheet.getLastRow() - 1);
    if (n > 0) {
      // Google Sheets ما يسمح بحذف كل الصفوف غير المثبّتة: نمسح محتوى الصف الثاني ونحذف الباقي
      sheet.getRange(2, 1, n, Math.max(1, sheet.getLastColumn())).clearContent();
      if (n > 1) sheet.deleteRows(3, n - 1);
    }
    return TABLES[k].sheet + ': ' + n + ' سطر';
  }));
  ui.alert('✅ تم المسح', done.join('\n') + (backup ? '\n\nالنسخة الاحتياطية في Google Drive:\n' + backup : ''), ui.ButtonSet.OK);
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
