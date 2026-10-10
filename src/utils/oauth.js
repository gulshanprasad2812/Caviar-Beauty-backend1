import crypto from 'crypto';

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISS = 'https://appleid.apple.com';

export const isGoogleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id.apps.googleusercontent.com';

export const isAppleConfigured = () => !!process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_ID !== 'your-apple-bundle-id';

export async function verifyGoogleAccessToken(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) return null;
  const info = await res.json();

  if (isGoogleConfigured() && info.aud !== process.env.GOOGLE_CLIENT_ID) return null;
  if (info.email_verified !== 'true' && info.email_verified !== true) return null;
  if (!info.sub || !info.email) return null;

  return {
    providerId: info.sub,
    email: info.email,
    name: info.name || null,
    picture: info.picture || null,
    firstName: info.given_name || null,
    lastName: info.family_name || null,
  };
}

let appleKeysCache = { fetchedAt: 0, keys: [] };

async function getAppleKeys() {
  if (Date.now() - appleKeysCache.fetchedAt < 3600 * 1000 && appleKeysCache.keys.length) {
    return appleKeysCache.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error('Unable to fetch Apple keys');
  const { keys } = await res.json();
  appleKeysCache = { fetchedAt: Date.now(), keys };
  return keys;
}

function verifyRS256(jwtPayload, signature, modulusB64, exponentB64) {
  const key = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: modulusB64,
      e: exponentB64,
    },
    format: 'jwk',
  });
  return crypto.verify('RSA-SHA256', Buffer.from(jwtPayload), key, Buffer.from(signature, 'base64'));
}

function decodeB64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken) return null;
  const [headerB64, payloadB64, signatureB64] = identityToken.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const header = JSON.parse(decodeB64Url(headerB64));
  const payload = JSON.parse(decodeB64Url(payloadB64));

  if (payload.iss !== APPLE_ISS) return null;
  if (isAppleConfigured() && payload.aud !== process.env.APPLE_CLIENT_ID) return null;
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  if (!payload.sub || !payload.email) return null;

  const keys = await getAppleKeys();
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) return null;

  const valid = verifyRS256(`${headerB64}.${payloadB64}`, signatureB64, key.n, key.e);
  if (!valid) return null;

  return {
    providerId: payload.sub,
    email: payload.email,
    firstName: payload.name?.firstName || null,
    lastName: payload.name?.lastName || null,
  };
}
