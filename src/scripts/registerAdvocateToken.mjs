import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

async function registerAdvocateToken() {
  console.log('🎫 Registering Advocate token in database...');

  const advocateToken = {
    id: 'advocate',
    name: 'Advocate',
    symbol: 'ADV',
    contract_address: '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d',
    token_type: 'erc721',
    is_active: true,
    description: 'Advocate credential for community members',
  };

  try {
    // Check if token already exists
    const { data: existing, error: checkError } = await supabase
      .from('tokens')
      .select('*')
      .eq('contract_address', advocateToken.contract_address)
      .single();

    if (existing) {
      console.log('✅ Advocate token already registered:', existing);

      // Update if needed
      if (existing.name !== 'Advocate') {
        const { data: updated, error: updateError } = await supabase
          .from('tokens')
          .update({
            name: 'Advocate',
            symbol: 'ADV',
            is_active: true,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Error updating token:', updateError);
        } else {
          console.log('✅ Updated token name to Advocate:', updated);
        }
      }
    } else {
      // Insert new token
      const { data: inserted, error: insertError } = await supabase
        .from('tokens')
        .insert(advocateToken)
        .select()
        .single();

      if (insertError) {
        console.error('❌ Error inserting token:', insertError);
      } else {
        console.log('✅ Successfully registered Advocate token:', inserted);
      }
    }

    // Now check if eligibility criteria need updating
    console.log(
      '\n🔍 Checking eligibility criteria that reference this contract...',
    );

    const { data: roles, error: rolesError } = await supabase
      .from('pod_role_permissions')
      .select('id, role_name, eligibility_criteria')
      .not('eligibility_criteria', 'is', null);

    if (roles && !rolesError) {
      for (const role of roles) {
        if (
          role.eligibility_criteria &&
          Array.isArray(role.eligibility_criteria)
        ) {
          let needsUpdate = false;
          const updatedCriteria = role.eligibility_criteria.map((criterion) => {
            if (
              criterion.contract_address === advocateToken.contract_address &&
              !criterion.token_name
            ) {
              console.log(
                `📝 Updating criterion for role ${role.role_name} to include token_name`,
              );
              needsUpdate = true;
              return {
                ...criterion,
                token_name: 'Advocate',
                token_id: 'advocate',
              };
            }
            return criterion;
          });

          if (needsUpdate) {
            const { error: updateError } = await supabase
              .from('pod_role_permissions')
              .update({ eligibility_criteria: updatedCriteria })
              .eq('id', role.id);

            if (updateError) {
              console.error(
                `❌ Error updating role ${role.role_name}:`,
                updateError,
              );
            } else {
              console.log(`✅ Updated role ${role.role_name} with token_name`);
            }
          }
        }
      }
    }

    console.log('\n✅ Advocate token registration complete!');
  } catch (error) {
    console.error('❌ Error in registerAdvocateToken:', error);
  }

  process.exit(0);
}

registerAdvocateToken();
