import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read .env.local
const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/);
const databaseUrl = match ? match[1] : process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

console.log('Connecting to Neon PostgreSQL endpoint...');
const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  // Test 1: Query database info
  const info = await pool.query('SELECT current_database(), current_user, version()');
  console.log('✅ Connection verified:');
  console.log('   Database:', info.rows[0].current_database);
  console.log('   User:', info.rows[0].current_user);
  console.log('   Engine:', info.rows[0].version.split(',')[0]);

  // Test 2: Verify db_backup table exists and write a test blob
  await pool.query(`
    CREATE TABLE IF NOT EXISTS db_backup (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data BYTEA NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (id = 1)
    )
  `);

  const testPayload = Buffer.from('Lobby98 Neon SQLite Snapshot Verification - ' + Date.now(), 'utf-8');
  await pool.query(`
    INSERT INTO db_backup (id, data, updated_at) VALUES (1, $1, NOW())
    ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()
  `, [testPayload]);
  console.log('✅ Wrote test SQLite binary snapshot to db_backup table (' + testPayload.length + ' bytes)');

  // Test 3: Read back and verify integrity
  const readRes = await pool.query('SELECT data, updated_at FROM db_backup WHERE id = 1');
  if (readRes.rows.length === 0 || !readRes.rows[0].data) {
    throw new Error('Failed to read back test snapshot');
  }

  const readStr = readRes.rows[0].data.toString('utf-8');
  if (readStr === testPayload.toString('utf-8')) {
    console.log('✅ Verified readback integrity: match confirmed!');
    console.log('   Snapshot timestamp:', readRes.rows[0].updated_at);
  } else {
    throw new Error('Payload mismatch');
  }

  await pool.end();
  console.log('🎉 All Neon end-to-end tests PASSED successfully!');
  process.exit(0);
} catch (err) {
  console.error('❌ E2E test failed:', err);
  await pool.end();
  process.exit(1);
}
