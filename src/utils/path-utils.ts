import { realpathSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Expand leading `~` or `~/...` to the user's home directory across Linux, macOS, and Windows.
 */
export function expandHome(filepath: string): string {
  if (filepath === '~') {
    return homedir();
  }
  if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
    return path.join(homedir(), filepath.slice(2));
  }
  return filepath;
}

/**
 * Resolve a target path against an optional base path, expanding `~` and resolving symlinks
 * when the path exists on disk.
 */
export function resolveCrossPlatformPath(targetPath: string, basePath?: string): string {
  const expandedTarget = expandHome(targetPath);
  const resolved = basePath
    ? path.resolve(expandHome(basePath), expandedTarget)
    : path.resolve(expandedTarget);

  try {
    if (existsSync(resolved)) {
      return realpathSync(resolved);
    }
    const parentDir = path.dirname(resolved);
    if (existsSync(parentDir)) {
      return path.join(realpathSync(parentDir), path.basename(resolved));
    }
  } catch {
    // Fallback to lexical resolution if realpath fails due to permissions
  }

  return resolved;
}

/**
 * Safely check whether `targetPath` is inside `rootPath` across Linux, macOS, and Windows.
 * Prevents sibling prefix bypasses (e.g. `/work-secret` matching `/work`) and handles
 * case-insensitive filesystems on Windows and macOS.
 */
export function isPathInside(targetPath: string, rootPath: string): boolean {
  // Ignore Windows drive-letter roots (like "C:/" or "D:/") when running on Linux/macOS
  if (process.platform !== 'win32' && /^[a-zA-Z]:[/\\]?$/.test(rootPath.trim())) {
    return false;
  }

  let resolvedTarget = resolveCrossPlatformPath(targetPath);
  let resolvedRoot = resolveCrossPlatformPath(rootPath);

  if (process.platform === 'win32' || process.platform === 'darwin') {
    resolvedTarget = resolvedTarget.toLowerCase();
    resolvedRoot = resolvedRoot.toLowerCase();
  }

  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel === '') return true;

  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Validate that `targetPath` (resolved relative to `workspacePath`) stays within `workspacePath`.
 * Returns the resolved absolute path or throws an Error.
 */
export function validateWorkspacePath(targetPath: string, workspacePath: string): string {
  const resolvedWorkspace = resolveCrossPlatformPath(workspacePath);
  const resolvedTarget = resolveCrossPlatformPath(targetPath, resolvedWorkspace);

  if (!isPathInside(resolvedTarget, resolvedWorkspace)) {
    throw new Error(`Path ${targetPath} is outside of workspace ${workspacePath}`);
  }
  return resolvedTarget;
}
