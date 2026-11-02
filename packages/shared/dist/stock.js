"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOVEMENT_KIND_LABELS = exports.MOVEMENT_KINDS = void 0;
exports.averageUnitCost = averageUnitCost;
/** Why stock moved. "sale" and "initial" are only written by the server. */
exports.MOVEMENT_KINDS = ['purchase', 'initial', 'sale', 'return', 'loss', 'inventory', 'other'];
exports.MOVEMENT_KIND_LABELS = {
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
function averageUnitCost(currentQty, currentCost, addedQty, addedUnitCost) {
    const onHand = Math.max(0, currentQty);
    if (onHand === 0 || currentCost <= 0)
        return addedUnitCost;
    return (onHand * currentCost + addedQty * addedUnitCost) / (onHand + addedQty);
}
