
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

  const esc = (value = '') =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
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
  const canManageEmployees = () => isAdmin();

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
    document.querySelectorAll('.admin-only').forEach((element) => {
      element.hidden = !isAdmin();
    });

    document.querySelectorAll('.manager-only').forEach((element) => {
      element.hidden = !isManager();
    });

    document.querySelectorAll('.reports-only').forEach((element) => {
      element.hidden = !isManager();
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

    applyPermissions();
    renderPage(currentPage);
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
      .select('id,auth_user_id,code,name,branch,department,role,active')
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

      // تعديل: تكوين البريد الإلكتروني بدون استخدام template literal
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

  const logoutBtn = $('#logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (supabase) await supabase.auth.signOut();

      user = null;
      employee = null;
      showLogin();
    });
  }

  const menuToggle = $('#menuToggle');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      $('#sidebar')?.classList.toggle('open');
    });
  }

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      if (!employee) return;

      if (button.classList.contains('admin-only') && !isAdmin()) {
        toast('ليس لديك صلاحية لهذه الصفحة.', true);
        return;
      }

      if (
        (button.dataset.page === 'employees' ||
         button.dataset.page === 'admin') &&
        !isAdmin()
      ) {
        toast('هذه الصفحة مخصصة للمسؤول.', true);
        return;
      }

      if (
        button.dataset.page === 'employeeReports' &&
        !isManager()
      ) {
        toast('ليس لديك صلاحية عرض تقارير الموظفين.', true);
        return;
      }

      document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item === button);
      });

      currentPage = button.dataset.page;
      $('#sidebar')?.classList.remove('open');
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
          if (!isAdmin()) throw new Error('ليس لديك صلاحية.');
          await renderAdmin();
          break;

        case 'employees':
          if (!canManageEmployees()) {
            throw new Error('ليس لديك صلاحية إدارة الموظفين.');
          }
          await renderEmployees();
          break;

        case 'employeeReports':
          if (!isManager()) {
            throw new Error('ليس لديك صلاحية عرض تقارير الموظفين.');
          }
          await renderEmployeeReports();
          break;

        case 'password':
          renderPassword();
          break;

        case 'passwordLog':
          if (!isAdmin()) throw new Error('ليس لديك صلاحية.');
          await renderPasswordLog();
          break;

        default:
          await renderHome();
      }
    } catch (error) {
      console.error(error);
      pageContent.innerHTML =
        heading('حدث خطأ') +
        panel(error.message || 'تعذر تحميل البيانات.');
    }
  }

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
        isAdmin()
          ? supabase
              .from('employees')
              .select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: null })
      ]);

    if (reportsResult.error) throw reportsResult.error;
    if (complaintsResult.error) throw complaintsResult.error;
    if (employeesResult.error) throw employeesResult.error;

    const complaints = complaintsResult.data || [];
    const open = complaints.filter(
      (item) => item.status === 'قيد المراجعة'
    ).length;
    const resolved = complaints.filter(
      (item) => item.status === 'تم الحل'
    ).length;

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
        <button class="quick green" data-go="report">
          <b>التقرير اليومي</b>
          <small>سجل أعمالك اليومية</small>
        </button>

        <button class="quick" data-go="complaints">
          <b>الشكاوى والمقترحات</b>
          <small>تقديم شكوى ومتابعتها</small>
        </button>

        ${
          isManager()
            ? `<button class="quick" data-go="employeeReports">
                <b>تقارير الموظفين</b>
                <small>عرض التقارير حسب الفترة</small>
              </button>`
            : ''
        }
      </div>

      <h3>معلومات سريعة</h3>

      <div class="stats-grid">
        ${statsCard('التقارير اليومية', reportsResult.count ?? 0)}
        ${statsCard('الشكاوى قيد المراجعة', open)}
        ${statsCard('الشكاوى التي تم حلها', resolved)}
        ${
          isAdmin()
            ? statsCard('إجمالي الموظفين', employeesResult.count ?? 0)
            : ''
        }
      </div>
    `;

    pageContent.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => {
        currentPage = button.dataset.go;
        renderPage(currentPage);
      });
    });
  }

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
            <input type="date" name="report_date"
              value="${dateToday()}" required>
          </label>

          <label>
            رمز المهمة
            <input name="task_code" placeholder="كود المهمة">
          </label>
        </div>

        <h3>المهام المنفذة اليوم</h3>

        <div id="tasks">
          <div class="task-row">
            <input name="task_name" placeholder="المهمة" required>
            <input name="task_qty" type="number" min="0" placeholder="الكمية">
            <input name="task_note" placeholder="ملاحظات">
          </div>
        </div>

        <button type="button" id="addTask" class="outline">
          ＋ إضافة مهمة
        </button>

        <label>ما لم يتم اليوم<textarea name="remaining"></textarea></label>
        <label>خطة العمل لليوم القادم<textarea name="next_plan"></textarea></label>
        <label>المعوقات<textarea name="obstacles"></textarea></label>

        <button class="btn primary full" type="submit">حفظ التقرير</button>
      </form>

      <h3>آخر تقاريرك</h3>

      <div class="list">
        ${
          (rows || []).map((row) => `
            <div class="list-row">
              <div>
                <b>تقرير يوم ${esc(row.report_date)}</b>
                <small>رمز المهمة: ${esc(row.task_code || '—')}</small>
              </div>
              <span class="pill done">${esc(row.status || 'مكتمل')}</span>
            </div>
          `).join('') ||
          '<div class="empty">لا توجد تقارير محفوظة.</div>'
        }
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

      const { error: saveError } = await supabase
        .from('reports')
        .insert(payload);

      if (saveError) {
        toast('لم يتم حفظ التقرير: ' + saveError.message, true);
        return;
      }

      toast('تم حفظ التقرير بنجاح.');
      await renderReport();
    };
  }

  async function renderComplaints() {
    let query = supabase
      .from('complaints')
      .select('id,employee_id,kind,title,details,status,created_at,employees(name,code)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!isManager()) {
      query = query.eq('employee_id', employee.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    pageContent.innerHTML = `
      ${heading('الشكاوى والمقترحات', 'تقديم الشكاوى ومتابعة حالتها')}

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
          <label>العنوان<input name="title" required></label>
          <label>التفاصيل<textarea name="details" required></textarea></label>
          <button class="btn primary full" type="submit">إرسال الشكوى</button>
        </form>
      </div>

      <div class="list">
        ${
          (data || []).map((item) => `
            <div class="complaint-row">
              <div class="complaint-main">
                <b>${esc(item.title)}</b>
                <small>
                  ${esc(item.kind)} · ${esc((item.created_at || '').slice(0, 10))}
                  ${
                    isManager() && item.employees
                      ? ' · ' + esc(item.employees.name) +
                        ' (' + esc(item.employees.code) + ')'
                      : ''
                  }
                </small>
                <p>${esc(item.details)}</p>
              </div>
              <span class="pill ${
                item.status === 'تم الحل' ? 'done' :
                item.status === 'مرفوضة' ? 'rejected' : 'review'
              }">${esc(item.status)}</span>
              ${
                isManager()
                  ? `<select data-status-id="${esc(item.id)}">
                      <option ${item.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                      <option ${item.status === 'تم الحل' ? 'selected' : ''}>تم الحل</option>
                      <option ${item.status === 'مرفوضة' ? 'selected' : ''}>مرفوضة</option>
                    </select>`
                  : ''
              }
            </div>
          `).join('') ||
          '<div class="empty">لا توجد شكاوى حتى الآن.</div>'
        }
      </div>
    `;

    $('#complaintForm').onsubmit = async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);

      const { error: saveError } = await supabase
        .from('complaints')
        .insert({
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

  async function renderAdmin() {
    const [employeesResult, reportsResult, complaintsResult] =
      await Promise.all([
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
        ${
          (employeesResult.data || []).map((item) => `
            <div class="list-row">
              <div class="grow">
                <b>${esc(item.name)}</b>
                <small>كود: ${esc(item.code)} · ${esc(item.branch || '—')} · ${esc(item.department || '')}</small>
              </div>
              <span class="pill ${item.active ? 'done' : 'rejected'}">${item.active ? 'نشط' : 'غير نشط'}</span>
            </div>
          `).join('') ||
          '<div class="empty">لا توجد سجلات موظفين.</div>'
        }
      </div>
      <button class="btn primary" id="openReports">عرض تقارير الموظفين</button>
    `;

    $('#openReports').onclick = () => {
      currentPage = 'employeeReports';
      renderPage(currentPage);
    };
  }

  async function renderEmployees() {
    if (!canManageEmployees()) {
      throw new Error('إدارة الموظفين متاحة للمسؤول فقط.');
    }

    const { data, error } = await supabase
      .from('employees')
      .select('id,code,name,branch,department,role,active')
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
      ${heading('إدارة الموظفين', 'إضافة موظفين والبحث في القائمة')}
      <form id="newEmployeeForm" class="panel form-panel">
        <h3>إضافة موظف جديد</h3>
        <label>اسم الموظف<input name="name" required maxlength="150"></label>
        <div class="form-grid">
          <label>كود الموظف<input name="code" required maxlength="50" pattern="[a-zA-Z0-9._-]+"></label>
          <label>الفرع<input name="branch" maxlength="150"></label>
        </div>
        <div class="form-grid">
          <label>القسم<input name="department" maxlength="150"></label>
          <label>
            الصلاحية
            <select name="role">
              <option value="employee">موظف</option>
              <option value="manager">مدير تقارير</option>
              <option value="admin">مسؤول النظام</option>
            </select>
          </label>
        </div>
        <label>كلمة مرور حساب الدخول<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <p class="hint">يجب أن تكون وظيفة create-employee منشأة ومؤمّنة في Supabase.</p>
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
            <span>${esc(item.role || 'employee')}</span>
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
        const { data: result, error: invokeError } =
          await supabase.functions.invoke('create-employee', { body: payload });

        if (invokeError) {
          throw new Error('تعذر تنفيذ وظيفة إنشاء الموظف. راجع إعدادات Edge Function.');
        }

        if (!result?.success) {
          throw new Error(result?.error || 'لم يتم إنشاء الموظف.');
        }

        toast('تم إنشاء الموظف بنجاح.');
        form.reset();
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

  async function renderEmployeeReports() {
    if (!isManager()) {
      throw new Error('ليس لديك صلاحية عرض تقارير الموظفين.');
    }

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
      ${heading('تقارير الموظفين', 'بحث حسب الموظف والتاريخ مع إمكانية الطباعة والتصدير')}
      <div class="panel form-panel">
        <div class="form-grid">
          <label>
            الموظف
            <select id="filterEmployee">
              <option value="">كل الموظفين</option>
              ${employees.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} - ${esc(item.code)}</option>`).join('')}
            </select>
          </label>
          <label>من تاريخ<input id="filterFrom" type="date"></label>
          <label>إلى تاريخ<input id="filterTo" type="date" value="${dateToday()}"></label>
        </div>
        <button class="btn primary" id="applyReportFilters">عرض التقارير</button>
        <button class="outline" id="exportReports">تصدير CSV لبرنامج Excel</button>
        <button class="outline" id="printReports">طباعة التقارير</button>
      </div>
      <div id="reportSummary" class="stats-grid"></div>
      <div id="employeeReportsList" class="list"></div>
    `;

    $('#applyReportFilters').onclick = drawReports;
    $('#exportReports').onclick = exportReportsCSV;
    $('#printReports').onclick = printReports;
    drawReports();
  }

  function filteredReports() {
    const selectedEmployee = $('#filterEmployee')?.value || '';
    const from = $('#filterFrom')?.value || '';
    const to = $('#filterTo')?.value || '';

    return reportRows.filter((report) => {
      if (selectedEmployee && report.employee_id !== selectedEmployee) return false;
      if (from && report.report_date < from) return false;
      if (to && report.report_date > to) return false;
      return true;
    });
  }

  function drawReports() {
    const rows = filteredReports();

    $('#reportSummary').innerHTML =
      statsCard('عدد التقارير', rows.length) +
      statsCard('عدد الموظفين', new Set(rows.map((row) => row.employee_id)).size);

    $('#employeeReportsList').innerHTML = rows.map((report) => {
      const employeeInfo = report.employee || {};
      const tasks = Array.isArray(report.tasks) ? report.tasks : [];

      return `
        <article class="panel report-detail">
          <h3>${esc(employeeInfo.name || 'موظف')}</h3>
          <p>الكود: ${esc(employeeInfo.code || '—')} · الفرع: ${esc(employeeInfo.branch || '—')}</p>
          <p>التاريخ: ${esc(report.report_date)} · رمز المهمة: ${esc(report.task_code || '—')}</p>
          <p>الحالة: ${esc(report.status || '—')}</p>
          <h4>المهام المنفذة</h4>
          ${
            tasks.length
              ? `<ul>${tasks.map((task) => `<li>${esc(task.name || '')} — الكمية: ${esc(task.qty || '—')} — ${esc(task.note || '')}</li>`).join('')}</ul>`
              : '<p>لا توجد تفاصيل مهام.</p>'
          }
          <h4>ما لم يتم</h4><p>${esc(report.remaining || '—')}</p>
          <h4>خطة اليوم القادم</h4><p>${esc(report.next_plan || '—')}</p>
          <h4>المعوقات</h4><p>${esc(report.obstacles || '—')}</p>
        </article>
      `;
    }).join('') || '<div class="empty">لا توجد تقارير في الفترة المحددة.</div>';
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
          window.onload = function () {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);

    win.document.close();
  }

  function renderPassword() {
    pageContent.innerHTML = `
      ${heading('تغيير كلمة المرور', 'تحديث كلمة مرور حسابك')}
      <form id="passwordForm" class="panel form-panel">
        <label>كلمة المرور الجديدة<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <label>تأكيد كلمة المرور<input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label>
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
        ${
          (data || []).map((item) => `
            <div class="list-row">
              <div>
                <b>رقم الموظف: ${esc(item.employee_id || '—')}</b>
                <small>${esc(item.changed_at || '—')}</small>
              </div>
            </div>
          `).join('') || '<div class="empty">لا توجد سجلات.</div>'
        }
      </div>
    `;
  }

  if (initClient()) {
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        showLogin();
        return;
      }

      if (data.session && await loadEmployee()) {
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
