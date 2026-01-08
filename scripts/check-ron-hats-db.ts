// scripts/check-ron-hats-db.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RON_WALLET = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

async function checkRonHats() {
  console.log('\n🔍 Checking Ron\'s HATs in database...\n');
  console.log('Wallet:', RON_WALLET);

  // Check active_pod_members (what useHatPermissions uses)
  console.log('\n--- active_pod_members table ---');
  const { data: podMembers, error: pmError } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase());

  if (pmError) {
    console.error('❌ Error:', pmError);
  } else {
    console.log(`Found ${podMembers?.length || 0} records:`);
    podMembers?.forEach((m: any, i: number) => {
      console.log(`\n${i + 1}. ${m.pod_name}`);
      console.log('   Hat ID:', m.hat_id);
      console.log('   Type:', m.membership_type);
      console.log('   Active:', m.is_active);
    });
  }

  // Check pod_members (raw table)
  console.log('\n--- pod_members table ---');
  const { data: rawMembers, error: rmError } = await supabase
    .from('pod_members')
    .select('*')
    .eq('wallet_address', RON_WALLET.toLowerCase());

  if (rmError) {
    console.error('❌ Error:', rmError);
  } else {
    console.log(`Found ${rawMembers?.length || 0} records:`);
    rawMembers?.forEach((m: any, i: number) => {
      console.log(`\n${i + 1}. Pod ID: ${m.pod_id}`);
      console.log('   Wallet:', m.wallet_address);
      console.log('   HAT ID:', m.hat_id);
      console.log('   Is Leader:', m.is_leader);
    });
  }

  // Check user_profiles for token holdings
  console.log('\n--- user_profiles table ---');
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('wallet_address, first_name, last_name')
    .eq('wallet_address', RON_WALLET.toLowerCase())
    .single();

  if (profileError) {
    console.error('❌ Error:', profileError);
  } else {
    console.log('Profile:', profile);
  }

  // Check authorized_tokens (Beta Tester and Advocate tracking)
  console.log('\n--- authorized_tokens table ---');
  const { data: tokens, error: tokensError } = await supabase
    .from('authorized_tokens')
    .select('*')
    .eq('wallet_address', RON_WALLET.toLowerCase());

  if (tokensError) {
    console.error('❌ Error:', tokensError);
  } else {
    console.log(`Found ${tokens?.length || 0} authorized tokens:`);
    tokens?.forEach((t: any, i: number) => {
      console.log(`\n${i + 1}. Token: ${t.token_address}`);
      console.log('   Token Type:', t.token_type);
      console.log('   Authorized At:', t.authorized_at);
    });
  }

  // List all available tables
  console.log('\n--- Available tables (sample) ---');
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .limit(50);

  if (!tablesError && tables) {
    console.log('Public tables:', tables.map((t: any) => t.table_name).join(', '));
  }

  console.log('\n✅ Database check complete\n');
}

checkRonHats().catch(console.error);
