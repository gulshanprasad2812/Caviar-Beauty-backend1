import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(amount) || 0);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export const invoiceTemplate = (order, address) => {
  const itemsHtml = order.items.map((item) => {
    const lineTotal = Number(item.price) * item.quantity;
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.price)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(lineTotal)}</td>
      </tr>`;
  }).join('');

  const addressHtml = address
    ? `${escapeHtml(address.firstName)} ${escapeHtml(address.lastName)}<br/>${escapeHtml(address.street)}<br/>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.zipCode)}<br/>${escapeHtml(address.country)}${address.phone ? `<br/>Phone: ${escapeHtml(address.phone)}` : ''}`
    : 'N/A';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(order.orderNumber)}</title>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { font-size: 22px; letter-spacing: 2px; }
    .meta { color: #666; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; padding: 10px; border-bottom: 2px solid #1a1a1a; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .totals { margin-top: 20px; margin-left: auto; width: 260px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .totals .grand { font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px; font-size: 15px; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:16px;">
      <div>
        <h1>CAVIAR BEAUTY</h1>
        <p class="meta">Luxury Fashion &amp; Accessories</p>
      </div>
      <div class="meta" style="text-align:right;">
        <strong>INVOICE</strong><br/>
        ${escapeHtml(order.orderNumber)}<br/>
        ${new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="width:80px;">Qty</th>
          <th style="width:120px;text-align:right;">Price</th>
          <th style="width:120px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
      <div><span>Shipping</span><span>${formatCurrency(order.shippingCost)}</span></div>
      <div><span>Tax (GST)</span><span>${formatCurrency(order.tax)}</span></div>
      ${order.discount > 0 ? `<div><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}</span><span>-${formatCurrency(order.discount)}</span></div>` : ''}
      <div class="grand"><span>TOTAL</span><span>${formatCurrency(order.total)}</span></div>
    </div>

    <div style="margin-top:32px;font-size:12px;">
      <strong style="text-transform:uppercase;letter-spacing:1px;">Billed To</strong><br/><br/>
      ${addressHtml}
    </div>

    ${order.paymentStatus === 'COMPLETED' ? '<p style="margin-top:24px;font-size:12px;color:#2e7d32;"><strong>PAID</strong> &mdash; This order has been paid in full.</p>' : `<p style="margin-top:24px;font-size:12px;color:#b26a00;"><strong>Payment Status: ${escapeHtml(order.paymentStatus)}</strong></p>`}

    <div class="footer">
      Caviar Beauty &bull; GSTIN: 27ABCDE1234F1Z5 &bull; support@caviarbeauty.com &bull; This is a computer-generated invoice.
    </div>
  </div>
</body>
</html>`;
};

export const downloadInvoice = async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, addresses: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') throw new AppError(403, 'Access denied');

    const address = order.addresses?.find((a) => a.orderId === order.id && a.type === 'BILLING') || order.addresses?.find((a) => a.orderId === order.id) || (await prisma.address.findFirst({ where: { id: order.shippingAddressId || order.billingAddressId } }));

    const html = invoiceTemplate(order, address);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.html"`);
    res.send(html);
  } catch (err) { next(err); }
};
