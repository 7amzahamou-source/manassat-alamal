/**
 * صفحة: الاعتمادات البنكية (L/C)
 * الاعتماد يغطي أمر شراء أو أكثر، والأمر ممكن يكون له أكثر من اعتماد.
 */
(function () {
  const FIELDS = ['lcNo', 'bank', 'supplier', 'currency', 'amount', 'tolerance', 'incoterm', 'payType', 'usanceDays', 'usanceFrom',
    'insurer', 'goodsType', 'origin',
    'issueDate', 'latestShipDate', 'expiryDate', 'presentationDays', 'partial', 'notes'];
  const PRES_STATES = ['مقدمة', 'بها ملاحظات', 'مقبولة', 'مرفوضة'];
  const SHIPPED = 'تم الشحن';

  let lcs = [];
  let poOptions = [];
  let current = null;       // الاعتماد المفتوح (أو null لاعتماد جديد)
  let pos = [], amds = [], pres = [], chgs = [];
  let editable = false;

  const n = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const r2 = v => Math.round(v * 100) / 100;
  const stateTag = s => {
    const cls = { 'مفتوح': 'ok', 'مستخدم بالكامل': 'gray', 'منتهي': 'bad', 'مقفل': 'gray' }[s] ?? '';
    return `<span class="tag ${cls}">${esc(s)}</span>`;
  };
  const presTag = p => {
    const d = dueOf(p);
    if (p.status === 'مقبولة' && d && d <= today()) return '<span class="tag ok">مسددة</span>';
    if (p.status === 'مقبولة' && d) return `<span class="tag wait">آجل · باقي ${daysBetween(today(), d)} يوم</span>`;
    const cls = { 'مقدمة': 'wait', 'بها ملاحظات': 'bad', 'مقبولة': '', 'مرفوضة': 'gray' }[p.status] ?? '';
    return `<span class="tag ${cls}">${esc(p.status)}</span>`;
  };
  /** تاريخ الاستحقاق: المسجّل، أو المحسوب (اطلاع = القبول، آجل = البداية حسب شرط الاعتماد + الأيام) */
  function dueOf(p) {
    if (p.dueDate) return p.dueDate;
    if (p.status !== 'مقبولة') return '';
    const acc = p.acceptedDate || p.presentedDate || '';
    if ($('lc_payType').value !== 'آجل') return acc;
    const sh = ((current && current.shipments) || []).find(x => x.id === p.shipmentId) || {};
    const from = $('lc_usanceFrom').value;
    const base = from === 'القبول' ? acc : from === 'التقديم' ? (p.presentedDate || '') : (sh.shipDate || p.presentedDate || '');
    return base ? addDays(base, n($('lc_usanceDays').value)) : '';
  }
  const daysTag = (d, days) => {
    if (!d) return '—';
    const cls = days < 0 ? 'bad' : days <= 15 ? 'wait' : '';
    return `${esc(d)}${days != null && days <= 15 ? ` <span class="tag ${cls}">${days < 0 ? 'انتهى' : days + ' يوم'}</span>` : ''}`;
  };

  registerPage({ key: 'lcs', title: 'الاعتمادات البنكية', icon: ICONS.lcs, levels: ['none', 'view', 'edit', 'full'], init, show });

  function init() {
    $('lcRefreshBtn').addEventListener('click', load);
    $('newLcBtn').addEventListener('click', () => openLc(null));
    ['lcSearch', 'lcFilterState'].forEach(id => $(id).addEventListener('input', render));
    $('lcBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openLc(lcs.find(l => l.id === row.dataset.id));
    });

    $('lc_payType').addEventListener('change', usanceToggle);
    $('lcAddPoBtn').addEventListener('click', () => { pos.push({ poId: '' }); drawPos(); });
    $('lcAddAmdBtn').addEventListener('click', () => { amds.push({ date: today() }); drawAmds(); });
    $('lcAddChgBtn').addEventListener('click', () => { chgs.push({ date: today(), currency: 'SAR' }); drawChgs(); });

    // تعديل الصفوف (كل الجداول بنفس الطريقة)
    const arrays = { pos: () => pos, amds: () => amds, pres: () => pres, chgs: () => chgs };
    $('lcForm').addEventListener('input', e => {
      $('lcError').textContent = '';
      const { arr, i, f } = e.target.dataset;
      if (arr) arrays[arr]()[i][f] = e.target.value;
      if (arr === 'pos' && f === 'poId') { pickPo(Number(i)); drawPos(); }
      if (arr === 'pres' && f === 'status') drawPres();
      summary();
    });
    $('lcForm').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const [arr, i] = del.dataset.del.split(':');
        arrays[arr]().splice(Number(i), 1);
        ({ pos: drawPos, amds: drawAmds, pres: drawPres, chgs: drawChgs })[arr]();
        summary();
      }
      const add = e.target.closest('[data-present]');
      if (add) present(add.dataset.present);
    });
    $('lcForm').addEventListener('submit', e => { e.preventDefault(); save(); });
    $('lcCloseBtn').addEventListener('click', closeLc);
    $('lcReopenBtn').addEventListener('click', reopenLc);
    $('lcDeleteBtn').addEventListener('click', deleteLc);
  }

  function show() {
    $('newLcBtn').classList.toggle('hide', !can('lcs', 'edit'));
    load();
  }

  async function load() {
    lcs = [];
    $('lcStats').innerHTML = '';
    $('lcBody').innerHTML = '<tr><td colspan="13" class="empty">جارٍ التحميل…</td></tr>';
    try {
      const r = await API.listLcs();
      lcs = r.lcs || [];
      poOptions = r.poOptions || [];
      render();
    } catch (err) {
      $('lcBody').innerHTML = `<tr><td colspan="13" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function render() {
    const q = $('lcSearch').value.trim().toLowerCase();
    const st = $('lcFilterState').value;
    const list = lcs.filter(l =>
      (!q || [l.lcNo, l.bank, l.supplier, l.incoterm, (l.pos || []).map(p => p.poNo).join(' ')].join(' ').toLowerCase().includes(q)) &&
      (!st || (st === 'active' ? l.state !== 'مقفل' : l.state === st)));

    const active = lcs.filter(l => l.state !== 'مقفل');
    const avail = {};
    active.filter(l => l.state !== 'منتهي').forEach(l => { avail[l.currency] = (avail[l.currency] || 0) + Math.max(0, l.available); });
    const allPres = active.flatMap(l => l.presentations || []);
    $('lcStats').innerHTML = [
      ['اعتمادات غير مقفلة', active.length],
      ['الرصيد المتاح', Object.keys(avail).map(c => money(avail[c], c)).join('<br>') || '—'],
      ['تنتهي خلال 30 يوم', active.filter(l => l.state !== 'منتهي' && l.daysToExpiry != null && l.daysToExpiry <= 30).length],
      ['مستندات عليها ملاحظات', allPres.filter(p => p.status === 'بها ملاحظات').length],
      ['على الآجل (لم يحلّ تاريخه)', money(active.reduce((t, l) => t + (l.notDue || 0), 0))]
    ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('');

    if (!list.length) {
      const msg = lcs.length ? 'لا توجد اعتمادات مطابقة.'
        : can('lcs', 'edit') ? 'لا توجد اعتمادات. اضغط «اعتماد جديد» واربطه بأمر شراء معتمد.' : 'لا توجد اعتمادات.';
      $('lcBody').innerHTML = `<tr><td colspan="13" class="empty">${msg}</td></tr>`;
      return;
    }
    $('lcBody').innerHTML = list.map(l => `
      <tr data-id="${esc(l.id)}">
        <td><b dir="ltr">${esc(l.lcNo)}</b></td>
        <td>${esc(l.bank)}</td>
        <td>${esc(l.supplier || '—')}</td>
        <td>${esc((l.pos || []).map(p => p.poNo).join('، '))}</td>
        <td><b dir="ltr">${esc(l.incoterm || '—')}</b></td>
        <td>${esc(l.payType)}${l.payType === 'آجل' ? ' ' + num(l.usanceDays) + ' يوم' : ''}</td>
        <td class="num">${money(l.effAmount, l.currency)}</td>
        <td class="num">${money(l.used)}${l.notDue ? `<small class="sub" style="display:block">مسدد ${money(l.paid)} · آجل ${money(l.notDue)}</small>` : ''}</td>
        <td class="num"><b>${money(l.available)}</b></td>
        <td>${l.state === 'مقفل' ? esc(l.effLatestShip) : daysTag(l.effLatestShip, l.available > 0 ? l.daysToLatestShip : null)}</td>
        <td>${l.state === 'مقفل' ? esc(l.effExpiry) : daysTag(l.effExpiry, l.daysToExpiry)}</td>
        <td>${esc(l.nextDue || '—')}</td>
        <td>${stateTag(l.state)}</td>
      </tr>`).join('');
  }

  /* ===== النافذة ===== */

  function openLc(l) {
    current = l;
    const closed = l && l.state === 'مقفل';
    editable = can('lcs', 'edit') && !closed;
    const o = l || { currency: 'USD', payType: 'اطلاع', partial: 'مسموح', presentationDays: 21, issueDate: today() };

    $('lcTitle').textContent = l ? 'الاعتماد ' + l.lcNo : 'اعتماد بنكي جديد';
    $('lcState').innerHTML = l ? stateTag(l.state) : '';
    FIELDS.forEach(f => { $('lc_' + f).value = o[f] ?? ''; });
    if (!o.tolerance) $('lc_tolerance').value = '';
    usanceToggle();

    pos = (o.pos || []).map(p => ({ poId: p.poId, poNo: p.poNo }));
    if (!pos.length) pos.push({ poId: '' });
    amds = (o.amendments || []).map(a => ({ ...a }));
    pres = (o.presentations || []).map(p => ({ ...p }));
    chgs = (o.charges || []).map(c => ({ ...c }));
    drawPos(); drawAmds(); drawShips(); drawPres(); drawChgs(); summary();

    document.querySelectorAll('#lcForm .grid input, #lcForm .grid select').forEach(el => { el.disabled = !editable; });
    ['lcAddPoBtn', 'lcAddAmdBtn', 'lcAddChgBtn', 'lcSaveBtn'].forEach(id => $(id).classList.toggle('hide', !editable));
    $('lcCloseBtn').classList.toggle('hide', !(l && !closed && can('lcs', 'full')));
    $('lcHint').classList.toggle('hide', !(l && !closed && can('lcs', 'full')));
    $('lcReopenBtn').classList.toggle('hide', !(closed && can('lcs', 'full')));
    $('lcDeleteBtn').classList.toggle('hide', !(l && can('lcs', 'full') && !(l.shipments || []).length && !(l.presentations || []).length));

    $('lcMeta').textContent = l ? `أنشأه ${l.createdBy} في ${l.createdAt} — آخر تعديل: ${l.updatedBy} في ${l.updatedAt}` +
      (l.closedBy ? ` — أقفله ${l.closedBy} في ${l.closedAt}` : '') : '';
    $('lcError').textContent = '';
    $('lcDialog').showModal();
  }

  function usanceToggle() {
    $('lcUsanceWrap').classList.toggle('hide', $('lc_payType').value !== 'آجل');
    $('lcUsanceFromWrap').classList.toggle('hide', $('lc_payType').value !== 'آجل');
    if (!$('lc_usanceFrom').value) $('lc_usanceFrom').value = 'الشحن';
  }

  const dis = () => editable ? '' : 'disabled';
  const delBtn = (arr, i) => editable ? `<button type="button" class="btn small danger" data-del="${arr}:${i}" aria-label="حذف">✕</button>` : '';
  const inp = (arr, i, f, v, type = 'text', extra = '') =>
    `<input data-arr="${arr}" data-i="${i}" data-f="${f}" type="${type}" value="${esc(v ?? '')}" ${type === 'number' ? 'step="any"' : ''} ${extra} ${dis()}>`;

  /** اعتمادات أخرى على نفس الأمر (غير هذا الاعتماد) */
  const otherLcs = po => (po.otherLcs || []).filter(no => !current || no !== current.lcNo);

  function pickPo(i) {
    const po = poOptions.find(o => o.id === pos[i].poId);
    if (!po) return;
    if (!$('lc_supplier').value) $('lc_supplier').value = po.supplier;
    if (pos.filter(p => p.poId).length === 1) $('lc_currency').value = po.currency;
    // شرط التسليم ينسحب من أمر الشراء تلقائيًا (يتعدّل يدويًا لو لزم)
    if (po.incoterm) $('lc_incoterm').value = po.incoterm;
  }

  function drawPos() {
    const used = pos.map(p => p.poId);
    $('lcPos').innerHTML = pos.map((p, i) => {
      const po = poOptions.find(o => o.id === p.poId);
      const choices = poOptions.filter(o => o.id === p.poId || !used.includes(o.id));
      const select = editable
        ? `<select data-arr="pos" data-i="${i}" data-f="poId"><option value="">اختر أمر الشراء</option>${choices.map(o =>
            `<option value="${esc(o.id)}" ${o.id === p.poId ? 'selected' : ''}>${esc(o.poNo)}${o.payMethod === 'L/C' ? ' — L/C' : ''} (${esc(o.currency)}${o.incoterm ? ' · ' + esc(o.incoterm) : ''})</option>`).join('')}</select>`
        : `<b>${esc(p.poNo || (po || {}).poNo || '')}</b>`;
      return `<tr>
        <td>${select}</td>
        <td>${esc(po ? po.supplier : '—')}</td>
        <td class="num">${po ? num(po.totalQty) : '—'}</td>
        <td>${po && otherLcs(po).length ? otherLcs(po).map(no => `<span class="tag gray" dir="ltr">${esc(no)}</span>`).join(' ') : '—'}</td>
        <td>${delBtn('pos', i)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">لا توجد أوامر.</td></tr>';
  }

  function drawAmds() {
    $('lcAmds').innerHTML = amds.map((a, i) => `<tr>
        <td>${i + 1}</td>
        <td>${inp('amds', i, 'date', a.date, 'date')}</td>
        <td>${inp('amds', i, 'desc', a.desc, 'text', 'placeholder="مثال: تمديد الصلاحية"')}</td>
        <td>${inp('amds', i, 'amountDelta', a.amountDelta || '', 'number', 'placeholder="+ أو -"')}</td>
        <td>${inp('amds', i, 'newExpiry', a.newExpiry, 'date')}</td>
        <td>${inp('amds', i, 'newLatestShip', a.newLatestShip, 'date')}</td>
        <td>${delBtn('amds', i)}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">لا توجد تعديلات.</td></tr>';
  }

  function drawShips() {
    const list = current ? current.shipments || [] : [];
    $('lcShips').innerHTML = list.map(s => {
      const active = pres.some(p => p.shipmentId === s.id && p.status !== 'مرفوضة');
      const btn = editable && s.status === SHIPPED && !active
        ? `<button type="button" class="btn small" data-present="${esc(s.id)}">تقديم المستندات</button>` : '';
      return `<tr>
        <td>${s.status === SHIPPED ? `<b class="serial">${esc(s.serial)}</b>` : `<span dir="ltr">${esc(s.requestCode)}</span>`}</td>
        <td dir="ltr" style="text-align:right">${esc(s.invoiceNo)}</td>
        <td>${esc(s.poNo)}</td>
        <td>${esc(s.shipDate || '—')}</td>
        <td class="num">${s.value ? money(s.value) : '<span class="tag bad">بدون قيمة فاتورة</span>'}</td>
        <td>${s.status === SHIPPED ? (active ? '<span class="tag ok">مقدمة للبنك</span>' : '<span class="tag wait">مشحونة — لم تُقدَّم</span>') : '<span class="tag gray">لم تُعمَّد</span>'}</td>
        <td>${btn}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="empty">${current ? 'لا توجد شحنات مربوطة بعد.' : 'احفظ الاعتماد أولًا ثم اربط الشحنات من نافذة «بيانات الشحن».'}</td></tr>`;
  }

  function present(shipmentId) {
    const s = (current.shipments || []).find(x => x.id === shipmentId);
    pres.push({ shipmentId: s.id, serial: s.serial, invoiceNo: s.invoiceNo, presentedDate: today(), amount: s.value, status: 'مقدمة' });
    drawPres();
    drawShips();
    summary();
  }

  function drawPres() {
    $('lcPres').innerHTML = pres.map((p, i) => `<tr>
        <td><b class="serial">${esc(p.serial || '—')}</b><br><small dir="ltr">${esc(p.invoiceNo || '')}</small></td>
        <td>${inp('pres', i, 'presentedDate', p.presentedDate, 'date')}</td>
        <td>${inp('pres', i, 'amount', p.amount, 'number', 'min="0"')}</td>
        <td>${inp('pres', i, 'discrepancies', p.discrepancies, 'text', 'placeholder="لا يوجد"')}</td>
        <td>${editable ? `<select data-arr="pres" data-i="${i}" data-f="status">${PRES_STATES.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : presTag(p)}</td>
        <td>${inp('pres', i, 'acceptedDate', p.acceptedDate, 'date')}</td>
        <td>${inp('pres', i, 'dueDate', p.dueDate, 'date', 'title="يُحسب تلقائيًا عند القبول إذا تُرك فارغًا"')}</td>
        <td>${presTag(p)}</td>
        <td>${delBtn('pres', i)}</td>
      </tr>`).join('') || '<tr><td colspan="10" class="empty">لم تُقدَّم مستندات بعد.</td></tr>';
  }

  function drawChgs() {
    $('lcChgs').innerHTML = chgs.map((c, i) => `<tr>
        <td>${inp('chgs', i, 'date', c.date, 'date')}</td>
        <td>${inp('chgs', i, 'desc', c.desc, 'text', 'placeholder="عمولة فتح / تعديل / سويفت…"')}</td>
        <td>${inp('chgs', i, 'amount', c.amount, 'number', 'min="0"')}</td>
        <td>${editable ? `<select data-arr="chgs" data-i="${i}" data-f="currency">${['SAR', 'USD', 'EUR', 'CNY'].map(x => `<option ${x === c.currency ? 'selected' : ''}>${x}</option>`).join('')}</select>` : esc(c.currency)}</td>
        <td>${delBtn('chgs', i)}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد مصاريف.</td></tr>';
  }

  /** الملخص: المبلغ بعد التعديلات، المخصص، المستخدم، المتاح */
  function summary() {
    // تنبيه إذا شرط التسليم يختلف عن أوامر الشراء المربوطة
    const inc = $('lc_incoterm').value;
    const diff = pos.map(p => poOptions.find(o => o.id === p.poId)).filter(o => o && o.incoterm && inc && o.incoterm !== inc);
    $('lcIncWarn').innerHTML = diff.length ? `<span class="tag wait">يختلف عن أمر الشراء: ${diff.map(o => esc(o.poNo) + ' (' + esc(o.incoterm) + ')').join('، ')}</span>` : '';
    const cur = $('lc_currency').value;
    const t0 = today();
    const amount = n($('lc_amount').value) + amds.reduce((t, a) => t + n(a.amountDelta), 0);
    const limit = amount * (1 + n($('lc_tolerance').value) / 100);
    const usance = $('lc_payType').value === 'آجل' ? n($('lc_usanceDays').value) : 0;

    // السداد بالتاريخ: المقبولة اللي حلّ تاريخ استحقاقها = مسددة، واللي لسه = على الآجل
    const b = { paid: 0, notDue: 0, pending: 0, committed: 0 };
    const presented = {};
    const schedule = [];
    pres.filter(p => p.status !== 'مرفوضة').forEach(p => {
      const amt = n(p.amount);
      if (p.shipmentId) presented[p.shipmentId] = 1;
      if (p.status !== 'مقبولة') { b.pending += amt; schedule.push({ ...p, rest: amt, bucket: 'بانتظار قبول البنك' }); return; }
      const due = dueOf(p);
      if (due && due > t0) { b.notDue += amt; schedule.push({ ...p, dueDate: due, rest: amt, bucket: 'غير مستحقة', days: daysBetween(t0, due) }); }
      else b.paid += amt;
    });
    (current ? current.shipments || [] : []).filter(s => s.status === SHIPPED && !presented[s.id]).forEach(s => { b.committed += n(s.value); });
    const used = b.paid + b.notDue + b.pending + b.committed;
    let expiry = $('lc_expiryDate').value, latest = $('lc_latestShipDate').value;
    amds.forEach(a => { if (a.newExpiry) expiry = a.newExpiry; if (a.newLatestShip) latest = a.newLatestShip; });

    const fromTxt = { 'الشحن': 'تاريخ الشحن', 'القبول': 'قبول المستندات', 'التقديم': 'تقديم المستندات' }[$('lc_usanceFrom').value] || 'تاريخ الشحن';
    const tile = (label, v, cls, note) => `<div class="lc-tile ${cls || ''}"><small>${label}</small><b>${money(v)}</b>${note ? `<span>${note}</span>` : ''}</div>`;
    $('lcSummary').innerHTML = `
      <div class="lc-row">
        ${tile('مبلغ الاعتماد بعد التعديلات', amount, '', `${esc(cur)}${n($('lc_tolerance').value) ? ' · سماحية ±' + n($('lc_tolerance').value) + '%' : ''}`)}
        ${tile('المسدد (حلّ تاريخ استحقاقه)', b.paid, 'ok')}
        ${tile('على الآجل (لم يحلّ تاريخه)', b.notDue, 'wait', usance ? `آجل ${usance} يوم من ${fromTxt}` : '')}
        ${tile('بانتظار قبول البنك', b.pending, b.pending ? 'wait' : '')}
      </div>
      <div class="lc-row">
        ${tile('شحنات معمّدة لم تُقدَّم مستنداتها', b.committed, '', 'محجوزة من الرصيد')}
        ${tile('الرصيد قبل خصم الآجل', limit - b.paid, 'acc', 'المبلغ − المسدد')}
        ${tile('الرصيد بعد الخصم (المتاح للشحن)', limit - used, 'grand' + (limit - used < -0.005 ? ' bad' : ''), `آخر شحن ${esc(latest || '—')} · الصلاحية ${esc(expiry || '—')}`)}
      </div>`;

    schedule.sort((a, c) => String(a.dueDate || '9').localeCompare(String(c.dueDate || '9')));
    const tag = r => r.bucket === 'غير مستحقة' ? `<span class="tag wait">باقي ${r.days} يوم</span>` : '<span class="tag gray">بانتظار قبول البنك</span>';
    $('lcSchedule').innerHTML = schedule.length ? `
      <div class="table-wrap" style="margin-top:12px"><table class="items">
        <thead><tr><th>الفاتورة</th><th>التسلسل</th><th>تاريخ الاستحقاق (السداد)</th><th>المبلغ</th><th>الحالة</th></tr></thead>
        <tbody>${schedule.map(r => `<tr><td dir="ltr" style="text-align:right">${esc(r.invoiceNo || '—')}</td><td>${esc(r.serial || '—')}</td><td>${esc(r.dueDate || '—')}</td><td class="num"><b>${money(r.rest, cur)}</b></td><td>${tag(r)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">إجمالي اللي لم يحلّ تاريخه</td><td class="num"><b>${money(b.notDue + b.pending, cur)}</b></td><td></td></tr></tfoot>
      </table></div>` : '<p class="sub small">كل المستندات المقبولة حلّ تاريخ استحقاقها (مسددة).</p>';
  }

  function readForm() {
    const lc = { id: current ? current.id : '' };
    FIELDS.forEach(f => { lc[f] = $('lc_' + f).value; });
    lc.pos = pos.filter(p => p.poId).map(p => ({ poId: p.poId }));
    lc.amendments = amds;
    lc.presentations = pres;
    lc.charges = chgs;
    return lc;
  }

  async function run(btn, text, fn) {
    $('lcError').textContent = '';
    const done = busy(btn, text);
    try {
      const r = await fn();
      $('lcDialog').close();
      toast(r.message);
      load();
    } catch (err) {
      $('lcError').textContent = err.message;
    } finally {
      done();
    }
  }

  const save = () => run($('lcSaveBtn'), 'جارٍ الحفظ…', () => API.saveLc(readForm()));

  function closeLc() {
    if (!confirm('إقفال الاعتماد ' + current.lcNo + '؟\nما يمكن ربط شحنات جديدة عليه بعد الإقفال.')) return;
    run($('lcCloseBtn'), 'جارٍ الإقفال…', () => API.closeLc(current.id));
  }

  function reopenLc() {
    run($('lcReopenBtn'), 'جارٍ الفتح…', () => API.reopenLc(current.id));
  }

  function deleteLc() {
    if (!confirm('حذف الاعتماد ' + current.lcNo + ' نهائيًا؟')) return;
    run($('lcDeleteBtn'), 'جارٍ الحذف…', () => API.deleteLc(current.id));
  }
})();
