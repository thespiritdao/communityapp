// src/context/SnapshotContext.tsx

import { createContext, type ReactNode, useContext } from 'react';
import snapshot from '@snapshot-labs/snapshot.js';

type SnapshotClient = InstanceType<(typeof snapshot)['Client712']>;

const SnapshotContext = createContext<SnapshotClient | null>(null);

const HUB_URL = 'https://hub.snapshot.org';

const snapshotClient = new snapshot.Client712(HUB_URL);

export const SnapshotProvider = ({ children }: { children: ReactNode }) => {
  return (
    <SnapshotContext.Provider value={snapshotClient}>
      {children}
    </SnapshotContext.Provider>
  );
};

export const useSnapshot = (): SnapshotClient => {
  const context = useContext(SnapshotContext);
  if (!context) {
    throw new Error('useSnapshot must be used within a SnapshotProvider');
  }
  return context;
};
