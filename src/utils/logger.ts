import pino from 'pino';

// One shared logger writing synchronously to stderr (fd 2).
// - stderr keeps stdout clean for the MCP stdio transport (in every NODE_ENV)
// - a single destination avoids spawning a transport worker (and an `exit`
//   listener) per module, which triggered MaxListenersExceededWarning.
const base = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.destination({ dest: 2, sync: true }),
);

export function createLogger(name: string) {
  return base.child({ name });
}
