/**
 * End-to-end Paytm payment verification test.
 *
 * Exercises the real server flow:
 *   order (PENDING, stock reserved) -> Payment row (Paytm order id)
 *   -> POST /api/payments/verify -> Paytm Transaction Status API (mocked)
 *   -> order CONFIRMED, stock fulfilled.
 *
 * It needs a database and only runs when explicitly enabled:
 *   PAYMENT_E2E=1 npx vitest run tests/payments.e2e.test.js
 *
 * No network call reaches Paytm: global fetch is stubbed with a correctly
 * signed Transaction Status response, so the real signature/verification code
 * path still executes.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import PaytmChecksum from 'paytmchecksum';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { generateToken } from '../src/utils/helpers.js';

const ENABLED = process.env.PAYMENT_E2E === '1';
const MID = 'E2EMID1234567890';
const MERCHANT_KEY = 'e2e-key-12345678';
const EMAIL = 'e2e-payment@test.com';

const suffix = () => crypto.randomUUID();

let token = '';
let userId = '';
let productId = '';
let variantId = '';

let nextStatus = 'TXN_SUCCESS';
let nextOrderId = null;
let nextTxnAmount = '0.00';
let lastRequestBody = null;

const cleanup = async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    const orders = await prisma.order.findMany({ where: { userId: user.id }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.cartItem.deleteMany({ where: { userId: user.id } });
    await prisma.address.deleteMany({ where: { userId: user.id } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  const product = await prisma.product.findFirst({ where: { slug: 'e2e-payment-product' }, select: { id: true } });
  if (product) {
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.inventory.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
  await prisma.category.deleteMany({ where: { slug: 'e2e-category' } });
  await prisma.brand.deleteMany({ where: { slug: 'e2e-brand' } });
};

/**
 * Removes the orders created by one test and restores the shared product
 * fixture, so stock assertions do not depend on test order.
 */
const resetOrderFixtures = async () => {
  if (!userId) return;
  const orders = await prisma.order.findMany({ where: { userId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.cartItem.deleteMany({ where: { userId } });
  await prisma.address.deleteMany({ where: { userId } });
  await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 10 } });
  await prisma.inventory.update({ where: { productId }, data: { quantity: 10, reservedQuantity: 0 } });
};

/** Stubs the Paytm Transaction Status API with a checksum-signed response. */
const stubPaytmStatus = () => {
  vi.stubGlobal('fetch', async (_url, init) => {
    const parsed = JSON.parse(init.body);
    lastRequestBody = parsed.body;
    const responseBody = {
      resultInfo: {
        resultStatus: nextStatus,
        resultCode: nextStatus === 'TXN_SUCCESS' ? '01' : '227',
        resultMsg: nextStatus === 'TXN_SUCCESS' ? 'Txn Success' : 'Payment declined',
      },
      orderId: nextOrderId || parsed.body.orderId,
      txnId: 'PAYTM_TXN_E2E_0001',
      txnAmount: nextTxnAmount,
      paymentMode: 'UPI',
      bankTxnId: 'BANK_E2E_1',
      txnDate: '2026-01-01 00:00:00.0',
    };
    const signature = await PaytmChecksum.generateSignature(JSON.stringify(responseBody), MERCHANT_KEY);
    return new Response(JSON.stringify({ head: { signature }, body: responseBody }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};

describe.skipIf(!ENABLED)('Paytm payment verification end to end', () => {
  beforeAll(async () => {
    process.env.PAYTM_MID = MID;
    process.env.PAYTM_MERCHANT_KEY = MERCHANT_KEY;
    process.env.PAYTM_ENV = 'staging';
    process.env.PAYTM_WEBSITE_NAME = '';

    await cleanup();

    const brand = await prisma.brand.create({ data: { name: 'E2E Brand', slug: 'e2e-brand' } });
    const category = await prisma.category.create({ data: { name: 'E2E Category', slug: 'e2e-category' } });
    const product = await prisma.product.create({
      data: {
        name: 'E2E Payment Product',
        slug: 'e2e-payment-product',
        description: 'Payment verification fixture',
        brandId: brand.id,
        categoryId: category.id,
        basePrice: 1000,
        currency: 'INR',
        isActive: true,
        images: { create: { url: '/images/e2e.svg', isPrimary: true, sortOrder: 0 } },
        variants: { create: { color: 'Black', size: 'M', stock: 10, sku: 'E2E-BLACK-M' } },
        inventory: { create: { quantity: 10, reservedQuantity: 0 } },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;

    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: await bcrypt.hash('E2ePass123!', 10),
        firstName: 'E2E',
        lastName: 'Payer',
        isVerified: true,
      },
    });
    token = generateToken(user.id, user.email, user.role);
    userId = user.id;
  });

  afterEach(async () => {
    nextStatus = 'TXN_SUCCESS';
    nextOrderId = null;
    nextTxnAmount = '0.00';
    lastRequestBody = null;
    vi.unstubAllGlobals();
    await resetOrderFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const placeOrder = async () => {
    const address = await request(app).post('/api/addresses').set(auth()).send({
      type: 'SHIPPING',
      firstName: 'E2E',
      lastName: 'Payer',
      street: '1 Test Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      phone: '9876543210',
    });
    expect(address.status).toBeLessThan(300);

    await prisma.cartItem.deleteMany({ where: { userId } });
    await request(app).post('/api/cart').set(auth()).send({ productId, variantId, quantity: 2 }).expect(201);

    const order = await request(app).post('/api/orders').set(auth()).send({
      shippingAddressId: address.body.id,
      paymentMethod: 'Paytm',
      idempotencyKey: suffix(),
    });
    expect(order.status).toBe(201);
    return order.body;
  };

  /** Simulates POST /api/payments/create-order having stored the Paytm order id. */
  const simulatePaytmOrder = (order) =>
    prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'Paytm',
        transactionId: order.orderNumber,
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
      },
    });

  it('confirms the order and fulfils stock when Paytm reports TXN_SUCCESS', async () => {
    const order = await placeOrder();
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('PENDING');

    const reserved = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(reserved.stock).toBe(8);
    const reservedInventory = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
    expect(reservedInventory.quantity).toBe(10);
    expect(reservedInventory.reservedQuantity).toBe(2);

    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextTxnAmount = Number(order.total).toFixed(2);

    const verify = await request(app).post('/api/payments/verify').set(auth()).send({ orderId: order.id });
    expect(verify.status).toBe(200);
    expect(lastRequestBody).toMatchObject({ mid: MID, orderId: order.orderNumber });

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('CONFIRMED');
    expect(paid.paymentStatus).toBe('COMPLETED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('COMPLETED');
    expect(payment.transactionId).toBe(order.orderNumber);
    expect(JSON.parse(payment.gatewayResponse).txnId).toBe('PAYTM_TXN_E2E_0001');

    const sold = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(sold.stock).toBe(8);
    const soldInventory = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
    expect(soldInventory.quantity).toBe(8);
    expect(soldInventory.reservedQuantity).toBe(0);

    // A repeated verify is idempotent and does not double-fulfil stock.
    const again = await request(app).post('/api/payments/verify').set(auth()).send({ orderId: order.id });
    expect(again.status).toBe(200);
    expect(again.body.alreadyPaid).toBe(true);
    const afterSecondCall = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
    expect(afterSecondCall.quantity).toBe(8);
  });

  it('cancels the order and releases stock when Paytm reports TXN_FAILURE', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextStatus = 'TXN_FAILURE';
    nextTxnAmount = Number(order.total).toFixed(2);

    const verify = await request(app).post('/api/payments/verify').set(auth()).send({ orderId: order.id });
    expect(verify.status).toBe(400);

    const failed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(failed.paymentStatus).toBe('FAILED');
    expect(failed.status).toBe('CANCELLED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('FAILED');

    const restored = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(restored.stock).toBe(10);
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
    expect(inventory.quantity).toBe(10);
    expect(inventory.reservedQuantity).toBe(0);
  });

  it('rejects a status response for a different Paytm order id', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextOrderId = 'SOMEONE_ELSE_ORDER';
    nextTxnAmount = Number(order.total).toFixed(2);

    const verify = await request(app).post('/api/payments/verify').set(auth()).send({ orderId: order.id });
    expect(verify.status).toBe(400);

    const untouched = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.paymentStatus).toBe('PENDING');
    expect(untouched.status).toBe('PENDING');
  });

  it('refuses to verify when the paid amount does not match the order total', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextTxnAmount = '1.00';

    const verify = await request(app).post('/api/payments/verify').set(auth()).send({ orderId: order.id });
    expect(verify.status).toBe(400);

    const untouched = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.paymentStatus).toBe('PENDING');
  });

  it('accepts the Paytm browser callback, verifies it server-side and redirects', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextTxnAmount = Number(order.total).toFixed(2);

    const params = {
      ORDERID: order.orderNumber,
      MID,
      TXNID: 'PAYTM_TXN_E2E_0001',
      TXNAMOUNT: Number(order.total).toFixed(2),
      STATUS: 'TXN_SUCCESS',
      RESPCODE: '01',
      RESPMSG: 'Txn Success',
    };
    const checksum = await PaytmChecksum.generateSignature(params, MERCHANT_KEY);

    const res = await request(app)
      .post('/api/payments/callback')
      .type('form')
      .send({ ...params, CHECKSUMHASH: checksum });

    expect(res.status).toBe(303);
    expect(res.headers.location).toContain(`/orders/${order.id}?payment=success`);

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('CONFIRMED');
    expect(paid.paymentStatus).toBe('COMPLETED');
  });

  it('rejects a callback with an invalid checksum', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);

    const res = await request(app).post('/api/payments/callback').type('form').send({
      ORDERID: order.orderNumber,
      STATUS: 'TXN_SUCCESS',
      CHECKSUMHASH: 'not-a-real-checksum',
    });

    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('payment=invalid');

    const untouched = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.paymentStatus).toBe('PENDING');
  });

  it('rejects a webhook with an invalid signature', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/paytm')
      .send({ head: { signature: 'invalid' }, body: { orderId: 'X' } });
    expect(res.status).toBe(400);
  });

  it('confirms through a correctly signed webhook body', async () => {
    const order = await placeOrder();
    await simulatePaytmOrder(order);
    stubPaytmStatus();
    nextTxnAmount = Number(order.total).toFixed(2);

    const body = {
      mid: MID,
      orderId: order.orderNumber,
      txnId: 'PAYTM_TXN_E2E_0001',
      txnAmount: Number(order.total).toFixed(2),
      resultInfo: { resultStatus: 'TXN_SUCCESS', resultCode: '01', resultMsg: 'Txn Success' },
    };
    const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), MERCHANT_KEY);

    const res = await request(app)
      .post('/api/payments/webhook/paytm')
      .send({ head: { signature }, body });
    expect(res.status).toBe(200);

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('CONFIRMED');
    expect(paid.paymentStatus).toBe('COMPLETED');
  });
});