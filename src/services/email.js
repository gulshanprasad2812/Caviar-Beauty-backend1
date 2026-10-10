import nodemailer from 'nodemailer';
import { forgotPasswordTemplate, verifyEmailTemplate, welcomeTemplate, orderConfirmationTemplate, orderShippedTemplate, orderDeliveredTemplate, refundTemplate } from '../templates/email.js';

let transporter = null;
const isPlaceholder = (v) => !v || v === 'your-email@gmail.com' || v === 'your-password' || v === 'smtp.gmail.com';

function getTransport() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    && !isPlaceholder(process.env.SMTP_HOST) && !isPlaceholder(process.env.SMTP_USER) && !isPlaceholder(process.env.SMTP_PASS)) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const isEmailConfigured = () => !!getTransport();

// Simple in-memory retry queue with exponential backoff.
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 5000;
const queue = new Map(); // key -> { attempts, mail, resolve }

function scheduleRetry(key, mail, attempts, resolve, reject) {
  const delay = RETRY_BASE_MS * 2 ** (attempts - 1);
  const timer = setTimeout(async () => {
    try {
      await getTransport().sendMail(mail);
      resolve();
    } catch (err) {
      if (attempts >= MAX_RETRIES) {
        reject(err);
        console.error(`[EMAIL] Giving up after ${MAX_RETRIES} attempts: ${mail.to} (${err.message})`);
      } else {
        console.warn(`[EMAIL] Retry ${attempts}/${MAX_RETRIES} for ${mail.to}: ${err.message}`);
        scheduleRetry(key, mail, attempts + 1, resolve, reject);
      }
    }
  }, delay);
  queue.set(key, timer);
}

async function sendMail(mail) {
  const t = getTransport();
  if (!t) {
    const codeMatch = mail.html && mail.html.match(/>\s*(\d{6})\s*</);
    console.log(`[EMAIL MOCK] To: ${mail.to} | Subject: ${mail.subject}${codeMatch ? ` | OTP: ${codeMatch[1]}` : ''}`);
    return;
  }
  const key = `${mail.to}:${mail.subject}:${Date.now()}`;
  try {
    await t.sendMail(mail);
  } catch (err) {
    console.warn(`[EMAIL] Initial send failed for ${mail.to}: ${err.message}`);
    await new Promise((resolve, reject) => scheduleRetry(key, mail, 1, resolve, reject));
  } finally {
    const timer = queue.get(key);
    if (timer) { clearTimeout(timer); queue.delete(key); }
  }
}

export function sendForgotPasswordOTP(email, otp, firstName) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: 'Reset your Caviar Beauty password', html: forgotPasswordTemplate(otp, firstName) });
}

export function sendVerificationOTP(email, otp, firstName) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: 'Verify your Caviar Beauty email', html: verifyEmailTemplate(otp, firstName) });
}

export function sendWelcomeEmail(email, firstName) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: 'Welcome to Caviar Beauty', html: welcomeTemplate(firstName) });
}

export function sendOrderConfirmationEmail(email, firstName, order) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: `Order ${order.orderNumber} confirmed`, html: orderConfirmationTemplate(order, firstName) });
}

export function sendOrderShippedEmail(email, firstName, order, shipment) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: `Order ${order.orderNumber} shipped`, html: orderShippedTemplate(order, firstName, shipment) });
}

export function sendOrderDeliveredEmail(email, firstName, order) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: `Order ${order.orderNumber} delivered`, html: orderDeliveredTemplate(order, firstName) });
}

export function sendRefundEmail(email, firstName, order, refund) {
  return sendMail({ from: `"Caviar Beauty" <${process.env.SMTP_USER}>`, to: email, subject: `Refund issued for ${order.orderNumber}`, html: refundTemplate(order, refund, firstName) });
}

export { isEmailConfigured };
