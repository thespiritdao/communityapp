// src/app/constitution/page.tsx
//
// Public constitutional-exclusion monitor (Congregant architecture).
// Shows, for every registered AI agent, live on-chain proof that it holds
// no vote, no role credential, no presence token, and no participation
// standing — with Basescan links so anyone can verify independently.
'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ExternalLink, Loader2, HelpCircle } from 'lucide-react';

interface Check {
  label: string;
  holds: boolean | null;
  detail: string;
  verifyUrl: string | null;
}

interface AgentStatus {
  address: string;
  name: string;
  podName: string;
  active: boolean;
  registeredAt: string;
  registryUrl: string;
  allHold: boolean;
  checks: Check[];
}

interface MonitorData {
  registry: string;
  registryUrl: string;
  agentCount: number;
  checkedAt: string;
  agents: AgentStatus[];
}

export default function ConstitutionPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?agent=0x… narrows the monitor to one agent, so a pod can link to the
  // proof for its own agent rather than to a list. Read from the URL directly
  // rather than useSearchParams, which would need a Suspense boundary here.
  const [focusAddress, setFocusAddress] = useState<string | null>(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('agent');
    setFocusAddress(raw && /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : null);
  }, []);

  useEffect(() => {
    fetch('/api/constitution')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const allAgents = data?.agents ?? [];
  const shown = focusAddress
    ? allAgents.filter((a) => a.address.toLowerCase() === focusAddress)
    : allAgents;
  const focusMissing = !!focusAddress && !!data && shown.length === 0;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: '#FBF6E9' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-28 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-[#3C3C3C] text-balance">
          The Constitutional Boundary
        </h1>
        <p className="mt-2 text-sm text-[#7C6F5B] leading-relaxed">
          SpiritDAO&apos;s AI agents are members of community life — named, addressable, funded by
          pod treasuries — but they are excluded from sovereignty. That exclusion is not a promise
          about model behavior; it is a property of shared infrastructure. This page verifies it
          live, on-chain. Every check below can be independently reproduced on Basescan.
        </p>

        {error && (
          <div className="mt-6 p-4 rounded-lg text-sm text-red-800 bg-red-50 border border-red-200">
            Failed to load monitor: {error}
          </div>
        )}

        {!data && !error && (
          <div className="mt-10 flex items-center gap-2 text-[#7C6F5B] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the chain…
          </div>
        )}

        {data && (
          <>
            {/* A 42-character address in a run of prose is what pushed this
                page sideways on a phone. Give it its own line and let it break. */}
            <div className="mt-4 text-xs text-[#7C6F5B] space-y-1">
              <div>
                Agent registry:{' '}
                <a
                  href={data.registryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all"
                >
                  {data.registry}
                </a>
              </div>
              <div>
                {data.agentCount} registered agent{data.agentCount === 1 ? '' : 's'} · checked{' '}
                {new Date(data.checkedAt).toLocaleString()}
              </div>
            </div>

            {focusMissing && (
              <div className="mt-6 p-4 rounded-lg text-sm" style={{ backgroundColor: '#F5E6E6', color: '#8B3A3A' }}>
                No agent with that address is in the registry. Showing every registered agent
                instead.
              </div>
            )}

            {focusAddress && !focusMissing && allAgents.length > 1 && (
              <div className="mt-4 text-xs text-[#7C6F5B]">
                Showing one agent ·{' '}
                <a href="/constitution" className="underline">
                  view all {allAgents.length}
                </a>
              </div>
            )}

            {(focusMissing ? allAgents : shown).map((agent) => (
              <div
                key={agent.address}
                className="mt-6 rounded-xl p-3 sm:p-4"
                style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}
              >
                <div className="flex items-center gap-2">
                  {agent.allHold ? (
                    <ShieldCheck className="h-5 w-5 flex-shrink-0" style={{ color: '#4A7C59' }} />
                  ) : (
                    <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-600" />
                  )}
                  {/* min-w-0 lets the address and pod name wrap instead of
                      stretching the row past the viewport. */}
                  <div className="min-w-0">
                    <div className="font-medium text-[#3C3C3C] break-words">
                      {agent.name}{' '}
                      <span className="font-normal text-xs text-[#7C6F5B]">
                        · {agent.podName} · {agent.active ? 'active' : 'deactivated'}
                      </span>
                    </div>
                    <a
                      href={agent.registryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#7C6F5B] underline break-all"
                    >
                      {agent.address}
                    </a>
                  </div>
                </div>

                <ul className="mt-3 space-y-2">
                  {agent.checks.map((check) => (
                    <li key={check.label} className="flex items-start gap-2 text-sm">
                      {check.holds === true && (
                        <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#4A7C59' }} />
                      )}
                      {check.holds === false && (
                        <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
                      )}
                      {check.holds === null && (
                        <HelpCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#B8A88A]" />
                      )}
                      <span className="text-[#3C3C3C] min-w-0 break-words">
                        {check.label}
                        <span className="text-xs text-[#7C6F5B]">
                          {' '}
                          — {check.detail}
                          {check.verifyUrl && (
                            <>
                              {' '}
                              <a
                                href={check.verifyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline inline-flex items-center gap-0.5"
                              >
                                verify <ExternalLink className="h-3 w-3" />
                              </a>
                            </>
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-[#7C6F5B]">
                  Registered {new Date(agent.registeredAt).toLocaleDateString()}. These denials are
                  enforced by the AgentRegistry, token mint guards, and a Hats eligibility module —
                  not by instructions to the model. A different model behind this agent would be
                  excluded identically.
                </p>
              </div>
            ))}

            <p className="mt-8 text-xs text-[#7C6F5B] leading-relaxed">
              The boundary is itself governable: a community may, by supermajority, decide to grant
              agents standing. Until it does — deliberately, in public, on the record — the checks
              on this page hold. See{' '}
              <em>Congregant, Not Citizen: Constitutional Design for AI Members of Human Communities</em>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
