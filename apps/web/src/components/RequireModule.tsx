import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { BusinessModuleKey } from '@kza/shared';
import { useModules } from '../hooks/useModules';

/** Sends a direct link to a switched-off module back to the dashboard instead of showing it. */
export function RequireModule({ module, children }: { module: BusinessModuleKey; children: ReactNode }) {
  const { has } = useModules();
  return has(module) ? <>{children}</> : <Navigate to="/" replace />;
}
