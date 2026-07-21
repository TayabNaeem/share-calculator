/* =====================================================================
   data.js — state model, persistence bridge, calculations
   ===================================================================== */

/* ---------- App state (shared across the classic scripts) ---------- */
let state = null;
let activeBatchId = null;
let activeTab = 'students';

function seedState(){
    const id = 'b' + Date.now();
    return {
        companyName: 'Skillmentor.pk',
        logo: '',
        favicon: '',
        batches: [
            { id:'b_batch2', name:'Batch 2', students:[], previous:[], refunds:[], pending:[], share:{}, shareSettled:false, settledAt:'' },
            { id, name:'Batch 5', students:[], previous:[], refunds:[], pending:[], share:{}, shareSettled:false, settledAt:'' },
        ],
        activeBatchId: id,
    };
}

/* ---------- Persistence bridge (auth.js drives these) ---------- */
window.__getState = () => state;
window.__loadState = (incoming) => {
    if (!incoming) { state = seedState(); }
    else {
        state = incoming;
        state.batches = (state.batches||[]).map(b => {
            let previous = Array.isArray(b.previous) ? b.previous.map(normalizePrev) : [];
            // migrate legacy single "previousReceived" number into a carry-forward entry
            if (!previous.length && num(b.previousReceived) > 0) {
                previous = [ normalizePrev({ bundleType:'single', courses:[], received:num(b.previousReceived), pending:0 }) ];
            }
            let refunds = Array.isArray(b.refunds) ? b.refunds.map(normalizeRefund) : [];
            // migrate legacy per-student "refunded" amounts into refund entries
            (b.students||[]).forEach(s => {
                if (num(s.refunded) > 0) refunds.push(normalizeRefund({
                    name: s.name, contact: s.contact, bundleType: s.bundleType, courses: s.courses,
                    amount: num(s.refunded), date: s.date, reason: 'Migrated from student record'
                }));
            });
            const pending = Array.isArray(b.pending) ? b.pending.map(normalizePending) : [];
            return {
                id: b.id || ('b'+Math.random().toString(36).slice(2)),
                name: b.name || 'Batch',
                students: (b.students||[]).map(normalizeStudent),
                previous, refunds, pending,
                share: b.share || {},
                shareSettled: !!b.shareSettled,
                settledAt: b.settledAt || '',
            };
        });
        if (!state.batches.length) state = seedState();
    }
    activeBatchId = state.activeBatchId && state.batches.some(b=>b.id===state.activeBatchId)
        ? state.activeBatchId : state.batches[0].id;
    render();
};

function normalizeStudent(s){
    return {
        id: s.id || ('s'+Math.random().toString(36).slice(2)),
        name: s.name||'', contact: s.contact||'',
        sessionType: s.sessionType === '1on1' ? '1on1' : 'batch',
        bundleType: s.bundleType || 'single',
        courses: Array.isArray(s.courses) ? s.courses : [],
        feePaid: num(s.feePaid), feePending: num(s.feePending),
        date: s.date || '',
        installments: Array.isArray(s.installments) ? s.installments : [],
    };
}
function normalizeRefund(r){
    return {
        id: r.id || ('r'+Math.random().toString(36).slice(2)),
        name: r.name||'', contact: r.contact||'',
        bundleType: r.bundleType || 'single',
        courses: Array.isArray(r.courses) ? r.courses : [],
        amount: num(r.amount), date: r.date || '', reason: r.reason || '',
    };
}
function normalizePrev(e){
    return {
        id: e.id || ('p'+Math.random().toString(36).slice(2)),
        bundleType: e.bundleType || 'single',
        courses: Array.isArray(e.courses) ? e.courses : [],
        received: num(e.received), pending: num(e.pending),
    };
}
function save(){ state.activeBatchId = activeBatchId; if (window.__queueSave) window.__queueSave(); }

/* ---------- Generic helpers ---------- */
function num(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function money(n){ return 'Rs ' + Math.round(num(n)).toLocaleString(); }
function activeBatch(){ return state.batches.find(b => b.id === activeBatchId) || state.batches[0]; }
function esc(str){ return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function programLabel(s){
    if (!s.courses || !s.courses.length) return BUNDLE[s.bundleType]?.name || '—';
    if (s.bundleType === 'single') return COURSE_NAME[s.courses[0]] || '—';
    return s.courses.map(c => COURSE_NAME[c] || c).join(' + ');
}

/* ---------- Batch-level calculations ---------- */
function batchRefundTotal(b){ return (b.refunds||[]).reduce((a,r)=>a+num(r.amount),0); }
function normalizePending(p){
    return {
        id: p.id || ('pd'+Math.random().toString(36).slice(2)),
        name: p.name||'', contact: p.contact||'',
        bundleType: p.bundleType || 'single',
        courses: Array.isArray(p.courses) ? p.courses : [],
        amount: num(p.amount), date: p.date || '', note: p.note || '',
    };
}
function batchPendingTotal(b){ return (b.pending||[]).reduce((a,p)=>a+num(p.amount),0); }
function batchPrevReceived(b){ return (b.previous||[]).reduce((a,e)=>a+num(e.received),0); }
function batchPrevPending(b){ return (b.previous||[]).reduce((a,e)=>a+num(e.pending),0); }

function globalTotals(){
    let received=0, pending=0, refunded=0, students=0;
    state.batches.forEach(b => {
        b.students.forEach(s => { received += num(s.feePaid); pending += num(s.feePending); students++; });
        pending += batchPendingTotal(b);   // standalone pending-payment records (all batches)
        refunded += batchRefundTotal(b);
    });
    return { received, pending, refunded, students };
}
function groupByProgram(students){
    const map = {};
    students.forEach(s => {
        const key = programLabel(s);
        if (!map[key]) map[key] = { program:key, count:0, received:0, pending:0 };
        map[key].count++; map[key].received += num(s.feePaid); map[key].pending += num(s.feePending);
    });
    return Object.values(map);
}

/* ---------- Profit-share calculation ----------
   Net per-course revenue = current received + previous received − refunds,
   each amount split EQUALLY across the courses of its bundle. Then per course:
   Owner 40% · Future 36% · Team pool 24% (that course's lead earns 12%). */
function addSplit(per, courses, amount, sign){
    const n = (courses && courses.length) ? courses.length : 0;
    if (!n || !num(amount)) return;
    const part = (num(amount) / n) * (sign || 1);
    courses.forEach(cid => { if (per[cid] !== undefined) per[cid] += part; });
}
function batchSharePerCourse(batch){
    const per = {}; COURSES.forEach(c => per[c.id] = 0);
    (batch.students||[]).forEach(s => addSplit(per, s.courses, s.feePaid, +1));
    (batch.previous||[]).forEach(e => addSplit(per, e.courses, e.received, +1));
    (batch.refunds||[]).forEach(r => addSplit(per, r.courses, r.amount, -1));
    return per;
}
function shareBreakdown(b){
    const per = batchSharePerCourse(b);
    let owner=0, future=0, total=0;
    const team = {}; TEAM.forEach(n=>team[n]=0);
    COURSES.forEach(c => {
        const val = num(per[c.id]); total += val;
        owner += val*0.40; future += val*0.36;
        const lead = SHARE_LEAD[c.id];
        if (lead) {
            team[lead] += val*0.12;
            const split = (val*0.12)/(TEAM.length-1);
            TEAM.forEach(n => { if (n!==lead) team[n]+=split; });
        } else {
            const split = (val*0.24)/TEAM.length;
            TEAM.forEach(n => team[n]+=split);
        }
    });
    return {
        per, owner, future, total, team,
        currentReceived: (b.students||[]).reduce((a,s)=>a+num(s.feePaid),0),
        prevReceived: batchPrevReceived(b),
        refunds: batchRefundTotal(b),
    };
}
