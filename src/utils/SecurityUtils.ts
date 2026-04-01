/**
 * SecurityUtils — Input sanitization and generated code auditing.
 * Prevents shell injection, directory traversal, and dangerous code patterns.
 */

import * as path from 'path';

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
 * CB-2 FIX: Validates that a file path stays within the project root directory.
 * Prevents directory traversal attacks via path components like '../' or absolute paths.
 * 
 * @param projectRoot - The validated project root directory (absolute path)
 * @param filePath - The relative file path to validate (from MCP client)
 * @returns The validated file path if safe
 * @throws Error if the resolved path would escape projectRoot
 * 
 * @example
 * // Safe paths - stay within project
 * validateFilePath('/home/user/project', 'src/test.ts') // ✓ OK
 * validateFilePath('/home/user/project', 'src/pages/Login.ts') // ✓ OK
 * validateFilePath('/home/user/project', './src/test.ts') // ✓ OK
 * 
 * // Dangerous paths - attempted traversal
 * validateFilePath('/home/user/project', '../../.ssh/authorized_keys') // ✗ Throws
 * validateFilePath('/home/user/project', '/etc/passwd') // ✗ Throws
 * validateFilePath('/home/user/project', '../../../etc/shadow') // ✗ Throws
 */
export function validateFilePath(projectRoot: string, filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path is required and must be a non-empty string.');
  }

  // First check: reject absolute paths immediately (before resolution)
  if (path.isAbsolute(filePath)) {
    throw new Error(
      `Absolute file paths are not allowed: "${filePath}". ` +
      `Please provide a relative path within the project directory.`
    );
  }

  // Resolve both paths to absolute normalized paths
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedFilePath = path.resolve(projectRoot, filePath);

  // Check if the resolved file path starts with the project root
  // This prevents directory traversal attacks (including normalized paths with ./ and ../)
  if (!resolvedFilePath.startsWith(resolvedProjectRoot + path.sep) && 
      resolvedFilePath !== resolvedProjectRoot) {
    throw new Error(
      `Path traversal detected: File path "${filePath}" resolves to "${resolvedFilePath}" ` +
      `which is outside the project root "${resolvedProjectRoot}". ` +
      `Only paths within the project directory are allowed.`
    );
  }

  return filePath;
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