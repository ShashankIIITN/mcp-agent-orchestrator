import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF protection for agent-driven HTTP requests.
 * Only http(s) is allowed and hosts resolving to private, loopback, link-local
 * or otherwise non-public addresses are rejected.
 * Set ORCHESTRATOR_ALLOW_PRIVATE_FETCH=1 to disable the address check.
 */

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast / reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // unknown format: be conservative
}

/**
 * Throws if the URL is not safe to fetch. Returns the parsed URL.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked: only http(s) URLs are allowed (got ${url.protocol})`);
  }

  if (process.env.ORCHESTRATOR_ALLOW_PRIVATE_FETCH === '1') return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(
        `Blocked: ${host} resolves to a private/internal address (${address}). ` +
          'Set ORCHESTRATOR_ALLOW_PRIVATE_FETCH=1 to allow.',
      );
    }
  }
  return url;
}
