// src/app/bounty/[id]/page.tsx
//
// Bounties have no standalone detail route — a bounty is shown as a card with
// an expandable detail panel inside the list at /bounty. Notifications have
// always linked to /bounty/<id> regardless, so every "View" on a bounty alert
// 404'd. Rather than leave those links dead (including the ones already sitting
// in people's notification history), resolve here and hand off to the list with
// that bounty opened.

import { redirect } from 'next/navigation';

export default async function BountyDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bounty?bounty=${encodeURIComponent(id)}`);
}
