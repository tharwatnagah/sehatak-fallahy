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
  let reportRows = [];

  const PAGE_PERMISSIONS = {
    home: 'الرئيسية',
    report: 'التقرير اليومي',
    complaints: 'الشكاوى والمقترحات',
    employeeReports: 'تقارير الموظفين',
    employees: 'إضافة الموظفين',
    permissions: 'إدارة الصلاحيات',
    admin: 'لوحة الإدارة',
    password: 'تغيير كلمة المرور',
    passwordLog: 'سجل تغييرات كلمات المرور'
  };

  const DEFAULT_PERMISSIONS = {
    employee: {
      home: true, report: true, complaints: true,
      employeeReports: false, employees: false,
      permissions: false, admin: false, password: true,
      passwordLog: false
    },
    manager: {
      home: true, report: true, complaints: true,
      employeeReports: true, employees: false,
      permissions: false, admin: false, password: true,
      passwordLog: false
    },
    admin: {
      home: true, report: true, complaints: true,
      employeeReports: true, employees: true,
      permissions: true, admin: true, password: true,
      passwordLog: true
    }
  };

  const esc = (value = '') =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;'
    })[c]);

  const dateToday = () => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  };

  const isAdmin = () => employee?.role === 'admin';
  const isManager = () => ['admin', 'manager'].includes(employee?.role);
  const canManageEmployees = () => hasPermission('employees');

  function getPermissions(item = employee) {
    const role = item?.role || 'employee';
    const defaults = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.employee;
    const saved = item?.permissions;

    return {
      ...defaults,
      ...(saved && typeof saved === 'object' ? saved : {})
    };
  }

  function hasPermission(page, item = employee) {
    if (!item || !Object.prototype.hasOwnProperty.call(PAGE_PERMISSIONS, page)) {
      return false;
    }

    return getPermissions(item)[page] === true;
  }

  function requirePermission(page) {
    if (hasPermission(page)) return true;

    toast('ليس لديك صلاحية الوصول إلى صفحة «' +
      (PAGE_PERMISSIONS[page] || page) + '».', true);

    return false;
  }

  function toast(message, bad = false) {
    const box = $('#toast');

    if (!box) {
      alert(message);
      return;
    }

    box.textContent = message;
    box.className = 'toast' + (bad ? ' bad' : '');
    box.hidden = false;

    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.hidden = true;
    }, 4500);
  }

  function initClient() {
    if (
      !window.supabase ||
      !cfg.SUPABASE_URL ||
      !cfg.SUPABASE_PUBLISHABLE_KEY
    ) {
      toast('راجع إعدادات Supabase داخل config.js.', true);
      return false;
    }

    if (!supabase) {
      supabase = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY
      );
    }

    return true;
  }

  function showLogin() {
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
  }

  function applyPermissions() {
    document.querySelectorAll('.nav-item').forEach((button) => {
      const page = button.dataset.page;
      button.hidden = !hasPermission(page);
      button.disabled = !hasPermission(page);
    });

    document.querySelectorAll('.admin-only').forEach((element) => {
      element.hidden = !isAdmin();
    });

    document.querySelectorAll('.manager-only').forEach((element) => {
      element.hidden = !isManager();
    });

    document.querySelectorAll('.reports-only').forEach((element) => {
      element.hidden = !hasPermission('employeeReports');
    });
  }

  function showApp() {
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;

    if ($('#sideName')) {
      $('#sideName').textContent = 'مرحباً ' + employee.name;
    }

    if ($('#sideCode')) {
      $('#sideCode').textContent = 'كود الموظف: ' + employee.code;
    }

    if ($('#sideBranch')) {
      $('#sideBranch').textContent =
        'الفرع: ' + (employee.branch || '—') +
        ' · ' + (employee.department || '');
    }

    if ($('#employeeName')) {
      $('#employeeName').textContent = employee.name || '';
    }

    if ($('#employeeRole')) {
      $('#employeeRole').textContent =
        employee.role === 'admin' ? 'مسؤول النظام' :
        employee.role === 'manager' ? 'مدير تقارير' : 'موظف';
    }

    if ($('#headerEmployeeName')) {
      $('#headerEmployeeName').textContent = employee.name || '';
    }

    applyPermissions();

    if (!hasPermission(currentPage)) {
      currentPage = hasPermission('home')
        ? 'home'
        : Object.keys(PAGE_PERMISSIONS).find((page) => hasPermission(page));

      if (!currentPage) {
        pageContent.innerHTML =
          heading('لا توجد صفحات متاحة') +
          panel('لم يتم منح حسابك صلاحية لأي صفحة. تواصل مع مسؤول النظام.');
        return;
      }
    }

    updateActiveNav();
    renderPage(currentPage);
  }

  function updateActiveNav() {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === currentPage);
    });
  }

  async function loadEmployee() {
    const {
      data: { user: authUser },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !authUser) return false;

    user = authUser;

    const { data, error } = await supabase
      .from('employees')
      .select('id,auth_user_id,code,name,branch,department,role,active,permissions')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast('تعذر قراءة بيانات الموظف: ' + error.message, true);
      return false;
    }

    if (!data || !data.active) {
      await supabase.auth.signOut();
      toast('الحساب غير نشط أو غير مربوط بموظف.', true);
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

      if (!initClient()) return;

      const code = $('#loginCode')?.value.trim();
      const password = $('#loginPassword')?.value;

      if (!code || !password) {
        toast('اكتب كود الموظف وكلمة المرور.', true);
        return;
      }

      const email = code.includes('@')
        ? code
        : code + '@sehatak-fallahy.local';

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error('Login error:', error);
          toast('تعذر تسجيل الدخول. راجع الكود وكلمة المرور.', true);
          return;
        }

        if (await loadEmployee()) {
          currentPage = hasPermission('home')
            ? 'home'
            : Object.keys(PAGE_PERMISSIONS).find((page) => hasPermission(page));

          showApp();
        } else {
          showLogin();
        }
      } catch (error) {
        console.error('Unexpected login error:', error);
        toast('حدث خطأ أثناء تسجيل الدخول. راجع Console.', true);
      }
    });
  }

  // تسجيل الخروج
  const logoutBtn = $('#logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (supabase) await supabase.auth.signOut();

      user = null;
      employee = null;
      currentPage = 'home';
      showLogin();
    });
  }

  // فتح القائمة الجانبية
  const menuToggle = $('#menuToggle');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      $('#sidebar')?.classList.toggle('open');
    });
  }

  // التنقل بين الصفحات
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      if (!employee) return;

      const page = button.dataset.page;
      if (!requirePermission(page)) return;

      currentPage = page;
      $('#sidebar')?.classList.remove('open');
      updateActiveNav();
      renderPage(currentPage);
    });
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

  function panel(message) {
    return `<div class="panel">${esc(message)}</div>`;
  }

  async function renderPage(page) {
    if (!employee || !pageContent) return;

    if (!requirePermission(page)) {
      currentPage = hasPermission('home') ? 'home' : currentPage;

      if (hasPermission(currentPage) && currentPage !== page) {
        updateActiveNav();
        return renderPage(currentPage);
      }

      pageContent.innerHTML =
        heading('غير مسموح') + panel('ليس لديك صلاحية عرض هذه الصفحة.');
      return;
    }

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
          await renderAdmin();
          break;
        case 'employees':
          await renderEmployees();
          break;
        case 'permissions':
          await renderPermissions();
          break;
        case 'employeeReports':
          await renderEmployeeReports();
          break;
        case 'password':
          renderPassword();
          break;
        case 'passwordLog':
          await renderPasswordLog();
          break;
        default:
          throw new Error('الصفحة غير موجودة.');
      }
    } catch (error) {
      console.error(error);
      pageContent.innerHTML =
        heading('حدث خطأ') +
        panel(error.message || 'تعذر تحميل البيانات.');
    }
  }

  function goToPage(page) {
    if (!requirePermission(page)) return;

    currentPage = page;
    updateActiveNav();
    $('#sidebar')?.classList.remove('open');
    renderPage(page);
  }

  // الصفحة الرئيسية
  async function renderHome() {
    let reportsQuery = supabase
      .from('reports')
      .select('id', { count: 'exact', head: true });

    let complaintsQuery = supabase
      .from('complaints')
      .select('id,status');

    if (!isManager()) {
      reportsQuery = reportsQuery.eq('employee_id', employee.id);
      complaintsQuery = complaintsQuery.eq('employee_id', employee.id);
    }

    const [reportsResult, complaintsResult, employeesResult] =
      await Promise.all([
        reportsQuery,
        complaintsQuery,
        hasPermission('admin')
          ? supabase.from('employees').select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: null })
      ]);

    if (reportsResult.error) throw reportsResult.error;
    if (complaintsResult.error) throw complaintsResult.error;
    if (employeesResult.error) throw employeesResult.error;

    const complaints = complaintsResult.data || [];
    const open = complaints.filter((item) => item.status === 'قيد المراجعة').length;
    const resolved = complaints.filter((item) => item.status === 'تم الحل').length;

    const quickPages = [
      ['report', 'التقرير اليومي', 'سجل أعمالك اليومية', 'green'],
      ['complaints', 'الشكاوى والمقترحات', 'تقديم شكوى ومتابعتها', ''],
      ['employeeReports', 'تقارير الموظفين', 'عرض التقارير حسب الفترة', ''],
      ['employees', 'إضافة الموظفين', 'إنشاء حساب موظف جديد', ''],
      ['permissions', 'إدارة الصلاحيات', 'التحكم في صفحات كل موظف', ''],
      ['admin', 'لوحة الإدارة', 'ملخص النظام', ''],
      ['password', 'تغيير كلمة المرور', 'تحديث كلمة مرور حسابك', ''],
      ['passwordLog', 'سجل تغييرات كلمات المرور', 'مراجعة سجل التغييرات', '']
    ].filter(([page]) => hasPermission(page));

    pageContent.innerHTML = `
      ${heading('الرئيسية', 'ملخص سريع لحسابك')}

      <div class="welcome-card">
        <div>
          <h2>مرحباً ${esc(employee.name)}</h2>
          <p>كود الموظف: ${esc(employee.code)}</p>
          <small>
            الفرع: ${esc(employee.branch || '—')}
            · ${esc(employee.department || '')}
          </small>
        </div>
      </div>

      <div class="quick-grid">
        ${quickPages.map(([page, title, subtitle, style]) => `
          <button class="quick ${style}" data-go="${esc(page)}" type="button">
            <b>${esc(title)}</b>
            <small>${esc(subtitle)}</small>
          </button>
        `).join('')}
      </div>

      <h3>معلومات سريعة</h3>
      <div class="stats-grid">
        ${hasPermission('report') ? statsCard('التقارير اليومية', reportsResult.count ?? 0) : ''}
        ${hasPermission('complaints') ? statsCard('الشكاوى قيد المراجعة', open) : ''}
        ${hasPermission('complaints') ? statsCard('الشكاوى التي تم حلها', resolved) : ''}
        ${hasPermission('admin') ? statsCard('إجمالي الموظفين', employeesResult.count ?? 0) : ''}
      </div>
    `;

    pageContent.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => goToPage(button.dataset.go));
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
          <label>التاريخ<input type="date" name="report_date" value="${dateToday()}" required></label>
          <label>رمز المهمة<input name="task_code" placeholder="كود المهمة"></label>
        </div>
        <h3>المهام المنفذة اليوم</h3>
        <div id="tasks">
          <div class="task-row">
            <input name="task_name" placeholder="المهمة" required>
            <input name="task_qty" type="number" min="0" placeholder="الكمية">
            <input name="task_note" placeholder="ملاحظات">
          </div>
        </div>
        <button type="button" id="addTask" class="outline">＋ إضافة مهمة</button>
        <label>ما لم يتم اليوم<textarea name="remaining"></textarea></label>
        <label>خطة العمل لليوم القادم<textarea name="next_plan"></textarea></label>
        <label>المعوقات<textarea name="obstacles"></textarea></label>
        <button class="btn primary full" type="submit">حفظ التقرير</button>
      </form>
      <h3>آخر تقاريرك</h3>
      <div class="list">
        ${(rows || []).map((row) => `
          <div class="list-row">
            <div>
              <b>تقرير يوم ${esc(row.report_date)}</b>
              <small>رمز المهمة: ${esc(row.task_code || '—')}</small>
            </div>
            <span class="pill done">${esc(row.status || 'مكتمل')}</span>
          </div>
        `).join('') || '<div class="empty">لا توجد تقارير محفوظة.</div>'}
      </div>
    `;

    $('#addTask').onclick = () => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.innerHTML = `
        <input name="task_name" placeholder="المهمة" required>
        <input name="task_qty" type="number" min="0" placeholder="الكمية">
        <input name="task_note" placeholder="ملاحظات">
      `;
      $('#tasks').appendChild(row);
    };
        $('#reportForm').onsubmit = async (event) => 
