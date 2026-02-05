import pkg from 'pg';
const { Client } = pkg;
import 'dotenv/config';

console.log('🔧 Fixing donation_approvals table schema...\n');

// Parse Supabase connection string
const connectionString = process.env.DATABASE_URL || `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.yqgqodofeliuurrmxlks.supabase.co:5432/postgres`;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  // Step 1: Make approver_hat_id optional
  console.log('[1/4] Making approver_hat_id nullable...');
  await client.query(`
    ALTER TABLE donation_approvals
    ALTER COLUMN approver_hat_id DROP NOT NULL;
  `);
  console.log('  ✅ Success\n');

  // Step 2: Rename approver_wallet to executive_wallet
  console.log('[2/4] Renaming approver_wallet → executive_wallet...');
  await client.query(`
    ALTER TABLE donation_approvals
    RENAME COLUMN approver_wallet TO executive_wallet;
  `);
  console.log('  ✅ Success\n');

  // Step 3: Drop old unique constraint
  console.log('[3/4] Dropping old unique constraint...');
  await client.query(`
    ALTER TABLE donation_approvals
    DROP CONSTRAINT IF EXISTS donation_approvals_donation_id_approver_wallet_key;
  `);
  console.log('  ✅ Success\n');

  // Step 4: Add new unique constraint
  console.log('[4/4] Adding new unique constraint...');
  await client.query(`
    ALTER TABLE donation_approvals
    ADD CONSTRAINT donation_approvals_donation_id_executive_wallet_key
    UNIQUE(donation_id, executive_wallet);
  `);
  console.log('  ✅ Success\n');

  console.log('🎉 Schema fix complete!\n');
  console.log('Now the API should be able to insert approvals correctly.');

} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.message.includes('already exists') || error.message.includes('does not exist')) {
    console.log('\n✅ Table might already be correct. Continuing...');
  } else {
    process.exit(1);
  }
} finally {
  await client.end();
}
