import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { averageUnitCost } from '@kza/shared';

type Db = Prisma.TransactionClient;

/**
 * Units promised but still on the shelf: pending sales. Computed on read, so a
 * reservation disappears with its sale. Logistics orders never hold stock: they are
 * checked against the stock when delivered, and only then take it.
 */
export async function reservedByProduct(
  db: Db,
  product: Prisma.ProductWhereInput,
  excludeSaleId?: string,
): Promise<Map<string, number>> {
  const sales = await db.saleItem.groupBy({
    by: ['productId'],
    where: {
      product,
      sale: { status: 'pending', ...(excludeSaleId ? { id: { not: excludeSaleId } } : {}) },
    },
    _sum: { quantity: true },
  });
  const reserved = new Map<string, number>();
  for (const row of sales) {
    if (!row.productId) continue;
    reserved.set(row.productId, (reserved.get(row.productId) ?? 0) + Number(row._sum.quantity ?? 0));
  }
  return reserved;
}

/** Holds these products until the transaction ends, so two sales cannot take the same units. */
export async function lockProducts(db: Db, productIds: string[]) {
  if (productIds.length === 0) return [];
  // Always in the same order, so two transactions cannot wait on each other.
  await db.$queryRaw`SELECT id FROM products WHERE id = ANY(${productIds}::uuid[]) ORDER BY id FOR UPDATE`;
  return db.product.findMany({ where: { id: { in: productIds } } });
}

/**
 * Refuses lines that need more than the stock available: stock never goes negative.
 * Products without stock tracking are never limited. countReservations is off for what
 * physically left the shop: a broken item is gone, whoever it was promised to.
 */
export async function assertStockAvailable(
  db: Db,
  lines: { productId: string | null; quantity: number }[],
  options: {
    excludeSaleId?: string;
    countReservations?: boolean;
    /** A customer ordering online: the message is for them. */
    storefront?: boolean;
  } = {},
) {
  const needed = new Map<string, number>();
  for (const l of lines) if (l.productId) needed.set(l.productId, (needed.get(l.productId) ?? 0) + Number(l.quantity));
  if (needed.size === 0) return;

  const ids = [...needed.keys()];
  const products = await db.product.findMany({
    where: { id: { in: ids }, trackStock: true },
    select: { id: true, name: true, quantity: true },
  });
  const reserved = options.countReservations === false
    ? new Map<string, number>()
    : await reservedByProduct(db, { id: { in: ids } }, options.excludeSaleId);

  for (const p of products) {
    const held = reserved.get(p.id) ?? 0;
    const available = p.quantity - held;
    if ((needed.get(p.id) ?? 0) > available + 0.0001) {
      if (options.storefront) {
        throw new BadRequestException(`"${p.name}" n'est plus disponible dans la quantité demandée.`);
      }
      throw new BadRequestException(
        `Stock insuffisant pour "${p.name}" : ${Math.max(0, available)} disponible(s)`
        + `${held > 0 ? ` (${held} réservé(s))` : ''}. Faites d'abord une entrée de stock.`,
      );
    }
  }
}

/** Puts units back at the cost they left at, which is then averaged with what is on hand. */
export async function restock(db: Db, productId: string, quantity: number, unitCost: number | null) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { quantity: true, acquisitionCost: true, trackStock: true },
  });
  if (!product) return;
  await db.product.update({
    where: { id: productId },
    data: {
      quantity: { increment: quantity },
      ...(product.trackStock && unitCost
        ? { acquisitionCost: averageUnitCost(product.quantity, product.acquisitionCost, quantity, unitCost) }
        : {}),
    },
  });
}
