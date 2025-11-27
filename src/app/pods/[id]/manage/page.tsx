import PodManageLoader from './PodManageLoader';

/**
 * Pod Management Page - Server Component
 *
 * This page has been modularized to use server/client component separation
 * for better performance and proper data loading patterns.
 */

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PodManagePage({ params }: PageProps) {
  const { id: podId } = await params;

  return <PodManageLoader podId={podId} />;
}
