import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get('user');
    const pod = searchParams.get('pod');
    const action = searchParams.get('action');

    if (!user || !pod || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Check if user has permission for the specific action in the pod
    // This would check against pod membership and roles
    const { data: membership, error } = await supabase
      .from('pod_members')
      .select(`
        *,
        pod_roles (
          *,
          role_permissions (*)
        )
      `)
      .eq('pod_id', pod)
      .eq('member_address', user)
      .eq('status', 'active');

    if (error) {
      console.error('Error checking permissions:', error);
      return NextResponse.json(
        { error: 'Failed to check permissions' },
        { status: 500 },
      );
    }

    let hasPermission = false;

    if (membership && membership.length > 0) {
      // Check if any of the user's roles allow the requested action
      for (const member of membership) {
        if (member.pod_roles) {
          const rolePermissions = member.pod_roles.role_permissions || [];
          const hasActionPermission = rolePermissions.some(
            (perm: any) =>
              perm.permission === action ||
              perm.permission === 'admin' ||
              perm.permission === 'all',
          );

          if (hasActionPermission) {
            hasPermission = true;
            break;
          }
        }
      }
    }

    // Return appropriate response based on action type
    if (action === 'manage_bounties') {
      return NextResponse.json({ canManage: hasPermission });
    } else if (action === 'use_treasury') {
      return NextResponse.json({ canUse: hasPermission });
    } else {
      return NextResponse.json({ hasPermission });
    }
  } catch (error) {
    console.error('Error in pod permissions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
