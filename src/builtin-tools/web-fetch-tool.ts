import type { SubagentTool, ToolContext, ToolResult } from './types.js';
import { assertSafeUrl } from '../utils/url-guard.js';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_CHARS = 1_000_000;

export const webFetchTool: SubagentTool = {
  name: 'web_fetch',
  description: 'Fetch content from a public http(s) URL (private/internal addresses are blocked)',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      method: { type: 'string' },
      headers: { type: 'object' },
      body: { type: 'string' }
    },
    required: ['url']
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      let currentUrl = args.url as string;
      let method = (args.method as string | undefined) ?? 'GET';
      const headers = args.headers as Record<string, string> | undefined;
      let body = args.body as string | undefined;

      if (context.safety_mode === 'safe' && method.toUpperCase() !== 'GET') {
        return { success: false, output: '', error: 'Blocked: only GET is allowed in safe mode.' };
      }

      // Follow redirects manually so every hop is re-validated against the SSRF guard
      let response: Response | undefined;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const safeUrl = await assertSafeUrl(currentUrl);
        response = await fetch(safeUrl, {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000)
        });

        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
          currentUrl = new URL(location, safeUrl).toString();
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET')) {
            method = 'GET';
            body = undefined;
          }
          if (hop === MAX_REDIRECTS) throw new Error('Too many redirects');
          continue;
        }
        break;
      }

      if (!response) throw new Error('No response received');

      let text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) {
        text = text.slice(0, MAX_RESPONSE_CHARS) + `\n\n[truncated: response exceeded ${MAX_RESPONSE_CHARS} characters]`;
      }
      const output = `Status: ${response.status} ${response.statusText}\n\n${text}`;

      if (!response.ok) {
        return { success: false, output, error: `HTTP Error ${response.status}` };
      }

      return { success: true, output };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }
};
