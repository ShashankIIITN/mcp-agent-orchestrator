import { createLogger } from '../utils/logger.js';
import type { LLMProvider } from './types.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { AgyProvider } from './providers/agy-provider.js';

// Using inline interface to avoid dependency on config/schema.js if it doesn't export InferenceConfig
export interface InferenceProviderConfig {
  type?: 'agy' | 'gemini' | 'anthropic' | 'openai' | 'ollama' | 'openai-compatible';
  model: string;
  api_key_env?: string;
  base_url?: string;
  binary_path?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface InferenceConfig {
  providers: Record<string, InferenceProviderConfig>;
}

const logger = createLogger('provider-registry');

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  initFromConfig(config: InferenceConfig): void {
    if (config.providers) {
      for (const [name, providerConfig] of Object.entries(config.providers)) {
        const apiKey = providerConfig.api_key_env ? (process.env[providerConfig.api_key_env] || '') : '';
        const model = providerConfig.model;
        const kind = (providerConfig.type || name).toLowerCase();
        let provider: LLMProvider;

        switch (kind) {
          case 'agy':
          case 'antigravity':
            provider = new AgyProvider(name, {
              defaultModel: model || 'gemini-3.8-flash-high',
              binaryPath: providerConfig.binary_path,
              effort: providerConfig.effort,
            });
            break;
          case 'gemini':
            provider = new GeminiProvider(name, apiKey, model);
            break;
          case 'anthropic':
            provider = new OpenAICompatibleProvider(name, 'https://api.anthropic.com', apiKey, model);
            break;
          case 'openai':
            provider = new OpenAICompatibleProvider(name, 'https://api.openai.com', apiKey, model);
            break;
          case 'ollama':
            provider = new OpenAICompatibleProvider(name, providerConfig.base_url || 'http://localhost:11434', apiKey, model);
            break;
          case 'openai-compatible':
          default:
            if (!providerConfig.base_url) {
              logger.warn(`Provider ${name} missing base_url, skipping.`);
              continue;
            }
            provider = new OpenAICompatibleProvider(name, providerConfig.base_url, apiKey, model);
            break;
        }

        this.register(name, provider);
        logger.info(`Initialized provider: ${name} (type: ${kind})`);
      }
    }

    // Zero-config fallback: If no API providers registered in YAML, auto-detect from environment or agy
    if (this.providers.size === 0) {
      if (process.env.GEMINI_API_KEY) {
        logger.info('Auto-detected GEMINI_API_KEY in environment. Initialized Gemini provider.');
        this.register('gemini', new GeminiProvider('gemini', process.env.GEMINI_API_KEY, 'gemini-2.5-flash'));
      }
      if (process.env.OPENAI_API_KEY) {
        logger.info('Auto-detected OPENAI_API_KEY in environment. Initialized OpenAI provider.');
        this.register('openai', new OpenAICompatibleProvider('openai', 'https://api.openai.com', process.env.OPENAI_API_KEY, 'gpt-4o'));
      }
      if (process.env.ANTHROPIC_API_KEY) {
        logger.info('Auto-detected ANTHROPIC_API_KEY in environment. Initialized Anthropic provider.');
        this.register('anthropic', new OpenAICompatibleProvider('anthropic', 'https://api.anthropic.com', process.env.ANTHROPIC_API_KEY, 'claude-3-7-sonnet-20250219'));
      }

      // Always ensure local agy is available as default zero-key option
      logger.info('Registered local Antigravity (agy) CLI as default provider.');
      this.register('agy', new AgyProvider('agy'));
      this.register('agy_claude', new AgyProvider('agy_claude', { defaultModel: 'claude-sonnet-4-6' }));
    }
  }

  register(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
  }
  
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }
  
  getOrThrow(name: string): LLMProvider {
    const provider = this.get(name);
    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }
    return provider;
  }
  
  list(): string[] {
    return Array.from(this.providers.keys());
  }
  
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, provider] of this.providers.entries()) {
      results[name] = await provider.healthCheck();
    }
    return results;
  }
}
