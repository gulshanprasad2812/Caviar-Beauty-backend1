const baseStyle = `
<style>
  body { margin:0; padding:0; background:#f5f5f0; font-family:Georgia,'Times New Roman',serif; }
  .container { max-width:520px; margin:40px auto; background:#fff; }
  .header { background:#1a1a1a; padding:32px; text-align:center; }
  .header h1 { color:#d4af37; margin:0; font-size:24px; letter-spacing:4px; text-transform:uppercase; }
  .body { padding:40px 32px; color:#333; }
  .body h2 { font-size:20px; margin:0 0 16px; font-weight:400; }
  .body p { font-size:14px; line-height:1.7; color:#666; margin:0 0 16px; }
  .otp { background:#f5f5f0; text-align:center; padding:20px; margin:24px 0; border:1px solid #e0e0e0; }
  .otp span { font-size:32px; letter-spacing:8px; color:#1a1a1a; font-weight:700; font-family:monospace; }
  .footer { text-align:center; padding:24px 32px; border-top:1px solid #e0e0e0; font-size:11px; color:#999; }
  .btn { display:inline-block; padding:12px 32px; background:#1a1a1a; color:#fff!important; text-decoration:none; font-size:12px; letter-spacing:2px; text-transform:uppercase; }
</style>`;

export function forgotPasswordTemplate(otp, firstName) {
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Reset your password</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>We received a request to reset your Caviar Beauty account password. Enter this code to proceed:</p>
    <div class="otp"><span>${otp}</span></div>
    <p>This code expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

export function verifyEmailTemplate(otp, firstName) {
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Verify your email</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>Welcome to Caviar Beauty. Use this code to verify your email address:</p>
    <div class="otp"><span>${otp}</span></div>
    <p>This code expires in <strong>15 minutes</strong>.</p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

export function welcomeTemplate(firstName) {
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Welcome, ${firstName || 'Valued Customer'}</h2>
    <p>We're delighted to have you as part of the Caviar Beauty family. Explore our exclusive collection of handcrafted luxury pieces — each designed to celebrate your individuality.</p>
    <p style="text-align:center;margin:32px 0"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/products" class="btn">Explore Collection</a></p>
    <p style="font-size:12px;color:#999;">If you have any questions, simply reply to this email.</p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

function money(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
  } catch {
    return `₹${Math.round(Number(amount) || 0)}`;
  }
}

export function orderConfirmationTemplate(order, firstName) {
  const items = (order.items || []).map((i) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;">${i.name} × ${i.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;text-align:right;">${money(i.price * i.quantity)}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Order Confirmed</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>Thank you for your purchase. Your order <strong>${order.orderNumber}</strong> has been confirmed.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${items}
      <tr>
        <td style="padding:10px 8px;font-size:13px;color:#666;">Subtotal</td>
        <td style="padding:10px 8px;font-size:13px;color:#666;text-align:right;">${money(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;font-size:13px;color:#666;">Shipping</td>
        <td style="padding:10px 8px;font-size:13px;color:#666;text-align:right;">${money(order.shippingCost)}</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;font-size:13px;color:#666;">Tax</td>
        <td style="padding:10px 8px;font-size:13px;color:#666;text-align:right;">${money(order.tax)}</td>
      </tr>
      <tr>
        <td style="padding:10px 8px;font-size:14px;font-weight:700;color:#1a1a1a;">Total</td>
        <td style="padding:10px 8px;font-size:14px;font-weight:700;color:#1a1a1a;text-align:right;">${money(order.total)}</td>
      </tr>
    </table>
    <p style="text-align:center;margin:24px 0"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/${order.id}" class="btn">Track Order</a></p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

export function orderShippedTemplate(order, firstName, shipment) {
  const trackingNumber = shipment?.trackingNumber || order.trackingNumber;
  const carrier = shipment?.carrier;
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Your order is on the way</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>Good news — your order <strong>${order.orderNumber}</strong> has been shipped.</p>
    ${carrier ? `<p>Carrier: <strong>${carrier}</strong></p>` : ''}
    ${trackingNumber ? `<p>Tracking number: <strong>${trackingNumber}</strong></p>` : ''}
    ${shipment?.trackingUrl ? `<p><a href="${shipment.trackingUrl}" class="btn">Track Package</a></p>` : ''}
    ${order.estimatedDelivery ? `<p>Estimated delivery: <strong>${new Date(order.estimatedDelivery).toLocaleDateString()}</strong></p>` : ''}
    <p style="text-align:center;margin:24px 0"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/${order.id}" class="btn">View Order</a></p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

export function orderDeliveredTemplate(order, firstName) {
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Your order has arrived</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>Your order <strong>${order.orderNumber}</strong> has been delivered. We hope you love it.</p>
    <p>Enjoyed your purchase? We'd love to hear from you — leave a review and share your Caviar Beauty moment.</p>
    <p style="text-align:center;margin:24px 0"><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/${order.id}" class="btn">View Order</a></p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}

export function refundTemplate(order, refund, firstName) {
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>
<div class="container">
  <div class="header"><h1>Caviar Beauty</h1></div>
  <div class="body">
    <h2>Refund ${refund.status === 'PROCESSED' ? 'issued' : 'initiated'}</h2>
    <p>Hello ${firstName || 'there'},</p>
    <p>Your refund for order <strong>${order.orderNumber}</strong> has been ${refund.status === 'PROCESSED' ? 'processed' : 'initiated'}.</p>
    <div class="otp"><span>${money(refund.amount)}</span></div>
    <p>Refund ID: <strong>${refund.razorpayRefundId || '—'}</strong></p>
    <p>Amounts usually reflect in your account within <strong>3-7 business days</strong> depending on your bank.</p>
  </div>
  <div class="footer"><p>Caviar Beauty — Luxury Redefined</p></div>
</div></body></html>`;
}
