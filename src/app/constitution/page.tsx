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

  useEffect(() => {
    fetch('/api/constitution')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF6E9' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-[#3C3C3C]">The Constitutional Boundary</h1>
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
            <div className="mt-4 text-xs text-[#7C6F5B]">
              Agent registry:{' '}
              <a href={data.registryUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {data.registry}
              </a>{' '}
              · {data.agentCount} registered agent{data.agentCount === 1 ? '' : 's'} · checked{' '}
              {new Date(data.checkedAt).toLocaleString()}
            </div>

            {data.agents.map((agent) => (
              <div
                key={agent.address}
                className="mt-6 rounded-xl p-4"
                style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}
              >
                <div className="flex items-center gap-2">
                  {agent.allHold ? (
                    <ShieldCheck className="h-5 w-5 flex-shrink-0" style={{ color: '#4A7C59' }} />
                  ) : (
                    <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-600" />
                  )}
                  <div>
                    <div className="font-medium text-[#3C3C3C]">
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
                      <span className="text-[#3C3C3C]">
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
