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
    $('rtLatest').innerHTML = `<tr><td colspan="${2 + RATE_DESTS.length * 2}" class="empty">جارٍ التحميل…</td></tr>`;
    try {
      apply(await API.listRates());
    } catch (err) {
      $('rtLatest').innerHTML = `<tr><td colspan="${2 + RATE_DESTS.length * 2}" class="empty">${esc(err.message)}</td></tr>`;
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
      const prev = RATE_DESTS.map(([k, name]) => ({ k, name, v: lastBefore(p, k, date) }));
      const last = prev.filter(x => x.v).map(x => `${x.name} ${fmt(x.v.value)}`).join('، ');
      const lastDate = prev.map(x => x.v && x.v.date).filter(Boolean).sort().pop();
      return `<tr>
        <td dir="ltr" style="text-align:right">${esc(p)}</td>
        ${prev.map(x => `<td><input type="number" min="0" step="1" data-port="${esc(p)}" data-k="${x.k}" value="${cur[x.k] || ''}" placeholder="${x.v ? x.v.value : ''}"></td>`).join('')}
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
    Object.keys(typed).forEach(port => RATE_DESTS.forEach(([k]) => {
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
    const pts = rates.filter(r => r.prices[chartPort]).map(r => {
      const o = { date: r.date };
      RATE_DESTS.forEach(([k]) => { o[k] = r.prices[chartPort][k] || null; });
      return o;
    });
    const series = RATE_DESTS.filter(([k]) => pts.some(p => p[k]));
    const box = $('rtChart');
    if (!pts.length) {
      box.innerHTML = '<p class="sub" style="margin:8px 0">لا توجد أسعار مسجّلة بعد. أدخل أسعار اليوم من الأعلى وبيظهر الرسم هنا.</p>';
      return;
    }
    const W = 900, H = 270, L = 30, R = 76, T = 30, B = 34, IN = 28;
    const vals = pts.flatMap(p => series.map(([k]) => p[k])).filter(Boolean);
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
    // ملصقات نهاية الخطوط: مرتبة من الأعلى للأسفل ومتباعدة حتى ما تتداخل
    const endLabels = () => {
      const items = series.map(([k, name]) => {
        const i = lastIdx(k);
        return i < 0 ? null : { k, name, i, ly: y(pts[i][k]) };
      }).filter(Boolean).sort((a, b) => a.ly - b.ly);
      let prevY = -Infinity;
      return items.map((it, n) => {
        let ly = n === 0 ? it.ly - 10 : Math.max(it.ly + 18, prevY + 16);
        if (n === 0 && items.length > 1 && items[1].ly - it.ly < 14) ly = it.ly - 10;
        prevY = ly;
        return `<text x="${x(it.i)}" y="${ly}" text-anchor="middle" class="lbl">${it.name} ${fmt(pts[it.i][it.k])}</text>`;
      }).join('');
    };
    const step = Math.max(1, Math.ceil(pts.length / 6));
    box.innerHTML = `
      <div class="rt-legend">${series.map(([, name, v]) => `<span><i style="background:var(${v})"></i>${name}</span>`).join('')}<span>${esc(chartPort)}: ${pts.length} قراءة</span></div>
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
        ${series.map(([k, , v]) => `<path class="ln" stroke="var(${v})" d="${line(k)}"/>`).join('')}
        ${pts.map((p, i) => series.map(([k, , v]) => p[k] ? `<circle class="dot" cx="${x(i)}" cy="${y(p[k])}" r="4" fill="var(${v})"/>` : '').join('')).join('')}
        ${endLabels()}
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
      tip.style.top = (sv.top - bx.top + y(Math.max(...series.map(([k]) => p[k] || 0))) * sv.height / H) + 'px';
      tip.innerHTML = `<b>${p.date}</b>` + series.map(([k, name]) => `${name}: ${p[k] ? fmt(p[k]) : '—'}`).join('<br>');
      tip.style.display = '';
    });
    hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
  }

  /* ===== الجداول ===== */

  function drawLatest() {
    const out = {};
    rates.forEach(r => Object.keys(r.prices).forEach(p => RATE_DESTS.forEach(([k]) => {
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
        ${RATE_DESTS.map(([k]) => `<td class="num">${o[k] ? `<b>${fmt(o[k].value)}</b>` : '—'}</td><td>${chg(o[k])}</td>`).join('')}
        <td>${esc(RATE_DESTS.map(([k]) => o[k] && o[k].date).filter(Boolean).sort().pop())}</td></tr>`;
    }).join('') : `<tr><td colspan="${2 + RATE_DESTS.length * 2}" class="empty">لا توجد أسعار بعد.</td></tr>`;
  }

  function drawHistory() {
    const avg = (r, k) => {
      const v = Object.values(r.prices).map(x => x[k]).filter(Boolean);
      return v.length ? fmt(Math.round(v.reduce((a, b) => a + b, 0) / v.length)) : '—';
    };
    $('rtHist').innerHTML = rates.length ? rates.slice().reverse().map(r => `
      <tr data-date="${r.date}"><td><b>${r.date}</b></td><td class="num">${Object.keys(r.prices).length}</td>
      ${RATE_DESTS.map(([k]) => `<td class="num">${avg(r, k)}</td>`).join('')}<td>${esc(r.updatedBy)}</td></tr>`).join('')
      : `<tr><td colspan="${3 + RATE_DESTS.length}" class="empty">لا يوجد سجل بعد.</td></tr>`;
  }
})();
