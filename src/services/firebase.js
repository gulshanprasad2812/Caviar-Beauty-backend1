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
 * Everything is read from environment variables - nothing is hardcoded. The
 * server needs only FIREBASE_API_KEY + FIREBASE_PROJECT_ID; the browser needs
 * the rest, which `getPublicFirebaseConfig` hands out at runtime so the web app
 * does not have to be rebuilt when these values change.
 *
 * None of these values is a secret: the Firebase Web API key and app id are
 * public by design and ship in every client bundle.
 */
const readEnv = (name) => (process.env[name] || '').trim();

const PLACEHOLDER_VALUES = new Set([
  'your_firebase_api_key',
  'your_firebase_project_id',
  'your_firebase_auth_domain',
  'your_firebase_storage_bucket',
  'your_firebase_messaging_sender_id',
  'your_firebase_app_id',
  'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
]);

const isPlaceholder = (value) => !value || PLACEHOLDER_VALUES.has(value) || value.startsWith('your_');

const clean = (value) => (isPlaceholder(value) ? '' : value);

export const getFirebaseConfig = () => {
  // Server-side verification only needs the API key + project id. The FIREBASE_*
  // names win; VITE_FIREBASE_* are accepted too so a single set of variables can
  // serve both apps if that is how the environment is laid out.
  const apiKey = clean(readEnv('FIREBASE_API_KEY') || readEnv('VITE_FIREBASE_API_KEY'));
  const projectId = clean(readEnv('FIREBASE_PROJECT_ID') || readEnv('VITE_FIREBASE_PROJECT_ID'));
  const authDomain =
    clean(readEnv('FIREBASE_AUTH_DOMAIN') || readEnv('VITE_FIREBASE_AUTH_DOMAIN')) ||
    (projectId ? `${projectId}.firebaseapp.com` : '');
  const storageBucket =
    clean(readEnv('FIREBASE_STORAGE_BUCKET') || readEnv('VITE_FIREBASE_STORAGE_BUCKET')) ||
    (projectId ? `${projectId}.appspot.com` : '');
  const messagingSenderId = clean(readEnv('FIREBASE_MESSAGING_SENDER_ID') || readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'));
  const appId = clean(readEnv('FIREBASE_APP_ID') || readEnv('VITE_FIREBASE_APP_ID'));

  const missing = [];
  if (!apiKey) missing.push('FIREBASE_API_KEY');
  if (!projectId) missing.push('FIREBASE_PROJECT_ID');

  return {
    provider: 'firebase',
    configured: missing.length === 0,
    // `clientReady` also requires an app id, which is the one piece the browser
    // cannot infer; `missingClient` lists what the web app still needs.
    clientReady: Boolean(apiKey && projectId && appId),
    missingClient: [
      ...(apiKey ? [] : ['FIREBASE_API_KEY']),
      ...(projectId ? [] : ['FIREBASE_PROJECT_ID']),
      ...(appId ? [] : ['FIREBASE_APP_ID']),
    ],
    apiKey,
    projectId,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId,
    missing,
  };
};

export const isFirebaseConfigured = () => getFirebaseConfig().configured;

/**
 * The public config the browser needs to initialise the client SDK. Served from
 * the API so the storefront does not carry build-time Firebase variables.
 */
export const getPublicFirebaseConfig = () => {
  const config = getFirebaseConfig();
  if (!config.configured) {
    return { provider: 'firebase', configured: false, clientReady: false, missing: config.missing };
  }
  return {
    provider: 'firebase',
    configured: true,
    clientReady: config.clientReady,
    missing: config.missingClient,
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket || undefined,
    messagingSenderId: config.messagingSenderId || undefined,
    appId: config.appId || undefined,
  };
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
  const { configured, projectId, clientReady, missingClient } = getFirebaseConfig();
  if (configured) {
    console.log(`[FIREBASE] Phone Auth configured (project ${projectId}). SMS is sent by the client SDK on the free tier.`);
    if (!clientReady) {
      console.warn(`[FIREBASE] The browser still needs: ${missingClient.join(', ')}. Phone verification stays off until then.`);
    }
    return { configured: true, clientReady, missing: [] };
  }
  return { configured: false, clientReady: false, missing: getFirebaseConfig().missing };
}
