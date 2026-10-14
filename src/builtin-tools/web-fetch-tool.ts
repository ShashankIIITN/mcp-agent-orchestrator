import type { SubagentTool, ToolContext, ToolResult } from './types.js';

export const webFetchTool: SubagentTool = {
  name: 'web_fetch',
  description: 'Fetch content from a URL',
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
  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    try {
      const url = args.url as string;
      const method = (args.method as string | undefined) ?? 'GET';
      const headers = args.headers as Record<string, string> | undefined;
      const body = args.body as string | undefined;

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(30000)
      });

      const text = await response.text();
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
