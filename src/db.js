import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const base = globalForPrisma.prisma ?? new PrismaClient();

if (!globalForPrisma.prisma) globalForPrisma.prisma = base;

/**
 * Interactive transactions talk to a remote database (Supabase pooler), where a
 * single round trip routinely takes hundreds of milliseconds. Prisma's default
 * 5 second transaction budget is therefore too small: order creation and payment
 * verification were failing with P2028 ("Transaction already closed") on the
 * deployed database. These options give every interactive transaction room to
 * finish while still bounding it.
 */
const DEFAULT_TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 30000 };

export const prisma = new Proxy(base, {
  get(target, property, receiver) {
    if (property === '$transaction') {
      return (arg, options) => {
        if (typeof arg === 'function') {
          return target.$transaction(arg, { ...DEFAULT_TRANSACTION_OPTIONS, ...(options || {}) });
        }
        return target.$transaction(arg);
      };
    }
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export default prisma;
