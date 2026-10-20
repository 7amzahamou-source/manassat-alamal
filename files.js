/**
 * صفحة: ملفات الشحنات والتخليص
 */
(function () {
  const DOCS = [
    ['invoice', 'الفاتورة التجارية'], ['packing', 'قائمة التعبئة'], ['origin', 'شهادة المنشأ'],
    ['saber', 'شهادة المطابقة (سابر)'], ['insurance', 'شهادة التأمين'], ['hbl', 'HBL'], ['mbl', 'MBL'],
    ['telex', 'TELEX RELEASE'], ['bank', 'مستندات البنك'], ['freightInvoice', 'فاتورة الشحن']
  ];
  const COSTS = [
    ['freight', 'الشحن البحري'], ['duty', 'الرسوم الجمركية'], ['port', 'رسوم الميناء'], ['clearance', 'أتعاب التخليص'],
    ['transport', 'النقل الداخلي'], ['storage', 'أرضيات / تأخير'], ['saber', 'سابر / فحص'], ['other', 'مصاريف أخرى']
  ];
  const FIELDS = ['billOfLading', 'shippingLine', 'vessel', 'actualArrival',
    'exchangeRate', 'vat', 'claimAmount', 'claimStatus', 'claimNotes', 'notes'];
  const RATES = { SAR: 1, USD: 3.75, EUR: 4.1, CNY: 0.52, AED: 1.02 };   // قيم مقترحة فقط، تُعدّل في الملف

  let files = [];
  let current = null;

  const n = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const sar = v => money(v) + ' ر.س';
  const stateTag = s => {
    const cls = { 'في البحر': 'gray', 'وصلت - بانتظار البيان': 'wait', 'تحت التخليص': 'wait', 'مفسوحة جزئيًا': 'wait', 'مفسوحة': '', 'مقفل': 'ok' }[s] ?? '';
    return `<span class="tag ${cls}">${esc(s)}</span>`;
  };
  const docsCount = f => DOCS.filter(([k]) => (f.docs || {})[k]).length;

  /** حساب التكلفة الواصلة من ملف (أو من قيم النافذة) */
  function calc(f) {
    const rate = n(f.exchangeRate) || RATES[f.currency] || 0;
    const goods = n(f.goodsValue) * rate;
    const expenses = COSTS.reduce((t, [k]) => t + n((f.costs || {})[k]), 0);
    return { rate, goods, expenses, landed: goods + expenses, load: goods ? expenses / goods : 0 };
  }

  registerPage({ key: 'files', title: 'ملفات الشحنات', icon: ICONS.files, levels: ['none', 'view', 'edit', 'full'], init, show });

  function init() {
    $('flRefreshBtn').addEventListener('click', load);
    ['flSearch', 'flFilterState'].forEach(id => $(id).addEventListener('input', render));
    $('flBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-serial]');
      if (row) openFile(files.find(f => f.serial === row.dataset.serial));
    });

    $('fdDocs').innerHTML = DOCS.map(([k, label]) => `<label><input type="checkbox" data-doc="${k}"> ${label}</label>`).join('');
    $('fdCosts').innerHTML = COSTS.map(([k, label]) =>
      `<div><label for="fc_${k}">${label}</label><input id="fc_${k}" data-cost="${k}" type="number" min="0" step="0.01"></div>`).join('');

    $('fileForm').addEventListener('input', () => { $('fdError').textContent = ''; liveCalc(); });
    $('fileForm').addEventListener('submit', e => { e.preventDefault(); save(); });
    $('fdVatBtn').addEventListener('click', () => {
      const c = calc({ ...current, ...readForm() });
      // أساس ضريبة الاستيراد: القيمة + الشحن + الرسوم الجمركية
      $('fd_vat').value = Math.round((c.goods + n($('fc_freight').value) + n($('fc_duty').value)) * 0.15 * 100) / 100;
    });
    $('fdCloseBtn').addEventListener('click', closeFile);
    $('fdReopenBtn').addEventListener('click', reopen);
    $('fdPrintBtn').addEventListener('click', () => window.print());
  }

  function show() {
    load();
  }

  async function load() {
    files = [];
    $('flStats').innerHTML = '';
    $('flBody').innerHTML = '<tr><td colspan="12" class="empty">جارٍ التحميل…</td></tr>';
    try {
      files = (await API.listFiles()).files || [];
      render();
    } catch (err) {
      $('flBody').innerHTML = `<tr><td colspan="12" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function render() {
    const q = $('flSearch').value.trim().toLowerCase();
    const st = $('flFilterState').value;
    const list = files.filter(f =>
      (!q || [f.serial, f.invoiceNo, f.poNos.join(' '), f.billOfLading, f.declarations.map(d => d.no).join(' '), f.shippingLine].join(' ').toLowerCase().includes(q)) &&
      (!st || (st === 'open' ? f.state !== 'مقفل' : f.state === st)));

    const count = s => files.filter(f => f.state === s).length;
    $('flStats').innerHTML = [
      ['في البحر', count('في البحر')],
      ['وصلت - بانتظار البيان', count('وصلت - بانتظار البيان')],
      ['تحت التخليص', count('تحت التخليص') + count('مفسوحة جزئيًا')],
      ['مفسوحة (لم تُقفل)', count('مفسوحة')],
      ['مقفلة', count('مقفل')]
    ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');

    if (!list.length) {
      $('flBody').innerHTML = `<tr><td colspan="12" class="empty">${files.length ? 'لا توجد ملفات مطابقة.' : 'لا توجد ملفات بعد. يُفتح ملف لكل تسلسل تلقائيًا بعد تعميد الشحن.'}</td></tr>`;
      return;
    }
    $('flBody').innerHTML = list.map(f => {
      const c = calc(f);
      const arrival = f.actualArrival ? f.actualArrival : (f.eta ? '<span class="muted">متوقع ' + esc(f.eta) + '</span>' : '—');
      return `
      <tr data-serial="${esc(f.serial)}">
        <td><b class="serial">${esc(f.serial)}</b></td>
        <td dir="ltr" style="text-align:right">${esc(f.invoiceNo)}</td>
        <td>${esc(f.poNos.join('، '))}</td>
        <td dir="ltr" style="text-align:right">${esc(f.billOfLading || '—')}</td>
        <td>${esc(f.shippingLine || '—')}</td>
        <td>${arrival}</td>
        <td class="num">${num(f.containers)} <span class="muted">(${num(f.receivedContainers)})</span></td>
        <td><span class="tag ${docsCount(f) === DOCS.length ? 'ok' : 'gray'}">${docsCount(f)}/${DOCS.length}</span></td>
        <td>${f.declarations.length ? `${f.declarations.length} بيان` : '—'}${f.noDeclContainers && f.declarations.length ? ` <span class="tag wait">${f.noDeclContainers} حاوية بدون</span>` : ''}</td>
        <td>${f.declarations.length ? `<span class="tag ${f.declarations.every(d => d.release) ? 'ok' : 'gray'}">${f.declarations.filter(d => d.release).length}/${f.declarations.length}</span>` : '—'}</td>
        <td class="num">${c.expenses ? sar(c.landed) : '—'}</td>
        <td>${stateTag(f.state)}</td>
      </tr>`;
    }).join('');
  }

  /* ===== نافذة الملف ===== */

  function openFile(f) {
    current = f;
    const closed = f.status === 'مقفل';
    const editable = can('files', 'edit') && !closed;

    $('fdTitle').textContent = `ملف الشحنة ${f.serial} — فاتورة ${f.invoiceNo}`;
    $('fdState').innerHTML = stateTag(f.state);
    $('fdInfo').innerHTML = [
      ['أمر الشراء', f.poNos.join('، ')], ['المورد', f.suppliers.join('، ')], ['الشحن', `${f.port} ← ${f.arrivalPort || '—'}`],
      ['تاريخ الشحن', f.shipDate || '—'], ['الوصول المتوقع', f.eta || '—'], ['الوسيط', f.forwarder || '—'],
      ['الحاويات (مستلمة)', `${num(f.containers)} (${num(f.receivedContainers)})`], ['أول تفريغ', f.firstDischarge || '—']
    ].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('');

    FIELDS.forEach(k => { $('fd_' + k).value = f[k] ?? ''; });
    if (!f.exchangeRate && RATES[f.currency]) $('fd_exchangeRate').value = RATES[f.currency];
    $('fdBroker').textContent = f.broker || '—';
    $('fdNoDecl').classList.toggle('hide', !f.noDeclContainers);
    $('fdNoDecl').textContent = f.noDeclContainers
      ? `⚠️ ${f.noDeclContainers} من ${f.containers} حاوية بدون رقم بيان — سجّلها من «متابعة الحاويات» (فيه تعديل جماعي).` : '';
    $('fdDecls').innerHTML = f.declarations.length ? f.declarations.map((d, i) => `
      <tr>
        <td><b dir="ltr">${esc(d.no)}</b></td>
        <td class="num">${num(d.containers)}</td>
        <td><input type="date" data-decl="${i}" data-k="date" value="${esc(d.date)}"></td>
        <td><input type="date" data-decl="${i}" data-k="release" value="${esc(d.release)}"></td>
        <td id="declTag${i}"></td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">ما فيه بيانات بعد. سجّل رقم البيان على الحاويات من «متابعة الحاويات».</td></tr>';
    $('fdGoodsOrig').value = money(f.goodsValue, f.currency);
    document.querySelectorAll('#fdDocs [data-doc]').forEach(el => { el.checked = !!(f.docs || {})[el.dataset.doc]; });
    document.querySelectorAll('#fdCosts [data-cost]').forEach(el => { el.value = (f.costs || {})[el.dataset.cost] ?? ''; });

    // الشحن البحري: يُقترح من بيانات الشحنة إذا ما انكتب
    if ((f.costs || {}).freight === undefined || (f.costs || {}).freight === '') {
      const r = RATES[f.freightCurrency];
      if (f.freightOrig && r) $('fc_freight').value = Math.round(f.freightOrig * r * 100) / 100;
    }

    document.querySelectorAll('#fileForm input, #fileForm select').forEach(el => {
      if (!['fdGoodsOrig', 'fdGoodsSar'].includes(el.id)) el.disabled = !editable;
    });
    $('fdVatBtn').classList.toggle('hide', !editable);
    $('fdSaveBtn').classList.toggle('hide', !editable);
    $('fdCloseBtn').classList.toggle('hide', closed || !can('files', 'full'));
    $('fdHint').classList.toggle('hide', closed || !can('files', 'full'));
    $('fdReopenBtn').classList.toggle('hide', !closed || !can('files', 'full'));

    $('fdMeta').textContent = (closed ? `أقفله ${f.closedBy} في ${f.closedAt} — ` : '') +
      (f.updatedBy ? `آخر تعديل: ${f.updatedBy} في ${f.updatedAt}` : 'لم يُعدّل بعد');
    $('fdError').textContent = '';
    liveCalc();
    $('fileDialog').showModal();
  }

  function readForm() {
    const f = { serial: current.serial, docs: {}, costs: {} };
    FIELDS.forEach(k => { f[k] = $('fd_' + k).value; });
    document.querySelectorAll('#fdDocs [data-doc]').forEach(el => { f.docs[el.dataset.doc] = el.checked; });
    document.querySelectorAll('#fdCosts [data-cost]').forEach(el => { f.costs[el.dataset.cost] = el.value; });
    f.declarations = current.declarations.map((d, i) => ({
      no: d.no,
      date: ($(`fdDecls`).querySelector(`[data-decl="${i}"][data-k="date"]`) || {}).value || '',
      release: ($(`fdDecls`).querySelector(`[data-decl="${i}"][data-k="release"]`) || {}).value || ''
    }));
    return f;
  }

  function liveCalc() {
    const form = readForm();
    const c = calc({ ...current, ...form });
    $('fdGoodsSar').value = sar(c.goods);
    $('fdTotGoods').textContent = sar(c.goods);
    $('fdTotExp').textContent = sar(c.expenses);
    $('fdLoad').textContent = c.goods ? (c.load * 100).toFixed(1) + '%' : '—';
    $('fdLanded').textContent = sar(c.landed);
    $('fdDocsCount').textContent = `${Object.values(form.docs).filter(Boolean).length}/${DOCS.length}`;
    form.declarations.forEach((d, i) => {
      const cell = $('declTag' + i);
      if (cell) cell.innerHTML = d.release ? '<span class="tag ok">مفسوح</span>' : d.date ? '<span class="tag wait">تحت التخليص</span>' : '<span class="tag gray">بانتظار التاريخ</span>';
    });

    // توزيع المصاريف على الموديلات حسب القيمة (أو الكمية إذا ما فيه أسعار)
    const totalVal = current.lines.reduce((t, l) => t + l.value, 0);
    const totalQty = current.lines.reduce((t, l) => t + l.qty, 0);
    $('fdUnits').innerHTML = current.lines.map(l => {
      const share = totalVal ? l.value / totalVal : (totalQty ? l.qty / totalQty : 0);
      const goods = l.value * c.rate;
      const exp = c.expenses * share;
      return `<tr>
        <td><b dir="ltr">${esc(l.model)}</b></td><td>${esc(l.poNo)}</td><td class="num">${num(l.qty)}</td>
        <td class="num">${l.price ? money(l.price, current.currency) : '—'}</td>
        <td class="num">${money(goods)}</td><td class="num">${money(exp)}</td>
        <td class="num"><b>${l.qty ? money((goods + exp) / l.qty) : '—'}</b></td>
      </tr>`;
    }).join('');
  }

  function putLocal(f) {
    files = files.map(x => x.serial === f.serial ? f : x);
    render();
  }

  async function run(btn, text, fn) {
    $('fdError').textContent = '';
    const done = busy(btn, text);
    try {
      const r = await fn();
      putLocal(r.file);
      $('fileDialog').close();
      toast(r.message);
    } catch (err) {
      $('fdError').textContent = err.message;
    } finally {
      done();
    }
  }

  const save = () => run($('fdSaveBtn'), 'جارٍ الحفظ…', () => API.saveFile(readForm()));

  function closeFile() {
    if (!confirm('إقفال ملف الشحنة ' + current.serial + '؟\nبعد الإقفال ما يتعدّل إلا بإعادة فتحه.')) return;
    run($('fdCloseBtn'), 'جارٍ الإقفال…', () => API.closeFile(readForm()));
  }

  function reopen() {
    if (!confirm('إعادة فتح ملف الشحنة ' + current.serial + '؟')) return;
    run($('fdReopenBtn'), 'جارٍ الفتح…', () => API.reopenFile(current.serial));
  }
})();
