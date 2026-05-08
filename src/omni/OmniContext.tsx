import React, { createContext, useContext } from 'react';
import type { Omni } from '@omnimedia/omnitool';

const OmniContext = createContext<Omni | null>(null);

export function OmniProvider({ omni, children }: { omni: Omni; children: React.ReactNode }) {
  return <OmniContext.Provider value={omni}>{children}</OmniContext.Provider>;
}

export function useOmni(): Omni {
  const omni = useContext(OmniContext);
  if (!omni) throw new Error('useOmni must be used within an OmniProvider');
  return omni;
}

