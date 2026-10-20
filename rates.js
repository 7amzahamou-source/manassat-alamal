/**
 * صفحة: أسعار الشحن (إدخال يومي + رسم بياني + سجل)
 */
(function () {
  registerPage({ key: 'rates', title: 'أسعار الشحن', icon: ICONS.rates, levels: ['none', 'view', 'edit', 'full'], init, show });

  let rates = [];       // [{date, prices:{PORT:{dmm,jed}}, updatedBy}]
  let ports = [];
  let extraPorts = [];  // موانئ أضافها المستخدم في الإدخال الحالي
  let chartPort = '';

  const fmt = v => '$' + num(v);

  function init() {
    $('rtRefreshBtn').addEventListener('click', load);
    $('rt_date').addEventListener('change', fillEntry);
    $('rtSaveBtn').addEventListener('click', save);
    $('rtDeleteBtn').addEventListener('click', remove);
    $('rtAddPortBtn').addEventListener('click', addPort);
    $('rtNewPort').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPort(); } });
    $('rtIn').addEventListener('input', () => { $('rtError').textContent = ''; });
    $('rtChips').addEventListener('click', e => {
      const b = e.target.closest('[data-port]');
      if (!b) return;
      chartPort = b.dataset.port;
      drawChips();
      drawChart();
    });
    $('rtHist').addEventListener('click', e => {
      const row = e.target.closest('tr[data-date]');
      if (!row || !can('rates', 'edit')) return;
      $('rt_date').value = row.dataset.date;
      fillEntry();
      $('rtEntry').scrollIntoView({ behavior: 'smooth' });
    });
  }

  function show() {
    $('rtEntry').classList.toggle('hide', !can('rates', 'edit'));
    $('rt_date').value = today();
    $('rt_date').max = today();
    load();
  }

  async function load() {
    $('rtLatest').innerHTML = '<tr><td colspan="6" class="empty">جارٍ التحميل…</td></tr>';
    try {
      apply(await API.listRates());
    } catch (err) {
      $('rtLatest').innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function apply(r) {
    rates = r.rates || [];
    ports = r.ports || [];
    extraPorts = [];
    const counts = p => rates.filter(x => x.prices[p]).length;
    if (!chartPort || !counts(chartPort)) chartPort = ports.slice().sort((a, b) => counts(b) - counts(a))[0] || '';
    fillEntry();
    drawChips();
    drawChart();
    drawLatest();
    drawHistory();
  }

  /* ===== الإدخال ===== */

  /** آخر سعر مسجّل لميناء ووجهة قبل تاريخ معيّن */
  function lastBefore(port, key, date) {
    for (let i = rates.length - 1; i >= 0; i--) {
      const v = rates[i].date < date && rates[i].prices[port] && rates[i].prices[port][key];
      if (v) return { value: v, date: rates[i].date };
    }
    return null;
  }

  function fillEntry() {
    const date = $('rt_date').value || today();
    const rec = rates.find(r => r.date === date);
    const list = [...new Set(ports.concat(extraPorts))];
    $('rtNote').textContent = rec
      ? `فيه أسعار محفوظة لهذا اليوم (أدخلها ${rec.updatedBy}). أي تعديل يستبدلها.`
      : 'اترك الخانة فارغة إذا ما توفر سعر للميناء.';
    $('rtDeleteBtn').classList.toggle('hide', !rec || !can('rates', 'full'));
    $('rtIn').innerHTML = list.map(p => {
      const cur = (rec && rec.prices[p]) || {};
      const ld = lastBefore(p, 'dmm', date), lj = lastBefore(p, 'jed', date);
      const last = [ld && `الدمام ${fmt(ld.value)}`, lj && `جدة ${fmt(lj.value)}`].filter(Boolean).join(' — ');
      const lastDate = [ld && ld.date, lj && lj.date].filter(Boolean).sort().pop();
      return `<tr>
        <td dir="ltr" style="text-align:right">${esc(p)}</td>
        <td><input type="number" min="0" step="1" data-port="${esc(p)}" data-k="dmm" value="${cur.dmm || ''}" placeholder="${ld ? ld.value : ''}"></td>
        <td><input type="number" min="0" step="1" data-port="${esc(p)}" data-k="jed" value="${cur.jed || ''}" placeholder="${lj ? lj.value : ''}"></td>
        <td class="sub small">${last ? `${last} <span class="muted">(${lastDate})</span>` : '—'}</td>
      </tr>`;
    }).join('');
  }

  function addPort() {
    const p = $('rtNewPort').value.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!p) return;
    if (!ports.includes(p) && !extraPorts.includes(p)) extraPorts.push(p);
    $('rtNewPort').value = '';
    // نحافظ على الأرقام المكتوبة
    const typed = collect();
    fillEntry();
    Object.keys(typed).forEach(port => ['dmm', 'jed'].forEach(k => {
      const el = $('rtIn').querySelector(`[data-port="${CSS.escape(port)}"][data-k="${k}"]`);
      if (el && typed[port][k]) el.value = typed[port][k];
    }));
    const el = $('rtIn').querySelector(`[data-port="${CSS.escape(p)}"][data-k="dmm"]`);
    if (el) el.focus();
  }

  function collect() {
    const prices = {};
    $('rtIn').querySelectorAll('input[data-port]').forEach(el => {
      if (el.value === '') return;
      prices[el.dataset.port] = prices[el.dataset.port] || {};
      prices[el.dataset.port][el.dataset.k] = el.value;
    });
    return prices;
  }

  async function save() {
    const prices = collect();
    if (!Object.keys(prices).length) { $('rtError').textContent = 'أدخل سعرًا واحدًا على الأقل'; return; }
    const done = busy($('rtSaveBtn'), 'جارٍ الحفظ…');
    try {
      const r = await API.saveRates($('rt_date').value, prices);
      apply(r);
      toast(r.message);
    } catch (err) {
      $('rtError').textContent = err.message;
    } finally {
      done();
    }
  }

  async function remove() {
    const date = $('rt_date').value;
    if (!confirm('حذف أسعار يوم ' + date + '؟')) return;
    const done = busy($('rtDeleteBtn'), 'جارٍ الحذف…');
    try {
      const r = await API.deleteRates(date);
      apply(r);
      toast(r.message);
    } catch (err) {
      $('rtError').textContent = err.message;
    } finally {
      done();
    }
  }

  /* ===== الرسم البياني ===== */

  function drawChips() {
    const priced = ports.filter(p => rates.some(r => r.prices[p]));
    $('rtChips').innerHTML = priced.map(p =>
      `<button type="button" data-port="${esc(p)}" class="${p === chartPort ? 'on' : ''}" aria-pressed="${p === chartPort}">${esc(p)}</button>`).join('');
  }

  function drawChart() {
    const pts = rates.filter(r => r.prices[chartPort]).map(r => ({ date: r.date, dmm: r.prices[chartPort].dmm || null, jed: r.prices[chartPort].jed || null }));
    const box = $('rtChart');
    if (!pts.length) {
      box.innerHTML = '<p class="sub" style="margin:8px 0">لا توجد أسعار مسجّلة بعد. أدخل أسعار اليوم من الأعلى وبيظهر الرسم هنا.</p>';
      return;
    }
    const W = 900, H = 270, L = 30, R = 76, T = 30, B = 34, IN = 28;
    const vals = pts.flatMap(p => [p.dmm, p.jed]).filter(Boolean);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(50, (hi - lo) * 0.15);
    lo = Math.max(0, Math.floor((lo - pad) / 100) * 100);
    hi = Math.ceil((hi + pad) / 100) * 100;
    // RTL: الأقدم على اليمين والأحدث على اليسار
    const x = i => pts.length === 1 ? (L + W - R) / 2 : W - R - IN - i * (W - L - R - 2 * IN) / (pts.length - 1);
    const y = v => T + (hi - v) * (H - T - B) / (hi - lo || 1);
    const ticks = [0, 1, 2, 3, 4].map(k => lo + (hi - lo) * k / 4);
    const line = key => {
      const seg = pts.map((p, i) => p[key] ? `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}` : null);
      let d = '', pen = false;
      seg.forEach(s => { if (!s) { pen = false; return; } d += (pen ? ' L' : ' M') + s; pen = true; });
      return d.trim();
    };
    const lastIdx = key => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i][key]) return i; return -1; };
    const endLabel = (key, name, cls) => {
      const i = lastIdx(key);
      if (i < 0) return '';
      // فوق النقطة، وإذا الخطين متقاربين ينزل ملصق جدة تحت نقطته
      const other = pts[i][key === 'dmm' ? 'jed' : 'dmm'];
      const below = key === 'jed' && other && pts[i].jed <= other;
      return `<text x="${x(i)}" y="${y(pts[i][key]) + (below ? 20 : -10)}" text-anchor="middle" class="lbl ${cls}">${name} ${fmt(pts[i][key])}</text>`;
    };
    const step = Math.max(1, Math.ceil(pts.length / 6));
    box.innerHTML = `
      <div class="rt-legend"><span><i style="background:var(--s1)"></i>الدمام</span><span><i style="background:var(--s2)"></i>جدة</span><span>${esc(chartPort)} — ${pts.length} قراءة</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="تطور سعر الشحن من ${esc(chartPort)}">
        <style>
          .grid{stroke:var(--grid);stroke-width:1}
          .ax{fill:var(--mute);font-size:12px}
          .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
          .lbl{font-size:12px;font-weight:600;fill:var(--ink)}
          .dot{stroke:var(--panel);stroke-width:2}
        </style>
        ${ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${W - R + 10}" y="${y(t) + 4}" text-anchor="start" direction="ltr">$${num(t)}</text>`).join('')}
        ${pts.map((p, i) => i % step === 0 || i === pts.length - 1 ? `<text class="ax" x="${x(i)}" y="${H - 10}" text-anchor="middle">${p.date.slice(5)}</text>` : '').join('')}
        <path class="ln" stroke="var(--s1)" d="${line('dmm')}"/>
        <path class="ln" stroke="var(--s2)" d="${line('jed')}"/>
        ${pts.map((p, i) => (p.dmm ? `<circle class="dot" cx="${x(i)}" cy="${y(p.dmm)}" r="4" fill="var(--s1)"/>` : '') + (p.jed ? `<circle class="dot" cx="${x(i)}" cy="${y(p.jed)}" r="4" fill="var(--s2)"/>` : '')).join('')}
        ${endLabel('dmm', 'الدمام', '')}${endLabel('jed', 'جدة', '')}
        <line id="rtCross" class="grid" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none;stroke:var(--mute)"/>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="rtHit"/>
      </svg>
      <div id="rtTip" class="rt-tip" style="display:none"></div>`;
    box.classList.add('viz');

    // التلميح عند المرور: أقرب تاريخ
    const svg = box.querySelector('svg');
    const hit = $('rtHit'), tip = $('rtTip'), cross = $('rtCross');
    hit.addEventListener('mousemove', e => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const sx = pt.matrixTransform(svg.getScreenCTM().inverse()).x;
      let best = 0;
      pts.forEach((p, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
      const p = pts[best];
      cross.setAttribute('x1', x(best)); cross.setAttribute('x2', x(best)); cross.style.display = '';
      const bx = box.getBoundingClientRect(), sv = svg.getBoundingClientRect();
      tip.style.left = (sv.left - bx.left + x(best) * sv.width / W) + 'px';
      tip.style.top = (sv.top - bx.top + y(Math.max(p.dmm || 0, p.jed || 0)) * sv.height / H) + 'px';
      tip.innerHTML = `<b>${p.date}</b>الدمام: ${p.dmm ? fmt(p.dmm) : '—'}<br>جدة: ${p.jed ? fmt(p.jed) : '—'}`;
      tip.style.display = '';
    });
    hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
  }

  /* ===== الجداول ===== */

  function drawLatest() {
    const out = {};
    rates.forEach(r => Object.keys(r.prices).forEach(p => ['dmm', 'jed'].forEach(k => {
      const v = r.prices[p][k];
      if (!v) return;
      out[p] = out[p] || {};
      out[p][k] = { value: v, prev: out[p][k] ? out[p][k].value : null, date: r.date };
    })));
    const chg = c => {
      if (!c) return '—';
      if (c.prev == null) return '<span class="chg-same">أول سعر</span>';
      const d = c.value - c.prev;
      return d ? `<span class="${d > 0 ? 'chg-up' : 'chg-down'}">${d > 0 ? '▲ +' : '▼ '}${num(d)} (${d > 0 ? '+' : ''}${Math.round(d / c.prev * 1000) / 10}%)</span>` : '<span class="chg-same">بدون تغيير</span>';
    };
    const keys = Object.keys(out).sort();
    $('rtLastDate').textContent = rates.length ? 'آخر إدخال ' + rates[rates.length - 1].date : '';
    $('rtLatest').innerHTML = keys.length ? keys.map(p => {
      const o = out[p];
      return `<tr><td><b dir="ltr">${esc(p)}</b></td>
        <td class="num">${o.dmm ? `<b>${fmt(o.dmm.value)}</b>` : '—'}</td><td>${chg(o.dmm)}</td>
        <td class="num">${o.jed ? `<b>${fmt(o.jed.value)}</b>` : '—'}</td><td>${chg(o.jed)}</td>
        <td>${esc([o.dmm && o.dmm.date, o.jed && o.jed.date].filter(Boolean).sort().pop())}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">لا توجد أسعار بعد.</td></tr>';
  }

  function drawHistory() {
    const avg = (r, k) => {
      const v = Object.values(r.prices).map(x => x[k]).filter(Boolean);
      return v.length ? fmt(Math.round(v.reduce((a, b) => a + b, 0) / v.length)) : '—';
    };
    $('rtHist').innerHTML = rates.length ? rates.slice().reverse().map(r => `
      <tr data-date="${r.date}"><td><b>${r.date}</b></td><td class="num">${Object.keys(r.prices).length}</td>
      <td class="num">${avg(r, 'dmm')}</td><td class="num">${avg(r, 'jed')}</td><td>${esc(r.updatedBy)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">لا يوجد سجل بعد.</td></tr>';
  }
})();
