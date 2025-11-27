import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.+)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

console.log('Parsed env vars:', Object.keys(envVars));
console.log('NEXT_PUBLIC_SUPABASE_URL:', envVars.NEXT_PUBLIC_SUPABASE_URL);

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL ||
    'https://yqgqodofeliuurrmxlks.supabase.co',
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const podId = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

const { data, error } = await supabase
  .from('pods')
  .select('id, name, management_hat_id, membership_hat_id')
  .eq('id', podId)
  .single();

if (error) {
  console.error('Error fetching pod:', error);
  process.exit(1);
}

console.log('\n📋 Pod Information:');
console.log('==================');
console.log('ID:', data.id);
console.log('Name:', data.name);
console.log('\n🎩 HAT IDs:');
console.log('Management HAT ID:', data.management_hat_id);
console.log('Membership HAT ID:', data.membership_hat_id);

// Convert to hex if needed
if (data.management_hat_id) {
  try {
    const hatIdBigInt = BigInt(data.management_hat_id);
    const hex = '0x' + hatIdBigInt.toString(16).padStart(64, '0');
    console.log('Management HAT (hex):', hex);
  } catch (e) {
    console.log(
      'Management HAT (already hex or invalid):',
      data.management_hat_id,
    );
  }
}

if (data.membership_hat_id) {
  try {
    const hatIdBigInt = BigInt(data.membership_hat_id);
    const hex = '0x' + hatIdBigInt.toString(16).padStart(64, '0');
    console.log('Membership HAT (hex):', hex);
  } catch (e) {
    console.log(
      'Membership HAT (already hex or invalid):',
      data.membership_hat_id,
    );
  }
}

process.exit(0);
