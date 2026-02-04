/**
 * Rescue Brain Dump Proposals
 *
 * Extracts proposals from the raw_response of failed brain dump
 * and inserts them into agent_proposals table
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function rescueBrainDump() {
  console.log('🔍 Finding failed brain dump runs...\n');

  // Get the brain dump run with raw_response
  // Note: Can't use LIKE on JSONB, so we get all 'query' mode runs and filter in JS
  const { data: runs, error: runsError } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('mode', 'query')
    .order('created_at', { ascending: false })
    .limit(10);

  if (runsError) {
    console.error('❌ Error fetching runs:', runsError);
    return;
  }

  if (!runs || runs.length === 0) {
    console.log('No query runs found.');
    return;
  }

  // Filter for brain dump runs (where input_context contains brain_dump)
  const brainDumpRuns = runs.filter(run => {
    const context = run.input_context;
    return context && (context.brain_dump || JSON.stringify(context).includes('brain_dump'));
  });

  if (brainDumpRuns.length === 0) {
    console.log('No brain dump runs found.');
    return;
  }

  console.log(`Found ${brainDumpRuns.length} brain dump run(s)\n`);

  for (const run of brainDumpRuns) {
    console.log(`\n📋 Processing run: ${run.id}`);
    console.log(`   Created: ${run.created_at}`);

    // Check if proposals already exist for this run
    const { data: existingProposals } = await supabase
      .from('agent_proposals')
      .select('id')
      .eq('run_id', run.id);

    if (existingProposals && existingProposals.length > 0) {
      console.log(`   ⏭️  Skipping - ${existingProposals.length} proposals already exist`);
      continue;
    }

    // Try to parse the output
    let parsedOutput: any;

    if (run.output && typeof run.output === 'object') {
      if (run.output.raw_response) {
        // Extract from raw_response
        let raw = run.output.raw_response;

        // Strip markdown code blocks
        if (raw.includes('```json')) {
          raw = raw.replace(/```json\n?/g, '').replace(/\n?```/g, '');
        } else if (raw.includes('```')) {
          raw = raw.replace(/```\n?/g, '');
        }

        try {
          parsedOutput = JSON.parse(raw.trim());
          console.log('   ✅ Successfully parsed raw_response');
        } catch (e) {
          console.log('   ❌ Failed to parse raw_response');
          console.log('   Raw response:', raw.substring(0, 200) + '...');
          continue;
        }
      } else {
        // Already parsed
        parsedOutput = run.output;
      }
    }

    // Extract proposed_actions
    const actions = parsedOutput.proposed_actions || parsedOutput.actions;

    if (!actions || actions.length === 0) {
      console.log('   ⚠️  No actions found in output');
      continue;
    }

    console.log(`   📝 Found ${actions.length} proposals to insert`);

    // Prepare proposals for insertion
    const proposals = actions.map((action: any) => ({
      run_id: run.id,
      category: action.category,
      title: action.title,
      rationale: action.rationale,
      steps: action.steps,
      deliverable: action.deliverable || null,
      status: 'pending',
      priority: action.priority || 5,
    }));

    // Insert proposals
    const { error: insertError } = await supabase
      .from('agent_proposals')
      .insert(proposals);

    if (insertError) {
      console.error('   ❌ Error inserting proposals:', insertError);
      continue;
    }

    console.log('   ✅ Successfully inserted proposals!');
    console.log('\n   Proposals created:');
    proposals.forEach((p: any, i: number) => {
      console.log(`      ${i + 1}. [${p.category}-${p.priority}] ${p.title}`);
    });
  }

  console.log('\n✨ Done!\n');
}

rescueBrainDump()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
