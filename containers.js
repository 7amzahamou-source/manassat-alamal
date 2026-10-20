/**
 * صفحتا: متابعة الحاويات + استلام الحاويات (شاشة المستودع)
 */
(function () {
  const CD_FIELDS = ['containerNo', 'size', 'model', 'qty', 'spareParts', 'arrivalPort', 'dischargeDate', 'freeDays',
    'warehouse', 'receivedDate', 'receivedQty', 'emptyReturnDate', 'notes'];
  const DEFAULT_WAREHOUSES = ['مستودع الدمام', 'مستودع الرياض', 'مستودع جدة'];

  let containers = [];
  let current = null;
  let rcTimer = null;
  let rcFound = [];

  const stateTag = s => {
    const cls = { 'في الطريق': 'gray', 'في الميناء': 'wait', 'استلمت': 'ok', 'أُعيد الفارغ': '' }[s] ?? '';
    return `<span class="tag ${cls}">${esc(s)}</span>`;
  };
  const needsAction = c => !!(freeTime(c) || {}).alert;

  registerPage({ key: 'containers', title: 'متابعة الحاويات', icon: ICONS.containers, levels: ['none', 'view', 'edit', 'full'], init, show });
  registerPage({ key: 'receive', title: 'استلام الحاويات', icon: ICONS.receive, levels: ['none', 'edit'], init: initReceive, show: showReceive });

  /** المستودعات: الافتراضية + اللي انكتبت قبل */
  function warehouses() {
    return [...new Set(DEFAULT_WAREHOUSES.concat(containers.map(c => c.warehouse).filter(Boolean)))];
  }

  /* ===== متابعة الحاويات ===== */

  function init() {
    $('cnRefreshBtn').addEventListener('click', load);
    ['cnSearch', 'cnFilterState', 'cnFilterWh'].forEach(id => $(id).addEventListener('input', render));
    $('cnBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openContainer(containers.find(c => c.id === row.dataset.id));
    });
    $('cntForm').addEventListener('submit', save);
    $('cntForm').addEventListener('input', () => { $('cdError').textContent = ''; updateFree(); });
    $('cd_containerNo').addEventListener('blur', () => {
      $('cd_containerNo').value = $('cd_containerNo').value.toUpperCase().replace(/[\s-]/g, '');
    });
    $('cd_receivedDate').addEventListener('change', () => {
      if ($('cd_receivedDate').value && !$('cd_receivedQty').value) $('cd_receivedQty').value = $('cd_qty').value;
    });
    $('cdAddBtn').addEventListener('click', addSame);
    $('cdDeleteBtn').addEventListener('click', remove);
  }

  function show() {
    load();
  }

  async function load() {
    containers = [];
    $('cnStats').innerHTML = '';
    $('cnBody').innerHTML = '<tr><td colspan="14" class="empty">جارٍ التحميل…</td></tr>';
    try {
      containers = (await API.listContainers()).containers || [];
      const wh = $('cnFilterWh').value;
      $('cnFilterWh').innerHTML = options(warehouses(), 'كل المستودعات');
      $('cnFilterWh').value = wh;
      $('whList').innerHTML = warehouses().map(w => `<option>${esc(w)}</option>`).join('');
      render();
    } catch (err) {
      $('cnBody').innerHTML = `<tr><td colspan="14" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function render() {
    const q = $('cnSearch').value.trim().toLowerCase();
    const st = $('cnFilterState').value;
    const wh = $('cnFilterWh').value;
    const list = containers.filter(c =>
      (!q || [c.containerNo, c.serial, c.invoiceNo, c.poNo, c.model].join(' ').toLowerCase().includes(q)) &&
      (!wh || c.warehouse === wh) &&
      (!st || (st === 'open' ? !c.receivedDate : st === 'alert' ? needsAction(c) : st === 'noNumber' ? !c.containerNo : c.state === st)));

    const count = s => containers.filter(c => c.state === s).length;
    const alerts = containers.filter(c => (freeTime(c) || {}).alert).length;
    $('cnStats').innerHTML = [
      ['في الطريق', count('في الطريق')],
      ['في الميناء', count('في الميناء')],
      ['مستلمة (لم يُرجع الفارغ)', count('استلمت')],
      ['أُعيد الفارغ', count('أُعيد الفارغ')],
      ['أيام مجانية تنتهي / متأخرة', alerts, alerts ? 'alert' : '']
    ].map(([l, v, cls]) => `<div class="stat ${cls || ''}"><small>${l}</small><b>${v}</b></div>`).join('');

    if (!list.length) {
      const msg = containers.length ? 'لا توجد حاويات مطابقة.' : 'لا توجد حاويات بعد. تُنشأ تلقائيًا عند تعميد الشحن.';
      $('cnBody').innerHTML = `<tr><td colspan="14" class="empty">${msg}</td></tr>`;
      return;
    }

    $('cnBody').innerHTML = list.map(c => {
      const f = freeTime(c);
      return `
      <tr data-id="${esc(c.id)}">
        <td><b>${esc(c.serial)}</b></td>
        <td class="num muted">${esc(c.seq)}</td>
        <td dir="ltr" style="text-align:right">${c.containerNo ? `<b>${esc(c.containerNo)}</b>` : '<span class="tag bad">بدون رقم</span>'}${c.size ? ` <span class="muted">${esc(c.size)}'</span>` : ''}</td>
        <td dir="ltr" style="text-align:right">${esc(c.invoiceNo)}</td>
        <td>${esc(c.poNo)}</td>
        <td dir="ltr" style="text-align:right">${esc(c.model || '—')}</td>
        <td class="num">${c.qty ? num(c.qty) : '—'}</td>
        <td>${esc(c.arrivalPort || '—')}</td>
        <td>${esc(c.dischargeDate || (c.eta ? 'متوقع ' + c.eta : '—'))}</td>
        <td>${f ? `<span class="tag ${f.cls}" title="آخر يوم مجاني ${f.last}">${esc(f.label)}</span>` : (c.dischargeDate ? '<span class="muted">حدد الأيام</span>' : '—')}</td>
        <td>${esc(c.warehouse || '—')}</td>
        <td>${esc(c.receivedDate || '—')}${c.receivedDate && c.receivedQty !== '' && Number(c.receivedQty) !== Number(c.qty) ? ` <span class="tag wait" title="الكمية المستلمة تختلف">${num(c.receivedQty)}</span>` : ''}</td>
        <td>${esc(c.emptyReturnDate || '—')}</td>
        <td>${stateTag(c.state)}</td>
      </tr>`;
    }).join('');
  }

  function openContainer(c) {
    current = c;
    const editable = can('containers', 'edit');
    $('cdTitle').textContent = `حاوية ${c.seq} — التسلسل ${c.serial}`;
    $('cdState').innerHTML = stateTag(c.state);
    $('cdInfo').innerHTML = [
      ['التسلسل', c.serial], ['الفاتورة', c.invoiceNo], ['أمر الشراء', c.poNo], ['القسم', c.department]
    ].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('');

    CD_FIELDS.forEach(f => { $('cd_' + f).value = c[f] ?? ''; });
    if (!c.qty) $('cd_qty').value = '';
    // موديلات نفس الشحنة كاقتراحات
    $('cdModels').innerHTML = [...new Set(containers.filter(x => x.shipmentId === c.shipmentId).map(x => x.model).filter(Boolean))]
      .map(m => `<option>${esc(m)}</option>`).join('');

    document.querySelectorAll('#cntForm .grid input, #cntForm .grid select').forEach(el => { el.disabled = !editable; });
    $('cdSaveBtn').classList.toggle('hide', !editable);
    $('cdAddBtn').classList.toggle('hide', !can('containers', 'full'));
    $('cdDeleteBtn').classList.toggle('hide', !can('containers', 'full') || !!c.receivedDate);
    $('cdMeta').textContent = (c.receivedBy ? `استلمها ${c.receivedBy} — ` : '') + (c.updatedBy ? `آخر تعديل: ${c.updatedBy} في ${c.updatedAt}` : '');
    $('cdError').textContent = '';
    updateFree();
    $('cntDialog').showModal();
  }

  function updateFree() {
    const f = freeTime({
      dischargeDate: $('cd_dischargeDate').value, freeDays: $('cd_freeDays').value, emptyReturnDate: $('cd_emptyReturnDate').value
    });
    $('cdFree').classList.toggle('hide', !f);
    if (f) $('cdFree').innerHTML = `آخر يوم مجاني: <b>${f.last}</b> — <span class="tag ${f.cls}">${esc(f.label)}</span>`;
  }

  function putLocal(c) {
    const i = containers.findIndex(x => x.id === c.id);
    if (i >= 0) containers[i] = c;
    else containers.push(c);
    containers.sort((a, b) => (Number(b.serial) - Number(a.serial)) || (Number(a.seq) - Number(b.seq)));
    render();
  }

  async function run(btn, text, fn) {
    $('cdError').textContent = '';
    const done = busy(btn, text);
    try {
      const result = await fn();
      if (result.container) putLocal(result.container);
      $('cntDialog').close();
      toast(result.message);
    } catch (err) {
      $('cdError').textContent = err.message;
    } finally {
      done();
    }
  }

  function save(e) {
    e.preventDefault();
    const c = { id: current.id };
    CD_FIELDS.forEach(f => { c[f] = $('cd_' + f).value; });
    run($('cdSaveBtn'), 'جارٍ الحفظ…', () => API.updateContainer(c));
  }

  function addSame() {
    run($('cdAddBtn'), 'جارٍ الإضافة…', () => API.addContainer(current.id));
  }

  function remove() {
    if (!confirm('حذف هذه الحاوية من الشحنة؟')) return;
    const id = current.id;
    run($('cdDeleteBtn'), 'جارٍ الحذف…', async () => {
      const r = await API.deleteContainer(id);
      containers = containers.filter(x => x.id !== id);
      render();
      return r;
    });
  }

  /* ===== شاشة الاستلام ===== */

  function initReceive() {
    $('rcSearch').addEventListener('input', () => {
      const v = $('rcSearch').value.toUpperCase().replace(/[\s-]/g, '');
      clearTimeout(rcTimer);
      if (v.length < 4) { rcFound = []; $('rcResults').innerHTML = ''; return; }
      $('rcResults').innerHTML = '<p class="sub" style="text-align:center">جارٍ البحث…</p>';
      rcTimer = setTimeout(() => searchReceive(v), 400);
    });
    $('rcResults').addEventListener('submit', receive);
  }

  function showReceive() {
    $('rcSearch').value = '';
    $('rcResults').innerHTML = '';
    rcFound = [];
    setTimeout(() => $('rcSearch').focus(), 50);
  }

  async function searchReceive(q) {
    try {
      const r = await API.findContainer(q);
      if ($('rcSearch').value.toUpperCase().replace(/[\s-]/g, '') !== q) return;   // المستخدم كتب شي أحدث
      rcFound = r.containers || [];
      renderReceive();
    } catch (err) {
      $('rcResults').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  function renderReceive() {
    if (!rcFound.length) {
      $('rcResults').innerHTML = '<div class="card rc-card"><p class="sub" style="margin:0;text-align:center">ما فيه حاوية بهذا الرقم. تأكد من الرقم أو راجع قسم الشحن.</p></div>';
      return;
    }
    const whs = [...new Set(DEFAULT_WAREHOUSES.concat(rcFound.map(c => c.warehouse).filter(Boolean)))];
    $('rcResults').innerHTML = rcFound.map(c => `
      <div class="card rc-card">
        <h3><span dir="ltr">${esc(c.containerNo)}</span> ${stateTag(c.state)}</h3>
        <div class="kv">
          <div><small>التسلسل</small><b>${esc(c.serial)}</b></div>
          <div><small>الموديل</small><b dir="ltr">${esc(c.model || '—')}</b></div>
          <div><small>الكمية</small><b>${c.qty ? num(c.qty) : '—'}</b></div>
          <div><small>ميناء الوصول</small><b>${esc(c.arrivalPort || '—')}</b></div>
        </div>
        ${c.receivedDate
          ? `<div class="rc-done">✓ استلمت بتاريخ ${esc(c.receivedDate)} في ${esc(c.warehouse || '—')}${c.receivedQty !== '' ? ' — الكمية ' + num(c.receivedQty) : ''}</div>`
          : `<form class="rc-form" data-id="${esc(c.id)}">
              <div><label>تاريخ الاستلام *</label><input name="receivedDate" type="date" value="${today()}" max="${today()}" required></div>
              <div><label>الكمية المستلمة</label><input name="receivedQty" type="number" min="0" step="any" value="${c.qty || ''}"></div>
              <div><label>المستودع *</label><input name="warehouse" list="rcWh" value="${esc(c.warehouse || '')}" required autocomplete="off"></div>
              <div class="wide"><label>ملاحظات (نقص، تلف…)</label><input name="notes"></div>
              <div><button class="btn primary" type="submit" style="width:100%">تأكيد الاستلام</button></div>
              <div class="error" style="grid-column:1/-1"></div>
            </form>`}
      </div>`).join('') + `<datalist id="rcWh">${whs.map(w => `<option>${esc(w)}</option>`).join('')}</datalist>`;
  }

  async function receive(e) {
    e.preventDefault();
    const form = e.target.closest('form');
    const c = rcFound.find(x => x.id === form.dataset.id);
    const btn = form.querySelector('button');
    const err = form.querySelector('.error');
    err.textContent = '';
    const payload = { id: c.id };
    ['receivedDate', 'receivedQty', 'warehouse', 'notes'].forEach(n => { payload[n] = form.elements[n].value; });
    if (payload.receivedQty !== '' && Number(payload.receivedQty) !== Number(c.qty) &&
        !confirm(`الكمية المستلمة (${payload.receivedQty}) تختلف عن كمية الحاوية (${c.qty}). متأكد؟`)) return;
    const done = busy(btn, 'جارٍ الحفظ…');
    try {
      const r = await API.receiveContainer(payload);
      rcFound = rcFound.map(x => x.id === c.id ? r.container : x);
      renderReceive();
      toast(r.message);
    } catch (ex) {
      err.textContent = ex.message;
      done();
    }
  }
})();
