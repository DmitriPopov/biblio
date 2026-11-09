const https = require('https');
const fs = require('fs');
const path = require('path');
const { MGMT_KEY, PROJECT_REF } = require('./config');

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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Read both schemas
  const mainSchema = fs.readFileSync(__dirname + '/schema.sql', 'utf-8');
  const authSchema = fs.readFileSync(__dirname + '/schema_auth.sql', 'utf-8');

  // 2. Execute main schema
  console.log('=== Executing main schema ===');
  let result = await runQuery(mainSchema);
  if (result.status === 200 || result.status === 201) {
    console.log('✅ Main schema executed');
  } else {
    console.log('❌ Main schema failed:', result.status, typeof result.body === 'string' ? result.body : JSON.stringify(result.body).substring(0, 500));
    process.exit(1);
  }

  // 3. Execute auth schema
  console.log('\n=== Executing auth schema ===');
  result = await runQuery(authSchema);
  if (result.status === 200 || result.status === 201) {
    console.log('✅ Auth schema executed');
  } else {
    console.log('❌ Auth schema failed:', result.status, typeof result.body === 'string' ? result.body : JSON.stringify(result.body).substring(0, 500));
    process.exit(1);
  }

  // 4. Verify
  console.log('\n=== Verification ===');
  const check = await runQuery(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('Tables:');
  if (Array.isArray(check.body)) {
    check.body.forEach(t => console.log('  📋', t.table_name));
  }

  // 5. Verify columns
  console.log('\nColumns:');
  const cols = await runQuery(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  if (Array.isArray(cols.body)) {
    let currentTable = null;
    cols.body.forEach(c => {
      if (c.table_name !== currentTable) {
        currentTable = c.table_name;
        console.log(`\n  ${currentTable}:`);
      }
      console.log(`    - ${c.column_name} (${c.data_type})`);
    });
  }

  console.log('\n=== Done ===');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
