const https = require('https');
const fs = require('fs');
const { MGMT_KEY, PROJECT_REF } = require('./config');

if (!MGMT_KEY || !PROJECT_REF) {
  console.error('Missing MGMT_KEY or PROJECT_REF — set them in .env (see .env.example).');
  process.exit(1);
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MGMT_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const schema = fs.readFileSync(__dirname + '/schema.sql', 'utf-8');

  console.log('Executing full schema...\n');

  try {
    const result = await runQuery(schema);
    if (result.status === 200 || result.status === 201) {
      console.log('✅ Schema executed successfully!');
      if (Array.isArray(result.body)) {
        console.log(`   (${result.body.length} results)`);
      }
    } else {
      console.log(`⚠️  HTTP ${result.status}`);
      console.log(typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2));
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  // Verify
  console.log('\n=== Verification ===');

  const check = await runQuery(`
    SELECT t.table_name,
      (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema='public') as col_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);
  console.log('Tables in public schema:');
  if (Array.isArray(check.body)) {
    check.body.forEach(t => console.log(`  📋 ${t.table_name} (${t.col_count} columns)`));
    if (check.body.length === 0) console.log('  (empty)');
  }

  const pol = await runQuery(`
    SELECT tablename, policyname
    FROM pg_policies WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  console.log('\nRLS Policies:');
  if (Array.isArray(pol.body) && pol.body.length > 0) {
    pol.body.forEach(p => console.log(`  🔒 ${p.tablename}: ${p.policyname}`));
  } else {
    console.log('  (none)');
  }

  // Test basic query
  console.log('\nTest query (SELECT from books):');
  const test = await runQuery('SELECT * FROM books LIMIT 1');
  console.log('  Status:', test.status, '| Rows:', Array.isArray(test.body) ? test.body.length : test.body);
}

main();
