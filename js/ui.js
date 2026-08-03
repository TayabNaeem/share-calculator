/* =====================================================================
   ui.js — icons, rendering, navigation, tabs, modals, report
   Palette only: navy #001632 · coral #E14B5E · gold #1E293B · white
   ===================================================================== */

/* ---------- Icons ---------- */
function ic(name, cls){ return `<i data-lucide="${name}" class="${cls||'w-4 h-4'}"></i>`; }
function refreshIcons(){ if (window.lucide) window.lucide.createIcons(); }
window.refreshIcons = refreshIcons;
(function(){
    const mr = document.getElementById('modal-root');
    if (mr && window.MutationObserver) new MutationObserver(refreshIcons).observe(mr, { childList: true });
})();

/* Today, in the same format the settled-date stamp uses (e.g. "3 Aug 2026").
   New records default to this so a forgotten date is never left blank. */
function todayStr(){ return new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }

/* =====================================================================
   NAVIGATION
   ===================================================================== */
window.setTab = (t) => { activeTab = t; render(); };
window.setBatch = (id) => { activeBatchId = id; save(); render(); };
function nextBatchNum(){ return Math.max(0, ...state.batches.map(b => { const m=(b.name||'').match(/\d+/); return m?+m[0]:0; })) + 1; }
function makeBatch(name){ return { id:'b'+Date.now()+Math.floor(Math.random()*1000), name, students:[], previous:[], refunds:[], pending:[], share:{}, shareSettled:false, settledPct:0, settledAt:'' }; }
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
    // Favicon: use the uploaded favicon, else fall back to the logo, else leave as-is
    const fav = (state && (state.favicon || state.logo)) || '';
    if (fav) {
        let link = document.getElementById('favicon');
        if (!link) { link = document.createElement('link'); link.id = 'favicon'; link.rel = 'icon'; document.head.appendChild(link); }
        link.href = fav;
    }
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
    else if (activeTab === 'oneonone')     c.innerHTML = viewOneOnOne();
    else if (activeTab === 'physical')     c.innerHTML = viewPhysical();
    else if (activeTab === 'installments') c.innerHTML = viewInstallments();
    else if (activeTab === 'breakdown')    c.innerHTML = viewBreakdown();
    else if (activeTab === 'previous')     c.innerHTML = viewPrevious();
    else if (activeTab === 'refunds')      c.innerHTML = viewRefunds();
    else if (activeTab === 'futurefund')   c.innerHTML = viewFutureFund();
    else if (activeTab === 'summary')      c.innerHTML = viewSummary();
    else if (activeTab === 'share')      { c.innerHTML = viewShare(); wireShare(); }
    refreshIcons();
}

function renderBatchBar(){
    const bar = document.getElementById('batch-bar');
    const batchScoped = ['students','breakdown','previous','refunds','share'].includes(activeTab);
    if (!batchScoped) { bar.innerHTML = ''; bar.classList.add('hidden-view'); return; }
    bar.classList.remove('hidden-view');
    bar.innerHTML = `<span class="text-[11px] font-bold uppercase tracking-wider t-muted mr-1 hidden sm:inline" title="Drag a batch to reorder">Batch</span>`
        + state.batches.map(b => `
        <button onclick="setBatch('${b.id}')" ondblclick="renameBatch('${b.id}')"
            draggable="true" ondragstart="batchDragStart(event,'${b.id}')" ondragover="batchDragOver(event)" ondrop="batchDrop(event,'${b.id}')"
            title="${b.shareSettled?'Profit distributed / settled':''}"
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap cursor-grab active:cursor-grabbing ${b.id===activeBatchId?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}">
            ${esc(b.name)}${b.shareSettled?`<span style="color:${b.id===activeBatchId?'#fff':COLOR.gold}">${ic('badge-check','w-3.5 h-3.5')}</span>`:''}
        </button>`).join('')
        + `<button onclick="addBatch()" class="edit-only inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold t-coral btn-ghost hover:text-[#001632] transition">${ic('plus','w-4 h-4')} Batch</button>`;
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
        <div class="glass card-hover rounded-2xl p-5 relative overflow-hidden flex items-center gap-4">
            <div class="absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-15 blur-xl" style="background:${c.color}"></div>
            <div class="icon-tile w-12 h-12 shrink-0" style="background:${c.color}22;color:${c.color}">${ic(c.icon,'w-6 h-6')}</div>
            <div class="min-w-0 relative">
                <p class="text-2xl font-extrabold text-ink num tracking-tight">${c.val}</p>
                <p class="text-xs font-semibold text-ink-70 mt-1 whitespace-nowrap">${c.label}</p>
                <p class="text-xs t-muted whitespace-nowrap">${c.sub}</p>
            </div>
        </div>`).join('');
}

/* ---------- shared small pieces ---------- */
function miniStat(label, val, color){
    return `<div class="rounded-xl p-4" style="background:${color}14;border:1px solid ${color}33">
        <p class="text-xs font-semibold" style="color:${color}">${label}</p>
        <p class="text-lg font-extrabold text-ink num mt-0.5">${val}</p></div>`;
}
function rpSummary(count, countLabel, rec, pen){
    return `<div class="grid grid-cols-3 gap-3 mb-6">
        ${miniStat(countLabel, String(count), COLOR.white)}
        ${miniStat('Total Received', money(rec), COLOR.gold)}
        ${miniStat('Total Pending', money(pen), COLOR.coral)}
    </div>`;
}
function bundleBadge(type){
    const a = BUNDLE[type]?.accent || COLOR.white;
    return `<span class="badge" style="background:${a}22;color:${a}">${BUNDLE[type]?.name||'—'}</span>`;
}
function modeBadge(mode){
    const physical = mode === 'physical';
    const c = physical ? COLOR.coral : COLOR.gold;
    return `<span class="badge" style="background:${c}22;color:${c}">${ic(physical?'map-pin':'wifi','w-3 h-3')} ${physical?'Physical':'Online'}</span>`;
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
            <td class="font-semibold text-ink whitespace-nowrap">${esc(s.name)||'<span class=\'t-muted\'>—</span>'}${s.sessionType==='1on1'?` <span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">1:1</span>`:''} ${modeBadge(s.mode)}</td>
            <td class="text-ink-70 num">${esc(s.contact)||'—'}</td>
            <td class="whitespace-nowrap">${bundleBadge(s.bundleType)}</td>
            <td class="text-ink-90">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold font-semibold">${money(s.feePaid)}</td>
            <td class="text-right num ${onInst?'t-coral':'t-muted'} font-semibold">${money(s.feePending)}</td>
            <td class="min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full fill-2 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
                    <span class="text-xs t-muted num">${pct}%</span>
                </div>
            </td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openStudentModal('${s.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
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
                <h2 class="text-xl font-bold text-ink">${esc(b.name)} — Students</h2>
                <p class="t-muted text-sm">${b.students.length} enrolled · <span class="t-gold">${money(rec)}</span> received · <span class="t-coral">${money(pen)}</span> pending</p>
            </div>
            <div class="flex gap-2">
                <button onclick="openBatchModal()" class="edit-only btn-ghost px-3.5 py-2.5 rounded-xl text-sm font-semibold text-ink-70 hover:text-[#001632] inline-flex items-center gap-1.5">${ic('pencil','w-4 h-4')} Edit batch</button>
                <button onclick="deleteBatch('${b.id}')" class="edit-only btn-ghost px-3.5 py-2.5 rounded-xl text-sm font-semibold text-ink-70 hover:text-[#E14B5E] inline-flex items-center gap-1.5">${ic('trash-2','w-4 h-4')} Delete</button>
                <button onclick="openStudentModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('user-plus','w-4 h-4')} Add Student</button>
            </div>
        </div>
        ${rpSummary(b.students.length, 'Students', rec, pen)}
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
            <span class="text-ink-90">${c.name}</span>
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
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-2xl my-6 pop-in border line" style="background:var(--navy-2);box-shadow:0 40px 80px -30px rgba(0,0,0,0.9)">
            <div class="flex items-center justify-between mb-5">
                <h3 class="text-lg font-bold text-ink">${title}</h3>
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
    const s = editing ? JSON.parse(JSON.stringify(editing)) : { sessionType:'batch', mode:'online', bundleType:'single', courses:[], feePaid:'', feePending:'', name:'', contact:'', date:todayStr() };
    const st = s.sessionType === '1on1' ? '1on1' : 'batch';
    const md = s.mode === 'physical' ? 'physical' : 'online';
    const sBtn = (val,label) => `<button type="button" data-session="${val}" onclick="setSessionType('${val}')" class="session-btn flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${st===val?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}">${label}</button>`;
    const mBtn = (val,label) => `<button type="button" data-mode="${val}" onclick="setMode('${val}')" class="mode-btn flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${md===val?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}">${label}</button>`;
    tabModal(`${editing?'Edit':'Add'} Student · <span class="t-coral">${esc(b.name)}</span>`, `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-semibold t-muted">Session type</label>
                <input type="hidden" id="m-session" value="${st}">
                <div class="grid grid-cols-2 gap-2 mt-1">${sBtn('batch','Normal Batch')}${sBtn('1on1','1-on-1')}</div>
            </div>
            <div>
                <label class="text-xs font-semibold t-muted">Mode</label>
                <input type="hidden" id="m-mode" value="${md}">
                <div class="grid grid-cols-2 gap-2 mt-1">${mBtn('online','Online')}${mBtn('physical','Physical')}</div>
            </div>
        </div>
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
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
            <button onclick="saveStudent('${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save changes':'Add student'}</button>
        </div>`);
};
window.setSessionType = (val) => {
    document.getElementById('m-session').value = val;
    document.querySelectorAll('.session-btn').forEach(b => {
        const on = b.dataset.session === val;
        b.className = `session-btn flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${on?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}`;
    });
};
window.setMode = (val) => {
    document.getElementById('m-mode').value = val;
    document.querySelectorAll('.mode-btn').forEach(b => {
        const on = b.dataset.mode === val;
        b.className = `mode-btn flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${on?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}`;
    });
};
window.saveStudent = (id) => {
    const b = activeBatch();
    const courses = [...document.querySelectorAll('.course-chk')].filter(c=>c.checked).map(c=>c.value);
    const data = {
        name: document.getElementById('m-name').value.trim(),
        contact: document.getElementById('m-contact').value.trim(),
        sessionType: document.getElementById('m-session').value === '1on1' ? '1on1' : 'batch',
        mode: document.getElementById('m-mode').value === 'physical' ? 'physical' : 'online',
        bundleType: document.getElementById('m-bundle').value,
        courses,
        // blank on a NEW record falls back to today; an existing record keeps whatever it has
        date: document.getElementById('m-date').value.trim() || (id ? '' : todayStr()),
        feePaid: num(document.getElementById('m-paid').value),
        feePending: num(document.getElementById('m-pending').value),
    };
    if (!data.name) return alert("Please enter a name.");
    if (id) Object.assign(b.students.find(x=>x.id===id), data);
    else b.students.push(normalizeStudent({ ...data, installments: [] }));
    save(); closeModal(); render();
};

/* =====================================================================
   TAB: 1-ON-1 TRAINING (all batches, sessionType === '1on1')
   ===================================================================== */
window.editStudentFrom = (bid, sid) => { activeBatchId = bid; openStudentModal(sid); };
window.deleteStudentFrom = (bid, sid) => {
    const b = state.batches.find(x=>x.id===bid); if (!b) return;
    const s = b.students.find(x=>x.id===sid);
    if (!confirm(`Remove ${s?.name||'this student'}?`)) return;
    b.students = b.students.filter(x=>x.id!==sid); save(); render();
};
function viewOneOnOne(){
    const list = [];
    state.batches.forEach(b => b.students.forEach(s => { if (s.sessionType === '1on1') list.push({ b, s }); }));
    const rec = list.reduce((a,x)=>a+num(x.s.feePaid),0);
    const pen = list.reduce((a,x)=>a+num(x.s.feePending),0);
    const rows = list.map(({b,s}) => {
        const total = num(s.feePaid)+num(s.feePending);
        const pct = total>0 ? Math.round(num(s.feePaid)/total*100) : 100;
        return `
        <tr>
            <td class="font-semibold text-ink">${esc(s.name)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-ink-70 num">${esc(s.contact)||'—'}</td>
            <td><span class="badge glass text-ink-70">${esc(b.name)}</span></td>
            <td>${bundleBadge(s.bundleType)}</td>
            <td class="text-ink-90">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold font-semibold">${money(s.feePaid)}</td>
            <td class="text-right num ${num(s.feePending)>0?'t-coral':'t-muted'} font-semibold">${money(s.feePending)}</td>
            <td class="min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full fill-2 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
                    <span class="text-xs t-muted num">${pct}%</span>
                </div>
            </td>
            <td class="text-right whitespace-nowrap">
                <button onclick="editStudentFrom('${b.id}','${s.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteStudentFrom('${b.id}','${s.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`;
    }).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="mb-6">
            <h2 class="text-xl font-bold text-ink">1-on-1 Training</h2>
            <p class="t-muted text-sm">${list.length} one-on-one student${list.length!==1?'s':''} (all batches)</p>
        </div>
        ${rpSummary(list.length, '1-on-1 Students', rec, pen)}
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Name</th><th>Contact</th><th>Batch</th><th>Bundle</th><th>Program</th><th class="text-right">Fee Paid</th><th class="text-right">Fee Pending</th><th>Progress</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="9" class="text-center t-muted py-12"><div class="flex flex-col items-center gap-2">${ic('user-round','w-8 h-8 text-[#1E293B]')}<span>No 1-on-1 students yet. Add a student and set <b class="t-coral">Session type → 1-on-1</b>.</span></div></td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}

/* =====================================================================
   TAB: PHYSICAL BATCH (all batches, mode === 'physical')
   ===================================================================== */
function viewPhysical(){
    const list = [];
    state.batches.forEach(b => b.students.forEach(s => { if (s.mode === 'physical') list.push({ b, s }); }));
    const rec = list.reduce((a,x)=>a+num(x.s.feePaid),0);
    const pen = list.reduce((a,x)=>a+num(x.s.feePending),0);
    const rows = list.map(({b,s}) => {
        const total = num(s.feePaid)+num(s.feePending);
        const pct = total>0 ? Math.round(num(s.feePaid)/total*100) : 100;
        return `
        <tr>
            <td class="font-semibold text-ink whitespace-nowrap">${esc(s.name)||'<span class=\'t-muted\'>—</span>'}${s.sessionType==='1on1'?` <span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">1:1</span>`:''}</td>
            <td class="text-ink-70 num">${esc(s.contact)||'—'}</td>
            <td><span class="badge glass text-ink-70">${esc(b.name)}</span></td>
            <td class="whitespace-nowrap">${bundleBadge(s.bundleType)}</td>
            <td class="text-ink-90">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold font-semibold">${money(s.feePaid)}</td>
            <td class="text-right num ${num(s.feePending)>0?'t-coral':'t-muted'} font-semibold">${money(s.feePending)}</td>
            <td class="min-w-[120px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full fill-2 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
                    <span class="text-xs t-muted num">${pct}%</span>
                </div>
            </td>
            <td class="text-right whitespace-nowrap">
                <button onclick="editStudentFrom('${b.id}','${s.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteStudentFrom('${b.id}','${s.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`;
    }).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="mb-6">
            <h2 class="text-xl font-bold text-ink flex items-center gap-2">${ic('map-pin','w-5 h-5 text-[#E14B5E]')} Physical Batch Students</h2>
            <p class="t-muted text-sm">${list.length} physical student${list.length!==1?'s':''} (all batches)</p>
        </div>
        ${rpSummary(list.length, 'Physical Students', rec, pen)}
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Name</th><th>Contact</th><th>Batch</th><th>Bundle</th><th>Program</th><th class="text-right">Fee Paid</th><th class="text-right">Fee Pending</th><th>Progress</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="9" class="text-center t-muted py-12"><div class="flex flex-col items-center gap-2">${ic('map-pin','w-8 h-8 text-[#E14B5E]')}<span>No physical students yet. Add a student and set <b class="t-coral">Mode → Physical</b>.</span></div></td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}

/* =====================================================================
   TAB: INSTALLMENTS
   ===================================================================== */
function viewInstallments(){
    const list = [];
    state.batches.forEach(b => b.students.forEach(s => { if (num(s.feePending) > 0) list.push({ b, s }); }));
    list.sort((a,z)=> num(z.s.feePending)-num(a.s.feePending));
    const totalPending = list.reduce((a,x)=>a+num(x.s.feePending),0);
    const totalPaid = list.reduce((a,x)=>a+num(x.s.feePaid),0);
    const rows = list.map(({b,s}) => {
        const total = num(s.feePaid)+num(s.feePending);
        const pct = total>0 ? Math.round(num(s.feePaid)/total*100) : 0;
        return `
        <tr>
            <td class="font-semibold text-ink">${esc(s.name)}</td>
            <td class="text-ink-70 num">${esc(s.contact)||'<span class=\'t-muted\'>—</span>'}</td>
            <td><span class="badge glass text-ink-70">${esc(b.name)}</span></td>
            <td class="text-ink-70">${esc(programLabel(s))}</td>
            <td class="text-right num t-gold">${money(s.feePaid)}</td>
            <td class="text-right num t-coral font-bold">${money(s.feePending)}</td>
            <td class="min-w-[140px]">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 rounded-full fill-2 overflow-hidden"><div style="width:${pct}%;background:linear-gradient(90deg,${COLOR.gold},${COLOR.coral})" class="h-full"></div></div>
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
            <h2 class="text-xl font-bold text-ink">Students on Installments</h2>
            <p class="t-muted text-sm">${list.length} students with a pending balance (all batches)</p>
        </div>
        ${rpSummary(list.length, 'On installments', totalPaid, totalPending)}
        <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Student</th><th>Contact</th><th>Batch</th><th>Program</th><th class="text-right">Paid</th><th class="text-right">Pending</th><th>Progress</th><th></th></tr></thead>
                <tbody>${rows || `<tr><td colspan="8" class="text-center t-muted py-12"><div class="flex flex-col items-center gap-2">${ic('circle-check-big','w-8 h-8 text-[#1E293B]')}<span>No pending balances. Everyone is fully paid.</span></div></td></tr>`}</tbody>
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

/* batchName — used by the fund / other-payment batch pickers */
function batchName(id){ return (state.batches.find(b=>b.id===id)||{}).name || '—'; }

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
                <td class="text-ink font-medium">${esc(g.program)}</td>
                <td class="text-right num t-gold">${money(g.received)}</td>
                <td class="text-right num t-coral">${money(g.pending)}</td>
                <td class="text-right num text-ink-90 font-semibold">${money(g.received+g.pending)}</td>
            </tr>`).join('');
        return `
        <div class="glass rounded-2xl overflow-hidden">
            <div class="px-5 py-3 flex items-center justify-between" style="background:${bd.accent}14;border-bottom:1px solid var(--stroke)">
                <h3 class="font-bold text-ink flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${bd.accent}"></span>${bd.name}</h3>
                <span class="text-xs t-muted">${students.length} student${students.length!==1?'s':''}</span>
            </div>
            <table class="tbl w-full text-sm">
                <thead><tr><th>Students</th><th>Course / Combo</th><th class="text-right">Received</th><th class="text-right">Pending</th><th class="text-right">Total</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5" class="text-center t-muted py-6">No ${bd.name.toLowerCase()} enrolments.</td></tr>`}</tbody>
                ${groups.length ? `<tfoot><tr class="font-bold text-ink" style="border-top:2px solid var(--stroke)">
                    <td colspan="2" class="text-ink-70">Subtotal</td>
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
            <h2 class="text-xl font-bold text-ink">${esc(b.name)} — Bundle &amp; Course Breakdown</h2>
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
            <td class="text-ink-90">${esc(programLabel(e))}</td>
            <td class="text-right num t-gold font-semibold">${money(e.received)}</td>
            <td class="text-right num ${num(e.pending)>0?'t-coral':'t-muted'} font-semibold">${money(e.pending)}</td>
            <td class="text-right num text-ink font-semibold">${money(num(e.received)+num(e.pending))}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openPrevModal('${e.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deletePrevEntry('${e.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-ink">${esc(b.name)} — Previous Batch Payments</h2>
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
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
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
            <td class="font-semibold text-ink">${esc(r.name)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-ink-70 num">${esc(r.contact)||'—'}</td>
            <td>${bundleBadge(r.bundleType)}</td>
            <td class="text-ink-90">${esc(programLabel(r))}</td>
            <td class="t-muted">${esc(r.date)||'—'}</td>
            <td class="t-muted">${esc(r.reason)||'—'}</td>
            <td class="text-right num t-coral font-semibold">${money(r.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openRefundModal('${r.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Edit">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteRefund('${r.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Delete">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-ink">${esc(b.name)} — Fee Refunds</h2>
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
    const r = editing ? JSON.parse(JSON.stringify(editing)) : { bundleType:'single', courses:[], name:'', contact:'', amount:'', date:todayStr(), reason:'' };
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
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
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
        date: document.getElementById('m-date').value.trim() || (id ? '' : todayStr()),
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
   Simple modal (no bundle picker) — used by fund / other-payment forms
   ===================================================================== */
function plainModal(title, inner){
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-md my-6 pop-in border line" style="background:var(--navy-2)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-ink">${title}</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            ${inner}
        </div>
    </div>`;
};

/* =====================================================================
   TAB: FUTURE FUND (36% of every batch + manual additions − expenses)
   ===================================================================== */
function fundBatchPicker(selectedId){
    const label = selectedId ? batchName(selectedId) : 'General (no batch)';
    return `<div class="cdd mt-1" data-cdd>
        <input type="hidden" id="fund-batch" value="${selectedId||''}">
        <button type="button" class="field readonly-field cdd-btn" onclick="cddToggle(this)">
            <span id="fund-batch-label" class="cdd-val">${esc(label)}</span>
            <svg class="cdd-chev" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <ul class="cdd-menu">
            <li class="cdd-opt ${!selectedId?'active':''}" onclick="fundBatchSelect('')">General (no batch)</li>
            ${state.batches.map(b=>`<li class="cdd-opt ${b.id===selectedId?'active':''}" onclick="fundBatchSelect('${b.id}')">${esc(b.name)}</li>`).join('')}
        </ul>
    </div>`;
}
window.fundBatchSelect = (id) => {
    document.getElementById('fund-batch').value = id;
    document.getElementById('fund-batch-label').innerText = id ? batchName(id) : 'General (no batch)';
    const cdd = document.getElementById('fund-batch').closest('[data-cdd]');
    cdd.classList.remove('open');
    cdd.querySelectorAll('.cdd-opt').forEach(o => o.classList.toggle('active', o.getAttribute('onclick').includes(`'${id}'`)));
};
function viewFutureFund(){
    const auto = fundAutoTotal(), adds = fundAdditionsTotal(), exp = fundExpensesTotal();
    const bal = auto + adds - exp;
    const batchRows = state.batches.map(b => {
        const f = shareBreakdown(b).future;
        return `<tr><td class="font-semibold text-ink">${esc(b.name)}</td><td class="text-right num t-gold">${money(f)}</td></tr>`;
    }).join('');
    const addRows = (state.fund.additions||[]).map(e => `
        <tr>
            <td class="text-ink">${esc(e.note)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="text-ink-70">${e.batchId?esc(batchName(e.batchId)):'<span class="t-muted">General</span>'}</td>
            <td class="t-muted">${esc(e.date)||'—'}</td>
            <td class="text-right num t-gold font-semibold">${money(e.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openFundEntry('addition','${e.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteFundEntry('addition','${e.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    const expRows = (state.fund.expenses||[]).map(e => `
        <tr>
            <td class="text-ink">${esc(e.note)||'<span class=\'t-muted\'>—</span>'}</td>
            <td class="t-muted">${esc(e.date)||'—'}</td>
            <td class="text-right num t-coral font-semibold">− ${money(e.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openFundEntry('expense','${e.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteFundEntry('expense','${e.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="space-y-5">
        <div class="glass rounded-3xl p-6 md:p-8">
            <div class="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 class="text-sm font-bold t-muted uppercase tracking-wide">Future Fund Balance</h2>
                    <p class="text-4xl font-extrabold t-gold num mt-1">${money(bal)}</p>
                </div>
                <div class="grid grid-cols-3 gap-3 text-right">
                    ${miniStat('From batches (36%)', money(auto), COLOR.gold)}
                    ${miniStat('Manual additions', money(adds), COLOR.gold)}
                    ${miniStat('Expenses', money(exp), COLOR.coral)}
                </div>
            </div>
        </div>

        <div class="glass rounded-3xl p-6 md:p-8">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div><h2 class="text-lg font-bold text-ink">Manual additions</h2><p class="t-muted text-sm">Extra contributions you add to the fund.</p></div>
                <button onclick="openFundEntry('addition')" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add</button>
            </div>
            <div class="overflow-x-auto"><table class="tbl w-full text-sm">
                <thead><tr><th>Note</th><th>Batch</th><th>Date</th><th class="text-right">Amount</th><th></th></tr></thead>
                <tbody>${addRows || `<tr><td colspan="5" class="text-center t-muted py-8">No manual additions yet.</td></tr>`}</tbody>
            </table></div>
        </div>

        <div class="glass rounded-3xl p-6 md:p-8">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div><h2 class="text-lg font-bold text-ink">Expenses</h2><p class="t-muted text-sm">Deducted from the fund balance.</p></div>
                <button onclick="openFundEntry('expense')" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add</button>
            </div>
            <div class="overflow-x-auto"><table class="tbl w-full text-sm">
                <thead><tr><th>Expense</th><th>Date</th><th class="text-right">Amount</th><th></th></tr></thead>
                <tbody>${expRows || `<tr><td colspan="4" class="text-center t-muted py-8">No expenses recorded.</td></tr>`}</tbody>
            </table></div>
        </div>

        <div class="glass rounded-3xl p-6 md:p-8">
            <h2 class="text-lg font-bold text-ink mb-1">Future fund by batch (36%)</h2>
            <p class="t-muted text-sm mb-4">Auto-calculated from each batch's profit share.</p>
            <div class="overflow-x-auto"><table class="tbl w-full text-sm">
                <thead><tr><th>Batch</th><th class="text-right">Future Fund</th></tr></thead>
                <tbody>${batchRows}</tbody>
                <tfoot><tr class="font-bold text-ink" style="border-top:2px solid var(--stroke)"><td>All batches</td><td class="text-right num t-gold">${money(auto)}</td></tr></tfoot>
            </table></div>
        </div>
    </div>`;
}
window.openFundEntry = (type, id) => {
    if (window.__getRole && window.__getRole() === 'viewer') return;
    const isExp = type === 'expense';
    const list = isExp ? state.fund.expenses : state.fund.additions;
    const editing = id ? list.find(x=>x.id===id) : null;
    const e = editing ? JSON.parse(JSON.stringify(editing)) : { note:'', amount:'', date:todayStr(), batchId:'' };
    plainModal(`${editing?'Edit':'Add'} ${isExp?'Expense':'Fund Addition'}`, `
        <div class="space-y-3">
            <div><label class="text-xs font-semibold t-muted">${isExp?'Expense':'Note'}</label><input id="fe-note" class="field mt-1" value="${esc(e.note)}" placeholder="${isExp?'e.g. Office rent':'e.g. Extra contribution'}"></div>
            ${!isExp?`<div><label class="text-xs font-semibold t-muted">Batch (optional)</label>${fundBatchPicker(e.batchId)}</div>`:''}
            <div class="grid grid-cols-2 gap-3">
                <div><label class="text-xs font-semibold ${isExp?'t-coral':'t-gold'}">Amount</label><input id="fe-amount" type="number" class="field mt-1" value="${e.amount}" placeholder="0"></div>
                <div><label class="text-xs font-semibold t-muted">Date</label><input id="fe-date" class="field mt-1" value="${esc(e.date)}" placeholder="e.g. 8 July"></div>
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
            <button onclick="saveFundEntry('${type}','${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save':'Add'}</button>
        </div>`);
};
window.saveFundEntry = (type, id) => {
    const isExp = type === 'expense';
    const list = isExp ? state.fund.expenses : state.fund.additions;
    const data = {
        note: document.getElementById('fe-note').value.trim(),
        amount: num(document.getElementById('fe-amount').value),
        date: document.getElementById('fe-date').value.trim() || (id ? '' : todayStr()),
        batchId: isExp ? '' : (document.getElementById('fund-batch').value || ''),
    };
    if (data.amount <= 0) return alert("Please enter an amount greater than 0.");
    if (id) Object.assign(list.find(x=>x.id===id), data);
    else list.push(normalizeFundEntry(data));
    save(); closeModal(); render();
};
window.deleteFundEntry = (type, id) => {
    if (!confirm("Delete this entry?")) return;
    if (type === 'expense') state.fund.expenses = state.fund.expenses.filter(x=>x.id!==id);
    else state.fund.additions = state.fund.additions.filter(x=>x.id!==id);
    save(); render();
};

/* =====================================================================
   OTHER PAYMENTS (lump sums; shown as a section inside Summary).
   Tie one to a batch to fold it into that batch's totals + profit share.
   ===================================================================== */
function otherPaymentsSection(){
    const list = state.otherPayments || [];
    const total = otherPaymentsTotal();
    const rows = list.map(o => `
        <tr>
            <td class="font-semibold text-ink">${o.batchId?esc(batchName(o.batchId)):'<span class="t-muted">General</span>'}</td>
            <td class="text-ink-70">${esc(o.note)||'—'}</td>
            <td class="t-muted">${esc(o.date)||'—'}</td>
            <td class="text-right num t-gold font-semibold">${money(o.amount)}</td>
            <td class="text-right whitespace-nowrap">
                <button onclick="openOtherModal('${o.id}')" class="edit-only icon-btn hover:text-[#1E293B]" style="width:30px;height:30px">${ic('pencil','w-4 h-4')}</button>
                <button onclick="deleteOther('${o.id}')" class="edit-only icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px">${ic('trash-2','w-4 h-4')}</button>
            </td>
        </tr>`).join('');
    return `
    <div class="glass rounded-3xl p-6 md:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
                <h2 class="text-lg font-bold text-ink">Other Payments</h2>
                <p class="t-muted text-sm">Lump sums for batches with no student records · <span class="t-gold font-semibold">${money(total)}</span> total (added to Total Received; batch-tied ones also count in that batch's Profit Share).</p>
            </div>
            <button onclick="openOtherModal()" class="edit-only btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('plus','w-4 h-4')} Add Payment</button>
        </div>
        <div class="overflow-x-auto"><table class="tbl w-full text-sm">
            <thead><tr><th>Batch</th><th>Note</th><th>Date</th><th class="text-right">Amount</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5" class="text-center t-muted py-8">No other payments recorded. Click <b class="t-coral">Add Payment</b>.</td></tr>`}</tbody>
            ${list.length ? `<tfoot><tr class="font-bold text-ink" style="border-top:2px solid var(--stroke)"><td colspan="3">Total</td><td class="text-right num t-gold">${money(total)}</td><td></td></tr></tfoot>`:''}
        </table></div>
    </div>`;
}
window.openOtherModal = (id) => {
    if (window.__getRole && window.__getRole() === 'viewer') return;
    const editing = id ? (state.otherPayments||[]).find(o=>o.id===id) : null;
    const o = editing ? JSON.parse(JSON.stringify(editing)) : { batchId:'', note:'', amount:'', date:todayStr() };
    plainModal(`${editing?'Edit':'Add'} Other Payment`, `
        <div class="space-y-3">
            <div><label class="text-xs font-semibold t-muted">Batch (tie it in to include in that batch's share)</label>${fundBatchPicker(o.batchId)}</div>
            <div><label class="text-xs font-semibold t-muted">Note / label</label><input id="op-note" class="field mt-1" value="${esc(o.note)}" placeholder="e.g. Batch 1 total collected"></div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="text-xs font-semibold t-gold">Amount</label><input id="op-amount" type="number" class="field mt-1" value="${o.amount}" placeholder="0"></div>
                <div><label class="text-xs font-semibold t-muted">Date</label><input id="op-date" class="field mt-1" value="${esc(o.date)}" placeholder="e.g. 8 July"></div>
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
            <button onclick="saveOther('${editing?editing.id:''}')" class="btn-primary px-6 py-2.5 rounded-xl font-bold">${editing?'Save':'Add'}</button>
        </div>`);
};
window.saveOther = (id) => {
    const data = {
        batchId: document.getElementById('fund-batch').value || '',
        note: document.getElementById('op-note').value.trim(),
        amount: num(document.getElementById('op-amount').value),
        date: document.getElementById('op-date').value.trim() || (id ? '' : todayStr()),
    };
    if (data.amount <= 0) return alert("Please enter an amount greater than 0.");
    state.otherPayments = state.otherPayments || [];
    if (id) Object.assign(state.otherPayments.find(o=>o.id===id), data);
    else state.otherPayments.push(normalizeOther(data));
    save(); closeModal(); render();
};
window.deleteOther = (id) => {
    if (!confirm("Delete this payment?")) return;
    state.otherPayments = (state.otherPayments||[]).filter(o=>o.id!==id); save(); render();
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
    let gRec=0,gPen=0,gRef=0,gPrev=0,gPrevPen=0;
    const batchRows = state.batches.map(b => {
        const rec=b.students.reduce((a,s)=>a+num(s.feePaid),0);
        const pen=b.students.reduce((a,s)=>a+num(s.feePending),0);
        const ref=batchRefundTotal(b);
        const pRec=batchPrevReceived(b), pPen=batchPrevPending(b);
        gRec+=rec; gPen+=pen; gRef+=ref; gPrev+=pRec; gPrevPen+=pPen;
        return `<tr>
            <td class="font-semibold text-ink">${esc(b.name)}</td>
            <td class="text-right num t-muted">${b.students.length}</td>
            <td class="text-right num t-gold">${money(rec)}</td>
            <td class="text-right num ${pen>0?'t-coral':'t-muted'}">${money(pen)}</td>
            <td class="text-right num ${pRec>0?'t-gold':'t-muted'}">${money(pRec)}</td>
            <td class="text-right num ${pPen>0?'t-coral':'t-muted'}">${money(pPen)}</td>
            <td class="text-right num ${ref>0?'t-coral':'t-muted'}">${money(ref)}</td>
            <td class="text-right num text-ink font-bold">${money(rec+pen+pRec+pPen)}</td>
        </tr>`;
    }).join('');

    const all = state.batches.flatMap(b=>b.students);
    const progs = groupByProgram(all).sort((a,z)=>z.received-a.received);
    const maxRec = Math.max(1, ...progs.map(p=>p.received));
    const progRows = progs.map(p => `
        <tr>
            <td class="text-ink font-medium">${esc(p.program)}</td>
            <td class="text-right num t-muted">${p.count}</td>
            <td class="text-right num t-gold">${money(p.received)}</td>
            <td class="text-right num t-coral">${money(p.pending)}</td>
            <td class="w-40"><div class="h-2 rounded-full fill-2 overflow-hidden"><div style="width:${Math.round(p.received/maxRec*100)}%;background:linear-gradient(90deg,${COLOR.coral},${COLOR.gold})" class="h-full"></div></div></td>
        </tr>`).join('');

    // Net distributable per batch (same figure as the Profit Share tab)
    const netByBatch = state.batches.map(b => ({ b, net: shareBreakdown(b).total }));
    const maxBar = Math.max(1, ...netByBatch.map(x=>x.net));
    const bars = netByBatch.map(({b, net}) => `
        <div class="flex flex-col items-center gap-2 flex-1 min-w-[54px]">
            <div class="w-full flex items-end justify-center" style="height:150px">
                <div class="w-9 rounded-t-lg" style="height:${Math.max(4,Math.round(net/maxBar*150))}px;background:linear-gradient(180deg,${COLOR.gold},#1E293B)"></div>
            </div>
            <span class="text-[11px] font-bold t-gold num">${money(net).replace('Rs ','')}</span>
            <span class="text-xs t-muted font-medium">${esc(b.name)}</span>
        </div>`).join('');

    return `
    <div class="space-y-5">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div class="glass rounded-3xl p-6 lg:col-span-2">
                <h2 class="text-lg font-bold text-ink mb-1">All Batches Overview</h2>
                <p class="t-muted text-sm mb-4">Net distributable amount per batch (the total in each batch — same figure as Profit Share).</p>
                <div class="flex items-end gap-3 justify-around px-2">${bars}</div>
                <div class="flex items-center gap-4 mt-4 text-xs t-muted">
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded" style="background:${COLOR.gold}"></span>Net distributable (received + previous + other − refunds)</span>
                </div>
            </div>
            <div class="glass rounded-3xl p-6 flex flex-col justify-center">
                <h2 class="text-lg font-bold text-ink mb-4">Grand Totals</h2>
                <div class="space-y-3">
                    ${sumRow('Received', money(gRec), COLOR.gold)}
                    ${otherPaymentsTotal()>0?sumRow('Other payments', money(otherPaymentsTotal()), COLOR.gold):''}
                    ${sumRow('Pending', money(gPen), COLOR.coral)}
                    ${sumRow('Refunded', money(gRef), COLOR.coral)}
                    ${sumRow('Prev. received', money(gPrev), COLOR.gold)}
                    ${sumRow('Prev. pending', money(gPrevPen), COLOR.coral)}
                    <div class="border-t line pt-3">${sumRow('Grand total (rec+pend)', money(gRec+otherPaymentsTotal()+gPen), COLOR.gold, true)}</div>
                </div>
            </div>
        </div>
        <div class="glass rounded-3xl p-6 md:p-8">
            <h2 class="text-lg font-bold text-ink mb-1">Batch Summary</h2>
            <p class="t-muted text-sm mb-4">Each batch's own figures — its students plus its previous-batch carry-forward — kept separate per batch.</p>
            <div class="overflow-x-auto">
            <table class="tbl w-full text-sm whitespace-nowrap">
                <thead><tr>
                    <th>Batch</th><th class="text-right">Students</th>
                    <th class="text-right">Received</th><th class="text-right">Pending</th>
                    <th class="text-right">Prev. Received</th><th class="text-right">Prev. Pending</th>
                    <th class="text-right">Refunded</th><th class="text-right">Total</th>
                </tr></thead>
                <tbody>${batchRows}</tbody>
                <tfoot><tr class="font-bold text-ink" style="border-top:2px solid var(--stroke)">
                    <td>All batches</td><td class="text-right num t-muted">${all.length}</td>
                    <td class="text-right num t-gold">${money(gRec)}</td>
                    <td class="text-right num t-coral">${money(gPen)}</td>
                    <td class="text-right num t-gold">${money(gPrev)}</td>
                    <td class="text-right num t-coral">${money(gPrevPen)}</td>
                    <td class="text-right num t-coral">${money(gRef)}</td>
                    <td class="text-right num">${money(gRec+gPen+gPrev+gPrevPen)}</td>
                </tr></tfoot>
            </table>
            </div>
        </div>
        <div class="glass rounded-3xl p-6 md:p-8">
            <h2 class="text-lg font-bold text-ink mb-1">Total Received by Training Program</h2>
            <p class="t-muted text-sm mb-4">Across all batches (single courses &amp; bundles counted as their combo).</p>
            <div class="overflow-x-auto">
            <table class="tbl w-full text-sm">
                <thead><tr><th>Program / Combo</th><th class="text-right">Students</th><th class="text-right">Received</th><th class="text-right">Pending</th><th>Share of revenue</th></tr></thead>
                <tbody>${progRows || `<tr><td colspan="5" class="text-center t-muted py-6">No enrolments yet.</td></tr>`}</tbody>
            </table>
            </div>
        </div>
        ${otherPaymentsSection()}
    </div>`;
}

/* =====================================================================
   TAB: PROFIT SHARE
   ===================================================================== */
function cssId(name){ return name.replace(/\s+/g,'_'); }
function wireShare(){ computeShare(); }
function computeShare(){
    const b = activeBatch();
    const d = shareBreakdown(b);
    const pct = num(b.settledPct);
    const rem = (amt) => amt * (100 - pct) / 100;   // remaining after settlement
    setTxt('owner-val', money(rem(d.owner)));
    setTxt('future-val', money(rem(d.future)));
    setTxt('share-total', money(d.total));
    TEAM.forEach(n => setTxt('res-'+cssId(n), money(rem(d.team[n]))));
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
                <span class="num font-bold ${per[c.id]>0?'text-ink':(per[c.id]<0?'t-coral':'t-muted')}">${Math.round(per[c.id]).toLocaleString()}</span>
            </div>
        </div>`).join('');
    const pct = num(b.settledPct);
    const fully = pct >= 100;
    const rem = (amt) => amt * (100 - pct) / 100;   // remaining to pay out
    const settledSub = (amt) => pct>0 ? `<div class="text-[11px] t-gold num">settled ${money(amt*pct/100)}</div>` : '';
    const remLabel = pct>0 ? `<span class="text-[10px] t-muted uppercase ml-1">left</span>` : '';
    const teamRows = TEAM.map(name => `
        <div class="flex justify-between items-center fill-1 px-4 py-2.5 rounded-xl text-sm">
            <span class="text-ink-70">${name}</span>
            <div class="text-right leading-tight">
                <span id="res-${cssId(name)}" class="font-bold text-ink num">${money(rem(d.team[name]))}</span>${remLabel}
                ${settledSub(d.team[name])}
            </div>
        </div>`).join('');
    const settledBadge = fully
        ? `<span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">${ic('badge-check','w-3.5 h-3.5')} Distributed${b.settledAt?` · ${esc(b.settledAt)}`:''}</span>`
        : (pct>0 ? `<span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">${ic('badge-check','w-3.5 h-3.5')} ${pct}% settled</span>` : '');
    const settleControl = `
        <div class="edit-only mb-4 relative z-20">
            <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-semibold t-muted uppercase tracking-wide">Settle each share</p>
                ${pct>0 && b.settledAt?`<p class="text-xs t-muted">${esc(b.settledAt)}</p>`:''}
            </div>
            <div class="grid grid-cols-5 gap-1.5">
                ${[0,25,50,75,100].map(p=>`<button onclick="setSettledPct(${p})" class="px-2 py-1.5 rounded-lg text-xs font-bold transition ${pct===p?'btn-primary':'btn-ghost t-muted hover:text-[#001632]'}">${p===0?'None':p+'%'}</button>`).join('')}
            </div>
        </div>`;
    const settledSummary = pct>0 ? `
        <div class="flex items-end justify-between mb-4 pb-4 border-b line relative z-20">
            <div>
                <p class="text-[11px] t-muted uppercase tracking-wide">Settled altogether (${pct}%)</p>
                <p class="text-3xl font-extrabold t-gold num leading-none mt-1">${money(d.total*pct/100)}</p>
            </div>
            <div class="text-right">
                <p class="text-[11px] t-muted uppercase tracking-wide">Remaining</p>
                <p class="text-xl font-bold text-ink num mt-1">${money(rem(d.total))}</p>
            </div>
        </div>` : '';
    return `
    <div class="glass rounded-3xl p-6 md:p-8 ${fully?'relative overflow-hidden':''}">
        ${fully ? `<div class="absolute -right-16 top-7 rotate-45 text-center pointer-events-none" style="width:220px;background:${COLOR.gold}26;border:1px solid ${COLOR.gold}55"><span class="text-xs font-extrabold tracking-widest uppercase" style="color:${COLOR.gold}">Distributed</span></div>` : ''}
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
                <h2 class="text-xl font-bold text-ink flex items-center gap-2 flex-wrap">${esc(b.name)} — Profit Distribution ${settledBadge}</h2>
                <p class="t-muted text-sm">Owner 40% · Future fund 36% · Team pool 24% (service lead earns 12%).</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right">
                    <p class="text-xs t-muted">Net distributable</p>
                    <p class="text-lg font-extrabold t-gold num">${money(d.total)}</p>
                </div>
                <button onclick="downloadShareReport()" class="edit-only btn-primary px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap inline-flex items-center gap-1.5">${ic('download','w-4 h-4')} Download report</button>
            </div>
        </div>
        <div class="grid grid-cols-2 ${d.other>0?'md:grid-cols-5':'md:grid-cols-4'} gap-3 mb-8">
            ${miniStat('Current received', money(d.currentReceived), COLOR.gold)}
            ${miniStat('+ Previous batch', money(d.prevReceived), COLOR.coral)}
            ${d.other>0?miniStat('+ Other payments', money(d.other), COLOR.gold):''}
            ${miniStat('− Refunds', money(d.refunds), COLOR.coral)}
            ${miniStat('= Net distributable', money(d.total), COLOR.gold)}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h3 class="text-xs font-bold t-muted uppercase tracking-widest mb-2">Revenue by Service (net)</h3>
                <p class="text-xs t-muted mb-4">Current + previous-batch received − refunds, with each bundle fee split equally across its courses.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${inputs}</div>
            </div>
            <div class="rounded-2xl p-6 text-ink relative overflow-hidden" style="background:linear-gradient(160deg,var(--navy-2),var(--navy-3));border:1px solid ${pct>0?COLOR.gold+'66':'var(--stroke)'}">
                ${fully ? `<div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"><span class="rotate-[-12deg] px-6 py-2 rounded-xl text-lg font-extrabold uppercase tracking-widest" style="color:${COLOR.gold};border:3px solid ${COLOR.gold}88;background:${COLOR.gold}12">Settled</span></div>` : ''}
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-lg font-bold">Distribution</h3>
                    <span class="badge" style="background:${COLOR.gold}22;color:${COLOR.gold}">Total <span id="share-total" class="num">Rs 0</span></span>
                </div>
                ${settleControl}
                ${settledSummary}
                <div class="space-y-3">
                    <div class="flex justify-between items-center border-b line pb-3"><span class="t-muted">Owner (40%)</span><div class="text-right leading-tight"><span id="owner-val" class="font-bold t-gold num">Rs 0</span>${remLabel}${settledSub(d.owner)}</div></div>
                    <div class="flex justify-between items-center border-b line pb-3"><span class="t-muted">Future Fund (36%)</span><div class="text-right leading-tight"><span id="future-val" class="font-bold t-coral num">Rs 0</span>${remLabel}${settledSub(d.future)}</div></div>
                    <p class="text-xs t-muted pt-2 pb-1">Team pool (24%)</p>
                    ${teamRows}
                </div>
            </div>
        </div>
    </div>`;
}
function SHARE_LEAD_BY_NAME(name){ return Object.values(SHARE_LEAD).includes(name); }
window.setSettledPct = (pct) => {
    if (window.__getRole && window.__getRole() === 'viewer') return;
    const b = activeBatch();
    b.settledPct = pct;
    b.shareSettled = pct >= 100;
    b.settledAt = pct > 0 ? new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
    save(); render();
};

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
let pendingLogo = null, pendingFavicon = null;
window.openBatchModal = () => {
    const b = activeBatch();
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-md my-6 pop-in border line" style="background:var(--navy-2)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-ink">Edit batch</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            <label class="text-xs font-semibold t-muted">Batch name / number</label>
            <input id="batch-name" class="field mt-1" value="${esc(b.name)}" placeholder="e.g. Batch 6" onkeydown="if(event.key==='Enter')saveBatchName()">
            <p class="text-xs t-muted mt-2">Shown on the batch tab, summaries and reports.</p>
            <div class="flex justify-end gap-2 mt-6">
                <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
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
    pendingLogo = null; pendingFavicon = null;
    const name = (state && state.companyName) || 'Skillmentor.pk';
    const logo = (state && state.logo) || '';
    const favicon = (state && state.favicon) || '';
    const preview = logo
        ? `<img id="cp-preview" src="${logo}" class="w-full h-full object-cover">`
        : `<span id="cp-preview" class="text-ink font-black text-lg">${esc((name.replace(/[^a-zA-Z0-9]/g,'').slice(0,2)||'SM').toUpperCase())}</span>`;
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full max-w-md my-6 pop-in border line" style="background:var(--navy-2)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-ink">Company profile</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
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
            <div class="flex items-center gap-4 mb-5">
                <div id="cp-fav-box" class="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 border line" style="background:rgba(255,255,255,0.05)">${favicon?`<img id="cp-fav-preview" src="${favicon}" class="w-8 h-8 object-contain">`:`<span id="cp-fav-preview" class="t-muted">${ic('image','w-6 h-6')}</span>`}</div>
                <div class="flex-1">
                    <label class="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm cursor-pointer text-ink-90">${ic('upload','w-4 h-4')} Upload favicon
                        <input type="file" accept="image/*" class="hidden" onchange="handleFaviconPick(event)">
                    </label>
                    ${favicon ? `<button onclick="removeFavicon()" class="ml-2 text-xs t-coral hover:brightness-125 font-semibold">Remove</button>` : ``}
                    <p class="text-xs t-muted mt-1">Browser-tab icon. Square PNG works best.</p>
                </div>
            </div>
            <label class="text-xs font-semibold t-muted">Company name</label>
            <input id="cp-name" class="field mt-1" value="${esc(name)}" placeholder="Company name">
            <p id="cp-err" class="t-coral text-sm mt-2"></p>
            <div class="flex justify-end gap-2 mt-6">
                <button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>
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
window.handleFaviconPick = (ev) => {
    const file = ev.target.files && ev.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { document.getElementById('cp-err').innerText = "Please choose an image file."; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const size = 64;
            const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
            canvas.getContext('2d').drawImage(img, 0, 0, size, size);
            pendingFavicon = canvas.toDataURL('image/png');
            const box = document.getElementById('cp-fav-box');
            if (box) box.innerHTML = `<img src="${pendingFavicon}" class="w-8 h-8 object-contain">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};
window.removeFavicon = () => { pendingFavicon = ''; state.favicon = ''; save(); render(); openCompanyProfile(); };
window.saveCompanyProfile = () => {
    const name = document.getElementById('cp-name').value.trim();
    if (!name) { document.getElementById('cp-err').innerText = "Enter a company name."; return; }
    state.companyName = name;
    if (pendingLogo !== null) state.logo = pendingLogo;
    if (pendingFavicon !== null) state.favicon = pendingFavicon;
    save(); closeModal(); render();
};

/* ---------- Convert static icons once on load ---------- */
refreshIcons();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshIcons);
window.addEventListener('load', refreshIcons);
