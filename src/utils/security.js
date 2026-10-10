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
