/**
 * Library Management App — Server
 * Zero external dependencies — uses Node.js built-in modules only.
 * Connects to Supabase via REST API (HTTPS).
 *
 * Authentication: librarian users sign in via /api/auth/login and receive a JWT.
 * All /api/* endpoints (except /api/auth/*) require a valid JWT in the
 * Authorization header.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Top-level error handlers
process.on('uncaughtException', (e) => {
  console.error('[UNCAUGHT EXCEPTION]', e);
});
process.on('unhandledRejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e);
});

const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_HOST } = (() => {
  const cfg = require('./config');
  return { SUPABASE_URL: cfg.SUPABASE_URL, SUPABASE_KEY: cfg.SUPABASE_KEY, SUPABASE_HOST: new URL(cfg.SUPABASE_URL).hostname };
})();

const PORT = process.env.PORT || 3000;

// ─── JWT Verification ──────────────────────────────────────────────
// Verifies a Supabase JWT by checking it against /auth/v1/user endpoint.
// The access token from login is what we verify.
async function verifyToken(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_HOST,
      port: 443,
      path: '/auth/v1/user',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(parsed);
          } else {
            reject(new Error(`Invalid token (HTTP ${res.statusCode})`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function requireAuth(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization header');

  const user = await verifyToken(token);
  if (!user || !user.id) throw new Error('Invalid token');

  // Check that the user is a librarian (in librarians table)
  // We use the service role to look up the row, since RLS on librarians
  // only allows the user to see themselves (which is fine).
  const row = await supabaseRequest('GET', `librarians?id=eq.${user.id}&select=id,username,full_name,role,is_active`);
  const lib = Array.isArray(row) ? row[0] : null;
  if (!lib) throw new Error('User is not a librarian');
  if (!lib.is_active) throw new Error('Librarian account is deactivated');

  // Attach to request for downstream use
  req.auth = { user, librarian: lib };
  return lib;
}

// ─── Supabase REST Helper ──────────────────────────────────────────
function supabaseRequest(method, table, { query = '', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}${query}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Static file serving ───────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, 'public', path.basename(req.url));
  if (req.url === '/' || req.url === '') filePath = path.join(__dirname, 'public', 'index.html');

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ─── API Route Handler ─────────────────────────────────────────────
async function handleApi(req, res, pathname, query) {
  res.setHeader('Content-Type', 'application/json');

  const jsonRes = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    // ── Auth endpoints (no JWT required) ─────────────────────────
    // POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = await readBody(req);
      if (!email || !password) throw new Error('Email and password required');

      const options = {
        hostname: SUPABASE_HOST,
        port: 443,
        path: '/auth/v1/token?grant_type=password',
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      };
      const authReq = https.request(options, (authRes) => {
        let data = '';
        authRes.on('data', (chunk) => (data += chunk));
        authRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (authRes.statusCode === 200) {
              // Look up librarian profile to enrich response
              const libRows = supabaseRequest('GET', `librarians?id=eq.${parsed.user.id}&select=id,username,full_name,role,is_active`)
                .catch(() => []);
              libRows.then(rows => {
                const lib = Array.isArray(rows) ? rows[0] : null;
                if (!lib || !lib.is_active) {
                  jsonRes(401, { error: 'Аккаунт не найден или деактивирован' });
                  return;
                }
                jsonRes(200, {
                  access_token: parsed.access_token,
                  token_type: parsed.token_type,
                  expires_in: parsed.expires_in,
                  user: {
                    id: parsed.user.id,
                    email: parsed.user.email,
                    username: lib.username,
                    full_name: lib.full_name,
                    role: lib.role,
                  },
                });
              });
            } else {
              const msg = parsed.error_description || parsed.msg || 'Неверный email или пароль';
              jsonRes(401, { error: msg });
            }
          } catch (e) {
            jsonRes(500, { error: 'Auth error' });
          }
        });
      });
      authReq.on('error', (e) => jsonRes(500, { error: e.message }));
      authReq.write(JSON.stringify({ email, password }));
      authReq.end();
      return;
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const lib = await requireAuth(req);
      return jsonRes(200, {
        user: {
          id: req.auth.user.id,
          email: req.auth.user.email,
          username: lib.username,
          full_name: lib.full_name,
          role: lib.role,
        },
      });
    }

    // POST /api/auth/logout (client-side; server just confirms)
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      await requireAuth(req);
      return jsonRes(200, { ok: true });
    }

    // ── All other /api/* routes require authentication ──────────
    await requireAuth(req);

    // GET /api/books
    if (pathname === '/api/books' && req.method === 'GET') {
      const data = await supabaseRequest('GET', 'books', {
        query: '?select=*,book_copies(id,qr_code_text,status,acquired_date)&order=title.asc',
      });
      return jsonRes(200, data);
    }

    // POST /api/books
    if (pathname === '/api/books' && req.method === 'POST') {
      const body = await readBody(req);
      const data = await supabaseRequest('POST', 'books', { body: [body] });
      return jsonRes(201, data[0] || data);
    }

    // PUT /api/books/:id
    const bookMatch = pathname.match(/^\/api\/books\/(\d+)$/);
    if (bookMatch && req.method === 'PUT') {
      const body = await readBody(req);
      const data = await supabaseRequest('PATCH', `books?id=eq.${bookMatch[1]}`, { body });
      return jsonRes(200, data[0] || data);
    }

    // DELETE /api/books/:id
    if (bookMatch && req.method === 'DELETE') {
      await supabaseRequest('DELETE', `books?id=eq.${bookMatch[1]}`);
      return jsonRes(200, { ok: true });
    }

    // GET /api/copies
    if (pathname === '/api/copies' && req.method === 'GET') {
      const data = await supabaseRequest('GET', 'book_copies', {
        query: '?select=*,books(title,author,class_grade)&order=id.asc',
      });
      return jsonRes(200, data);
    }

    // POST /api/copies
    if (pathname === '/api/copies' && req.method === 'POST') {
      const body = await readBody(req);
      const data = await supabaseRequest('POST', 'book_copies', { body: [body] });
      return jsonRes(201, data[0] || data);
    }

    // POST /api/copies/:id/status-update
    const copyStatusMatch = pathname.match(/^\/api\/copies\/(\d+)\/status-update$/);
    if (copyStatusMatch && req.method === 'POST') {
      const body = await readBody(req);
      const data = await supabaseRequest('PATCH', `book_copies?id=eq.${copyStatusMatch[1]}`, {
        body: { status: body.status },
      });
      return jsonRes(200, data[0] || data);
    }

    // POST /api/copies/:id/mark-lost
    const copyLostMatch = pathname.match(/^\/api\/copies\/(\d+)\/mark-lost$/);
    if (copyLostMatch && req.method === 'POST') {
      const data = await supabaseRequest('PATCH', `book_copies?id=eq.${copyLostMatch[1]}`, {
        body: { status: 'lost' },
      });
      return jsonRes(200, data[0] || data);
    }

    // POST /api/copies/:id/mark-damaged
    const copyDmgMatch = pathname.match(/^\/api\/copies\/(\d+)\/mark-damaged$/);
    if (copyDmgMatch && req.method === 'POST') {
      const data = await supabaseRequest('PATCH', `book_copies?id=eq.${copyDmgMatch[1]}`, {
        body: { status: 'damaged' },
      });
      return jsonRes(200, data[0] || data);
    }

    // DELETE /api/copies/:id
    const copyDelMatch = pathname.match(/^\/api\/copies\/(\d+)$/);
    if (copyDelMatch && req.method === 'DELETE') {
      await supabaseRequest('DELETE', `book_copies?id=eq.${copyDelMatch[1]}`);
      return jsonRes(200, { ok: true });
    }

    // GET /api/students
    if (pathname === '/api/students' && req.method === 'GET') {
      const data = await supabaseRequest('GET', 'students', {
        query: '?order=class.asc&order=full_name.asc',
      });
      return jsonRes(200, data);
    }

    // POST /api/students
    if (pathname === '/api/students' && req.method === 'POST') {
      const body = await readBody(req);
      const data = await supabaseRequest('POST', 'students', { body: [body] });
      return jsonRes(201, data[0] || data);
    }

    // PUT /api/students/:id
    const stuMatch = pathname.match(/^\/api\/students\/(\d+)$/);
    if (stuMatch && req.method === 'PUT') {
      const body = await readBody(req);
      const data = await supabaseRequest('PATCH', `students?id=eq.${stuMatch[1]}`, { body });
      return jsonRes(200, data[0] || data);
    }

    // DELETE /api/students/:id
    if (stuMatch && req.method === 'DELETE') {
      await supabaseRequest('DELETE', `students?id=eq.${stuMatch[1]}`);
      return jsonRes(200, { ok: true });
    }

    // GET /api/checkouts
    if (pathname === '/api/checkouts' && req.method === 'GET') {
      let q = '?select=*,book_copies(qr_code_text,books(id,title,author)),students(full_name,class)&order=issued_at.desc';
      if (query.get('active') === 'true') q += '&returned_at=is.null';
      const data = await supabaseRequest('GET', 'checkouts', { query: q });
      return jsonRes(200, data);
    }

    // POST /api/checkouts
    if (pathname === '/api/checkouts' && req.method === 'POST') {
      const body = await readBody(req);
      // Update copy status to issued
      await supabaseRequest('PATCH', `book_copies?id=eq.${body.copy_id}`, {
        body: { status: 'issued' },
      });
      const data = await supabaseRequest('POST', 'checkouts', {
        query: '?select=*,book_copies(qr_code_text,books(id,title,author)),students(full_name,class)',
        body: [body],
      });
      return jsonRes(201, data[0] || data);
    }

    // POST /api/checkouts/:id/return
    const retMatch = pathname.match(/^\/api\/checkouts\/(\d+)\/return$/);
    if (retMatch && req.method === 'POST') {
      const now = new Date().toISOString();
      // First get the copy_id from the checkout
      const existing = await supabaseRequest('GET', `checkouts?id=eq.${retMatch[1]}`);
      const checkout = existing[0];
      if (!checkout) throw new Error('Checkout not found');

      // Update returned_at
      await supabaseRequest('PATCH', `checkouts?id=eq.${retMatch[1]}`, {
        body: { returned_at: now },
      });

      // Reset copy status to available
      await supabaseRequest('PATCH', `book_copies?id=eq.${checkout.copy_id}`, {
        body: { status: 'available' },
      });

      checkout.returned_at = now;
      return jsonRes(200, checkout);
    }

    // GET /api/stats
    if (pathname === '/api/stats' && req.method === 'GET') {
      const counts = await Promise.all([
        supabaseRequest('GET', 'books', { query: '?select=id', headers: { 'Prefer': 'count=exact' } }),
        supabaseRequest('GET', 'book_copies', { query: '?select=id', headers: { 'Prefer': 'count=exact' } }),
        supabaseRequest('GET', 'students', { query: '?select=id', headers: { 'Prefer': 'count=exact' } }),
        supabaseRequest('GET', 'checkouts', { query: '?select=id&returned_at=is.null', headers: { 'Prefer': 'count=exact' } }),
      ]);
      // We need Content-Range headers for counts, so let's just count from the data
      const [books, copies, students, activeCheckouts] = await Promise.all([
        supabaseRequest('GET', 'books', { query: '?select=id' }),
        supabaseRequest('GET', 'book_copies', { query: '?select=id' }),
        supabaseRequest('GET', 'students', { query: '?select=id' }),
        supabaseRequest('GET', 'checkouts', { query: '?select=id&returned_at=is.null' }),
      ]);
      return jsonRes(200, {
        books: Array.isArray(books) ? books.length : 0,
        copies: Array.isArray(copies) ? copies.length : 0,
        students: Array.isArray(students) ? students.length : 0,
        activeCheckouts: Array.isArray(activeCheckouts) ? activeCheckouts.length : 0,
      });
    }

    // Fallback
    return jsonRes(404, { error: 'Not found' });

  } catch (e) {
    // Auth errors should return 401, others 500
    const isAuthError = /missing authorization|invalid token|not a librarian|deactivated|no authorization/i.test(e.message);
    return jsonRes(isAuthError ? 401 : 500, { error: e.message });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── Server ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, url.searchParams).catch(e => {
      // Auth errors should return 401, others 500
      const isAuthError = /missing authorization|invalid token|not a librarian|deactivated|no authorization/i.test(e.message);
      const status = isAuthError ? 401 : 500;
      console.error(`[API ERROR] ${req.method} ${pathname} -> ${status}: ${e.message}`);
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`📚 Library app running at http://localhost:${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
});
