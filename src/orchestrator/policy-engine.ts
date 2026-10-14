import { resolve } from 'node:path';
import { createLogger } from '../utils/logger.js';
import type { SecurityConfig, SafetyMode } from '../config/schema.js';

const logger = createLogger('policy-engine');

export class PolicyEngine {
  constructor(private securityConfig: SecurityConfig) {}

  /**
   * Check if a given path is within the allowed workspaces.
   */
  isPathAllowed(targetPath: string): boolean {
    const resolved = resolve(targetPath);
    return this.securityConfig.allowed_workspaces.some(ws => {
      const resolvedWs = resolve(ws);
      return resolved.startsWith(resolvedWs);
    });
  }

  /**
   * Get the effective safety mode (parameter override or config default).
   */
  getEffectiveSafetyMode(override?: SafetyMode): SafetyMode {
    return override ?? this.securityConfig.default_safety_mode;
  }

  /**
   * Validate a workspace path. Throws if not allowed.
   */
  validateWorkspace(workspacePath: string): void {
    if (!this.isPathAllowed(workspacePath)) {
      throw new Error(
        `Workspace path "${workspacePath}" is not in allowed workspaces: ${this.securityConfig.allowed_workspaces.join(', ')}`,
      );
    }
    logger.debug({ path: workspacePath }, 'Workspace path validated');
  }
}
