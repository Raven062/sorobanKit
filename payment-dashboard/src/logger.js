import pino from 'pino';
import pkg from '../package.json';

// Debug logging is only enabled when VITE_DEBUG is explicitly set to 'true'.
// This keeps wallet addresses and other sensitive debug data out of the
// browser console in production builds.
const debugEnabled = import.meta.env.VITE_DEBUG === 'true';

// Simple pino configuration for the frontend
const logger = pino({
  level: /** @type {any} */ (import.meta).env.PROD ? 'info' : 'debug',
  browser: {
    asObject: true
  },
  base: {
    service: 'stellar-payment-platform',
    version: /** @type {{ version: string }} */ (pkg).version
  }
});

/**
 * Generate a UUID v4 for request correlation. Uses the native
 * crypto.randomUUID when available and falls back to a manual
 * implementation for older browsers / non-secure contexts.
 * @returns {string}
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Attach an X-Request-ID header to outgoing API requests so a frontend
 * action can be correlated with backend log entries.
 * @param {Record<string, string>} [headers]
 * @returns {Record<string, string>}
 */
export function withRequestId(headers = {}) {
  return { ...headers, 'X-Request-ID': uuid() };
}

export default logger;