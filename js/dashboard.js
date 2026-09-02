/* =====================================================================
   dashboard.js — sidebar nav groups + the Dashboard overview tab.
   Classic script (shares the global scope with config/data/ui.js).
   Read-only: every figure here is computed from state, nothing is stored.
   ===================================================================== */

/* ---------- Sidebar nav groups ---------- */
/* Groups start CLOSED — one only opens when its parent is clicked, and stays
   open while the user browses inside it. Keyed by group, so it survives re-renders. */
let navOpen = {};
window.toggleNavGroup = (key) => {
    navOpen[key] = !navOpen[key];
    syncNavGroups();
};
/* Marks a collapsed parent when one of its children is the active tab, so the
   selection stays visible while the group is folded away. */
function syncNavGroups(){
    document.querySelectorAll('.nav-group').forEach(g => {
        const key = (g.id || '').replace('nav-grp-', '');
        const hasActive = !!g.querySelector('.tab-btn.active:not(.nav-parent)');
        const collapsed = !navOpen[key];
        g.classList.toggle('collapsed', collapsed);
        const parent = g.querySelector('.nav-parent');
        if (parent) {
            parent.classList.toggle('has-active', hasActive);
            parent.setAttribute('aria-expanded', String(!collapsed));
        }
    });
}

/* ---------- small presentational helpers ---------- */
function dashCard(title, icon, color, body, sub){
    return `<div class="glass rounded-2xl p-5">
        <div class="flex items-center gap-2.5 mb-4">
            <span class="icon-tile w-8 h-8 shrink-0" style="background:${color}1f;color:${color}">${ic(icon,'w-4 h-4')}</span>
            <div class="min-w-0">
                <h3 class="text-sm font-bold text-ink leading-tight">${title}</h3>
                ${sub ? `<p class="text-[11px] t-muted truncate">${sub}</p>` : ''}
            </div>
        </div>
        ${body}</div>`;
}
function statRow(label, value, color){
    return `<div class="stat-row"><span class="text-sm t-muted">${label}</span>
        <span class="text-sm font-bold num" style="color:${color || 'var(--ink)'}">${value}</span></div>`;
}
function bar(pct, color){
    const p = Math.max(0, Math.min(100, num(pct)));
    return `<div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${color}"></div></div>`;
}
/* Newest-first, using the same date precedence the tables use
   (typed date > captured createdAt > batch-creation estimate). */
function sortRecentStudents(list){
    return [...list].sort((x, y) => {
        const a = parseDateVal(dateSortKey(x.s, x.b)), b = parseDateVal(dateSortKey(y.s, y.b));
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return b - a;
    });
}

/* ---------- TAB: DASHBOARD ---------- */
function viewDashboard(){
    const t = globalTotals();
    const billed = t.received + t.pending;
    const rate = billed > 0 ? Math.round(t.received / billed * 100) : 0;

    // Roll the profit split up across every batch
    let net = 0, owner = 0, future = 0, pool = 0;
    state.batches.forEach(b => {
        const d = shareBreakdown(b);
        net += d.total; owner += d.owner; future += d.future;
        pool += TEAM.reduce((a, n) => a + num(d.team[n]), 0);
    });

    // Enrolment mix
    let online = 0, physical = 0, oneonone = 0, normal = 0;
    const all = [];
    state.batches.forEach(b => (b.students || []).forEach(s => {
        all.push({ b, s });
        s.mode === 'physical' ? physical++ : online++;
        s.sessionType === '1on1' ? oneonone++ : normal++;
    }));
    const mixRow = (label, n, color) => {
        const p = t.students > 0 ? Math.round(n / t.students * 100) : 0;
        return `<div class="mb-3">
            <div class="flex justify-between text-xs mb-1.5">
                <span class="font-semibold text-ink-90">${label}</span>
                <span class="t-muted num">${n} · ${p}%</span>
            </div>${bar(p, color)}</div>`;
    };

    // Top programmes by fees received
    const progs = groupByProgram(all.map(x => x.s)).sort((a, b) => b.received - a.received).slice(0, 5);
    const maxProg = Math.max(1, ...progs.map(p => p.received));

    // Batch performance
    const batchRows = state.batches.map(b => {
        const rec = batchStudentsReceived(b) + batchPrevReceived(b) + otherForBatch(b.id);
        const pen = (b.students || []).reduce((a, s) => a + num(s.feePending), 0) + batchPendingTotal(b);
        const tot = rec + pen;
        const pct = tot > 0 ? Math.round(rec / tot * 100) : 0;
        return `<tr>
            <td class="font-semibold text-ink whitespace-nowrap">${esc(b.name)}
                ${b.shareSettled ? `<span class="badge" style="background:${COLOR.gold}18;color:${COLOR.gold}">settled</span>` : ''}</td>
            <td class="text-right num t-muted">${(b.students || []).length}</td>
            <td class="text-right num t-gold font-semibold">${money(rec)}</td>
            <td class="text-right num ${pen > 0 ? 't-coral' : 't-muted'} font-semibold">${money(pen)}</td>
            <td class="w-32"><div class="flex items-center gap-2">
                <div class="flex-1">${bar(pct, `linear-gradient(90deg,${COLOR.gold},${COLOR.coral})`)}</div>
                <span class="text-[11px] t-muted num">${pct}%</span>
            </div></td>
            <td class="text-right num font-bold text-ink">${money(shareBreakdown(b).total)}</td>
        </tr>`;
    }).join('');

    // Most recent enrolments
    const recent = sortRecentStudents(all).slice(0, 6).map(({ b, s }) => `
        <div class="flex items-center gap-3 py-2.5 border-b line last:border-0">
            <span class="icon-tile w-8 h-8 shrink-0 text-xs font-bold" style="background:${COLOR.coral}18;color:${COLOR.coral}">${esc((s.name || '?').trim().charAt(0).toUpperCase())}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-ink truncate">${esc(s.name) || '—'}</p>
                <p class="text-[11px] t-muted truncate">${esc(b.name)} · ${esc(programLabel(s))}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="text-sm font-bold num t-gold">${money(s.feePaid)}</p>
                <p class="text-[11px] t-muted num">${esc(recordDate(s)) || '—'}</p>
            </div>
        </div>`).join('');

    return `
    <div class="space-y-4">
        <div class="glass rounded-3xl p-6 md:p-8">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <h2 class="text-xl font-bold text-ink">Dashboard</h2>
                    <p class="t-muted text-sm">Everything across ${state.batches.length} batch${state.batches.length !== 1 ? 'es' : ''} at a glance.</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="setTab('students')" class="btn-ghost px-3.5 py-2.5 rounded-xl text-sm font-semibold text-ink-70 inline-flex items-center gap-1.5">${ic('users','w-4 h-4')} Students</button>
                    <button onclick="setTab('share')" class="btn-primary px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-1.5">${ic('handshake','w-4 h-4')} Profit Share</button>
                </div>
            </div>

            <div class="mb-6">
                <div class="flex flex-wrap justify-between items-end gap-3 mb-2">
                    <div>
                        <p class="text-xs font-semibold t-muted uppercase tracking-wide">Collection rate</p>
                        <p class="text-3xl font-extrabold text-ink num leading-tight">${rate}%</p>
                    </div>
                    <p class="text-sm t-muted num text-right">
                        <span class="t-gold font-bold">${money(t.received)}</span> collected<br>
                        of <span class="font-semibold">${money(billed)}</span> billed
                    </p>
                </div>
                ${bar(rate, `linear-gradient(90deg,${COLOR.gold},${COLOR.coral})`)}
            </div>

            <div class="dash-grid">
                ${dashCard('Profit distribution', 'pie-chart', COLOR.coral, `
                    ${statRow('Net distributable', money(net))}
                    ${statRow('Owner (40%)', money(owner), COLOR.gold)}
                    ${statRow('Future fund (36%)', money(future), COLOR.gold)}
                    ${statRow('Team pool (24%)', money(pool), COLOR.coral)}`, 'across all batches')}

                ${dashCard('Future fund', 'piggy-bank', COLOR.gold, `
                    <p class="text-2xl font-extrabold t-gold num mb-3">${money(fundBalance())}</p>
                    ${statRow('From batches (36%)', money(fundAutoTotal()))}
                    ${statRow('Manual additions', money(fundAdditionsTotal()))}
                    ${statRow('Expenses', '− ' + money(fundExpensesTotal()), COLOR.coral)}`, 'current balance')}

                ${dashCard('Enrolment mix', 'users', COLOR.white, `
                    ${mixRow('Online', online, COLOR.gold)}
                    ${mixRow('Physical', physical, COLOR.coral)}
                    ${mixRow('Normal batch', normal, COLOR.white)}
                    ${mixRow('1-on-1', oneonone, COLOR.coral)}`, `${t.students} students`)}
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div class="glass rounded-3xl p-6 xl:col-span-2">
                <h3 class="text-base font-bold text-ink mb-1">Batch performance</h3>
                <p class="t-muted text-sm mb-4">Received includes previous-batch carry-forward and other payments.</p>
                <div class="overflow-x-auto">
                    <table class="tbl w-full text-sm">
                        <thead><tr>
                            <th>Batch</th><th class="text-right">Students</th><th class="text-right">Received</th>
                            <th class="text-right">Pending</th><th>Collected</th><th class="text-right">Net</th>
                        </tr></thead>
                        <tbody>${batchRows || `<tr><td colspan="6" class="text-center t-muted py-8">No batches yet.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>

            <div class="glass rounded-3xl p-6">
                <h3 class="text-base font-bold text-ink mb-1">Top programmes</h3>
                <p class="t-muted text-sm mb-4">By fees received.</p>
                ${progs.length ? progs.map(p => `
                    <div class="mb-3">
                        <div class="flex justify-between text-xs mb-1.5 gap-2">
                            <span class="font-semibold text-ink-90 truncate">${esc(p.program)}</span>
                            <span class="t-muted num shrink-0">${money(p.received)}</span>
                        </div>
                        ${bar(p.received / maxProg * 100, COLOR.gold)}
                    </div>`).join('') : `<p class="t-muted text-sm py-6 text-center">No students yet.</p>`}
            </div>
        </div>

        <div class="glass rounded-3xl p-6">
            <h3 class="text-base font-bold text-ink mb-1">Recent enrolments</h3>
            <p class="t-muted text-sm mb-3">Newest first, by enrol date.</p>
            ${recent || `<p class="t-muted text-sm py-6 text-center">No students yet.</p>`}
        </div>
    </div>`;
}
