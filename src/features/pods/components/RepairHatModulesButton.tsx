'use client';
import { useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { HatToggleService } from '@/features/pods/services/hatToggleService';

export function RepairHatModulesButton({
  hatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER as `0x${string}`,
}: { hatId?: `0x${string}` }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onFullRepair = async () => {
    setMsg(null);
    if (!publicClient) return setMsg('No public client');
    if (!walletClient) return setMsg('Connect admin wallet');
    setBusy(true);
    try {
      // IMPORTANT: run unsponsored (Coinbase Smart Wallet policies often block admin writes)
      await HatToggleService.fixHatModules(publicClient, walletClient, hatId);
      setMsg(
        '✅ Repaired: toggle → HatControlledModule, eligibility → PassthroughModule',
      );
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Failed to repair modules'}`);
    } finally {
      setBusy(false);
    }
  };

  const onFixEligibilityOnly = async () => {
    setMsg(null);
    if (!publicClient) return setMsg('No public client');
    if (!walletClient) return setMsg('Connect admin wallet');
    setBusy(true);
    try {
      await HatToggleService.fixEligibilityOnly(
        publicClient,
        walletClient,
        hatId,
      );
      setMsg('✅ Fixed eligibility → PassthroughModule');
    } catch (e: any) {
      setMsg(`❌ ${e?.message || 'Failed to fix eligibility'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onFullRepair}
        disabled={busy}
        className="px-3 py-2 rounded-md bg-amber-500 text-white disabled:opacity-60 text-sm"
        title="Swap toggle/eligibility modules on-chain"
      >
        {busy ? 'Repairing…' : 'Full Repair'}
      </button>

      <button
        onClick={onFixEligibilityOnly}
        disabled={busy}
        className="px-3 py-2 rounded-md text-white disabled:opacity-60 text-sm"
        style={{ backgroundColor: '#2F5D50' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#1F453A';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#2F5D50';
        }}
        title="Fix eligibility module only (when toggle is already correct)"
      >
        {busy ? 'Fixing…' : 'Fix Eligibility Only'}
      </button>

      {msg && <span className="text-sm">{msg}</span>}
    </div>
  );
}
