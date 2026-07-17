/**
 * Login credentials for the staging account, resolved from the environment.
 *
 * Nothing sensitive lives in the repo — credentials are read at runtime from
 * environment variables. Two naming schemes are accepted:
 *
 *   Preferred (matches the AI Coach CLI command shape):
 *     AICoach_MICROSOFT_EMAIL / AICoach_MICROSOFT_PASSWORD
 *   Legacy fallback (kept so existing scripts/CI keep working):
 *     EMAIL / PASSWORD
 *
 * Example (PowerShell):
 *   $env:Browser="Chrome"; $env:Headless="false"; `
 *   $env:AICoach_MICROSOFT_EMAIL="you@insight.com"; `
 *   $env:AICoach_MICROSOFT_PASSWORD="<secret>"; `
 *   npm run test:login
 */
export function getEmail(): string | undefined {
  // Emails never contain surrounding whitespace, so trim fully — CI secrets are
  // frequently stored with a trailing newline, which would otherwise be typed
  // into the login field and rejected.
  const raw = process.env.AICoach_MICROSOFT_EMAIL ?? process.env.EMAIL;
  return raw?.trim();
}

export function getPassword(): string | undefined {
  // Strip only trailing CR/LF (the artifact of a secret stored with a trailing
  // newline) so a real password's leading/internal characters are preserved.
  const raw = process.env.AICoach_MICROSOFT_PASSWORD ?? process.env.PASSWORD;
  return raw?.replace(/[\r\n]+$/, '');
}

/** True when both an email and a password are available in the environment. */
export function hasCredentials(): boolean {
  return !!getEmail() && !!getPassword();
}
