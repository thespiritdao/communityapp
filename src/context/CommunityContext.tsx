// src/context/CommunityContext.tsx

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CommunityContextType {
  communityId: string | null;
  setCommunityId: (id: string) => void;
}

const CommunityContext = createContext<CommunityContextType | undefined>(undefined);

export const CommunityProvider = ({ children }: { children: ReactNode }) => {
  const [communityId, setCommunityId] = useState<string | null>(null);

  return (
    <CommunityContext.Provider value={{ communityId, setCommunityId }}>
      {children}
    </CommunityContext.Provider>
  );
};

export const useCommunity = () => {
  const context = useContext(CommunityContext);
  if (!context) {
    throw new Error('useCommunity must be used within a CommunityProvider');
  }
  return context;
};
