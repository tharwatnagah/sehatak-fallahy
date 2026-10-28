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

    $('#reportForm').onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const names = formData.getAll('task_name');
      const quantities = formData.getAll('task_qty');
      const notes = formData.getAll('task_note');

      const tasks = names.map((name, index) => ({
        name: String(name).trim(),
        qty: quantities[index] || '',
        note: notes[index] || ''
      })).filter((task) => task.name);

      const { error: saveError } = await supabase.from('reports').insert({
        employee_id: employee.id,
        report_date: formData.get('report_date'),
        task_code: formData.get('task_code') || null,
        tasks,
        remaining: formData.get('remaining') || null,
        next_plan: formData.get('next_plan') || null,
        obstacles: formData.get('obstacles') || null,
        status: 'مكتمل'
      });

      if (saveError) {
        toast('لم يتم حفظ التقرير: ' + saveError.message, true);
        return;
      }

      toast('تم حفظ التقرير بنجاح.');
      await renderReport();
    };
  }

  // الشكاوى والمقترحات
  async function renderComplaints() {
    let query = supabase
      .from('complaints')
      .select('id,employee_id,kind,title,details,status,created_at,employees(name,code)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!isManager()) query = query.eq('employee_id', employee.id);

    const { data, error } = await query;
    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('الشكاوى والمقترحات', 'تقديم الشكاوى ومتابعة حالتها')}
      <div class="panel form-panel">
        <h3>تقديم شكوى جديدة</h3>
        <form id="complaintForm">
          <label>نوع الشكوى
            <select name="kind" required>
              <option value="">اختر نوع الشكوى</option>
              <option>مشكلة في التوريد</option>
              <option>نقص في الأدوات</option>
              <option>مشكلة في المواصلات</option>
              <option>مشكلة إدارية</option>
              <option>أخرى</option>
            </select>
          </label>
          <label>العنوان<input name="title" required></label>
          <label>التفاصيل<textarea name="details" required></textarea></label>
          <button class="btn primary full" type="submit">إرسال الشكوى</button>
        </form>
      </div>
      <div class="list">
        ${(data || []).map((item) => `
          <div class="complaint-row">
            <div class="complaint-main">
              <b>${esc(item.title)}</b>
              <small>
                ${esc(item.kind)} · ${esc((item.created_at || '').slice(0, 10))}
                ${isManager() && item.employees
                  ? ' · ' + esc(item.employees.name) + ' (' + esc(item.employees.code) + ')'
                  : ''}
              </small>
              <p>${esc(item.details)}</p>
            </div>
            <span class="pill ${
              item.status === 'تم الحل' ? 'done' :
              item.status === 'مرفوضة' ? 'rejected' : 'review'
            }">${esc(item.status)}</span>
            ${isManager() ? `
              <select data-status-id="${esc(item.id)}">
                <option ${item.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                <option ${item.status === 'تم الحل' ? 'selected' : ''}>تم الحل</option>
                <option ${item.status === 'مرفوضة' ? 'selected' : ''}>مرفوضة</option>
              </select>
            ` : ''}
          </div>
        `).join('') || '<div class="empty">لا توجد شكاوى حتى الآن.</div>'}
      </div>
    `;

    $('#complaintForm').onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);

      const { error: saveError } = await supabase.from('complaints').insert({
        employee_id: employee.id,
        kind: formData.get('kind'),
        title: String(formData.get('title')).trim(),
        details: String(formData.get('details')).trim(),
        status: 'قيد المراجعة',
        attachment_paths: []
      });

      if (saveError) {
        toast('تعذر إرسال الشكوى: ' + saveError.message, true);
        return;
      }

      toast('تم إرسال الشكوى بنجاح.');
      await renderComplaints();
    };

    pageContent.querySelectorAll('[data-status-id]').forEach((select) => {
      select.onchange = async () => {
        if (!isManager()) {
          toast('ليس لديك صلاحية تحديث حالة الشكوى.', true);
          return;
        }

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
      };
    });
  }
    // لوحة الإدارة
  async function renderAdmin() {
    const [employeesResult, reportsResult, complaintsResult] = await Promise.all([
      supabase.from('employees')
        .select('id,code,name,branch,department,role,active', { count: 'exact' })
        .order('code'),
      supabase.from('reports').select('id', { count: 'exact', head: true }),
      supabase.from('complaints').select('id,status')
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (reportsResult.error) throw reportsResult.error;
    if (complaintsResult.error) throw complaintsResult.error;

    const complaints = complaintsResult.data || [];

    pageContent.innerHTML = `
      ${heading('لوحة الإدارة المركزية', 'ملخص النظام')}
      <div class="stats-grid admin-stats">
        ${statsCard('إجمالي الموظفين', employeesResult.count ?? 0)}
        ${statsCard('التقارير اليومية', reportsResult.count ?? 0)}
        ${statsCard('الشكاوى قيد المراجعة', complaints.filter((item) => item.status === 'قيد المراجعة').length)}
        ${statsCard('الشكاوى المحلولة', complaints.filter((item) => item.status === 'تم الحل').length)}
      </div>
      <h3>الموظفون</h3>
      <div class="list">
        ${(employeesResult.data || []).map((item) => `
          <div class="list-row">
            <div class="grow">
              <b>${esc(item.name)}</b>
              <small>كود: ${esc(item.code)} · ${esc(item.branch || '—')} · ${esc(item.department || '')}</small>
            </div>
            <span class="pill ${item.active ? 'done' : 'rejected'}">${item.active ? 'نشط' : 'غير نشط'}</span>
          </div>
        `).join('') || '<div class="empty">لا توجد سجلات موظفين.</div>'}
      </div>
      ${hasPermission('employeeReports')
        ? '<button class="btn primary" id="openReports" type="button">عرض تقارير الموظفين</button>'
        : ''}
    `;

    $('#openReports')?.addEventListener('click', () => goToPage('employeeReports'));
  }

  // إضافة الموظفين
  async function renderEmployees() {
    if (!canManageEmployees()) throw new Error('ليس لديك صلاحية إدارة الموظفين.');

    const { data, error } = await supabase
      .from('employees')
      .select('id,code,name,branch,department,role,active,permissions')
      .order('code');

    if (error) throw error;

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('employee_id,report_date')
      .order('report_date', { ascending: false });

    if (reportsError) throw reportsError;

    const lastReport = {};
    (reports || []).forEach((report) => {
      if (!lastReport[report.employee_id]) {
        lastReport[report.employee_id] = report.report_date;
      }
    });

    pageContent.innerHTML = `
      ${heading('إضافة الموظفين', 'إنشاء حسابات جديدة والبحث في القائمة')}
      <form id="newEmployeeForm" class="panel form-panel">
        <h3>إضافة موظف جديد</h3>
        <label>اسم الموظف<input name="name" required maxlength="150"></label>
        <div class="form-grid">
          <label>كود الموظف<input name="code" required maxlength="50" pattern="[a-zA-Z0-9._-]+"></label>
          <label>الفرع<input name="branch" maxlength="150"></label>
        </div>
        <div class="form-grid">
          <label>القسم<input name="department" maxlength="150"></label>
          <label>الدور الأولي
            <select name="role">
              <option value="employee">موظف</option>
              <option value="manager">مدير تقارير</option>
              <option value="admin">مسؤول النظام</option>
            </select>
          </label>
        </div>
        <label>كلمة مرور حساب الدخول
          <input name="password" type="password" minlength="8" autocomplete="new-password" required>
        </label>
        <p class="hint">يمكن تعديل صلاحيات الصفحات بعد إنشاء الحساب من صفحة إدارة الصلاحيات.</p>
        <button class="btn primary full" type="submit">إنشاء الموظف وحساب الدخول</button>
      </form>
      <h3>قائمة الموظفين</h3>
      <input id="employeeSearch" class="search-input" placeholder="ابحث بالاسم أو الكود أو الفرع">
      <div id="employeeList" class="list"></div>
    `;

    const drawEmployees = () => {
      const search = $('#employeeSearch').value.trim().toLowerCase();

      $('#employeeList').innerHTML = (data || [])
        .filter((item) =>
          [item.name, item.code, item.branch, item.department]
            .some((value) => String(value || '').toLowerCase().includes(search))
        )
        .map((item) => `
          <div class="list-row">
            <div class="grow">
              <b>${esc(item.name)}</b>
              <small>الكود: ${esc(item.code)} · ${esc(item.branch || '—')} · ${esc(item.department || '')}</small>
              <small>آخر تقرير: ${esc(lastReport[item.id] || 'لا يوجد')}</small>
            </div>
            <span class="pill ${item.active ? 'done' : 'rejected'}">${item.active ? 'نشط' : 'غير نشط'}</span>
            <span>${item.role === 'admin' ? 'مسؤول النظام' : item.role === 'manager' ? 'مدير تقارير' : 'موظف'}</span>
          </div>
        `).join('') || '<div class="empty">لا توجد نتائج.</div>';
    };

    $('#employeeSearch').addEventListener('input', drawEmployees);
    drawEmployees();

    $('#newEmployeeForm').onsubmit = async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const formData = new FormData(form);

      const payload = {
        name: String(formData.get('name') || '').trim(),
        code: String(formData.get('code') || '').trim(),
        branch: String(formData.get('branch') || '').trim(),
        department: String(formData.get('department') || '').trim(),
        role: String(formData.get('role') || 'employee'),
        password: String(formData.get('password') || '')
      };

      if (payload.password.length < 8) {
        toast('كلمة المرور يجب ألا تقل عن 8 أحرف.', true);
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'جارٍ إنشاء الحساب...';

      try {
        // وظيفة إنشاء الموظف الحالية محفوظة كما هي
        const { data: result, error: invokeError } =
          await supabase.functions.invoke('create-employee', {
            body: payload
          });

        if (invokeError) {
          console.error('Create employee function error:', invokeError);
          throw new Error(
            invokeError.message ||
            'تعذر تنفيذ وظيفة إنشاء الموظف. راجع إعدادات Edge Function.'
          );
        }

        if (!result?.success) {
          throw new Error(result?.error || 'لم يتم إنشاء الموظف.');
        }

        toast('تم إنشاء الموظف بنجاح.');
        await renderEmployees();
      } catch (error) {
        console.error(error);
        toast(error.message || 'تعذر إنشاء الموظف.', true);
      } finally {
        const submitButton = $('#newEmployeeForm')?.querySelector('button[type="submit"]');

        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'إنشاء الموظف وحساب الدخول';
        }
      }
    };
  }

  // إدارة الصلاحيات
  async function renderPermissions() {
    if (!hasPermission('permissions')) {
      throw new Error('ليس لديك صلاحية إدارة الصلاحيات.');
    }

    const { data: employees, error } = await supabase
      .from('employees')
      .select('id,code,name,branch,department,role,active,permissions')
      .order('name');

    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('إدارة الصلاحيات', 'حدد الصفحات التي يستطيع كل موظف الوصول إليها')}
      <div class="panel">
        <p>فعّل الصفحات المطلوبة لكل موظف، ثم اضغط «حفظ الصلاحيات». الصلاحيات محفوظة بشكل مستقل لكل حساب.</p>
        <p class="hint">الدور الوظيفي لا يغني عن ضبط صلاحيات الصفحات. تأكد أيضاً من إعداد سياسات RLS في Supabase لحماية البيانات.</p>
      </div>
      <input id="permissionsSearch" class="search-input" placeholder="ابحث بالاسم أو الكود أو الفرع">
      <div id="permissionsList" class="list"></div>
    `;

    const drawPermissions = () => {
      const search = ($('#permissionsSearch')?.value || '').trim().toLowerCase();

      const filtered = (employees || []).filter((item) =>
        [item.name, item.code, item.branch, item.department]
          .some((value) => String(value || '').toLowerCase().includes(search))
      );

      $('#permissionsList').innerHTML = filtered.map((item) => {
        const perms = getPermissions(item);

        return `
          <form class="panel permission-form" data-permission-id="${esc(item.id)}">
            <div class="list-row">
              <div class="grow">
                <b>${esc(item.name)}</b>
                <small>
                  الكود: ${esc(item.code)} · الفرع: ${esc(item.branch || '—')}
                  · القسم: ${esc(item.department || '—')}
                </small>
              </div>
              <span class="pill ${item.active ? 'done' : 'rejected'}">${item.active ? 'نشط' : 'غير نشط'}</span>
            </div>

            <div class="form-grid">
              <label>الدور الوظيفي
                <select name="role">
                  <option value="employee" ${item.role === 'employee' ? 'selected' : ''}>موظف</option>
                  <option value="manager" ${item.role === 'manager' ? 'selected' : ''}>مدير تقارير</option>
                  <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>مسؤول النظام</option>
                </select>
              </label>
              <label>حالة الحساب
                <select name="active">
                  <option value="true" ${item.active ? 'selected' : ''}>نشط</option>
                  <option value="false" ${!item.active ? 'selected' : ''}>غير نشط</option>
                </select>
              </label>
            </div>

            <h4>صلاحيات الصفحات</h4>
            <div class="form-grid">
              ${Object.entries(PAGE_PERMISSIONS).map(([key, label]) => `
                <label class="permission-toggle">
                  <input type="checkbox" name="perm_${esc(key)}" value="true" ${perms[key] ? 'checked' : ''}>
                  ${esc(label)}
                </label>
              `).join('')}
            </div>

            <button class="btn primary full" type="submit">حفظ الصلاحيات</button>
          </form>
        `;
      }).join('') || '<div class="empty">لا توجد نتائج.</div>';

      $('#permissionsList').querySelectorAll('.permission-form').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();

          if (!hasPermission('permissions')) {
            toast('ليس لديك صلاحية تعديل الصلاحيات.', true);
            return;
          }

          const id = form.dataset.permissionId;
          const formData = new FormData(form);
          const newRole = String(formData.get('role') || 'employee');
          const newActive = formData.get('active') === 'true';

          if (!['employee', 'manager', 'admin'].includes(newRole)) {
            toast('نوع الدور غير صحيح.', true);
            return;
          }

          if (id === employee.id && !newActive) {
            toast('لا يمكنك تعطيل حسابك الحالي أثناء تسجيل الدخول.', true);
            return;
          }

          const newPermissions = {};
          Object.keys(PAGE_PERMISSIONS).forEach((key) => {
            newPermissions[key] = formData.get('perm_' + key) === 'true';
          });

          // لا تسمح بإزالة صلاحية إدارة الصلاحيات من حسابك الحالي
          // حتى لا تفقد إمكانية إعادة ضبط الصلاحيات عن طريق الخطأ.
          if (id === employee.id && !newPermissions.permissions) {
            toast('لا يمكنك إلغاء صلاحية إدارة الصلاحيات من حسابك الحالي.', true);
            return;
          }

          const submitButton = form.querySelector('button[type="submit"]');
          submitButton.disabled = true;
          submitButton.textContent = 'جارٍ الحفظ...';

          try {
            const { error: updateError } = await supabase
              .from('employees')
              .update({
                role: newRole,
                active: newActive,
                permissions: newPermissions
              })
              .eq('id', id);

            if (updateError) throw updateError;

            toast('تم حفظ صلاحيات الموظف بنجاح.');

            const { data: updatedEmployees, error: reloadError } = await supabase
              .from('employees')
              .select('id,code,name,branch,department,role,active,permissions')
              .order('name');

            if (reloadError) throw reloadError;

            employees.splice(0, employees.length, ...(updatedEmployees || []));

            // حدّث صلاحيات الجلسة الحالية أيضاً إذا تم تعديل الحساب الحالي.
            const updatedCurrent = employees.find((item) => item.id === employee.id);
            if (updatedCurrent) {
              employee = updatedCurrent;
              applyPermissions();
            }

            drawPermissions();
          } catch (updateError) {
            console.error('Permission update error:', updateError);
            toast(
              'تعذر حفظ الصلاحيات: ' +
              (updateError.message || 'راجع سياسات Supabase وصلاحيات UPDATE.'),
              true
            );

            submitButton.disabled = false;
            submitButton.textContent = 'حفظ الصلاحيات';
          }
        });
      });
    };

    $('#permissionsSearch').addEventListener('input', drawPermissions);
    drawPermissions();
  }
    // تقارير الموظفين - واجهة محسنة
  async function renderEmployeeReports() {
    const [employeesResult, reportsResult] = await Promise.all([
      supabase.from('employees')
        .select('id,code,name,branch,department')
        .order('name'),
      supabase.from('reports')
        .select('id,employee_id,report_date,task_code,tasks,remaining,next_plan,obstacles,status,created_at')
        .order('report_date', { ascending: false })
        .limit(5000)
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (reportsResult.error) throw reportsResult.error;

    const employees = employeesResult.data || [];
    const employeeMap = new Map(employees.map((item) => [item.id, item]));

    reportRows = (reportsResult.data || []).map((report) => ({
      ...report,
      employee: employeeMap.get(report.employee_id) || {}
    }));

    pageContent.innerHTML = `
      <style>
        .er-wrap{display:grid;gap:16px}
        .er-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
        .er-filters label{display:flex;flex-direction:column;gap:6px;font-weight:600}
        .er-filters input,.er-filters select{width:100%;min-width:0}
        .er-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
        .er-actions button{min-height:40px}
        .er-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}
        .er-summary .stat{min-width:0}
        .er-result-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .er-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:14px}
        .er-card{min-width:0;border:1px solid var(--border-color,#e3e8e5);border-radius:14px;padding:16px;background:var(--card-bg,#fff);box-shadow:0 2px 8px rgba(0,0,0,.035)}
        .er-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
        .er-card h3{margin:0 0 5px;font-size:1.05rem}
        .er-muted{color:var(--muted,#68756f);font-size:.88rem;line-height:1.7}
        .er-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
        .er-meta-item{background:rgba(120,140,130,.08);border-radius:9px;padding:9px;min-width:0}
        .er-meta-item span{display:block;font-size:.78rem;color:var(--muted,#68756f);margin-bottom:3px}
        .er-meta-item b{overflow-wrap:anywhere}
        .er-details{border-top:1px solid var(--border-color,#e3e8e5);padding-top:12px;margin-top:12px}
        .er-details summary{cursor:pointer;font-weight:700;padding:4px 0}
        .er-details h4{margin:14px 0 6px}
        .er-details p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;margin:5px 0}
        .er-task-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:.9rem}
        .er-task-table th,.er-task-table td{padding:8px;text-align:right;vertical-align:top;border-bottom:1px solid var(--border-color,#e3e8e5);overflow-wrap:anywhere}
        .er-task-table th{background:rgba(120,140,130,.08)}
        .er-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:.8rem;background:rgba(120,140,130,.12);white-space:nowrap}
        .er-empty{padding:28px;text-align:center;border:1px dashed var(--border-color,#d4ddd8);border-radius:12px;color:var(--muted,#68756f)}
        @media(max-width:520px){.er-meta{grid-template-columns:1fr 1fr}.er-card{padding:12px}.er-task-table{font-size:.8rem}.er-task-table th,.er-task-table td{padding:6px}}
        @media print{.er-no-print,.page-heading{display:none!important}.er-cards{display:block}.er-card{break-inside:avoid;box-shadow:none;margin-bottom:12px}.er-details[open] summary{display:none}}
      </style>

      ${heading('تقارير الموظفين', 'ابحث عن التقارير، حدّد الفترة والموظف، ثم اعرض التفاصيل أو اطبعها')}

      <div class="panel form-panel er-wrap">
        <div class="er-filters">
          <label>الموظف
            <select id="filterEmployee">
              <option value="">كل الموظفين</option>
              ${employees.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} — ${esc(item.code)}</option>`).join('')}
            </select>
          </label>
          <label>من تاريخ
            <input id="filterFrom" type="date">
          </label>
          <label>إلى تاريخ
            <input id="filterTo" type="date">
          </label>
          <label>بحث سريع
            <input id="filterReportSearch" type="search" placeholder="الاسم، الكود، الفرع، المهمة...">
          </label>
          <label>الحالة
            <select id="filterReportStatus">
              <option value="">كل الحالات</option>
              ${[...new Set(reportRows.map((r) => r.status).filter(Boolean))].map((status) =>
                `<option value="${esc(status)}">${esc(status)}</option>`
              ).join('')}
            </select>
          </label>
        </div>

        <div class="er-actions er-no-print">
          <button class="btn primary" id="applyReportFilters" type="button">تطبيق الفلاتر</button>
          <button class="outline" id="resetReportFilters" type="button">مسح الفلاتر</button>
          <button class="outline" id="exportReports" type="button">تصدير CSV لبرنامج Excel</button>
          <button class="outline" id="printReports" type="button">طباعة النتائج</button>
        </div>
      </div>

      <div id="reportSummary" class="er-summary"></div>

      <div class="er-result-head">
        <h3>نتائج التقارير</h3>
        <span id="reportResultCount" class="er-muted"></span>
      </div>

      <div id="employeeReportsList" class="er-cards"></div>
    `;

    $('#applyReportFilters').onclick = drawReports;

    $('#resetReportFilters').onclick = () => {
      $('#filterEmployee').value = '';
      $('#filterFrom').value = '';
      $('#filterTo').value = '';
      $('#filterReportSearch').value = '';
      $('#filterReportStatus').value = '';
      drawReports();
    };

    $('#exportReports').onclick = exportReportsCSV;
    $('#printReports').onclick = printReports;

    ['filterEmployee', 'filterFrom', 'filterTo', 'filterReportStatus'].forEach((id) => {
      $('#' + id).addEventListener('change', drawReports);
    });

    $('#filterReportSearch').addEventListener('input', drawReports);
    drawReports();
  }

  function filteredReports() {
    const selectedEmployee = $('#filterEmployee')?.value || '';
    const from = $('#filterFrom')?.value || '';
    const to = $('#filterTo')?.value || '';
    const search = ($('#filterReportSearch')?.value || '').trim().toLocaleLowerCase('ar');
    const status = $('#filterReportStatus')?.value || '';

    return reportRows.filter((report) => {
      if (selectedEmployee && report.employee_id !== selectedEmployee) return false;
      if (from && report.report_date < from) return false;
      if (to && report.report_date > to) return false;
      if (status && (report.status || '') !== status) return false;

      if (search) {
        const employeeInfo = report.employee || {};
        const tasks = Array.isArray(report.tasks) ? report.tasks : [];

        const searchable = [
          employeeInfo.name,
          employeeInfo.code,
          employeeInfo.branch,
          employeeInfo.department,
          report.report_date,
          report.task_code,
          report.status,
          report.remaining,
          report.next_plan,
          report.obstacles,
          ...tasks.flatMap((task) => [task.name, task.qty, task.note])
        ].join(' ').toLocaleLowerCase('ar');

        if (!searchable.includes(search)) return false;
      }

      return true;
    });
  }

  function drawReports() {
    const rows = filteredReports();
    const employeeCount = new Set(rows.map((row) => row.employee_id)).size;
    const taskCount = rows.reduce((total, row) =>
      total + (Array.isArray(row.tasks) ? row.tasks.length : 0), 0);

    $('#reportSummary').innerHTML =
      statsCard('عدد التقارير', rows.length) +
      statsCard('عدد الموظفين', employeeCount) +
      statsCard('إجمالي المهام', taskCount);

    $('#reportResultCount').textContent = `عرض ${rows.length} تقرير`;

    $('#employeeReportsList').innerHTML = rows.map((report, index) => {
      const employeeInfo = report.employee || {};
      const tasks = Array.isArray(report.tasks) ? report.tasks : [];
      const status = report.status || 'غير محدد';

      return `
        <article class="er-card">
          <div class="er-card-top">
            <div>
              <h3>${esc(employeeInfo.name || 'موظف غير معروف')}</h3>
              <div class="er-muted">كود الموظف: ${esc(employeeInfo.code || '—')}</div>
            </div>
            <span class="er-status">${esc(status)}</span>
          </div>

          <div class="er-meta">
            <div class="er-meta-item">
              <span>تاريخ التقرير</span>
              <b>${esc(report.report_date || '—')}</b>
            </div>
            <div class="er-meta-item">
              <span>رمز المهمة</span>
              <b>${esc(report.task_code || '—')}</b>
            </div>
            <div class="er-meta-item">
              <span>الفرع</span>
              <b>${esc(employeeInfo.branch || '—')}</b>
            </div>
            <div class="er-meta-item">
              <span>القسم</span>
              <b>${esc(employeeInfo.department || '—')}</b>
            </div>
          </div>

          <details class="er-details" ${index === 0 ? 'open' : ''}>
            <summary>عرض تفاصيل التقرير (${tasks.length} مهمة)</summary>

            <h4>المهام المنفذة</h4>
            ${tasks.length ? `
              <div style="overflow-x:auto">
                <table class="er-task-table">
                  <thead>
                    <tr><th>المهمة</th><th>الكمية</th><th>ملاحظات</th></tr>
                  </thead>
                  <tbody>
                    ${tasks.map((task) => `
                      <tr>
                        <td>${esc(task.name || '—')}</td>
                        <td>${esc(task.qty || '—')}</td>
                        <td>${esc(task.note || '—')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p class="er-muted">لا توجد تفاصيل مهام مسجلة.</p>'}

            <h4>ما لم يتم</h4>
            <p>${esc(report.remaining || 'لا يوجد')}</p>

            <h4>خطة العمل لليوم القادم</h4>
            <p>${esc(report.next_plan || 'لا توجد خطة مسجلة')}</p>

            <h4>المعوقات</h4>
            <p>${esc(report.obstacles || 'لا توجد معوقات مسجلة')}</p>
          </details>
        </article>
      `;
    }).join('') || '<div class="er-empty">لا توجد تقارير مطابقة للفلاتر المحددة.</div>';
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportReportsCSV() {
    const rows = filteredReports();

    if (!rows.length) {
      toast('لا توجد تقارير لتصديرها.', true);
      return;
    }

    const columns = [
      'اسم الموظف', 'كود الموظف', 'الفرع', 'القسم',
      'تاريخ التقرير', 'رمز المهمة', 'المهام المنفذة',
      'ما لم يتم', 'خطة اليوم القادم', 'المعوقات', 'الحالة'
    ];

    const csvRows = rows.map((report) => {
      const employeeInfo = report.employee || {};
      const tasks = Array.isArray(report.tasks)
        ? report.tasks.map((task) =>
            `${task.name || ''} (الكمية: ${task.qty || ''}; ${task.note || ''})`
          ).join(' | ')
        : '';

      return [
        employeeInfo.name, employeeInfo.code, employeeInfo.branch,
        employeeInfo.department, report.report_date, report.task_code,
        tasks, report.remaining, report.next_plan, report.obstacles,
        report.status
      ];
    });

    const csv = '\uFEFF' +
      [columns, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `تقارير_الموظفين_${dateToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast('تم تصدير التقارير. يمكنك فتح الملف في Excel.');
  }

  function printReports() {
    const rows = filteredReports();

    if (!rows.length) {
      toast('لا توجد تقارير للطباعة.', true);
      return;
    }

    const printable = rows.map((report) => {
      const employeeInfo = report.employee || {};
      const tasks = Array.isArray(report.tasks)
        ? report.tasks.map((task) =>
            `<li>${esc(task.name)} — ${esc(task.qty || '—')} — ${esc(task.note || '')}</li>`
          ).join('')
        : '';

      return `
        <article style="border:1px solid #ccc;padding:16px;margin:12px 0;page-break-inside:avoid">
          <h2>${esc(employeeInfo.name || 'موظف')}</h2>
          <p>الكود: ${esc(employeeInfo.code || '—')}</p>
          <p>الفرع: ${esc(employeeInfo.branch || '—')}</p>
          <p>التاريخ: ${esc(report.report_date)}</p>
          <p>رمز المهمة: ${esc(report.task_code || '—')}</p>
          <h3>المهام المنفذة</h3>
          <ul>${tasks || '<li>لا توجد تفاصيل مهام</li>'}</ul>
          <p><b>ما لم يتم:</b> ${esc(report.remaining || '—')}</p>
          <p><b>خطة اليوم القادم:</b> ${esc(report.next_plan || '—')}</p>
          <p><b>المعوقات:</b> ${esc(report.obstacles || '—')}</p>
          <p><b>الحالة:</b> ${esc(report.status || '—')}</p>
        </article>
      `;
    }).join('');

    const win = window.open('', '_blank');

    if (!win) {
      toast('اسمح بفتح النوافذ المنبثقة للطباعة.', true);
      return;
    }

    win.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
      <head><meta charset="utf-8"><title>تقارير الموظفين</title></head>
      <body style="font-family:Arial,sans-serif;direction:rtl">
        <h1>تقارير الموظفين</h1>
        ${printable}
        <script>
          window.onload = function () { window.print(); };
        <\/script>
      </body>
      </html>
    `);

    win.document.close();
  }

  // تغيير كلمة المرور
  function renderPassword() {
    pageContent.innerHTML = `
      ${heading('تغيير كلمة المرور', 'تحديث كلمة مرور حسابك')}
      <form id="passwordForm" class="panel form-panel">
        <label>كلمة المرور الجديدة
          <input name="password" type="password" minlength="8" autocomplete="new-password" required>
        </label>
        <label>تأكيد كلمة المرور
          <input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required>
        </label>
        <button class="btn primary full" type="submit">تحديث كلمة المرور</button>
      </form>
    `;

    $('#passwordForm').onsubmit = async (event) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const password = String(formData.get('password') || '');
      const confirmPassword = String(formData.get('confirmPassword') || '');

      if (password.length < 8) {
        toast('كلمة المرور يجب ألا تقل عن 8 أحرف.', true);
        return;
      }

      if (password !== confirmPassword) {
        toast('كلمتا المرور غير متطابقتين.', true);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast('تعذر تحديث كلمة المرور: ' + error.message, true);
        return;
      }

      try {
        await supabase.from('password_change_log').insert({
          employee_id: employee.id,
          changed_at: new Date().toISOString()
        });
      } catch (error) {
        console.warn('لم يتم تسجيل تغيير كلمة المرور.', error);
      }

      toast('تم تحديث كلمة المرور.');
      event.currentTarget.reset();
    };
  }
    // سجل تغييرات كلمات المرور
  async function renderPasswordLog() {
    const { data, error } = await supabase
      .from('password_change_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('سجل تغييرات كلمات المرور', 'آخر 100 سجل')}
      <div class="list">
        ${(data || []).map((item) => `
          <div class="list-row">
            <div>
              <b>رقم الموظف: ${esc(item.employee_id || '—')}</b>
              <small>${esc(item.changed_at || '—')}</small>
            </div>
          </div>
        `).join('') || '<div class="empty">لا توجد سجلات.</div>'}
      </div>
    `;
  }

  // استعادة الجلسة عند فتح التطبيق
  if (initClient()) {
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        showLogin();
        return;
      }

      if (data.session && await loadEmployee()) {
        currentPage = hasPermission('home')
          ? 'home'
          : Object.keys(PAGE_PERMISSIONS).find((page) => hasPermission(page));

        showApp();
      } else {
        showLogin();
      }
    }).catch((error) => {
      console.error('Session initialization error:', error);
      showLogin();
    });
  }
})();
