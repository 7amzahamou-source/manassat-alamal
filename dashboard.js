/**
 * صفحة: لوحة الإدارة
 */
(function () {
  registerPage({ key: 'dashboard', title: 'لوحة الإدارة', icon: ICONS.dashboard, levels: ['none', 'view'], init, show });

  const PIPE_CLS = { approval: 'wait', mfg: 'gray', ready: 'acc', sea: 'gray', port: 'wait', received: 'ok', returned: 'done' };
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function init() {
    $('dbRefreshBtn').addEventListener('click', load);
    // الضغط على مرحلة أو تنبيه يفتح صفحتها (إذا عند المستخدم صلاحية)
    $('page-dashboard').addEventListener('click', e => {
      const el = e.target.closest('[data-go]');
      if (el && can(el.dataset.go, 'view')) goTo(el.dataset.go);
    });
  }

  function show() {
    load();
  }

  async function load() {
    $('dbKpis').innerHTML = '';
    $('dbPipe').innerHTML = '<p class="sub" style="padding:16px">جارٍ التحميل…</p>';
    try {
      render(await API.dashboard());
    } catch (err) {
      $('dbPipe').innerHTML = `<p class="error" style="margin:16px">${esc(err.message)}</p>`;
    }
  }

  function render(d) {
    const dt = new Date(d.today + 'T00:00:00');
    $('dbDate').textContent = `${DAYS[dt.getDay()]} ${d.today} — نظرة على الأوامر والشحن والحاويات والتخليص`;

    const k = d.kpis;
    const pct = k.orderedQty ? Math.round(k.shippedQty / k.orderedQty * 100) : 0;
    $('dbKpis').innerHTML = [
      ['أوامر الشراء المعتمدة', num(k.approvedOrders), `من ${num(k.orders)} أمر`],
      ['نسبة الشحن من الأوامر المعتمدة', pct + '%', `${num(k.shippedQty)} من ${num(k.orderedQty)} قطعة`],
      ['حاويات في الطريق والميناء', num(k.inTransit), `من ${num(k.containers)} حاوية مسجلة`],
      ['ملفات شحن مفتوحة', num(k.openFiles), `${num(k.closedFiles)} ملف مقفل`]
    ].map(([l, v, s]) => `<div class="stat"><small>${l}</small><b>${v}</b><span class="sub small">${s}</span></div>`).join('');

    // مسار البضاعة
    $('dbPipe').innerHTML = d.pipeline.map((p, i) => `
      ${i ? '<span class="pipe-arrow" aria-hidden="true">←</span>' : ''}
      <button type="button" class="pipe-step ${PIPE_CLS[p.key] || ''}" data-go="${p.page}" ${can(p.page, 'view') ? '' : 'disabled'}
        title="${esc(p.label)}: ${p.value} ${esc(p.unit)}">
        <b>${num(p.value)}</b><span>${esc(p.label)}</span><small>${esc(p.unit)}</small>
      </button>`).join('');

    // التنبيهات
    $('dbAlertsCount').textContent = d.alerts.length ? d.alerts.length + ' تنبيه' : 'لا شيء';
    $('dbAlertsCount').className = 'tag ' + (d.alerts.some(a => a.level === 'bad') ? 'bad' : d.alerts.length ? 'wait' : 'ok');
    $('dbAlerts').innerHTML = d.alerts.length ? d.alerts.map(a => `
      <button type="button" class="alert-row ${a.level}" data-go="${a.page}" ${can(a.page, 'view') ? '' : 'disabled'}>
        <span class="alert-ic" aria-hidden="true">${a.level === 'bad' ? '!' : '•'}</span>
        <b class="num">${num(a.count)}</b><span>${esc(a.text)}</span>
        ${can(a.page, 'view') ? '<span class="go">فتح ←</span>' : ''}
      </button>`).join('')
      : '<p class="all-good">✓ ما فيه شي يحتاج إجراء الآن</p>';

    // الأيام المجانية
    $('dbFree').innerHTML = d.freeList.length ? d.freeList.map(c => `
      <tr data-go="containers">
        <td dir="ltr" style="text-align:right"><b>${esc(c.containerNo || '—')}</b></td>
        <td>${esc(c.serial)}</td>
        <td>${esc(c.state)}</td>
        <td>${esc(c.last)}</td>
        <td><span class="tag ${c.left < 0 ? 'bad' : c.left <= 3 ? 'wait' : 'gray'}">${c.left < 0 ? `متأخر ${-c.left} يوم` : c.left === 0 ? 'آخر يوم' : `باقي ${c.left} يوم`}</span></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="empty">ما فيه حاويات قريبة من نهاية فترة السماح.</td></tr>';

    // الوصول
    $('dbArrivals').innerHTML = d.arrivals.length ? d.arrivals.map(a => {
      const late = a.eta < d.today;
      return `
      <tr data-go="shipped">
        <td><b>${esc(a.serial)}</b></td>
        <td dir="ltr" style="text-align:right">${esc(a.invoiceNo)}</td>
        <td>${esc(a.poNo)}</td>
        <td>${esc(a.port)} ← ${esc(a.arrivalPort || '—')}</td>
        <td>${esc(a.eta)} ${late ? '<span class="tag bad">تجاوز الموعد</span>' : ''}</td>
        <td class="num">${num(a.atSea)} <span class="muted">من ${num(a.containers)}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">ما فيه وصول متوقع خلال 14 يوم.</td></tr>';

    bars('dbSuppliers', d.topSuppliers);
    bars('dbPorts', d.topPorts);
  }

  /** أعمدة أفقية بلون واحد (القيمة مكتوبة بجانب كل عمود) */
  function bars(id, list) {
    const max = Math.max(1, ...list.map(x => x.value));
    $(id).innerHTML = list.length ? list.map(x => `
      <div class="hbar" title="${esc(x.name)}: ${x.value} حاوية">
        <span class="hbar-name">${esc(x.name)}</span>
        <span class="hbar-track"><i style="width:${Math.max(2, x.value / max * 100)}%"></i></span>
        <b class="num">${num(x.value)}</b>
      </div>`).join('') : '<p class="sub" style="padding:8px 0">لا توجد شحنات معمّدة بعد.</p>';
  }
})();
