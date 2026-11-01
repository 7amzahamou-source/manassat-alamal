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
      setCollapsed(a.dataset.to, false);   // القسم المطوي ينفتح لما تروح له
      $(a.dataset.to).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // طي / إظهار كل جدول من السهم جنب عنوانه
    $('rpBody').addEventListener('click', e => {
      const h = e.target.closest('[data-tog]');
      if (!h) return;
      setCollapsed(h.dataset.tog, !$(h.dataset.tog).classList.contains('collapsed'));
    });
    $('rpBody').addEventListener('keydown', e => {
      const h = e.target.closest('[data-tog]');
      if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.click(); }
    });
    $('rpCollapseAll').addEventListener('click', () => allSections().forEach(id => setCollapsed(id, true)));
    $('rpExpandAll').addEventListener('click', () => allSections().forEach(id => setCollapsed(id, false)));
  }

  /* ===== طي الجداول (يُحفظ في المتصفح) ===== */
  const FOLD_KEY = 'rp-collapsed';
  const folded = () => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch (e) { return []; } };
  const allSections = () => [...document.querySelectorAll('#rpBody .rp-sec')].map(s => s.id);
  function setCollapsed(id, on) {
    const sec = $(id);
    if (!sec) return;
    sec.classList.toggle('collapsed', on);
    const btn = sec.querySelector('[data-tog]');
    if (btn) btn.setAttribute('aria-expanded', String(!on));
    const list = folded().filter(x => x !== id);
    if (on) list.push(id);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(list)); } catch (e) { /* المتصفح يمنع التخزين */ }
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

  /** قسم = عنوان + جدول + سطر إجمالي. widths = عرض الأعمدة (اختياري) */
  function section(id, title, note, heads, rows, rowFn, totals, widths) {
    const body = rows.length
      ? `<div class="table-wrap"><table class="compact rp-t">
          ${widths ? `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>` : ''}
          <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(rowFn).join('')}</tbody>
          ${totals ? `<tfoot><tr>${totals(rows)}</tr></tfoot>` : ''}
        </table></div>`
      : '<p class="rp-empty">لا يوجد.</p>';
    const off = folded().includes(id);
    return `<section id="${id}" class="card rp-sec${off ? ' collapsed' : ''}">
      <div class="db-head rp-head" data-tog="${id}" role="button" tabindex="0" aria-expanded="${!off}" title="اضغط للطي / الإظهار">
        <b><span class="rp-arrow" aria-hidden="true"></span>${title} <span class="tag gray">${rows.length}</span></b><span class="sub small">${note}</span></div>
      ${body}</section>`;
  }

  /* ===== خلايا مختصرة: سطر رئيسي + سطر فرعي ===== */
  const two = (main, sub, cls) => `<td${cls ? ` class="${cls}"` : ''}><b>${main}</b>${sub ? `<small>${sub}</small>` : ''}</td>`;
  const chipList = (items, max) => {
    const more = items.length - max;
    return `<div class="mchips">${items.slice(0, max).map(([m, q]) =>
      `<span class="mchip" dir="ltr">${esc(m)}${q != null ? ` <i>${num(q)}</i>` : ''}</span>`).join('')}${more > 0
      ? `<span class="mchip more" title="${esc(items.slice(max).map(([m, q]) => m + (q != null ? ': ' + num(q) : '')).join('\n'))}">+${more}</span>` : ''}</div>`;
  };
  const etaTag = (eta, today) => {
    if (!eta) return '';
    const d = daysBetween(today, eta);
    return d < 0 ? ` <span class="tag bad">تجاوز ${-d} يوم</span>` : d <= 7 ? ` <span class="tag wait">باقي ${d} يوم</span>` : '';
  };

  /** بنود البضائع ← شحنة واحدة لكل (طلب/تسلسل + أمر شراء) مع موديلاتها */
  function groupGoods(rows) {
    const g = {};
    rows.forEach(r => {
      const k = (r.serial || r.requestCode || r.invoiceNo) + '|' + r.poNo;
      const x = g[k] = g[k] || { ...r, models: [], qty: 0, containers: 0 };
      x.models.push([r.model, r.qty]);
      x.qty += r.qty;
      x.containers += r.containers;
    });
    return Object.values(g);
  }
  const goodsTotals = (cols, label) => list => `<td>الإجمالي — ${num(list.length)} ${label}</td><td></td><td></td><td class="num"><b>${num(list.reduce((t, r) => t + r.qty, 0))}</b><small>${num(list.reduce((t, r) => t + r.containers, 0))} حاوية</small></td>${'<td></td>'.repeat(cols - 4)}`;

  /** الحاويات ← مجموعة لكل تسلسل (فاتورة) */
  function groupBoxes(rows) {
    const g = {};
    rows.forEach(c => {
      const k = c.serial + '|' + c.invoiceNo;
      const x = g[k] = g[k] || { serial: c.serial, invoiceNo: c.invoiceNo, poNo: c.poNo, arrivalPort: c.arrivalPort, eta: c.eta,
        list: [], qty: 0, decls: new Set(), whs: new Set(), discharge: '', received: '', freeLeft: null, freeLast: '' };
      x.list.push(c);
      x.qty += c.qty;
      if (c.declarationNo) x.decls.add(c.declarationNo);
      if (c.warehouse) x.whs.add(c.warehouse);
      if (c.dischargeDate && (!x.discharge || c.dischargeDate < x.discharge)) x.discharge = c.dischargeDate;
      if (c.receivedDate && c.receivedDate > x.received) x.received = c.receivedDate;
      if (c.freeLeft != null && (x.freeLeft == null || c.freeLeft < x.freeLeft)) { x.freeLeft = c.freeLeft; x.freeLast = c.freeLast; }
    });
    return Object.values(g).sort((a, b) => Number(a.serial) - Number(b.serial));
  }
  const boxChips = x => {
    const nums = x.list.filter(c => c.containerNo).map(c => [c.containerNo, null]);
    const none = x.list.length - nums.length;
    return chipList(nums, 4) + (none ? `<small class="rp-none">${num(none)} بدون رقم</small>` : '');
  };
  const boxTotals = cols => list => `<td>الإجمالي — ${num(list.length)} فاتورة</td><td></td><td><b>${num(list.reduce((t, x) => t + x.list.length, 0))} حاوية</b></td><td class="num"><b>${num(list.reduce((t, x) => t + x.qty, 0))}</b></td>${'<td></td>'.repeat(cols - 4)}`;
  const freeCell = x => x.freeLeft == null ? '<td>—</td>' : two(freeTag({ freeLeft: x.freeLeft }), x.freeLast ? 'آخر يوم ' + esc(x.freeLast) : '');

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

    const t0 = d.today;
    const mfg = groupGoods(d.goods.mfg), ready = groupGoods(d.goods.ready), shipped = groupGoods(d.goods.shipped);
    const atSea = groupBoxes(c.atSea), noDecl = groupBoxes(c.noDecl), inYard = groupBoxes(c.inYard), recv = groupBoxes(c.received);
    const route = r => (r.port && r.port !== '—') || r.arrivalPort ? `${esc(r.port && r.port !== '—' ? r.port : '؟')} ← ${esc(r.arrivalPort || '؟')}` : '—';
    const poCell = r => two(esc(r.poNo), `<span class="clip" title="${esc(r.supplier || '')}">${esc(r.supplier || '')}</span>`);
    const qtyCell = r => two(num(r.qty), `${num(r.containers) || '—'} حاوية`, 'num');
    const boxHead = ['التسلسل / الفاتورة', 'أمر الشراء', 'الحاويات', 'الكمية'];
    const boxRow = (x, extra) => `<tr>${two(esc(x.serial), `فاتورة <span dir="ltr">${esc(x.invoiceNo)}</span>`)}${td(esc(x.poNo))}<td>${boxChips(x)}</td>${td(`<b>${num(x.qty)}</b>`, 'num')}${extra(x)}</tr>`;

    const html = [
      section('rp-mfg', '1. البضائع قيد التصنيع', 'طلبات شحن تاريخ جاهزيتها لم يحن بعد', ['أمر الشراء / المورد', 'الفاتورة / الطلب', 'الموديلات', 'الكمية / الحاويات', 'الجاهزية / ميناء التحميل'], mfg,
        r => `<tr>${poCell(r)}${two(`<span dir="ltr">${esc(r.invoiceNo || '—')}</span>`, `<span dir="ltr">${esc(r.requestCode)}</span>`)}<td>${chipList(r.models, 6)}</td>${qtyCell(r)}${two(esc(r.readyDate), esc(r.port))}</tr>`,
        goodsTotals(5, 'طلب'), ['20%', '16%', '34%', '12%', '18%']),
      section('rp-ready', '2. البضائع بانتظار تعميد الشحن', 'جاهزة ولم تُعمّد بعد', ['أمر الشراء / المورد', 'الفاتورة / الطلب', 'الموديلات', 'الكمية / الحاويات', 'جاهزة منذ / الميناء', 'الفحص'], ready,
        r => { const late = daysBetween(r.readyDate, t0);
          return `<tr>${poCell(r)}${two(`<span dir="ltr">${esc(r.invoiceNo || '—')}</span>`, `<span dir="ltr">${esc(r.requestCode)}</span>`)}<td>${chipList(r.models, 6)}</td>${qtyCell(r)}${two(esc(r.readyDate) + (late > 7 ? ` <span class="tag wait">${late} يوم</span>` : ''), esc(r.port))}<td><span class="tag ${['مجتاز', 'معفى'].includes(r.inspection) ? 'ok' : 'wait'}">${esc(r.inspection || 'لم يُفحص')}</span></td></tr>`; },
        goodsTotals(6, 'طلب'), ['18%', '15%', '31%', '11%', '15%', '10%']),
      section('rp-shipped', '3. البضائع المشحونة', 'شحنات معمّدة لم يكتمل استلام حاوياتها', ['التسلسل / الفاتورة', 'أمر الشراء / المورد', 'الموديلات', 'الكمية / الحاويات', 'المسار', 'الشحن / الوصول المتوقع'], shipped,
        r => `<tr>${two(esc(r.serial), `<span dir="ltr">${esc(r.invoiceNo)}</span>`)}${poCell(r)}<td>${chipList(r.models, 4)}</td>${qtyCell(r)}${two(route(r), '')}${two(esc(r.eta || '—'), 'شُحنت ' + esc(r.shipDate || '—') + etaTag(r.eta, t0))}</tr>`,
        goodsTotals(6, 'شحنة'), ['13%', '19%', '29%', '11%', '12%', '16%']),
      section('rp-sea', '4. الحاويات في البحر', 'معمّدة ولم تُفرّغ بعد — مجمّعة حسب الفاتورة', boxHead.concat(['ميناء الوصول / الوصول المتوقع']), atSea,
        x => boxRow(x, x => two(esc(x.arrivalPort || '—'), esc(x.eta || '—') + etaTag(x.eta, t0))), boxTotals(5), ['15%', '15%', '38%', '12%', '20%']),
      section('rp-nodecl', '5. حاويات في التخليص: وصلت وبدون بيان جمركي', 'فُرّغت ولم يُسجّل لها بيان', boxHead.concat(['التفريغ / الميناء', 'فترة السماح']), noDecl,
        x => boxRow(x, x => two(esc(x.discharge || '—'), esc(x.arrivalPort || '')) + freeCell(x)), boxTotals(6), ['14%', '13%', '33%', '10%', '15%', '15%']),
      section('rp-yard', '6. حاويات في ساحات المخلص الجمركي', 'لها بيان جمركي ولم تُستلم في المستودع', boxHead.concat(['البيان / التفريغ', 'فترة السماح']), inYard,
        x => boxRow(x, x => two(`<span dir="ltr">${esc([...x.decls].join('، ') || '—')}</span>`, 'تفريغ ' + esc(x.discharge || '—')) + freeCell(x)), boxTotals(6), ['14%', '13%', '33%', '10%', '15%', '15%']),
      section('rp-recv', '7. الحاويات المستلمة', 'في المستودع ولم يُرجع فارغها', boxHead.concat(['المستودع / الاستلام', 'فترة السماح']), recv,
        x => boxRow(x, x => two(esc([...x.whs].join('، ') || '—'), 'استلام ' + esc(x.received || '—')) + freeCell(x)), boxTotals(6), ['14%', '13%', '33%', '10%', '15%', '15%']),
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
    const due = r => r.nextDue ? esc(r.nextDue) + etaTag(r.nextDue, today) : '—';
    const cur = r => r.currency || '';
    return section('rp-lcs', '9. الاعتمادات البنكية القائمة', 'كل الاعتمادات غير المقفلة',
      ['الاعتماد / البنك', 'أوامر الشراء', 'الشرط / الدفع', 'المبلغ', 'المستخدم / المتاح', 'المسدد / على الآجل', 'آخر شحن / الصلاحية', 'الاستحقاق القادم'], rows,
      r => `<tr>${two(`<span dir="ltr">${esc(r.lcNo)}</span>`, esc(r.bank))}<td><span class="clip2" dir="ltr">${esc(r.pos || '—')}</span></td>${two(`<span dir="ltr">${esc(r.incoterm || '—')}</span>`, esc(r.payType))}${two(money(r.amount), esc(cur(r)), 'num')}${two(money(r.used), 'متاح <b class="' + (r.available < 0 ? 'neg' : '') + '">' + money(r.available) + '</b>', 'num')}${two(money(r.paid), 'آجل ' + money(r.notDue), 'num')}${two(esc(r.latestShip || '—'), exp(r))}<td>${due(r)}<div style="margin-top:3px">${lcTag(r)}</div></td></tr>`,
      null, ['14%', '15%', '9%', '11%', '13%', '13%', '13%', '12%']);
  }

  function ratesSection(r) {
    const rows = r.latest;
    const price = x => x ? `<b class="num">$${num(x.value)}</b>` : '—';
    return section('rp-rates', '10. أسعار الشحن (USD / حاوية)', r.lastDate ? 'آخر تحديث ' + r.lastDate : 'لم تُسجّل أسعار بعد',
      ['ميناء الشحن'].concat(...RATE_DESTS.map(([, name]) => [name, 'التغيّر']), ['تاريخ السعر']), rows,
      x => `<tr>${td(`<b>${esc(x.port)}</b>`)}${RATE_DESTS.map(([k]) => td(price(x[k])) + td(change(x[k]))).join('')}${td(esc(RATE_DESTS.map(([k]) => x[k] && x[k].date).filter(Boolean).sort().pop() || '—'))}</tr>`);
  }
})();
