/* =====================================================================
   auth.js  (ES module) — Firebase auth, roles, users, profile menu
   Reads config from window.APP_CONFIG (set by config.js).
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut,
         updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
         signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail }
    from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, setDoc, getDoc, deleteDoc, onSnapshot, writeBatch }
    from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const OWNER_EMAIL = window.APP_CONFIG.OWNER_EMAIL;
const firebaseConfig = window.APP_CONFIG.FIREBASE_CONFIG;

const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
if (!isConfigured) document.getElementById('config-banner').classList.remove('hidden-view');

let auth, db, provider;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
} catch (e) { console.warn("Firebase init skipped:", e.message); }

function el(id){ return document.getElementById(id); }
function friendlyErr(e){ return (e.code||'').replace('auth/','').replace(/-/g,' ') || e.message; }
function escHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escJs(s){ return String(s||'').replace(/'/g, "\\'"); }

/* ---------- Auth (accounts are created by the owner — no public sign-up) ---------- */
window.togglePw = (id, btn) => {
    const i = document.getElementById(id); if (!i) return;
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    if (btn) { btn.innerHTML = `<i data-lucide="${show?'eye-off':'eye'}" class="w-4 h-4"></i>`; if (window.refreshIcons) window.refreshIcons(); }
};
function pwField(id, ph){
    return `<div class="relative">
        <input id="${id}" type="password" class="field pr-11 mt-1" placeholder="${ph||''}">
        <button type="button" onclick="togglePw('${id}',this)" tabindex="-1" class="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2" title="Show/hide"><i data-lucide="eye" class="w-4 h-4"></i></button>
    </div>`;
}
window.handleAuth = async () => {
    const email = el('email').value.trim(), password = el('password').value, error = el('error-msg');
    error.style.color = '';
    if (!isConfigured) { error.innerText = "Add your Firebase config first (see SETUP in config.js)."; return; }
    try { await signInWithEmailAndPassword(auth, email, password); error.innerText = ''; }
    catch (e) { error.style.color=''; error.innerText = friendlyErr(e); }
};
window.handleGoogleAuth = async () => {
    const error = el('error-msg'); error.style.color = '';
    if (!isConfigured) { error.innerText = "Add your Firebase config first (see SETUP in config.js)."; return; }
    try { await signInWithPopup(auth, provider); error.innerText = ''; }
    catch (e) { error.innerText = friendlyErr(e); }
};
window.handleForgotPassword = async () => {
    const email = el('email').value.trim(), error = el('error-msg'); error.style.color = '';
    if (!isConfigured) { error.innerText = "Add your Firebase config first (see SETUP in config.js)."; return; }
    if (!email) { error.innerText = "Type your email in the box above, then click Forgot password."; return; }
    try {
        await sendPasswordResetEmail(auth, email);
        error.style.color = '#1E293B';
        error.innerText = `Password reset link sent to ${email}. Check your inbox (and spam).`;
    } catch (e) { error.innerText = friendlyErr(e); }
};
window.signOutUser = () => signOut(auth);

/* ---------- Roles & access ---------- */
window.__owner = OWNER_EMAIL;
let currentUser = null, currentRole = 'none', membersData = { admins: [], viewers: [] }, membersReady = false, unauthorizedEmail = '';
const isOwnerEmail = (e) => !!e && e.toLowerCase() === OWNER_EMAIL.toLowerCase();
function computeRole(email){
    if (!email) return 'none';
    const e = email.toLowerCase();
    if (isOwnerEmail(e)) return 'owner';
    if ((membersData.admins||[]).some(x => x.toLowerCase() === e)) return 'admin';
    if ((membersData.viewers||[]).some(x => x.toLowerCase() === e)) return 'viewer';
    return 'none';
}
function canEdit(){ return currentRole === 'owner' || currentRole === 'admin'; }
window.__getRole = () => currentRole;

/* ---------- Persistence (shared dataset) ---------- */
let dataRef = null, membersRef = null, saveTimer = null, unsub = null, unsubM = null, unsubR = null;
let pendingRequests = [];
let datasetMissing = false;   // true when app/data has no state — blocks all writes

/* =====================================================================
   Durability: app/data is one document that every save REPLACES wholesale,
   so a single bad write loses everything. These two additive safety nets fix
   that without changing how the app reads data:
     1. records/{id}  — every student / refund / previous / pending / fund entry
                        / other payment also stored as its OWN document, so no
                        single write can destroy them. Removals are soft-deleted.
     2. backups/slotN — a ring of the last 10 whole-state versions, so any bad
                        write can be rolled back.
   Both are best-effort: a failure here is logged but never breaks the real save.
   ===================================================================== */
const BACKUP_SLOTS = 10;
let backupIdx = null, lastRecordJson = {}, mirrorWarned = false;

function collectRecords(state){
    const out = [];
    (state.batches||[]).forEach(b => {
        const meta = { batchId: b.id||'', batchName: b.name||'' };
        (b.students||[]).forEach(x => out.push({ id:x.id, type:'student',  ...meta, data:x }));
        (b.refunds ||[]).forEach(x => out.push({ id:x.id, type:'refund',   ...meta, data:x }));
        (b.previous||[]).forEach(x => out.push({ id:x.id, type:'previous', ...meta, data:x }));
        (b.pending ||[]).forEach(x => out.push({ id:x.id, type:'pending',  ...meta, data:x }));
    });
    ((state.fund||{}).additions||[]).forEach(x => out.push({ id:x.id, type:'fundAddition', batchId:x.batchId||'', batchName:'', data:x }));
    ((state.fund||{}).expenses ||[]).forEach(x => out.push({ id:x.id, type:'fundExpense',  batchId:'', batchName:'', data:x }));
    (state.otherPayments||[]).forEach(x => out.push({ id:x.id, type:'otherPayment', batchId:x.batchId||'', batchName:'', data:x }));
    return out.filter(r => r.id);
}
window.__collectRecords = collectRecords;   // exposed for diagnostics / recovery tooling
/* Writes only what actually changed, so an edit costs a couple of writes, not one per record. */
async function mirrorRecords(state){
    const recs = collectRecords(state);
    const ops = [], seen = new Set();
    recs.forEach(r => {
        seen.add(r.id);
        const json = JSON.stringify(r);
        if (lastRecordJson[r.id] === json) return;
        ops.push({ id:r.id, payload:{ ...r, updatedAt: Date.now(), deletedAt: null }, json });
    });
    Object.keys(lastRecordJson).forEach(id => {
        if (seen.has(id)) return;
        ops.push({ id, payload:{ deletedAt: Date.now() }, merge:true, json:null });   // soft delete
    });
    if (!ops.length) return;
    for (let i = 0; i < ops.length; i += 400) {           // writeBatch caps at 500 ops
        const wb = writeBatch(db);
        // Only pass SetOptions when merging — an empty {} is not a valid SetOptions object.
        ops.slice(i, i+400).forEach(o => o.merge
            ? wb.set(doc(db,'records',o.id), o.payload, { merge:true })
            : wb.set(doc(db,'records',o.id), o.payload));
        await wb.commit();
    }
    ops.forEach(o => { if (o.json === null) delete lastRecordJson[o.id]; else lastRecordJson[o.id] = o.json; });
}
async function writeBackupSlot(state){
    // Never let an empty state evict good rollback points.
    if (!collectRecords(state).length) { console.warn("Backup skipped: state has no records."); return; }
    if (backupIdx === null) {
        try { const m = await getDoc(doc(db,'backups','meta')); backupIdx = (m.exists() && parseInt(m.data().next,10)) || 0; }
        catch(_){ backupIdx = 0; }
    }
    const slot = ((backupIdx % BACKUP_SLOTS) + BACKUP_SLOTS) % BACKUP_SLOTS;
    backupIdx = (slot + 1) % BACKUP_SLOTS;
    await setDoc(doc(db,'backups','slot'+slot), { state, at: Date.now(), by: (currentUser&&currentUser.email)||'' });
    await setDoc(doc(db,'backups','meta'), { next: backupIdx, updatedAt: Date.now() });
}
function warnMirrorFailed(e){
    console.warn("Per-entry backup failed:", e);
    if (mirrorWarned) return;
    mirrorWarned = true;
    // Only a permission error means the rules need publishing. Anything else is a real
    // fault and must say so, rather than sending you to re-publish correct rules.
    const denied = e && e.code === 'permission-denied';
    const detail = denied
        ? "publish firestore.rules to your Firebase project (records/ and backups/)."
        : "unexpected error: " + escHtml((e && (e.code || e.message)) || String(e)) + " — the rules are probably fine; check the console.";
    const d = document.createElement('div');
    d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:200;background:#B45309;color:#fff;padding:10px 16px;font:600 12px Inter,sans-serif";
    d.innerHTML = `Per-entry backup is not active — ${detail}
        <button onclick="this.parentNode.remove()" style="margin-left:10px;background:rgba(255,255,255,.2);border-radius:6px;padding:3px 9px">Dismiss</button>`;
    document.body.appendChild(d);
}

function showDatasetMissingBanner(){
    if (document.getElementById('dataset-missing')) return;
    const d = document.createElement('div');
    d.id = 'dataset-missing';
    d.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:200;background:#E14B5E;color:#fff;padding:12px 18px;font:600 13px Inter,sans-serif;box-shadow:0 6px 20px -8px rgba(0,0,0,.5)";
    d.innerHTML = `No dataset found in the database. <b>Saving is disabled</b> so nothing overwrites data that may still be recoverable.
        <button onclick="window.downloadLegacyBackup()" style="margin-left:10px;background:rgba(255,255,255,.18);border-radius:8px;padding:4px 10px">Check for a backup copy</button>
        <button onclick="window.confirmFreshStart()" style="margin-left:6px;background:rgba(255,255,255,.18);border-radius:8px;padding:4px 10px">Start fresh anyway</button>`;
    document.body.appendChild(d);
}
window.confirmFreshStart = () => {
    if (!confirm("Start a brand-new empty dataset?\n\nOnly do this if you've already recovered your data or accept losing it. This will overwrite whatever is in the database.")) return;
    datasetMissing = false;
    const b = document.getElementById('dataset-missing'); if (b) b.remove();
    window.__queueSave();
};
/* Read-only rescue: the pre-migration copy at dashboards/{uid} is never deleted by
   migrateIfNeeded, so it can still hold the dataset. Downloads it, writes nothing. */
window.downloadLegacyBackup = async () => {
    if (!currentUser) return alert("Sign in first.");
    const sources = [ ["dashboards/"+currentUser.uid, doc(db,"dashboards",currentUser.uid)], ["app/data", doc(db,"app","data")] ];
    let found = 0;
    for (const [label, ref] of sources) {
        try {
            const s = await getDoc(ref);
            const st = s.exists() ? s.data().state : null;
            if (!st) { console.log("No data at", label); continue; }
            found++;
            const n = (st.batches||[]).reduce((a,b)=>a+((b.students||[]).length),0);
            const blob = new Blob([JSON.stringify(st,null,2)], {type:"application/json"});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `share-calculator-backup-${label.replace(/\//g,'_')}-${Date.now()}.json`;
            a.click();
            alert(`Found data at ${label}: ${(st.batches||[]).length} batches, ${n} students.\nDownloaded as JSON.`);
        } catch(e){ console.warn("Could not read", label, e); }
    }
    if (!found) alert("No dataset found at app/data or dashboards/{uid}.\nNext step is a Firestore backup / point-in-time restore in the Firebase console.");
};
/* ---------- Export / Import (profile menu) ---------- */
function datasetCounts(st){
    const batches = Array.isArray(st && st.batches) ? st.batches : [];
    let students = 0, received = 0;
    batches.forEach(b => (b.students||[]).forEach(s => { students++; received += (parseFloat(s.feePaid)||0); }));
    return { batches: batches.length, students, received };
}
/* Download the whole dataset as JSON — a copy held outside Firebase entirely. */
window.exportData = () => {
    const pm = el('profile-menu'); if (pm) pm.classList.add('hidden-view');
    const st = window.__getState && window.__getState();
    if (!st || !Array.isArray(st.batches)) return alert("Nothing to export yet — the dashboard hasn't loaded any data.");
    const c = datasetCounts(st);
    try {
        const blob = new Blob([JSON.stringify(st, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `share-calculator-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSync(true);
        console.log(`Exported ${c.batches} batches / ${c.students} students.`);
    } catch(e){ alert("Export failed: " + (e.message||e)); }
};
/* Import a previously exported file. Shows exactly what is about to replace what,
   and requires confirmation before anything is written. */
window.importData = () => {
    const pm = el('profile-menu'); if (pm) pm.classList.add('hidden-view');
    if (!canEdit()) return alert("You need owner or admin access to import data.");
    window.restoreFromFile();
};

/* Restore a dataset from a downloaded JSON backup. Writes only after an explicit
   confirmation that names exactly what is about to be written. */
window.restoreFromFile = () => {
    if (!currentUser || !canEdit()) return alert("You need owner/admin access to restore.");
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = async () => {
            let st; try { st = JSON.parse(rd.result); } catch(e){ return alert("That file isn't valid JSON."); }
            if (!st || !Array.isArray(st.batches)) return alert("That file doesn't look like a Share Calculator backup (no 'batches').");
            const inc = datasetCounts(st), cur = datasetCounts(window.__getState && window.__getState());
            const losing = cur.students > inc.students
                ? `\n\nWARNING: the file has FEWER students than what is loaded now (${inc.students} vs ${cur.students}). Export first if you're unsure.` : '';
            if (!confirm(
                `Import this backup?\n\n`
              + `Incoming:  ${inc.batches} batches · ${inc.students} students · Rs ${Math.round(inc.received).toLocaleString()}\n`
              + `Replacing: ${cur.batches} batches · ${cur.students} students · Rs ${Math.round(cur.received).toLocaleString()}`
              + losing)) return;
            try {
                // Snapshot what's there now first, so an unwanted import can be rolled back.
                try { await writeBackupSlot(window.__getState()); } catch(_){}
                await setDoc(dataRef, { state: st });
                datasetMissing = false;
                const b = document.getElementById('dataset-missing'); if (b) b.remove();
                lastRecordJson = {};                       // force a full re-mirror
                try { await mirrorRecords(st); } catch(e){ warnMirrorFailed(e); }
                alert(`Imported ${inc.batches} batches and ${inc.students} students. The dashboard will refresh.`);
            } catch(e){ alert("Import failed: " + friendlyErr(e)); }
        };
        rd.readAsText(f);
    };
    inp.click();
};

async function bootUser(user){
    currentUser = user;
    dataRef = doc(db, "app", "data");
    membersRef = doc(db, "app", "members");
    subscribeMembers();
    if (isOwnerEmail(user.email)) {
        try { await migrateIfNeeded(); } catch(e){ console.warn(e); }
        subscribeRequests();
    }
    subscribeData();
    updateProfileUI();
}
function subscribeRequests(){
    if (unsubR) unsubR();
    unsubR = onSnapshot(collection(db, "requests"), (snap) => {
        pendingRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (document.getElementById('mu-list')) renderManageUsers();
    }, () => { pendingRequests = []; });
}
function subscribeMembers(){
    if (unsubM) unsubM();
    unsubM = onSnapshot(membersRef, (snap) => {
        membersData = snap.exists() ? { admins: snap.data().admins||[], viewers: snap.data().viewers||[] } : { admins:[], viewers:[] };
        membersReady = true;
        applyRole();
        if (document.getElementById('mu-list')) renderManageUsers();
    }, () => { membersData = { admins:[], viewers:[] }; membersReady = false; applyRole(); });
}
function subscribeData(){
    if (unsub) unsub();
    unsub = onSnapshot(dataRef, (snap) => {
        setSync(true);
        if (snap.metadata.hasPendingWrites) return;
        if (snap.exists() && snap.data().state) { datasetMissing = false; window.__loadState(snap.data().state); }
        else {
            // NEVER auto-write seed data over the shared doc. If the dataset reads as
            // empty it may be a transient/permission blip or a loss that is still
            // recoverable (backups, PITR, the legacy dashboards/{uid} doc) — writing
            // blank data here would destroy that. Show an empty board, save nothing,
            // and make the user decide via confirmFreshStart().
            datasetMissing = true;
            window.__loadState(null);
            showDatasetMissingBanner();
        }
        updateProfileUI(); // reflect the stored profile photo once the dataset is in
    }, (err) => {
        console.error("Firestore read failed:", err);
        setSync(false, "offline · check Firestore");
        if (!window.__getState()) window.__loadState(null);
    });
}
async function migrateIfNeeded(){
    const snap = await getDoc(dataRef);
    if (snap.exists() && snap.data().state) return;
    const old = await getDoc(doc(db, "dashboards", currentUser.uid));
    if (old.exists() && old.data().state) await setDoc(dataRef, { state: old.data().state });
}
// Record a signed-in-but-unapproved user as an access request the owner can approve,
// then sign them out. (First sign-in creates the request; repeats are harmless no-ops.)
let requestLogged = false;
async function requestAccessThenSignOut(){
    const u = currentUser;
    unauthorizedEmail = u?.email || '';
    if (!requestLogged && u) {
        requestLogged = true;
        try {
            await setDoc(doc(db, "requests", u.uid), {
                email: (u.email||'').toLowerCase(),
                name: u.displayName || '',
                provider: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'password',
                createdAt: Date.now()
            });
        } catch(e){ console.warn("Could not save access request:", e); }
    }
    try { await signOut(auth); } catch(_){}
}
function applyRole(){
    currentRole = computeRole(currentUser && currentUser.email);
    const none = currentRole === 'none';
    if (none && membersReady && currentUser && !isOwnerEmail(currentUser.email)) {
        requestAccessThenSignOut();
        return;
    }
    updateProfileUI();
    document.body.classList.toggle('role-viewer', currentRole === 'viewer');
    el('noaccess').classList.toggle('hidden-view', !none);
    el('app-main').classList.toggle('hidden-view', none);
    el('sync-pill').classList.toggle('hidden-view', none);
    el('pm-manage').classList.toggle('hidden-view', currentRole !== 'owner');
    el('pm-company').classList.toggle('hidden-view', currentRole !== 'owner');
}
window.__queueSave = () => {
    if (!dataRef || !canEdit()) return;
    // Refuse to write while the shared dataset is missing — a save here would stamp an
    // empty state over data that may still be recoverable. Cleared by confirmFreshStart().
    if (datasetMissing) { setSync(false, "not saving · dataset missing"); console.warn("Save blocked: dataset missing. Use confirmFreshStart() to start a new dataset."); return; }
    setSync(false, "saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        const st = window.__getState();
        try { await setDoc(dataRef, { state: st }); setSync(true); }
        catch(e){ setSync(false, "save failed"); console.error(e); return; }
        // Additive durability — must never break the save above.
        try { await mirrorRecords(st); }   catch(e){ warnMirrorFailed(e); }
        try { await writeBackupSlot(st); } catch(e){ console.warn("Version backup failed:", e); }
    }, 500);
};
function setSync(ok, label){
    const p = el('sync-pill'); if(!p) return;
    const c = ok ? "#1E293B" : "#E14B5E";
    p.innerHTML = `<span class="rounded-full" style="width:6px;height:6px;background:${c}"></span>${ok ? "synced" : (label||"offline")}`;
    p.style.color = c;
}

/* ---------- Profile menu ---------- */
window.toggleProfileMenu = (e) => { if (e) e.stopPropagation(); el('profile-menu').classList.toggle('hidden-view'); };
document.addEventListener('click', (e) => {
    const m = el('profile-menu');
    if (m && !m.classList.contains('hidden-view') && !e.target.closest('#profile-menu') && !e.target.closest('#profile-avatar'))
        m.classList.add('hidden-view');
});
function initials(n){ return (String(n||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('') || '?').toUpperCase(); }
// Any image, any size → a square, centre-cropped avatar data URL (JPEG). Auto-adjusts big images down.
function fileToAvatarDataURL(file, size=256){
    return new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onerror = () => reject(new Error('read'));
        rd.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode'));
            img.onload = () => {
                const side = Math.min(img.width, img.height);           // square source region
                const sx = (img.width - side) / 2, sy = (img.height - side) / 2; // centre crop
                const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
                const ctx = cv.getContext('2d');
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                resolve(cv.toDataURL('image/jpeg', 0.82));
            };
            img.src = rd.result;
        };
        rd.readAsDataURL(file);
    });
}
function updateProfileUI(){
    const u = currentUser; if (!u) return;
    const name = u.displayName || (u.email ? u.email.split('@')[0] : 'User');
    el('pm-name').innerText = name;
    el('pm-email').innerText = u.email || '';
    const roleLabel = { owner:'Owner', admin:'Admin', viewer:'Viewer', none:'No access' }[currentRole] || '';
    el('pm-role').innerText = roleLabel;
    const av = el('profile-avatar');
    const photo = (window.__getAvatar && window.__getAvatar(u.email)) || u.photoURL || '';
    if (photo) av.innerHTML = `<img src="${photo}" alt="" class="w-full h-full object-cover">`;
    else { av.innerHTML = ''; av.innerText = initials(name); }
    const mini = el('pm-name-mini'); if (mini) mini.innerText = name;
    const rmini = el('pm-role-mini'); if (rmini) rmini.innerText = roleLabel;
}
function modalShell(title, body, footer, wide){
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full ${wide?'max-w-lg':'max-w-md'} my-6 pop-in border line" style="background:var(--navy-2);box-shadow:0 40px 80px -30px rgba(0,22,50,0.35)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-ink">${title}</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            ${body}
            <div class="flex justify-end gap-2 mt-6"><button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-ink-70">Cancel</button>${footer||''}</div>
        </div>
    </div>`;
    if (window.refreshIcons) window.refreshIcons();
}
// pendingPhoto: undefined = leave photo unchanged · '' = remove photo · dataURL = set new photo
let pendingPhoto;
window.openEditName = () => {
    el('profile-menu').classList.add('hidden-view');
    pendingPhoto = undefined;
    const name = currentUser?.displayName || '';
    const cur = (window.__getAvatar && window.__getAvatar(currentUser?.email)) || currentUser?.photoURL || '';
    modalShell('Edit profile', `
        <div class="flex items-center gap-4 mb-5">
            <div id="pf-avatar" class="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center font-bold text-lg shrink-0" style="background:linear-gradient(135deg,#E14B5E,#c23a4d);color:#fff">
                ${cur ? `<img src="${cur}" alt="" class="w-full h-full object-cover">` : escHtml(initials(name))}
            </div>
            <div class="flex flex-col items-start gap-1.5">
                <button type="button" onclick="document.getElementById('pf-photo').click()" class="btn-ghost px-3 py-2 rounded-xl text-sm font-semibold text-ink-70 inline-flex items-center gap-1.5"><i data-lucide="upload" class="w-4 h-4"></i> Upload photo</button>
                <button type="button" id="pf-remove" onclick="removeProfilePhoto()" class="text-xs t-coral ${cur ? '' : 'hidden-view'}">Remove photo</button>
                <input type="file" id="pf-photo" accept="image/*" class="hidden-view" onchange="onProfilePhoto(event)">
            </div>
        </div>
        <p class="text-xs t-muted mb-4">Any size works — the image is auto-cropped to a square.</p>
        <div><label class="text-xs font-semibold t-muted">Display name</label>
        <input id="pf-name" class="field mt-1" value="${escHtml(name)}" placeholder="Your name"></div>
        <p id="pf-err" class="t-coral text-sm mt-2"></p>`,
        `<button onclick="doEditName()" class="btn-primary px-6 py-2.5 rounded-xl font-bold">Save</button>`);
};
window.onProfilePhoto = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const err = el('pf-err'); if (err) err.innerText = '';
    try {
        pendingPhoto = await fileToAvatarDataURL(f);
        const box = el('pf-avatar'); if (box) box.innerHTML = `<img src="${pendingPhoto}" alt="" class="w-full h-full object-cover">`;
        const rm = el('pf-remove'); if (rm) rm.classList.remove('hidden-view');
    } catch(_){ if (err) err.innerText = "Couldn't read that image — try another file."; }
};
window.removeProfilePhoto = () => {
    pendingPhoto = '';
    const box = el('pf-avatar'); if (box) box.innerText = initials((el('pf-name')?.value) || currentUser?.displayName || '');
    const rm = el('pf-remove'); if (rm) rm.classList.add('hidden-view');
};
window.doEditName = async () => {
    const name = el('pf-name').value.trim();
    try {
        await updateProfile(currentUser, { displayName: name });
        // Photo lives in the shared dataset (state), not in Auth (photoURL can't hold a data URL).
        if (pendingPhoto !== undefined && window.__setAvatar) {
            if (!canEdit()) throw new Error("view only — ask an admin to set your photo");
            window.__setAvatar(currentUser.email, pendingPhoto); // '' clears, dataURL sets
        }
        updateProfileUI();
        window.closeModal();
    } catch(e){ el('pf-err').innerText = "Couldn't save (" + friendlyErr(e) + ")"; }
};
window.openChangePassword = () => {
    el('profile-menu').classList.add('hidden-view');
    modalShell('Change password', `
        <div class="space-y-3">
            <div><label class="text-xs font-semibold t-muted">Current password</label>${pwField('pf-cur')}</div>
            <div><label class="text-xs font-semibold t-muted">New password</label>${pwField('pf-new','min 6 characters')}</div>
            <div><label class="text-xs font-semibold t-muted">Confirm new password</label>${pwField('pf-new2')}</div>
        </div>
        <p id="pf-err" class="t-coral text-sm mt-2"></p>`,
        `<button onclick="doChangePassword()" class="btn-primary px-6 py-2.5 rounded-xl font-bold">Update password</button>`);
};
window.doChangePassword = async () => {
    const cur = el('pf-cur').value, nw = el('pf-new').value, nw2 = el('pf-new2').value, err = el('pf-err');
    if (nw.length < 6) { err.innerText = "New password must be at least 6 characters."; return; }
    if (nw !== nw2) { err.innerText = "New passwords don't match."; return; }
    try {
        await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, cur));
        await updatePassword(currentUser, nw);
        window.closeModal();
        alert("Password updated successfully.");
    } catch(e){ err.innerText = friendlyErr(e); }
};

/* ---------- Manage users (owner only) ---------- */
window.openManageUsers = () => {
    el('profile-menu').classList.add('hidden-view');
    if (currentRole !== 'owner') return;
    renderManageUsers();
};
function renderManageUsers(){
    const admins = membersData.admins||[], viewers = membersData.viewers||[];
    const row = (email, role) => {
        const c = role==='admin' ? '#E14B5E' : '#1E293B';
        return `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl glass">
            <div class="min-w-0"><p class="text-sm text-ink truncate">${escHtml(email)}</p>
                <span class="badge" style="background:${c}22;color:${c}">${role}</span></div>
            <div class="flex items-center gap-1 shrink-0">
                <button onclick="setMemberRole('${escJs(email)}','${role==='admin'?'viewer':'admin'}')" class="text-xs text-ink-70 btn-ghost px-2.5 py-1.5 rounded-lg hover:text-ink">Make ${role==='admin'?'viewer':'admin'}</button>
                <button onclick="resetMemberPassword('${escJs(email)}')" class="icon-btn hover:text-[#1E293B]" style="width:30px;height:30px" title="Send password reset email"><i data-lucide="key-round" class="w-4 h-4"></i></button>
                <button onclick="removeMember('${escJs(email)}')" class="icon-btn hover:text-[#E14B5E]" style="width:30px;height:30px" title="Remove user"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    };
    const list = [...admins.map(e=>row(e,'admin')), ...viewers.map(e=>row(e,'viewer'))].join('')
        || `<p class="t-muted text-sm text-center py-4">No team members yet. Add one above.</p>`;
    const pending = pendingRequests || [];
    const pendingHtml = pending.length ? `
        <div class="mb-4">
            <p class="text-xs font-bold t-gold uppercase tracking-wide mb-2">Pending approvals (${pending.length})</p>
            <div class="space-y-2">${pending.map(r=>`
                <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style="background:#1E293B14;border:1px solid #1E293B33">
                    <div class="min-w-0">
                        <p class="text-sm text-ink truncate">${escHtml(r.name||'(no name)')} <span class="badge" style="background:rgba(0,22,50,0.06);color:var(--muted)">${r.provider==='google.com'?'Google':'Email'}</span></p>
                        <p class="text-xs t-muted truncate">${escHtml(r.email||'')}</p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="approveRequest('${escJs(r.id)}','${escJs((r.email||'').toLowerCase())}','admin')" class="text-xs btn-primary px-2.5 py-1 rounded-lg font-bold">Approve · Admin</button>
                        <button onclick="approveRequest('${escJs(r.id)}','${escJs((r.email||'').toLowerCase())}','viewer')" class="text-xs btn-ghost text-[#1E293B] px-2.5 py-1 rounded-lg font-bold">Viewer</button>
                        <button onclick="dismissRequest('${escJs(r.id)}')" class="icon-btn hover:text-[#E14B5E]" style="width:28px;height:28px" title="Dismiss"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                </div>`).join('')}</div>
        </div>` : '';
    modalShell('Manage users', `
        <div class="mb-4 p-3 rounded-xl" style="background:#E14B5E14;border:1px solid #E14B5E33">
            <p class="text-xs t-muted">Owner · full control</p><p class="text-sm text-ink font-semibold truncate">${escHtml(OWNER_EMAIL)}</p>
        </div>
        ${pendingHtml}
        <p class="text-xs font-bold text-ink-70 uppercase tracking-wide mb-2">Create a login</p>
        <p class="text-xs t-muted mb-3">You set their email &amp; password. <b class="t-coral">Admin</b> can manage payments; <b class="t-gold">Viewer</b> can only view.</p>
        <div class="space-y-2 mb-4">
            <input id="mu-name" class="field" placeholder="Full name">
            <input id="mu-email" class="field" placeholder="user@email.com" autocomplete="off">
            <div class="flex gap-2">
                <div class="relative flex-1">
                    <input id="mu-pass" type="password" class="field pr-11" placeholder="Password (min 6 chars)" autocomplete="new-password">
                    <button type="button" onclick="togglePw('mu-pass', this)" tabindex="-1" class="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2"><i data-lucide="eye" class="w-4 h-4"></i></button>
                </div>
                <div class="cdd" data-cdd style="width:120px">
                    <input type="hidden" id="mu-role" value="viewer">
                    <button type="button" class="field readonly-field cdd-btn" onclick="cddToggle(this)"><span id="mu-role-label" class="cdd-val">Viewer</span><svg class="cdd-chev" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    <ul class="cdd-menu"><li class="cdd-opt active" onclick="muRole('viewer')">Viewer</li><li class="cdd-opt" onclick="muRole('admin')">Admin</li></ul>
                </div>
            </div>
            <button onclick="createUserAccount()" id="mu-create-btn" class="btn-primary w-full py-2.5 rounded-xl font-bold">Create login</button>
        </div>
        <p class="text-xs font-bold text-ink-70 uppercase tracking-wide mb-2">Team members</p>
        <div id="mu-list" class="space-y-2 max-h-56 overflow-y-auto">${list}</div>
        <p id="mu-err" class="t-coral text-sm mt-2"></p>`, '', true);
}
window.muRole = (r) => {
    el('mu-role').value = r;
    el('mu-role-label').innerText = r.charAt(0).toUpperCase() + r.slice(1);
    const cdd = el('mu-role').closest('[data-cdd]');
    cdd.classList.remove('open');
    cdd.querySelectorAll('.cdd-opt').forEach(o => o.classList.toggle('active', o.getAttribute('onclick').includes(`'${r}'`)));
};
async function persistMembers(data, errEl){
    try { await setDoc(membersRef, data); membersData = data; renderManageUsers(); }
    catch(e){ const m = "Save failed: " + friendlyErr(e); if (errEl) errEl.innerText = m; else alert(m); console.error(e); }
}
let secondaryApp = null;
function secondaryAuth(){
    if (!secondaryApp) secondaryApp = initializeApp(firebaseConfig, "secondary");
    return getAuth(secondaryApp);
}
window.createUserAccount = async () => {
    const name = (el('mu-name').value||'').trim();
    const email = (el('mu-email').value||'').trim().toLowerCase();
    const password = el('mu-pass').value;
    const role = el('mu-role').value;
    const err = el('mu-err'); err.style.color = '';
    if (!name) { err.innerText = "Enter a name."; return; }
    if (!email || !email.includes('@')) { err.innerText = "Enter a valid email."; return; }
    if (isOwnerEmail(email)) { err.innerText = "That's the owner account (already full access)."; return; }
    if ((password||'').length < 6) { err.innerText = "Password must be at least 6 characters."; return; }
    const btn = el('mu-create-btn'); if (btn){ btn.disabled = true; btn.innerText = "Creating…"; }
    try {
        const secAuth = secondaryAuth();
        const cred = await createUserWithEmailAndPassword(secAuth, email, password);
        try { await updateProfile(cred.user, { displayName: name }); } catch(_) {}
        await signOut(secAuth);
        const admins = (membersData.admins||[]).filter(e => e.toLowerCase() !== email);
        const viewers = (membersData.viewers||[]).filter(e => e.toLowerCase() !== email);
        if (role === 'admin') admins.push(email); else viewers.push(email);
        await setDoc(membersRef, { admins, viewers }); membersData = { admins, viewers };
        renderManageUsers();
        const e2 = el('mu-err'); if (e2) { e2.style.color = '#1E293B'; e2.innerText = `Login created for ${email} — they can sign in now as ${role}.`; }
    } catch(e){
        const e2 = el('mu-err'); if (e2) { e2.style.color = ''; e2.innerText = friendlyErr(e); }
        const b2 = el('mu-create-btn'); if (b2){ b2.disabled = false; b2.innerText = "Create login"; }
    }
};
window.resetMemberPassword = async (email) => {
    if (!confirm(`Send a password reset link to ${email}?`)) return;
    try { await sendPasswordResetEmail(auth, email); alert(`Password reset link sent to ${email}.`); }
    catch(e){ alert("Failed: " + friendlyErr(e)); }
};
window.removeMember = async (email) => {
    if (!confirm(`Remove ${email}? They will lose all access to the dashboard.`)) return;
    const e = email.toLowerCase();
    await persistMembers({
        admins:  (membersData.admins||[]).filter(x => x.toLowerCase() !== e),
        viewers: (membersData.viewers||[]).filter(x => x.toLowerCase() !== e),
    });
};
window.setMemberRole = async (email, role) => {
    const e = email.toLowerCase();
    const admins = (membersData.admins||[]).filter(x => x.toLowerCase() !== e);
    const viewers = (membersData.viewers||[]).filter(x => x.toLowerCase() !== e);
    if (role === 'admin') admins.push(email); else viewers.push(email);
    await persistMembers({ admins, viewers });
};
window.approveRequest = async (uid, email, role) => {
    const e = email.toLowerCase();
    const admins = (membersData.admins||[]).filter(x => x.toLowerCase() !== e);
    const viewers = (membersData.viewers||[]).filter(x => x.toLowerCase() !== e);
    if (role === 'admin') admins.push(e); else viewers.push(e);
    try {
        await setDoc(membersRef, { admins, viewers }); membersData = { admins, viewers };
        await deleteDoc(doc(db, "requests", uid));
        renderManageUsers();
    } catch(err){ alert("Approve failed: " + friendlyErr(err)); console.error(err); }
};
window.dismissRequest = async (uid) => {
    try { await deleteDoc(doc(db, "requests", uid)); }
    catch(err){ alert("Dismiss failed: " + friendlyErr(err)); console.error(err); }
};

onAuthStateChanged(auth || {}, (user) => {
    if (user) {
        el('auth-container').classList.add('hidden-view');
        el('config-banner').classList.add('hidden-view');
        el('app-container').classList.remove('hidden-view');
        bootUser(user);
    } else {
        el('app-container').classList.add('hidden-view');
        el('auth-container').classList.remove('hidden-view');
        document.body.classList.remove('role-viewer');
        currentUser = null; currentRole = 'none'; membersReady = false; requestLogged = false;
        if (unauthorizedEmail) {
            const err = el('error-msg'); err.style.color = '';
            err.innerText = `${unauthorizedEmail} — access is pending the owner's approval. Your request was sent; you'll be able to sign in once approved.`;
            unauthorizedEmail = '';
        }
        if (!isConfigured) el('config-banner').classList.remove('hidden-view');
    }
});
