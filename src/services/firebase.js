/**
 * Firebase Phone Authentication.
 *
 * Firebase's free Spark plan sends the verification SMS itself from the client
 * SDK. The server only has to check the ID token the client receives after the
 * user types the code, which is what `verifyFirebaseIdToken` does. The check is
 * a server-to-server call to Google's Identity Toolkit with our own Web API
 * key; that key is bound to this Firebase project, so a token minted for any
 * other project is rejected. Doing the lookup here (rather than trusting the
 * client) is what keeps a visitor from marking a phone verified on their own.
 *
 * The Web API key is not a secret - it ships in the browser bundle either way -
 * but it is read from the server env so the API still makes the decision.
 */
const readEnv = (name) => (process.env[name] || '').trim();

const PLACEHOLDER_VALUES = new Set([
  'your_firebase_api_key',
  'your_firebase_project_id',
  'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
]);

const isPlaceholder = (value) => !value || PLACEHOLDER_VALUES.has(value) || value.startsWith('your_');

export const getFirebaseConfig = () => {
  const apiKey = readEnv('FIREBASE_API_KEY') || readEnv('VITE_FIREBASE_API_KEY');
  const projectId = readEnv('FIREBASE_PROJECT_ID') || readEnv('VITE_FIREBASE_PROJECT_ID');
  const missing = [];
  if (isPlaceholder(apiKey)) missing.push('FIREBASE_API_KEY');
  if (isPlaceholder(projectId)) missing.push('FIREBASE_PROJECT_ID');
  return {
    provider: 'firebase',
    configured: missing.length === 0,
    apiKey,
    projectId,
    missing,
  };
};

export const isFirebaseConfigured = () => getFirebaseConfig().configured;

/** Public bits the browser needs to initialise the client SDK. */
export const getPublicFirebaseConfig = () => {
  const { apiKey, projectId, configured } = getFirebaseConfig();
  return configured
    ? { provider: 'firebase', configured: true, apiKey, projectId }
    : { provider: 'firebase', configured: false };
};

/**
 * Confirms an ID token came from this Firebase project and returns the verified
 * phone number. Never throws: callers get `{ ok: false, reason }` instead, so a
 * Google hiccup can be reported to the user without a 500.
 */
export async function verifyFirebaseIdToken(idToken) {
  const config = getFirebaseConfig();
  if (!config.configured) return { ok: false, reason: 'not-configured' };
  if (!idToken || typeof idToken !== 'string') return { ok: false, reason: 'missing-token' };

  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
  } catch (err) {
    return { ok: false, reason: `network: ${err.message}` };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, reason };
  }

  const account = data?.users?.[0];
  if (!account?.phoneNumber) return { ok: false, reason: 'no-phone-number' };
  return { ok: true, phoneNumber: account.phoneNumber, uid: account.localId || null };
}

/** Boot-time report, mirroring reportSmsConfig(). */
export function reportFirebaseConfig() {
  const { configured, projectId, missing } = getFirebaseConfig();
  if (configured) {
    console.log(`[FIREBASE] Phone Auth configured (project ${projectId}). SMS is sent by the client SDK on the free tier.`);
    return { configured: true, missing: [] };
  }
  return { configured: false, missing };
}
