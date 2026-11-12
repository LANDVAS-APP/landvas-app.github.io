// Shows its children only while Ink has daily caps (hidden when the owner has uncapped Ink for everyone).
import type { ReactNode } from 'react';
import { useInkUncapped } from '../lib/queries';

export function IfCapped({ children }: { children: ReactNode }) {
  return useInkUncapped() ? null : <>{children}</>;
}
