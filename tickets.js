/**
 * البلاغات
 * - «بلاغاتي»: لكل موظف، يرفع مشكلته ويتابع الرد (من زر «البلاغات» في الشريط العلوي)
 * - «البلاغات»: للمدير فقط، كل البلاغات مرتبة + رد/توجيه، أتولاها، تم الحل
 */
(function () {
  const STATE_CLS = { 'جديد': 'bad', 'قيد المعالجة': 'wait', 'بانتظار الموظف': 'gray', 'معاد فتحه': 'bad', 'محلولة': 'ok' };
  const PRIO_CLS = { 'عاجلة': 'bad', 'مهمة': 'wait', 'عادية': 'gray' };
  const stTag = s => `<span class="tag ${STATE_CLS[s] || ''}">${esc(s)}</span>`;
  const prTag = p => `<span class="tag ${PRIO_CLS[p] || ''}">${esc(p)}</span>`;
  const when = at => esc(String(at || '').replace(' ', ' — '));

  let mine = [];        // بلاغات الموظف
  let all = [];         // كل البلاغات (للمدير)
  let current = null;   // البلاغ المفتوح
  let mode = 'user';    // 'user' أو 'admin'

  registerPage({ key: 'myTickets', title: 'بلاغاتي', icon: ICONS.tickets, everyone: true, init: initMine, show: loadMine });
  registerPage({ key: 'tickets', title: 'البلاغات', icon: ICONS.tickets, adminOnly: true, init: initAdmin, show: loadAll });

  /* ===== الأرقام الصغيرة (للمدير: غير المقروءة، للموظف: ردود جديدة) ===== */

  window.refreshTicketBadges = async function () {
    try {
      const r = await API.ticketBadges();
      const n = isAdmin() ? r.admin : r.mine;
      $('ticketsBadge').textContent = n;
      $('ticketsBadge').classList.toggle('hide', !n);
      const nav = document.querySelector('#sideNav [data-page="tickets"]');
      if (nav) {
        let b = nav.querySelector('.nbadge');
        if (!b) { b = document.createElement('b'); b.className = 'nbadge'; nav.appendChild(b); }
        b.textContent = r.admin;
        b.classList.toggle('hide', !r.admin);
      }
    } catch (e) { /* الأرقام اختيارية */ }
  };
  setInterval(() => { if (currentUser && !document.hidden) refreshTicketBadges(); }, 90000);

  /* ===== مشترك ===== */

  let shared = false;
  function initShared() {
    if (shared) return;
    shared = true;
    $('ticketsBtn').addEventListener('click', () => goTo(isAdmin() ? 'tickets' : 'myTickets'));
    $('newTicketForm').addEventListener('submit', createTicket);
    $('ticketForm').addEventListener('submit', e => e.preventDefault());
    $('tdText').addEventListener('input', () => { $('tdError').textContent = ''; });
    $('tdReplyBtn').addEventListener('click', () => act('reply'));
    $('tdTakeBtn').addEventListener('click', () => act('take'));
    $('tdResolveBtn').addEventListener('click', () => act('resolve'));
    $('tdReopenBtn').addEventListener('click', () => act('reopen'));
  }
  // الزر العلوي لازم يشتغل من أول ما تفتح المنصة
  document.addEventListener('DOMContentLoaded', initShared);
  if (document.readyState !== 'loading') initShared();

  /* ===== صفحة الموظف ===== */

  function initMine() {
    initShared();
    $('newTicketBtn').addEventListener('click', () => {
      $('newTicketForm').reset();
      $('ntError').textContent = '';
      $('newTicketDialog').showModal();
      $('nt_title').focus();
    });
    $('myTicketList').addEventListener('click', e => {
      const c = e.target.closest('[data-id]');
      if (c) openTicket(mine.find(t => t.id === c.dataset.id), 'user');
    });
  }

  async function loadMine() {
    $('myTicketList').innerHTML = '<p class="empty">جارٍ التحميل…</p>';
    try {
      mine = (await API.listMyTickets()).tickets || [];
      renderMine();
    } catch (err) {
      $('myTicketList').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  }

  function renderMine() {
    if (!mine.length) {
      $('myTicketList').innerHTML = '<div class="card tk-empty"><b>ما عندك بلاغات</b><p class="sub">إذا واجهتك مشكلة في المنصة أو في شحنة، اضغط «بلاغ جديد».</p></div>';
      return;
    }
    $('myTicketList').innerHTML = mine.map(t => {
      const last = t.messages[t.messages.length - 1];
      const fresh = !t.seenByUser;
      return `<button type="button" class="card tk-card${fresh ? ' fresh' : ''}" data-id="${esc(t.id)}">
        <div class="tk-top"><b>${esc(t.title)}</b>${stTag(t.status)}</div>
        <div class="tk-sub"><span dir="ltr">${esc(t.no)}</span> · ${esc(t.type)} · ${prTag(t.priority)} · ${when(t.createdAt)}</div>
        <div class="tk-last">${last ? `<b>${last.role === 'admin' ? 'رد المدير' : 'ردك'}:</b> ${esc(last.text || last.action)}` : '<span class="sub">بانتظار رد المدير</span>'}</div>
        ${fresh ? '<span class="tk-dot" title="رد جديد"></span>' : ''}
      </button>`;
    }).join('');
  }

  async function createTicket(e) {
    e.preventDefault();
    $('ntError').textContent = '';
    const done = busy($('ntSaveBtn'), 'جارٍ الإرسال…');
    try {
      const r = await API.createTicket({
        title: $('nt_title').value, type: $('nt_type').value, priority: $('nt_priority').value,
        ref: $('nt_ref').value, description: $('nt_description').value
      });
      $('newTicketDialog').close();
      toast(r.message);
      if (isAdmin()) loadAll(); else loadMine();
      refreshTicketBadges();
    } catch (err) {
      $('ntError').textContent = err.message;
    } finally {
      done();
    }
  }

  /* ===== صفحة المدير ===== */

  function initAdmin() {
    initShared();
    $('tkRefreshBtn').addEventListener('click', loadAll);
    ['tkSearch', 'tkFilterStatus', 'tkFilterType'].forEach(id => $(id).addEventListener('input', renderAll));
    $('tkBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (row) openTicket(all.find(t => t.id === row.dataset.id), 'admin');
    });
  }

  async function loadAll() {
    $('tkBody').innerHTML = '<tr><td colspan="6" class="empty">جارٍ التحميل…</td></tr>';
    try {
      const r = await API.listTickets();
      all = r.tickets || [];
      const sel = $('tkFilterType');
      if (sel.options.length <= 1) sel.innerHTML += (r.types || []).map(t => `<option>${esc(t)}</option>`).join('');
      renderAll();
      refreshTicketBadges();
    } catch (err) {
      $('tkBody').innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function renderAll() {
    const month = today().slice(0, 7);
    const open = all.filter(t => t.open);
    $('tkStats').innerHTML = [
      ['جديدة', all.filter(t => t.status === 'جديد' || t.status === 'معاد فتحه').length],
      ['قيد المعالجة', all.filter(t => t.status === 'قيد المعالجة').length],
      ['بانتظار الموظف', all.filter(t => t.status === 'بانتظار الموظف').length],
      ['عاجلة مفتوحة', open.filter(t => t.priority === 'عاجلة').length],
      ['محلولة هالشهر', all.filter(t => t.status === 'محلولة' && String(t.resolvedAt).slice(0, 7) === month).length]
    ].map(([l, v]) => `<div class="stat"><small>${l}</small><b>${num(v)}</b></div>`).join('');

    const q = $('tkSearch').value.trim().toLowerCase();
    const st = $('tkFilterStatus').value, ty = $('tkFilterType').value;
    const list = all.filter(t =>
      (!st || (st === 'open' ? t.open : t.status === st)) && (!ty || t.type === ty) &&
      (!q || [t.no, t.title, t.createdByName, t.createdBy, t.ref, t.department].join(' ').toLowerCase().includes(q)));
    if (!list.length) {
      $('tkBody').innerHTML = `<tr><td colspan="6" class="empty">${all.length ? 'لا توجد بلاغات مطابقة.' : 'ما وصلت بلاغات بعد.'}</td></tr>`;
      return;
    }
    $('tkBody').innerHTML = list.map(t => {
      const last = t.messages[t.messages.length - 1];
      const late = t.open && t.idleDays >= 3 && t.status !== 'بانتظار الموظف';
      return `<tr data-id="${esc(t.id)}" class="${t.seenByAdmin ? '' : 'tk-unread'}">
        ${cell2(`<span dir="ltr">${esc(t.no)}</span>`, esc(String(t.createdAt).slice(0, 10)))}
        ${cell2(esc(t.createdByName || t.createdBy), esc(t.department || '—'))}
        ${cell2(`${t.seenByAdmin ? '' : '<span class="tk-dot in"></span>'}${esc(t.title)}`, esc(t.type) + (t.ref ? ` · <span dir="ltr">${esc(t.ref)}</span>` : ''))}
        <td>${prTag(t.priority)}</td>
        ${cell2(t.idleDays ? `قبل ${t.idleDays} يوم` : 'اليوم', last ? (last.role === 'admin' ? 'آخر رد: أنت' : 'آخر رد: الموظف') : 'بدون رد' + (late ? ' <span class="tag bad">متأخر</span>' : ''))}
        <td>${stTag(t.status)}${late && last ? ' <span class="tag bad">متأخر</span>' : ''}</td>
      </tr>`;
    }).join('');
  }

  /* ===== نافذة البلاغ ===== */

  function openTicket(t, as) {
    if (!t) return;
    current = t;
    mode = as;
    $('tdTitle').innerHTML = `<span dir="ltr">${esc(t.no)}</span> — ${esc(t.title)}`;
    $('tdStatus').innerHTML = stTag(t.status);
    const chip = (k, v) => v ? `<span class="po-chip"><small>${k}</small>${v}</span>` : '';
    $('tdMeta').innerHTML = [
      chip('من', esc(t.createdByName || t.createdBy) + (t.department ? ' — ' + esc(t.department) : '')),
      chip('النوع', esc(t.type)), chip('الأولوية', prTag(t.priority)), chip('التاريخ', when(t.createdAt)),
      t.ref ? chip('مرتبط بـ', `<b dir="ltr">${esc(t.ref)}</b>`) : ''
    ].join('');
    $('tdDesc').textContent = t.description;
    drawThread();

    const solved = t.status === 'محلولة';
    const admin = as === 'admin';
    $('tdReplyWrap').classList.toggle('hide', solved && !admin);
    $('tdTextLabel').textContent = admin ? 'ردك / توجيهك للموظف (أو وش انسوّى لحل المشكلة)' : 'ردك';
    $('tdText').value = '';
    $('tdText').placeholder = admin ? 'اكتب هنا…' : 'اكتب توضيح أو رد على المدير…';
    $('tdReplyBtn').textContent = admin ? 'رد / توجيه للموظف' : 'إرسال الرد';
    $('tdReplyBtn').classList.toggle('hide', solved);
    $('tdTakeBtn').classList.toggle('hide', !admin || solved || t.status === 'قيد المعالجة');
    $('tdResolveBtn').classList.toggle('hide', !admin || solved);
    $('tdReopenBtn').classList.toggle('hide', !solved);
    $('tdReopenBtn').textContent = admin ? 'إعادة فتح' : 'المشكلة ما انحلت — أعد فتح البلاغ';
    $('tdError').textContent = '';
    $('ticketDialog').showModal();

    // تمت المشاهدة
    const unseen = admin ? !t.seenByAdmin : !t.seenByUser;
    if (unseen) {
      (admin ? API.ticketAction(t.id, 'seen') : API.myTicketAction(t.id, 'seen')).then(r => {
        Object.assign(t, r.ticket);
        if (admin) renderAll(); else renderMine();
        refreshTicketBadges();
      }).catch(() => {});
    }
  }

  function drawThread() {
    const t = current;
    const items = t.messages.map(m => `
      <div class="tk-msg ${m.role === 'admin' ? 'admin' : 'user'}">
        <div class="tk-msg-h"><b>${m.role === 'admin' ? 'المدير' : esc(m.name || '')}</b>${m.action ? ` <span class="tag ${m.action === 'تم الحل' ? 'ok' : 'gray'}">${esc(m.action)}</span>` : ''}<small>${when(m.at)}</small></div>
        ${m.text ? `<div class="tk-msg-b">${esc(m.text)}</div>` : ''}
      </div>`);
    $('tdThread').innerHTML = items.join('') || '<p class="sub small">ما فيه ردود بعد.</p>';
    $('tdThread').scrollTop = $('tdThread').scrollHeight;
  }

  async function act(action) {
    const text = $('tdText').value;
    $('tdError').textContent = '';
    if (action === 'resolve' && !text.trim()) { $('tdError').textContent = 'اكتب في خانة الرد وش انسوّى لحل المشكلة، وبعدين اضغط «تم الحل»'; $('tdText').focus(); return; }
    const btn = { reply: 'tdReplyBtn', take: 'tdTakeBtn', resolve: 'tdResolveBtn', reopen: 'tdReopenBtn' }[action];
    const done = busy($(btn), 'جارٍ…');
    try {
      const r = mode === 'admin' ? await API.ticketAction(current.id, action, text) : await API.myTicketAction(current.id, action, text);
      toast(r.message);
      $('ticketDialog').close();
      if (mode === 'admin') loadAll(); else loadMine();
      refreshTicketBadges();
    } catch (err) {
      $('tdError').textContent = err.message;
    } finally {
      done();
    }
  }
})();
