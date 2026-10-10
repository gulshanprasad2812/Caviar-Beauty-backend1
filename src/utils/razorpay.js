import Razorpay from 'razorpay';
import crypto from 'crypto';

const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'placeholder';

export const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

export const isRazorpayConfigured = () => keyId !== 'rzp_test_placeholder' && keySecret !== 'placeholder';

export const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, signature }) => {
  const expected = crypto.createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
  return expected === signature;
};

export const verifyWebhookSignature = (body, signature) => {
  try {
    return Razorpay.validateWebhookSignature(body, signature, keySecret);
  } catch {
    return false;
  }
};

export const createRefund = async ({ paymentId, amount, notes }) => {
  return razorpay.payments.refund(paymentId, {
    amount: Math.round(amount * 100),
    speed: 'normal',
    notes,
  });
};
