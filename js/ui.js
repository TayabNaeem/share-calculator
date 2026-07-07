/* =====================================================================
   ui.js — icons, rendering, navigation, tabs, modals, report
   Palette only: navy #001632 · coral #E14B5E · gold #FFCD57 · white
   ===================================================================== */

/* ---------- Icons ---------- */
function ic(name, cls){ return `<i data-lucide="${name}" class="${cls||'w-4 h-4'}"></i>`; }
function refreshIcons(){ if (window.lucide) window.lucide.createIcons(); }
window.refreshIcons = refreshIcons;
(function(){
    const mr = document.getElementById('modal-root');
    if (mr && window.MutationObserver) new MutationObserver(refreshIcons).observe(mr, { childList: true });
})();

/* =====================================================================
   NAVIGATION
   ===================================================================== */
window.setTab = (t) => { activeTab = t; render(); };
window.setBatch = (id) => { activeBatchId = id; save(); render(); };
function nextBatchNum(){ return Math.max(0, ...state.batches.map(b => { const m=(b.name||'').match(/\d+/); return m?+m[0]:0; })) + 1; }
function makeBatch(name){ return { id:'b'+Date.now()+Math.floor(Math.random()*1000), name, students:[], previous:[], refunds:[], pending:[], share:{} }; }
window.addBatch = () => {
    const b = makeBatch(`Batch ${nextBatchNum()}`);
    state.batches.push(b); activeBatchId = b.id; save(); render();
};
/* ---------- Drag-to-reorder batches ---------- */
let dragBatchId = null;
window.batchDragStart = (e, id) => { dragBatchId = id; try { e.dataTransfer.effectAllowed = 'move'; } catch(_){} };
window.batchDragOver  = (e) => { e.preventDefault(); };
window.batchDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragBatchId || dragBatchId === targetId) { dragBatchId = null; return; }
    const arr = state.batches;
    const from = arr.findIndex(b => b.id === dragBatchId);
    const to   = arr.findIndex(b => b.id === targetId);
    if (from < 0 || to < 0) { dragBatchId = null; return; }
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    dragBatchId = null; save(); render();
};
window.renameBatch = (id) => {
    const b = state.batches.find(x=>x.id===id); if(!b) return;
    const v = prompt("Batch name:", b.name); if (v && v.trim()) { b.name = v.trim(); save(); render(); }
};
window.deleteBatch = (id) => {
    if (state.batches.length <= 1) return alert("Keep at least one batch.");
    const b = state.batches.find(x=>x.id===id);
    if (!confirm(`Delete "${b?.name}" and all its students?`)) return;
    state.batches = state.batches.filter(x=>x.id!==id);
    if (activeBatchId===id) activeBatchId = state.batches[0].id;
    save(); render();
};

/* =====================================================================
   RENDER ROOT
   ===================================================================== */
function applyBranding(){
    const name = (state && state.companyName) || 'Skillmentor.pk';
    const logo = state && state.logo;
    const nameEl = document.getElementById('brand-name');
    const logoEl = document.getElementById('brand-logo');
    if (nameEl) nameEl.innerText = name;
    if (logoEl) {
        if (logo) logoEl.innerHTML = `<img src="${logo}" alt="logo" class="w-full h-full object-cover">`;
        else logoEl.innerText = (name.replace(/[^a-zA-Z0-9]/g,'').slice(0,2) || 'SM').toUpperCase();
    }
    document.title = `${name} — Revenue & Profit Dashboard`;
}
function render(){
    if (!state) return;
    applyBranding();
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    renderKpis();
    renderBatchBar();
    const c = document.getElementById('tab-content');
    c.classList.remove('fade-in'); void c.offsetWidth; c.classList.add('fade-in');
    if (activeTab === 'students')          c.innerHTML = viewStudents();
    else if (activeTab === 'installments') c.innerHTML = viewInstallments();
    else if (activeTab === 'pending')      c.innerHTML = viewPending();
    else if (activeTab === 'breakdown')    c.innerHTML = viewBreakdown();
    else if (activeTab === 'previous')     c.innerHTML = viewPrevious();
    else if (activeTab === 'refunds')      c.innerHTML = viewRefunds();
    else if (activeTab === 'summary')      c.innerHTML = viewSummary();
    else if (activeTab === 'share')      { c.innerHTML = viewShare(); wireShare(); }
    refreshIcons();
}

function renderBatchBar(){
    const bar = document.getElementById('batch-bar');
    const batchScoped = ['students','pending','breakdown','previous','refunds','share'].includes(activeTab);
    if (!batchScoped) { bar.innerHTML = ''; bar.classList.add('hidden-view'); return; }
    bar.classList.remove('hidden-view');
    bar.innerHTML = `<span class="text-[11px] font-bold uppercase tracking-wider t-muted mr-1 hidden sm:inline" title="Drag a batch to reorder">Batch</span>`
        + state.batches.map(b => `
        <button onclick="setBatch('${b.id}')" ondblclick="renameBatch('${b.id}')"
            draggable="true" ondragstart="batchDragStart(event,'${b.id}')" ondragover="batchDragOver(event)" ondrop="batchDrop(event,'${b.id}')"
            class="px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap cursor-grab active:cursor-grabbing ${b.id===activeBatchId?'btn-primary':'btn-ghost t-muted hover:text-white'}">
            ${esc(b.name)}
        </button>`).join('')
        + `<button onclick="addBatch()" class="edit-only inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold t-coral btn-ghost hover:text-white transition">${ic('plus','w-4 h-4')} Batch</button>`;
}

/* ---------- KPI strip ---------- */
function renderKpis(){
    const t = globalTotals();
    const cards = [
        { label:'Total Received', val:money(t.received), sub:`across ${state.batches.length} batches`, icon:'trending-up', color:COLOR.gold },
        { label:'Total Pending',  val:money(t.pending),  sub:'outstanding fees',      icon:'hourglass',  color:COLOR.coral },
        { label:'Refunded',       val:money(t.refunded), sub:'returned to students',  icon:'hand-coins', color:COLOR.coral },
        { label:'Students',       val:t.students,        sub:'enrolled total',        icon:'users',      color:COLOR.white },
    ];
    document.getElementById('kpi-strip').innerHTML = cards.map(c => `
        <div class="glass card-hover rounded-2xl p-5 relative overflow-hidden">
            <div class="absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-15 blur-xl" style="background:${c.color}"></div>
            <div class="icon-tile w-10 h-10 mb-3" style="background:${c.color}22;color:${c.color}">${ic(c.icon,'w-5 h-5')}</div>
            <p class="text-2xl font-extrabold text-white num tracking-tight">${c.val}</p>
            <p class="text-xs font-semibold text-white/80 mt-1">${c.label}</p>
            <p class="text-xs t-muted">${c.sub}</p>
        </div>`).join('');
}

/* ---------- shared small pieces ---------- */
function miniStat(label, val, color){
    return `<div class="rounded-xl p-4" style="background:${color}14;border:1px solid ${color}33">
        <p class="text-xs font-semibold" style="color:${color}">${label}</p>
        <p class="text-lg font-extrabold text-white num mt-0.5">${val}</p></div>`;
}
function bundleBadge(type){
    const a = BUNDLE[type]?.accent || COLOR.white;
    return `<span class="badge" style="background:${a}22;color:${a}">${BUNDLE[type]?.name||'—'}</span>`;
}

/* =====================================================================
   TAB: STUDENTS
   ===================================================================== */
function viewStudents(){
    const b = activeBatch();
    const rows = b.students.map((s,i) => {
        const total = num(s.feePaid)+num(s.feePending);
        const pct = total>0 ? Math.round(num(s.feePaid)/total*100) : 100;
        const onInst = num(s.feePending) > 0;
        return `
        <tr>
            <td class="t-muted num">${i+1}</td>
            <td class="font-semibold text-white">${esc(s.name)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-white/70 num">${esc(s.contact)||'—'}</td>
            <td>${bundleBadge(s.bundleType)}</td>
            <td class="text-white/85">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold font-semibold">${money(s.feePaid)}</td>
            <td class="text-right num ${onInst?'t-coral':'t-muted'} font-semibold">${money(s.feePending)}</td>
            <td class="min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
                    <span class="text-xs t-muted num">${pct}%</span>
                </div>
            </td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openStudentModal('${s.id}')" class="edit-only icon-btn hover:text-[#FFCD57]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteStudent('${s.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`;
    }).join('');
    const rec = b.students.reduce((a,s)=>a+num(s.feePaid),0);
    const pen = b.students.reduce((a,s)=>a+num(s.feePending),0);
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-white">${esc(b.name)} — Students</h2>
                <p class="t-muted text-sm">${b.students.length} enrolled · <span class="t-gold">${money(rec)}</span> received · <span class="t-coral">${money(pen)}</span> pending</p>
            </div>
            <div class="flex gap-2">
                <button onclick="openBatchModal()" class="edit-only btn-ghost px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white/80 hover:text-white inline-flex items-center gap-1.5">${ic('pencil','w-4 h-4')} Edit batch</button>
                <button onclick="deleteBatch('${b.id}')" class="edit-only btn-ghost px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white/80 hover:text-[#E14B5E] inline-flex items-center gap-1.5">${ic('trash-2','w-4 h-4')} Delete</button>
                <button onclick="openStudentModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('user-plus','w-4 h-4')} Add Student</button>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr>
                    <th>#</th><th>Name</th><th>Contact</th><th>Bundle</th><th>Program</th>
                    <th class="text-right">Fee Paid</th><th class="text-right">Fee Pending</th><th>Progress</th><th></th>
                </tr></thead>
                <tbody>${rows || `<tr><td colspan="9" class="text-center t-muted py-10">No students yet. Click <b class="t-coral">Add Student</b> to start.</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}
window.deleteStudent = (id) => {
    const b = activeBatch();
    const s = b.students.find(x=>x.id===id);
    if (!confirm(`Remove ${s?.name||'this student'}?`)) return;
    b.students = b.students.filter(x=>x.id!==id); save(); render();
};

/* =====================================================================
   Custom dropdown + course checkboxes (shared by modals)
   ===================================================================== */
function bundleLabel(id){ const x = BUNDLE[id]; return x ? `${x.name} (${x.count} course${x.count>1?'s':''})` : ''; }
function courseChecksHtml(selected){
    return COURSES.map(c => `
        <label class="flex items-center gap-2 px-3 py-2 rounded-lg glass cursor-pointer text-sm">
            <input type="checkbox" class="course-chk accent-[#E14B5E]" value="${c.id}" ${(selected||[]).includes(c.id)?'checked':''}>
            <span class="text-white/85">${c.name}</span>
        </label>`).join('');
}
function bundlePicker(type){
    return `<div class="cdd mt-1" data-cdd>
        <input type="hidden" id="m-bundle" value="${type}">
        <button type="button" class="field readonly-field cdd-btn" onclick="cddToggle(this)">
            <span id="m-bundle-label" class="cdd-val">${bundleLabel(type)}</span>
            <svg class="cdd-chev" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <ul class="cdd-menu">${BUNDLES.map(x=>`<li class="cdd-opt ${type===x.id?'active':''}" onclick="cddSelect('${x.id}')">${bundleLabel(x.id)}</li>`).join('')}</ul>
    </div>`;
}
window.cddToggle = (btn) => {
    const cdd = btn.closest('[data-cdd]');
    document.querySelectorAll('[data-cdd].open').forEach(x => { if (x !== cdd) x.classList.remove('open'); });
    cdd.classList.toggle('open');
};
window.cddSelect = (val) => {
    const hidden = document.getElementById('m-bundle');
    hidden.value = val;
    document.getElementById('m-bundle-label').innerText = bundleLabel(val);
    const cdd = hidden.closest('[data-cdd]');
    cdd.classList.remove('open');
    cdd.querySelectorAll('.cdd-opt').forEach(o => o.classList.toggle('active', o.getAttribute('onclick').includes(`'${val}'`)));
    modalBundleChange();
};
document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-cdd]')) document.querySelectorAll('[data-cdd].open').forEach(x => x.classList.remove('open'));
});
window.modalBundleChange = () => {
    const type = document.getElementById('m-bundle').value;
    const max = BUNDLE[type].count;
    const hint = document.getElementById('m-course-hint'); if (hint) hint.innerText = `— pick ${max} course${max>1?'s':''}`;
    const chks = [...document.querySelectorAll('.course-chk')];
    chks.filter(c=>c.checked).slice(max).forEach(c=>c.checked=false);
    chks.forEach(c => { c.onchange = () => { if (chks.filter(x=>x.checked).length > max) c.checked = false; }; });
};
window.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };

/* Generic wide modal shell used by the tab modals */
function tabModal(title, bodyHtml){
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-2xl my-6 pop-in border border-white/10" style="background:var(--navy-2);box-shadow:0 40px 80px -30px rgba(0,0,0,0.9)">
            <div class="flex items-center justify-between mb-5">
                <h3 class="text-lg font-bold text-white">${title}</h3>
                <button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            ${bodyHtml}
        </div>
    </div>`;
    modalBundleChange();
}

/* ---------- Student modal ---------- */
window.openStudentModal = (id) => {
    const b = activeBatch();
    const editing = id ? b.students.find(x=>x.id===id) : null;
    const s = editing ? JSON.parse(JSON.stringify(editing)) : { bundleType:'single', courses:[], feePaid:'', feePending:'', name:'', contact:'', date:'' };
    tabModal(`${editing?'Edit':'Add'} Student · <span class="t-coral">${esc(b.name)}</span>`, `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="text-xs font-semibold t-muted">Name</label><input id="m-name" class="field mt-1" value="${esc(s.name)}" placeholder="Student name"></div>
            <div><label class="text-xs font-semibold t-muted">Contact</label><input id="m-contact" class="field mt-1" value="${esc(s.contact)}" placeholder="03xx xxxxxxx"></div>
            <div><label class="text-xs font-semibold t-muted">Bundle Type</label>${bundlePicker(s.bundleType)}</div>
            <div><label class="text-xs font-semibold t-muted">Enroll date</label><input id="m-date" class="field mt-1" value="${esc(s.date)}" placeholder="e.g. 28 June"></div>
        </div>
        <div class="mt-4">
            <label class="text-xs font-semibold t-muted">Course selection <span id="m-course-hint" class="t-muted"></span></label>
            <div id="m-courses" class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">${courseChecksHtml(s.courses)}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><label class="text-xs font-semibold t-gold">Fee Paid</label><input id="m-paid" type="number" class="field mt-1" value="${s.feePaid}" placeholder="0"></div>
            <div><label class="text-xs font-semibold t-coral">Fee Pending</label><input id="m-pending" type="number" class="field mt-1" value="${s.feePending}" placeholder="0"></div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
            <button onclick="saveStudent('${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save changes':'Add student'}</button>
        </div>`);
};
window.saveStudent = (id) => {
    const b = activeBatch();
    const courses = [...document.querySelectorAll('.course-chk')].filter(c=>c.checked).map(c=>c.value);
    const data = {
        name: document.getElementById('m-name').value.trim(),
        contact: document.getElementById('m-contact').value.trim(),
        bundleType: document.getElementById('m-bundle').value,
        courses,
        date: document.getElementById('m-date').value.trim(),
        feePaid: num(document.getElementById('m-paid').value),
        feePending: num(document.getElementById('m-pending').value),
    };
    if (!data.name) return alert("Please enter a name.");
    if (id) Object.assign(b.students.find(x=>x.id===id), data);
    else b.students.push(normalizeStudent({ ...data, installments: [] }));
    save(); closeModal(); render();
};

/* =====================================================================
   TAB: INSTALLMENTS
   ===================================================================== */
function viewInstallments(){
    const list = [];
    state.batches.forEach(b => b.students.forEach(s => { if (num(s.feePending) > 0) list.push({ b, s }); }));
    list.sort((a,z)=> num(z.s.feePending)-num(a.s.feePending));
    const totalPending = list.reduce((a,x)=>a+num(x.s.feePending),0);
    const rows = list.map(({b,s}) => {
        const total = num(s.feePaid)+num(s.feePending);
        const pct = total>0 ? Math.round(num(s.feePaid)/total*100) : 0;
        return `
        <tr>
            <td class="font-semibold text-white">${esc(s.name)}</td>
            <td class="text-white/70 num">${esc(s.contact)||'<span class=\'t-muted\'>—</span>'}</td>
            <td><span class="badge glass text-white/80">${esc(b.name)}</span></td>
            <td class="text-white/70">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold">${money(s.feePaid)}</td>
            <td class="text-right num t-coral font-bold">${money(s.feePending)}</td>
            <td class="min-w-[140px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
                    <span class="text-xs t-muted num">${pct}%</span>
                </div>
            </td>
            <td class="text-right">
                <button onclick="recordPayment('${b.id}','${s.id}')" class="edit-only btn-primary text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">${ic('plus','w-3.5 h-3.5')} Record</button>
            </td>
        </tr>`;
    }).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="mb-6">
            <h2 class="text-xl font-bold text-white">Students on Installments</h2>
            <p class="t-muted text-sm">${list.length} students owe <span class="t-coral font-semibold">${money(totalPending)}</span> in total (all batches)</p>
        </div>
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Student</th><th>Contact</th><th>Batch</th><th>Program</th><th class="text-right">Paid</th><th class="text-right">Pending</th><th>Progress</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="8" class="text-center t-muted py-12"><div class="flex flex-col items-center gap-2">${ic('circle-check-big','w-8 h-8 text-[#FFCD57]')}<span>No pending balances. Everyone is fully paid.</span></div></td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}
window.recordPayment = (bid, sid) => {
    const b = state.batches.find(x=>x.id===bid); const s = b.students.find(x=>x.id===sid);
    const v = prompt(`Record an installment for ${s.name}\nPending: ${money(s.feePending)}\n\nAmount received now:`, "");
    if (v === null) return;
    const amt = num(v); if (amt <= 0) return;
    const applied = Math.min(amt, num(s.feePending));
    s.feePaid = num(s.feePaid) + applied;
    s.feePending = num(s.feePending) - applied;
    s.installments = s.installments || [];
    s.installments.push({ amount: applied, date: new Date().toISOString().slice(0,10) });
    save(); render();
};

/* =====================================================================
   TAB: PENDING PAYMENTS (standalone pending records, per batch)
   ===================================================================== */
function batchName(id){ return (state.batches.find(b=>b.id===id)||{}).name || '—'; }
function batchPicker(selectedId){
    return `<div class="cdd mt-1" data-cdd>
        <input type="hidden" id="mp-batch" value="${selectedId}">
        <button type="button" class="field readonly-field cdd-btn" onclick="cddToggle(this)">
            <span id="mp-batch-label" class="cdd-val">${esc(batchName(selectedId))}</span>
            <svg class="cdd-chev" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <ul class="cdd-menu">${state.batches.map(b=>`<li class="cdd-opt ${b.id===selectedId?'active':''}" onclick="pendBatchSelect('${b.id}')">${esc(b.name)}</li>`).join('')}</ul>
    </div>`;
}
window.pendBatchSelect = (id) => {
    const h = document.getElementById('mp-batch'); h.value = id;
    document.getElementById('mp-batch-label').innerText = batchName(id);
    const cdd = h.closest('[data-cdd]');
    cdd.classList.remove('open');
    cdd.querySelectorAll('.cdd-opt').forEach(o => o.classList.toggle('active', o.getAttribute('onclick').includes(`'${id}'`)));
};
window.pendAddBatch = () => {
    const name = (prompt("New batch name:", `Batch ${nextBatchNum()}`) || '').trim();
    if (!name) return;
    const b = makeBatch(name); state.batches.push(b); save();
    const cdd = document.getElementById('mp-batch').closest('[data-cdd]');
    cdd.querySelector('.cdd-menu').innerHTML = state.batches.map(x=>`<li class="cdd-opt ${x.id===b.id?'active':''}" onclick="pendBatchSelect('${x.id}')">${esc(x.name)}</li>`).join('');
    pendBatchSelect(b.id);
};

function viewPending(){
    const b = activeBatch();
    const list = b.pending || [];
    const batchTotal = batchPendingTotal(b);
    const grand = globalTotals().pending;
    const rows = list.map((p,i) => `
        <tr>
            <td class="t-muted num">${i+1}</td>
            <td class="font-semibold text-white">${esc(p.name)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-white/70 num">${esc(p.contact)||'—'}</td>
            <td>${bundleBadge(p.bundleType)}</td>
            <td class="text-white/85">${esc(programLabel(p))}</td>
            <td class="t-muted">${esc(p.date)||'—'}</td>
            <td class="t-muted">${esc(p.note)||'—'}</td>
            <td class="text-right num t-coral font-semibold">${money(p.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openPendingModal('${p.id}')" class="edit-only icon-btn hover:text-[#FFCD57]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deletePending('${p.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-white">${esc(b.name)} — Pending Payments</h2>
                <p class="t-muted text-sm">All pending across every batch: <span class="t-coral font-semibold">${money(grand)}</span></p>
            </div>
            <button onclick="openPendingModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add Pending</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            ${miniStat('This batch pending', money(batchTotal), COLOR.coral)}
            ${miniStat('Entries', String(list.length), COLOR.gold)}
            ${miniStat('All-batch pending', money(grand), COLOR.coral)}
        </div>
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>#</th><th>Name</th><th>Contact</th><th>Bundle</th><th>Program</th><th>Date</th><th>Note</th><th class="text-right">Pending</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="9" class="text-center t-muted py-10">No pending payments in this batch. Click <b class="t-coral">Add Pending</b>.</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}
window.deletePending = (id) => {
    const b = activeBatch();
    if (!confirm("Delete this pending payment?")) return;
    b.pending = (b.pending||[]).filter(p=>p.id!==id); save(); render();
};
window.openPendingModal = (id) => {
    const cur = activeBatch();
    // find entry across batches (edit) or default new for active batch
    let owningBatchId = cur.id, editing = null;
    if (id) for (const bb of state.batches){ const e = (bb.pending||[]).find(p=>p.id===id); if (e){ editing = e; owningBatchId = bb.id; break; } }
    const p = editing ? JSON.parse(JSON.stringify(editing)) : { bundleType:'single', courses:[], name:'', contact:'', amount:'', date:'', note:'' };
    tabModal(`${editing?'Edit':'Add'} Pending Payment`, `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="text-xs font-semibold t-muted">Batch</label>
                <div class="flex gap-2 items-stretch">
                    <div class="flex-1">${batchPicker(owningBatchId)}</div>
                    <button type="button" onclick="pendAddBatch()" class="btn-ghost mt-1 px-3 rounded-xl text-sm font-semibold t-coral inline-flex items-center gap-1 shrink-0" title="Create a new batch">${ic('plus','w-4 h-4')} New</button>
                </div>
            </div>
            <div><label class="text-xs font-semibold t-muted">Student name</label><input id="m-name" class="field mt-1" value="${esc(p.name)}" placeholder="Student name"></div>
            <div><label class="text-xs font-semibold t-muted">Contact</label><input id="m-contact" class="field mt-1" value="${esc(p.contact)}" placeholder="03xx xxxxxxx"></div>
            <div><label class="text-xs font-semibold t-muted">Bundle Type</label>${bundlePicker(p.bundleType)}</div>
        </div>
        <div class="mt-4">
            <label class="text-xs font-semibold t-muted">Course selection <span id="m-course-hint" class="t-muted"></span></label>
            <div id="m-courses" class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">${courseChecksHtml(p.courses)}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div><label class="text-xs font-semibold t-coral">Pending Amount</label><input id="m-amount" type="number" class="field mt-1" value="${p.amount}" placeholder="0"></div>
            <div><label class="text-xs font-semibold t-muted">Due date</label><input id="m-date" class="field mt-1" value="${esc(p.date)}" placeholder="e.g. 28 June"></div>
            <div><label class="text-xs font-semibold t-muted">Note (optional)</label><input id="m-note" class="field mt-1" value="${esc(p.note)}" placeholder="e.g. 2nd installment"></div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
            <button onclick="savePending('${editing?editing.id:''}','${owningBatchId}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save changes':'Add pending'}</button>
        </div>`);
};
window.savePending = (id, oldBatchId) => {
    const targetId = document.getElementById('mp-batch').value;
    const target = state.batches.find(b=>b.id===targetId) || activeBatch();
    const courses = [...document.querySelectorAll('.course-chk')].filter(c=>c.checked).map(c=>c.value);
    const data = {
        name: document.getElementById('m-name').value.trim(),
        contact: document.getElementById('m-contact').value.trim(),
        bundleType: document.getElementById('m-bundle').value, courses,
        amount: num(document.getElementById('m-amount').value),
        date: document.getElementById('m-date').value.trim(),
        note: document.getElementById('m-note').value.trim(),
    };
    if (!data.name) return alert("Please enter the student's name.");
    if (id) {
        // remove from old batch, then add to target (batch may have changed)
        const old = state.batches.find(b=>b.id===oldBatchId);
        if (old) old.pending = (old.pending||[]).filter(x=>x.id!==id);
        target.pending = target.pending || [];
        target.pending.push(normalizePending({ ...data, id }));
    } else {
        target.pending = target.pending || [];
        target.pending.push(normalizePending(data));
    }
    save(); closeModal(); render();
};

/* =====================================================================
   TAB: BUNDLES & COURSES BREAKDOWN
   ===================================================================== */
function viewBreakdown(){
    const b = activeBatch();
    const sections = BUNDLES.map(bd => {
        const students = b.students.filter(s => s.bundleType === bd.id);
        const groups = groupByProgram(students);
        const rec = students.reduce((a,s)=>a+num(s.feePaid),0);
        const pen = students.reduce((a,s)=>a+num(s.feePending),0);
        const rows = groups.map(g => `
            <tr>
                <td class="num t-muted">${g.count}</td>
                <td class="text-white font-medium">${esc(g.program)}</td>
                <td class="text-right num t-gold">${money(g.received)}</td>
                <td class="text-right num t-coral">${money(g.pending)}</td>
                <td class="text-right num text-white/85 font-semibold">${money(g.received+g.pending)}</td>
            </tr>`).join('');
        return `
        <div class="glass rounded-2xl overflow-hidden">
            <div class="px-5 py-3 flex items-center justify-between" style="background:${bd.accent}14;border-bottom:1px solid var(--stroke)">
                <h3 class="font-bold text-white flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${bd.accent}"></span>${bd.name}</h3>
                <span class="text-xs t-muted">${students.length} student${students.length!==1?'s':''}</span>
            </div>
            <table class="tbl w-full text-sm">
                <thead><tr><th>Students</th><th>Course / Combo</th><th class="text-right">Received</th><th class="text-right">Pending</th><th class="text-right">Total</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5" class="text-center t-muted py-6">No ${bd.name.toLowerCase()} enrolments.</td></tr>`}</tbody>
                ${groups.length ? `<tfoot><tr class="font-bold text-white" style="border-top:2px solid var(--stroke)">
                    <td colspan="2" class="text-white/80">Subtotal</td>
                    <td class="text-right num t-gold">${money(rec)}</td>
                    <td class="text-right num t-coral">${money(pen)}</td>
                    <td class="text-right num">${money(rec+pen)}</td></tr></tfoot>`:''}
            </table>
        </div>`;
    }).join('');
    const rec = b.students.reduce((a,s)=>a+num(s.feePaid),0);
    const pen = b.students.reduce((a,s)=>a+num(s.feePending),0);
    const prev = batchPrevReceived(b), prevPen = batchPrevPending(b);
    return `
    <div class="space-y-5">
        <div class="glass rounded-3xl p-6 md:p-7">
            <h2 class="text-xl font-bold text-white">${esc(b.name)} — Bundle &amp; Course Breakdown</h2>
            <p class="t-muted text-sm">Auto-calculated from student records. Previous-batch carry-forward is managed in the <button onclick="setTab('previous')" class="t-coral font-semibold">Previous Batch</button> tab.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                ${miniStat('Received (this batch)', money(rec), COLOR.gold)}
                ${miniStat('Pending', money(pen+prevPen), COLOR.coral)}
                ${miniStat('Total received (incl. previous)', money(rec+prev), COLOR.gold)}
                ${miniStat('Total with pending', money(rec+prev+pen+prevPen), COLOR.coral)}
            </div>
        </div>
        ${sections}
    </div>`;
}

/* =====================================================================
   TAB: PREVIOUS BATCH
   ===================================================================== */
function viewPrevious(){
    const b = activeBatch();
    const list = b.previous || [];
    const rec = batchPrevReceived(b), pen = batchPrevPending(b);
    const rows = list.map((e,i) => `
        <tr>
            <td class="t-muted num">${i+1}</td>
            <td>${bundleBadge(e.bundleType)}</td>
            <td class="text-white/85">${esc(programLabel(e))}</td>
            <td class="text-right num t-gold font-semibold">${money(e.received)}</td>
            <td class="text-right num ${num(e.pending)>0?'t-coral':'t-muted'} font-semibold">${money(e.pending)}</td>
            <td class="text-right num text-white font-semibold">${money(num(e.received)+num(e.pending))}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openPrevModal('${e.id}')" class="edit-only icon-btn hover:text-[#FFCD57]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deletePrevEntry('${e.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-white">${esc(b.name)} — Previous Batch Payments</h2>
                <p class="t-muted text-sm">Payments carried in from earlier batches. Course-wise, no student details needed.</p>
            </div>
            <button onclick="openPrevModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add Payment</button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            ${miniStat('Previous received', money(rec), COLOR.gold)}
            ${miniStat('Previous pending', money(pen), COLOR.coral)}
            ${miniStat('Total', money(rec+pen), COLOR.gold)}
        </div>
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>#</th><th>Bundle</th><th>Course / Combo</th><th class="text-right">Received</th><th class="text-right">Pending</th><th class="text-right">Total</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="7" class="text-center t-muted py-10">No previous-batch payments yet. Click <b class="t-coral">Add Payment</b>.</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}
window.deletePrevEntry = (id) => {
    const b = activeBatch();
    if (!confirm("Delete this previous-batch payment?")) return;
    b.previous = (b.previous||[]).filter(e=>e.id!==id); save(); render();
};
window.openPrevModal = (id) => {
    const b = activeBatch();
    const editing = id ? (b.previous||[]).find(e=>e.id===id) : null;
    const e = editing ? JSON.parse(JSON.stringify(editing)) : { bundleType:'single', courses:[], received:'', pending:'' };
    tabModal(`${editing?'Edit':'Add'} Previous Payment · <span class="t-coral">${esc(b.name)}</span>`, `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="text-xs font-semibold t-muted">Bundle Type</label>${bundlePicker(e.bundleType)}</div>
            <div class="hidden md:block"></div>
        </div>
        <div class="mt-4">
            <label class="text-xs font-semibold t-muted">Course selection <span id="m-course-hint" class="t-muted"></span></label>
            <div id="m-courses" class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">${courseChecksHtml(e.courses)}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><label class="text-xs font-semibold t-gold">Amount Received</label><input id="m-paid" type="number" class="field mt-1" value="${e.received}" placeholder="0"></div>
            <div><label class="text-xs font-semibold t-coral">Amount Pending</label><input id="m-pending" type="number" class="field mt-1" value="${e.pending}" placeholder="0"></div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
            <button onclick="savePrevEntry('${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save changes':'Add payment'}</button>
        </div>`);
};
window.savePrevEntry = (id) => {
    const b = activeBatch();
    const courses = [...document.querySelectorAll('.course-chk')].filter(c=>c.checked).map(c=>c.value);
    const data = {
        bundleType: document.getElementById('m-bundle').value, courses,
        received: num(document.getElementById('m-paid').value),
        pending: num(document.getElementById('m-pending').value),
    };
    if (!courses.length) return alert("Please select at least one course.");
    b.previous = b.previous || [];
    if (id) Object.assign(b.previous.find(x=>x.id===id), data);
    else b.previous.push(normalizePrev(data));
    save(); closeModal(); render();
};

/* =====================================================================
   TAB: FEE REFUND
   ===================================================================== */
function viewRefunds(){
    const b = activeBatch();
    const list = b.refunds || [];
    const total = batchRefundTotal(b);
    const rows = list.map((r,i) => `
        <tr>
            <td class="t-muted num">${i+1}</td>
            <td class="font-semibold text-white">${esc(r.name)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-white/70 num">${esc(r.contact)||'—'}</td>
            <td>${bundleBadge(r.bundleType)}</td>
            <td class="text-white/85">${esc(programLabel(r))}</td>
            <td class="t-muted">${esc(r.date)||'—'}</td>
            <td class="t-muted">${esc(r.reason)||'—'}</td>
            <td class="text-right num t-coral font-semibold">${money(r.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openRefundModal('${r.id}')" class="edit-only icon-btn hover:text-[#FFCD57]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteRefund('${r.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-white">${esc(b.name)} — Fee Refunds</h2>
                <p class="t-muted text-sm">${list.length} refund${list.length!==1?'s':''} · <span class="t-coral font-semibold">${money(total)}</span> returned</p>
            </div>
            <button onclick="openRefundModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add Refund</button>
        </div>
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>#</th><th>Student</th><th>Contact</th><th>Bundle</th><th>Program</th><th>Date</th><th>Reason</th><th class="text-right">Amount</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="9" class="text-center t-muted py-10">No refunds recorded. Click <b class="t-coral">Add Refund</b>.</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}
window.deleteRefund = (id) => {
    const b = activeBatch();
    if (!confirm("Delete this refund record?")) return;
    b.refunds = (b.refunds||[]).filter(r=>r.id!==id); save(); render();
};
window.openRefundModal = (id) => {
    const b = activeBatch();
    const editing = id ? (b.refunds||[]).find(r=>r.id===id) : null;
    const r = editing ? JSON.parse(JSON.stringify(editing)) : { bundleType:'single', courses:[], name:'', contact:'', amount:'', date:'', reason:'' };
    tabModal(`${editing?'Edit':'Add'} Refund · <span class="t-coral">${esc(b.name)}</span>`, `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="text-xs font-semibold t-muted">Student name</label><input id="m-name" class="field mt-1" value="${esc(r.name)}" placeholder="Student name"></div>
            <div><label class="text-xs font-semibold t-muted">Contact</label><input id="m-contact" class="field mt-1" value="${esc(r.contact)}" placeholder="03xx xxxxxxx"></div>
            <div><label class="text-xs font-semibold t-muted">Bundle Type</label>${bundlePicker(r.bundleType)}</div>
            <div><label class="text-xs font-semibold t-muted">Refund date</label><input id="m-date" class="field mt-1" value="${esc(r.date)}" placeholder="e.g. 28 June"></div>
        </div>
        <div class="mt-4">
            <label class="text-xs font-semibold t-muted">Course selection <span id="m-course-hint" class="t-muted"></span></label>
            <div id="m-courses" class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">${courseChecksHtml(r.courses)}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><label class="text-xs font-semibold t-coral">Refund Amount</label><input id="m-amount" type="number" class="field mt-1" value="${r.amount}" placeholder="0"></div>
            <div><label class="text-xs font-semibold t-muted">Reason (optional)</label><input id="m-reason" class="field mt-1" value="${esc(r.reason)}" placeholder="e.g. Withdrew"></div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
            <button onclick="saveRefund('${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save changes':'Add refund'}</button>
        </div>`);
};
window.saveRefund = (id) => {
    const b = activeBatch();
    const courses = [...document.querySelectorAll('.course-chk')].filter(c=>c.checked).map(c=>c.value);
    const data = {
        name: document.getElementById('m-name').value.trim(),
        contact: document.getElementById('m-contact').value.trim(),
        bundleType: document.getElementById('m-bundle').value, courses,
        date: document.getElementById('m-date').value.trim(),
        amount: num(document.getElementById('m-amount').value),
        reason: document.getElementById('m-reason').value.trim(),
    };
    if (!data.name) return alert("Please enter the student's name.");
    b.refunds = b.refunds || [];
    if (id) Object.assign(b.refunds.find(x=>x.id===id), data);
    else b.refunds.push(normalizeRefund(data));
    save(); closeModal(); render();
};

/* =====================================================================
   TAB: SUMMARY
   ===================================================================== */
function sumRow(label, val, color, big){
    return `<div class="flex items-center justify-between">
        <span class="text-sm t-muted">${label}</span>
        <span class="num font-${big?'extrabold text-xl':'bold text-base'}" style="color:${color}">${val}</span></div>`;
}
function viewSummary(){
    let gRec=0,gPen=0,gRef=0,gPrev=0;
    const batchRows = state.batches.map(b => {
        const rec=b.students.reduce((a,s)=>a+num(s.feePaid),0);
        const pen=b.students.reduce((a,s)=>a+num(s.feePending),0);
        const ref=batchRefundTotal(b), prev=batchPrevReceived(b);
        gRec+=rec; gPen+=pen; gRef+=ref; gPrev+=prev;
        return `<tr>
            <td class="font-semibold text-white">${esc(b.name)}</td>
            <td class="text-right num t-muted">${b.students.length}</td>
            <td class="text-right num t-coral">${money(pen)}</td>
            <td class="text-right num t-gold">${money(rec)}</td>
            <td class="text-right num t-coral">${money(ref)}</td>
            <td class="text-right num text-white font-bold">${money(rec+pen)}</td>
        </tr>`;
    }).join('');

    const all = state.batches.flatMap(b=>b.students);
    const progs = groupByProgram(all).sort((a,z)=>z.received-a.received);
    const maxRec = Math.max(1, ...progs.map(p=>p.received));
    const progRows = progs.map(p => `
        <tr>
            <td class="text-white font-medium">${esc(p.program)}</td>
            <td class="text-right num t-muted">${p.count}</td>
            <td class="text-right num t-gold">${money(p.received)}</td>
            <td class="text-right num t-coral">${money(p.pending)}</td>
            <td class="w-40"><div class="h-2 rounded-full bg-white/10 overflow-hidden"><div style="width:${Math.round(p.received/maxRec*100)}%;background:linear-gradient(90deg,${COLOR.coral},${COLOR.gold})" class="h-full"></div></div></td>
        </tr>`).join('');

    const maxBar = Math.max(1, ...state.batches.map(b=>b.students.reduce((a,s)=>a+num(s.feePaid)+num(s.feePending),0)));
    const bars = state.batches.map(b => {
        const rec=b.students.reduce((a,s)=>a+num(s.feePaid),0);
        const pen=b.students.reduce((a,s)=>a+num(s.feePending),0);
        const total=rec+pen;
        return `<div class="flex flex-col items-center gap-2 flex-1 min-w-[54px]">
            <div class="w-full flex items-end justify-center" style="height:150px">
                <div class="w-9 rounded-t-lg relative overflow-hidden flex flex-col justify-end" style="height:${Math.max(4,Math.round(total/maxBar*150))}px;background:rgba(255,255,255,0.08)">
                    <div style="height:${total>0?Math.round(rec/total*100):0}%;background:linear-gradient(180deg,${COLOR.gold},${COLOR.gold})"></div>
                </div>
            </div>
            <span class="text-[11px] t-muted num">${money(total).replace('Rs ','')}</span>
            <span class="text-xs t-muted font-medium">${esc(b.name)}</span>
        </div>`;
    }).join('');

    return `
    <div class="space-y-5">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div class="glass rounded-3xl p-6 lg:col-span-2">
                <h2 class="text-lg font-bold text-white mb-1">All Batches Overview</h2>
                <p class="t-muted text-sm mb-4">Received vs total (received + pending) per batch.</p>
                <div class="flex items-end gap-3 justify-around px-2">${bars}</div>
                <div class="flex items-center gap-4 mt-4 text-xs t-muted">
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded" style="background:${COLOR.gold}"></span>Received</span>
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded" style="background:rgba(255,255,255,0.14)"></span>Pending</span>
                </div>
            </div>
            <div class="glass rounded-3xl p-6 flex flex-col justify-center">
                <h2 class="text-lg font-bold text-white mb-4">Grand Totals</h2>
                <div class="space-y-3">
                    ${sumRow('Received', money(gRec), COLOR.gold)}
                    ${sumRow('Pending', money(gPen), COLOR.coral)}
                    ${sumRow('Refunded', money(gRef), COLOR.coral)}
                    ${sumRow('Prev. carried', money(gPrev), COLOR.gold)}
                    <div class="border-t border-white/10 pt-3">${sumRow('Grand total (rec+pend)', money(gRec+gPen), COLOR.gold, true)}</div>
                </div>
            </div>
        </div>
        <div class="glass rounded-3xl p-6 md:p-8">
            <h2 class="text-lg font-bold text-white mb-4">Batch Summary</h2>
            <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Batch</th><th class="text-right">Students</th><th class="text-right">Pending</th><th class="text-right">Received</th><th class="text-right">Refunded</th><th class="text-right">Total</th></tr></thead>
                <tbody>${batchRows}</tbody>
                <tfoot><tr class="font-bold text-white" style="border-top:2px solid var(--stroke)">
                    <td>All batches</td><td class="text-right num t-muted">${all.length}</td>
                    <td class="text-right num t-coral">${money(gPen)}</td>
                    <td class="text-right num t-gold">${money(gRec)}</td>
                    <td class="text-right num t-coral">${money(gRef)}</td>
                    <td class="text-right num">${money(gRec+gPen)}</td>
                </tr></tfoot>
            </table>
            </div>
        </div>
        <div class="glass rounded-3xl p-6 md:p-8">
            <h2 class="text-lg font-bold text-white mb-1">Total Received by Training Program</h2>
            <p class="t-muted text-sm mb-4">Across all batches (single courses &amp; bundles counted as their combo).</p>
            <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Program / Combo</th><th class="text-right">Students</th><th class="text-right">Received</th><th class="text-right">Pending</th><th>Share of revenue</th></tr></thead>
                <tbody>${progRows || `<tr><td colspan="5" class="text-center t-muted py-6">No enrolments yet.</td></tr>`}</tbody>
            </table>
            </div>
        </div>
    </div>`;
}

/* =====================================================================
   TAB: PROFIT SHARE
   ===================================================================== */
function cssId(name){ return name.replace(/\s+/g,'_'); }
function wireShare(){ computeShare(); }
function computeShare(){
    const d = shareBreakdown(activeBatch());
    setTxt('owner-val', money(d.owner));
    setTxt('future-val', money(d.future));
    setTxt('share-total', money(d.total));
    TEAM.forEach(n => setTxt('res-'+cssId(n), money(d.team[n])));
}
function setTxt(id,v){ const e=document.getElementById(id); if(e) e.innerText=v; }
function viewShare(){
    const b = activeBatch();
    const d = shareBreakdown(b);
    const per = d.per;
    const inputs = COURSES.map(c => `
        <div>
            <label class="block text-xs font-semibold t-muted mb-1">${c.name}${SHARE_LEAD[c.id]?` · <span class="t-coral">${SHARE_LEAD[c.id]}</span>`:''}</label>
            <div class="field readonly-field">
                <span class="t-muted text-xs font-semibold">Rs</span>
                <span class="num font-bold ${per[c.id]>0?'text-white':(per[c.id]<0?'t-coral':'t-muted')}">${Math.round(per[c.id]).toLocaleString()}</span>
            </div>
        </div>`).join('');
    const teamRows = TEAM.map(name => `
        <div class="flex justify-between items-center bg-white/5 px-4 py-2.5 rounded-xl text-sm">
            <span class="text-white/80">${name}</span>
            <span id="res-${cssId(name)}" class="font-bold text-white num">Rs 0</span>
        </div>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-white">${esc(b.name)} — Profit Distribution</h2>
                <p class="t-muted text-sm">Owner 40% · Future fund 36% · Team pool 24% (service lead earns 12%).</p>
            </div>
            <div class="flex items-center gap-4">
                <div class="text-right">
                    <p class="text-xs t-muted">Net distributable</p>
                    <p class="text-lg font-extrabold t-gold num">${money(d.total)}</p>
                </div>
                <button onclick="downloadShareReport()" class="edit-only btn-primary px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap inline-flex items-center gap-1.5">${ic('download','w-4 h-4')} Download report</button>
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            ${miniStat('Current received', money(d.currentReceived), COLOR.gold)}
            ${miniStat('+ Previous batch', money(d.prevReceived), COLOR.coral)}
            ${miniStat('− Refunds', money(d.refunds), COLOR.coral)}
            ${miniStat('= Net distributable', money(d.total), COLOR.gold)}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h3 class="text-xs font-bold t-muted uppercase tracking-widest mb-2">Revenue by Service (net)</h3>
                <p class="text-xs t-muted mb-4">Current + previous-batch received − refunds, with each bundle fee split equally across its courses.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${inputs}</div>
            </div>
            <div class="rounded-2xl p-6 text-white" style="background:linear-gradient(160deg,var(--navy-2),var(--navy-3));border:1px solid var(--stroke)">
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-lg font-bold">Distribution</h3>
                    <span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">Total <span id="share-total" class="num">Rs 0</span></span>
                </div>
                <div class="space-y-3">
                    <div class="flex justify-between border-b border-white/10 pb-3"><span class="t-muted">Owner (40%)</span><span id="owner-val" class="font-bold t-gold num">Rs 0</span></div>
                    <div class="flex justify-between border-b border-white/10 pb-3"><span class="t-muted">Future Fund (36%)</span><span id="future-val" class="font-bold t-coral num">Rs 0</span></div>
                    <p class="text-xs t-muted pt-2 pb-1">Team pool (24%)</p>
                    ${teamRows}
                </div>
            </div>
        </div>
    </div>`;
}
function SHARE_LEAD_BY_NAME(name){ return Object.values(SHARE_LEAD).includes(name); }

/* ---------- Downloadable profit-share report (admin/owner) ---------- */
window.downloadShareReport = () => {
    if (window.__getRole && window.__getRole() === 'viewer') return;
    const b = activeBatch();
    const d = shareBreakdown(b);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    const company = (state && state.companyName) || 'Skillmentor.pk';
    const teamPool = TEAM.reduce((a,n)=>a+d.team[n],0);
    const revRows = COURSES.filter(c=>num(d.per[c.id])!==0)
        .map(c=>`<tr><td>${esc(c.name)}${SHARE_LEAD[c.id]?` <span class="lead">(lead: ${esc(SHARE_LEAD[c.id])})</span>`:''}</td><td class="r">${money(d.per[c.id])}</td></tr>`).join('')
        || `<tr><td colspan="2" class="muted">No revenue recorded for this batch.</td></tr>`;
    const teamRows = TEAM.map(n=>`<tr><td>${esc(n)}${SHARE_LEAD_BY_NAME(n)?` <span class="lead">(lead)</span>`:''}</td><td class="r">${money(d.team[n])}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Profit Share — ${esc(b.name)}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#001632;max-width:760px;margin:24px auto;padding:0 20px;}
 .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #E14B5E;padding-bottom:14px;margin-bottom:20px;}
 .brand{font-size:24px;font-weight:800;color:#E14B5E;} .brand span{color:#001632;}
 h2{font-size:13px;margin:24px 0 8px;color:#001632;text-transform:uppercase;letter-spacing:.05em;}
 table{width:100%;border-collapse:collapse;margin-bottom:6px;} td,th{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:14px;}
 .r{text-align:right;font-variant-numeric:tabular-nums;} th{background:#fff6dd;font-size:11px;text-transform:uppercase;color:#7a5a12;}
 .total{font-weight:800;} .total td{border-top:2px solid #001632;} .muted{color:#8a94a6;} .lead{color:#E14B5E;font-size:12px;}
 .cards{display:flex;gap:12px;margin:14px 0;} .card{flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;}
 .card .lbl{font-size:11px;color:#8a94a6;text-transform:uppercase;} .card .val{font-size:20px;font-weight:800;margin-top:2px;color:#001632;}
 .foot{margin-top:26px;color:#8a94a6;font-size:12px;border-top:1px solid #e2e8f0;padding-top:12px;}
 .btn{display:inline-block;background:#E14B5E;color:#fff;padding:10px 18px;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:18px;}
 @media print{.btn{display:none;} body{margin:0;}}
</style></head><body>
<button class="btn" onclick="window.print()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print / Save as PDF</button>
<div class="head"><div class="brand">${esc(company)}</div>
 <div style="text-align:right"><div style="font-weight:700">Profit Share Report</div><div class="muted">${esc(b.name)} · ${dateStr}</div></div></div>
<div class="cards">
 <div class="card"><div class="lbl">Net Distributable</div><div class="val">${money(d.total)}</div></div>
 <div class="card"><div class="lbl">Owner · 40%</div><div class="val">${money(d.owner)}</div></div>
 <div class="card"><div class="lbl">Future Fund · 36%</div><div class="val">${money(d.future)}</div></div>
</div>
<h2>Net Calculation</h2>
<table><tbody>
 <tr><td>Current received</td><td class="r">${money(d.currentReceived)}</td></tr>
 <tr><td>+ Previous batch received</td><td class="r">${money(d.prevReceived)}</td></tr>
 <tr><td>− Refunds</td><td class="r">− ${money(d.refunds)}</td></tr>
 <tr class="total"><td>Net distributable</td><td class="r">${money(d.total)}</td></tr></tbody></table>
<h2>Revenue by Service (net)</h2>
<table><thead><tr><th>Service</th><th class="r">Net revenue</th></tr></thead><tbody>${revRows}
 <tr class="total"><td>Total (net)</td><td class="r">${money(d.total)}</td></tr></tbody></table>
<h2>Distribution</h2>
<table><tbody>
 <tr><td>Owner (40%)</td><td class="r">${money(d.owner)}</td></tr>
 <tr><td>Future Fund (36%)</td><td class="r">${money(d.future)}</td></tr>
 <tr><td>Team Pool (24%)</td><td class="r">${money(teamPool)}</td></tr>
 <tr class="total"><td>Grand total</td><td class="r">${money(d.owner+d.future+teamPool)}</td></tr></tbody></table>
<h2>Team Pool Breakdown</h2>
<table><thead><tr><th>Member</th><th class="r">Share</th></tr></thead><tbody>${teamRows}
 <tr class="total"><td>Team total</td><td class="r">${money(teamPool)}</td></tr></tbody></table>
<div class="foot">Generated ${dateStr} · ${esc(company)} Revenue Dashboard.<br>Split rule: Owner 40% · Future fund 36% · Team pool 24% (a service lead earns 12% of that service, remainder split among the other members).</div>
</body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ProfitShare_${b.name.replace(/\s+/g,'_')}_${now.toISOString().slice(0,10)}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
};

/* =====================================================================
   COMPANY PROFILE (owner) — name + logo
   ===================================================================== */
let pendingLogo = null;
window.openBatchModal = () => {
    const b = activeBatch();
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-md my-6 pop-in border border-white/10" style="background:var(--navy-2)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-white">Edit batch</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            <label class="text-xs font-semibold t-muted">Batch name / number</label>
            <input id="batch-name" class="field mt-1" value="${esc(b.name)}" placeholder="e.g. Batch 6" onkeydown="if(event.key==='Enter')saveBatchName()">
            <p class="text-xs t-muted mt-2">Shown on the batch tab, summaries and reports.</p>
            <div class="flex justify-end gap-2 mt-6">
                <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
                <button onclick="saveBatchName()" class="btn-primary px-6 py-2.5 rounded-xl font-bold">Save</button>
            </div>
        </div>
    </div>`;
    setTimeout(() => document.getElementById('batch-name')?.focus(), 50);
};
window.saveBatchName = () => {
    const v = document.getElementById('batch-name').value.trim();
    if (!v) return alert("Please enter a batch name.");
    activeBatch().name = v; save(); closeModal(); render();
};
window.openCompanyProfile = () => {
    document.getElementById('profile-menu').classList.add('hidden-view');
    if (window.__getRole && window.__getRole() !== 'owner') return;
    pendingLogo = null;
    const name = (state && state.companyName) || 'Skillmentor.pk';
    const logo = (state && state.logo) || '';
    const preview = logo
        ? `<img id="cp-preview" src="${logo}" class="w-full h-full object-cover">`
        : `<span id="cp-preview" class="text-white font-black text-lg">${esc((name.replace(/[^a-zA-Z0-9]/g,'').slice(0,2)||'SM').toUpperCase())}</span>`;
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-md my-6 pop-in border border-white/10" style="background:var(--navy-2)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-white">Company profile</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            <div class="flex items-center gap-4 mb-5">
                <div id="cp-logo-box" class="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shrink-0" style="background:linear-gradient(135deg,var(--coral),var(--gold))">${preview}</div>
                <div class="flex-1">
                    <label class="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm cursor-pointer">${ic('upload','w-4 h-4')} Upload logo
                        <input type="file" accept="image/*" class="hidden" onchange="handleLogoPick(event)">
                    </label>
                    ${logo ? `<button onclick="removeLogo()" class="ml-2 text-xs t-coral hover:brightness-125 font-semibold">Remove</button>` : ``}
                    <p class="text-xs t-muted mt-1">PNG/JPG, square works best.</p>
                </div>
            </div>
            <label class="text-xs font-semibold t-muted">Company name</label>
            <input id="cp-name" class="field mt-1" value="${esc(name)}" placeholder="Company name">
            <p id="cp-err" class="t-coral text-sm mt-2"></p>
            <div class="flex justify-end gap-2 mt-6">
                <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>
                <button onclick="saveCompanyProfile()" class="btn-primary px-6 py-2.5 rounded-xl font-bold">Save</button>
            </div>
        </div>
    </div>`;
};
window.handleLogoPick = (ev) => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { document.getElementById('cp-err').innerText = "Please choose an image file."; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const max = 256; let { width, height } = img;
            if (width > height && width > max) { height = Math.round(height * max / width); width = max; }
            else if (height > max) { width = Math.round(width * max / height); height = max; }
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            pendingLogo = canvas.toDataURL('image/png');
            const box = document.getElementById('cp-logo-box');
            if (box) box.innerHTML = `<img src="${pendingLogo}" class="w-full h-full object-cover">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};
window.removeLogo = () => { pendingLogo = ''; state.logo = ''; save(); render(); openCompanyProfile(); };
window.saveCompanyProfile = () => {
    const name = document.getElementById('cp-name').value.trim();
    if (!name) { document.getElementById('cp-err').innerText = "Enter a company name."; return; }
    state.companyName = name;
    if (pendingLogo !== null) state.logo = pendingLogo;
    save(); closeModal(); render();
};

/* ---------- Convert static icons once on load ---------- */
refreshIcons();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshIcons);
window.addEventListener('load', refreshIcons);
