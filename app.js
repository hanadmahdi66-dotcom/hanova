/* ═══════════════════════════════════════════
   HANOVA · app.js  — Firebase Auth Edition
   ═══════════════════════════════════════════ */

// ── Firebase Init ─────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAWJbWlgMwXEb5UIQtsULvbhZG9Cf_XMsQ",
  authDomain:        "hanova-fe572.firebaseapp.com",
  projectId:         "hanova-fe572",
  storageBucket:     "hanova-fe572.firebasestorage.app",
  messagingSenderId: "945214637153",
  appId:             "1:945214637153:web:42843555e33683d7895620"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── State ────────────────────────────────────
const state = {
  user:        { name: '', email: '', uid: '' },
  plan:        'free',
  planLabel:   '$0',
  planAmount:  '0',
  uploadsToday: 0,
  currentTab:  'photo',
  history:     [],
  photoData:   null,
  photoFile:   null,
};

const UPLOAD_LIMIT_FREE = 20;

// ── Helpers ───────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) { target.classList.add('active'); target.scrollTop = 0; }
}

function toast(msg, duration = 2800) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '80px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(201,168,76,0.18)',
    border: '1px solid rgba(201,168,76,0.3)',
    backdropFilter: 'blur(12px)',
    color: '#e4c97e',
    padding: '0.65rem 1.4rem',
    borderRadius: '99px',
    fontSize: '0.82rem',
    letterSpacing: '0.06em',
    zIndex: '9999',
    whiteSpace: 'nowrap',
    animation: 'fadeIn 0.25s both',
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.6' : '1';
  btn.textContent = loading
    ? '⏳ Please wait…'
    : btnId === 'signup-btn' ? 'Create Account' : 'Log In';
}

// ── Firebase Error → User-friendly message ────
function fbError(code) {
  const map = {
    'auth/email-already-in-use':   'That email is already registered. Please log in.',
    'auth/invalid-email':          'Please enter a valid Gmail address.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/user-not-found':         'No account found with that email.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/too-many-requests':      'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user':   'Sign-in popup was closed. Please try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── Splash → Auth (or Home if already logged in) ──
window.addEventListener('DOMContentLoaded', () => {
  showScreen('screen-splash');

  // Firebase listens for existing session during splash
  auth.onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
      // Already signed in — load profile and go home
      await loadUserProfile(fbUser);
      setTimeout(() => goToHome(), 6000); // wait for splash
    } else {
      setTimeout(() => showScreen('screen-auth'), 6000);
    }
  });
});

// ── Load / Save User Profile from Firestore ───
async function loadUserProfile(fbUser) {
  state.user.uid   = fbUser.uid;
  state.user.email = fbUser.email || '';
  state.user.name  = fbUser.displayName || fbUser.email.split('@')[0];

  try {
    const doc = await db.collection('users').doc(fbUser.uid).get();
    if (doc.exists) {
      const data = doc.data();
      state.plan         = data.plan        || 'free';
      state.uploadsToday = data.uploadsToday || 0;
      state.history      = data.history     || [];
      // Reset uploads if day changed
      const today = new Date().toDateString();
      if (data.lastUploadDate !== today) {
        state.uploadsToday = 0;
        await saveUserProfile();
      }
    } else {
      // New user: create their profile doc
      await saveUserProfile();
    }
  } catch (e) {
    console.warn('Firestore read failed (offline?):', e);
  }
}

async function saveUserProfile() {
  if (!state.user.uid) return;
  try {
    await db.collection('users').doc(state.user.uid).set({
      name:           state.user.name,
      email:          state.user.email,
      plan:           state.plan,
      uploadsToday:   state.uploadsToday,
      lastUploadDate: new Date().toDateString(),
      history:        state.history.slice(0, 50), // cap at 50
    }, { merge: true });
  } catch (e) {
    console.warn('Firestore write failed:', e);
  }
}

// ── Auth: Switch panels ───────────────────────
function switchPanel(which) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${which}`).classList.add('active');
}

// ── Auth: Sign Up (Email + Password) ─────────
async function handleSignUp() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;

  if (!name)  { toast('Please enter your full name'); return; }
  if (!email) { toast('Please enter your Gmail address'); return; }
  if (!pass || pass.length < 6) { toast('Password must be at least 6 characters'); return; }

  setLoading('signup-btn', true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });

    state.user = { uid: cred.user.uid, name, email };
    state.plan = 'free';
    await saveUserProfile();

    showScreen('screen-plans');
  } catch (err) {
    toast(fbError(err.code));
  } finally {
    setLoading('signup-btn', false);
  }
}

// ── Auth: Log In (Email + Password) ──────────
async function handleLogIn() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  if (!email) { toast('Please enter your Gmail address'); return; }
  if (!pass)  { toast('Please enter your password'); return; }

  setLoading('login-btn', true);
  try {
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    await loadUserProfile(cred.user);
    goToHome();
  } catch (err) {
    toast(fbError(err.code));
  } finally {
    setLoading('login-btn', false);
  }
}

// ── Auth: Google Sign-In ──────────────────────
async function handleGoogleSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  try {
    const result = await auth.signInWithPopup(provider);
    const fbUser = result.user;

    // If new user, ask for a display name (use Google's)
    if (!fbUser.displayName) {
      await fbUser.updateProfile({ displayName: fbUser.email.split('@')[0] });
    }

    await loadUserProfile(fbUser);

    // New Google users need a plan choice; existing ones go home
    const doc = await db.collection('users').doc(fbUser.uid).get();
    if (!doc.exists || !doc.data().plan) {
      showScreen('screen-plans');
    } else {
      goToHome();
    }
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      toast(fbError(err.code));
    }
  }
}

// ── Auth: Forgot Password ─────────────────────
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { toast('Enter your email above first, then tap Forgot Password'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    toast('Reset link sent! Check your inbox.', 4000);
  } catch (err) {
    toast(fbError(err.code));
  }
}

// ── Plans ─────────────────────────────────────
function selectPlan(planKey, amount, label) {
  state.plan        = planKey;
  state.planAmount  = amount;
  state.planLabel   = label;

  if (planKey === 'free') {
    saveUserProfile();
    goToHome();
    return;
  }

  document.getElementById('pay-plan-name').textContent = label;
  document.getElementById('pay-amount').textContent    = `$${amount}/month`;
  document.getElementById('zaad-code').textContent     = `2200633718556*${amount}#`;
  showScreen('screen-payment');
}

function goToPlans() { showScreen('screen-plans'); }

// ── Payment ───────────────────────────────────
function copyZaadCode() {
  const code = document.getElementById('zaad-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    toast('Code copied to clipboard');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Code copied!');
  });
}

function confirmPayment() {
  const popup = document.getElementById('popup-waiting');
  popup.style.display = 'flex';
  const fill = popup.querySelector('.popup-fill');
  fill.style.animation = 'none';
  fill.offsetHeight;
  fill.style.animation = 'load 6s linear forwards';

  setTimeout(async () => {
    popup.style.display = 'none';
    await saveUserProfile();
    goToHome();
  }, 6000);
}

// ── Home ──────────────────────────────────────
function goToHome() {
  const name = state.user.name || 'User';
  document.getElementById('home-greeting').textContent      = `Hello, ${name}`;
  document.getElementById('home-plan-tag').textContent      = planDisplayName(state.plan);
  document.getElementById('settings-name').textContent      = name;
  document.getElementById('settings-email').textContent     = state.user.email;
  document.getElementById('settings-plan-name').textContent = planDisplayName(state.plan);
  document.getElementById('settings-avatar').textContent    = name.charAt(0).toUpperCase();

  updateLimitNotice();
  updateTextTab();
  renderHistory();

  state.photoData = null;
  state.photoFile = null;
  const preview = document.getElementById('photo-preview');
  preview.style.display = 'none';
  preview.src = '';

  document.getElementById('ai-response-wrap').style.display = 'none';
  document.getElementById('ai-loading').style.display       = 'none';

  showScreen('screen-home');
}

function planDisplayName(key) {
  return { free: 'Free', basic: 'Basic', pro: 'Pro', elite: 'Elite' }[key] || 'Free';
}

function updateLimitNotice() {
  const el = document.getElementById('home-limit-notice');
  if (state.plan === 'free') {
    const left = UPLOAD_LIMIT_FREE - state.uploadsToday;
    el.textContent = `Free plan · ${left} uploads remaining today`;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function updateTextTab() {
  const isPremium = state.plan !== 'free';
  document.getElementById('text-locked-msg').style.display  = isPremium ? 'none' : 'flex';
  document.getElementById('text-input-wrap').style.display  = isPremium ? 'block' : 'none';
}

// ── AI Tabs ───────────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ai-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`ai-${tab}-panel`).classList.add('active');
  document.getElementById('ai-response-wrap').style.display = 'none';
}

// ── Photo Upload ──────────────────────────────
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (state.plan === 'free' && state.uploadsToday >= UPLOAD_LIMIT_FREE) {
    toast('Daily upload limit reached. Upgrade to continue.'); return;
  }
  state.photoFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.photoData = e.target.result;
    const preview = document.getElementById('photo-preview');
    preview.src = state.photoData;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ── AI Submit ─────────────────────────────────
async function submitToAI() {
  const tab = state.currentTab;

  if (tab === 'text' && state.plan === 'free') {
    toast('Upgrade to a paid plan to use text input.'); return;
  }
  if (tab === 'photo') {
    if (!state.photoData) { toast('Please upload a photo first.'); return; }
    if (state.plan === 'free' && state.uploadsToday >= UPLOAD_LIMIT_FREE) {
      toast('Daily limit reached. Upgrade for more uploads.'); return;
    }
  }
  if (tab === 'text') {
    if (!document.getElementById('text-input').value.trim()) {
      toast('Please enter some text first.'); return;
    }
  }

  document.getElementById('ai-loading').style.display       = 'flex';
  document.getElementById('ai-response-wrap').style.display = 'none';
  document.getElementById('ai-submit-btn').disabled         = true;

  try {
    let responseText = '';
    if (tab === 'photo') {
      responseText = await callClaudeWithPhoto();
      state.uploadsToday++;
      updateLimitNotice();
    } else {
      responseText = await callClaudeWithText();
    }

    state.history.unshift({
      type: tab === 'photo' ? 'Photo' : 'Text',
      response: responseText,
      time: new Date().toLocaleString(),
    });
    renderHistory();
    await saveUserProfile();

    document.getElementById('ai-response-text').textContent   = responseText;
    document.getElementById('ai-response-wrap').style.display = 'block';
    document.getElementById('ai-response-wrap').style.animation = 'none';
    document.getElementById('ai-response-wrap').offsetHeight;
    document.getElementById('ai-response-wrap').style.animation = 'fadeUp 0.5s both';

    setTimeout(() => {
      document.getElementById('ai-response-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

  } catch (err) {
    console.error(err);
    toast('Something went wrong. Please try again.');
  } finally {
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-submit-btn').disabled   = false;
  }
}

// ── Claude API Calls ──────────────────────────
async function callClaudeWithPhoto() {
  const base64    = state.photoData.split(',')[1];
  const mediaType = state.photoData.match(/data:([^;]+)/)[1];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'You are Hanova, a luxury AI assistant with an eloquent, sophisticated voice. Describe and analyse this image in a thoughtful, beautifully written response. Be insightful, poetic, and precise. Keep it to 2–4 sentences.' }
        ]
      }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(c => c.text || '').filter(Boolean).join('\n');
}

async function callClaudeWithText() {
  const text = document.getElementById('text-input').value.trim();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are Hanova, a luxury AI assistant with an eloquent, sophisticated voice. Answer the following with beauty, clarity, and insight — in 2–4 sentences:\n\n${text}`
      }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(c => c.text || '').filter(Boolean).join('\n');
}

// ── History ───────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!state.history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📜</div>
        <p>No history yet.<br />Your AI conversations will appear here.</p>
      </div>`;
    return;
  }
  list.innerHTML = state.history.map(item => `
    <div class="history-item">
      <div class="history-item-type">${item.type} Upload</div>
      <div class="history-item-resp">${escHtml(item.response)}</div>
      <div class="history-item-time">${item.time}</div>
    </div>`).join('');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Settings / Popups ─────────────────────────
function showCredits()  { document.getElementById('popup-credits').style.display = 'flex'; }
function closeCredits(e) {
  if (!e || e.target.id === 'popup-credits')
    document.getElementById('popup-credits').style.display = 'none';
}
function showPrivacy() { document.getElementById('popup-privacy').style.display = 'flex'; }
function showTerms()   { document.getElementById('popup-terms').style.display   = 'flex'; }
function closePopup(id, e) {
  if (!e || e.target.id === id) document.getElementById(id).style.display = 'none';
}

// ── Log Out ───────────────────────────────────
async function logOut() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    await auth.signOut();
  } catch (_) {}
  state.user        = { name: '', email: '', uid: '' };
  state.plan        = 'free';
  state.uploadsToday = 0;
  state.history     = [];
  state.photoData   = null;

  document.getElementById('signup-name').value     = '';
  document.getElementById('signup-email').value    = '';
  document.getElementById('signup-password').value = '';
  document.getElementById('login-email').value     = '';
  document.getElementById('login-password').value  = '';

  switchPanel('signup');
  showScreen('screen-auth');
}

// ── Bottom nav ────────────────────────────────
function setNav(btn, target) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (target === 'home-main') showScreen('screen-home');
}

// ── Keyboard dismiss ──────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ['popup-waiting','popup-credits','popup-privacy','popup-terms'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none') el.style.display = 'none';
    });
  }
});
