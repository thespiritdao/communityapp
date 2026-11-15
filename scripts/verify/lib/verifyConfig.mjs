// Shared configuration for the verification suites (npm run verify:*).
//
// The suites exercise a deployed instance and its database. Nothing here is
// specific to one deployment: the target URL, test pod and email domain come
// from the environment, and hat/role ids are looked up from the database.
//
//   VERIFY_BASE_URL       deployed app to test (default NEXT_PUBLIC_APP_URL;
//                         `--base <url>` on the command line overrides both)
//   VERIFY_POD_ID         community pod with ordinary members to test against
//                         (default NEXT_PUBLIC_DEFAULT_POD_ID)
//   VERIFY_EMAIL_DOMAIN   domain for throwaway test accounts (default example.org)
//   NEXT_PUBLIC_GOVERNANCE_POD_ID   the governance (executive) pod

function fail(msg) {
  console.error(`verify config: ${msg}`);
  process.exit(2);
}

/** Base URL of the deployment under test, without a trailing slash. */
export function verifyBaseUrl() {
  const i = process.argv.indexOf('--base');
  const url = (i > -1 ? process.argv[i + 1] : null) || process.env.VERIFY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!url) fail('set VERIFY_BASE_URL or NEXT_PUBLIC_APP_URL (or pass --base <url>)');
  return url.replace(/\/+$/, '');
}

/** Domain used for throwaway accounts the suites create and delete. */
export function verifyEmailDomain() {
  return process.env.VERIFY_EMAIL_DOMAIN || 'example.org';
}

/** Domain of synthetic community-agent accounts (must match the app's AGENT_EMAIL_DOMAIN). */
export function agentEmailDomain() {
  const d = process.env.AGENT_EMAIL_DOMAIN;
  if (!d) fail('set AGENT_EMAIL_DOMAIN (the same value the app uses)');
  return d;
}

/**
 * Pods and ids the suites test against, resolved from the database:
 *   testPodId     community pod with ordinary members
 *   governancePodId
 *   leaderHatId   the test pod's management (leader) hat
 *   leaderRoleId  the pod_role_permissions row carrying that hat
 */
export async function resolveTestPods(admin) {
  const testPodId = process.env.VERIFY_POD_ID || process.env.NEXT_PUBLIC_DEFAULT_POD_ID;
  const governancePodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;
  if (!testPodId) fail('set VERIFY_POD_ID or NEXT_PUBLIC_DEFAULT_POD_ID');
  if (!governancePodId) fail('set NEXT_PUBLIC_GOVERNANCE_POD_ID');

  const { data: pod, error } = await admin
    .from('pods')
    .select('management_hat_id')
    .eq('id', testPodId)
    .single();
  if (error || !pod?.management_hat_id) fail(`test pod ${testPodId} not found or has no management_hat_id`);
  const leaderHatId = pod.management_hat_id;

  const { data: role } = await admin
    .from('pod_role_permissions')
    .select('id')
    .eq('pod_id', testPodId)
    .eq('token_address', leaderHatId)
    .limit(1)
    .maybeSingle();

  return { testPodId, governancePodId, leaderHatId, leaderRoleId: role?.id ?? null };
}
