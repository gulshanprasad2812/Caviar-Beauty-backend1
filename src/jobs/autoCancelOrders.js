import { prisma } from '../db.js';
import { releaseStock } from '../services/inventory.js';

const STALE_MINUTES = parseInt(process.env.ORDER_EXPIRY_MINUTES || '15', 10);
const CHECK_INTERVAL_MS = parseInt(process.env.AUTO_CANCEL_INTERVAL_MS || '300000', 10);
let timer = null;

export async function runAutoCancel() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60000);
  const orders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: { in: ['PENDING', 'FAILED'] },
      createdAt: { lt: cutoff },
    },
    include: { items: true },
  });

  for (const order of orders) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
      if (!fresh || fresh.status !== 'PENDING' || !['PENDING', 'FAILED'].includes(fresh.paymentStatus)) return;
      const items = fresh.items.map((i) => ({ ...i, orderPaid: false }));
      await releaseStock(tx, fresh.id, items);
      await tx.order.update({
        where: { id: fresh.id },
        data: { status: 'CANCELLED', notes: fresh.notes ? `${fresh.notes} | Auto-cancelled: unpaid order expired` : 'Auto-cancelled: unpaid order expired' },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: fresh.id, status: 'CANCELLED', note: 'Auto-cancelled: unpaid order expired' },
      });
    });
  }

  if (orders.length) {
    console.log(`[auto-cancel] cancelled ${orders.length} stale unpaid order(s)`);
  }
}

export function startAutoCancelJob() {
  if (timer) return;
  timer = setInterval(() => {
    runAutoCancel().catch((err) => console.error('[auto-cancel] error:', err.message));
  }, CHECK_INTERVAL_MS);
  runAutoCancel().catch((err) => console.error('[auto-cancel] initial error:', err.message));
}

export function stopAutoCancelJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}