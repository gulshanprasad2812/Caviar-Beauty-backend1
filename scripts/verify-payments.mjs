#!/usr/bin/env node
/**
 * Paytm Payment Gateway readiness check.
 *
 *   npm run verify:payments          # validate local configuration only
 *   npm run verify:payments -- --live  # also call Paytm to prove MID + key work
 *
 * Exit code 0 = the gateway can take payments, 1 = it cannot.
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getCallbackUrl,
  getCheckoutScriptUrl,
  getMid,
  getMissingPaymentConfig,
  getPaytmEnvironment,
  getPaytmHost,
  getWebsiteName,
  isPaytmConfigured,
  getTransactionStatus,
} from '../src/utils/paytm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const frontendEnv = path.resolve(backendDir, '..', 'Caviar-Beauty-Frontend', '.env');

const ok = (m) => console.log(`  \u2713  ${m}`);
const bad = (m) => console.log(`  \u2717  ${m}`);
const info = (m) => console.log(`     ${m}`);

console.log('\nCaviar Beauty \u2014 Paytm payment gateway check\n');

const environment = getPaytmEnvironment();
const mid = getMid();
const host = getPaytmHost();
const website = getWebsiteName();
const missing = getMissingPaymentConfig();
let failures = 0;

// --- Environment --------------------------------------------------------
if (!['staging', 'production'].includes((process.env.PAYTM_ENV || '').trim().toLowerCase())) {
  info(`PAYTM_ENV is "${process.env.PAYTM_ENV || ''}". Defaulting to STAGING.`);
} else {
  ok(`PAYTM_ENV is ${environment.toUpperCase()}.`);
}

// --- MID ----------------------------------------------------------------
if (missing.includes('PAYTM_MID')) {
  failures++;
  bad('PAYTM_MID is missing, malformed, or still the example placeholder.');
  info('Dashboard \u2192 API Keys \u2192 copy the MID (staging or production).');
} else {
  ok(`PAYTM_MID looks valid (${mid}).`);
}

// --- Merchant key -------------------------------------------------------
if (missing.includes('PAYTM_MERCHANT_KEY')) {
  failures++;
  bad('PAYTM_MERCHANT_KEY is missing, not 16 characters, or still the example placeholder.');
  info('The merchant key is shown in Dashboard \u2192 API Keys; it is server-only.');
} else {
  ok('PAYTM_MERCHANT_KEY is present.');
}

// --- Website name -------------------------------------------------------
const expectedWebsite = environment === 'production' ? 'DEFAULT' : 'WEBSTAGING';
if (website !== expectedWebsite) {
  info(`PAYTM_WEBSITE_NAME is "${website}", expected "${expectedWebsite}" for ${environment}.`);
} else {
  ok(`PAYTM_WEBSITE_NAME is ${website}.`);
}

console.log(`\nPaytm host:        ${host}`);
console.log(`Checkout script:   ${isPaytmConfigured() ? getCheckoutScriptUrl() : '(needs MID)'}`);
console.log(`Browser callback:  ${getCallbackUrl()}`);
console.log('Webhook URL to register in Dashboard \u2192 Developer Settings \u2192 Webhook URL:');
console.log(`  ${getCallbackUrl().replace(/\/api\/payments\/callback$/, '/api/payments/webhook/paytm')}`);
console.log('Event: Payment status (one-time payments). Refund events use the same URL.');

// --- Frontend note ------------------------------------------------------
if (fs.existsSync(frontendEnv)) {
  const body = fs.readFileSync(frontendEnv, 'utf8');
  const match = body.match(/^VITE_PAYTM_MID=(.*)$/m);
  const value = (match?.[1] || '').trim();
  if (!value) {
    info('Frontend VITE_PAYTM_MID is unset. This is fine: the storefront receives');
    info('the MID and txnToken from the API at checkout time.');
  } else {
    info('Frontend VITE_PAYTM_MID is set (optional fallback).');
  }
}

// --- Optional live check ------------------------------------------------
if (process.argv.includes('--live') && failures === 0) {
  console.log('\nCalling the Paytm Transaction Status API to confirm MID + key...');
  const probeOrderId = `VERIFY${Date.now()}`;
  try {
    const result = await getTransactionStatus(probeOrderId);
    const code = String(result?.resultInfo?.resultCode || '');
    if (code === '2005') {
      failures++;
      bad('Paytm rejected the checksum (resultCode 2005). The merchant key is wrong.');
    } else if (code === '335') {
      failures++;
      bad('Paytm rejected the MID (resultCode 335).');
    } else {
      ok(
        `Paytm accepted the signed request (probe ${probeOrderId}: ${
          result?.resultInfo?.resultStatus || 'responded'
        }).`
      );
    }
  } catch (err) {
    failures++;
    bad(`Live check failed: ${err.message}`);
    info('If you are on production, confirm PAYTM_ENV and PAYTM_HOST are correct.');
  }
}

console.log(
  failures === 0
    ? '\nResult: Paytm payment gateway is READY.\n'
    : `\nResult: ${failures} problem(s) found. Checkout returns HTTP 503 until these are fixed.\n`
);
process.exit(failures === 0 ? 0 : 1);