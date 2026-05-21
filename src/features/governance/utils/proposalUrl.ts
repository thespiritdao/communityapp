// Build the in-app URL for a proposal, branching on whether the id is a
// numeric on-chain Governor proposal id or a UUID pod-level proposal id.
//
// On-chain proposals (numeric) have a dedicated detail page at
// `/governance/[id]` that pulls block-height data from the Governor.
//
// Pod-level proposals (UUID) are DB-backed and have no detail page —
// they're rendered via ProposalModal on the governance index page.
// `/governance?proposal={uuid}` is the deep-link form the index page
// listens for to auto-open the modal.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidProposalId(id: string): boolean {
  return UUID_RE.test(id);
}

export function buildProposalUrl(proposalId: string): string {
  if (isUuidProposalId(proposalId)) {
    return `/governance?proposal=${encodeURIComponent(proposalId)}`;
  }
  return `/governance/${proposalId}`;
}
