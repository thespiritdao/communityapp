// src/app/bounty/[id]/submissions/page.tsx
//
// Work-submission notifications link to /bounty/<id>/submissions. There is no
// separate submissions page — submitted work is shown inside the bounty's
// detail panel — so send the reader to the bounty itself rather than a 404.

import { redirect } from 'next/navigation';

export default async function BountySubmissionsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bounty?bounty=${encodeURIComponent(id)}`);
}
