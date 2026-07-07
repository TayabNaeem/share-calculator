/* =====================================================================
   auth.js  (ES module) — Firebase auth, roles, users, profile menu
   Reads config from window.APP_CONFIG (set by config.js).
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut,
         updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
         signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail }
    from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, setDoc, getDoc, deleteDoc, onSnapshot }
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
        error.style.color = '#FFCD57';
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
        if (snap.exists() && snap.data().state) window.__loadState(snap.data().state);
        else { window.__loadState(null); if (canEdit()) window.__queueSave(); }
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
function applyRole(){
    currentRole = computeRole(currentUser && currentUser.email);
    const none = currentRole === 'none';
    if (none && membersReady && currentUser && !isOwnerEmail(currentUser.email)) {
        unauthorizedEmail = currentUser.email || '';
        signOut(auth);
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
    setSync(false, "saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try { await setDoc(dataRef, { state: window.__getState() }); setSync(true); }
        catch(e){ setSync(false, "save failed"); console.error(e); }
    }, 500);
};
function setSync(ok, label){
    const p = el('sync-pill'); if(!p) return;
    const c = ok ? "#FFCD57" : "#E14B5E";
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
function updateProfileUI(){
    const u = currentUser; if (!u) return;
    const name = u.displayName || (u.email ? u.email.split('@')[0] : 'User');
    el('pm-name').innerText = name;
    el('pm-email').innerText = u.email || '';
    el('pm-role').innerText = { owner:'Owner', admin:'Admin', viewer:'Viewer', none:'No access' }[currentRole] || '';
    el('profile-avatar').innerText = initials(name);
}
function modalShell(title, body, footer, wide){
    document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-start md:items-center justify-center p-4 overflow-y-auto" style="background:rgba(0,7,18,0.72);backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal()">
        <div class="rounded-3xl p-6 md:p-8 w-full ${wide?'max-w-lg':'max-w-md'} my-6 pop-in border border-white/10" style="background:var(--navy-2);box-shadow:0 40px 80px -30px rgba(0,0,0,0.9)">
            <div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold text-white">${title}</h3><button onclick="closeModal()" class="icon-btn"><i data-lucide="x" class="w-5 h-5"></i></button></div>
            ${body}
            <div class="flex justify-end gap-2 mt-6"><button onclick="closeModal()" class="btn-ghost px-5 py-2.5 rounded-xl font-semibold text-white/80">Cancel</button>${footer||''}</div>
        </div>
    </div>`;
    if (window.refreshIcons) window.refreshIcons();
}
window.openEditName = () => {
    el('profile-menu').classList.add('hidden-view');
    modalShell('Edit name', `
        <div><label class="text-xs font-semibold t-muted">Display name</label>
        <input id="pf-name" class="field mt-1" value="${escHtml(currentUser?.displayName||'')}" placeholder="Your name"></div>
        <p id="pf-err" class="t-coral text-sm mt-2"></p>`,
        `<button onclick="doEditName()" class="btn-primary px-6 py-2.5 rounded-xl font-bold">Save</button>`);
};
window.doEditName = async () => {
    const name = el('pf-name').value.trim();
    try { await updateProfile(currentUser, { displayName: name }); updateProfileUI(); window.closeModal(); }
    catch(e){ el('pf-err').innerText = friendlyErr(e); }
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
        const c = role==='admin' ? '#E14B5E' : '#FFCD57';
        return `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl glass">
            <div class="min-w-0"><p class="text-sm text-white truncate">${escHtml(email)}</p>
                <span class="badge" style="background:${c}22;color:${c}">${role}</span></div>
            <div class="flex items-center gap-1 shrink-0">
                <button onclick="setMemberRole('${escJs(email)}','${role==='admin'?'viewer':'admin'}')" class="text-xs text-white/80 btn-ghost px-2.5 py-1.5 rounded-lg hover:text-white">Make ${role==='admin'?'viewer':'admin'}</button>
                <button onclick="resetMemberPassword('${escJs(email)}')" class="icon-btn hover:text-[#FFCD57]" style="width:30px;height:30px" title="Send password reset email"><i data-lucide="key-round" class="w-4 h-4"></i></button>
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
                <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style="background:#FFCD5714;border:1px solid #FFCD5733">
                    <div class="min-w-0"><p class="text-sm text-white truncate">${escHtml(r.name||'(no name)')}</p><p class="text-xs t-muted truncate">${escHtml(r.email||'')}</p></div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="approveRequest('${escJs(r.id)}','${escJs((r.email||'').toLowerCase())}','admin')" class="text-xs btn-primary px-2.5 py-1 rounded-lg font-bold">Approve · Admin</button>
                        <button onclick="approveRequest('${escJs(r.id)}','${escJs((r.email||'').toLowerCase())}','viewer')" class="text-xs btn-ghost text-[#FFCD57] px-2.5 py-1 rounded-lg font-bold">Viewer</button>
                        <button onclick="dismissRequest('${escJs(r.id)}')" class="icon-btn hover:text-[#E14B5E]" style="width:28px;height:28px" title="Dismiss"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                </div>`).join('')}</div>
        </div>` : '';
    modalShell('Manage users', `
        <div class="mb-4 p-3 rounded-xl" style="background:#E14B5E14;border:1px solid #E14B5E33">
            <p class="text-xs t-muted">Owner · full control</p><p class="text-sm text-white font-semibold truncate">${escHtml(OWNER_EMAIL)}</p>
        </div>
        ${pendingHtml}
        <p class="text-xs font-bold text-white/80 uppercase tracking-wide mb-2">Create a login</p>
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
        <p class="text-xs font-bold text-white/80 uppercase tracking-wide mb-2">Team members</p>
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
        const e2 = el('mu-err'); if (e2) { e2.style.color = '#FFCD57'; e2.innerText = `Login created for ${email} — they can sign in now as ${role}.`; }
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
        currentUser = null; currentRole = 'none'; membersReady = false;
        if (unauthorizedEmail) {
            const err = el('error-msg'); err.style.color = '';
            err.innerText = `${unauthorizedEmail} isn't authorised. Ask the owner to create a login for you.`;
            unauthorizedEmail = '';
        }
        if (!isConfigured) el('config-banner').classList.remove('hidden-view');
    }
});
