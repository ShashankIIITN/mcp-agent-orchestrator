import { createLogger } from '../utils/logger.js';
import { isPathInside } from '../utils/path-utils.js';
import type { SecurityConfig, SafetyMode } from '../config/schema.js';

const logger = createLogger('policy-engine');

export class PolicyEngine {
  constructor(private securityConfig: SecurityConfig) {}

  /**
   * Check if a given path is within the allowed workspaces.
   * Works on Linux, macOS and Windows (supports `~`, symlinks, and ignores
   * Windows drive-letter entries like "D:/" when running on Unix).
   */
  isPathAllowed(targetPath: string): boolean {
    return this.securityConfig.allowed_workspaces.some(ws => isPathInside(targetPath, ws));
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
