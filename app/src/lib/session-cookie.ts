// Shared by the proxy and lib/session.ts (no server-only import: the proxy loads it too)
export const SESSION_COOKIE = 'mek_session';
export const SESSION_DAYS = 7;
// The proxy renews the cookie once it is older than this, so active users stay logged in
export const SESSION_RENEW_AFTER_SECONDS = 24 * 3600;
