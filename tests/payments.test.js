import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import PaytmChecksum from 'paytmchecksum';
import app from '../src/app.js';
import {
  formatAmount,
  generateSignature,
  getCheckoutScriptUrl,
  getPaytmEnvironment,
  getPublicPaymentConfig,
  getWebsiteName,
  isPaytmConfigured,
  isWebhookConfigured,
  verifyCallbackChecksum,
  verifySignature,
  verifyWebhookSignature,
} from '../src/utils/paytm.js';

const MID = 'TESTMID1234567890';
const KEY = 'unit-test-key-16';

const ORIGINAL = {
  PAYTM_MID: process.env.PAYTM_MID,
  PAYTM_MERCHANT_KEY: process.env.PAYTM_MERCHANT_KEY,
  PAYTM_ENV: process.env.PAYTM_ENV,
  PAYTM_WEBSITE_NAME: process.env.PAYTM_WEBSITE_NAME,
};

const setKeys = (mid, key, env = 'staging') => {
  process.env.PAYTM_MID = mid;
  process.env.PAYTM_MERCHANT_KEY = key;
  process.env.PAYTM_ENV = env;
  process.env.PAYTM_WEBSITE_NAME = '';
};

afterEach(() => {
  process.env.PAYTM_MID = ORIGINAL.PAYTM_MID;
  process.env.PAYTM_MERCHANT_KEY = ORIGINAL.PAYTM_MERCHANT_KEY;
  process.env.PAYTM_ENV = ORIGINAL.PAYTM_ENV;
  process.env.PAYTM_WEBSITE_NAME = ORIGINAL.PAYTM_WEBSITE_NAME;
});

describe('Paytm configuration detection', () => {
  it('is not configured when the credentials are placeholders', () => {
    setKeys('your_paytm_mid', 'your_paytm_merchant_key');
    expect(isPaytmConfigured()).toBe(false);
    expect(isWebhookConfigured()).toBe(false);
  });

  it('is not configured when only one credential is present', () => {
    setKeys(MID, '');
    expect(isPaytmConfigured()).toBe(false);
  });

  it('is configured with a well formed MID and merchant key', () => {
    setKeys(MID, KEY);
    expect(isPaytmConfigured()).toBe(true);
    expect(isWebhookConfigured()).toBe(true);
    expect(getPublicPaymentConfig()).toMatchObject({
      provider: 'paytm',
      configured: true,
      mode: 'test',
      environment: 'staging',
      currency: 'INR',
      mid: MID,
    });
  });

  it('derives the staging host, website name and checkout URL', () => {
    setKeys(MID, KEY, 'staging');
    expect(getPaytmEnvironment()).toBe('staging');
    expect(getWebsiteName()).toBe('WEBSTAGING');
    expect(getCheckoutScriptUrl()).toBe(
      `https://securestage.paytmpayments.com/merchantpgpui/checkoutjs/merchants/${MID}.js`
    );
  });

  it('switches to production host and DEFAULT website name', () => {
    setKeys(MID, KEY, 'production');
    expect(getPaytmEnvironment()).toBe('production');
    expect(getWebsiteName()).toBe('DEFAULT');
    expect(getCheckoutScriptUrl()).toBe(
      `https://secure.paytmpayments.com/merchantpgpui/checkoutjs/merchants/${MID}.js`
    );
    expect(getPublicPaymentConfig()).toMatchObject({ mode: 'live', environment: 'production' });
  });

  it('never exposes the merchant key in the public configuration', () => {
    setKeys(MID, KEY);
    expect(JSON.stringify(getPublicPaymentConfig())).not.toContain(KEY);
  });

  it('formats amounts as Paytm expects (two decimal string)', () => {
    expect(formatAmount(1499)).toBe('1499.00');
    expect(formatAmount('99.5')).toBe('99.50');
    expect(() => formatAmount(-1)).toThrow();
    expect(() => formatAmount('abc')).toThrow();
  });
});

describe('Paytm checksum verification', () => {
  const body = { mid: MID, orderId: 'CB-ORDER-1', txnAmount: { value: '1499.00', currency: 'INR' } };

  beforeEach(() => setKeys(MID, KEY));

  it('accepts a JSON signature generated with the same merchant key', async () => {
    const signature = await generateSignature(body);
    expect(await verifyWebhookSignature(body, signature)).toBe(true);
    expect(await verifySignature(JSON.stringify(body), signature)).toBe(true);
  });

  it('rejects a tampered JSON body', async () => {
    const signature = await generateSignature(body);
    const tampered = { ...body, orderId: 'CB-ORDER-2' };
    expect(await verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a missing signature', async () => {
    expect(await verifyWebhookSignature(body, '')).toBe(false);
  });

  it('verifies the CHECKSUMHASH form callback and rejects a tampered field', async () => {
    const params = { ORDERID: 'CB-ORDER-1', STATUS: 'TXN_SUCCESS', TXNID: 'PAYTM123', MID };
    const checksum = await PaytmChecksum.generateSignature(params, KEY);
    const withHash = { ...params, CHECKSUMHASH: checksum };

    expect(await verifyCallbackChecksum(withHash)).toBe(true);
    expect(await verifyCallbackChecksum({ ...withHash, TXNID: 'TAMPERED' })).toBe(false);
    expect(await verifyCallbackChecksum({ ...params })).toBe(false);
  });

  it('rejects callback verification when the gateway is not configured', async () => {
    setKeys('', '');
    const params = { ORDERID: 'CB-ORDER-1', CHECKSUMHASH: 'anything' };
    expect(await verifyCallbackChecksum(params)).toBe(false);
  });
});

describe('GET /api/payments/config', () => {
  it('is public and reports the unconfigured state', async () => {
    setKeys('', '');
    const res = await request(app).get('/api/payments/config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'paytm', configured: false, currency: 'INR' });
    expect(res.body.missing).toContain('PAYTM_MID');
    expect(res.body.missing).toContain('PAYTM_MERCHANT_KEY');
    expect(res.body.mid).toBeNull();
    expect(res.body.checkoutScriptUrl).toBeNull();
  });

  it('reports the configured state with the public MID only', async () => {
    setKeys(MID, KEY);
    const res = await request(app).get('/api/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.mid).toBe(MID);
    expect(res.body.webhookConfigured).toBe(true);
    expect(res.body.missing).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it('reports a missing merchant key when only the MID is set', async () => {
    setKeys(MID, '');
    const res = await request(app).get('/api/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.missing).toEqual(['PAYTM_MERCHANT_KEY']);
  });
});