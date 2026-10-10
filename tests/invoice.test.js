import { describe, it, expect } from 'vitest';
import { invoiceTemplate } from '../src/controllers/invoice.js';

const order = {
  orderNumber: 'CB-TEST-0001',
  createdAt: new Date('2026-08-13T10:00:00Z'),
  subtotal: 5000,
  shippingCost: 0,
  tax: 900,
  discount: 250,
  couponCode: 'SAVE250',
  total: 5650,
  paymentStatus: 'COMPLETED',
  items: [
    { name: 'Leather Crossbody Bag', price: 4500, quantity: 1 },
    { name: 'Silk Scarf', price: 500.5, quantity: 1 },
  ],
};

const address = {
  firstName: 'Alia',
  lastName: 'Kapoor',
  street: '12 MG Road',
  city: 'Mumbai',
  state: 'MH',
  zipCode: '400001',
  country: 'India',
  phone: '9876543210',
};

describe('invoiceTemplate', () => {
  it('renders valid HTML with order metadata and totals', () => {
    const html = invoiceTemplate(order, address);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('CAVIAR BEAUTY');
    expect(html).toContain('CB-TEST-0001');
    expect(html).toContain('Alia Kapoor');
    expect(html).toContain('₹5,650');
  });

  it('includes line items and computed line totals', () => {
    const html = invoiceTemplate(order, address);
    expect(html).toContain('Leather Crossbody Bag');
    expect(html).toContain('₹4,500');
    expect(html).toContain('₹501'); // 500.5 rounded via INR format
  });

  it('shows discount row only when discount > 0', () => {
    const html = invoiceTemplate(order, address);
    expect(html).toContain('SAVE250');
    const noDiscount = invoiceTemplate({ ...order, discount: 0, couponCode: null, total: 5900 }, address);
    expect(noDiscount).not.toContain('SAVE250');
  });

  it('flags uncompleted payment status', () => {
    const html = invoiceTemplate({ ...order, paymentStatus: 'PENDING' }, address);
    expect(html).toContain('Payment Status: PENDING');
  });

  it('escapes user-controlled invoice content', () => {
    const html = invoiceTemplate({
      ...order,
      orderNumber: '<script>alert(1)</script>',
      items: [{ ...order.items[0], name: '<img src=x onerror=alert(1)>' }],
    }, { ...address, street: '<script>alert(2)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
