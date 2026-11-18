import nodemailer from 'nodemailer';
import { forgotPasswordTemplate, verifyEmailTemplate, welcomeTemplate, orderConfirmationTemplate, orderShippedTemplate, orderDeliveredTemplate, refundTemplate, contactNotificationTemplate, orderShopNotificationTemplate } from '../templates/email.js';
import { maskEmail } from '../utils/otp.js';

let transporter = null;

// Values shipped in .env.example that must not be treated as real credentials.
// NOTE: 'smtp.gmail.com' used to be listed here, which meant the documented
// default host could never produce a transport - every email (including email
// verification OTPs) was mock-logged even with valid SMTP_USER / SMTP_PASS.
const PLACEHOLDER_VALUES = new Set([
  'your-email@gmail.com',
  'your-password',
  'your-app-password',
  'your-email@example.com',
]);

const isPlaceholder = (value) => !value || PLACEHOLDER_VALUES.has(String(value).trim());

export const getEmailConfig = () => {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.MAIL_FROM || '').trim() || user;
  const missing = [];
  if (isPlaceholder(host)) missing.push('SMTP_HOST');
  if (isPlaceholder(user)) missing.push('SMTP_USER');
  if (isPlaceholder(pass)) missing.push('SMTP_PASS');
  return {
    provider: 'smtp',
    configured: missing.length === 0,
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: (process.env.SMTP_PORT || '587') === '465',
    user,
    from,
    missing,
  };
};

function getTransport() {
  if (transporter) return transporter;
  const config = getEmailConfig();
  if (!config.configured) return null;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: (process.env.SMTP_PASS || '').trim() },
  });
  return transporter;
}

const isEmailConfigured = () => !!getTransport();

const fromAddress = () => {
  const config = getEmailConfig();
  return `"Caviar Beauty" <${config.from || 'no-reply@caviarbeauty.com'}>`;
};

// Background retry queue with exponential backoff. A send is attempted once
// synchronously (so the caller can report success/failure immediately); failed
// sends are then retried in the background without blocking the HTTP response.
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryInBackground(mail, attempt) {
  try {
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    const transport = getTransport();
    if (!transport) return;
    await transport.sendMail(mail);
    console.log(`[EMAIL] Retry ${attempt} succeeded for ${maskEmail(mail.to)}`);
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      console.error(`[EMAIL] Giving up after ${MAX_RETRIES} attempts for ${maskEmail(mail.to)}: ${err.message}`);
    } else {
      console.warn(`[EMAIL] Retry ${attempt}/${MAX_RETRIES} for ${maskEmail(mail.to)}: ${err.message}`);
      retryInBackground(mail, attempt + 1).catch(() => {});
    }
  }
}

/**
 * Sends a message. Resolves with a delivery result instead of throwing, so a
 * failed OTP email is reported to the user rather than swallowed silently.
 */
async function sendMail(mail) {
  const transport = getTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      const codeMatch = mail.html && mail.html.match(/<span>\s*(\d{6})\s*<\/span>/);
      console.log(`[EMAIL MOCK] To: ${maskEmail(mail.to)} | Subject: ${mail.subject}${codeMatch ? ` | OTP: ${codeMatch[1]}` : ''}`);
    } else {
      console.warn(`[EMAIL] Not configured (missing ${getEmailConfig().missing.join(', ')}); message to ${maskEmail(mail.to)} was NOT sent.`);
    }
    return { delivered: false, mocked: true, provider: 'mock', reason: 'not-configured' };
  }

  try {
    const info = await transport.sendMail(mail);
    return { delivered: true, mocked: false, provider: 'smtp', messageId: info?.messageId || null };
  } catch (err) {
    console.error(`[EMAIL] Initial send failed for ${maskEmail(mail.to)}: ${err.message}`);
    retryInBackground(mail, 1).catch(() => {});
    return { delivered: false, mocked: false, provider: 'smtp', error: err.message };
  }
}

export function sendForgotPasswordOTP(email, otp, firstName) {
  return sendMail({ from: fromAddress(), to: email, subject: 'Reset your Caviar Beauty password', html: forgotPasswordTemplate(otp, firstName) });
}

export function sendVerificationOTP(email, otp, firstName) {
  return sendMail({ from: fromAddress(), to: email, subject: 'Verify your Caviar Beauty email', html: verifyEmailTemplate(otp, firstName) });
}

export function sendWelcomeEmail(email, firstName) {
  return sendMail({ from: fromAddress(), to: email, subject: 'Welcome to Caviar Beauty', html: welcomeTemplate(firstName) });
}

export function sendOrderConfirmationEmail(email, firstName, order) {
  return sendMail({ from: fromAddress(), to: email, subject: `Order ${order.orderNumber} confirmed`, html: orderConfirmationTemplate(order, firstName) });
}

export function sendOrderShippedEmail(email, firstName, order, shipment) {
  return sendMail({ from: fromAddress(), to: email, subject: `Order ${order.orderNumber} shipped`, html: orderShippedTemplate(order, firstName, shipment) });
}

export function sendOrderDeliveredEmail(email, firstName, order) {
  return sendMail({ from: fromAddress(), to: email, subject: `Order ${order.orderNumber} delivered`, html: orderDeliveredTemplate(order, firstName) });
}

export function sendRefundEmail(email, firstName, order, refund) {
  return sendMail({ from: fromAddress(), to: email, subject: `Refund issued for ${order.orderNumber}`, html: refundTemplate(order, refund, firstName) });
}

/**
 * Contact-form notification for the store owner. Unlike the customer emails
 * above there is no visitor account involved: the recipient is the shop's own
 * inbox (CONTACT_TO, falling back to MAIL_FROM / SMTP_USER) and Reply-To points
 * at the visitor so a reply in the mail client answers them directly.
 */
export function contactNotificationRecipient() {
  const config = getEmailConfig();
  return (process.env.CONTACT_TO || '').trim() || config.from || config.user || '';
}

export function sendContactNotification(contact) {
  const to = contactNotificationRecipient();
  if (!to) {
    console.warn('[EMAIL] No contact recipient configured (set CONTACT_TO); the contact form message was only stored.');
    return Promise.resolve({ delivered: false, mocked: true, provider: 'none', reason: 'no-recipient' });
  }
  return sendMail({
    from: fromAddress(),
    to,
    replyTo: contact?.email || undefined,
    subject: `Contact form: ${contact?.subject || 'New message'}`,
    html: contactNotificationTemplate(contact),
  });
}

/**
 * Shop-facing copy of an order, sent to the store's own inbox (CONTACT_TO,
 * falling back to MAIL_FROM / SMTP_USER). Reply-To is the customer, so replying
 * in the mail client answers the buyer instead of the shop itself.
 */
export function sendOrderShopNotification(order) {
  const to = contactNotificationRecipient();
  if (!to) {
    console.warn('[EMAIL] No shop recipient configured (set CONTACT_TO); the new order was only stored.');
    return Promise.resolve({ delivered: false, mocked: true, provider: 'none', reason: 'no-recipient' });
  }
  const customer = order?.user || null;
  const who = customer?.firstName || customer?.email || 'a customer';
  return sendMail({
    from: fromAddress(),
    to,
    replyTo: customer?.email || undefined,
    subject: `New order ${order.orderNumber} from ${who}`,
    html: orderShopNotificationTemplate(order, customer),
  });
}

/**
 * Boot-time report, mirroring reportPaymentConfig(). Email is optional for the
 * API to start, but registration, email verification and password reset all
 * depend on it, so the state is logged loudly.
 */
export function reportEmailConfig() {
  const { configured, missing, host, port } = getEmailConfig();
  const contactTo = contactNotificationRecipient();
  if (configured) {
    console.log(`[EMAIL] SMTP configured (${host}:${port}) - verification and reset emails will be delivered.`);
    console.log(contactTo
      ? `[EMAIL] Contact-form submissions and new orders are sent to ${maskEmail(contactTo)}.`
      : '[EMAIL] Set CONTACT_TO so contact-form submissions and new orders are emailed to the shop inbox.');
    return { configured: true, missing: [] };
  }
  console.warn(`[EMAIL] Email delivery is NOT configured. Missing or placeholder: ${missing.join(', ')}.
[EMAIL] Email verification and password-reset codes cannot be delivered; in development they are printed to this log.
[EMAIL] See EMAIL_OTP_SETUP.md for setup (Gmail needs an App Password, not your normal password).`);
  return { configured: false, missing };
}

export { isEmailConfigured, sendMail };
