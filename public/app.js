/* ─── Library Management App ─────────────────────────────────────── */

// ─── State ─────────────────────────────────────────────────────────
let currentView = 'dashboard';
let allBooks = [];
let allCopies = [];
let allStudents = [];
let allCheckouts = [];
let editingBookId = null;
let editingStudentId = null;
let currentUser = null;
let authToken = null;

// ─── Auth Helpers ──────────────────────────────────────────────────
const TOKEN_KEY = 'library_token';
const USER_KEY = 'library_user';

function getStoredToken() { return localStorage.getItem(TOKEN_KEY); }
function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storeSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  authToken = token;
  currentUser = user;
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  authToken = null;
  currentUser = null;
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const name = document.getElementById('user-name');
  const role = document.getElementById('user-role');
  if (currentUser) {
    name.textContent = currentUser.full_name || currentUser.username || '—';
    role.textContent = currentUser.role || 'библиотекарь';
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  err.textContent = '';
  const emailInput = document.getElementById('login-email');
  if (emailInput) emailInput.focus();
}

async function initAuth() {
  const token = getStoredToken();
  if (!token) { showLogin(); return; }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Invalid session');
    const data = await res.json();
    storeSession(token, data.user);
    showApp();
    loadView('dashboard');
  } catch (e) {
    clearSession();
    showLogin();
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-submit');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Вход...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка входа');
    storeSession(data.access_token, data.user);
    showApp();
    loadView('dashboard');
    toast(`Добро пожаловать, ${data.user.full_name || data.user.username}!`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
});

async function doLogout() {
  if (authToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
    } catch { /* ignore */ }
  }
  clearSession();
  showLogin();
  toast('Вы вышли из системы', 'info');
}

document.getElementById('btn-logout').addEventListener('click', doLogout);
document.getElementById('btn-logout-mobile').addEventListener('click', doLogout);

// ─── Mobile sidebar (hamburger) ────────────────────────────────────
const sidebar = document.querySelector('.sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const btnHamburger = document.getElementById('btn-hamburger');

function openSidebar() {
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
  document.body.style.overflow = '';
}

if (btnHamburger) btnHamburger.addEventListener('click', openSidebar);
if (backdrop) backdrop.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

// Close sidebar after nav selection on mobile
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 768px)').matches) closeSidebar();
  });
});

// ─── API Helper ────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    showLogin();
    throw new Error(data.error || 'Сессия истекла, войдите заново');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ─── Toast ─────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2800);
  setTimeout(() => el.remove(), 3200);
}

// ─── Modal ─────────────────────────────────────────────────────────
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ─── Navigation ────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    switchView(view);
  });
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  loadView(view);
}

async function loadView(view) {
  try {
    if (view === 'dashboard') await loadDashboard();
    else if (view === 'books') await loadBooks();
    else if (view === 'copies') await loadCopies();
    else if (view === 'students') await loadStudents();
    else if (view === 'checkouts') await loadCheckouts();
    setConnStatus(true);
  } catch (e) {
    console.error(e);
    setConnStatus(false);
    toast(e.message, 'error');
  }
}

function setConnStatus(connected) {
  const el = document.getElementById('conn-status');
  const txt = document.getElementById('conn-text');
  el.className = `conn-status ${connected ? 'connected' : 'disconnected'}`;
  txt.textContent = connected ? 'Подключено' : 'Нет соединения';
}

// ─── Status Label ──────────────────────────────────────────────────
const STATUS_LABELS = { available: 'Доступен', issued: 'Выдан', lost: 'Утерян', damaged: 'Повреждён' };

function statusBadge(status) {
  const cls = { available: 'badge-available', issued: 'badge-issued', lost: 'badge-lost', damaged: 'badge-damaged' }[status] || '';
  return `<span class="badge ${cls}">${STATUS_LABELS[status] || status}</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
         dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════
async function loadDashboard() {
  const [stats, books, activeCheckouts] = await Promise.all([
    api('GET', '/api/stats'),
    api('GET', '/api/books'),
    api('GET', '/api/checkouts?active=true'),
  ]);

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">📚</div>
      <div class="stat-value">${stats.books}</div>
      <div class="stat-label">Книг</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon">🔖</div>
      <div class="stat-value">${stats.copies}</div>
      <div class="stat-label">Экземпляров</div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon">👨‍🎓</div>
      <div class="stat-value">${stats.students}</div>
      <div class="stat-label">Учеников</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-icon">🔄</div>
      <div class="stat-value">${stats.activeCheckouts}</div>
      <div class="stat-label">Активных выдач</div>
    </div>
  `;

  // Recent books
  const recentBooks = books.slice(-5).reverse();
  document.getElementById('dash-books').innerHTML = recentBooks.length
    ? recentBooks.map(b => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;font-size:0.9rem">${b.title}</div>
            <div class="muted">${b.author}</div>
          </div>
          <span class="muted">${b.book_copies?.length || 0} экз.</span>
        </div>
      `).join('')
    : '<div class="empty">Нет книг</div>';

  // Active checkouts
  document.getElementById('dash-checkouts').innerHTML = activeCheckouts.length
    ? activeCheckouts.map(c => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;font-size:0.9rem">${c.book_copies?.books?.title || '—'}</div>
          <div class="muted">${c.students?.full_name || '—'} · выдан ${fmtDate(c.issued_at)}</div>
        </div>
      `).join('')
    : '<div class="empty">Нет активных выдач</div>';
}

// ═══════════════════════════════════════════════════════════════════
// BOOKS
// ═══════════════════════════════════════════════════════════════════
async function loadBooks() {
  allBooks = await api('GET', '/api/books');
  renderBooks();
}

function renderBooks() {
  const q = (document.getElementById('book-search').value || '').toLowerCase();
  const filtered = allBooks.filter(b =>
    !q || b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
  );

  const tbody = document.getElementById('books-tbody');
  tbody.innerHTML = filtered.length
    ? filtered.map(b => `
      <tr>
        <td class="muted">${b.id}</td>
        <td><strong>${b.title}</strong></td>
        <td>${b.author}</td>
        <td>${b.class_grade || '—'}</td>
        <td class="mono">${b.isbn || '—'}</td>
        <td><span class="badge badge-available">${b.book_copies?.length || 0}</span></td>
        <td>
          <div class="action-group">
            <button class="btn btn-secondary btn-sm" onclick="openBookModal(${b.id})">✏️ Изм.</button>
            <button class="btn btn-danger btn-sm" onclick="deleteBook(${b.id}, '${b.title.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr class="empty-row"><td colspan="7">Нет книг</td></tr>';
}

document.getElementById('book-search').addEventListener('input', renderBooks);

document.getElementById('btn-add-book').addEventListener('click', () => openBookModal(null));

function openBookModal(bookId) {
  editingBookId = bookId;
  const b = bookId ? allBooks.find(x => x.id === bookId) : {};
  showModal(`
    <div class="modal-header">
      <h3>${bookId ? 'Редактировать книгу' : 'Новая книга'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Название *</label>
        <input type="text" id="f-book-title" value="${b.title || ''}" required />
      </div>
      <div class="form-group">
        <label>Автор *</label>
        <input type="text" id="f-book-author" value="${b.author || ''}" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Класс / параллель</label>
          <input type="text" id="f-book-class" value="${b.class_grade || ''}" placeholder="7" />
        </div>
        <div class="form-group">
          <label>ISBN</label>
          <input type="text" id="f-book-isbn" value="${b.isbn || ''}" placeholder="978-..." />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveBook()">Сохранить</button>
    </div>
  `);
}

async function saveBook() {
  const data = {
    title: document.getElementById('f-book-title').value.trim(),
    author: document.getElementById('f-book-author').value.trim(),
    class_grade: document.getElementById('f-book-class').value.trim() || null,
    isbn: document.getElementById('f-book-isbn').value.trim() || null,
  };
  if (!data.title || !data.author) { toast('Название и автор обязательны', 'error'); return; }
  try {
    if (editingBookId) {
      await api('PUT', `/api/books/${editingBookId}`, data);
      toast('Книга обновлена');
    } else {
      await api('POST', '/api/books', data);
      toast('Книга добавлена');
    }
    closeModal();
    await loadBooks();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteBook(id, title) {
  if (!confirm(`Удалить книгу «${title}» и все её экземпляры?`)) return;
  try {
    await api('DELETE', `/api/books/${id}`);
    toast('Книга удалена');
    await loadBooks();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// COPIES
// ═══════════════════════════════════════════════════════════════════
async function loadCopies() {
  allCopies = await api('GET', '/api/copies');
  renderCopies();
}

function renderCopies() {
  const statusFilter = document.getElementById('copy-status-filter').value;
  const filtered = allCopies.filter(c => !statusFilter || c.status === statusFilter);

  const tbody = document.getElementById('copies-tbody');
  tbody.innerHTML = filtered.length
    ? filtered.map(c => `
      <tr>
        <td class="muted">${c.id}</td>
        <td><strong>${c.books?.title || '—'}</strong><br/><span class="muted">${c.books?.author || ''}</span></td>
        <td><span class="qr-preview" title="${c.qr_code_text}">${c.qr_code_text}</span></td>
        <td>${statusBadge(c.status)}</td>
        <td>${fmtDate(c.acquired_date)}</td>
        <td>
          <div class="action-group">
            <button class="btn btn-secondary btn-sm" onclick="printCopyQR(${c.id})" title="Печать QR">🖨️</button>
            ${c.status === 'available' ? `<button class="btn btn-secondary btn-sm" onclick="markCopy(${c.id}, 'issued')" title="Выдать">📤</button>` : ''}
            ${c.status === 'issued' ? `<button class="btn btn-success btn-sm" onclick="markCopy(${c.id}, 'available')" title="Вернуть">📥</button>` : ''}
            ${c.status !== 'lost' && c.status !== 'issued' ? `<button class="btn btn-danger btn-sm" onclick="markCopy(${c.id}, 'lost')" title="Утерян">❌</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteCopy(${c.id})">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr class="empty-row"><td colspan="6">Нет экземпляров</td></tr>';
}

document.getElementById('copy-status-filter').addEventListener('change', renderCopies);

document.getElementById('btn-add-copy').addEventListener('click', () => {
  if (!allBooks.length) {
    // Try loading books
    api('GET', '/api/books').then(b => { allBooks = b; openCopyModal(); }).catch(() => toast('Не удалось загрузить книги', 'error'));
    return;
  }
  openCopyModal();
});

function openCopyModal() {
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <div class="modal-header">
      <h3>Новый экземпляр</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Книга *</label>
        <select id="f-copy-book">
          <option value="">— выберите книгу —</option>
          ${allBooks.map(b => `<option value="${b.id}">${b.title} — ${b.author}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>QR-код (текст) *</label>
        <input type="text" id="f-copy-qr" value="" placeholder="например: COPY-001" />
        <div class="muted" style="margin-top:4px">Уникальный код экземпляра</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Статус</label>
          <select id="f-copy-status">
            <option value="available">Доступен</option>
            <option value="damaged">Повреждён</option>
            <option value="lost">Утерян</option>
          </select>
        </div>
        <div class="form-group">
          <label>Дата поступления</label>
          <input type="date" id="f-copy-date" value="${today}" />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveCopy()">Сохранить</button>
    </div>
  `);
}

async function saveCopy() {
  const bookId = document.getElementById('f-copy-book').value;
  const qr = document.getElementById('f-copy-qr').value.trim();
  const status = document.getElementById('f-copy-status').value;
  const date = document.getElementById('f-copy-date').value || null;

  if (!bookId) { toast('Выберите книгу', 'error'); return; }
  if (!qr) { toast('QR-код обязателен', 'error'); return; }

  try {
    await api('POST', '/api/copies', { book_id: parseInt(bookId), qr_code_text: qr, status, acquired_date: date });
    toast('Экземпляр добавлен');
    closeModal();
    await loadCopies();
  } catch (e) { toast(e.message, 'error'); }
}

async function markCopy(id, status) {
  try {
    const endpoint = status === 'lost' ? `/api/copies/${id}/mark-lost`
      : status === 'damaged' ? `/api/copies/${id}/mark-damaged`
      : null;
    if (status === 'available' || status === 'issued') {
      // Direct status update via copy
      await api('POST', `/api/copies/${id}/status-update`, { status });
    } else {
      await api('POST', endpoint, {});
    }
    toast('Статус обновлён');
    await loadCopies();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCopy(id) {
  if (!confirm('Удалить экземпляр?')) return;
  try {
    await api('DELETE', `/api/copies/${id}`);
    toast('Экземпляр удалён');
    await loadCopies();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════════════
async function loadStudents() {
  allStudents = await api('GET', '/api/students');
  renderStudents();
}

function renderStudents() {
  const q = (document.getElementById('student-search').value || '').toLowerCase();
  const filtered = allStudents.filter(s =>
    !q || s.full_name.toLowerCase().includes(q) || (s.class || '').toLowerCase().includes(q)
  );

  const tbody = document.getElementById('students-tbody');
  tbody.innerHTML = filtered.length
    ? filtered.map(s => `
      <tr>
        <td class="muted">${s.id}</td>
        <td><strong>${s.full_name}</strong></td>
        <td>${s.class}</td>
        <td><span class="qr-preview" title="${s.qr_code_text}">${s.qr_code_text}</span></td>
        <td>
          <div class="action-group">
            <button class="btn btn-secondary btn-sm" onclick="printStudentQR(${s.id})" title="Печать QR">🖨️</button>
            <button class="btn btn-secondary btn-sm" onclick="openStudentModal(${s.id})">✏️ Изм.</button>
            <button class="btn btn-danger btn-sm" onclick="deleteStudent(${s.id}, '${s.full_name.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr class="empty-row"><td colspan="5">Нет учеников</td></tr>';
}

document.getElementById('student-search').addEventListener('input', renderStudents);

document.getElementById('btn-add-student').addEventListener('click', () => openStudentModal(null));

function openStudentModal(studentId) {
  editingStudentId = studentId;
  const s = studentId ? allStudents.find(x => x.id === studentId) : {};
  showModal(`
    <div class="modal-header">
      <h3>${studentId ? 'Редактировать ученика' : 'Новый ученик'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>ФИО *</label>
        <input type="text" id="f-student-name" value="${s.full_name || ''}" required placeholder="Иванов Иван Иванович" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Класс *</label>
          <input type="text" id="f-student-class" value="${s.class || ''}" required placeholder="8А" />
        </div>
        <div class="form-group">
          <label>QR-код (текст) *</label>
          <input type="text" id="f-student-qr" value="${s.qr_code_text || ''}" required placeholder="STU-001" />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="saveStudent()">Сохранить</button>
    </div>
  `);
}

async function saveStudent() {
  const data = {
    full_name: document.getElementById('f-student-name').value.trim(),
    class: document.getElementById('f-student-class').value.trim(),
    qr_code_text: document.getElementById('f-student-qr').value.trim(),
  };
  if (!data.full_name || !data.class || !data.qr_code_text) {
    toast('Все поля обязательны', 'error'); return;
  }
  try {
    if (editingStudentId) {
      await api('PUT', `/api/students/${editingStudentId}`, data);
      toast('Ученик обновлён');
    } else {
      await api('POST', '/api/students', data);
      toast('Ученик добавлен');
    }
    closeModal();
    await loadStudents();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteStudent(id, name) {
  if (!confirm(`Удалить ученика «${name}»?`)) return;
  try {
    await api('DELETE', `/api/students/${id}`);
    toast('Ученик удалён');
    await loadStudents();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// CHECKOUTS
// ═══════════════════════════════════════════════════════════════════
async function loadCheckouts() {
  allCheckouts = await api('GET', '/api/checkouts');
  renderCheckouts();
}

function renderCheckouts() {
  const filter = document.getElementById('checkout-filter').value;
  let filtered = allCheckouts;
  if (filter === 'active') filtered = allCheckouts.filter(c => !c.returned_at);
  else if (filter === 'returned') filtered = allCheckouts.filter(c => c.returned_at);

  const tbody = document.getElementById('checkouts-tbody');
  tbody.innerHTML = filtered.length
    ? filtered.map(c => `
      <tr>
        <td class="muted">${c.id}</td>
        <td><strong>${c.book_copies?.books?.title || '—'}</strong><br/><span class="muted">${c.book_copies?.books?.author || ''}</span></td>
        <td>${c.students?.full_name || '—'}<br/><span class="muted">${c.students?.class || ''}</span></td>
        <td>${fmtDateTime(c.issued_at)}</td>
        <td>${c.returned_at ? fmtDateTime(c.returned_at) : '—'}</td>
        <td>${c.returned_at ? '<span class="badge badge-returned">Возвращён</span>' : '<span class="badge badge-active">Активна</span>'}</td>
        <td>
          ${!c.returned_at ? `<button class="btn btn-success btn-sm" onclick="returnBook(${c.id})">📥 Вернуть</button>` : '—'}
        </td>
      </tr>
    `).join('')
    : '<tr class="empty-row"><td colspan="7">Нет записей о выдаче</td></tr>';
}

document.getElementById('checkout-filter').addEventListener('change', renderCheckouts);

document.getElementById('btn-new-checkout').addEventListener('click', () => {
  // Load copies and students
  Promise.all([
    allCopies.length ? Promise.resolve(allCopies) : api('GET', '/api/copies'),
    allStudents.length ? Promise.resolve(allStudents) : api('GET', '/api/students'),
  ]).then(([copies, students]) => {
    allCopies = copies;
    allStudents = students;
    openCheckoutModal();
  }).catch(e => toast(e.message, 'error'));
});

function openCheckoutModal() {
  const availableCopies = allCopies.filter(c => c.status === 'available');
  if (!availableCopies.length) { toast('Нет доступных экземпляров', 'error'); return; }

  showModal(`
    <div class="modal-header">
      <h3>Новая выдача</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Экземпляр *</label>
        <div style="display:flex;gap:8px">
          <select id="f-checkout-copy" style="flex:1">
            <option value="">— выберите экземпляр —</option>
            ${availableCopies.map(c => `<option value="${c.id}">${c.books?.title || '—'} (QR: ${c.qr_code_text})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary scan-btn" id="btn-scan-copy" title="Сканировать QR экземпляра">📷</button>
        </div>
        <div id="scan-copy-info" class="scan-info hidden"></div>
      </div>
      <div class="form-group">
        <label>Ученик *</label>
        <div style="display:flex;gap:8px">
          <select id="f-checkout-student" style="flex:1">
            <option value="">— выберите ученика —</option>
            ${allStudents.map(s => `<option value="${s.id}">${s.full_name} (${s.class})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-secondary scan-btn" id="btn-scan-student" title="Сканировать QR ученика">📷</button>
        </div>
        <div id="scan-student-info" class="scan-info hidden"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn btn-primary" onclick="doCheckout()">Выдать</button>
    </div>
  `);

  // Wire up scan buttons
  document.getElementById('btn-scan-copy').addEventListener('click', () => openScanner('copy'));
  document.getElementById('btn-scan-student').addEventListener('click', () => openScanner('student'));
}

// ─── QR Scanner ────────────────────────────────────────────────────
let scannerStream = null;
let scannerRafId = null;
let scannerMode = null; // 'copy' or 'student'

function openScanner(mode) {
  scannerMode = mode;

  // Close the current modal temporarily (keep it in background)
  const modalOverlay = document.getElementById('modal-overlay');
  modalOverlay.style.zIndex = '100';

  showModal(`
    <div class="modal-header">
      <h3>${mode === 'copy' ? '📷 Сканирование QR экземпляра' : '📷 Сканирование QR ученика'}</h3>
      <button class="modal-close" onclick="closeScanner()">×</button>
    </div>
    <div class="modal-body scanner-body">
      <div class="scanner-view">
        <video id="scanner-video" autoplay playsinline muted></video>
        <div class="scanner-frame"></div>
        <div id="scanner-status" class="scanner-status">Запуск камеры...</div>
      </div>
      <canvas id="scanner-canvas" style="display:none"></canvas>
      <div class="scanner-hint">
        Наведите камеру на QR-код<br>
        Распознавание происходит автоматически
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeScanner()">Отмена</button>
    </div>
  `);

  startScanner();
}

async function startScanner() {
  const video = document.getElementById('scanner-video');
  const status = document.getElementById('scanner-status');
  if (!video) return;

  try {
    // Try to get the camera
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = scannerStream;
    status.textContent = 'Наведите камеру на QR-код';
    status.className = 'scanner-status scanning';

    // Start the decode loop
    const canvas = document.getElementById('scanner-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function decodeFrame() {
      if (!scannerStream) return; // scanner closed
      try {
        if (video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Use jsQR to decode
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result && result.data) {
            handleScanResult(result.data);
            return;
          }
        }
      } catch (e) {
        // Decode failed (no QR in frame), keep trying
      }
      scannerRafId = requestAnimationFrame(decodeFrame);
    }
    decodeFrame();
  } catch (err) {
    status.textContent = 'Ошибка доступа к камере: ' + (err.message || err.name);
    status.className = 'scanner-status error';
    console.error('Scanner error:', err);
  }
}

function handleScanResult(text) {
  stopScanner();

  const info = scannerMode === 'copy'
    ? document.getElementById('scan-copy-info')
    : document.getElementById('scan-student-info');
  const select = scannerMode === 'copy'
    ? document.getElementById('f-checkout-copy')
    : document.getElementById('f-checkout-student');

  if (!info || !select) {
    // Modal was closed, just show the result in toast
    toast(`Распознано: ${text}`, 'info');
    return;
  }

  // Try to match against known items
  let matched = null;
  let matchedLabel = '';

  if (scannerMode === 'copy') {
    matched = allCopies.find(c => c.qr_code_text === text && c.status === 'available');
    if (matched) matchedLabel = `${matched.books?.title || ''} (QR: ${text})`;
    else {
      // Fallback: any copy with this QR (even if not available)
      const any = allCopies.find(c => c.qr_code_text === text);
      if (any) {
        matched = any;
        matchedLabel = `${any.books?.title || ''} (QR: ${text}) — НЕ ДОСТУПЕН (${STATUS_LABELS[any.status] || any.status})`;
      }
    }
  } else {
    matched = allStudents.find(s => s.qr_code_text === text);
    if (matched) matchedLabel = `${matched.full_name} (${matched.class})`;
  }

  if (matched) {
    select.value = matched.id;
    info.textContent = matchedLabel;
    info.className = 'scan-info ' + (scannerMode === 'copy' && matched.status !== 'available' ? 'warn' : 'ok');
    info.classList.remove('hidden');
  } else {
    info.textContent = `QR не найден в базе: ${text}`;
    info.className = 'scan-info error';
    info.classList.remove('hidden');
  }

  // Reopen the checkout modal (with higher z-index)
  const modalOverlay = document.getElementById('modal-overlay');
  modalOverlay.style.zIndex = '';
  // The scanner modal replaced the checkout modal; restore it
  openCheckoutModal();
  // Restore the scanned values
  select.value = matched ? matched.id : '';
  if (matched) {
    const info2 = document.getElementById(scannerMode === 'copy' ? 'scan-copy-info' : 'scan-student-info');
    if (info2) {
      info2.textContent = matchedLabel;
      info2.className = 'scan-info ' + (scannerMode === 'copy' && matched.status !== 'available' ? 'warn' : 'ok');
      info2.classList.remove('hidden');
    }
  }
  // Re-wire the scan buttons in the new modal
  document.getElementById('btn-scan-copy').addEventListener('click', () => openScanner('copy'));
  document.getElementById('btn-scan-student').addEventListener('click', () => openScanner('student'));

  toast(matched ? 'QR распознан' : 'QR не найден в базе', matched ? 'success' : 'error');
}

function stopScanner() {
  if (scannerRafId) {
    cancelAnimationFrame(scannerRafId);
    scannerRafId = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
}

function closeScanner() {
  stopScanner();
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) modalOverlay.style.zIndex = '';
  // Reopen the checkout modal
  openCheckoutModal();
}

async function doCheckout() {
  const copyId = document.getElementById('f-checkout-copy').value;
  const studentId = document.getElementById('f-checkout-student').value;
  if (!copyId || !studentId) { toast('Выберите экземпляр и ученика', 'error'); return; }
  try {
    await api('POST', '/api/checkouts', { copy_id: parseInt(copyId), student_id: parseInt(studentId) });
    toast('Книга выдана');
    closeModal();
    await loadCheckouts();
  } catch (e) { toast(e.message, 'error'); }
}

async function returnBook(checkoutId) {
  try {
    await api('POST', `/api/checkouts/${checkoutId}/return`);
    toast('Книга возвращена');
    await loadCheckouts();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════
// QR CODE PRINTING
// ═══════════════════════════════════════════════════════════════════
function generateQR(canvasId, text, size = 200) {
  const canvas = document.getElementById(canvasId);
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const scale = Math.floor(size / (modules + 4));
  const actualSize = modules * scale;
  canvas.width = actualSize;
  canvas.height = actualSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, actualSize, actualSize);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }
}

function printCopyQR(copyId) {
  const copy = allCopies.find(c => c.id === copyId);
  if (!copy) { toast('Экземпляр не найден', 'error'); return; }
  showPrintModal('copy', copy);
}

function printStudentQR(studentId) {
  const student = allStudents.find(s => s.id === studentId);
  if (!student) { toast('Ученик не найден', 'error'); return; }
  showPrintModal('student', student);
}

function showPrintModal(type, item) {
  const isCopy = type === 'copy';
  const title = isCopy ? item.books?.title : item.full_name;
  const subtitle = isCopy ? item.books?.author : item.class;
  const qrText = item.qr_code_text;

  showModal(`
    <div class="modal-header">
      <h3>${isCopy ? '🔖 QR-код экземпляра' : '👨‍🎓 QR-код ученика'}</h3>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body print-preview">
      <div class="print-card" id="print-card">
        <div class="print-card-header">${isCopy ? 'ЭКЗЕМПЛЯР КНИГИ' : 'УЧЕНИК'}</div>
        <div class="print-card-title">${title}</div>
        <div class="print-card-subtitle">${subtitle || ''}</div>
        <div class="print-card-qr">
          <canvas id="print-qr-canvas"></canvas>
        </div>
        <div class="print-card-code mono">${qrText}</div>
        <div class="print-card-footer">Школьная библиотека</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Закрыть</button>
      <button class="btn btn-primary" onclick="doPrint()">🖨️ Печать</button>
    </div>
  `);

  // Generate QR after modal is shown
  setTimeout(() => generateQR('print-qr-canvas', qrText, 220), 50);
}

function doPrint() {
  const card = document.getElementById('print-card');
  if (!card) return;

  // Create a print-only iframe
  const iframe = document.createElement('iframe');
  iframe.className = 'print-iframe';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Печать QR</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; padding: 20px; }
  .print-card {
    width: 320px;
    margin: 0 auto;
    border: 2px solid #000;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    page-break-inside: avoid;
  }
  .print-card-header {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: #666;
    margin-bottom: 6px;
  }
  .print-card-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .print-card-subtitle {
    font-size: 0.85rem;
    color: #444;
    margin-bottom: 10px;
  }
  .print-card-qr {
    margin: 0 auto 10px;
    width: 200px;
    height: 200px;
  }
  .print-card-qr canvas { width: 100% !important; height: 100% !important; image-rendering: pixelated; }
  .print-card-code {
    font-family: monospace;
    font-size: 0.9rem;
    background: #f5f5f5;
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 8px;
    word-break: break-all;
  }
  .print-card-footer {
    font-size: 0.7rem;
    color: #999;
  }
  @page { size: auto; margin: 10mm; }
</style>
</head>
<body>
${card.outerHTML}
</body>
</html>`);
  doc.close();

  // Wait for canvas to render, then print
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 200);
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
