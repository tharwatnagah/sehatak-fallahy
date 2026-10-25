(() => {
  const cfg = window.SEHATAK_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const loginView = $('#loginView'), appView = $('#appView'), pageContent = $('#pageContent');
  let supabase = null, user = null, employee = null, currentPage = 'home';
  const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateToday = () => new Date().toLocaleDateString('en-CA');
  function toast(msg, bad=false) { const t=$('#toast'); t.textContent=msg; t.className='toast'+(bad?' bad':''); t.hidden=false; setTimeout(()=>t.hidden=true,4500); }
  function initClient(){
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')) { toast('أضف Publishable Key داخل ملف config.js أولاً.', true); return false; }
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY); return true;
  }
  function showLogin(){loginView.hidden=false;appView.hidden=true;}
  function showApp(){loginView.hidden=true;appView.hidden=false;$('#sideName').textContent='مرحباً '+employee.name;$('#sideCode').textContent='كود الموظف: '+employee.code;$('#sideBranch').textContent='الفرع: '+(employee.branch||'—')+' · '+(employee.department||'');document.querySelectorAll('.admin-only').forEach(x=>x.hidden=employee.role!=='admin');renderPage(currentPage);}
  async function loadEmployee(){
    const {data:{user:authUser},error:authErr}=await supabase.auth.getUser(); if(authErr||!authUser) return false;
    user=authUser;
    const {data,error}=await supabase.from('employees').select('id,auth_user_id,code,name,branch,department,role,active').eq('auth_user_id',user.id).maybeSingle();
    if(error){console.error(error);toast('تعذر قراءة ملف الموظف: '+error.message,true);return false;}
    if(!data || !data.active){await supabase.auth.signOut();toast('الحساب غير مربوط بموظف نشط في جدول employees.',true);return false;}
    employee=data;return true;
  }
  $('#loginForm').addEventListener('submit', async e=>{
    e.preventDefault(); if(!initClient()) return;
    // يُستخدم كود الموظف كاسم دخول في الواجهة، ويُحوّل إلى بريد اصطناعي لحسابات Auth المنشأة بنفس القاعدة.
    const code=$('#loginCode').value.trim(); const password=$('#loginPassword').value;
    const email = code.includes('@') ? code : `${code}@sehatak-fallahy.local`;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){toast('تعذر تسجيل الدخول. تأكد من إنشاء حساب Auth بالبريد '+email+' وربطه بسجل الموظف. ('+error.message+')',true);return;}
    if(await loadEmployee()) showApp(); else showLogin();
  });
  $('#logoutBtn').addEventListener('click',async()=>{if(supabase) await supabase.auth.signOut();user=null;employee=null;showLogin();});
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{if(b.classList.contains('admin-only')&&employee.role!=='admin')return;document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n===b));currentPage=b.dataset.page;$('#sidebar').classList.remove('open');renderPage(currentPage);}));
  function heading(title,sub=''){return `<div class="page-heading"><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>`}
  function statsCard(label,val,sub=''){return `<div class="stat"><span>${label}</span><b>${val}</b>${sub?`<small>${sub}</small>`:''}</div>`}
  async function renderPage(page){
    if(!employee)return;
    pageContent.innerHTML=`${heading('جارٍ التحميل...')}`;
    try {
      if(page==='home') await renderHome();
      else if(page==='report') await renderReport();
      else if(page==='complaints') await renderComplaints();
      else if(page==='admin'&&employee.role==='admin') await renderAdmin();
      else if(page==='employees'&&employee.role==='admin') await renderEmployees();
      else await renderHome();
    } catch(err){console.error(err);pageContent.innerHTML=`${heading('حدث خطأ')}<div class="panel">${esc(err.message||'تعذر تحميل البيانات')}</div>`;}
  }
  async function renderHome(){
    const admin=employee.role==='admin';
    let rq=supabase.from('reports').select('id',{count:'exact',head:true}); if(!admin)rq=rq.eq('employee_id',employee.id);
    let cq=supabase.from('complaints').select('id,status'); if(!admin)cq=cq.eq('employee_id',employee.id);
    const [r,c,e]=await Promise.all([rq,cq,admin?supabase.from('employees').select('id',{count:'exact',head:true}).eq('active',true):Promise.resolve({count:1})]);
    if(r.error)throw r.error;if(c.error)throw c.error;
    const complaints=c.data||[];const open=complaints.filter(x=>x.status==='قيد المراجعة').length;const done=complaints.filter(x=>x.status==='تم الحل').length;
    pageContent.innerHTML=`${heading('الرئيسية','ملخص سريع لحسابك')}<div class="welcome-card"><div><h2>مرحباً ${esc(employee.name)}</h2><p>كود الموظف: ${esc(employee.code)}</p><small>الفرع: ${esc(employee.branch||'—')} · ${esc(employee.department||'')}</small></div><div class="avatar big">●</div></div><div class="quick-grid"><button class="quick green" data-go="report"><span class="round-icon">▤</span><b>التقرير اليومي</b><small>سجل أعمالك اليومية</small></button><button class="quick" data-go="complaints"><span class="round-icon">☏</span><b>الشكاوى</b><small>قدم شكوى أو تابعها</small></button></div><h3>معلومات سريعة</h3><div class="stats-grid">${statsCard('التقارير اليومية',r.count??0,'إجمالي التقارير المحفوظة')}${statsCard('الشكاوى قيد المراجعة',open)}${statsCard('الشكاوى التي تم حلها',done)}${admin?statsCard('إجمالي الموظفين',e.count??0):''}</div>`;
    pageContent.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{currentPage=b.dataset.go;renderPage(currentPage);});
  }
  async function renderReport(){
    const {data:rows,error}=await supabase.from('reports').select('id,report_date,task_code,status,created_at').eq('employee_id',employee.id).order('report_date',{ascending:false}).limit(8);if(error)throw error;
    pageContent.innerHTML=`${heading('التقرير اليومي','سجل أعمالك اليومية')}<form id="reportForm" class="panel form-panel"><div class="form-grid"><label>التاريخ<input type="date" name="report_date" value="${dateToday()}" required></label><label>رمز المهمة / الكود<input name="task_code" placeholder="أدخل كود المهمة"></label></div><h3>أولاً: المهام المنفذة اليوم</h3><div id="tasks"><div class="task-row"><input name="task_name" placeholder="المهمة" required><input name="task_qty" type="number" min="0" placeholder="الكمية / العدد"><input name="task_note" placeholder="ملاحظات"></div></div><button type="button" id="addTask" class="outline">＋ إضافة مهمة أخرى</button><label>ثانياً: ما لم يتم اليوم<textarea name="remaining" placeholder="اكتب ما لم يتم مع السبب إن وجد"></textarea></label><label>ثالثاً: خطة العمل لليوم القادم<textarea name="next_plan" placeholder="اكتب خطة العمل لليوم القادم"></textarea></label><label>رابعاً: المعوقات التي واجهتك<textarea name="obstacles" placeholder="اكتب المعوقات أو المشاكل"></textarea></label><button class="btn primary full" type="submit">حفظ التقرير ▣</button></form><h3>آخر تقاريرك</h3><div class="list">${(rows||[]).map(r=>`<div class="list-row"><div><b>تقرير يوم ${esc(r.report_date)}</b><small>رمز المهمة: ${esc(r.task_code||'—')}</small></div><span class="pill done">${esc(r.status||'مكتمل')}</span></div>`).join('')||'<div class="empty">لا توجد تقارير محفوظة بعد.</div>'}</div>`;
    $('#addTask').onclick=()=>{const row=document.createElement('div');row.className='task-row';row.innerHTML='<input name="task_name" placeholder="المهمة" required><input name="task_qty" type="number" min="0" placeholder="الكمية / العدد"><input name="task_note" placeholder="ملاحظات">';$('#tasks').appendChild(row);};
    $('#reportForm').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);const names=f.getAll('task_name'),qty=f.getAll('task_qty'),notes=f.getAll('task_note');const tasks=names.map((name,i)=>({name:String(name).trim(),qty:qty[i]||'',note:notes[i]||''})).filter(t=>t.name);const payload={employee_id:employee.id,report_date:f.get('report_date'),task_code:f.get('task_code')||null,tasks,remaining:f.get('remaining')||null,next_plan:f.get('next_plan')||null,obstacles:f.get('obstacles')||null,status:'مكتمل'};const {error}=await supabase.from('reports').insert(payload);if(error){toast('لم يتم حفظ التقرير: '+error.message,true);return;}toast('تم حفظ التقرير اليومي بنجاح');renderReport();};
  }
  async function renderComplaints(){
    let query=supabase.from('complaints').select('id,employee_id,kind,title,details,status,created_at,employees(name,code)').order('created_at',{ascending:false}).limit(100);if(employee.role!=='admin')query=query.eq('employee_id',employee.id);
    const {data,error}=await query;if(error)throw error;
    pageContent.innerHTML=`${heading('الشكاوى','متابعة الشكاوى وحالاتها')}<div class="panel form-panel"><h3>تقديم شكوى جديدة</h3><form id="complaintForm"><label>نوع الشكوى<select name="kind" required><option value="">اختر نوع الشكوى</option><option>مشكلة في التوريد</option><option>نقص في الأدوات</option><option>مشكلة في المواصلات</option><option>مشكلة إدارية</option><option>أخرى</option></select></label><label>العنوان المختصر<input name="title" required placeholder="اكتب عنوان الشكوى"></label><label>تفاصيل الشكوى<textarea name="details" required placeholder="اكتب تفاصيل الشكوى بوضوح"></textarea></label><button class="btn primary full">إرسال الشكوى ➤</button></form></div><div class="list">${(data||[]).map(x=>`<div class="complaint-row"><div class="complaint-main"><b>${esc(x.title)}</b><small>${esc(x.kind)} · ${(x.created_at||'').slice(0,10)}${employee.role==='admin'&&x.employees?` · ${esc(x.employees.name)} (${esc(x.employees.code)})`:''}</small><p>${esc(x.details)}</p></div><span class="pill ${x.status==='تم الحل'?'done':x.status==='مرفوضة'?'rejected':'review'}">${esc(x.status)}</span>${employee.role==='admin'?`<select data-status-id="${esc(x.id)}"><option ${x.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option><option ${x.status==='تم الحل'?'selected':''}>تم الحل</option><option ${x.status==='مرفوضة'?'selected':''}>مرفوضة</option></select>`:''}</div>`).join('')||'<div class="empty">لا توجد شكاوى حتى الآن.</div>'}</div>`;
    $('#complaintForm').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);const {error}=await supabase.from('complaints').insert({employee_id:employee.id,kind:f.get('kind'),title:String(f.get('title')).trim(),details:String(f.get('details')).trim(),status:'قيد المراجعة',attachment_paths:[]});if(error){toast('لم يتم إرسال الشكوى: '+error.message,true);return;}toast('تم إرسال الشكوى بنجاح');renderComplaints();};
    pageContent.querySelectorAll('[data-status-id]').forEach(s=>s.onchange=async()=>{const {error}=await supabase.from('complaints').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.statusId);if(error){toast('تعذر تحديث الحالة: '+error.message,true);return;}toast('تم تحديث حالة الشكوى');renderComplaints();});
  }
  async function renderAdmin(){
    const [e,r,c]=await Promise.all([supabase.from('employees').select('id,code,name,branch,department,role,active',{count:'exact'}).order('code'),supabase.from('reports').select('id',{count:'exact',head:true}),supabase.from('complaints').select('id,status')]);if(e.error)throw e.error;if(r.error)throw r.error;if(c.error)throw c.error;const cs=c.data||[];
    pageContent.innerHTML=`${heading('لوحة الإدارة المركزية','متابعة التقارير والشكاوى')}<div class="stats-grid admin-stats">${statsCard('إجمالي الموظفين',e.count??(e.data||[]).length)}${statsCard('التقارير اليومية',r.count??0)}${statsCard('الشكاوى الجديدة',cs.filter(x=>x.status==='قيد المراجعة').length)}${statsCard('الشكاوى المحلولة',cs.filter(x=>x.status==='تم الحل').length)}</div><h3>الموظفون</h3><div class="list">${(e.data||[]).map(x=>`<div class="list-row"><div class="avatar">●</div><div class="grow"><b>${esc(x.name)}</b><small>كود: ${esc(x.code)} · ${esc(x.branch||'—')} - ${esc(x.department||'')}</small></div><span class="pill ${x.active?'done':'rejected'}">${x.active?'نشط':'غير نشط'}</span></div>`).join('')||'<div class="empty">لا توجد سجلات موظفين.</div>'}</div><p class="hint">إضافة الموظفين وربط حساباتهم تتم من لوحة Supabase الإدارية لضمان عدم كشف صلاحيات حساسة في المتصفح.</p>`;
  }
  async function renderEmployees(){
    const [e,r]=await Promise.all([supabase.from('employees').select('id,code,name,branch,department,active').order('code'),supabase.from('reports').select('employee_id,report_date,status').order('report_date',{ascending:false})]);if(e.error)throw e.error;if(r.error)throw r.error;const last={};(r.data||[]).forEach(x=>{if(!last[x.employee_id])last[x.employee_id]=x;});
    pageContent.innerHTML=`${heading('تقارير الموظفين','متابعة الموظفين وآخر تقاريرهم')}<input id="employeeSearch" class="search-input" placeholder="ابحث بالاسم أو الكود أو الفرع..."><div id="employeeList" class="list"></div>`;
    const draw=()=>{const q=$('#employeeSearch').value.trim().toLowerCase();$('#employeeList').innerHTML=(e.data||[]).filter(x=>[x.name,x.code,x.branch,x.department].some(v=>String(v||'').toLowerCase().includes(q))).map(x=>`<div class="list-row"><div class="avatar">●</div><div class="grow"><b>${esc(x.name)}</b><small>كود: ${esc(x.code)} · ${esc(x.branch||'—')} - ${esc(x.department||'')}</small><small>آخر تقرير: ${esc(last[x.id]?.report_date||'لا يوجد تقرير')}</small></div><span class="pill ${last[x.id]?'done':'review'}">${esc(last[x.id]?.status||'لا يوجد تقرير')}</span></div>`).join('')||'<div class="empty">لا توجد نتائج.</div>';};$('#employeeSearch').oninput=draw;draw();
  }
  if(initClient()) supabase.auth.getSession().then(async({data})=>{if(data.session&&await loadEmployee())showApp();else showLogin();});
})();
