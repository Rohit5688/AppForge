/**
 * SecurityUtils — Input sanitization and generated code auditing.
 * Prevents shell injection and dangerous code patterns.
 */

/** Characters that could cause shell injection */
const SHELL_DANGEROUS_CHARS = /[;&|`$(){}!<>\\]/g;

/**
 * Sanitizes a string intended for use in shell commands.
 * Removes dangerous characters that could cause shell injection.
 */
export function sanitizeForShell(input: string): string {
  return input.replace(SHELL_DANGEROUS_CHARS, '').trim();
}

/**
 * Validates a project root path is safe to use.
 * Must be an absolute path without shell metacharacters.
 */
export function validateProjectRoot(projectRoot: string): string {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required and must be a non-empty string.');
  }

  // Allow letters, numbers, slashes, colons (Windows), hyphens, underscores, dots, spaces
  const safePathRegex = /^[a-zA-Z0-9/\\:._\s-]+$/;
  if (!safePathRegex.test(projectRoot)) {
    throw new Error(
      `Invalid projectRoot path: "${projectRoot}". ` +
      `Path contains potentially dangerous characters. Only alphanumeric, /, \\, :, -, _, . are allowed.`
    );
  }

  return projectRoot;
}

/**
 * Audits generated TypeScript code for dangerous patterns.
 * Returns an array of warnings. Empty = safe.
 */
export function auditGeneratedCode(code: string, filePath: string): string[] {
  const warnings: string[] = [];

  const dangerousPatterns = [
    { pattern: /\beval\s*\(/, label: 'eval() call detected' },
    { pattern: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)/, label: 'require("child_process") detected' },
    { pattern: /\bexec\s*\(/, label: 'exec() call detected' },
    { pattern: /\bexecSync\s*\(/, label: 'execSync() call detected' },
    { pattern: /\bspawn\s*\(/, label: 'spawn() call detected' },
    { pattern: /process\.env\.\w+/, label: 'Direct process.env access (use .env file instead)' },
    { pattern: /\bFunction\s*\(/, label: 'Function() constructor detected' },
    { pattern: /\bimport\s*\(\s*['"`]child_process['"`]\s*\)/, label: 'Dynamic import of child_process' }
  ];

  for (const { pattern, label } of dangerousPatterns) {
    if (pattern.test(code)) {
      warnings.push(`⚠️ ${filePath}: ${label}`);
    }
  }

  return warnings;
}

/**
 * Checks if a .feature file leaks environment variables or secrets.
 */
export function auditFeatureFile(content: string, filePath: string): string[] {
  const warnings: string[] = [];

  // Check for hardcoded secrets patterns
  const secretPatterns = [
    { pattern: /password\s*[:=]\s*['"`][^'"]+['"`]/gi, label: 'Hardcoded password detected' },
    { pattern: /api[_-]?key\s*[:=]\s*['"`][^'"]+['"`]/gi, label: 'Hardcoded API key detected' },
    { pattern: /token\s*[:=]\s*['"`][a-zA-Z0-9]{20,}['"`]/gi, label: 'Hardcoded token detected' },
    { pattern: /secret\s*[:=]\s*['"`][^'"]+['"`]/gi, label: 'Hardcoded secret detected' }
  ];

  for (const { pattern, label } of secretPatterns) {
    if (pattern.test(content)) {
      warnings.push(`🔐 ${filePath}: ${label} — use environment variables via .env instead`);
    }
  }

  return warnings;
}
