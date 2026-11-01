/**
 * صفحة: استيراد البيانات من Excel (للمدير فقط)
 * يقرأ ملف «الشحنات + أوامر الشراء» وملف «الاعتمادات البنكية» داخل المتصفح (بدون أي مكتبة خارجية)،
 * ينظّفها ويعرض معاينة ومشاكل، وبعد التأكيد يرسلها للخادم: الموجود يتحدّث والجديد ينضاف.
 */
(function () {
  /* ===== جداول الربط (بالعربي) ===== */
  const DEPT_MAP = {
    'AC': 'قسم التكييف', 'AC FACTORY': 'قسم مصنع التكييف', 'HOME APP': 'قسم الأجهزة المنزلية',
    'SOLAR': 'قسم الطاقة الشمسية', 'HIMEL': 'قسم مصنع قواطع الكهرباء', 'HIMEL FACTORY': 'قسم مصنع قواطع الكهرباء',
    'PIONEER': 'قسم البطاريات', 'MAXEL': 'قسم البطاريات', 'MAXELL': 'قسم البطاريات',
    'قسم التكييف': 'قسم التكييف', 'قسم الاجهزة المنزلية': 'قسم الأجهزة المنزلية', 'قسم الأجهزة المنزلية': 'قسم الأجهزة المنزلية',
    'مصنع تكييف': 'قسم مصنع التكييف', 'قسم الطاقة الشمسية': 'قسم الطاقة الشمسية',
    'قسم البطاريات وبايونير': 'قسم البطاريات', 'قسم البطاريات': 'قسم البطاريات'
  };
  const BANK_MAP = {
    'RIYAD': 'بنك الرياض', 'SNB': 'البنك الأهلي السعودي', 'SAB': 'البنك السعودي الأول (ساب)', 'SABB': 'البنك السعودي الأول (ساب)',
    'BILAD': 'بنك البلاد', 'GIB': 'بنك الخليج الدولي', 'ALRAJHI': 'مصرف الراجحي', 'RAJHI': 'مصرف الراجحي',
    'ANB': 'البنك العربي الوطني', 'BSF': 'البنك السعودي الفرنسي', 'ALINMA': 'مصرف الإنماء', 'JAZIRA': 'بنك الجزيرة', 'SAIB': 'بنك الاستثمار'
  };
  const ARRIVAL_MAP = { 'DAM': 'الدمام', 'DMM': 'الدمام', 'DAMMAM': 'الدمام', 'JED': 'جدة', 'JEDDAH': 'جدة',
    'KING ABDULLAH': 'رابغ', 'KAP': 'رابغ', 'RABIGH': 'رابغ', 'JUBAIL': 'الجبيل' };
  const INSURERS = { 'WALAA': 'ولاء', 'WATANIYA': 'الوطنية', 'CIF': 'CIF (على المورد)' };

  // أعمدة الملفات (الاسم في Excel ← المفتاح)
  const SHIP_COLS = { pi: 'P I', factory: 'FACTORY', invoice: 'C/I No', desc: 'Descriptions', model: 'MODEL', qty: 'QTY', hq: 'HQ',
    ready: 'READY DATE', forwarder: 'FORWARDER', shipDate: 'SHIPPED ON', eta: 'وصول متوقع', entry: 'ENTRY', docs: 'وجود مستند',
    vessel: 'الباخرة', decl: 'بيان جمركي', line: 'وكيل الشحن', duty: 'رسوم جمركية', insurer: 'شركة التأمين', hbl: 'HBL', mbl: 'MBL',
    value: 'قيمة البضاعة', bankDocs: 'مستندات البنك', received: 'تاريخ الاستلام', lcNo: 'رقم الاعتماد البنكي', broker: 'المخلص الجمركي',
    arrival: 'ميناء الوصول', port: 'ميناء الشحن', dept: 'القسم' };
  const PO_COLS = { pi: 'OrderID / PI NO', date: 'PO/PI Date', factory: 'Factory', supplier: 'Supplier', dept: 'Dep',
    contact: 'Contact Person', desc: 'Descriptions', model: 'MODEL (IDU-ODU)', qty: 'TOTAL QTY (SET)', notes: 'Notes' };
  const LC_COLS = { supplier: 'Beneficiary / المورد', pi: 'P/I No.', cover: 'Cover Note', bank: 'Bank', lcNo: 'L/C No.',
    open: 'Open Date', expiry: 'Expiry Date', amount: 'L/C AMOUNT', currency: 'Currency', received: 'Shipment Received',
    condition: 'Condition', goods: 'Goods Type', origin: 'Origin' };

  let parsed = null;       // نتيجة القراءة
  let mapping = {};        // ربط أرقام P/I غير المطابقة: token -> poNo أو ''
  let existing = { orders: [], lcs: [], shipments: [] };

  registerPage({ key: 'import', title: 'استيراد البيانات', icon: ICONS.importx, adminOnly: true, init, show });

  function init() {
    $('imFiles').addEventListener('change', readFiles);
    $('imRunBtn').addEventListener('click', runImport);
    $('imMap').addEventListener('change', e => {
      const sel = e.target.closest('select[data-token]');
      if (!sel) return;
      mapping[sel.dataset.token] = sel.value;
      build();
    });
  }

  function show() {
    loadExisting();
  }

  async function loadExisting() {
    try {
      const [o, l, p, s] = await Promise.all([API.listOrders(), API.listLcs(), API.listShipments('pending'), API.listShipments('shipped')]);
      existing = { orders: o.orders || [], lcs: l.lcs || [], shipments: (p.shipments || []).concat(s.shipments || []) };
      if (parsed) build();
    } catch (err) { /* المعاينة تشتغل حتى بدونها */ }
  }

  /* =====================================================
     قارئ xlsx خفيف: zip + XML (بدون مكتبات)
  ===================================================== */

  async function unzip(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('الملف مو Excel (xlsx) صحيح');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      files[name] = { method, size, local };
      p += 46 + nameLen + extraLen + commLen;
    }
    return async name => {
      const f = files[name];
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const data = new Uint8Array(buf, start, f.size);
      if (f.method === 0) return dec.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    };
  }

  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  const tags = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));

  /** يرجّع {اسم الورقة: صفوف (مصفوفات)} */
  async function readXlsx(file) {
    const get = await unzip(await file.arrayBuffer());
    const shared = [];
    const ss = await get('xl/sharedStrings.xml');
    if (ss) tags(xml(ss), 'si').forEach(si => {
      shared.push(tags(si, 't').filter(t => !t.closest || !t.closest('rPh')).map(t => t.textContent).join(''));
    });
    const wb = xml(await get('xl/workbook.xml'));
    const rels = {};
    tags(xml(await get('xl/_rels/workbook.xml.rels')), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const out = {};
    for (const sh of tags(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const text = await get(target);
      if (!text) continue;
      const rows = [];
      tags(xml(text), 'row').forEach(row => {
        const r = [];
        tags(row, 'c').forEach(c => {
          const ref = c.getAttribute('r') || '';
          const letters = ref.replace(/\d+/g, '');
          let col = 0;
          for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
          col = (col || r.length + 1) - 1;
          const t = c.getAttribute('t');
          const v = tags(c, 'v')[0];
          let val = null;
          if (t === 's') val = v ? shared[Number(v.textContent)] : null;
          else if (t === 'inlineStr') val = tags(c, 't').map(x => x.textContent).join('');
          else if (t === 'str' || t === 'e') val = v ? v.textContent : null;
          else if (t === 'b') val = v ? v.textContent === '1' : null;
          else val = v ? Number(v.textContent) : null;
          r[col] = val;
        });
        rows[Number(row.getAttribute('r') || rows.length + 1) - 1] = r;
      });
      out[sh.getAttribute('name')] = rows.filter(Boolean);
    }
    return out;
  }

  /* ===== تنظيف القيم ===== */

  const CYR = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  const txt = v => v == null ? '' : String(v).replace(/[АВЕКМНОРСТХУ]/g, c => CYR[c]).replace(/\s+/g, ' ').trim();
  const key = v => txt(v).toUpperCase().replace(/\bAND\b/g, '&').replace(/[^A-Z0-9&]/g, '');
  const numv = v => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
  const pad = n => String(n).padStart(2, '0');
  function dateOf(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 864e5));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    const s = txt(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    return m ? m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) : '';
  }
  const dept = v => DEPT_MAP[txt(v).toUpperCase()] || DEPT_MAP[txt(v)] || '';
  const bank = v => { const k = txt(v).toUpperCase().replace(/[^A-Z]/g, ''); return BANK_MAP[k] || txt(v).replace(/[ً-ْ]/g, ''); };
  const arrival = v => ARRIVAL_MAP[txt(v).toUpperCase()] || txt(v);
  const insurer = v => INSURERS[txt(v).toUpperCase()] || txt(v);

  /** صفوف ورقة ← كائنات حسب أسماء الأعمدة */
  function table(rows, cols) {
    const head = (rows[0] || []).map(h => txt(h).toLowerCase());
    const idx = {};
    Object.keys(cols).forEach(k => { idx[k] = head.indexOf(cols[k].toLowerCase()); });
    const missing = Object.keys(cols).filter(k => idx[k] < 0).map(k => cols[k]);
    const list = rows.slice(1).map((r, i) => {
      const o = { _row: i + 2 };
      Object.keys(cols).forEach(k => { o[k] = idx[k] >= 0 ? r[idx[k]] : null; });
      return o;
    });
    return { list, missing };
  }
  const findSheet = (book, col) => Object.keys(book).find(n => (book[n][0] || []).some(h => txt(h).toLowerCase() === col.toLowerCase()));

  /* ===== قراءة الملفات ===== */

  async function readFiles() {
    const files = Array.from($('imFiles').files || []);
    $('imOut').classList.add('hide');
    $('imStatus').textContent = files.length ? 'جارٍ قراءة الملفات…' : '';
    parsed = null;
    mapping = {};
    if (!files.length) return;
    try {
      const raw = { ship: null, po: null, lc: null, names: [] };
      for (const f of files) {
        const book = await readXlsx(f);
        const s = findSheet(book, 'C/I No'), p = findSheet(book, 'OrderID / PI NO'), l = findSheet(book, 'L/C No.');
        if (s) raw.ship = table(book[s], SHIP_COLS);
        if (p) raw.po = table(book[p], PO_COLS);
        if (l) raw.lc = table(book[l], LC_COLS);
        raw.names.push(f.name + ' ← ' + [s && 'الشحنات', p && 'أوامر الشراء', l && 'الاعتمادات'].filter(Boolean).join(' + ') || 'ما تعرّفت على أوراقه');
      }
      if (!raw.ship && !raw.po && !raw.lc) throw new Error('ما لقيت أوراق «الشحنات» أو «اوامر الشراء» أو «الاعتمادات البنكية» في الملفات');
      parsed = raw;
      $('imStatus').innerHTML = raw.names.map(esc).join('<br>');
      build();
    } catch (err) {
      $('imStatus').innerHTML = `<span class="error">${esc(err.message)}</span>`;
    }
  }

  /* ===== بناء البيانات النظيفة + المشاكل ===== */

  function build() {
    const R = parsed;
    const issues = {};
    const issue = (type, text) => { (issues[type] = issues[type] || []).push(text); };
    const exOrders = {};
    existing.orders.forEach(o => { exOrders[key(o.poNo)] = o; });

    // --- أوامر الشراء ---
    const orders = {};
    if (R.po) {
      R.po.missing.forEach(c => issue('أعمدة ناقصة في ورقة أوامر الشراء', c));
      R.po.list.forEach(r => {
        const no = txt(r.pi);
        if (!no) { if (txt(r.model)) issue('بنود أوامر بدون رقم أمر (تُتجاهل)', 'سطر ' + r._row + ': ' + txt(r.model)); return; }
        const k = key(no);
        const o = orders[k] = orders[k] || { poNo: no, date: dateOf(r.date), department: '', supplier: txt(r.supplier), factory: txt(r.factory),
          contact: txt(r.contact), notes: [], items: [], ports: [], incoterm: '', payMethod: 'T/T', currency: 'USD', _deptRaw: txt(r.dept) };
        if (!o.department && dept(r.dept)) o.department = dept(r.dept);
        if (!o.supplier) o.supplier = txt(r.supplier);
        if (txt(r.notes) && !o.notes.includes(txt(r.notes))) o.notes.push(txt(r.notes));
        if (!txt(r.model)) return;
        if (!numv(r.qty)) issue('بنود بدون كمية', `${no} — ${txt(r.model)} (سطر ${r._row})`);
        o.items.push({ model: txt(r.model), description: txt(r.desc), qty: numv(r.qty), containers: 0 });
      });
      Object.values(orders).forEach(o => {
        if (!o.department) { issue('أقسام غير معروفة (تُسجّل «قسم آخر»)', `${o.poNo}: ${o._deptRaw || 'فاضي'}`); o.department = 'قسم آخر'; }
      });
    }

    // --- الفواتير ---
    const invGroups = {};   // poKey|invoice
    const invTotals = {};   // invoice -> {qty, value, hq}
    if (R.ship) {
      R.ship.missing.forEach(c => issue('أعمدة ناقصة في ورقة الشحنات', c));
      R.ship.list.forEach(r => {
        const pi = txt(r.pi), inv = txt(r.invoice);
        if (!pi && !inv) return;
        if (!pi || !inv) { issue('سطور شحن بدون رقم أمر أو فاتورة (تُتجاهل)', `سطر ${r._row}`); return; }
        const pk = key(pi);
        if (!orders[pk] && !exOrders[pk]) {
          orders[pk] = { poNo: pi, date: dateOf(r.shipDate) || today(), department: dept(r.dept) || 'قسم آخر', supplier: txt(r.factory), factory: txt(r.factory),
            contact: '', notes: [], items: [], ports: [], incoterm: '', payMethod: 'T/T', currency: 'USD', _fromShip: true };
          issue('أوامر شراء موجودة في الشحنات فقط (تنعمل من بيانات الشحن)', pi);
        }
        const g = invGroups[pk + '|' + key(inv)] = invGroups[pk + '|' + key(inv)] || {
          poKey: pk, poNo: (orders[pk] || exOrders[pk]).poNo, invoiceNo: inv, serial: '', lines: [], rows: [] };
        g.rows.push(r);
        const t = invTotals[key(inv)] = invTotals[key(inv)] || { qty: 0, value: 0, hq: 0, groups: new Set() };
        t.groups.add(g);
        const q = numv(r.qty);
        if (!txt(r.model) || !q) { issue('سطور شحن بدون موديل أو كمية (تُتجاهل)', `${inv} — ${txt(r.model) || 'بدون موديل'} (سطر ${r._row})`); return; }
        g.lines.push({ model: txt(r.model), description: txt(r.desc), qty: q });
        t.qty += q;
        if (numv(r.value)) t.value = numv(r.value);
        if (numv(r.hq)) t.hq = Math.max(t.hq, numv(r.hq));
      });
    }

    const shipments = Object.values(invGroups).filter(g => g.lines.length).map(g => {
      const first = f => { for (const r of g.rows) { const v = r[f]; if (v != null && txt(v) !== '') return v; } return null; };
      const t = invTotals[key(g.invoiceNo)];
      const qty = g.lines.reduce((a, l) => a + l.qty, 0);
      const share = t.qty ? qty / t.qty : 1;
      const o = orders[g.poKey] || exOrders[g.poKey];
      // الفاتورة مشتركة بين أكثر من أمر: القيمة والحاويات تتوزع حسب الكمية
      if (t.groups.size > 1) issue('فواتير مشتركة بين أكثر من أمر شراء (القيمة والحاويات تتوزع حسب الكمية)', g.invoiceNo + ' ← ' + g.poNo);
      const hq = t.groups.size > 1 ? Math.round(t.hq * share) : t.hq;
      // توزيع الحاويات على البنود حسب الكمية
      let left = hq;
      const lines = g.lines.map((l, i) => {
        const c = i === g.lines.length - 1 ? left : Math.min(left, Math.round(hq * l.qty / (qty || 1)));
        left -= c;
        return { ...l, containers: Math.max(0, c) };
      });
      const serial = txt(first('entry'));
      const shipDate = dateOf(first('shipDate'));
      if (serial && !shipDate) issue('فواتير مشحونة بدون تاريخ شحن صحيح', `${g.invoiceNo} (${txt(first('shipDate')) || 'فاضي'})`);
      const recvRaw = first('received');
      const declRaw = txt(first('decl'));
      const declNums = declRaw.match(/\d{4,}/g) || [];
      if (declNums.length > 1) issue('بيانات جمركية متعددة على فاتورة (تنحفظ في ملاحظات ملف الشحنة)', `${g.invoiceNo}: ${declRaw}`);
      let lcNo = txt(first('lcNo')).toUpperCase().replace(/\s+/g, '');
      if (lcNo === 'TT' || lcNo === 'T/T') lcNo = '';
      if (lcNo && o) o.payMethod = 'L/C';
      const port = txt(first('port')).toUpperCase();
      if (port && orders[g.poKey] && !orders[g.poKey].ports.includes(port)) orders[g.poKey].ports.push(port);
      return {
        poNo: g.poNo, invoiceNo: g.invoiceNo, serial: serial, shipDate: shipDate, eta: dateOf(first('eta')),
        readyDate: dateOf(first('ready')) || shipDate, port: port, arrivalPort: arrival(first('arrival')),
        forwarder: txt(first('forwarder')), broker: txt(first('broker')), department: dept(first('dept')) || (o ? o.department : ''),
        invoiceValue: Math.round(t.value * share * 100) / 100, lcNo: lcNo, totalContainers: hq, lines: lines,
        receivedDate: dateOf(recvRaw), declarationNo: declNums.length === 1 ? declNums[0] : '',
        file: {
          shippingLine: txt(first('line')), vessel: txt(first('vessel')), hblNo: txt(first('hbl')), mblNo: txt(first('mbl')),
          insurer: insurer(first('insurer')), duty: numv(first('duty')), bankDocs: txt(first('bankDocs')) === 'تم',
          docsPresent: txt(first('docs')) === 'يوجد مستند', declText: declNums.length > 1 ? declRaw : ''
        }
      };
    });
    shipments.filter(s => !s.serial).forEach(s => issue('فواتير بدون رقم تسلسل ENTRY (تنضاف كطلبات شحن غير معمّدة)', s.invoiceNo));
    shipments.filter(s => s.serial && !s.invoiceValue).forEach(s => issue('فواتير مشحونة بدون قيمة', s.invoiceNo));

    // بنود في الشحنات مو موجودة في أمر الشراء ← تنضاف للأمر بكمية المشحون
    shipments.forEach(s => {
      const o = orders[key(s.poNo)];
      if (!o) return;
      s.lines.forEach(l => {
        if (o.items.some(i => key(i.model) === key(l.model))) return;
        const extra = o.items.find(i => i._extra && key(i.model) === key(l.model));
        if (extra) extra.qty += l.qty;
        else { o.items.push({ model: l.model, description: l.description, qty: l.qty, containers: 0, _extra: true }); }
        issue('موديلات في الشحنات مو موجودة في أمر الشراء (تنضاف للأمر بكمية المشحون)', `${s.poNo} — ${l.model}`);
      });
    });

    // --- الاعتمادات ---
    const lcs = {};
    const unmatched = [];
    const allPo = {};
    Object.values(orders).forEach(o => { allPo[key(o.poNo)] = o.poNo; });
    existing.orders.forEach(o => { allPo[key(o.poNo)] = o.poNo; });
    const poKeys = Object.keys(allPo);
    if (R.lc) {
      R.lc.missing.forEach(c => issue('أعمدة ناقصة في ملف الاعتمادات', c));
      R.lc.list.forEach(r => {
        const no = txt(r.lcNo).toUpperCase().replace(/\s+/g, '');
        if (!no) return;
        const cond = txt(r.condition).toUpperCase();
        const days = Number((cond.match(/(\d+)\s*D/) || [])[1] || 0);
        const inc = ((cond.match(/\(([A-Z&]+)\)/) || [])[1] || '').replace('C&F', 'CFR');
        const amount = numv(r.amount);
        const ex = lcs[no];
        if (ex) {
          if (Math.abs(ex.amount - amount) > 0.01) { ex.amount += amount; issue('اعتمادات مكررة بمبالغ مختلفة (تنجمع)', `${no}: ${num(ex.amount - amount)} + ${num(amount)}`); }
          else issue('اعتمادات مكررة بنفس المبلغ (تنحسب مرة وحدة)', no);
          ex.fileReceived += numv(r.received);
        }
        const l = ex || (lcs[no] = { lcNo: no, bank: bank(r.bank), supplier: txt(r.supplier), currency: txt(r.currency) || 'USD', amount: amount,
          usanceDays: days, incoterm: inc, issueDate: dateOf(r.open), expiryDate: dateOf(r.expiry), insurer: insurer(r.cover),
          goodsType: txt(r.goods), origin: txt(r.origin), poNos: [], fileReceived: numv(r.received) });
        if (!cond) issue('اعتمادات بدون شرط (Condition) — تنسجّل اطلاع', no);
        // ربط P/I: الخانة كاملة، وإلا كل رقم فيها
        const cell = txt(r.pi).replace(/-\s+(?=\w)/g, '-');   // رقم انقسم على سطرين
        if (!cell) return;
        const whole = key(cell);
        if (allPo[whole]) { if (!l.poNos.includes(allPo[whole])) l.poNos.push(allPo[whole]); return; }
        cell.split(/&|\bAND\b|,|\n|\s+/i).map(x => x.trim()).filter(x => key(x).length >= 3).forEach(tok => {
          const k = key(tok);
          const mapKey = no + '§' + k;
          let target = allPo[k];
          if (!target) {
            // مقترحات: الأمر داخل المكتوب (مثل PI…-FEB) أو المكتوب جزء طويل من رقم الأمر
            const suggest = poKeys.filter(p => (p.length >= 6 && k.includes(p)) || (k.length >= 8 && p.includes(k))).map(p => allPo[p]);
            unmatched.push({ lcNo: no, token: tok, mapKey, suggest });
            if (mapping[mapKey] === undefined) mapping[mapKey] = suggest.length === 1 ? suggest[0] : '';
            target = mapping[mapKey];
          }
          if (target && !l.poNos.includes(target)) l.poNos.push(target);
        });
      });
      Object.values(lcs).forEach(l => {
        if (!l.poNos.length) issue('اعتمادات بدون أمر شراء مربوط', l.lcNo);
        l.poNos.forEach(p => { const o = orders[key(p)]; if (o) { o.payMethod = 'L/C'; if (!o.incoterm) o.incoterm = l.incoterm; o.currency = l.currency || 'USD'; } });
      });
    }
    const lcKnown = {};
    Object.keys(lcs).forEach(k => { lcKnown[k] = 1; });
    existing.lcs.forEach(l => { lcKnown[String(l.lcNo).toUpperCase()] = 1; });
    shipments.filter(s => s.lcNo && !lcKnown[s.lcNo]).forEach(s => issue('فواتير مربوطة باعتماد مو موجود في ملف الاعتمادات (تنستورد بدون ربط)', `${s.invoiceNo} ← ${s.lcNo}`));
    Object.values(orders).filter(o => !o.ports.length).forEach(o => issue('أوامر بدون ميناء شحن (لازم تضيفه لما تعدّل الأمر)', o.poNo));

    // مقارنة رصيد الاعتمادات: المستلم حسب ملفك × مجموع قيم الفواتير المربوطة
    const lcCompare = Object.values(lcs).map(l => {
      const inv = shipments.filter(s => s.lcNo === l.lcNo && s.serial).reduce((t, s) => t + s.invoiceValue, 0);
      return { lcNo: l.lcNo, amount: l.amount, file: l.fileReceived, inv, over: inv - l.amount };
    });
    lcCompare.filter(c => c.over > 0.5).forEach(c => issue('اعتمادات المشحون عليها أكثر من مبلغها', `${c.lcNo}: زيادة ${num(c.over)}`));

    Object.values(orders).forEach(o => { o.notes = Array.isArray(o.notes) ? o.notes.join(' — ') : o.notes; });
    parsed.out = { orders: Object.values(orders), shipments, lcs: Object.values(lcs), issues, unmatched, lcCompare, allPo };
    render();
  }

  /* ===== المعاينة ===== */

  function render() {
    const { orders, shipments, lcs, issues, unmatched, lcCompare, allPo } = parsed.out;
    const exO = new Set(existing.orders.map(o => key(o.poNo)));
    const exL = new Set(existing.lcs.map(l => String(l.lcNo).toUpperCase()));
    const exS = new Set(existing.shipments.map(s => key(s.poNo) + '|' + key(s.invoiceNo)));
    const newO = orders.filter(o => !exO.has(key(o.poNo))).length;
    const newL = lcs.filter(l => !exL.has(l.lcNo)).length;
    const newS = shipments.filter(s => !exS.has(key(s.poNo) + '|' + key(s.invoiceNo))).length;
    const shipped = shipments.filter(s => s.serial);
    const tile = (l, v, sub) => `<div class="stat"><small>${l}</small><b>${v}</b>${sub ? `<span class="sub small">${sub}</span>` : ''}</div>`;
    $('imStats').innerHTML = [
      tile('أوامر الشراء', num(orders.length), `${num(newO)} جديد · ${num(orders.length - newO)} تحديث`),
      tile('البنود', num(orders.reduce((t, o) => t + o.items.length, 0)), `${num(new Set(orders.flatMap(o => o.items.map(i => key(i.model)))).size)} موديل`),
      tile('الفواتير', num(shipments.length), `${num(newS)} جديد · ${num(shipped.length)} مشحونة`),
      tile('الحاويات', num(shipped.reduce((t, s) => t + s.totalContainers, 0)), `${num(shipped.filter(s => s.receivedDate).reduce((t, s) => t + s.totalContainers, 0))} مستلمة`),
      tile('الاعتمادات', num(lcs.length), `${num(newL)} جديد · ${num(lcs.length - newL)} تحديث`)
    ].join('');

    // ربط P/I غير المطابقة
    const options = (sel, sug) => '<option value="">— تجاهل —</option>' +
      (sug.length ? `<optgroup label="مقترحات">${sug.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup><optgroup label="كل الأوامر">` : '') +
      Object.values(allPo).filter(p => !sug.includes(p)).sort().map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('') + (sug.length ? '</optgroup>' : '');
    $('imMapWrap').classList.toggle('hide', !unmatched.length);
    $('imMap').innerHTML = unmatched.map(u => `
      <tr><td><b dir="ltr">${esc(u.lcNo)}</b></td><td dir="ltr" style="text-align:right">${esc(u.token)}</td>
        <td><select data-token="${esc(u.mapKey)}">${options(mapping[u.mapKey], u.suggest)}</select>${u.suggest.length === 1 && mapping[u.mapKey] === u.suggest[0] ? '<small class="sub im-hint">اختيار تلقائي — راجعه</small>' : u.suggest.length > 1 ? `<small class="sub im-hint">${u.suggest.length} مقترحات — اختر</small>` : ''}</td></tr>`).join('');

    // المشاكل
    const types = Object.keys(issues);
    $('imIssues').innerHTML = types.length ? types.map(t => {
      const list = [...new Set(issues[t])];
      return `<details><summary><b>${esc(t)}</b> <span class="tag wait">${list.length}</span></summary>
        <div class="im-list">${list.slice(0, 200).map(x => `<span dir="auto">${esc(x)}</span>`).join('')}${list.length > 200 ? `<span>… و${list.length - 200} غيرها</span>` : ''}</div></details>`;
    }).join('') : '<p class="sub">ما فيه مشاكل 👍</p>';

    // مقارنة الاعتمادات
    $('imLcCmp').innerHTML = lcCompare.map(c => `<tr>
      <td><b dir="ltr">${esc(c.lcNo)}</b></td><td class="num">${money(c.amount)}</td><td class="num">${money(c.file)}</td>
      <td class="num">${money(c.inv)}</td>
      <td>${Math.abs(c.file - c.inv) < 1 ? '<span class="tag ok">متطابق</span>' : `<span class="tag wait">فرق ${money(c.inv - c.file)}</span>`}${c.over > 0.5 ? ' <span class="tag bad">أكثر من المبلغ</span>' : ''}</td></tr>`).join('') ||
      '<tr><td colspan="5" class="empty">ما فيه ملف اعتمادات.</td></tr>';

    // الأقسام
    const depts = {};
    orders.forEach(o => { const raw = o._deptRaw || '—'; depts[raw + ' ← ' + o.department] = (depts[raw + ' ← ' + o.department] || 0) + 1; });
    $('imDepts').innerHTML = Object.keys(depts).map(d => `<span class="po-chip">${esc(d)} <small>(${depts[d]} أمر)</small></span>`).join('');

    $('imOut').classList.remove('hide');
    $('imRunBtn').disabled = false;
    $('imLog').innerHTML = '';
  }

  /* ===== الاستيراد ===== */

  async function runImport() {
    const { orders, shipments, lcs } = parsed.out;
    if (!confirm(`استيراد ${orders.length} أمر شراء و${lcs.length} اعتماد و${shipments.length} فاتورة؟\nالموجود يتحدّث والجديد ينضاف.`)) return;
    const log = $('imLog');
    const line = (t, cls) => { log.insertAdjacentHTML('beforeend', `<div class="${cls || ''}">${t}</div>`); };
    const done = busy($('imRunBtn'), 'جارٍ الاستيراد…');
    log.innerHTML = '';
    const errs = [];
    try {
      const clean = list => list.map(o => { const c = { ...o }; Object.keys(c).forEach(k => { if (k.startsWith('_')) delete c[k]; }); return c; });
      const send = async (kind, rows, size, extra) => {
        const total = { added: 0, updated: 0, models: 0, containers: 0 };
        for (let i = 0; i < rows.length; i += size) {
          const part = rows.slice(i, i + size);
          line(`… ${kind === 'orders' ? 'أوامر الشراء' : kind === 'lcs' ? 'الاعتمادات' : 'الفواتير'} ${i + 1}–${i + part.length} من ${rows.length}`, 'sub');
          const r = await API.importData(kind, clean(part), extra);
          ['added', 'updated', 'models', 'containers'].forEach(k => { total[k] += r[k] || 0; });
          errs.push(...(r.errors || []));
        }
        return total;
      };
      if (orders.length) {
        const r = await send('orders', orders.map(o => ({ ...o, items: o.items.map(i => ({ model: i.model, description: i.description, qty: i.qty, containers: i.containers })) })), 40, { addModels: $('imModels').checked });
        line(`✓ أوامر الشراء: ${r.added} جديد، ${r.updated} تحديث${r.models ? ` — و${r.models} موديل جديد في قاعدة الموديلات` : ''}`, 'ok');
      }
      if (lcs.length) {
        const r = await send('lcs', lcs.map(l => ({ ...l, fileReceived: undefined })), 50);
        line(`✓ الاعتمادات: ${r.added} جديد، ${r.updated} تحديث`, 'ok');
      }
      if (shipments.length) {
        const r = await send('shipments', shipments, 40);
        line(`✓ الفواتير: ${r.added} جديد، ${r.updated} تحديث — ${r.containers} حاوية جديدة`, 'ok');
      }
      if (errs.length) line(`<b>ما انستورد (${errs.length}):</b><br>` + errs.map(esc).join('<br>'), 'error');
      line('انتهى الاستيراد. تقدر تعيده في أي وقت بعد ما تعدّل ملفك — الموجود يتحدّث بس.', 'ok');
      toast('تم الاستيراد');
      loadExisting();
    } catch (err) {
      line('✗ ' + esc(err.message), 'error');
    } finally {
      done();
    }
  }
})();
