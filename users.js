/**
 * صفحة: الموظفون والصلاحيات (للمدير فقط)
 */
(function () {
  let users = [];
  let editing = null;   // null = موظف جديد

  registerPage({
    key: 'users',
    title: 'الموظفون',
    icon: ICONS.users,
    adminOnly: true,
    init,
    show
  });

  /** الصفحات اللي تنعطى صلاحياتها للموظفين (كل صفحة غير خاصة بالمدير) */
  const grantable = () => PAGES.filter(p => !p.adminOnly);

  function init() {
    $('u_dept').innerHTML = options(DEPTS, 'كل الأقسام');
    $('usersRefreshBtn').addEventListener('click', load);
    $('newUserBtn').addEventListener('click', () => openUser(null));
    $('usersBody').addEventListener('click', e => {
      const row = e.target.closest('tr[data-user]');
      if (row) openUser(users.find(u => u.username === row.dataset.user));
    });
    $('u_role').addEventListener('change', toggleRole);
    $('userForm').addEventListener('submit', save);
    $('userForm').addEventListener('input', () => { $('uError').textContent = ''; });
    $('uDeleteBtn').addEventListener('click', remove);
  }

  function show() {
    load();
  }

  async function load() {
    $('usersBody').innerHTML = '<tr><td colspan="7" class="empty">جارٍ تحميل الموظفين…</td></tr>';
    try {
      const result = await API.listUsers();
      users = result.users || [];
      render();
    } catch (err) {
      $('usersBody').innerHTML = `<tr><td colspan="7" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function permTags(u) {
    if (u.role === 'admin') return '<span class="tag ok">كل الصفحات</span>';
    const tags = grantable()
      .filter(p => (u.perms || {})[p.key] && u.perms[p.key] !== 'none')
      .map(p => `<span class="tag ${u.perms[p.key] === 'view' ? 'gray' : ''}">${esc(p.title)}: ${LEVELS[u.perms[p.key]]}</span>`);
    return tags.length ? tags.join('') : '<span class="tag off">بدون صلاحيات</span>';
  }

  function render() {
    if (!users.length) {
      $('usersBody').innerHTML = '<tr><td colspan="7" class="empty">لا يوجد موظفون.</td></tr>';
      return;
    }
    $('usersBody').innerHTML = users.map(u => `
      <tr data-user="${esc(u.username)}">
        <td><b>${esc(u.name)}</b>${u.username === currentUser.username ? ' <span class="tag gray">أنت</span>' : ''}</td>
        <td dir="ltr" style="text-align:right">${esc(u.username)}</td>
        <td>${u.role === 'admin' ? 'مدير' : 'موظف'}</td>
        <td>${esc(u.dept || 'كل الأقسام')}</td>
        <td><div class="tags">${permTags(u)}</div></td>
        <td>${u.active ? '<span class="tag ok">فعّال</span>' : '<span class="tag off">موقوف</span>'}</td>
        <td>${esc(u.lastLogin || '—')}</td>
      </tr>`).join('');
  }

  /* ===== نافذة الموظف ===== */

  function openUser(user) {
    editing = user || null;
    const isSelf = !!user && user.username === currentUser.username;

    $('uTitle').textContent = user ? 'تعديل: ' + user.name : 'موظف جديد';
    $('u_name').value = user ? user.name : '';
    $('u_username').value = user ? user.username : '';
    $('u_username').disabled = !!user;   // اسم المستخدم ما يتغير بعد الإنشاء
    $('u_password').value = '';
    $('u_password').required = !user;
    $('u_password').placeholder = user ? 'اتركها فارغة للإبقاء على الحالية' : '8 أحرف على الأقل';
    $('uPassLabel').textContent = user ? 'كلمة مرور جديدة' : 'كلمة المرور *';
    $('u_role').value = user ? user.role : 'user';
    $('u_dept').value = user ? user.dept : '';
    $('u_active').checked = user ? user.active : true;

    // ما تقدر تلغي صلاحيتك كمدير أو توقف حسابك
    $('u_role').disabled = isSelf;
    $('u_active').disabled = isSelf;
    $('uDeleteBtn').classList.toggle('hide', !user || isSelf);

    const perms = (user && user.perms) || {};
    $('uPerms').innerHTML = grantable().map(p => `
      <div class="perm-row">
        <b>${esc(p.title)}</b>
        <select data-perm="${p.key}">
          ${(p.levels || Object.keys(LEVELS)).map(l => `<option value="${l}"${(perms[p.key] || 'none') === l ? ' selected' : ''}>${LEVELS[l]}</option>`).join('')}
        </select>
      </div>`).join('');

    $('uMeta').textContent = user
      ? `أُنشئ في ${user.createdAt || '—'} — آخر دخول: ${user.lastLogin || 'لم يدخل بعد'}`
      : '';

    toggleRole();
    $('uError').textContent = '';
    $('userDialog').showModal();
    (user ? $('u_name') : $('u_name')).focus();
  }

  function toggleRole() {
    const admin = $('u_role').value === 'admin';
    $('uPermsWrap').classList.toggle('hide', admin);
    $('uDeptWrap').classList.toggle('hide', admin);
    $('uAdminNote').classList.toggle('hide', !admin);
  }

  async function save(event) {
    event.preventDefault();
    $('uError').textContent = '';

    const perms = {};
    document.querySelectorAll('#uPerms [data-perm]').forEach(s => { perms[s.dataset.perm] = s.value; });

    const payload = {
      isNew: !editing,
      username: $('u_username').value,
      name: $('u_name').value,
      password: $('u_password').value,
      role: $('u_role').value,
      dept: $('u_dept').value,
      active: $('u_active').checked,
      perms
    };

    if (payload.role !== 'admin' && !Object.values(perms).some(v => v !== 'none') &&
        !confirm('هذا الموظف ما عنده أي صفحة مسموحة، يعني ما بيشوف شي بعد الدخول. تبغى تحفظ؟')) return;

    const done = busy($('uSaveBtn'), 'جارٍ الحفظ…');
    try {
      const result = await API.saveUser(payload);
      users = users.filter(u => u.username !== result.user.username).concat(result.user);
      users.sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || a.name.localeCompare(b.name, 'ar'));
      render();
      if (result.user.username === currentUser.username) {
        currentUser = { ...currentUser, ...result.user };
        $('userName').textContent = currentUser.name;
      }
      $('userDialog').close();
      toast(result.message);
    } catch (err) {
      $('uError').textContent = err.message;
    } finally {
      done();
    }
  }

  async function remove() {
    if (!editing || !confirm('حذف حساب ' + editing.name + ' نهائيًا؟\nإذا تبغى توقفه مؤقتًا، شيل علامة «الحساب فعّال» بدل الحذف.')) return;
    const done = busy($('uDeleteBtn'), 'جارٍ الحذف…');
    try {
      await API.deleteUser(editing.username);
      users = users.filter(u => u.username !== editing.username);
      render();
      $('userDialog').close();
      toast('تم حذف حساب ' + editing.name);
    } catch (err) {
      $('uError').textContent = err.message;
    } finally {
      done();
    }
  }
})();
