(() => {
  'use strict';

  const cfg = window.SEHATAK_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);

  const loginView = $('#loginView');
  const appView = $('#appView');
  const pageContent = $('#pageContent');

  let supabase = null;
  let user = null;
  let employee = null;
  let currentPage = 'home';
  let loginInProgress = false;

  const esc = (value = '') =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const dateToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  function toast(message, bad = false) {
    const element = $('#toast');

    if (!element) {
      console[bad ? 'error' : 'log'](message);
      return;
    }

    element.textContent = message;
    element.className = 'toast' + (bad ? ' bad' : '');
    element.hidden = false;

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.hidden = true;
    }, 5000);
  }

  function initClient() {
    if (supabase) return true;

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      toast('مكتبة Supabase لم يتم تحميلها. راجع اتصال الإنترنت وملف index.html.', true);
      return false;
    }

    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) {
      toast('راجع SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY داخل config.js.', true);
      return false;
    }

    if (
      String(cfg.SUPABASE_URL).includes('PASTE_') ||
      String(cfg.SUPABASE_PUBLISHABLE_KEY).includes('PASTE_')
    ) {
      toast('بيانات Supabase داخل config.js ما زالت غير مكتملة.', true);
      return false;
    }

    try {
      supabase = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY
      );

      return true;
    } catch (error) {
      console.error('Supabase initialization error:', error);
      toast('تعذر تشغيل الاتصال بقاعدة البيانات.', true);
      return false;
    }
  }

  function showLogin() {
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach((button) => {
      button.classList.toggle(
        'active',
        button.dataset.page === page
      );
    });
  }

  function navigateTo(page) {
    if (!employee) {
      showLogin();
      return;
    }

    if (
      ['admin', 'employees', 'passwordLog'].includes(page) &&
      employee.role !== 'admin'
    ) {
      toast('هذه الصفحة متاحة للمدير فقط.', true);
      return;
    }

    currentPage = page;
    setActiveNav(page);

    const sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');

    renderPage(page);
  }

  function ensurePasswordNav() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;

    const nav = sidebar.querySelector('nav') || sidebar;

    if (!$('#passwordNavBtn')) {
      const button = document.createElement('button');

      button.type = 'button';
      button.id = 'passwordNavBtn';
      button.className = 'nav-item';
      button.dataset.page = 'password';
      button.textContent = 'تغيير كلمة المرور';

      nav.appendChild(button);
    }

    if (!$('#passwordLogNavBtn')) {
      const button = document.createElement('button');

      button.type = 'button';
      button.id = 'passwordLogNavBtn';
      button.className = 'nav-item admin-only';
      button.dataset.page = 'passwordLog';
      button.textContent = 'سجل تغييرات كلمات المرور';

      nav.appendChild(button);
    }

    const logButton = $('#passwordLogNavBtn');

    if (logButton) {
      logButton.hidden = employee?.role !== 'admin';
    }
  }

  function showApp() {
    if (!employee) {
      showLogin();
      return;
    }

    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;

    const sideName = $('#sideName');
    const sideCode = $('#sideCode');
    const sideBranch = $('#sideBranch');

    if (sideName) {
      sideName.textContent = 'مرحباً ' + employee.name;
    }

    if (sideCode) {
      sideCode.textContent = 'كود الموظف: ' + employee.code;
    }

    if (sideBranch) {
      sideBranch.textContent =
        'الفرع: ' + (employee.branch || '—') +
        ' · ' + (employee.department || '');
    }

    document.querySelectorAll('.admin-only').forEach((element) => {
      element.hidden = employee.role !== 'admin';
    });

    ensurePasswordNav();
    setActiveNav(currentPage);
    renderPage(currentPage);
  }

  async function loadEmployee() {
    const {
      data: { user: authUser } = {},
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Get user error:', authError);
      toast('تعذر التحقق من جلسة تسجيل الدخول: ' + authError.message, true);
      return false;
    }

    if (!authUser) {
      toast('لم يتم العثور على جلسة دخول صالحة.', true);
      return false;
    }

    user = authUser;

    const { data, error } = await supabase
      .from('employees')
      .select(
        'id,auth_user_id,code,name,branch,department,role,active'
      )
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Load employee error:', error);

      toast(
        'تعذر قراءة بيانات الموظف من قاعدة البيانات: ' + error.message,
        true
      );

      return false;
    }

    if (!data) {
      console.error(
        'No employee record linked to auth user:',
        user.id
      );

      toast(
        'تم تسجيل الدخول، لكن حساب المستخدم غير مربوط بموظف في جدول employees.',
        true
      );

      await supabase.auth.signOut();
      user = null;
      employee = null;

      return false;
    }

    if (!data.active) {
      toast('هذا الحساب غير نشط. تواصل مع المسؤول.', true);

      await supabase.auth.signOut();
      user = null;
      employee = null;

      return false;
    }

    employee = data;
    return true;
  }

  // تسجيل الدخول
  const loginForm = $('#loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (loginInProgress) return;

      loginInProgress = true;

      const submitButton = loginForm.querySelector(
        'button[type="submit"], input[type="submit"]'
      );

      const originalText = submitButton
        ? (
            submitButton.tagName === 'INPUT'
              ? submitButton.value
              : submitButton.textContent
          )
        : '';

      try {
        if (submitButton) {
          submitButton.disabled = true;

          if (submitButton.tagName === 'INPUT') {
            submitButton.value = 'جارٍ تسجيل الدخول...';
          } else {
            submitButton.textContent = 'جارٍ تسجيل الدخول...';
          }
        }

        if (!initClient()) {
          return;
        }

        const codeInput = $('#loginCode');
        const passwordInput = $('#loginPassword');

        if (!codeInput || !passwordInput) {
          throw new Error(
            'حقول تسجيل الدخول غير موجودة. تأكد من IDs داخل index.html.'
          );
        }

        const code = codeInput.value.trim();
        const password = passwordInput.value;

        if (!code || !password) {
          throw new Error('اكتب كود الموظف أو البريد الإلكتروني وكلمة المرور.');
        }

        const email = code.includes('@')
          ? code
          : `${code}@sehatak-fallahy.local`;

        console.log('Attempting sign in for:', email);

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error('Supabase sign-in error:', error);

          throw new Error(
            'تعذر تسجيل الدخول. ' +
            error.message
          );
        }

        if (!data || !data.user) {
          throw new Error(
            'لم يتم استلام بيانات الحساب بعد تسجيل الدخول.'
          );
        }

        user = data.user;

        const loaded = await loadEmployee();

        if (!loaded) {
          showLogin();
          return;
        }

        currentPage = 'home';
        showApp();
        toast('تم تسجيل الدخول بنجاح.');

      } catch (error) {
        console.error('Login error:', error);

        toast(
          error?.message ||
          'حدث خطأ غير متوقع أثناء تسجيل الدخول.',
          true
        );

        showLogin();

      } finally {
        loginInProgress = false;

        if (submitButton) {
          submitButton.disabled = false;

          if (submitButton.tagName === 'INPUT') {
            submitButton.value = originalText || 'تسجيل الدخول';
          } else {
            submitButton.textContent = originalText || 'تسجيل الدخول';
          }
        }
      }
    });
  } else {
    console.error('Login form #loginForm was not found.');
  }

  // تسجيل الخروج
  const logoutBtn = $('#logoutBtn');

  if (logoutBtn) {
    logoutBtn.textContent = 'تسجيل الخروج ↪';
    logoutBtn.style.display = 'inline-flex';
    logoutBtn.style.alignItems = 'center';
    logoutBtn.style.justifyContent = 'center';
    logoutBtn.style.minWidth = '120px';
    logoutBtn.style.fontSize = '14px';
    logoutBtn.style.color = '#ffffff';
    logoutBtn.style.background = '#00643f';
    logoutBtn.style.border = '1px solid #e5cf22';
    logoutBtn.style.borderRadius = '10px';
    logoutBtn.style.padding = '8px 12px';
    logoutBtn.style.whiteSpace = 'nowrap';

    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;

      try {
        if (supabase) {
          const { error } = await supabase.auth.signOut();

          if (error) {
            console.error('Logout error:', error);
            toast('تعذر تسجيل الخروج من الخادم: ' + error.message, true);
          }
        }
      } catch (error) {
        console.error('Logout error:', error);
        toast('حدث خطأ أثناء تسجيل الخروج.', true);
      } finally {
        user = null;
        employee = null;
        currentPage = 'home';

        showLogin();

        logoutBtn.disabled = false;
      }
    });
  }

  // القائمة الجانبية
  const menuToggle = $('#menuToggle');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      const sidebar = $('#sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
  }

  // التنقل بين الصفحات، بما فيها الأزرار التي تُضاف لاحقاً
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.nav-item');

    if (!button) return;

    const page = button.dataset.page;
    if (!page) return;

    navigateTo(page);
  });

  function heading(title, subtitle = '') {
    return `
      <div class="page-heading">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
    `;
  }

  function statsCard(label, value, subtitle = '') {
    return `
      <div class="stat">
        <span>${esc(label)}</span>
        <b>${esc(value)}</b>
        ${subtitle ? `<small>${esc(subtitle)}</small>` : ''}
      </div>
    `;
  }

  async function renderPage(page) {
    if (!employee || !pageContent) return;

    pageContent.innerHTML = heading('جارٍ التحميل...');

    try {
      switch (page) {
        case 'home':
          await renderHome();
          break;

        case 'report':
          await renderReport();
          break;

        case 'complaints':
          await renderComplaints();
          break;

        case 'admin':
          if (employee.role === 'admin') {
            await renderAdmin();
          } else {
            await renderHome();
          }
          break;

        case 'employees':
          if (employee.role === 'admin') {
            await renderEmployees();
          } else {
            await renderHome();
          }
          break;

        case 'password':
          await renderPasswordChange();
          break;

        case 'passwordLog':
          if (employee.role === 'admin') {
            await renderPasswordLog();
          } else {
            await renderHome();
          }
          break;

        default:
          currentPage = 'home';
          setActiveNav('home');
          await renderHome();
      }
    } catch (error) {
      console.error('Render page error:', error);

      pageContent.innerHTML = `
        ${heading('حدث خطأ')}
        <div class="panel">
          ${esc(error?.message || 'تعذر تحميل البيانات.')}
        </div>
        <button class="btn primary" id="retryPageBtn" type="button">
          إعادة المحاولة
        </button>
      `;

      const retryButton = $('#retryPageBtn');

      if (retryButton) {
        retryButton.onclick = () => renderPage(currentPage);
      }
    }
  }

  // تغيير كلمة المرور
  async function renderPasswordChange() {
    pageContent.innerHTML = `
      ${heading(
        'تغيير كلمة المرور',
        'غيّر كلمة مرور حسابك بأمان'
      )}

      <form id="passwordChangeForm" class="panel form-panel">
        <label>
          كلمة المرور الجديدة
          <input
            name="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            placeholder="8 أحرف على الأقل"
          >
        </label>

        <label>
          تأكيد كلمة المرور الجديدة
          <input
            name="confirmPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
            placeholder="أعد كتابة كلمة المرور الجديدة"
          >
        </label>

        <p class="hint">
          لن يتم حفظ كلمة المرور نفسها في سجل التغييرات.
        </p>

        <button class="btn primary full" type="submit">
          تغيير كلمة المرور
        </button>
      </form>
    `;

    const form = $('#passwordChangeForm');

    form.onsubmit = async (event) => {
      event.preventDefault();

      const newPassword = form.elements.newPassword.value;
      const confirmPassword = form.elements.confirmPassword.value;
      const button = form.querySelector('button[type="submit"]');

      if (newPassword.length < 8) {
        toast('كلمة المرور يجب أن تكون 8 أحرف على الأقل.', true);
        return;
      }

      if (newPassword !== confirmPassword) {
        toast('كلمتا المرور غير متطابقتين.', true);
        return;
      }

      if (!supabase || !employee || !user) {
        toast('انتهت الجلسة. سجّل الدخول مرة أخرى.', true);
        return;
      }

      button.disabled = true;
      button.textContent = 'جارٍ تغيير كلمة المرور...';

      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });

        if (error) {
          toast('تعذر تغيير كلمة المرور: ' + error.message, true);
          return;
        }

        const { error: logError } = await supabase
          .from('password_change_log')
          .insert({
            employee_id: employee.id,
            status: 'success'
          });

        form.reset();

        if (logError) {
          console.error(
            'Password changed but log insert failed:',
            logError
          );

          toast(
            'تم تغيير كلمة المرور، لكن تعذر تسجيل العملية في السجل.',
            true
          );
        } else {
          toast('تم تغيير كلمة المرور وتسجيل العملية بنجاح.');
        }
      } catch (error) {
        console.error('Password change error:', error);
        toast('حدث خطأ غير متوقع أثناء تغيير كلمة المرور.', true);
      } finally {
        button.disabled = false;
        button.textContent = 'تغيير كلمة المرور';
      }
    };
  }

  // سجل تغييرات كلمات المرور للمدير
  async function renderPasswordLog() {
    if (employee.role !== 'admin') {
      pageContent.innerHTML =
        heading('غير مسموح') +
        '<div class="panel">هذه الصفحة للمدير فقط.</div>';

      return;
    }

    const { data, error } = await supabase
      .from('password_change_log')
      .select('employee_id,changed_at,status,employees(name,code)')
      .order('changed_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    pageContent.innerHTML = `
      ${heading(
        'سجل تغييرات كلمات المرور',
        'آخر 100 عملية مسجلة'
      )}

      <div class="list">
        ${(data || []).map((item) => `
          <div class="list-row">
            <div class="grow">
              <b>${esc(item.employees?.name || 'موظف غير معروف')}</b>
              <small>
                الكود: ${esc(item.employees?.code || '—')}
              </small>
              <small>
                التاريخ:
                ${esc(
                  item.changed_at
                    ? new Date(item.changed_at).toLocaleString('ar-EG')
                    : '—'
                )}
              </small>
            </div>

            <span class="pill ${
              item.status === 'success' ? 'done' : 'review'
            }">
              ${item.status === 'success' ? 'تم التغيير' : 'لم يكتمل'}
            </span>
          </div>
        `).join('') ||
        '<div class="empty">لا توجد عمليات مسجلة.</div>'}
      </div>
    `;
  }

  // الصفحة الرئيسية
  async function renderHome() {
    const isAdmin = employee.role === 'admin';

    let reportsQuery = supabase
      .from('reports')
      .select('id', { count: 'exact', head: true });

    if (!isAdmin) {
      reportsQuery = reportsQuery.eq('employee_id', employee.id);
    }

    let complaintsQuery = supabase
      .from('complaints')
      .select('id,status');

    if (!isAdmin) {
      complaintsQuery = complaintsQuery.eq('employee_id', employee.id);
    }

    const [reportsResult, complaintsResult, employeesResult] =
      await Promise.all([
        reportsQuery,
        complaintsQuery,
        isAdmin
          ? supabase
              .from('employees')
              .select('id', { count: 'exact', head: true })
              .eq('active', true)
          : Promise.resolve({ count: 1, error: null })
      ]);

    if (reportsResult.error) throw reportsResult.error;
    if (complaintsResult.error) throw complaintsResult.error;

    if (employeesResult.error) throw employeesResult.error;

    const complaints = complaintsResult.data || [];

    const openComplaints = complaints.filter(
      (item) => item.status === 'قيد المراجعة'
    ).length;

    const resolvedComplaints = complaints.filter(
      (item) => item.status === 'تم الحل'
    ).length;

    pageContent.innerHTML = `
      ${heading('الرئيسية', 'ملخص سريع لحسابك')}

      <div class="welcome-card">
        <div>
          <h2>مرحباً ${esc(employee.name)}</h2>
          <p>كود الموظف: ${esc(employee.code)}</p>
          <small>
            الفرع: ${esc(employee.branch || '—')} ·
            ${esc(employee.department || '')}
          </small>
        </div>

        <div class="avatar big">●</div>
      </div>

      <div class="quick-grid">
        <button class="quick green" data-go="report" type="button">
          <span class="round-icon">▤</span>
          <b>التقرير اليومي</b>
          <small>سجل أعمالك اليومية</small>
        </button>

        <button class="quick" data-go="complaints" type="button">
          <span class="round-icon">☏</span>
          <b>الشكاوى</b>
          <small>قدم شكوى أو تابعها</small>
        </button>
      </div>

      <h3>معلومات سريعة</h3>

      <div class="stats-grid">
        ${statsCard(
          'التقارير اليومية',
          reportsResult.count ?? 0,
          'إجمالي التقارير المحفوظة'
        )}

        ${statsCard(
          'الشكاوى قيد المراجعة',
          openComplaints
        )}

        ${statsCard(
          'الشكاوى التي تم حلها',
          resolvedComplaints
        )}

        ${
          isAdmin
            ? statsCard(
                'إجمالي الموظفين',
                employeesResult.count ?? 0
              )
            : ''
        }
      </div>
    `;

    pageContent.querySelectorAll('[data-go]').forEach((button) => {
      button.onclick = () => navigateTo(button.dataset.go);
    });
  }

  // التقرير اليومي
  async function renderReport() {
    const { data: rows, error } = await supabase
      .from('reports')
      .select('id,report_date,task_code,status,created_at')
      .eq('employee_id', employee.id)
      .order('report_date', { ascending: false })
      .limit(8);

    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('التقرير اليومي', 'سجل أعمالك اليومية')}

      <form id="reportForm" class="panel form-panel">
        <div class="form-grid">
          <label>
            التاريخ
            <input
              type="date"
              name="report_date"
              value="${dateToday()}"
              required
            >
          </label>

          <label>
            رمز المهمة / الكود
            <input
              name="task_code"
              placeholder="أدخل كود المهمة"
            >
          </label>
        </div>

        <h3>أولاً: المهام المنفذة اليوم</h3>

        <div id="tasks">
          <div class="task-row">
            <input
              name="task_name"
              placeholder="المهمة"
              required
            >
            <input
              name="task_qty"
              type="number"
              min="0"
              placeholder="الكمية / العدد"
            >
            <input
              name="task_note"
              placeholder="ملاحظات"
            >
          </div>
        </div>

        <button type="button" id="addTask" class="outline">
          ＋ إضافة مهمة أخرى
        </button>

        <label>
          ثانياً: ما لم يتم اليوم
          <textarea
            name="remaining"
            placeholder="اكتب ما لم يتم مع السبب إن وجد"
          ></textarea>
        </label>

        <label>
          ثالثاً: خطة العمل لليوم القادم
          <textarea
            name="next_plan"
            placeholder="اكتب خطة العمل لليوم القادم"
          ></textarea>
        </label>

        <label>
          رابعاً: المعوقات التي واجهتك
          <textarea
            name="obstacles"
            placeholder="اكتب المعوقات أو المشاكل"
          ></textarea>
        </label>

        <button class="btn primary full" type="submit">
          حفظ التقرير ▣
        </button>
      </form>

      <h3>آخر تقاريرك</h3>

      <div class="list">
        ${(rows || []).map((row) => `
          <div class="list-row">
            <div>
              <b>تقرير يوم ${esc(row.report_date)}</b>
              <small>رمز المهمة: ${esc(row.task_code || '—')}</small>
            </div>

            <span class="pill done">
              ${esc(row.status || 'مكتمل')}
            </span>
          </div>
        `).join('') ||
        '<div class="empty">لا توجد تقارير محفوظة بعد.</div>'}
      </div>
    `;

    $('#addTask').onclick = () => {
      const row = document.createElement('div');
      row.className = 'task-row';

      row.innerHTML = `
        <input name="task_name" placeholder="المهمة" required>
        <input
          name="task_qty"
          type="number"
          min="0"
          placeholder="الكمية / العدد"
        >
        <input name="task_note" placeholder="ملاحظات">
      `;

      $('#tasks').appendChild(row);
    };

    $('#reportForm').onsubmit = async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);

      const names = formData.getAll('task_name');
      const quantities = formData.getAll('task_qty');
      const notes = formData.getAll('task_note');

      const tasks = names
        .map((name, index) => ({
          name: String(name).trim(),
          qty: quantities[index] || '',
          note: notes[index] || ''
        }))
        .filter((task) => task.name);

      if (!tasks.length) {
        toast('أدخل مهمة واحدة على الأقل.', true);
        return;
      }

      const payload = {
        employee_id: employee.id,
        report_date: formData.get('report_date'),
        task_code: formData.get('task_code') || null,
        tasks,
        remaining: formData.get('remaining') || null,
        next_plan: formData.get('next_plan') || null,
        obstacles: formData.get('obstacles') || null,
        status: 'مكتمل'
      };

      submitButton.disabled = true;
      submitButton.textContent = 'جارٍ حفظ التقرير...';

      try {
        const { error: insertError } = await supabase
          .from('reports')
          .insert(payload);

        if (insertError) {
          toast('لم يتم حفظ التقرير: ' + insertError.message, true);
          return;
        }

        toast('تم حفظ التقرير اليومي بنجاح.');
        await renderReport();

      } catch (error) {
        console.error('Save report error:', error);
        toast('حدث خطأ أثناء حفظ التقرير.', true);
      } finally {
        const currentButton = $('#reportForm button[type="submit"]');

        if (currentButton) {
          currentButton.disabled = false;
          currentButton.textContent = 'حفظ التقرير ▣';
        }
      }
    };
  }

  // الشكاوى
  async function renderComplaints() {
    let query = supabase
      .from('complaints')
      .select(
        'id,employee_id,kind,title,details,status,created_at,employees(name,code)'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (employee.role !== 'admin') {
      query = query.eq('employee_id', employee.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('الشكاوى', 'متابعة الشكاوى وحالاتها')}

      <div class="panel form-panel">
        <h3>تقديم شكوى جديدة</h3>

        <form id="complaintForm">
          <label>
            نوع الشكوى
            <select name="kind" required>
              <option value="">اختر نوع الشكوى</option>
              <option>مشكلة في التوريد</option>
              <option>نقص في الأدوات</option>
              <option>مشكلة في المواصلات</option>
              <option>مشكلة إدارية</option>
              <option>أخرى</option>
            </select>
          </label>

          <label>
            العنوان المختصر
            <input
              name="title"
              required
              placeholder="اكتب عنوان الشكوى"
            >
          </label>

          <label>
            تفاصيل الشكوى
            <textarea
              name="details"
              required
              placeholder="اكتب تفاصيل الشكوى بوضوح"
            ></textarea>
          </label>

          <button class="btn primary full" type="submit">
            إرسال الشكوى ➤
          </button>
        </form>
      </div>

      <div class="list">
        ${(data || []).map((item) => `
          <div class="complaint-row">
            <div class="complaint-main">
              <b>${esc(item.title)}</b>

              <small>
                ${esc(item.kind)} ·
                ${esc((item.created_at || '').slice(0, 10))}

                ${
                  employee.role === 'admin' && item.employees
                    ? ` · ${esc(item.employees.name)} (${esc(item.employees.code)})`
                    : ''
                }
              </small>

              <p>${esc(item.details)}</p>
            </div>

            <span class="pill ${
              item.status === 'تم الحل'
                ? 'done'
                : item.status === 'مرفوضة'
                  ? 'rejected'
                  : 'review'
            }">
              ${esc(item.status || 'قيد المراجعة')}
            </span>

            ${
              employee.role === 'admin'
                ? `
                  <select data-status-id="${esc(item.id)}">
                    <option value="قيد المراجعة" ${
                      item.status === 'قيد المراجعة' ? 'selected' : ''
                    }>قيد المراجعة</option>

                    <option value="تم الحل" ${
                      item.status === 'تم الحل' ? 'selected' : ''
                    }>تم الحل</option>

                    <option value="مرفوضة" ${
                      item.status === 'مرفوضة' ? 'selected' : ''
                    }>مرفوضة</option>
                  </select>
                `
                : ''
            }
          </div>
        `).join('') ||
        '<div class="empty">لا توجد شكاوى حتى الآن.</div>'}
      </div>
    `;

    $('#complaintForm').onsubmit = async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);

      submitButton.disabled = true;
      submitButton.textContent = 'جارٍ إرسال الشكوى...';

      try {
        const { error: insertError } = await supabase
          .from('complaints')
          .insert({
            employee_id: employee.id,
            kind: formData.get('kind'),
            title: String(formData.get('title')).trim(),
            details: String(formData.get('details')).trim(),
            status: 'قيد المراجعة',
            attachment_paths: []
          });

        if (insertError) {
          toast('لم يتم إرسال الشكوى: ' + insertError.message, true);
          return;
        }

        toast('تم إرسال الشكوى بنجاح.');
        await renderComplaints();

      } catch (error) {
        console.error('Submit complaint error:', error);
        toast('حدث خطأ أثناء إرسال الشكوى.', true);
      } finally {
        const currentButton = $('#complaintForm button[type="submit"]');

        if (currentButton) {
          currentButton.disabled = false;
          currentButton.textContent = 'إرسال الشكوى ➤';
        }
      }
    };

    pageContent.querySelectorAll('[data-status-id]').forEach((select) => {
      select.onchange = async () => {
        if (employee.role !== 'admin') return;

        select.disabled = true;

        try {
          const { error: updateError } = await supabase
            .from('complaints')
            .update({
              status: select.value,
              updated_at: new Date().toISOString()
            })
            .eq('id', select.dataset.statusId);

          if (updateError) {
            toast('تعذر تحديث الحالة: ' + updateError.message, true);
            return;
          }

          toast('تم تحديث حالة الشكوى.');
          await renderComplaints();

        } catch (error) {
          console.error('Update complaint error:', error);
          toast('حدث خطأ أثناء تحديث حالة الشكوى.', true);
        } finally {
          select.disabled = false;
        }
      };
    });
  }

  // لوحة الإدارة
  async function renderAdmin() {
    if (employee.role !== 'admin') {
      pageContent.innerHTML =
        heading('غير مسموح') +
        '<div class="panel">هذه الصفحة للمدير فقط.</div>';

      return;
    }

    const [employeesResult, reportsResult, complaintsResult] =
      await Promise.all([
        supabase
          .from('employees')
          .select(
            'id,code,name,branch,department,role,active',
            { count: 'exact' }
          )
          .order('code'),

        supabase
          .from('reports')
          .select('id', { count: 'exact', head: true }),

        supabase
          .from('complaints')
          .select('id,status')
      ]);

    if (employeesResult.error) throw employeesResult.error;
    if (reportsResult.error) throw reportsResult.error;
    if (complaintsResult.error) throw complaintsResult.error;

    const complaints = complaintsResult.data || [];

    pageContent.innerHTML = `
      ${heading(
        'لوحة الإدارة المركزية',
        'متابعة التقارير والشكاوى'
      )}

      <div class="stats-grid admin-stats">
        ${statsCard(
          'إجمالي الموظفين',
          employeesResult.count ?? (employeesResult.data || []).length
        )}

        ${statsCard(
          'التقارير اليومية',
          reportsResult.count ?? 0
        )}

        ${statsCard(
          'الشكاوى الجديدة',
          complaints.filter(
            (item) => item.status === 'قيد المراجعة'
          ).length
        )}

        ${statsCard(
          'الشكاوى المحلولة',
          complaints.filter(
            (item) => item.status === 'تم الحل'
          ).length
        )}
      </div>

      <h3>الموظفون</h3>

      <div class="list">
        ${(employeesResult.data || []).map((item) => `
          <div class="list-row">
            <div class="avatar">●</div>

            <div class="grow">
              <b>${esc(item.name)}</b>

              <small>
                كود: ${esc(item.code)} ·
                ${esc(item.branch || '—')} -
                ${esc(item.department || '')}
              </small>
            </div>

            <span class="pill ${item.active ? 'done' : 'rejected'}">
              ${item.active ? 'نشط' : 'غير نشط'}
            </span>
          </div>
        `).join('') ||
        '<div class="empty">لا توجد سجلات موظفين.</div>'}
      </div>

      <p class="hint">
        إضافة الموظفين وربط حساباتهم تتم من لوحة Supabase الإدارية
        لضمان عدم كشف صلاحيات حساسة في المتصفح.
      </p>
    `;
  }

  // تقارير الموظفين
  async function renderEmployees() {
    if (employee.role !== 'admin') {
      pageContent.innerHTML =
        heading('غير مسموح') +
        '<div class="panel">هذه الصفحة للمدير فقط.</div>';

      return;
    }

    const [employeesResult, reportsResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id,code,name,branch,department,active')
        .order('code'),

      supabase
        .from('reports')
        .select('employee_id,report_date,status')
        .order('report_date', { ascending: false })
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (reportsResult.error) throw reportsResult.error;

    const lastReport = {};

    (reportsResult.data || []).forEach((report) => {
      if (!lastReport[report.employee_id]) {
        lastReport[report.employee_id] = report;
      }
    });

    pageContent.innerHTML = `
      ${heading(
        'تقارير الموظفين',
        'متابعة الموظفين وآخر تقاريرهم'
      )}

      <input
        id="employeeSearch"
        class="search-input"
        placeholder="ابحث بالاسم أو الكود أو الفرع..."
      >

      <div id="employeeList" class="list"></div>
    `;

    const draw = () => {
      const search = $('#employeeSearch').value
        .trim()
        .toLowerCase();

      $('#employeeList').innerHTML =
        (employeesResult.data || [])
          .filter((item) =>
            [
              item.name,
              item.code,
              item.branch,
              item.department
            ].some((value) =>
              String(value || '').toLowerCase().includes(search)
            )
          )
          .map((item) => {
            const report = lastReport[item.id];

            return `
              <div class="list-row">
                <div class="avatar">●</div>

                <div class="grow">
                  <b>${esc(item.name)}</b>

                  <small>
                    كود: ${esc(item.code)} ·
                    ${esc(item.branch || '—')} -
                    ${esc(item.department || '')}
                  </small>

                  <small>
                    آخر تقرير:
                    ${esc(report?.report_date || 'لا يوجد تقرير')}
                  </small>
                </div>

                <span class="pill ${report ? 'done' : 'review'}">
                  ${esc(report?.status || 'لا يوجد تقرير')}
                </span>
              </div>
            `;
          })
          .join('') ||
        '<div class="empty">لا توجد نتائج.</div>';
    };

    $('#employeeSearch').oninput = draw;
    draw();
  }

  // بدء التطبيق واستعادة الجلسة السابقة
  async function startApp() {
    if (!loginView || !appView || !pageContent) {
      console.error(
        'Required HTML elements are missing:',
        {
          loginView: Boolean(loginView),
          appView: Boolean(appView),
          pageContent: Boolean(pageContent)
        }
      );

      toast(
        'بعض عناصر الصفحة غير موجودة. تأكد من استخدام index.html الصحيح.',
        true
      );

      return;
    }

    if (!initClient()) {
      showLogin();
      return;
    }

    try {
      const {
        data,
        error
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Get session error:', error);
        toast('تعذر استعادة جلسة الدخول: ' + error.message, true);
        showLogin();
        return;
      }

      if (data?.session) {
        const loaded = await loadEmployee();

        if (loaded) {
          showApp();
          return;
        }
      }

      showLogin();

    } catch (error) {
      console.error('Application startup error:', error);

      toast(
        'تعذر تشغيل التطبيق: ' +
        (error?.message || 'خطأ غير معروف'),
        true
      );

      showLogin();
    }
  }

  startApp();
})();
