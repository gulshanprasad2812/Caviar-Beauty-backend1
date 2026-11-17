import { getMid, getMissingPaymentConfig, getPaytmEnvironment, isPaytmConfigured } from './paytm.js';

const PLACEHOLDERS = [
  'caviar-beauty-jwt-secret-super-secure-key-2024',
  'caviar-beauty-refresh-secret-key-2024',
  'change-me-to-a-long-random-string',
  'change-me-to-another-long-random-string',
  'your_jwt_secret',
];

export function assertSecureConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const issues = [];

  if (!process.env.JWT_SECRET || PLACEHOLDERS.includes(process.env.JWT_SECRET)) {
    issues.push('JWT_SECRET is missing or a known placeholder. Generate one: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  if (!process.env.JWT_REFRESH_SECRET || PLACEHOLDERS.includes(process.env.JWT_REFRESH_SECRET)) {
    issues.push('JWT_REFRESH_SECRET is missing or a known placeholder.');
  }
  if (isProd && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    issues.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  }

  if (issues.length) {
    const message = `[SECURITY] Configuration check failed:\n- ${issues.join('\n- ')}`;
    if (isProd) throw new Error(message);
    console.warn(`${message}\n[SECURITY] Continuing in development mode.`);
  }
}

/**
 * Reports the payment-gateway configuration at boot. Payments are optional at
 * start-up (the API stays healthy without them) but the checkout cannot take
 * money until the credentials exist, so the state is logged loudly.
 */
export function reportPaymentConfig() {
  const configured = isPaytmConfigured();
  const missing = getMissingPaymentConfig();
  const environment = getPaytmEnvironment();
  const isProd = process.env.NODE_ENV === 'production';

  if (configured) {
    console.log(
      `[PAYMENTS] Paytm ready (${environment.toUpperCase()} mode, MID ${getMid()}); webhooks verified with the merchant key.`
    );
    return { configured: true, missing: [] };
  }

  const detail = `[PAYMENTS] Paytm is NOT fully configured. Missing or placeholder: ${missing.join(', ')}.
[PAYMENTS] Checkout will return HTTP 503 from POST /api/payments/create-order until these are set.
[PAYMENTS] See PAYMENT_SETUP.md. Verify with: npm run verify:payments`;
  if (isProd && missing.includes('PAYTM_MID')) {
    console.error(detail);
  } else {
    console.warn(detail);
  }
  return { configured: false, missing };
}

