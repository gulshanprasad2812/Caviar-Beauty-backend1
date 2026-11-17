import { maskPhone } from '../utils/otp.js';

/**
 * Provider-agnostic SMS delivery.
 *
 * Twilio is used over its REST API with fetch() so no SDK dependency is needed.
 * When the credentials are absent the message is logged and reported as
 * "not delivered" instead of throwing, so development and CI keep working while
 * the API still tells the caller the truth about delivery.
 */
const readEnv = (name) => (process.env[name] || '').trim();

const PLACEHOLDER_VALUES = new Set([
  'your_twilio_account_sid',
  'your_twilio_auth_token',
  'your_twilio_phone_number',
  '+10000000000',
  'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
]);

const isPlaceholder = (value) => !value || PLACEHOLDER_VALUES.has(value) || value.startsWith('your_');

export const getSmsConfig = () => {
  const accountSid = readEnv('TWILIO_ACCOUNT_SID');
  const authToken = readEnv('TWILIO_AUTH_TOKEN');
  const from = readEnv('TWILIO_FROM_NUMBER') || readEnv('TWILIO_PHONE_NUMBER');
  const missing = [];
  if (isPlaceholder(accountSid)) missing.push('TWILIO_ACCOUNT_SID');
  if (isPlaceholder(authToken)) missing.push('TWILIO_AUTH_TOKEN');
  if (isPlaceholder(from)) missing.push('TWILIO_FROM_NUMBER');
  return {
    provider: 'twilio',
    configured: missing.length === 0,
    accountSid,
    authToken,
    from,
    missing,
  };
};

export const isSmsConfigured = () => getSmsConfig().configured;

/** Safe to expose: never returns the auth token. */
export const getPublicSmsConfig = () => {
  const { configured, provider, from, missing } = getSmsConfig();
  return { provider, configured, from: configured ? from : null, missing };
};

/**
 * Sends a text message. Throws only when a configured provider rejects the
 * request, so a genuine delivery failure is never silently ignored.
 */
export async function sendSms(to, body) {
  const config = getSmsConfig();
  if (!config.configured) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SMS MOCK] To: ${maskPhone(to)} | ${body}`);
    } else {
      console.warn(`[SMS] Not configured (missing ${config.missing.join(', ')}); message to ${maskPhone(to)} was NOT sent.`);
    }
    return { delivered: false, mocked: true, provider: 'mock', reason: 'not-configured' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: config.from, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio rejected the SMS (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { delivered: true, mocked: false, provider: 'twilio', sid: data.sid || null };
}

const BRAND = 'Caviar Beauty';

export function sendPhoneOtp(phone, otp, firstName) {
  const name = firstName ? ` ${firstName}` : '';
  return sendSms(
    phone,
    `${BRAND}:${name} your verification code is ${otp}. It expires in 15 minutes. Never share this code.`
  );
}

/**
 * Boot-time report, mirroring reportPaymentConfig(). SMS is optional - the store
 * works without it - but phone verification depends on it, so state is logged.
 */
export function reportSmsConfig() {
  const { configured, missing, provider } = getSmsConfig();
  if (configured) {
    console.log(`[SMS] ${provider} configured - phone OTP delivery is active.`);
    return { configured: true, missing: [] };
  }
  console.warn(`[SMS] Phone OTP is NOT configured. Missing or placeholder: ${missing.join(', ')}.
[SMS] Codes are still generated and logged in development, but no real text message is sent.
[SMS] See EMAIL_OTP_SETUP.md.`);
  return { configured: false, missing };
}
