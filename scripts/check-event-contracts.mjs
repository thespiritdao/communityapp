import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: events } = await supabase
  .from('events')
  .select('title, event_date, completion_contract_address, registration_contract_address')
  .order('event_date');

console.log('Event Contract Status:\n');

events.forEach(e => {
  const hasContracts = e.completion_contract_address || e.registration_contract_address;
  console.log(`${e.title} (${e.event_date})`);
  console.log(`  Status: ${hasContracts ? '⛓️  HAS CONTRACTS (on-chain)' : '💾 DATABASE ONLY (no contracts)'}`);
  if (hasContracts) {
    console.log(`  Completion: ${e.completion_contract_address || 'N/A'}`);
    console.log(`  Registration: ${e.registration_contract_address || 'N/A'}`);
  }
  console.log('');
});
