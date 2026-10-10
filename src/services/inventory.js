import { prisma } from '../db.js';

/**
 * Atomic stock reservation for an order. Checks available stock (quantity - reservedQuantity)
 * and increments reservedQuantity within a transaction. Throws on insufficient stock.
 */
export async function reserveStock(tx, orderId, items) {
  const insufficient = [];

  for (const item of items) {
    if (item.variantId) {
      const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant || variant.stock < item.quantity) {
        insufficient.push(item.name);
        continue;
      }
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
    if (!inventory || inventory.quantity - inventory.reservedQuantity < item.quantity) {
      insufficient.push(item.name);
      continue;
    }
    await tx.inventory.update({
      where: { productId: item.productId },
      data: { reservedQuantity: { increment: item.quantity } },
    });
    await tx.inventoryTransaction.create({
      data: {
        inventoryId: inventory.id,
        productId: item.productId,
        orderId,
        type: 'RESERVE',
        quantity: item.quantity,
        note: 'Stock reserved for order',
      },
    });
  }

  if (insufficient.length) {
    throw new Error(`INSUFFICIENT_STOCK:${insufficient.join(',')}`);
  }
}

/**
 * Converts a reservation into a fulfilled sale once payment is captured.
 * Decrements real quantity and clears the reservation.
 */
export async function fulfillStock(tx, orderId, items) {
  const quantities = new Map();
  for (const item of items) {
    if (!item.productId) continue;
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  for (const [productId, quantity] of quantities) {
    const existing = await tx.inventoryTransaction.findFirst({
      where: { orderId, productId, type: 'SALE' },
    });
    if (existing) continue;
    const inventory = await tx.inventory.findUnique({ where: { productId } });
    if (inventory) {
      await tx.inventory.update({
        where: { productId },
        data: {
          quantity: { decrement: quantity },
          reservedQuantity: { decrement: Math.min(quantity, inventory.reservedQuantity) },
        },
      });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId: inventory.id,
          productId,
          orderId,
          type: 'SALE',
          quantity,
          note: 'Payment captured, stock sold',
        },
      });
    }
  }
}

/**
 * Releases a reservation (order cancelled / payment failed / refunded).
 * Restores variant + inventory stock and clears the reservation.
 */
export async function releaseStock(tx, orderId, items) {
  const byProduct = new Map();
  for (const item of items) {
    if (!item.productId) continue;
    const grouped = byProduct.get(item.productId) || { quantity: 0, orderPaid: false, items: [] };
    grouped.quantity += item.quantity;
    grouped.orderPaid ||= item.orderPaid === true;
    grouped.items.push(item);
    byProduct.set(item.productId, grouped);
  }

  for (const [productId, { quantity, orderPaid, items: productItems }] of byProduct) {
    const existing = await tx.inventoryTransaction.findFirst({
      where: { orderId, productId, type: { in: ['RELEASE', 'RETURN_SALE'] } },
    });
    if (existing) continue;

    for (const item of productItems) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        }).catch(() => {});
      }
    }

    const inventory = await tx.inventory.findUnique({ where: { productId } });
    if (inventory) {
      await tx.inventory.update({
        where: { productId },
        data: {
          quantity: { increment: orderPaid ? quantity : 0 },
          reservedQuantity: { decrement: Math.min(quantity, inventory.reservedQuantity) },
        },
      });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId: inventory.id,
          productId,
          orderId,
          type: orderPaid ? 'RETURN_SALE' : 'RELEASE',
          quantity,
          note: orderPaid ? 'Stock restored from returned/cancelled paid order' : 'Reservation released',
        },
      });
    }
  }
}

/**
 * Public available-stock calculation (for listings/detail).
 */
export function availableStock(inventory) {
  if (!inventory) return 0;
  return Math.max(0, inventory.quantity - inventory.reservedQuantity);
}
