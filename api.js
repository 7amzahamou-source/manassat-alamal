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

  // الحسابات
  login(username, password) { return this.call('login', { username, password }); },
  me(token)                 { return this.call('me', { token }); },
  logout(token)             { return this.call('logout', { token }); },

  // أوامر الشراء
  listOrders()     { return this.call('listOrders',   { token: this.token() }); },
  saveOrder(order) { return this.call('saveOrder',    { token: this.token(), order }); },
  approveOrder(id) { return this.call('approveOrder', { token: this.token(), id }); },
  deleteOrder(id)  { return this.call('deleteOrder',  { token: this.token(), id }); }
};
