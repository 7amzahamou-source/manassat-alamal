/**
 * صفحة: أوامر الشراء
 */
(function () {
  const FIELDS = ['poNo', 'date', 'department', 'supplier', 'currency', 'incoterm', 'payMethod', 'depositPct', 'notes'];
  let orders = [];
  let editing = null;
  let items = [];
  let readOnly = false;

  const statusTag = s => `<span class="tag ${s === 'معتمد' ? 'ok' : 'wait'}">${esc(s)}</span>`;
  const containersOf = o => (o.items || []).reduce((s, i) => s + (Number(i.containers) || 0), 0);
  const myDept = () => (isAdmin() ? '' : (currentUser.dept || ''));

  registerPage({
    key: 'orders',
    title: 'أوامر الشراء',
    icon: ICONS.orders,
    levels: ['none', 'view', 'edit', 'full'],
    init,
    show
  });

  function init() {
    $('filterDept').innerHTML = options(DEPTS, 'كل الأقسام');
    $('f_department').innerHTML = options(DEPTS, 'اختر القسم');

    $('refreshBtn').addEventListener('click', load);
    $('newOrderBtn').addEventListener('click', () => openOrder(null));
    ['search', 'filterDept', 'filterStatus'].forEach(id => $(id).addEventListener('input', render));
    $('ordersBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openOrder(orders.find(o => o.id === row.dataset.id));
    });

    $('orderForm').addEventListener('submit', save);
    $('orderForm').addEventListener('input', () => { $('formError').textContent = ''; });
    $('approveBtn').addEventListener('click', approve);
    $('deleteBtn').addEventListener('click', remove);
    $('f_currency').addEventListener('change', calcTotals);

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
  }

  /** عند فتح الصفحة: نضبط الأزرار حسب الصلاحية ونحمّل الأوامر */
  function show() {
    const dept = myDept();
    $('newOrderBtn').classList.toggle('hide', !can('orders', 'edit'));
    $('filterDept').classList.toggle('hide', !!dept);
    $('filterDept').value = '';
    $('ordersSub').textContent = dept ? 'أوامر ' + dept : 'إدخال ومتابعة أوامر الشراء واعتمادها.';
    load();
  }

  async function load() {
    orders = [];
    $('stats').innerHTML = '';
    $('ordersBody').innerHTML = '<tr><td colspan="9" class="empty">جارٍ تحميل الأوامر…</td></tr>';
    try {
      const result = await API.listOrders();
      orders = result.orders || [];
      render();
    } catch (err) {
      $('ordersBody').innerHTML = `<tr><td colspan="9" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const dept = $('filterDept').value;
    const status = $('filterStatus').value;
    return orders.filter(o =>
      (!q || [o.poNo, o.supplier, ...(o.items || []).map(i => i.model)].join(' ').toLowerCase().includes(q)) &&
      (!dept || o.department === dept) &&
      (!status || o.status === status));
  }

  function render() {
    const list = filtered();

    $('stats').innerHTML = [
      ['عدد الأوامر', list.length],
      ['معتمدة', list.filter(o => o.status === 'معتمد').length],
      ['بانتظار الاعتماد', list.filter(o => o.status !== 'معتمد').length],
      ['إجمالي الحاويات', num(list.reduce((s, o) => s + containersOf(o), 0))]
    ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join('');

    if (!list.length) {
      const msg = orders.length ? 'لا توجد أوامر مطابقة للبحث.'
        : can('orders', 'edit') ? 'لا توجد أوامر بعد. اضغط «أمر شراء جديد» لإضافة أول أمر.' : 'لا توجد أوامر بعد.';
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

  /* ===== نافذة الأمر ===== */

  function openOrder(order) {
    editing = order || null;
    const dept = myDept();
    const o = order || { date: today(), currency: 'USD', incoterm: 'FOB', payMethod: 'T/T', department: dept, items: [] };
    readOnly = !can('orders', 'edit') || (o.status === 'معتمد' && !can('orders', 'full'));

    $('dlgTitle').textContent = order ? 'أمر الشراء ' + order.poNo : 'أمر شراء جديد';
    $('dlgStatus').innerHTML = order ? statusTag(order.status) : '';
    FIELDS.forEach(f => { $('f_' + f).value = o[f] ?? ''; });
    if (!o.depositPct) $('f_depositPct').value = '';

    document.querySelectorAll('#orderForm .grid input, #orderForm .grid select').forEach(el => { el.disabled = readOnly; });
    if (dept) $('f_department').disabled = true;   // الموظف مرتبط بقسمه

    $('saveBtn').classList.toggle('hide', readOnly);
    $('addItemBtn').classList.toggle('hide', readOnly);
    $('approveBtn').classList.toggle('hide', !(can('orders', 'full') && order && order.status !== 'معتمد'));
    $('deleteBtn').classList.toggle('hide', !(can('orders', 'full') && order));

    let meta = '';
    if (order) {
      meta = `أنشأه ${order.createdBy} في ${order.createdAt}` +
        (order.approvedBy ? ` — اعتمده ${order.approvedBy} في ${order.approvedAt}` : '') +
        ` — آخر تعديل: ${order.updatedBy} في ${order.updatedAt}`;
      if (readOnly && can('orders', 'edit')) meta += ' — الأمر معتمد، تعديله يحتاج صلاحية كاملة.';
    }
    $('dlgMeta').textContent = meta;

    items = (o.items || []).map(i => ({ ...i }));
    if (!items.length) items.push({});
    drawItems();

    $('formError').textContent = '';
    $('orderDialog').showModal();
    if (!readOnly && !order) $('f_poNo').focus();
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
        <td>${readOnly ? '' : `<button type="button" class="btn small danger" data-remove="${n}" aria-label="حذف البند">✕</button>`}</td>
      </tr>`).join('');
    if (readOnly) $('itemsBody').querySelectorAll('input').forEach(el => { el.disabled = true; });
    calcTotals();
  }

  function calcTotals() {
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
    $('totVal').textContent = money(val, $('f_currency').value);
  }

  function readForm() {
    const order = { id: editing ? editing.id : '' };
    FIELDS.forEach(f => { order[f] = $('f_' + f).value; });
    order.items = items.filter(i => String(i.model || '').trim() || Number(i.qty));
    return order;
  }

  function putLocal(order) {
    orders = orders.filter(o => o.id !== order.id).concat(order)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    render();
  }

  async function save(event) {
    event.preventDefault();
    if (readOnly) return;
    $('formError').textContent = '';
    const done = busy($('saveBtn'), 'جارٍ الحفظ…');
    try {
      const result = await API.saveOrder(readForm());
      putLocal(result.order);
      $('orderDialog').close();
      toast(result.message + (result.order.status === 'معتمد' ? '' : ' — بانتظار الاعتماد'));
    } catch (err) {
      $('formError').textContent = err.message;
    } finally {
      done();
    }
  }

  async function approve() {
    if (!editing) return;
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

  async function remove() {
    if (!editing || !confirm('حذف أمر الشراء ' + editing.poNo + ' نهائيًا؟')) return;
    const done = busy($('deleteBtn'), 'جارٍ الحذف…');
    try {
      await API.deleteOrder(editing.id);
      orders = orders.filter(o => o.id !== editing.id);
      render();
      $('orderDialog').close();
      toast('تم حذف الأمر ' + editing.poNo);
    } catch (err) {
      $('formError').textContent = err.message;
    } finally {
      done();
    }
  }
})();
