import { createRequire } from 'node:module';

// package.json sits one level above both `src/` and `dist/`, so this resolves
// identically when run via tsx and from the compiled output.
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export const VERSION: string = pkg.version;
