let TOKEN = localStorage.getItem('token') || null;
let CURRENT_USER = null;
let ACCOUNTS_CACHE = [];

function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  return fetch(`/api${path}`, { ...options, headers })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Erro na requisição');
      return data;
    });
}

// ---------- Auth screens ----------
function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
}
function showSignup() {
  document.getElementById('signup-form').classList.remove('hidden');
  document.getElementById('login-form').classList.add('hidden');
}

function doLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    .then(({ token, user }) => {
      TOKEN = token; CURRENT_USER = user;
      localStorage.setItem('token', token);
      enterApp();
    })
    .catch(e => document.getElementById('login-error').textContent = e.message);
}

function doSignup() {
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  api('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) })
    .then(({ token, user }) => {
      TOKEN = token; CURRENT_USER = user;
      localStorage.setItem('token', token);
      enterApp();
    })
    .catch(e => document.getElementById('signup-error').textContent = e.message);
}

function logout() {
  localStorage.removeItem('token');
  TOKEN = null;
  location.reload();
}

// ---------- App shell ----------
function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name-label').textContent = CURRENT_USER ? CURRENT_USER.name : '';
  if (CURRENT_USER && CURRENT_USER.role !== 'admin') {
    document.querySelector('[data-tab="admin"]').classList.add('hidden');
  }
  loadDashboard();
  loadAccounts();
  loadCaptions();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    if (btn.dataset.tab === 'dashboard') loadDashboard();
    if (btn.dataset.tab === 'accounts') loadAccounts();
    if (btn.dataset.tab === 'captions') loadCaptions();
    if (btn.dataset.tab === 'admin') loadAdmin();
  });
});

// ---------- Dashboard ----------
function loadDashboard() {
  api('/dashboard').then(d => {
    document.getElementById('stat-total').textContent = d.totalVideos;
    document.getElementById('stat-postados').textContent = d.postados;
    document.getElementById('stat-pendentes').textContent = d.pendentes;
    document.getElementById('stat-erros').textContent = d.erros;
    document.getElementById('stat-contas').textContent = d.contasAtivas;
    document.getElementById('stat-hoje').textContent = d.postadosHoje;

    const tbody = document.getElementById('upcoming-table');
    tbody.innerHTML = '';
    d.proximasPostagens.forEach(v => {
      const acc = ACCOUNTS_CACHE.find(a => a.id === v.accountId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${acc ? acc.label : '-'}</td><td>${v.originalName}</td>
        <td>${new Date(v.scheduledAt).toLocaleString('pt-BR')}</td>
        <td><span class="status-pill status-${v.status}">${v.status}</span></td>`;
      tbody.appendChild(tr);
    });
  });
}

// ---------- Contas ----------
function loadAccounts() {
  api('/accounts').then(accounts => {
    ACCOUNTS_CACHE = accounts;
    const list = document.getElementById('accounts-list');
    list.innerHTML = '';
    const select = document.getElementById('upload-account');
    select.innerHTML = '';
    accounts.forEach(a => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h4>📱 ${a.label}</h4>
        <div class="meta">${a.videosPerDay} vídeos/dia · ${a.windowStart}–${a.windowEnd}</div>
        <div class="meta">✅ ${a.stats.postados} postados · ⏳ ${a.stats.pendentes} pendentes · ⚠️ ${a.stats.erros} erros</div>
        <div class="actions">
          <button onclick="deleteAccount('${a.id}')">🗑 Remover</button>
        </div>`;
      list.appendChild(card);

      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.label;
      select.appendChild(opt);
    });
  });
}

function deleteAccount(id) {
  if (!confirm('Remover esta conta?')) return;
  api(`/accounts/${id}`, { method: 'DELETE' }).then(loadAccounts);
}

function openAccountModal() {
  document.getElementById('account-modal').classList.remove('hidden');
}
function closeAccountModal() {
  document.getElementById('account-modal').classList.add('hidden');
}
function saveAccount() {
  const body = {
    label: document.getElementById('acc-label').value,
    accessToken: document.getElementById('acc-token').value,
    videosPerDay: document.getElementById('acc-videos-per-day').value,
    windowStart: document.getElementById('acc-window-start').value,
    windowEnd: document.getElementById('acc-window-end').value
  };
  api('/accounts', { method: 'POST', body: JSON.stringify(body) })
    .then(() => { closeAccountModal(); loadAccounts(); })
    .catch(e => alert(e.message));
}

// ---------- Upload ----------
function doUpload(e) {
  e.preventDefault();
  const form = new FormData();
  form.append('accountId', document.getElementById('upload-account').value);
  form.append('batchName', document.getElementById('upload-batch').value);
  form.append('caption', document.getElementById('upload-caption').value);
  form.append('hashtags', document.getElementById('upload-hashtags').value);
  form.append('cycles', document.getElementById('upload-cycles').value);
  const files = document.getElementById('upload-files').files;
  for (const f of files) form.append('videos', f);

  api('/upload', { method: 'POST', body: form })
    .then(r => {
      document.getElementById('upload-msg').textContent = `✅ ${r.created} vídeo(s) agendado(s)!`;
      document.getElementById('upload-form').reset();
      loadDashboard();
    })
    .catch(e => document.getElementById('upload-msg').textContent = `❌ ${e.message}`);
  return false;
}

// ---------- Legendas ----------
function loadCaptions() {
  api('/captions').then(captions => {
    const list = document.getElementById('captions-list');
    list.innerHTML = '';
    captions.forEach(c => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h4>${c.name}</h4><div class="meta">${c.text}</div><div class="meta">${c.hashtags}</div>
        <div class="actions"><button onclick="deleteCaption('${c.id}')">🗑 Remover</button></div>`;
      list.appendChild(card);
    });
  });
}
function deleteCaption(id) {
  api(`/captions/${id}`, { method: 'DELETE' }).then(loadCaptions);
}
function openCaptionModal() { document.getElementById('caption-modal').classList.remove('hidden'); }
function closeCaptionModal() { document.getElementById('caption-modal').classList.add('hidden'); }
function saveCaption() {
  const body = {
    name: document.getElementById('cap-name').value,
    text: document.getElementById('cap-text').value,
    hashtags: document.getElementById('cap-hashtags').value
  };
  api('/captions', { method: 'POST', body: JSON.stringify(body) })
    .then(() => { closeCaptionModal(); loadCaptions(); })
    .catch(e => alert(e.message));
}

// ---------- Admin ----------
function loadAdmin() {
  api('/admin/users').then(users => {
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>`;
      tbody.appendChild(tr);
    });
  }).catch(() => {});

  api('/activity-log').then(logs => {
    const ul = document.getElementById('activity-log');
    ul.innerHTML = '';
    logs.forEach(l => {
      const li = document.createElement('li');
      li.innerHTML = `${l.message}<span>${new Date(l.createdAt).toLocaleString('pt-BR')}</span>`;
      ul.appendChild(li);
    });
  });
}

// ---------- Boot ----------
if (TOKEN) {
  api('/auth/me').then(({ user }) => { CURRENT_USER = user; enterApp(); })
    .catch(() => { localStorage.removeItem('token'); TOKEN = null; });
}

// Auto-refresh do dashboard a cada 15s (para ver o "poster" simulado agindo)
setInterval(() => {
  if (TOKEN && !document.getElementById('tab-dashboard').classList.contains('hidden')) {
    loadDashboard();
  }
}, 15000);
