// src/components/VersionChecker.tsx
'use client';

import { useEffect, useState } from 'react';

/**
 * Version Checker Component
 * Displays current deployment version and build time
 * Helps debug caching issues
 */
export function VersionChecker() {
  const [buildInfo, setBuildInfo] = useState({
    version: 'POLL_FIX_v3', // Update this with each deploy to track
    buildTime: new Date().toISOString(),
    commit: 'bd126382', // Latest commit hash
  });

  useEffect(() => {
    console.log('[VersionChecker] Current deployment:', buildInfo);
    console.log('[VersionChecker] If you see an old version, clear cache!');
  }, [buildInfo]);

  // Only show in development or when ?debug=true
  const showChecker =
    process.env.NODE_ENV === 'development' ||
    (typeof window !== 'undefined' &&
      window.location.search.includes('debug=true'));

  if (!showChecker) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '60px',
        right: '10px',
        backgroundColor: '#2F5D50',
        color: '#FFFFFF',
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        zIndex: 9999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <div>v: {buildInfo.version}</div>
      <div>commit: {buildInfo.commit.slice(0, 7)}</div>
    </div>
  );
}
