/**
 * صفحة: قاعدة الموديلات + الاستيراد من إكسل
 */
(function () {
  const FIELDS = ['code', 'department', 'factory', 'brand', 'description', 'unit', 'perContainer', 'cert', 'certNo', 'certExp', 'status'];
  const CERTS = ['لا تحتاج', 'غير مصدرة', 'قيد الإصدار', 'صادرة'];

  /** أعمدة الاستيراد: العنوان في النموذج + الكلمات اللي نتعرف عليها في سطر العناوين */
  const COLUMNS = [
    { key: 'code',         title: 'كود الموديل',          match: ['كود', 'الموديل', 'موديل', 'code', 'model'] },
    { key: 'department',   title: 'القسم',                 match: ['القسم', 'قسم', 'department', 'dept'] },
    { key: 'factory',      title: 'المصنع',                match: ['المصنع', 'مصنع', 'المورد', 'factory', 'supplier'] },
    { key: 'brand',        title: 'العلامة',               match: ['العلامة', 'علامة', 'الماركة', 'brand'] },
    { key: 'description',  title: 'الوصف',                 match: ['الوصف', 'وصف', 'description'] },
    { key: 'unit',         title: 'الوحدة',                match: ['الوحدة', 'وحدة', 'unit'] },
    { key: 'perContainer', title: 'الكمية في الحاوية',     match: ['الحاوية', 'حاوية', 'container', 'per container'] },
    { key: 'cert',         title: 'حالة الشهادة',          match: ['حالة الشهادة', 'الشهادة', 'cert', 'saso'] },
    { key: 'certNo',       title: 'رقم الشهادة',           match: ['رقم الشهادة', 'cert no', 'certificate no'] },
    { key: 'certExp',      title: 'تاريخ انتهاء الشهادة', match: ['انتهاء', 'expiry', 'exp'] }
  ];

  let models = [];
  let editing = null;
  let importRows = [];

  registerPage({
    key: 'models',
    title: 'قاعدة الموديلات',
    icon: ICONS.models,
    levels: ['none', 'view', 'edit', 'full'],
    init,
    show
  });

  const myDept = () => (isAdmin() ? '' : (currentUser.dept || ''));

  function init() {
    $('mFilterDept').innerHTML = options(DEPTS, 'كل الأقسام');
    $('m_department').innerHTML = options(DEPTS, 'كل الأقسام / عام');

    $('modelsRefreshBtn').addEventListener('click', load);
    $('newModelBtn').addEventListener('click', () => openModel(null));
    $('importBtn').addEventListener('click', openImport);
    ['mSearch', 'mFilterDept', 'mFilterCert', 'mFilterStatus'].forEach(id => $(id).addEventListener('input', render));
    $('modelsBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openModel(models.find(m => m.id === row.dataset.id));
    });

    $('modelForm').addEventListener('submit', save);
    $('modelForm').addEventListener('input', () => { $('mError').textContent = ''; updateCertTag(); });
    $('mDeleteBtn').addEventListener('click', remove);

    $('importText').addEventListener('input', parseImport);
    $('importRunBtn').addEventListener('click', runImport);
    $('templateBtn').addEventListener('click', downloadTemplate);
  }

  function show() {
    const dept = myDept();
    $('newModelBtn').classList.toggle('hide', !can('models', 'edit'));
    $('importBtn').classList.toggle('hide', !can('models', 'edit'));
    $('mFilterDept').classList.toggle('hide', !!dept);
    $('mFilterDept').value = '';
    load();
  }

  async function load() {
    models = [];
    $('modelStats').innerHTML = '';
    $('modelsBody').innerHTML = '<tr><td colspan="9" class="empty">جارٍ تحميل الموديلات…</td></tr>';
    try {
      const result = await API.listModels();
      models = result.models || [];
      render();
    } catch (err) {
      $('modelsBody').innerHTML = `<tr><td colspan="9" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function filtered() {
    const q = $('mSearch').value.trim().toLowerCase();
    const dept = $('mFilterDept').value;
    const cert = $('mFilterCert').value;
    const status = $('mFilterStatus').value;
    return models.filter(m => {
      const c = certInfo(m);
      return (!q || [m.code, m.factory, m.brand, m.description].join(' ').toLowerCase().includes(q)) &&
        (!dept || m.department === dept) &&
        (!status || m.status === status) &&
        (!cert || (cert === 'attention' ? c.attention : c.key === cert));
    });
  }

  function render() {
    const list = filtered();
    const active = models.filter(m => m.status !== 'غير فعال');

    $('modelStats').innerHTML = [
      ['عدد الموديلات', models.length],
      ['فعّالة', active.length],
      ['شهادات تحتاج متابعة', active.filter(m => certInfo(m).attention).length],
      ['بدون كمية حاوية', active.filter(m => !m.perContainer).length]
    ].map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join('');

    if (!list.length) {
      const msg = models.length ? 'لا توجد موديلات مطابقة.'
        : can('models', 'edit') ? 'القاعدة فارغة. أضف موديل أو استورد قائمتك من إكسل.' : 'لا توجد موديلات بعد.';
      $('modelsBody').innerHTML = `<tr><td colspan="9" class="empty">${msg}</td></tr>`;
      return;
    }

    $('modelsBody').innerHTML = list.map(m => {
      const c = certInfo(m);
      return `
      <tr data-id="${esc(m.id)}">
        <td><b dir="ltr">${esc(m.code)}</b></td>
        <td>${esc(m.department || 'عام')}</td>
        <td>${esc(m.factory || '—')}</td>
        <td>${esc(m.brand || '—')}</td>
        <td class="desc">${esc(m.description || '—')}</td>
        <td>${esc(m.unit)}</td>
        <td class="num">${m.perContainer ? num(m.perContainer) : '—'}</td>
        <td><span class="tag ${c.cls}">${esc(c.label)}</span></td>
        <td><span class="tag ${m.status === 'غير فعال' ? 'gray' : 'ok'}">${esc(m.status)}</span></td>
      </tr>`;
    }).join('');
  }

  /* ===== نافذة الموديل ===== */

  function openModel(model) {
    editing = model || null;
    const dept = myDept();
    const m = model || { unit: 'قطعة', cert: 'لا تحتاج', status: 'فعال', department: dept };
    const readOnly = !can('models', 'edit');

    $('mTitle').textContent = model ? 'الموديل ' + model.code : 'موديل جديد';
    FIELDS.forEach(f => { $('m_' + f).value = m[f] ?? ''; });
    if (!m.perContainer) $('m_perContainer').value = '';

    document.querySelectorAll('#modelForm input, #modelForm select').forEach(el => { el.disabled = readOnly; });
    if (dept) $('m_department').disabled = true;

    $('mSaveBtn').classList.toggle('hide', readOnly);
    $('mDeleteBtn').classList.toggle('hide', !(model && can('models', 'full')));
    $('mMeta').textContent = model ? `أضافه ${model.createdBy} في ${model.createdAt} — آخر تعديل: ${model.updatedBy} في ${model.updatedAt}` : '';
    $('mError').textContent = '';
    updateCertTag();
    $('modelDialog').showModal();
    if (!readOnly && !model) $('m_code').focus();
  }

  function updateCertTag() {
    const c = certInfo({ cert: $('m_cert').value, certExp: $('m_certExp').value });
    $('mCertTag').innerHTML = `<span class="tag ${c.cls}">${esc(c.label)}</span>`;
  }

  async function save(event) {
    event.preventDefault();
    const model = { id: editing ? editing.id : '' };
    FIELDS.forEach(f => { model[f] = $('m_' + f).value; });
    const done = busy($('mSaveBtn'), 'جارٍ الحفظ…');
    try {
      const result = await API.saveModel(model);
      models = models.filter(m => m.id !== result.model.id).concat(result.model)
        .sort((a, b) => a.code.localeCompare(b.code));
      render();
      $('modelDialog').close();
      toast(result.message);
    } catch (err) {
      $('mError').textContent = err.message;
    } finally {
      done();
    }
  }

  async function remove() {
    if (!editing || !confirm('حذف الموديل ' + editing.code + ' نهائيًا؟\nإذا ما عاد يُستخدم، الأفضل تغيّر حالته إلى «غير فعال».')) return;
    const done = busy($('mDeleteBtn'), 'جارٍ الحذف…');
    try {
      const result = await API.deleteModel(editing.id);
      models = models.filter(m => m.id !== editing.id);
      render();
      $('modelDialog').close();
      toast(result.message);
    } catch (err) {
      $('mError').textContent = err.message;
    } finally {
      done();
    }
  }

  /* ===== الاستيراد من إكسل ===== */

  function openImport() {
    $('importText').value = '';
    importRows = [];
    $('importHead').innerHTML = '';
    $('importBody').innerHTML = '';
    $('importSummary').classList.add('hide');
    $('importError').textContent = '';
    $('importRunBtn').disabled = true;
    $('importRunBtn').textContent = 'استيراد';
    $('importDialog').showModal();
    $('importText').focus();
  }

  /** يحوّل التاريخ إلى yyyy-mm-dd (يقبل 2027-05-31 و 31/05/2027 و 31-05-2027) */
  function normDate(v) {
    v = String(v || '').trim();
    if (!v) return '';
    let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return v;   // يرفضه الخادم برسالة واضحة
  }

  /** يتعرف على الأعمدة من سطر العناوين، أو يعتمد ترتيب النموذج */
  function mapColumns(header) {
    const cells = header.map(h => String(h).trim().toLowerCase());
    const map = {};
    // الأعمدة الأدق أولًا (رقم الشهادة، حالة الشهادة) قبل العامة (الشهادة، الموديل)
    const ordered = COLUMNS.slice().sort((a, b) => Math.max(...b.match.map(x => x.length)) - Math.max(...a.match.map(x => x.length)));
    ordered.forEach(col => {
      const i = cells.findIndex((c, idx) => !Object.values(map).includes(idx) && col.match.some(w => c === w.toLowerCase()));
      const j = i >= 0 ? i : cells.findIndex((c, idx) => !Object.values(map).includes(idx) && col.match.some(w => c.includes(w.toLowerCase())));
      if (j >= 0) map[col.key] = j;
    });
    return map;
  }

  function parseImport() {
    $('importError').textContent = '';
    const lines = $('importText').value.split(/\r?\n/).filter(l => l.trim());
    importRows = [];
    if (!lines.length) {
      $('importHead').innerHTML = '';
      $('importBody').innerHTML = '';
      $('importSummary').classList.add('hide');
      $('importRunBtn').disabled = true;
      return;
    }

    const table = lines.map(l => l.split('\t'));
    let map = mapColumns(table[0]);
    let body = table.slice(1);
    let firstRow = 2;
    if (map.code === undefined) {
      // بدون سطر عناوين: نعتمد ترتيب النموذج
      map = {};
      COLUMNS.forEach((c, i) => { map[c.key] = i; });
      body = table;
      firstRow = 1;
    }

    const existing = {};
    models.forEach(m => { existing[m.code.toLowerCase()] = true; });
    const seen = {};
    const dept = myDept();

    importRows = body.map((cells, n) => {
      const r = { row: n + firstRow };
      COLUMNS.forEach(c => { r[c.key] = map[c.key] !== undefined ? String(cells[map[c.key]] || '').trim() : ''; });
      r.perContainer = r.perContainer.replace(/,/g, '');
      r.certExp = normDate(r.certExp);
      r.cert = r.cert || 'لا تحتاج';
      r.unit = r.unit || 'قطعة';
      if (dept) r.department = dept;

      const problems = [];
      if (!r.code) problems.push('بدون كود');
      if (r.perContainer && !(Number(r.perContainer) >= 0)) problems.push('كمية الحاوية غير رقم');
      if (!CERTS.includes(r.cert)) problems.push('حالة شهادة غير معروفة');
      if (r.certExp && !/^\d{4}-\d{2}-\d{2}$/.test(r.certExp)) problems.push('تاريخ غير مفهوم');
      if (r.department && !DEPTS.includes(r.department)) problems.push('قسم غير معروف');
      const key = r.code.toLowerCase();
      if (r.code && seen[key]) problems.push('مكرر في الملف (يُعتمد الأخير)');
      seen[key] = true;

      r._problems = problems;
      r._fatal = problems.some(p => p !== 'مكرر في الملف (يُعتمد الأخير)' && p !== 'قسم غير معروف');
      r._isNew = !existing[key];
      return r;
    });

    const ok = importRows.filter(r => !r._fatal);
    const newCount = ok.filter(r => r._isNew && !ok.some(x => x !== r && x.code.toLowerCase() === r.code.toLowerCase() && x.row < r.row)).length;
    const updCount = ok.filter(r => !r._isNew).length;
    const bad = importRows.length - ok.length;

    $('importSummary').classList.remove('hide');
    $('importSummary').innerHTML =
      `<span class="tag">${importRows.length} سطر</span>` +
      `<span class="tag ok">${newCount} موديل جديد</span>` +
      `<span class="tag wait">${updCount} يتحدّث</span>` +
      (bad ? `<span class="tag bad">${bad} فيه خطأ وما بيُستورد</span>` : '');

    $('importHead').innerHTML = '<tr><th>#</th>' + COLUMNS.map(c => `<th>${c.title}</th>`).join('') + '<th>ملاحظة</th></tr>';
    $('importBody').innerHTML = importRows.slice(0, 300).map(r => `
      <tr class="${r._fatal ? 'bad' : ''}">
        <td>${r.row}</td>
        ${COLUMNS.map(c => `<td>${esc(r[c.key])}</td>`).join('')}
        <td>${r._problems.length ? esc(r._problems.join('، ')) : (r._isNew ? 'جديد' : 'تحديث')}</td>
      </tr>`).join('') +
      (importRows.length > 300 ? `<tr><td colspan="${COLUMNS.length + 2}" class="empty">و ${importRows.length - 300} سطر آخر…</td></tr>` : '');

    const unique = new Set(ok.map(r => r.code.toLowerCase())).size;
    $('importRunBtn').disabled = !ok.length;
    $('importRunBtn').textContent = ok.length ? `استيراد ${unique} موديل` : 'استيراد';
  }

  async function runImport() {
    const rows = importRows.filter(r => !r._fatal).map(r => {
      const o = { row: r.row };
      COLUMNS.forEach(c => { o[c.key] = r[c.key]; });
      return o;
    });
    if (!rows.length) return;
    const done = busy($('importRunBtn'), 'جارٍ الاستيراد…');
    try {
      const result = await API.importModels(rows);
      $('importDialog').close();
      await load();
      const msg = `تم الاستيراد: ${result.added} جديد، ${result.updated} تحديث` + (result.errors.length ? `، ${result.errors.length} سطر مرفوض` : '');
      toast(msg);
      if (result.errors.length) {
        alert(msg + '\n\nالسطور المرفوضة:\n' + result.errors.slice(0, 20).map(e => `سطر ${e.row}: ${e.message}`).join('\n'));
      }
    } catch (err) {
      $('importError').textContent = err.message;
      done();
    }
  }

  /** نموذج CSV يفتح في الإكسل بالعربي */
  function downloadTemplate() {
    const rows = [
      COLUMNS.map(c => c.title),
      ['GWC-18', 'قسم التكييف', 'GREE', 'Basic', 'مكيف سبليت 18000 وحدة', 'قطعة', '120', 'صادرة', 'SASO-123456', '2027-05-31'],
      ['BAT-100', 'قسم البطاريات', 'CATL', 'Basic', 'بطارية 100 أمبير', 'قطعة', '900', 'لا تحتاج', '', '']
    ];
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'نموذج-الموديلات.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
})();
