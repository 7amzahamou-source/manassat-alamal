/**
 * صفحة: تقرير الإدارة العليا (للعرض والطباعة)
 */
(function () {
  registerPage({ key: 'report', title: 'تقرير الإدارة العليا', icon: ICONS.report, levels: ['none', 'view'], init, show });

  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function init() {
    $('rpRefreshBtn').addEventListener('click', load);
    $('rpPrintBtn').addEventListener('click', () => window.print());
    $('rpToc').addEventListener('click', e => {
      const a = e.target.closest('a[data-to]');
      if (!a) return;
      e.preventDefault();
      $(a.dataset.to).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function show() {
    load();
  }

  async function load() {
    $('rpSummary').innerHTML = '';
    $('rpToc').innerHTML = '';
    $('rpBody').innerHTML = '<p class="sub">جارٍ إعداد التقرير…</p>';
    try {
      render(await API.report());
    } catch (err) {
      $('rpBody').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  /* ===== أدوات بناء الجداول ===== */

  const td = (v, cls) => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
  const ltr = v => `<span dir="ltr">${esc(v || '—')}</span>`;
  const freeTag = r => r.freeLeft == null ? '—'
    : `<span class="tag ${r.freeLeft < 0 ? 'bad' : r.freeLeft <= 3 ? 'wait' : 'gray'}">${r.freeLeft < 0 ? `متأخر ${-r.freeLeft} يوم` : r.freeLeft === 0 ? 'آخر يوم' : `باقي ${r.freeLeft} يوم`}</span>`;

  /** قسم = عنوان + جدول + سطر إجمالي */
  function section(id, title, note, heads, rows, rowFn, totals) {
    const body = rows.length
      ? `<div class="table-wrap"><table class="compact">
          <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(rowFn).join('')}</tbody>
          ${totals ? `<tfoot><tr>${totals(rows)}</tr></tfoot>` : ''}
        </table></div>`
      : '<p class="rp-empty">لا يوجد.</p>';
    return `<section id="${id}" class="card rp-sec">
      <div class="db-head"><b>${title} <span class="tag gray">${rows.length}</span></b><span class="sub small">${note}</span></div>
      ${body}</section>`;
  }

  /** جدول البضائع (بند لكل موديل) */
  function goods(id, title, note, rows, extra) {
    const heads = ['أمر الشراء', 'المورد', 'الموديل', 'الكمية', 'الحاويات'].concat(extra.map(e => e[0]));
    return section(id, title, note, heads, rows,
      r => `<tr>${td(esc(r.poNo))}${td(esc(r.supplier))}${td(ltr(r.model))}${td(num(r.qty), 'num')}${td(num(r.containers) || '—', 'num')}${extra.map(e => td(e[1](r))).join('')}</tr>`,
      list => `${td('الإجمالي')}${td('')}${td('')}${td(num(list.reduce((t, r) => t + r.qty, 0)), 'num')}${td(num(list.reduce((t, r) => t + r.containers, 0)), 'num')}${extra.map(() => td('')).join('')}`);
  }

  /** جدول حاويات */
  function boxes(id, title, note, rows, extra) {
    const heads = ['الحاوية', 'التسلسل', 'أمر الشراء', 'الموديل', 'الكمية'].concat(extra.map(e => e[0]));
    return section(id, title, note, heads, rows,
      r => `<tr>${td(`<b>${ltr(r.containerNo)}</b>`)}${td(esc(r.serial))}${td(esc(r.poNo))}${td(ltr(r.model))}${td(num(r.qty), 'num')}${extra.map(e => td(e[1](r))).join('')}</tr>`,
      list => `${td('الإجمالي')}${td('')}${td('')}${td('')}${td(num(list.reduce((t, r) => t + r.qty, 0)), 'num')}${extra.map(() => td('')).join('')}`);
  }

  function render(d) {
    const dt = new Date(d.today + 'T00:00:00');
    $('rpDate').textContent = `${DAYS[dt.getDay()]} ${d.today} — وضع البضائع والحاويات حتى تاريخه`;

    const s = d.summary, c = d.containers;
    const cq = list => num(list.reduce((t, r) => t + r.qty, 0));
    const tiles = [
      ['t-mfg', 'قيد التصنيع', num(s.mfg.containers), `حاوية — ${num(s.mfg.qty)} قطعة`, 'rp-mfg'],
      ['t-ready', 'بانتظار تعميد الشحن', num(s.ready.containers), `حاوية — ${num(s.ready.qty)} قطعة`, 'rp-ready'],
      ['t-ship', 'مشحونة (لم يكتمل استلامها)', num(s.shipped.containers), `حاوية — ${num(s.shipped.invoices)} فاتورة`, 'rp-shipped'],
      ['t-sea', 'في البحر', num(c.atSea.length), `حاوية — ${cq(c.atSea)} قطعة`, 'rp-sea'],
      ['t-nodecl', 'وصلت بدون بيان جمركي', num(c.noDecl.length), `حاوية — ${cq(c.noDecl)} قطعة`, 'rp-nodecl'],
      ['t-yard', 'في ساحات المخلص (بيان وغير مستلمة)', num(c.inYard.length), `حاوية — ${cq(c.inYard)} قطعة`, 'rp-yard'],
      ['t-recv', 'مستلمة (لم يُرجع الفارغ)', num(c.received.length), `حاوية — ${cq(c.received)} قطعة`, 'rp-recv'],
      ['t-ret', 'أُعيد فارغها', num(c.returned), 'حاوية', 'rp-wh']
    ];
    $('rpSummary').innerHTML = tiles.map(t => `<div class="rp-tile ${t[0]}"><small>${t[1]}</small><b>${t[2]}</b><span>${t[3]}</span></div>`).join('');
    $('rpToc').innerHTML = tiles.slice(0, 7).map(t => `<a href="#" data-to="${t[4]}">${t[1]}</a>`).join('') +
      '<a href="#" data-to="rp-wh">حسب المستودع</a><a href="#" data-to="rp-lcs">الاعتمادات البنكية</a><a href="#" data-to="rp-rates">أسعار الشحن</a>';

    const html = [
      goods('rp-mfg', '1. البضائع قيد التصنيع', 'طلبات شحن تاريخ جاهزيتها لم يحن بعد', d.goods.mfg,
        [['الفاتورة', r => ltr(r.invoiceNo)], ['ميناء التحميل', r => esc(r.port)], ['تاريخ الجاهزية', r => esc(r.readyDate)]]),
      goods('rp-ready', '2. البضائع بانتظار تعميد الشحن', 'جاهزة ولم تُعمّد بعد', d.goods.ready,
        [['الفاتورة', r => ltr(r.invoiceNo)], ['ميناء التحميل', r => esc(r.port)], ['جاهزة منذ', r => esc(r.readyDate)],
         ['الفحص', r => `<span class="tag ${['مجتاز', 'معفى'].includes(r.inspection) ? 'ok' : 'wait'}">${esc(r.inspection || 'لم يُفحص')}</span>`]]),
      goods('rp-shipped', '3. البضائع المشحونة', 'شحنات معمّدة لم يكتمل استلام حاوياتها', d.goods.shipped,
        [['التسلسل', r => esc(r.serial)], ['الفاتورة', r => ltr(r.invoiceNo)], ['الشحن ← الوصول', r => `${esc(r.port)} ← ${esc(r.arrivalPort || '—')}`],
         ['تاريخ الشحن', r => esc(r.shipDate || '—')], ['الوصول المتوقع', r => esc(r.eta || '—')]]),
      boxes('rp-sea', '4. الحاويات في البحر', 'معمّدة ولم تُفرّغ بعد', c.atSea,
        [['ميناء الوصول', r => esc(r.arrivalPort || '—')], ['الوصول المتوقع', r => `${esc(r.eta || '—')}${r.eta && r.eta < d.today ? ' <span class="tag bad">تجاوز</span>' : ''}`]]),
      boxes('rp-nodecl', '5. حاويات في التخليص: وصلت وبدون بيان جمركي', 'فُرّغت ولم يُسجّل لها بيان', c.noDecl,
        [['ميناء الوصول', r => esc(r.arrivalPort || '—')], ['التفريغ', r => esc(r.dischargeDate)], ['آخر يوم مجاني', r => esc(r.freeLast || '—')], ['فترة السماح', freeTag]]),
      boxes('rp-yard', '6. حاويات في ساحات المخلص الجمركي', 'لها بيان جمركي ولم تُستلم في المستودع', c.inYard,
        [['البيان', r => ltr(r.declarationNo)], ['التفريغ', r => esc(r.dischargeDate)], ['آخر يوم مجاني', r => esc(r.freeLast || '—')], ['فترة السماح', freeTag]]),
      boxes('rp-recv', '7. الحاويات المستلمة', 'في المستودع ولم يُرجع فارغها', c.received,
        [['المستودع', r => esc(r.warehouse || '—')], ['تاريخ الاستلام', r => esc(r.receivedDate)], ['آخر يوم مجاني', r => esc(r.freeLast || '—')], ['فترة السماح', freeTag]]),
      section('rp-wh', '8. الحاويات حسب المستودع', 'كل الحاويات المستلمة', ['المستودع', 'الحاويات المستلمة', 'منها لم يُرجع فارغها', 'الكمية المستلمة', 'الموديلات'], d.warehouses,
        w => `<tr>${td(`<b>${esc(w.warehouse)}</b>`)}${td(num(w.containers), 'num')}${td(num(w.notReturned), 'num')}${td(num(w.qty), 'num')}${td(w.models.slice(0, 6).map(m => `<span dir="ltr">${esc(m.model)}</span>: ${num(m.qty)}`).join('، ') + (w.models.length > 6 ? '…' : ''), 'wh-models')}</tr>`,
        list => `${td('الإجمالي')}${td(num(list.reduce((t, w) => t + w.containers, 0)), 'num')}${td(num(list.reduce((t, w) => t + w.notReturned, 0)), 'num')}${td(num(list.reduce((t, w) => t + w.qty, 0)), 'num')}${td('')}`),
      lcsSection(d.lcs || [], d.today),
      ratesSection(d.rates)
    ];
    $('rpBody').innerHTML = html.join('');
  }

  function change(x) {
    if (!x) return '—';
    if (x.prev == null) return '<span class="chg-same">أول سعر</span>';
    const diff = x.value - x.prev;
    if (!diff) return '<span class="chg-same">بدون تغيير</span>';
    const pct = Math.round(diff / x.prev * 1000) / 10;
    return `<span class="${diff > 0 ? 'chg-up' : 'chg-down'}">${diff > 0 ? '▲ +' : '▼ '}${num(diff)} (${pct > 0 ? '+' : ''}${pct}%)</span>`;
  }

  function lcsSection(rows, today) {
    const lcTag = r => `<span class="tag ${r.state === 'منتهي' ? 'bad' : r.state === 'مفتوح' ? 'ok' : 'gray'}">${esc(r.state)}</span>`;
    const exp = r => `${esc(r.expiry || '—')}${r.state !== 'منتهي' && r.daysToExpiry != null && r.daysToExpiry <= 15 ? ` <span class="tag wait">${r.daysToExpiry} يوم</span>` : ''}`;
    const due = r => r.nextDue ? `${esc(r.nextDue)}${r.nextDue < today ? ' <span class="tag bad">متأخر</span>' : ''}` : '—';
    return section('rp-lcs', '9. الاعتمادات البنكية القائمة', 'كل الاعتمادات غير المقفلة', ['رقم الاعتماد', 'البنك', 'أوامر الشراء', 'الدفع', 'المبلغ', 'المستخدم', 'المتاح', 'المسدد', 'آخر شحن', 'الصلاحية', 'الاستحقاق القادم', 'الحالة'], rows,
      r => `<tr>${td(`<b>${ltr(r.lcNo)}</b>`)}${td(esc(r.bank))}${td(esc(r.pos))}${td(esc(r.payType))}${td(money(r.amount, r.currency), 'num')}${td(money(r.used), 'num')}${td(`<b>${money(r.available)}</b>`, 'num')}${td(money(r.paid), 'num')}${td(esc(r.latestShip || '—'))}${td(exp(r))}${td(due(r))}${td(lcTag(r))}</tr>`);
  }

  function ratesSection(r) {
    const rows = r.latest;
    const price = x => x ? `<b class="num">$${num(x.value)}</b>` : '—';
    return section('rp-rates', '10. أسعار الشحن (USD / حاوية)', r.lastDate ? 'آخر تحديث ' + r.lastDate : 'لم تُسجّل أسعار بعد',
      ['ميناء الشحن'].concat(...RATE_DESTS.map(([, name]) => [name, 'التغيّر']), ['تاريخ السعر']), rows,
      x => `<tr>${td(`<b>${esc(x.port)}</b>`)}${RATE_DESTS.map(([k]) => td(price(x[k])) + td(change(x[k]))).join('')}${td(esc(RATE_DESTS.map(([k]) => x[k] && x[k].date).filter(Boolean).sort().pop() || '—'))}</tr>`);
  }
})();
