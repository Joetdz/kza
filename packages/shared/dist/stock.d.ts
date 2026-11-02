/** Why stock moved. "sale" and "initial" are only written by the server. */
export declare const MOVEMENT_KINDS: readonly ["purchase", "initial", "sale", "return", "loss", "inventory", "other"];
export type MovementKind = typeof MOVEMENT_KINDS[number];
export declare const MOVEMENT_KIND_LABELS: Record<MovementKind, string>;
/**
 * Weighted average unit cost after a stock-in: what is already on the shelf and what
 * just came in both count for their quantity. Stock with no known cost does not drag
 * the average down, so the delivery's cost applies alone.
 */
export declare function averageUnitCost(currentQty: number, currentCost: number, addedQty: number, addedUnitCost: number): number;
