/**
 * Best-effort guard against obviously destructive shell commands.
 *
 * IMPORTANT: this is a safety net for non-autonomous modes, NOT a sandbox.
 * A determined model can bypass pattern matching. For real isolation run the
 * orchestrator in a container/VM, or use `safe` mode (which blocks shell_exec).
 */

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+(\/\*?|~\/?\*?|\*|\$HOME\/?\*?)(\s|$)/i, reason: 'recursive delete of root/home' },
  { pattern: /\brm\s+-[a-z]*r[a-z]*\s+.*--no-preserve-root/i, reason: 'rm --no-preserve-root' },
  { pattern: /\b(del|erase)\s+(\/[a-z]\s+)*[a-z]:\\?\*?(\s|$)/i, reason: 'drive-wide delete' },
  { pattern: /\brd\s+\/s\b.*[a-z]:\\(\s|$)/i, reason: 'recursive directory removal at drive root' },
  { pattern: /\bformat\s+[a-z]:/i, reason: 'disk format' },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: 'filesystem creation' },
  { pattern: /\bdd\s+[^|;&]*\bof=\/dev\//i, reason: 'raw device write' },
  { pattern: />\s*\/dev\/(sd|nvme|disk|hd)\w*/i, reason: 'raw device write' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'fork bomb' },
  { pattern: /\b(curl|wget|iwr|Invoke-WebRequest)\b[^|;&]*\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell|iex)\b/i, reason: 'piping downloaded content into a shell' },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: 'system shutdown/reboot' },
  { pattern: /\bchmod\s+(-R\s+)?[0-7]*777\s+\//i, reason: 'recursive world-writable permissions on root' },
  { pattern: /\bgit\s+push\b[^|;&]*--force\b/i, reason: 'git force push' },
];

/**
 * Returns a human-readable reason if the command matches a dangerous pattern,
 * otherwise null.
 */
export function findDangerousCommand(command: string): string | null {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return reason;
  }
  return null;
}
