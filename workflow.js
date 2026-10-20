/**
 * صفحة: خريطة سير العمل (تظهر لكل الموظفين من زر «سير العمل» فوق)
 * كل خطوة مربوطة بصفحتها: إذا عند الموظف صلاحيتها تتعلّم «من صلاحيتك» ويقدر يضغطها.
 */
(function () {
  const PHASES = [
    {
      title: 'المشتريات', color: 'p1',
      steps: [
        { page: 'models', need: 'edit', title: 'تسجيل الموديل', who: 'قاعدة الموديلات',
          what: 'مرة وحدة لكل موديل: المصنع، العلامة، الكمية في الحاوية، شهادة SASO.',
          out: 'بياناته تتعبّى تلقائيًا في أوامر الشراء' },
        { page: 'orders', need: 'edit', title: 'إدخال أمر الشراء', who: 'أوامر الشراء',
          what: 'رقم الأمر، القسم، المورد، والبنود (الموديل والكمية والسعر).',
          out: 'الأمر يصير «بانتظار الاعتماد»' },
        { page: 'orders', need: 'full', title: 'اعتماد الأمر', who: 'أوامر الشراء (صلاحية كاملة)',
          what: 'مراجعة الأمر واعتماده.', gate: 'ما ينطلب شحن من أمر غير معتمد',
          out: 'الأمر «معتمد» ومتاح للشحن' }
      ]
    },
    {
      title: 'التصنيع والشحن', color: 'p2',
      steps: [
        { page: 'shipments', need: 'edit', title: 'طلب الشحن', who: 'طلبات الشحن',
          what: 'من أمر معتمد: الكمية لكل موديل، رقم الفاتورة، ميناء التحميل، تاريخ الجاهزية.',
          out: '«قيد التصنيع» ثم «جاهزة للشحن» تلقائيًا حسب التاريخ' },
        { page: 'shipments', need: 'edit', title: 'فحص ما قبل الشحن', who: 'طلبات الشحن',
          what: 'تسجيل نتيجة الفحص والجهة (مجتاز / مرفوض / معفى).',
          gate: 'ما يتعمّد الشحن إلا بفحص «مجتاز» أو «معفى»' },
        { page: 'shipments', need: 'full', title: 'تعميد الشحن', who: 'طلبات الشحن (صلاحية كاملة)',
          what: 'تاريخ الشحن، ميناء الوصول، رقم الاعتماد، فترة السماح.',
          gate: 'كل الحقول مطلوبة',
          out: 'رقم تسلسل + سطور الحاويات تنعمل تلقائيًا' }
      ]
    },
    {
      title: 'الوصول والتخليص', color: 'p3',
      steps: [
        { page: 'shipped', need: 'edit', title: 'متابعة الشحنة', who: 'البضاعة المشحونة',
          what: 'الوصول المتوقع، الوسيط، المخلص الجمركي.', out: 'تظهر في «الوصول خلال 14 يوم»' },
        { page: 'containers', need: 'edit', title: 'أرقام الحاويات والتفريغ', who: 'متابعة الحاويات',
          what: 'رقم كل حاوية وتاريخ تفريغها.',
          out: 'يبدأ عدّ فترة السماح: آخر يوم = التفريغ + فترة السماح' },
        { page: 'containers', need: 'edit', title: 'البيان الجمركي', who: 'متابعة الحاويات + ملفات الشحنات',
          what: 'رقم البيان لكل حاوية (فيه تعديل جماعي)، ثم تاريخ البيان والفسح في ملف الشحنة.',
          out: 'الملف «مفسوحة جزئيًا» ثم «مفسوحة»' }
      ]
    },
    {
      title: 'الاستلام والإقفال', color: 'p4',
      steps: [
        { page: 'receive', need: 'edit', title: 'الاستلام بالمستودع', who: 'استلام الحاويات',
          what: 'البحث برقم الحاوية، وتسجيل التاريخ والكمية المستلمة والمستودع.',
          out: 'الحاوية «استلمت»' },
        { page: 'containers', need: 'edit', title: 'إرجاع الفارغ', who: 'متابعة الحاويات',
          what: 'تاريخ إرجاع الحاوية الفارغة.',
          gate: 'بعد آخر يوم مجاني تبدأ الأرضيات' },
        { page: 'files', need: 'full', title: 'إقفال ملف الشحنة', who: 'ملفات الشحنات (صلاحية كاملة)',
          what: 'المستندات، التكاليف، التكلفة الواصلة لكل موديل.',
          gate: 'بيان مفسوح لكل حاوية + كل الحاويات مستلمة + ما فيه مطالبة مفتوحة',
          out: 'الملف «مقفل» ✓' }
      ]
    }
  ];

  registerPage({ key: 'workflow', title: 'خريطة سير العمل', icon: ICONS.workflow, everyone: true, init, show });

  function init() {
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

  function show() {
    let n = 0;
    $('wfMap').innerHTML = PHASES.map((ph, pi) => `
      <section class="wf-phase ${ph.color}">
        <header><span class="wf-phase-no">${pi + 1}</span><h2>${ph.title}</h2></header>
        ${ph.steps.map(st => {
          n++;
          const mine = can(st.page, st.need);
          return `
          <div class="wf-step ${mine ? 'mine' : ''}" ${mine ? `data-go="${st.page}" role="button" tabindex="0"` : ''}>
            <div class="wf-top">
              <span class="wf-no">${n}</span>
              <b>${st.title}</b>
              ${mine ? '<span class="tag ok">من صلاحيتك</span>' : ''}
            </div>
            <p class="wf-who">📍 ${st.who}</p>
            <p class="wf-what">${st.what}</p>
            ${st.gate ? `<p class="wf-gate">⛔ ${st.gate}</p>` : ''}
            ${st.out ? `<p class="wf-out">← ${st.out}</p>` : ''}
          </div>`;
        }).join('<div class="wf-down" aria-hidden="true"></div>')}
      </section>`).join('<div class="wf-next" aria-hidden="true"><span>←</span></div>');
  }

  // Enter على الخطوة يفتحها (للوحة المفاتيح)
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('.wf-step[data-go]')) e.target.click();
  });
})();
