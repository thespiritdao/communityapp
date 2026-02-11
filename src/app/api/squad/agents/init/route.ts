import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AGENT_CONFIGS = [
  {
    name: 'Atlas',
    role: 'Marketing Strategy Coordinator',
    sessionKey: 'agent:strategy:main',
    soulPath: 'souls/strategy-agent.md',
    heartbeatCron: '0,15,30,45 * * * *',
  },
  {
    name: 'Lyric',
    role: 'Content Writer',
    sessionKey: 'agent:content:main',
    soulPath: 'souls/content-agent.md',
    heartbeatCron: '2,17,32,47 * * * *',
  },
  {
    name: 'Scout',
    role: 'Marketing Research Specialist',
    sessionKey: 'agent:research:main',
    soulPath: 'souls/research-agent.md',
    heartbeatCron: '5,20,35,50 * * * *',
  },
  {
    name: 'Beacon',
    role: 'Social Media Publisher',
    sessionKey: 'agent:social:main',
    soulPath: 'souls/social-agent.md',
    heartbeatCron: '8,23,38,53 * * * *',
  },
];

/**
 * POST - Initialize agent squad
 */
export async function POST(request: NextRequest) {
  try {
    const initialized = [];
    const existing = [];

    for (const config of AGENT_CONFIGS) {
      // Check if agent exists
      const { data: existingAgent, error: fetchError } = await supabase
        .from('agents')
        .select('*')
        .eq('session_key', config.sessionKey)
        .single();

      if (existingAgent) {
        existing.push(config.name);
        continue;
      }

      // Create agent record
      const { error: insertError } = await supabase.from('agents').insert({
        name: config.name,
        role: config.role,
        session_key: config.sessionKey,
        status: 'idle',
        metadata: {
          soul_path: config.soulPath,
          heartbeat_cron: config.heartbeatCron,
        },
      });

      if (insertError) {
        console.error(`Failed to initialize ${config.name}:`, insertError);
        throw insertError;
      }

      initialized.push(config.name);
    }

    return NextResponse.json({
      success: true,
      message: `Initialized ${initialized.length} agents`,
      data: {
        initialized,
        existing,
      },
    });
  } catch (error: any) {
    console.error('Initialize agents error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
