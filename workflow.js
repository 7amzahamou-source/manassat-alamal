/**
 * صفحة: خريطة سير العمل (تظهر لكل الموظفين من زر «سير العمل» فوق)
 * كل خطوة مربوطة بصفحتها: إذا عند الموظف صلاحيتها تتعلّم «من صلاحيتك» ويقدر يضغطها.
 */
(function () {
  const PHASES = [
    {
      title: 'المشتريات', color: 'p1',
      steps: [
        { page: 'models', need: 'edit', icon: 'models', title: 'تسجيل الموديل', who: 'قاعدة الموديلات',
          what: 'مرة وحدة لكل موديل: المصنع، العلامة، الكمية في الحاوية، شهادة SASO.',
          out: 'بياناته تتعبّى تلقائيًا في أوامر الشراء' },
        { page: 'orders', need: 'edit', icon: 'order', title: 'إدخال أمر الشراء', who: 'أوامر الشراء',
          what: 'رقم الأمر، القسم، المورد، شرط التسليم (FOB / CFR / EXW…)، موانئ الشحن (ميناء أو أكثر)، والبنود (الموديل والكمية والسعر).',
          out: 'الأمر يصير «بانتظار الاعتماد»' },
        { page: 'orders', need: 'full', icon: 'approve', title: 'اعتماد الأمر', who: 'أوامر الشراء (صلاحية كاملة)',
          what: 'مراجعة الأمر واعتماده.', gate: 'ما ينطلب شحن من أمر غير معتمد',
          out: 'الأمر «معتمد» ومتاح للشحن' },
        { lc: true, page: 'lcs', need: 'edit', icon: 'bank', title: 'فتح الاعتماد البنكي', who: 'الاعتمادات البنكية',
          what: 'إذا طريقة الدفع L/C: رقم الاعتماد، البنك، المبلغ، شرط التسليم (ينسحب تلقائيًا من أمر الشراء)، نوع الدفع (اطلاع / آجل)، آخر موعد شحن، الصلاحية، وربطه بأمر شراء أو أكثر — والأمر ممكن يتوزع على أكثر من اعتماد. أي تمديد أو زيادة مبلغ تُسجّل «تعديل».',
          out: 'رصيد متاح يغطي الأمر ويظهر في نافذة الشحن' }
      ]
    },
    {
      title: 'التصنيع والشحن', color: 'p2',
      steps: [
        { page: 'shipments', need: 'edit', icon: 'request', title: 'طلب الشحن', who: 'طلبات الشحن',
          what: 'من أمر معتمد: الكمية لكل موديل (بحث، زر «الكل»، تعبئة بعدد الحاويات، أو لصق من Excel)، رقم الفاتورة، ميناء التحميل (يقترح موانئ الأمر)، تاريخ الجاهزية.',
          out: '«قيد التصنيع» ثم «جاهزة للشحن» تلقائيًا حسب التاريخ' },
        { page: 'shipments', need: 'edit', icon: 'inspect', title: 'فحص ما قبل الشحن', who: 'طلبات الشحن',
          what: 'تسجيل نتيجة الفحص والجهة (مجتاز / مرفوض / معفى).',
          gate: 'ما يتعمّد الشحن إلا بفحص «مجتاز» أو «معفى»' },
        { page: 'shipments', need: 'full', icon: 'ship', title: 'تعميد الشحن', who: 'طلبات الشحن (صلاحية كاملة)',
          what: 'تاريخ الشحن، ميناء الوصول، رقم اعتماد الشحن، فترة السماح — ولأوامر L/C اختيار الاعتماد البنكي.',
          gate: 'كل الحقول مطلوبة + لأوامر L/C: اعتماد ساري، الشحن قبل آخر موعد فيه، ورصيده يكفي قيمة الشحنة',
          out: 'رقم تسلسل + سطور الحاويات تنعمل تلقائيًا' }
      ]
    },
    {
      title: 'الوصول والتخليص', color: 'p3',
      steps: [
        { page: 'shipped', need: 'edit', icon: 'track', title: 'متابعة الشحنة', who: 'البضاعة المشحونة',
          what: 'الوصول المتوقع، الوسيط، المخلص الجمركي.', out: 'تظهر في «الوصول خلال 14 يوم»' },
        { lc: true, page: 'lcs', need: 'edit', icon: 'docs', title: 'تقديم المستندات للبنك', who: 'الاعتمادات البنكية',
          what: 'بعد التعميد: تسجيل تقديم مستندات الشحنة ومبلغها، والملاحظات (Discrepancies) إن وجدت، ثم القبول أو الرفض.',
          gate: 'المستندات اللي عليها ملاحظات تظهر تنبيه أحمر في لوحة الإدارة',
          out: 'عند القبول يتحدد الاستحقاق: اطلاع = فورًا، آجل = تاريخ الشحن + أيام الآجل' },
        { page: 'containers', need: 'edit', icon: 'containers', title: 'أرقام الحاويات والتفريغ', who: 'متابعة الحاويات',
          what: 'رقم كل حاوية وتاريخ تفريغها.',
          out: 'يبدأ عدّ فترة السماح: آخر يوم = التفريغ + فترة السماح' },
        { page: 'containers', need: 'edit', icon: 'stamp', title: 'البيان الجمركي', who: 'متابعة الحاويات + ملفات الشحنات',
          what: 'رقم البيان لكل حاوية (فيه تعديل جماعي)، ثم تاريخ البيان والفسح في ملف الشحنة.',
          out: 'الملف «مفسوحة جزئيًا» ثم «مفسوحة»' }
      ]
    },
    {
      title: 'الاستلام والإقفال', color: 'p4',
      steps: [
        { page: 'receive', need: 'edit', icon: 'receive', title: 'الاستلام بالمستودع', who: 'استلام الحاويات',
          what: 'البحث برقم الحاوية، وتسجيل التاريخ والكمية المستلمة والمستودع.',
          out: 'الحاوية «استلمت»' },
        { page: 'containers', need: 'edit', icon: 'return', title: 'إرجاع الفارغ', who: 'متابعة الحاويات',
          what: 'تاريخ إرجاع الحاوية الفارغة.',
          gate: 'بعد آخر يوم مجاني تبدأ الأرضيات' },
        { lc: true, page: 'lcs', need: 'edit', icon: 'pay', title: 'سداد الاعتماد', who: 'الاعتمادات البنكية',
          what: 'تسجيل تاريخ ومبلغ السداد لكل تقديم، والمصاريف البنكية، ثم إقفال الاعتماد.',
          gate: 'ما يتقفل الاعتماد إلا بعد سداد أو رفض كل المستندات المقدمة',
          out: 'الاعتماد «مقفل» ✓' },
        { page: 'files', need: 'full', icon: 'lock', title: 'إقفال ملف الشحنة', who: 'ملفات الشحنات (صلاحية كاملة)',
          what: 'المستندات، التكاليف، التكلفة الواصلة لكل موديل.',
          gate: 'بيان مفسوح لكل حاوية + كل الحاويات مستلمة + ما فيه مطالبة مفتوحة',
          out: 'الملف «مقفل» ✓' }
      ]
    }
  ];

  /** أيقونات الرسم التوضيحي (مسارات SVG على شبكة 24×24) */
  const ART_ICONS = {
    models: 'M12 2l9 5-9 5-9-5z M3 12l9 5 9-5 M3 17l9 5 9-5',
    order: 'M6 2h9l5 5v15H6z M14 2v6h6 M9 13h7 M9 17h5',
    approve: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M8.5 12.5l2.5 2.5 4.5-5',
    request: 'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
    inspect: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M21 21l-5.2-5.2',
    ship: 'M2 20h20 M4 17l-1-5h18l-2 5 M8 12V7h8v5 M12 4v3',
    track: 'M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z M12 9a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
    containers: 'M2 7h20v13H2z M6 7v13 M10 7v13 M14 7v13 M18 7v13',
    stamp: 'M9 3h6v5l3 4H6l3-4z M5 15h14v3H5z M4 21h16',
    receive: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    return: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2',
    bank: 'M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18',
    docs: 'M8 3h8l4 4v12H8z M15 3v5h5 M4 7v14h11 M11 12h6 M11 15h4',
    pay: 'M2 6h20v12H2z M2 10h20 M6 15h4'
  };
  const PHASE_VAR = { p1: '--ph1', p2: '--ph2', p3: '--ph3', p4: '--ph4' };
  const VIEW_KEY = 'wf-view';
  let artSteps = [];     // الخطوات مسطّحة مع مرحلتها
  let artSel = -1;

  registerPage({ key: 'workflow', title: 'خريطة سير العمل', icon: ICONS.workflow, everyone: true, init, show });

  function init() {
    document.querySelectorAll('#page-workflow .seg [data-view]').forEach(b =>
      b.addEventListener('click', () => setView(b.dataset.view)));
    $('wfArt').addEventListener('click', e => {
      const n = e.target.closest('[data-step]');
      if (n) selectStep(Number(n.dataset.step));
    });
    $('wfArt').addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.step) {
        e.preventDefault();
        selectStep(Number(e.target.dataset.step));
      }
    });
    $('wfArtInfo').addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (b && can(b.dataset.go, 'view')) goTo(b.dataset.go);
    });
    let rz;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => { if (!$('page-workflow').classList.contains('hide') && !$('wfArtView').classList.contains('hide')) drawArt(); }, 150);
    });
    $('wfMap').addEventListener('click', e => {
      const el = e.target.closest('[data-go]');
      if (el && can(el.dataset.go, 'view')) goTo(el.dataset.go);
    });
    $('wfBackBtn').addEventListener('click', () => {
      const list = myPages();
      if (lastPage && can(lastPage, 'view')) return goTo(lastPage);
      if (list.length) return goTo(list[0].key);
      $('page-workflow').classList.add('hide');
      $('noAccess').classList.remove('hide');
    });
  }

  /* ===== التبويب: رسم توضيحي / تفاصيل ===== */

  function setView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* المتصفح يمنع التخزين */ }
    $('wfArtView').classList.toggle('hide', v !== 'art');
    $('wfMapView').classList.toggle('hide', v !== 'map');
    document.querySelectorAll('#page-workflow .seg [data-view]').forEach(b => {
      b.classList.toggle('on', b.dataset.view === v);
      b.setAttribute('aria-selected', b.dataset.view === v);
    });
    if (v === 'art') drawArt();
  }

  /* ===== الرسم التوضيحي (SmartArt) ===== */

  /** مسار متعرّج: الصف الأول من اليمين لليسار، والثاني من اليسار لليمين… */
  function drawArt() {
    artSteps = [];
    PHASES.forEach((ph, pi) => ph.steps.forEach(st => artSteps.push({ ...st, phase: ph, pi })));

    // شريط المراحل (أسهم)
    $('wfChevrons').innerHTML = PHASES.map((ph, i) =>
      `<li class="chev ${ph.color}"><b>${i + 1}. ${ph.title}</b><span>${ph.steps.length} خطوات</span></li>`).join('');

    const box = $('wfArt');
    const narrow = box.clientWidth < 720;
    const cols = narrow ? 1 : 4;
    const W = narrow ? 360 : 1000;
    const rowH = narrow ? 104 : 210;
    const top = narrow ? 30 : 36;
    const r = narrow ? 26 : 34;
    const n = artSteps.length;
    const rows = Math.ceil(n / cols);
    const H = top + rows * rowH + (narrow ? 10 : 0);
    const colW = W / cols;

    const pos = artSteps.map((st, i) => {
      const row = Math.floor(i / cols);
      let c = i % cols;
      if (row % 2 === 1) c = cols - 1 - c;              // الصفوف الزوجية تمشي بالعكس
      const x = narrow ? W - 46 : W - colW * (c + 0.5); // RTL: نبدأ من اليمين
      const y = top + row * rowH + (narrow ? rowH / 2 : 60);
      return { x, y, row };
    });

    // الطريق: خطوط مستقيمة + انعطافات نصف دائرية بين الصفوف
    let d = '';
    if (narrow) {
      d = `M ${pos[0].x} ${pos[0].y - 40} L ${pos[n - 1].x} ${pos[n - 1].y + 34}`;
    } else {
      const startX = Math.min(W - 8, pos[0].x + colW / 2 - 6);
      d = `M ${startX} ${pos[0].y}`;
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        if (i > 0 && p.row !== pos[i - 1].row) {
          const q = pos[i - 1];
          const rad = (p.y - q.y) / 2;
          const leftTurn = q.row % 2 === 0;               // نهاية الصف الأول على اليسار
          d += ` A ${rad} ${rad} 0 0 ${leftTurn ? 0 : 1} ${p.x} ${p.y}`;
        } else {
          d += ` L ${p.x} ${p.y}`;
        }
      }
      const last = pos[n - 1];
      d += ` L ${last.row % 2 === 0 ? Math.max(8, last.x - colW / 2 + 6) : Math.min(W - 8, last.x + colW / 2 - 6)} ${last.y}`;
    }

    const nodes = artSteps.map((st, i) => {
      const p = pos[i];
      const mine = can(st.page, st.need);
      const col = `var(${PHASE_VAR[st.phase.color]})`;
      const lx = narrow ? p.x - r - 14 : p.x;
      const ly = narrow ? p.y - 4 : p.y + r + 26;
      const anchor = narrow ? 'start' : 'middle';
      return `
      <g class="node ${mine ? 'mine' : ''} ${st.lc ? 'lc' : ''} ${artSel === i ? 'sel' : ''}" data-step="${i}" tabindex="0" role="button"
         aria-label="${i + 1}. ${esc(st.title)}${st.lc ? ' (عند الدفع باعتماد بنكي)' : ''}${mine ? '، من صلاحيتك' : ''}">
        <title>${esc(st.title)}: ${esc(st.what)}</title>
        <rect class="hit" x="${narrow ? 4 : p.x - colW / 2 + 6}" y="${narrow ? p.y - rowH / 2 + 4 : p.y - r - 14}" width="${narrow ? W - 8 : colW - 12}" height="${narrow ? rowH - 8 : r * 2 + 92}" rx="14"/>
        <circle class="halo" cx="${p.x}" cy="${p.y}" r="${r + 9}"/>
        <circle class="dot" cx="${p.x}" cy="${p.y}" r="${r}" style="fill:${col}"/>
        <g transform="translate(${p.x - (narrow ? 10 : 13)} ${p.y - (narrow ? 10 : 13)}) scale(${narrow ? 0.85 : 1.08})">
          <path class="ico" d="${ART_ICONS[st.icon] || ''}"/>
        </g>
        <circle class="no-bg" cx="${p.x + r * 0.72}" cy="${p.y - r * 0.72}" r="${narrow ? 10 : 12}"/>
        <text class="no" x="${p.x + r * 0.72}" y="${p.y - r * 0.72 + 4}" text-anchor="middle">${i + 1}</text>
        ${st.gate ? `<g class="gate"><rect x="${p.x - r * 0.72 - 9}" y="${p.y - r * 0.72 - 9}" width="18" height="18" rx="4" transform="rotate(45 ${p.x - r * 0.72} ${p.y - r * 0.72})"/><text x="${p.x - r * 0.72}" y="${p.y - r * 0.72 + 5}" text-anchor="middle">!</text></g>` : ''}
        ${st.lc ? `<g class="lc-pill"><rect x="${p.x + r * 0.72 - 17}" y="${p.y + r * 0.72 - 9}" width="34" height="18" rx="9"/><text x="${p.x + r * 0.72}" y="${p.y + r * 0.72 + 4}" text-anchor="middle">L/C</text></g>` : ''}
        <text class="t1" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(st.title)}</text>
        <text class="t2" x="${lx}" y="${ly + (narrow ? 19 : 20)}" text-anchor="${anchor}">${esc(st.who)}</text>
        ${mine && !narrow ? `<text class="t3" x="${lx}" y="${ly + 40}" text-anchor="middle">✓ من صلاحيتك</text>` : ''}
      </g>`;
    }).join('');

    const first = pos[0], last = pos[n - 1];
    const flags = narrow ? '' : `
      <g class="flag"><circle cx="${Math.min(W - 14, first.x + colW / 2 - 6)}" cy="${first.y}" r="7"/><text x="${Math.min(W - 14, first.x + colW / 2 - 6)}" y="${first.y - 16}" text-anchor="middle">البداية</text></g>
      <g class="flag end"><circle cx="${last.row % 2 === 0 ? Math.max(14, last.x - colW / 2 + 6) : Math.min(W - 14, last.x + colW / 2 - 6)}" cy="${last.y}" r="9"/><text x="${last.row % 2 === 0 ? Math.max(14, last.x - colW / 2 + 6) : Math.min(W - 14, last.x + colW / 2 - 6)}" y="${last.y - 18}" text-anchor="middle">مقفل ✓</text></g>`;

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="رسم توضيحي لسير العمل من تسجيل الموديل إلى إقفال ملف الشحنة، مع خطوات الاعتماد البنكي">
        <path class="road" d="${d}"/>
        <path class="road-dash" d="${d}"/>
        ${flags}
        ${nodes}
      </svg>`;
    if (artSel >= 0) selectStep(artSel, true);
    else $('wfArtInfo').innerHTML = '<p class="sub" style="margin:0">اختر خطوة من الرسم لعرض تفاصيلها.</p>';
  }

  function selectStep(i, keep) {
    const st = artSteps[i];
    if (!st) return;
    artSel = i;
    if (!keep) $('wfArt').querySelectorAll('.node').forEach(g => g.classList.toggle('sel', Number(g.dataset.step) === i));
    const mine = can(st.page, st.need);
    $('wfArtInfo').innerHTML = `
      <div class="ai-head">
        <span class="ai-no" style="background:var(${PHASE_VAR[st.phase.color]})">${i + 1}</span>
        <div><b>${esc(st.title)}${st.lc ? ' <span class="tag lc-tag">عند الدفع بـ L/C</span>' : ''}</b><small>${esc(st.phase.title)} — 📍 ${esc(st.who)}</small></div>
        ${mine && can(st.page, 'view') ? `<button type="button" class="btn primary small" data-go="${st.page}">فتح الصفحة</button>` : '<span class="tag gray">لقسم آخر</span>'}
      </div>
      <p>${esc(st.what)}</p>
      ${st.gate ? `<p class="wf-gate">⛔ ${esc(st.gate)}</p>` : ''}
      ${st.out ? `<p class="wf-out">← ${esc(st.out)}</p>` : ''}`;
  }

  function show() {
    let saved = 'art';
    try { saved = localStorage.getItem(VIEW_KEY) || 'art'; } catch (e) { /* افتراضي */ }
    let n = 0;
    $('wfMap').innerHTML = PHASES.map((ph, pi) => `
      <section class="wf-phase ${ph.color}">
        <header><span class="wf-phase-no">${pi + 1}</span><h2>${ph.title}</h2></header>
        ${ph.steps.map(st => {
          n++;
          const mine = can(st.page, st.need);
          return `
          <div class="wf-step ${mine ? 'mine' : ''} ${st.lc ? 'lc' : ''}" ${mine ? `data-go="${st.page}" role="button" tabindex="0"` : ''}>
            <div class="wf-top">
              <span class="wf-no">${n}</span>
              <b>${st.title}</b>
              ${st.lc ? '<span class="tag lc-tag">L/C</span>' : ''}
              ${mine ? '<span class="tag ok">من صلاحيتك</span>' : ''}
            </div>
            <p class="wf-who">📍 ${st.who}</p>
            <p class="wf-what">${st.what}</p>
            ${st.gate ? `<p class="wf-gate">⛔ ${st.gate}</p>` : ''}
            ${st.out ? `<p class="wf-out">← ${st.out}</p>` : ''}
          </div>`;
        }).join('<div class="wf-down" aria-hidden="true"></div>')}
      </section>`).join('<div class="wf-next" aria-hidden="true"><span>←</span></div>');
    setView(saved === 'map' ? 'map' : 'art');
  }

  // Enter على الخطوة يفتحها (للوحة المفاتيح)
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('.wf-step[data-go]')) e.target.click();
  });
})();
