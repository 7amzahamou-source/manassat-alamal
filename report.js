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
    $('rpSummary').addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b || !$(b.dataset.open)) return;
      setCollapsed(b.dataset.open, false);
      $(b.dataset.open).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
  // أول مرة (ما فيه اختيار محفوظ): كل الجداول مطوية تحت الداشبورد
  const ALL_SECTIONS = ['rp-mfg', 'rp-ready', 'rp-shipped', 'rp-sea', 'rp-nodecl', 'rp-yard', 'rp-recv', 'rp-wh', 'rp-lcs', 'rp-rates'];
  const folded = () => { try { const v = localStorage.getItem(FOLD_KEY); return v == null ? ALL_SECTIONS.slice() : JSON.parse(v); } catch (e) { return ALL_SECTIONS.slice(); } };
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

  /* =====================================================
     الداشبورد المختصر (فوق الجداول)
  ===================================================== */
  const PORT_KEYS = [['dmm', 'الدمام', '#2a78d6'], ['jed', 'جدة', '#eb6834'], ['rbg', 'رابغ', '#1baf7a']];
  const portKey = p => { p = String(p || ''); return p.includes('دمام') ? 'dmm' : p.includes('جد') ? 'jed' : p.includes('رابغ') || p.includes('عبدالله') ? 'rbg' : 'other'; };
  const short = v => { v = Number(v) || 0; const a = Math.abs(v);
    return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M' : a >= 1e3 ? Math.round(v / 1e3) + 'K' : num(Math.round(v)); };

  function renderDash(d) {
    const t0 = d.today, s = d.summary, c = d.containers, x = d.dash || {};
    const days = e => daysBetween(t0, e);
    const readyLate = groupGoods(d.goods.ready).filter(r => r.readyDate && daysBetween(r.readyDate, t0) > 7).length;
    const seaInv = new Set(c.atSea.map(r => r.serial)).size;
    const arriving = c.atSea.filter(r => r.eta && days(r.eta) >= 0 && days(r.eta) <= 14).length;
    const lateSea = c.atSea.filter(r => r.eta && days(r.eta) < 0);
    const clearance = c.noDecl.length + c.inYard.length;
    const overFree = c.noDecl.concat(c.inYard, c.received).filter(r => r.freeLeft != null && r.freeLeft < 0).length;
    const nearFree = c.noDecl.filter(r => r.freeLeft != null && r.freeLeft >= 0 && r.freeLeft <= 3).length;
    const ch = x.recvPrevMonth ? Math.round((x.recvMonth - x.recvPrevMonth) / x.recvPrevMonth * 100) : null;

    // --- الأرقام الرئيسية ---
    const kpi = (ic, label, val, sub, flag, cls, to) => `<button type="button" class="dk-kpi" data-open="${to}">
      <i aria-hidden="true">${ic}</i><small>${label}</small><b>${num(val)}</b><span>${sub}</span>${flag ? `<em class="${cls}">${flag}</em>` : ''}</button>`;
    const kpis = [
      kpi('🏭', 'قيد التصنيع', s.mfg.containers, `حاوية · ${num(s.mfg.qty)} قطعة`, '', '', 'rp-mfg'),
      kpi('📦', 'جاهزة بانتظار التعميد', s.ready.containers, `حاوية · ${num(s.ready.requests)} طلب`, readyLate ? `⚠ ${readyLate} طلب أكثر من 7 أيام` : '', 'wt', 'rp-ready'),
      kpi('🚢', 'في البحر', c.atSea.length, `حاوية · ${num(seaInv)} فاتورة`, arriving ? `تصل ${num(arriving)} حاوية خلال 14 يوم` : '', 'wt', 'rp-sea'),
      kpi('🛃', 'في التخليص', clearance, `حاوية · ${num(c.noDecl.length)} بدون بيان`, overFree ? `⚠ ${num(overFree)} تجاوزت فترة السماح` : '', 'up', 'rp-nodecl'),
      kpi('✅', 'استُلمت هالشهر', x.recvMonth || 0, 'حاوية · في المستودعات', ch == null ? '' : `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}% عن الشهر الماضي`, ch >= 0 ? 'ok' : 'wt', 'rp-recv')
    ].join('');

    // --- مسار البضاعة ---
    const stages = [['قيد التصنيع', s.mfg.containers, 'rp-mfg'], ['بانتظار التعميد', s.ready.containers, 'rp-ready'], ['في البحر', c.atSea.length, 'rp-sea'],
      ['وصلت بدون بيان', c.noDecl.length, 'rp-nodecl', nearFree ? `● ${nearFree} قرّبت الأرضيات` : ''], ['في ساحات المخلص', c.inYard.length, 'rp-yard'],
      ['مستلمة — لم يُرجع الفارغ', c.received.length, 'rp-recv']];
    const mx = Math.max(1, ...stages.map(st => st[1]));
    const flow = stages.map(([l, v, to, flag]) => `<button type="button" class="dk-st${flag ? ' alert' : ''}" data-open="${to}" title="${l}: ${num(v)} حاوية">
      <small>${l}</small><b>${num(v)}</b><span class="dk-bar"><span style="width:${Math.max(v ? 3 : 0, v / mx * 100)}%"></span></span>${flag ? `<em>${flag}</em>` : ''}</button>`).join('');

    // --- الواصلة حسب الأسبوع (مكدّسة حسب ميناء الوصول) ---
    const buckets = [['هالأسبوع', []], ['الأسبوع 2', []], ['الأسبوع 3', []], ['الأسبوع 4', []], ['الأسبوع 5', []], ['بعدها', []]];
    c.atSea.forEach(r => {
      if (!r.eta) return;
      const dd = days(r.eta);
      if (dd < 0) return;                       // المتأخرة تظهر كملاحظة، مو عمود (عشان ما تخفي الباقي)
      buckets[Math.min(5, Math.floor(dd / 7))][1].push(r);
    });
    const cols = buckets.filter(([l, list], i) => list.length || i < 5);
    const series = PORT_KEYS.concat([['other', 'أخرى', '#9a9cb5']]);
    const used = series.filter(([k]) => cols.some(([, list]) => list.some(r => portKey(r.arrivalPort) === k)));
    const maxCol = Math.max(1, ...cols.map(([, l]) => l.length));
    const W = 560, H = 190, base = 168, top = 22, bw = Math.min(54, (W - 40) / cols.length - 18), step = (W - 40) / cols.length;
    const sy = v => v / maxCol * (base - top);
    let svg = `<line x1="10" y1="${base}" x2="${W - 10}" y2="${base}" stroke="var(--line)"/>`;
    cols.forEach(([lab, list], i) => {
      const xc = W - 20 - step * i - step / 2;   // RTL: الأقرب يمين
      let y = base;
      used.forEach(([k, name, color], j) => {
        const n = list.filter(r => portKey(r.arrivalPort) === k).length;
        if (!n) return;
        const h = sy(n);
        const isTop = !used.slice(j + 1).some(([k2]) => list.some(r => portKey(r.arrivalPort) === k2));
        svg += `<rect x="${xc - bw / 2}" y="${y - h + (y < base ? 1 : 0)}" width="${bw}" height="${Math.max(1, h - (y < base ? 2 : 0))}" rx="${isTop ? 4 : 0}" fill="${color}"><title>${lab} — ${name}: ${num(n)} حاوية</title></rect>`;
        y -= h;
      });
      svg += `<text x="${xc}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${list.length ? num(list.length) : ''}</text>
        <text x="${xc}" y="${base + 16}" text-anchor="middle" font-size="11" fill="var(--mute)">${lab}</text>`;
    });
    const lateNote = lateSea.length ? `<button type="button" class="dk-late" data-open="rp-sea">⚠ ${num(lateSea.length)} حاوية تعدّى وصولها المتوقع ولم تُفرّغ — حدّث بياناتها</button>` : '';
    const etaChart = cols.some(([, l]) => l.length)
      ? lateNote + `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="الحاويات الواصلة حسب الأسبوع">${svg}</svg>
         <div class="leg">${used.map(([, n, col]) => `<span><i style="background:${col}"></i>${n}</span>`).join('')}</div>`
      : lateNote + '<p class="rp-empty">ما فيه حاويات قادمة لها وصول متوقع.</p>';

    // --- الاعتمادات ---
    const lcs = d.lcs || [];
    const curs = {};
    lcs.forEach(l => { curs[l.currency] = (curs[l.currency] || 0) + 1; });
    const cur = Object.keys(curs).sort((a, b) => curs[b] - curs[a])[0] || 'USD';
    const L = lcs.filter(l => l.currency === cur);
    const tot = k => L.reduce((t, l) => t + (Number(l[k]) || 0), 0);
    const amount = tot('amount'), paid = tot('paid'), notDue = tot('notDue'), used2 = tot('used');
    const avail = L.filter(l => l.state === 'مفتوح').reduce((t, l) => t + Math.max(0, Number(l.available) || 0), 0);
    const other = Math.max(0, used2 - paid - notDue);
    const segs = [[paid, '#2a78d6', 'مسدد'], [notDue, '#eb6834', 'على الآجل'], [other, '#9a9cb5', 'محجوز / بانتظار البنك'], [avail, 'var(--line)', 'متاح']];
    const segTot = segs.reduce((t, sg) => t + sg[0], 0) || 1;
    const sched = [];
    L.forEach(l => (l.schedule || []).forEach(p => { if (p.bucket === 'غير مستحقة' && p.dueDate) sched.push(p); }));
    sched.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const nextDate = sched.length ? sched[0].dueDate : '';
    const nextAmt = sched.filter(p => p.dueDate === nextDate).reduce((t, p) => t + p.amount, 0);
    const due7 = sched.filter(p => days(p.dueDate) <= 7).reduce((t, p) => t + p.amount, 0);
    const lcCard = lcs.length ? `
      <div class="dk-lcm"><div><small>إجمالي المبالغ</small><b>${short(amount)}</b></div><div><small>على الآجل</small><b>${short(notDue)}</b></div><div><small>المتاح للشحن</small><b>${short(avail)}</b></div></div>
      <div class="dk-stack">${segs.filter(sg => sg[0] > 0).map(([v, col, n]) => `<span style="width:${v / segTot * 100}%;background:${col}" title="${n}: ${short(v)} ${cur}"></span>`).join('')}</div>
      <div class="leg">${segs.filter(sg => sg[0] > 0).map(([v, col, n]) => `<span><i style="background:${col}"></i>${n} ${Math.round(v / segTot * 100)}%</span>`).join('')}</div>
      <div class="sub small" style="margin-top:10px">${nextDate ? `أقرب استحقاق: ${esc(nextDate)} — ${short(nextAmt)} ${esc(cur)}` : 'ما فيه استحقاقات قادمة'}</div>`
      : '<p class="rp-empty">ما فيه اعتمادات قائمة.</p>';

    // --- تحتاج قرار ---
    const expiring = lcs.filter(l => l.state === 'مفتوح' && l.available > 0.5 && l.daysToExpiry != null && l.daysToExpiry <= 15).length;
    const alerts = [
      ['bad', 'حاويات تجاوزت فترة السماح (أرضيات)', overFree, 'rp-nodecl'],
      ['bad', 'اعتماد بنكي ينتهي خلال 15 يوم وفيه رصيد', expiring, 'rp-lcs'],
      ['wait', 'شحنات تأخرت عن الوصول المتوقع', new Set(lateSea.map(r => r.serial)).size, 'rp-sea'],
      ['wait', 'طلبات جاهزة بدون تعميد أكثر من 7 أيام', readyLate, 'rp-ready'],
      ['wait', 'دفعات اعتماد تُسدد خلال 7 أيام', due7, 'rp-lcs', short(due7) + ' ' + cur]
    ].filter(a => a[2] > 0);
    const alertList = alerts.length ? alerts.map(([cls, t, n, to, label]) =>
      `<button type="button" class="dk-al ${cls}" data-open="${to}"><span class="ic">!</span>${t}<b>${label || num(n)}</b></button>`).join('')
      : '<p class="dk-ok">✓ ما فيه شي يحتاج قرار اليوم</p>';

    // --- المستودعات هالشهر ---
    const wh = (x.whMonth || []).slice(0, 5);
    const whMax = Math.max(1, ...wh.map(w => w.containers));
    const whCard = wh.length ? `<div class="dk-hb">${wh.map(w => `<div title="${esc(w.warehouse)}: ${num(w.containers)} حاوية"><span>${esc(w.warehouse)}</span><i><em style="width:${w.containers / whMax * 100}%"></em></i><b>${num(w.containers)}</b></div>`).join('')}</div>`
      : '<p class="rp-empty">ما استُلمت حاويات هالشهر.</p>';

    // --- أسعار الشحن ---
    const hist = (d.rates.history || []).filter(r => RATE_DESTS.some(([k]) => r[k]));
    let rateCard = '<p class="rp-empty">يحتاج تحديثين لأسعار الشحن على الأقل لعرض الرسم.</p>';
    if (hist.length >= 2) {
      const vals = hist.flatMap(r => RATE_DESTS.map(([k]) => r[k]).filter(Boolean));
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
      const yv = v => 140 - (v - lo + pad) / (hi - lo + 2 * pad) * 120;
      const xv = i => 300 - i * (280 / (hist.length - 1));   // RTL: الأقدم يمين والأحدث يسار
      const order = hist.slice().reverse();                      // i=0 الأحدث
      let g = '<line x1="10" y1="146" x2="310" y2="146" stroke="var(--line)"/>';
      RATE_DESTS.forEach(([k, name, v]) => {
        const col = PORT_KEYS.find(p => p[0] === k)[2];
        const pts = order.map((r, i) => r[k] ? `${xv(order.length - 1 - i).toFixed(1)},${yv(r[k]).toFixed(1)}` : '').filter(Boolean);
        if (pts.length < 2) return;
        g += `<polyline fill="none" stroke="${col}" stroke-width="2" points="${pts.join(' ')}"/>`;
        const last = hist[hist.length - 1];
        if (last[k]) g += `<circle cx="${xv(hist.length - 1)}" cy="${yv(last[k])}" r="4" fill="${col}" stroke="var(--panel)" stroke-width="2"><title>${name}: ${num(last[k])}</title></circle>`;
      });
      g += `<text x="285" y="162" text-anchor="middle" font-size="10.5" fill="var(--mute)">${esc(hist[0].date)}</text><text x="30" y="162" text-anchor="middle" font-size="10.5" fill="var(--mute)">${esc(hist[hist.length - 1].date)}</text>`;
      const last = hist[hist.length - 1];
      rateCard = `<svg viewBox="0 0 320 168" width="100%" role="img" aria-label="أسعار الشحن">${g}</svg>
        <div class="leg">${RATE_DESTS.filter(([k]) => last[k]).map(([k, n]) => `<span><i style="background:${PORT_KEYS.find(p => p[0] === k)[2]}"></i>${n} <b>${num(last[k])}</b></span>`).join('')}</div>`;
    }

    $('rpSummary').innerHTML = `
      <div class="dk-k5">${kpis}</div>
      <div class="card dk-card"><h3>مسار البضاعة الحين</h3><div class="sub small">عدد الحاويات في كل مرحلة — من المصنع لين إرجاع الفارغ. اضغط أي مرحلة لتفاصيلها</div><div class="dk-flow">${flow}</div></div>
      <div class="dk-c2">
        <div class="card dk-card viz"><h3>الحاويات الواصلة — الأسابيع الجاية</h3><div class="sub small">حسب الوصول المتوقع، مقسّمة على ميناء الوصول</div>${etaChart}</div>
        <div class="card dk-card"><h3>تحتاج قرار اليوم</h3><div class="sub small">اضغط أي واحد يفتح التفاصيل</div><div class="dk-alerts">${alertList}</div></div>
      </div>
      <div class="dk-c3">
        <div class="card dk-card"><h3>الاعتمادات البنكية</h3><div class="sub small">${num(L.length)} اعتماد قائم — ${esc(cur)}${Object.keys(curs).length > 1 ? ' (والباقي بعملات ثانية في الجدول)' : ''}</div>${lcCard}</div>
        <div class="card dk-card"><h3>الحاويات في المستودعات</h3><div class="sub small">المستلمة هالشهر حسب المستودع</div>${whCard}</div>
        <div class="card dk-card viz"><h3>أسعار الشحن (متوسط)</h3><div class="sub small">${hist.length ? `آخر ${num(hist.length)} تحديثات — كل موانئ التحميل` : 'لم تُسجّل أسعار بعد'}</div>${rateCard}</div>
      </div>
      <div class="card dk-card dk-more no-print"><div><h3>التفاصيل الكاملة</h3><div class="sub small">الجداول مطوية تحت — اضغط اللي تحتاجه</div></div>
        <div class="dk-chips">${[['rp-mfg', 'قيد التصنيع'], ['rp-ready', 'بانتظار التعميد'], ['rp-shipped', 'المشحونة'], ['rp-sea', 'في البحر'], ['rp-nodecl', 'بدون بيان'], ['rp-yard', 'ساحات المخلص'], ['rp-recv', 'المستلمة'], ['rp-wh', 'حسب المستودع'], ['rp-lcs', 'الاعتمادات'], ['rp-rates', 'أسعار الشحن']].map(([id, n]) => `<button type="button" data-open="${id}">${n} ◀</button>`).join('')}</div></div>`;
    $('rpToc').innerHTML = '';
  }

  function render(d) {
    const dt = new Date(d.today + 'T00:00:00');
    $('rpDate').textContent = `${DAYS[dt.getDay()]} ${d.today} — وضع البضائع والحاويات حتى تاريخه`;

    const c = d.containers;
    renderDash(d);

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
