/**
 * الاتصال بالخادم
 * كل طلب يُرسل إلى Apps Script ويرجع بالنتيجة أو برسالة خطأ واضحة.
 */
const API = {
  async call(action, data = {}) {
    const url = (window.APP_CONFIG || {}).apiUrl || '';
    if (!url.endsWith('/exec')) throw new Error('رابط الخادم غير مضبوط في config.js');

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...data })
      });
    } catch (e) {
      throw new Error('تعذر الاتصال بالخادم، تحقق من الإنترنت');
    }

    const result = await response.json().catch(() => null);
    if (!result) throw new Error('رد غير مفهوم من الخادم');
    if (!result.success) {
      const message = result.message || 'حدث خطأ';
      if (message.includes('انتهت الجلسة')) window.dispatchEvent(new Event('session-expired'));
      throw new Error(message);
    }
    return result;
  },

  token() { return sessionStorage.getItem('token') || ''; },

  // الدخول
  login(username, password) { return this.call('login', { username, password }); },
  me(token)                 { return this.call('me', { token }); },
  logout(token)             { return this.call('logout', { token }); },

  // الموظفون (للمدير)
  listUsers()          { return this.call('listUsers',  { token: this.token() }); },
  saveUser(user)       { return this.call('saveUser',   { token: this.token(), user }); },
  deleteUser(username) { return this.call('deleteUser', { token: this.token(), username }); },

  // أوامر الشراء
  listOrders()     { return this.call('listOrders',   { token: this.token() }); },
  saveOrder(order) { return this.call('saveOrder',    { token: this.token(), order }); },
  approveOrder(id) { return this.call('approveOrder', { token: this.token(), id }); },
  deleteOrder(id)  { return this.call('deleteOrder',  { token: this.token(), id }); },

  // قاعدة الموديلات
  listModels()       { return this.call('listModels',   { token: this.token() }); },
  saveModel(model)   { return this.call('saveModel',    { token: this.token(), model }); },
  deleteModel(id)    { return this.call('deleteModel',  { token: this.token(), id }); },
  importModels(rows) { return this.call('importModels', { token: this.token(), rows }); },

  // الشحن
  listShipments(scope)  { return this.call('listShipments',     { token: this.token(), scope }); },
  shipmentOptions()     { return this.call('shipmentOptions',   { token: this.token() }); },
  createShipment(s)     { return this.call('createShipment',    { token: this.token(), shipment: s }); },
  updateShipment(s)     { return this.call('updateShipment',    { token: this.token(), shipment: s }); },
  confirmShipment(s)    { return this.call('confirmShipment',   { token: this.token(), shipment: s }); },
  unconfirmShipment(id) { return this.call('unconfirmShipment', { token: this.token(), id }); },
  deleteShipment(id)    { return this.call('deleteShipment',    { token: this.token(), id }); },

  // الحاويات
  listContainers()      { return this.call('listContainers',   { token: this.token() }); },
  updateContainer(c)    { return this.call('updateContainer',  { token: this.token(), container: c }); },
  addContainer(id)      { return this.call('addContainer',     { token: this.token(), id }); },
  deleteContainer(id)   { return this.call('deleteContainer',  { token: this.token(), id }); },
  findContainer(q)      { return this.call('findContainer',    { token: this.token(), q }); },
  receiveContainer(r)   { return this.call('receiveContainer', { token: this.token(), receipt: r }); },

  // ملفات الشحنات
  listFiles()           { return this.call('listFiles',  { token: this.token() }); },
  saveFile(f)           { return this.call('saveFile',   { token: this.token(), file: f }); },
  closeFile(f)          { return this.call('closeFile',  { token: this.token(), file: f }); },
  reopenFile(serial)    { return this.call('reopenFile', { token: this.token(), serial }); }
};
