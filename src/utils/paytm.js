import PaytmChecksum from 'paytmchecksum';

/**
 * Paytm Payment Gateway client.
 *
 * Flow implemented here:
 *   initiateTransaction()  -> txnToken for Paytm JS Checkout
 *   getTransactionStatus() -> server-side proof of the final payment status
 *   createRefund()         -> asynchronous refund request
 *   getRefundStatus()      -> refund state query
 *   verifyCallbackChecksum()/verifyWebhookSignature() -> tamper checks
 *
 * Everything is read lazily from process.env so dotenv has always finished
 * loading before a value is consumed. The merchant key never leaves the server.
 */

// Values shipped in .env.example / older templates that must never enable live payments.
const PLACEHOLDER_MIDS = new Set([
  'your_paytm_mid',
  'paytm_mid_placeholder',
  'INTEGR7769XXXXXX9383', // Paytm documentation sample MID
  'mid_placeholder',
]);

const PLACEHOLDER_KEYS = new Set([
  'placeholder',
  'your_paytm_merchant_key',
  'paytm_merchant_key_placeholder',
  'your_merchant_key',
]);

const readEnv = (name) => (process.env[name] || '').trim();

export const getMid = () => readEnv('PAYTM_MID');
export const getMerchantKey = () => readEnv('PAYTM_MERCHANT_KEY');

export const getPaytmEnvironment = () =>
  readEnv('PAYTM_ENV').toLowerCase() === 'production' ? 'production' : 'staging';

/** Staging / production API host. `PAYTM_HOST` is an escape hatch for support-issued hosts. */
export const getPaytmHost = () => {
  const override = readEnv('PAYTM_HOST');
  if (override) return override.replace(/\/+$/, '');
  return getPaytmEnvironment() === 'production'
    ? 'https://secure.paytmpayments.com'
    : 'https://securestage.paytmpayments.com';
};

/** `WEBSTAGING` for staging, `DEFAULT` for production. */
export const getWebsiteName = () => {
  const override = readEnv('PAYTM_WEBSITE_NAME');
  if (override) return override;
  return getPaytmEnvironment() === 'production' ? 'DEFAULT' : 'WEBSTAGING';
};

export const getPublicBackendUrl = () =>
  (readEnv('BACKEND_PUBLIC_URL') ||
    readEnv('PUBLIC_BACKEND_URL') ||
    `http://localhost:${readEnv('PORT') || 4000}`).replace(/\/+$/, '');

/** Browser return URL Paytm posts the transaction result to. */
export const getCallbackUrl = () =>
  readEnv('PAYTM_CALLBACK_URL') || `${getPublicBackendUrl()}/api/payments/callback`;

/** MID-specific Paytm JS Checkout bundle (`{HOST}/merchantpgpui/checkoutjs/merchants/{MID}.js`). */
export const getCheckoutScriptUrl = (mid = getMid()) =>
  `${getPaytmHost()}/merchantpgpui/checkoutjs/merchants/${encodeURIComponent(mid)}.js`;

/** Paytm accepts amounts as a string with up to two decimals, e.g. "1499.00". */
export const formatAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid payment amount: ${value}`);
  return amount.toFixed(2);
};

export const isPaytmConfigured = () => {
  const mid = getMid();
  const key = getMerchantKey();
  if (!mid || !key) return false;
  if (PLACEHOLDER_MIDS.has(mid) || PLACEHOLDER_KEYS.has(key)) return false;
  return /^[A-Za-z0-9]{4,20}$/.test(mid) && key.length === 16;
};

/**
 * Paytm webhooks are signed with the merchant key, so a configured gateway is
 * automatically able to verify webhook notifications.
 */
export const isWebhookConfigured = () => isPaytmConfigured();

/** Names of the environment variables that still block live payments. */
export const getMissingPaymentConfig = () => {
  const missing = [];
  const mid = getMid();
  const key = getMerchantKey();
  if (!mid || PLACEHOLDER_MIDS.has(mid) || !/^[A-Za-z0-9]{4,20}$/.test(mid)) missing.push('PAYTM_MID');
  if (!key || PLACEHOLDER_KEYS.has(key) || key.length !== 16) missing.push('PAYTM_MERCHANT_KEY');
  return missing;
};

/**
 * Creates the checksum Paytm expects in `head.signature` for a JSON request.
 * Accepts an object (serialised with JSON.stringify) or an already-serialised body.
 */
export const generateSignature = async (payload) => {
  const key = getMerchantKey();
  if (!key) throw new Error('Paytm merchant key is not configured');
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return PaytmChecksum.generateSignature(body, key);
};

/** Verifies a checksum over a JSON body (webhook / API response). */
export const verifySignature = async (payload, signature) => {
  if (!isPaytmConfigured() || !signature) return false;
  try {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return await PaytmChecksum.verifySignature(body, getMerchantKey(), signature);
  } catch {
    return false;
  }
};

/**
 * Verifies the `CHECKSUMHASH` Paytm attaches to the browser callback and to
 * key/value webhooks. The checksum is computed over every other field, so it
 * must be removed before verification.
 */
export const verifyCallbackChecksum = async (params) => {
  if (!isPaytmConfigured() || !params || typeof params !== 'object') return false;
  const hashKey = Object.keys(params).find((key) => key.toUpperCase() === 'CHECKSUMHASH');
  if (!hashKey) return false;
  const checksum = params[hashKey];
  const payload = { ...params };
  delete payload[hashKey];
  try {
    return await PaytmChecksum.verifySignature(payload, getMerchantKey(), checksum);
  } catch {
    return false;
  }
};

/** Webhook variant: verifies `head.signature` against `body`. */
export const verifyWebhookSignature = verifySignature;

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Signs and POSTs a `{ head, body }` request, then verifies the response
 * signature before returning `response.body`.
 */
const postSigned = async (url, body, extraHead = {}) => {
  const signature = await generateSignature(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ head: { signature, ...extraHead }, body }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Paytm request timed out');
    throw new Error(`Could not reach Paytm: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Paytm returned a non-JSON response (HTTP ${response.status})`);
  }

  const resultInfo = json?.body?.resultInfo || {};
  if (!response.ok) {
    throw new Error(
      `Paytm HTTP ${response.status}: ${resultInfo.resultMsg || resultInfo.resultCode || response.statusText}`
    );
  }

  if (json?.head?.signature) {
    const authentic = await verifySignature(json.body || {}, json.head.signature);
    if (!authentic) throw new Error('Paytm response signature verification failed');
  }

  return json.body || {};
};

/**
 * Creates a transaction token for the Paytm JS Checkout.
 * `orderId` is the merchant reference (our `Order.orderNumber`) and must be unique.
 */
export const initiateTransaction = async ({
  orderId,
  amount,
  customerId,
  email,
  mobile,
  firstName,
  lastName,
}) => {
  if (!isPaytmConfigured()) throw new Error('Paytm is not configured');
  const mid = getMid();

  const body = {
    requestType: 'Payment',
    mid,
    websiteName: getWebsiteName(),
    orderId,
    callbackUrl: getCallbackUrl(),
    txnAmount: { value: formatAmount(amount), currency: 'INR' },
    userInfo: {
      custId: String(customerId),
      ...(email ? { email } : {}),
      ...(mobile ? { mobile } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    },
  };

  const url = `${getPaytmHost()}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(
    mid
  )}&orderId=${encodeURIComponent(orderId)}`;

  const result = await postSigned(url, body, { version: 'v1', channelId: 'WEB' });
  const resultInfo = result.resultInfo || {};

  if (resultInfo.resultStatus !== 'S' || !result.txnToken) {
    throw new Error(
      `Paytm could not start the transaction: ${resultInfo.resultMsg || 'unknown error'} (${
        resultInfo.resultCode || 'no code'
      })`
    );
  }

  return { txnToken: result.txnToken, orderId, resultInfo };
};

/** Authoritative payment status, queried server-side after checkout/webhook. */
export const getTransactionStatus = async (orderId) => {
  if (!isPaytmConfigured()) throw new Error('Paytm is not configured');
  return postSigned(
    `${getPaytmHost()}/v3/order/status`,
    { mid: getMid(), orderId },
    { version: 'v1', channelId: 'WEB' }
  );
};

/**
 * Requests a (partial or full) refund. Paytm treats this as asynchronous:
 * `resultStatus === 'PENDING'` is the normal accepted state, and the final
 * outcome arrives through the refund webhook / Refund Status API.
 */
export const createRefund = async ({ orderId, txnId, refId, amount, comments }) => {
  if (!isPaytmConfigured()) throw new Error('Paytm is not configured');
  return postSigned(
    `${getPaytmHost()}/refund/apply`,
    {
      mid: getMid(),
      txnType: 'REFUND',
      orderId,
      txnId,
      refId,
      refundAmount: formatAmount(amount),
      ...(comments ? { comments: String(comments).slice(0, 500) } : {}),
    },
    { version: 'v1', channelId: 'WEB' }
  );
};

/** Refund status query (used by support tooling and webhook reconciliation). */
export const getRefundStatus = async ({ orderId, refId }) => {
  if (!isPaytmConfigured()) throw new Error('Paytm is not configured');
  return postSigned(
    `${getPaytmHost()}/v2/refund/status`,
    { mid: getMid(), orderId, refId },
    { version: 'v1', channelId: 'WEB' }
  );
};

/**
 * Safe-to-expose payment configuration for the storefront. The MID is public
 * (it is embedded in the JS Checkout URL); the merchant key is never returned.
 *
 * `PAYMENTS_MODE=dummy` swaps the gateway for a QR page that records payments
 * locally. It is meant for demos and testing; no money moves.
 */
export const getPaymentsMode = () =>
  readEnv('PAYMENTS_MODE').toLowerCase() === 'dummy' ? 'dummy' : 'paytm';

export const isDummyPayments = () => getPaymentsMode() === 'dummy';

export const getPublicPaymentConfig = () => {
  if (isDummyPayments()) {
    return {
      provider: 'paytm',
      configured: true,
      dummy: true,
      mode: 'dummy',
      environment: 'dummy',
      webhookConfigured: false,
      mid: null,
      currency: 'INR',
      checkoutScriptUrl: null,
      callbackUrl: null,
      missing: [],
    };
  }

  const configured = isPaytmConfigured();
  const environment = getPaytmEnvironment();
  const missing = getMissingPaymentConfig();
  return {
    provider: 'paytm',
    configured,
    dummy: false,
    webhookConfigured: isWebhookConfigured(),
    mid: configured ? getMid() : null,
    mode: environment === 'production' ? 'live' : 'test',
    environment,
    currency: 'INR',
    checkoutScriptUrl: configured ? getCheckoutScriptUrl() : null,
    callbackUrl: getCallbackUrl(),
    missing,
  };
};