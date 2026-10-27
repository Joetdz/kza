import { effectiveModules, type BusinessModuleKey } from '@kza/shared';
import { useStore } from '../store/useStore';

/**
 * Modules switched on for the business currently selected (see BUSINESS_MODULES).
 *
 * Purely what the UI shows — a business created before modules existed has an empty
 * list, which counts as every available module, so nothing disappears for it.
 */
export function useModules() {
  const businesses = useStore(s => s.businesses);
  const currentBusinessId = useStore(s => s.currentBusinessId);
  const current = businesses.find(b => b.id === currentBusinessId);
  const modules = effectiveModules(current?.modules);

  return {
    modules,
    has: (key: BusinessModuleKey) => modules.has(key),
  };
}
