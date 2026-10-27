import { segmentForSector, termsFor, firstStepsFor } from '@kza/shared';
import { useStore } from '../store/useStore';
import { useModules } from './useModules';

/**
 * The current business's segment and what follows from it: the words used for the
 * catalogue and the getting-started steps. A business with no segment (or an old
 * sector label with no match) gets the general wording.
 */
export function useSegment() {
  const businesses = useStore(s => s.businesses);
  const currentBusinessId = useStore(s => s.currentBusinessId);
  const sector = businesses.find(b => b.id === currentBusinessId)?.sector ?? null;
  const { modules, has } = useModules();

  return {
    sector,
    segment: segmentForSector(sector),
    terms: termsFor(sector, has('stock')),
    firstSteps: firstStepsFor(sector, modules),
  };
}
