/**
 * صفحتا: طلبات الشحن + البضاعة المشحونة
 * (ملف واحد لأنهما تتشاركان نافذة «بيانات الشحن»)
 */
(function () {
  const SHIPPED = 'تم الشحن';
  const SD_FIELDS = ['invoiceNo', 'approvalNo', 'readyDate', 'forwarder', 'shipDate', 'eta', 'arrivalPort',
    'broker', 'freight', 'freightCurrency', 'inspection', 'inspectionNote', 'freeDays', 'notes'];

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
    $('nsLines').addEventListener('input', onLineInput);
    $('nsLines').addEventListener('click', e => {
      const b = e.target.closest('[data-all]');
      if (!b) return;
      const n = Number(b.dataset.all);
      const l = lines[n];
      l.qty = l.available; l._qAuto = false;
      $('nsq' + n).value = l.available;
      autoContainers(n, true);
      nsTotals();
    });
    $('nsSearch').addEventListener('input', nsFilter);
    $('nsHideZero').addEventListener('change', nsFilter);
    $('nsPasteBtn').addEventListener('click', () => {
      $('nsPaste').classList.toggle('hide');
      if (!$('nsPaste').classList.contains('hide')) $('nsPasteText').focus();
    });
    $('nsPasteCancel').addEventListener('click', () => { $('nsPaste').classList.add('hide'); $('nsPasteText').value = ''; $('nsPasteMsg').textContent = ''; });
    $('nsPasteApply').addEventListener('click', applyPaste);
    $('nsOpenLcBtn').addEventListener('click', () => { $('newShipDialog').close(); goTo('lcs'); });
    $('newShipForm').addEventListener('submit', createShipment);


    // نافذة بيانات الشحن
    $('shipForm').addEventListener('submit', e => { e.preventDefault(); saveShip(); });
    $('shipForm').addEventListener('input', () => { $('sdError').textContent = ''; lcInfo(); });
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
        <td>${stateTag(s.state)}${s.payMethod === 'L/C' && !s.lcId ? ' <span class="tag bad" title="أمر الشراء طريقة دفعه L/C ولم يُربط باعتماد">بدون L/C</span>' : ''}</td>
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

  const NS_EMPTY = msg => `<tr><td colspan="4" class="empty">${msg}</td></tr>`;
  const normModel = v => String(v || '').toLowerCase().replace(/[\s\-_/.]/g, '');

  async function openNew() {
    poOptions = [];
    lines = [];
    $('newShipForm').reset();
    $('ns_ready').value = today();
    $('nsHideZero').checked = true;
    $('nsError').textContent = '';
    $('nsPoChips').classList.add('hide');
    $('nsLcWrap').classList.add('hide');
    $('nsPaste').classList.add('hide');
    $('nsPasteMsg').textContent = '';
    $('nsHidden').textContent = '';
    $('nsPortsList').innerHTML = $('portsList').innerHTML;
    $('ns_po').innerHTML = '<option value="">جارٍ تحميل أوامر الشراء…</option>';
    $('nsLines').innerHTML = NS_EMPTY('اختر أمر الشراء.');
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
    $('nsSearch').value = '';
    if (!po) {
      lines = [];
      $('nsPoChips').classList.add('hide');
      $('nsLcWrap').classList.add('hide');
      $('nsLines').innerHTML = NS_EMPTY('اختر أمر الشراء.');
      $('nsHidden').textContent = '';
      nsTotals();
      return;
    }

    // معلومات الأمر كشارات
    const chip = (k, v, cls) => v ? `<span class="po-chip ${cls || ''}"><small>${k}</small>${v}</span>` : '';
    $('nsPoChips').innerHTML = [
      chip('المورد', esc(po.supplier)), chip('القسم', esc(po.department)), chip('تاريخ الأمر', esc(po.date)),
      chip('الشرط', `<b dir="ltr">${esc(po.incoterm || '—')}</b>`),
      chip('الدفع', `<b dir="ltr">${esc(po.payMethod || '—')}</b>`, po.payMethod === 'L/C' ? 'lc' : ''),
      chip('موانئ الشحن', `<b dir="ltr">${esc((po.ports || []).join(' · ') || '—')}</b>`)
    ].join('');
    $('nsPoChips').classList.remove('hide');

    // الموانئ: موانئ الأمر أولًا، وإذا ميناء واحد يتعبّى تلقائيًا
    const all = [...$('portsList').options].map(o => o.value);
    $('nsPortsList').innerHTML = [...new Set((po.ports || []).concat(all))].map(p => `<option value="${esc(p)}">`).join('');
    if ((po.ports || []).length && !(po.ports || []).includes($('ns_port').value.trim().toUpperCase())) $('ns_port').value = po.ports[0];

    // الاعتماد البنكي: يظهر لأوامر L/C أو إذا فيه اعتماد يغطي الأمر
    const lcs = po.lcs || [];
    $('nsLcWrap').classList.toggle('hide', !lcs.length && po.payMethod !== 'L/C');
    $('ns_lc').classList.toggle('hide', !lcs.length);
    $('ns_lc').previousElementSibling.classList.toggle('hide', !lcs.length);
    $('nsLcNone').classList.toggle('hide', !!lcs.length);
    $('nsOpenLcBtn').classList.toggle('hide', !can('lcs', 'edit'));
    $('ns_lc').innerHTML = '<option value="">بدون — أربطه لاحقًا</option>' +
      lcs.map(l => `<option value="${esc(l.id)}">${esc(l.lcNo)} — ${esc(l.bank)} — متاح ${money(l.available, l.currency)}</option>`).join('');
    if (lcs.length === 1) $('ns_lc').value = lcs[0].id;

    lines = po.lines.map(l => ({ ...l, qty: '', containers: '' }));
    $('nsLines').innerHTML = lines.map((l, n) => {
      const has = l.available > 0;
      return `
      <tr data-n="${n}" class="${has ? '' : 'zero'}">
        <td class="m-cell"><b dir="ltr">${esc(l.model)}</b><small>${esc(l.description || '')}</small></td>
        <td class="a-cell"><b>${num(l.available)}</b><small>من ${num(l.ordered)}${l.requested ? ' · طُلب ' + num(l.requested) : ''}</small></td>
        <td>${has ? `<div class="q-cell">
            <input id="nsq${n}" data-n="${n}" data-f="qty" type="number" min="0" max="${l.available}" step="any" inputmode="decimal" placeholder="الكمية" aria-label="الكمية المطلوبة ${esc(l.model)}">
            <button type="button" class="btn small" data-all="${n}" title="تعبئة كل المتاح">الكل</button></div>`
          : '<span class="tag gray">لا يوجد متاح</span>'}</td>
        <td>${has ? `<input id="nsc${n}" data-n="${n}" data-f="containers" type="number" min="0" step="1" inputmode="numeric" placeholder="حاويات" aria-label="الحاويات ${esc(l.model)}">
            ${l.perContainer ? `<small class="per">${num(l.perContainer)} / حاوية</small>` : ''}` : '—'}</td>
      </tr>`;
    }).join('');
    nsFilter();
    nsTotals();
  }

  function onLineInput(e) {
    const { n, f } = e.target.dataset;
    if (n === undefined) return;
    const i = Number(n);
    const l = lines[i];
    l[f] = e.target.value;
    if (f === 'qty') {
      l._qAuto = false;
      autoContainers(i);
    } else if (f === 'containers') {
      l._cManual = e.target.value !== '';
      // التعبئة بالحاويات: الكمية = الحاويات × الكمية في الحاوية (إذا الكمية فاضية أو محسوبة تلقائيًا)
      if (l.perContainer > 0 && (l.qty === '' || l._qAuto)) {
        const c = Number(l.containers) || 0;
        l.qty = c > 0 ? Math.min(c * l.perContainer, l.available) : '';
        l._qAuto = true;
        $('nsq' + i).value = l.qty;
      }
    }
    nsTotals();
  }

  /** الحاويات: بنسبة حاويات البند في أمر الشراء، أو من الكمية في الحاوية بقاعدة الموديلات */
  function autoContainers(n, force) {
    const l = lines[n];
    if (l._cManual && !force) return;
    if (force) l._cManual = false;
    const q = Number(l.qty) || 0;
    let c = '';
    if (q > 0 && l.perContainer > 0) c = Math.ceil(q / l.perContainer);
    else if (q > 0 && l.itemContainers > 0 && l.ordered > 0) c = Math.ceil(q * l.itemContainers / l.ordered);
    l.containers = c;
    const el = $('nsc' + n);
    if (el) el.value = c;
  }

  /** البحث وإخفاء الموديلات اللي ما فيها متاح (المعبّأة تظهر دائمًا) */
  function nsFilter() {
    const q = normModel($('nsSearch').value);
    const hideZero = $('nsHideZero').checked;
    let hidden = 0;
    $('nsLines').querySelectorAll('tr[data-n]').forEach(tr => {
      const l = lines[Number(tr.dataset.n)];
      const show = (Number(l.qty) > 0) || ((!q || normModel(l.model).includes(q) || normModel(l.description).includes(q)) && !(hideZero && l.available <= 0));
      tr.classList.toggle('hide', !show);
      if (!show) hidden++;
    });
    const zero = lines.filter(l => l.available <= 0).length;
    $('nsHidden').textContent = !lines.length ? '' :
      hidden ? `مخفي ${hidden} موديل${q ? ' (حسب البحث)' : ''}${hideZero && zero ? ` — منها ${zero} بدون كمية متاحة` : ''}.` : '';
    if (lines.length && hidden === lines.length) $('nsHidden').textContent = 'لا توجد موديلات مطابقة.';
  }

  /** لصق من Excel: الموديل ثم الكمية في كل سطر */
  function applyPaste() {
    const rows = $('nsPasteText').value.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    const byKey = {};
    lines.forEach((l, n) => { byKey[normModel(l.model)] = n; });
    let filled = 0;
    const missing = [], over = [];
    rows.forEach(r => {
      const m = r.match(/^(.+?)[\t;,\s]+([\d,]+(?:\.\d+)?)\s*$/);
      if (!m) return;
      const qty = Number(m[2].replace(/,/g, ''));
      const model = m[1].split(/\t|;/)[0].trim();
      if (!(qty > 0)) return;
      const n = byKey[normModel(model)];
      if (n === undefined) { missing.push(model); return; }
      const l = lines[n];
      if (!(l.available > 0)) { over.push(l.model + ' (لا يوجد متاح)'); return; }
      l.qty = (Number(l.qty) || 0) + qty;
      l._qAuto = false;
      if (l.qty > l.available) over.push(`${l.model} (${num(l.qty)} > ${num(l.available)})`);
      $('nsq' + n).value = l.qty;
      autoContainers(n, true);
      filled++;
    });
    nsFilter();
    nsTotals();
    $('nsPasteMsg').innerHTML = `تمت تعبئة ${filled} موديل` +
      (missing.length ? ` — <span class="neg">غير موجود في الأمر: ${esc(missing.join('، '))}</span>` : '') +
      (over.length ? ` — <span class="neg">راجع: ${esc(over.join('، '))}</span>` : '');
    if (filled && !missing.length && !over.length) { $('nsPasteText').value = ''; setTimeout(() => $('nsPaste').classList.add('hide'), 1200); }
  }

  function nsTotals() {
    let qty = 0, cnt = 0, val = 0, models = 0;
    const over = [];
    lines.forEach((l, n) => {
      const q = Number(l.qty) || 0;
      if (q > 0) { models++; qty += q; cnt += Number(l.containers) || 0; val += q * (Number(l.price) || 0); }
      const bad = q > l.available;
      if (bad) over.push(l.model);
      const el = $('nsq' + n);
      if (el) el.classList.toggle('over', bad);
    });
    const po = poOptions.find(o => o.id === $('ns_po').value);
    $('nsModels').textContent = num(models);
    $('nsQty').textContent = num(qty);
    $('nsCnt').textContent = num(cnt);
    $('nsVal').textContent = val ? money(val, po ? po.currency : '') : '—';
    $('nsError').textContent = over.length ? 'الكمية أكبر من المتاح: ' + over.join('، ') : '';
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
      lcId: $('ns_lc').value,
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
    const lcs = (s.lcChoices || []).slice();
    if (s.lcId && !lcs.some(l => l.id === s.lcId)) lcs.unshift({ id: s.lcId, lcNo: s.lcNo || 'اعتماد مقفل', bank: '' });
    $('sdLcWrap').classList.toggle('hide', !lcs.length && s.payMethod !== 'L/C');
    $('sd_lcId').innerHTML = '<option value="">' + (lcs.length ? 'بدون' : 'لا يوجد اعتماد مفتوح يغطي أمر الشراء') + '</option>' +
      lcs.map(l => `<option value="${esc(l.id)}">${esc(l.lcNo)}${l.bank ? ' — ' + esc(l.bank) : ''}</option>`).join('');
    $('sd_lcId').value = s.lcId || '';
    lcInfo();
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
    if (!$('sdLcWrap').classList.contains('hide')) s.lcId = $('sd_lcId').value;
    return s;
  }

  /** معلومات الاعتماد المختار: الرصيد وآخر موعد شحن والصلاحية */
  function lcInfo() {
    if (!current) return;
    const l = (current.lcChoices || []).find(x => x.id === $('sd_lcId').value);
    const need = current.payMethod === 'L/C';
    if (!l) {
      $('sdLcInfo').innerHTML = need ? '<span class="tag bad">أمر الشراء L/C: التعميد يحتاج اعتماد بنكي صالح</span>' : '';
      return;
    }
    const ship = $('sd_shipDate').value;
    const warn = [];
    if (l.expiry && l.expiry < today()) warn.push('الاعتماد منتهي');
    if (ship && l.latestShip && ship > l.latestShip) warn.push('تاريخ الشحن بعد آخر موعد في الاعتماد');
    $('sdLcInfo').innerHTML = `المتاح ${money(l.available, l.currency)} — آخر شحن ${esc(l.latestShip || '—')} — الصلاحية ${esc(l.expiry || '—')}` +
      warn.map(w => ` <span class="tag bad">${w}</span>`).join('');
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
