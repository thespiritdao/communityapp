// Check exact template names and current placeholder configurations
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTemplates() {
  console.log('Checking forum templates...\n');

  const { data: templates, error } = await supabase
    .from('forum_templates')
    .select('id, name, placeholders')
    .order('name');

  if (error) {
    console.error('Error fetching templates:', error);
    return;
  }

  console.log(`Found ${templates.length} templates:\n`);

  templates.forEach((template, idx) => {
    console.log(`${idx + 1}. Template: "${template.name}"`);
    console.log(`   ID: ${template.id}`);
    console.log(`   Total fields: ${template.placeholders.length}`);

    // Count richtext fields
    const richtextFields = template.placeholders.filter(p => p.type === 'richtext');
    const textFields = template.placeholders.filter(p => p.type === 'text');
    const textareaFields = template.placeholders.filter(p => p.type === 'textarea');

    console.log(`   - Text fields: ${textFields.length}`);
    console.log(`   - Textarea fields: ${textareaFields.length}`);
    console.log(`   - Richtext fields: ${richtextFields.length}`);

    // Show details for templates we're trying to fix
    if (template.name.includes('Election') ||
        template.name.includes('Season') ||
        template.name.includes('Request for Proposals')) {
      console.log(`\n   Field Details:`);
      template.placeholders.forEach(p => {
        console.log(`     - ${p.id}: type="${p.type}", label="${p.label}"`);
      });
    }

    console.log('');
  });

  // Specifically check Election Proposals
  const electionTemplate = templates.find(t =>
    t.name.toLowerCase().includes('election') &&
    t.name.toLowerCase().includes('proposal')
  );

  if (electionTemplate) {
    console.log('\n=== ELECTION PROPOSALS TEMPLATE ANALYSIS ===');
    console.log(`Exact name: "${electionTemplate.name}"`);
    console.log(`ID: ${electionTemplate.id}`);

    const description = electionTemplate.placeholders.find(p => p.id === 'description');
    const previousWork = electionTemplate.placeholders.find(p => p.id === 'previousWork');

    console.log(`\nDescription field:`);
    console.log(`  Current type: ${description?.type || 'NOT FOUND'}`);
    console.log(`  Should be: richtext`);
    console.log(`  Status: ${description?.type === 'richtext' ? '✅ CORRECT' : '❌ NEEDS FIX'}`);

    console.log(`\nPrevious Work field:`);
    console.log(`  Current type: ${previousWork?.type || 'NOT FOUND'}`);
    console.log(`  Should be: richtext`);
    console.log(`  Status: ${previousWork?.type === 'richtext' ? '✅ CORRECT' : '❌ NEEDS FIX'}`);
  }
}

checkTemplates().catch(console.error);
