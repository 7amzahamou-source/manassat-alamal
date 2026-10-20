/**
 * صفحتا: طلبات الشحن + البضاعة المشحونة
 * (ملف واحد لأنهما تتشاركان نافذة «بيانات الشحن»)
 */
(function () {
  const SHIPPED = 'تم الشحن';
  const SD_FIELDS = ['invoiceNo', 'approvalNo', 'readyDate', 'forwarder', 'shipDate', 'eta', 'arrivalPort',
    'broker', 'freight', 'freightCurrency', 'inspection', 'inspectionNote', 'notes'];

  let pending = [];      // طلبات الشحن
  let shipped = [];      // البضاعة المشحونة
  let poOptions = [];    // أوامر الشراء المتاحة للشحن
  let lines = [];        // بنود طلب الشحن الجديد
  let current = null;    // الشحنة المفتوحة في نافذة بيانات الشحن

  const stateTag = s => {
    const cls = s === SHIPPED ? 'ok' : s === 'جاهزة للشحن' ? '' : 'wait';
    return `<span class="tag ${cls}">${esc(s)}</span>`;
  };
  const inspTag = v => `<span class="tag ${v === 'مجتاز' ? 'ok' : v === 'معفى' ? 'gray' : v === 'مرفوض' ? 'bad' : 'wait'}">${esc(v || 'لم يُفحص')}</span>`;
  const modelsOf = s => (s.lines || []).map(l => l.model).join('، ');

  registerPage({ key: 'shipments', title: 'طلبات الشحن', icon: ICONS.shipments, levels: ['none', 'view', 'edit', 'full'], init, show: showPending });
  registerPage({ key: 'shipped', title: 'البضاعة المشحونة', icon: ICONS.shipped, levels: ['none', 'view', 'edit', 'full'], show: showShipped });

  function init() {
    // طلبات الشحن
    $('shRefreshBtn').addEventListener('click', loadPending);
    $('newShipBtn').addEventListener('click', openNew);
    ['shSearch', 'shFilterState'].forEach(id => $(id).addEventListener('input', renderPending));
    $('shBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openShip(pending.find(s => s.id === row.dataset.id));
    });

    // البضاعة المشحونة
    $('spRefreshBtn').addEventListener('click', loadShipped);
    $('spSearch').addEventListener('input', renderShipped);
    $('spBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openShip(shipped.find(s => s.id === row.dataset.id));
    });

    // نافذة طلب جديد
    $('ns_po').addEventListener('change', pickPo);
    $('nsLines').addEventListener('input', e => {
      const { n, f } = e.target.dataset;
      if (n === undefined) return;
      lines[n][f] = e.target.value;
      if (f === 'containers') lines[n]._cManual = e.target.value !== '';
      if (f === 'qty') autoContainers(Number(n));
      nsTotals();
    });
    $('newShipForm').addEventListener('submit', createShipment);
    $('newShipForm').addEventListener('input', () => { $('nsError').textContent = ''; });

    // نافذة بيانات الشحن
    $('shipForm').addEventListener('submit', e => { e.preventDefault(); saveShip(); });
    $('shipForm').addEventListener('input', () => { $('sdError').textContent = ''; });
    $('sdConfirmBtn').addEventListener('click', confirmShip);
    $('sdUnconfirmBtn').addEventListener('click', unconfirmShip);
    $('sdDeleteBtn').addEventListener('click', deleteShip);
  }

  /* ===== طلبات الشحن ===== */

  function showPending() {
    $('newShipBtn').classList.toggle('hide', !can('shipments', 'edit'));
    loadPending();
  }

  async function loadPending() {
    pending = [];
    $('shStats').innerHTML = '';
    $('shBody').innerHTML = '<tr><td colspan="11" class="empty">جارٍ التحميل…</td></tr>';
    try {
      pending = (await API.listShipments('pending')).shipments || [];
      renderPending();
    } catch (err) {
      $('shBody').innerHTML = `<tr><td colspan="11" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function renderPending() {
    const q = $('shSearch').value.trim().toLowerCase();
    const st = $('shFilterState').value;
    const list = pending.filter(s =>
      (!q || [s.requestCode, s.poNo, s.invoiceNo, s.port, s.supplier, modelsOf(s)].join(' ').toLowerCase().includes(q)) &&
      (!st || s.state === st));

    $('shStats').innerHTML = [
      ['عدد الطلبات', pending.length],
      ['قيد التصنيع', pending.filter(s => s.state === 'قيد التصنيع').length],
      ['جاهزة للشحن', pending.filter(s => s.state === 'جاهزة للشحن').length],
      ['إجمالي الحاويات', num(pending.reduce((t, s) => t + (Number(s.totalContainers) || 0), 0))]
    ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');

    if (!list.length) {
      const msg = pending.length ? 'لا توجد طلبات مطابقة.'
        : can('shipments', 'edit') ? 'لا توجد طلبات شحن. اضغط «طلب شحن جديد» واختر أمر شراء معتمد.' : 'لا توجد طلبات شحن.';
      $('shBody').innerHTML = `<tr><td colspan="11" class="empty">${msg}</td></tr>`;
      return;
    }
    $('shBody').innerHTML = list.map(s => `
      <tr data-id="${esc(s.id)}">
        <td><b dir="ltr">${esc(s.requestCode)}</b></td>
        <td>${esc(s.poNo)}</td>
        <td>${esc(s.supplier)}</td>
        <td dir="ltr" style="text-align:right">${esc(s.invoiceNo)}</td>
        <td>${esc(s.port)}</td>
        <td class="models">${esc(modelsOf(s))}</td>
        <td class="num">${num(s.totalQty)}</td>
        <td class="num">${num(s.totalContainers) || '—'}</td>
        <td>${esc(s.readyDate)}</td>
        <td>${inspTag(s.inspection)}</td>
        <td>${stateTag(s.state)}</td>
      </tr>`).join('');
  }

  /* ===== البضاعة المشحونة ===== */

  function showShipped() {
    loadShipped();
  }

  async function loadShipped() {
    shipped = [];
    $('spStats').innerHTML = '';
    $('spBody').innerHTML = '<tr><td colspan="11" class="empty">جارٍ التحميل…</td></tr>';
    try {
      shipped = (await API.listShipments('shipped')).shipments || [];
      renderShipped();
    } catch (err) {
      $('spBody').innerHTML = `<tr><td colspan="11" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function renderShipped() {
    const q = $('spSearch').value.trim().toLowerCase();
    const list = shipped.filter(s =>
      !q || [s.serial, s.invoiceNo, s.poNo, s.requestCode, s.forwarder, s.broker, s.port, s.arrivalPort, modelsOf(s)].join(' ').toLowerCase().includes(q));
    const t = today();
    const invoices = new Set(shipped.map(s => s.serial)).size;

    $('spStats').innerHTML = [
      ['عدد الفواتير', invoices],
      ['الكمية المشحونة', num(shipped.reduce((a, s) => a + (Number(s.totalQty) || 0), 0))],
      ['الحاويات (مستلمة)', num(shipped.reduce((a, s) => a + (Number(s.containerRows || s.totalContainers) || 0), 0)) +
        ' <small class="sub">(' + num(shipped.reduce((a, s) => a + (Number(s.receivedContainers) || 0), 0)) + ')</small>'],
      ['في الطريق (لم يحن موعد وصولها)', shipped.filter(s => s.eta && s.eta >= t).length]
    ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');

    if (!list.length) {
      $('spBody').innerHTML = `<tr><td colspan="11" class="empty">${shipped.length ? 'لا توجد شحنات مطابقة.' : 'لا توجد شحنات معمّدة بعد. تظهر هنا بعد «تعميد الشحن» من طلبات الشحن.'}</td></tr>`;
      return;
    }
    $('spBody').innerHTML = list.map(s => `
      <tr data-id="${esc(s.id)}">
        <td><b class="serial">${esc(s.serial)}</b></td>
        <td dir="ltr" style="text-align:right">${esc(s.invoiceNo)}</td>
        <td>${esc(s.poNo)}</td>
        <td class="models">${esc(modelsOf(s))}</td>
        <td class="num">${num(s.totalQty)}</td>
        <td class="num">${num(s.containerRows || s.totalContainers) || '—'} <span class="sub">(${num(s.receivedContainers)})</span></td>
        <td>${esc(s.shipDate || '—')}</td>
        <td>${esc(s.eta || '—')}</td>
        <td>${esc(s.port)} ← ${esc(s.arrivalPort || '—')}</td>
        <td>${esc(s.forwarder || '—')}</td>
        <td>${esc(s.broker || '—')}</td>
      </tr>`).join('');
  }

  /* ===== طلب شحن جديد ===== */

  async function openNew() {
    poOptions = [];
    lines = [];
    $('newShipForm').reset();
    $('ns_ready').value = today();
    $('nsError').textContent = '';
    $('nsPoInfo').textContent = '';
    $('ns_po').innerHTML = '<option value="">جارٍ تحميل أوامر الشراء…</option>';
    $('nsLines').innerHTML = '<tr><td colspan="7" class="empty">اختر أمر الشراء.</td></tr>';
    nsTotals();
    $('newShipDialog').showModal();
    try {
      poOptions = (await API.shipmentOptions()).orders || [];
      $('ns_po').innerHTML = poOptions.length
        ? '<option value="">اختر أمر الشراء</option>' + poOptions.map(o =>
            `<option value="${esc(o.id)}">${esc(o.poNo)} — ${esc(o.supplier)}</option>`).join('')
        : '<option value="">لا توجد أوامر معتمدة فيها كميات متاحة للشحن</option>';
    } catch (err) {
      $('nsError').textContent = err.message;
    }
  }

  function pickPo() {
    const po = poOptions.find(o => o.id === $('ns_po').value);
    $('nsError').textContent = '';
    if (!po) {
      lines = [];
      $('nsPoInfo').textContent = '';
      $('nsLines').innerHTML = '<tr><td colspan="7" class="empty">اختر أمر الشراء.</td></tr>';
      nsTotals();
      return;
    }
    $('nsPoInfo').textContent = `${po.supplier} — ${po.department} — تاريخ الأمر ${po.date}`;
    lines = po.lines.map(l => ({ ...l, qty: '', containers: '' }));
    $('nsLines').innerHTML = lines.map((l, n) => `
      <tr>
        <td><b dir="ltr">${esc(l.model)}</b></td>
        <td>${esc(l.description || '—')}</td>
        <td class="num">${num(l.ordered)}</td>
        <td class="num">${num(l.requested) || '—'}</td>
        <td class="num"><b>${num(l.available)}</b></td>
        <td>${l.available > 0
          ? `<input data-n="${n}" data-f="qty" class="qty-in" type="number" min="0" max="${l.available}" step="any" placeholder="حتى ${num(l.available)}">`
          : '<span class="tag gray">لا يوجد متاح</span>'}</td>
        <td>${l.available > 0 ? `<input data-n="${n}" data-f="containers" id="nsc${n}" type="number" min="0" step="1">` : '—'}</td>
      </tr>`).join('');
    nsTotals();
  }

  /** الحاويات: بنسبة حاويات البند في أمر الشراء، أو من الكمية في الحاوية بقاعدة الموديلات */
  function autoContainers(n) {
    const l = lines[n];
    if (l._cManual) return;
    const q = Number(l.qty) || 0;
    let c = '';
    if (q > 0 && l.itemContainers > 0 && l.ordered > 0) c = Math.ceil(q * l.itemContainers / l.ordered);
    else if (q > 0 && l.perContainer > 0) c = Math.ceil(q / l.perContainer);
    l.containers = c;
    const el = $('nsc' + n);
    if (el) el.value = c;
  }

  function nsTotals() {
    $('nsQty').textContent = num(lines.reduce((t, l) => t + (Number(l.qty) || 0), 0));
    $('nsCnt').textContent = num(lines.reduce((t, l) => t + (Number(l.containers) || 0), 0));
  }

  async function createShipment(e) {
    e.preventDefault();
    const bad = lines.find(l => Number(l.qty) > l.available);
    if (bad) { $('nsError').textContent = `الكمية للموديل ${bad.model} أكبر من المتاح (${num(bad.available)})`; return; }
    const payload = {
      poId: $('ns_po').value,
      invoiceNo: $('ns_invoice').value,
      port: $('ns_port').value,
      readyDate: $('ns_ready').value,
      notes: $('ns_notes').value,
      lines: lines.filter(l => Number(l.qty) > 0).map(l => ({ model: l.model, qty: l.qty, containers: l.containers }))
    };
    if (!payload.lines.length) { $('nsError').textContent = 'حدد كمية لموديل واحد على الأقل.'; return; }

    const done = busy($('nsSaveBtn'), 'جارٍ الإرسال…');
    try {
      const result = await API.createShipment(payload);
      pending = pending.concat(result.shipment).sort((a, b) => a.readyDate.localeCompare(b.readyDate));
      renderPending();
      $('newShipDialog').close();
      toast(result.message);
    } catch (err) {
      $('nsError').textContent = err.message;
    } finally {
      done();
    }
  }

  /* ===== نافذة بيانات الشحن ===== */

  function openShip(s) {
    current = s;
    const isShipped = s.status === SHIPPED;
    const page = isShipped ? 'shipped' : 'shipments';
    const editable = can(page, 'edit');

    $('sdTitle').textContent = isShipped ? `الشحنة ${s.serial} — فاتورة ${s.invoiceNo}` : 'طلب الشحن ' + s.requestCode;
    $('sdState').innerHTML = stateTag(s.state);
    $('sdInfo').innerHTML = [
      ['كود الطلب', s.requestCode], ['أمر الشراء', s.poNo], ['المورد', s.supplier], ['القسم', s.department],
      ['ميناء التحميل', s.port], ['الكمية', num(s.totalQty)], ['الحاويات', num(s.totalContainers) || '—'],
      [isShipped ? 'التسلسل' : 'الجاهزية', isShipped ? s.serial : s.readyDate]
    ].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('');
    $('sdLines').innerHTML = (s.lines || []).map(l => `
      <tr><td><b dir="ltr">${esc(l.model)}</b></td><td>${esc(l.description || '—')}</td><td class="num">${num(l.qty)}</td><td class="num">${num(l.containers) || '—'}</td></tr>`).join('');

    SD_FIELDS.forEach(f => { $('sd_' + f).value = s[f] ?? ''; });
    if (!s.freight) $('sd_freight').value = '';
    $('sdReadyWrap').classList.toggle('hide', isShipped);
    document.querySelectorAll('#shipForm .grid input, #shipForm .grid select').forEach(el => { el.disabled = !editable; });

    $('sdSaveBtn').classList.toggle('hide', !editable);
    $('sdConfirmBtn').classList.toggle('hide', isShipped || !can('shipments', 'full'));
    $('sdHint').classList.toggle('hide', isShipped || !can('shipments', 'full'));
    $('sdDeleteBtn').classList.toggle('hide', isShipped || !can('shipments', 'full'));
    $('sdUnconfirmBtn').classList.toggle('hide', !isShipped || !can('shipped', 'full'));

    $('sdMeta').textContent = `أنشأه ${s.createdBy} في ${s.createdAt}` +
      (s.shippedBy ? ` — عمّده ${s.shippedBy} في ${s.shippedAt}` : '') +
      ` — آخر تعديل: ${s.updatedBy} في ${s.updatedAt}`;
    $('sdError').textContent = '';
    $('shipDialog').showModal();
  }

  function readShip() {
    const s = { id: current.id };
    SD_FIELDS.forEach(f => { s[f] = $('sd_' + f).value; });
    return s;
  }

  /** يحدّث الشحنة في القائمة المناسبة بعد أي عملية */
  function putLocal(s) {
    pending = pending.filter(x => x.id !== s.id);
    shipped = shipped.filter(x => x.id !== s.id);
    if (s.status === SHIPPED) shipped = [s].concat(shipped).sort((a, b) => Number(b.serial) - Number(a.serial));
    else pending = pending.concat(s).sort((a, b) => a.readyDate.localeCompare(b.readyDate));
    renderPending();
    renderShipped();
  }

  async function run(btn, text, fn) {
    $('sdError').textContent = '';
    const done = busy(btn, text);
    try {
      const result = await fn();
      if (result.shipment) putLocal(result.shipment);
      $('shipDialog').close();
      toast(result.message);
      return result;
    } catch (err) {
      $('sdError').textContent = err.message;
    } finally {
      done();
    }
  }

  const saveShip = () => run($('sdSaveBtn'), 'جارٍ الحفظ…', () => API.updateShipment(readShip()));

  function confirmShip() {
    if (!confirm('تعميد شحن ' + current.requestCode + '؟\nبتنتقل الشحنة إلى «البضاعة المشحونة» وتاخذ رقم تسلسل.')) return;
    run($('sdConfirmBtn'), 'جارٍ التعميد…', () => API.confirmShipment(readShip()));
  }

  function unconfirmShip() {
    if (!confirm('إلغاء تعميد الشحنة ' + current.serial + '؟\nبترجع إلى «طلبات الشحن» ويُلغى رقم التسلسل.')) return;
    run($('sdUnconfirmBtn'), 'جارٍ الإلغاء…', () => API.unconfirmShipment(current.id));
  }

  function deleteShip() {
    if (!confirm('حذف طلب الشحن ' + current.requestCode + ' نهائيًا؟\nالكمية بترجع متاحة للشحن في أمر الشراء.')) return;
    const id = current.id;
    run($('sdDeleteBtn'), 'جارٍ الحذف…', async () => {
      const r = await API.deleteShipment(id);
      pending = pending.filter(x => x.id !== id);
      renderPending();
      return r;
    });
  }
})();
