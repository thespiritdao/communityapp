// src/app/forum/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useTokenGate } from 'src/features/forum/hooks/useTokenGate';
import { supabase } from 'src/utils/supabaseClient';
import ForumContainer from 'src/features/forum/components/ForumContainer';
import CategoryList from 'src/features/forum/components/CategoryList';
import ThreadList from 'src/features/forum/components/ThreadList';
import { Button } from 'src/components/ui/button';
import { useForum } from 'src/features/forum/hooks/useForum';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';
import styles from 'src/features/forum/styles/Forum.module.css';

interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  required_token?: string | null;  // ensure we can read this
  thread_count: number;
}

interface Thread {
  id: string;
  category_id: string;
  title: string;
  author_wallet: string;
  created_at: string;
  post_count: number;
  category_name: string;
}

export default function ForumPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { hasAccess, isLoading, error, tokenBalances } = useTokenGate();
  const { loadThreads } = useForum();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentThreads, setRecentThreads] = useState<Thread[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch forum data if user has access and tokenBalances is available.
  useEffect(() => {
    if (!isLoading && hasAccess && tokenBalances) {
      fetchForumData();
    }
  }, [isLoading, hasAccess, tokenBalances]);

  // Fetch categories and recent threads
  const fetchForumData = async () => {
    setLoadingData(true);
    setLoadError(null);

    try {
      // 1) Fetch categories
      const { data: categoryData, error: categoryError } = await supabase
        .from('forum_categories')
        .select(`
          id,
          name,
          description,
          created_at,
          required_token,
          thread_count:forum_threads(count)
        `)
        .order('name');

      if (categoryError) {
        throw new Error(`Error fetching categories: ${categoryError.message}`);
      }

      // Convert each category record
      const formattedCategories = (categoryData || []).map((category: any) => ({
        ...category,
        thread_count: category.thread_count?.[0]?.count || 0,
      }));

      // 2) Filter categories based on required_token and user token balances
      const pocToken = process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY?.toLowerCase() || "";
      const execHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID?.toLowerCase() || "";
      const devHatId = process.env.NEXT_PUBLIC_DEV_POD_HAT_ID?.toLowerCase() || "";

      const filteredCategories = formattedCategories.filter((cat) => {
        // If no required_token, category is public
        if (!cat.required_token) return true;

        const catRequired = cat.required_token.trim().toLowerCase();

        // Compare with known tokens/hats
        if (catRequired === pocToken && tokenBalances?.hasProofOfCuriosity) return true;
        if (catRequired === execHatId && tokenBalances?.hasExecutivePod) return true;
        if (catRequired === devHatId && tokenBalances?.hasDevPod) return true;

        // Otherwise, hide this category
        return false;
      });

      setCategories(filteredCategories);

      // 3) Fetch recent threads using loadThreads from your useForum hook
      const threadsResult = await loadThreads(undefined, 0, 5);
      if (!threadsResult.success) {
        throw new Error("Failed to load threads");
      }
      setRecentThreads(threadsResult.threads);

      setLoadingData(false);
    } catch (err: any) {
      console.error('Error loading forum data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unknown error loading forum data');
      setLoadingData(false);
    }
  };

  // Handle wallet connection
  const handleConnectWallet = () => {
    router.push('/login?redirect=/forum');
  };

  // 1) Checking token access
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <h1 className="text-2xl font-bold">Checking token access...</h1>
        <p className="text-muted-foreground mt-2">
          Verifying your NEXT_PUBLIC_PROOF_OF_CURIOSITY token
        </p>
      </div>
    );
  }

  // 2) Not connected
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Lock className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold">Connect Wallet to Access Forum</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          This forum is token-gated and requires a wallet connection.
        </p>
        <Button onClick={handleConnectWallet}>Connect Wallet</Button>
      </div>
    );
  }

  // 3) No access
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="w-12 h-12 text-warning mb-4" />
        <h1 className="text-2xl font-bold">Token Required</h1>
        <p className="text-muted-foreground mt-2 mb-2 text-center max-w-md">
          You need to hold a NEXT_PUBLIC_PROOF_OF_CURIOSITY token to access the forum.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Connected wallet: {address.slice(0, 6)}...{address.slice(-4)}
        </p>
        <Button onClick={() => router.push('/marketplace')}>Get Token</Button>
      </div>
    );
  }

  // 4) Main forum content
  return (
    <ForumContainer>
      {/* Add pb-20 to create space at the bottom so the bottom bar doesn't overlap the content */}
      <div className="pb-20">
        {/* Top row: Forum title + "New Thread" button */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SpiritDAO Forums</h1>
          <Button
            className={styles.newThreadButton}
            onClick={() => {
              console.log("New Thread button clicked!");
              router.push('/forum/create-thread');
            }}
          >
            New Thread
          </Button>
        </div>

        {/* Error display */}
        {loadError && (
          <div className="bg-destructive/10 p-4 rounded-lg border border-destructive mb-8">
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={fetchForumData} className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {/* Loading spinner */}
        {loadingData ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Categories Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold mb-4"></h2>
              {categories.length > 0 ? (
                <CategoryList categories={categories} />
              ) : (
                <p className="text-muted-foreground">No categories found.</p>
              )}
            </section>

            {/* Recent Threads Section */}
            <section>
              <h2 className="text-2xl font-semibold mb-4"></h2>
              {recentThreads.length > 0 ? (
                <ThreadList threads={recentThreads} />
              ) : (
                <p className="text-muted-foreground">No threads yet. Start a conversation!</p>
              )}
            </section>
          </>
        )}
      </div>
    </ForumContainer>
  );
}
