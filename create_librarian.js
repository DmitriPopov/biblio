/**
 * Создаёт учётную запись библиотекаря по умолчанию.
 * Запускается один раз.
 *
 * Учётные данные берутся из переменных окружения (.env):
 *   LIB_EMAIL, LIB_PASSWORD, LIB_USERNAME, LIB_FULL_NAME
 */
const https = require('https');
const {
  SUPABASE_URL,
  SUPABASE_KEY,
  LIB_EMAIL,
  LIB_PASSWORD,
  LIB_USERNAME,
  LIB_FULL_NAME,
} = require('./config');

const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SUPABASE_HOST,
      port: 443,
      path,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data, headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, raw: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  if (!LIB_EMAIL || !LIB_PASSWORD || !LIB_USERNAME) {
    console.error('Missing LIB_EMAIL / LIB_PASSWORD / LIB_USERNAME — set them in .env (see .env.example).');
    process.exit(1);
  }

  // 1. Check if user already exists (try sign-in)
  console.log('=== Checking if default librarian already exists ===');
  const signIn = await request('POST', '/auth/v1/token?grant_type=password', {
    email: LIB_EMAIL,
    password: LIB_PASSWORD,
  });

  if (signIn.status === 200 && signIn.body.user) {
    const userId = signIn.body.user.id;
    console.log('✅ Librarian already exists. User ID:', userId);

    // Ensure librarians row exists
    const check = await request('GET', `/rest/v1/librarians?id=eq.${userId}&select=id,username`);
    if (Array.isArray(check.body) && check.body.length === 0) {
      console.log('Inserting missing librarians row...');
      await request('POST', '/rest/v1/librarians', {
        id: userId,
        username: LIB_USERNAME,
        full_name: LIB_FULL_NAME,
        role: 'librarian',
        is_active: true,
      });
    }
    console.log('✅ Done.');
    return;
  }

  // 2. Create the user via admin API (service role)
  console.log('\n=== Creating default librarian account ===');
  const createUser = await request('POST', '/auth/v1/admin/users', {
    email: LIB_EMAIL,
    password: LIB_PASSWORD,
    email_confirm: true,
  });

  if (createUser.status >= 400) {
    console.log('❌ Failed to create user:', createUser.status, createUser.raw);
    process.exit(1);
  }

  const user = createUser.body;
  const userId = user.id;
  console.log('✅ User created:', userId);

  // 3. Sign in to get a valid JWT
  const login = await request('POST', '/auth/v1/token?grant_type=password', {
    email: LIB_EMAIL,
    password: LIB_PASSWORD,
  });

  if (login.status !== 200) {
    console.log('❌ Failed to sign in:', login.status, login.raw);
    process.exit(1);
  }

  const access_token = login.body.access_token;
  console.log('✅ Signed in, got access token.');

  // 4. Insert row in librarians table using user's JWT
  console.log('\n=== Inserting librarians row ===');
  const insertRow = await request('POST', '/rest/v1/librarians', {
    id: userId,
    username: LIB_USERNAME,
    full_name: LIB_FULL_NAME,
    role: 'librarian',
    is_active: true,
  }, {
    'Authorization': `Bearer ${access_token}`,
    'apikey': SUPABASE_KEY,
    'Prefer': 'return=representation',
  });

  if (insertRow.status >= 400) {
    console.log('❌ Failed to insert librarians row:', insertRow.status, insertRow.raw);
    console.log('\n=== Fallback: inserting with service role ===');
    const retry = await request('POST', '/rest/v1/librarians', {
      id: userId,
      username: LIB_USERNAME,
      full_name: LIB_FULL_NAME,
      role: 'librarian',
      is_active: true,
    });
    if (retry.status >= 400) {
      console.log('❌ Fallback also failed:', retry.status, retry.raw);
      process.exit(1);
    }
    console.log('✅ Inserted via service role');
  } else {
    console.log('✅ Librarians row created');
  }

  // 5. Verify
  console.log('\n=== Verifying librarians table ===');
  const verify = await request('GET', '/rest/v1/librarians?select=id,username,full_name,role,is_active');
  console.log('Status:', verify.status);
  console.log('Data:', JSON.stringify(verify.body, null, 2));

  console.log('\n========================================');
  console.log('Default librarian account:');
  console.log('========================================');
  console.log(`  Email:     ${LIB_EMAIL}`);
  console.log(`  Username:  ${LIB_USERNAME}`);
  console.log(`  Full Name: ${LIB_FULL_NAME}`);
  console.log('  Password:  (stored in .env as LIB_PASSWORD)');
  console.log('========================================');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
