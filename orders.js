/**
 * صفحة: أوامر الشراء
 */
(function () {
  const FIELDS = ['poNo', 'date', 'department', 'supplier', 'currency', 'incoterm', 'payMethod', 'depositPct', 'notes'];
  let orders = [];
  let editing = null;
  let items = [];
  let readOnly = false;
  let models = [];      // قاعدة الموديلات للتعبئة التلقائية

  const statusTag = s => `<span class="tag ${s === 'معتمد' ? 'ok' : 'wait'}">${esc(s)}</span>`;
  const containersOf = o => (o.items || []).reduce((s, i) => s + (Number(i.containers) || 0), 0);
  const myDept = () => (isAdmin() ? '' : (currentUser.dept || ''));

  /** تقدم الشحن: المشحون من الكمية المطلوبة */
  function shipProgress(o) {
    const total = Number(o.totalQty) || 0;
    const shipped = Number(o.shippedQty) || 0;
    const requested = Number(o.requestedQty) || 0;
    if (!total || (!requested && o.status !== 'معتمد')) return '<span class="sub">—</span>';
    const pct = Math.min(100, Math.round(shipped / total * 100));
    const title = `مشحون ${num(shipped)} — طلب شحن ${num(requested)} — من ${num(total)}`;
    return `<div class="progress" title="${title}"><div class="bar"><i style="width:${pct}%"></i></div><span class="num">${pct}%</span></div>`;
  }

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
      if (f === 'containers') items[n]._cManual = e.target.value !== '';
      if (f === 'model') applyModel(Number(n));
      if (f === 'qty') autoContainers(Number(n));
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
    if (can('orders', 'edit')) loadModels();
  }

  /* ===== الربط مع قاعدة الموديلات ===== */

  async function loadModels() {
    try {
      const result = await API.listModels();
      models = (result.models || []).filter(m => m.status !== 'غير فعال');
    } catch (err) {
      models = [];
    }
    $('modelsList').innerHTML = models.map(m =>
      `<option value="${esc(m.code)}">${esc([m.brand, m.description].filter(Boolean).join(' — '))}</option>`).join('');
  }

  const findModel = code => models.find(m => m.code.toLowerCase() === String(code || '').trim().toLowerCase());

  /** لما يطابق الموديل المكتوب موديلًا في القاعدة: نعبّي الوصف والمورد والقسم والحاويات */
  function applyModel(n) {
    const m = findModel(items[n].model);
    if (!m) return;
    items[n].model = m.code;
    if (!items[n].description) {
      items[n].description = [m.brand, m.description].filter(Boolean).join(' — ');
      const d = $('desc' + n);
      if (d) d.value = items[n].description;
    }
    if (!$('f_supplier').value && m.factory) $('f_supplier').value = m.factory;
    if (!$('f_department').value && m.department && !$('f_department').disabled) $('f_department').value = m.department;
    autoContainers(n);
  }

  /** الحاويات = الكمية ÷ الكمية في الحاوية (مقرّبة لأعلى)، إلا إذا كتبها المستخدم بنفسه */
  function autoContainers(n) {
    const i = items[n];
    const m = findModel(i.model);
    if (!m || !m.perContainer || i._cManual) return;
    i.containers = Number(i.qty) > 0 ? Math.ceil(Number(i.qty) / m.perContainer) : '';
    const c = $('cnt' + n);
    if (c) c.value = i.containers;
  }

  async function load() {
    orders = [];
    $('stats').innerHTML = '';
    $('ordersBody').innerHTML = '<tr><td colspan="10" class="empty">جارٍ تحميل الأوامر…</td></tr>';
    try {
      const result = await API.listOrders();
      orders = result.orders || [];
      render();
    } catch (err) {
      $('ordersBody').innerHTML = `<tr><td colspan="10" class="empty">${esc(err.message)}</td></tr>`;
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
      $('ordersBody').innerHTML = `<tr><td colspan="10" class="empty">${msg}</td></tr>`;
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
        <td>${shipProgress(o)}</td>
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

    // الاعتمادات البنكية المرتبطة بالأمر
    const lcs = o.lcs || [];
    const covered = lcs.reduce((t, l) => t + (Number(l.amount) || 0), 0);
    $('odLcs').classList.toggle('hide', !order || (!lcs.length && o.payMethod !== 'L/C'));
    $('odLcs').innerHTML = !order ? '' : `<h3 class="fh">الاعتمادات البنكية</h3>` + (lcs.length
      ? `<div class="table-wrap"><table class="items"><thead><tr><th>رقم الاعتماد</th><th>البنك</th><th>المخصص لهذا الأمر</th><th>الحالة</th></tr></thead><tbody>` +
        lcs.map(l => `<tr><td><b dir="ltr">${esc(l.lcNo)}</b></td><td>${esc(l.bank)}</td><td class="num">${money(l.amount, l.currency)}</td><td><span class="tag ${l.state === 'منتهي' ? 'bad' : l.state === 'مقفل' ? 'gray' : 'ok'}">${esc(l.state)}</span></td></tr>`).join('') +
        `</tbody></table></div><p class="meta">مغطى ${money(covered)} من ${money(o.totalValue, o.currency)} (${o.totalValue ? Math.round(covered / o.totalValue * 100) : 0}%)</p>`
      : '<p class="warn">طريقة الدفع L/C ولا يوجد اعتماد بنكي مربوط بهذا الأمر بعد — افتحه من صفحة «الاعتمادات البنكية».</p>');

    items = (o.items || []).map(i => ({ ...i, _cManual: Number(i.containers) > 0 }));
    if (!items.length) items.push({});
    drawItems();

    $('formError').textContent = '';
    $('orderDialog').showModal();
    if (!readOnly && !order) $('f_poNo').focus();
  }

  function drawItems() {
    $('itemsBody').innerHTML = items.map((i, n) => `
      <tr>
        <td><input data-n="${n}" data-f="model" class="w-model" list="modelsList" autocomplete="off" value="${esc(i.model)}"></td>
        <td><input data-n="${n}" data-f="description" id="desc${n}" class="w-desc" value="${esc(i.description)}"></td>
        <td><input data-n="${n}" data-f="qty" type="number" min="0" step="any" value="${esc(i.qty)}"></td>
        <td><input data-n="${n}" data-f="price" type="number" min="0" step="any" value="${esc(i.price)}"></td>
        <td><input data-n="${n}" data-f="containers" id="cnt${n}" type="number" min="0" step="1" value="${esc(i.containers)}"></td>
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

    // تنبيه شهادات SASO للموديلات المختارة
    const warn = items.map(i => findModel(i.model)).filter(m => m && certInfo(m).attention)
      .map(m => `${m.code} (${certInfo(m).label})`);
    $('certWarn').textContent = warn.length ? '⚠️ شهادة SASO تحتاج متابعة: ' + [...new Set(warn)].join('، ') : '';
    $('certWarn').classList.toggle('hide', !warn.length);
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
