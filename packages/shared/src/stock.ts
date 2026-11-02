/** Why stock moved. "sale" and "initial" are only written by the server. */
export const MOVEMENT_KINDS = ['purchase', 'initial', 'sale', 'return', 'loss', 'inventory', 'other'] as const;
export type MovementKind = typeof MOVEMENT_KINDS[number];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  purchase: 'Achat',
  initial: 'Stock initial',
  sale: 'Vente',
  return: 'Retour',
  loss: 'Perte ou casse',
  inventory: 'Inventaire',
  other: 'Autre',
};

/**
 * Weighted average unit cost after a stock-in: what is already on the shelf and what
 * just came in both count for their quantity. Stock with no known cost does not drag
 * the average down, so the delivery's cost applies alone.
 */
export function averageUnitCost(
  currentQty: number,
  currentCost: number,
  addedQty: number,
  addedUnitCost: number,
): number {
  const onHand = Math.max(0, currentQty);
  if (onHand === 0 || currentCost <= 0) return addedUnitCost;
  return (onHand * currentCost + addedQty * addedUnitCost) / (onHand + addedQty);
}
