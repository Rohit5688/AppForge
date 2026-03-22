/**
 * Structured error codes for predictable error handling and parsing.
 */
export enum ErrorCode {
  E001_CONFIG_NOT_FOUND = 'E001_CONFIG_NOT_FOUND',
  E002_CONFIG_INVALID = 'E002_CONFIG_INVALID',
  E003_APPIUM_UNREACHABLE = 'E003_APPIUM_UNREACHABLE',
  E004_VALIDATION_FAILED = 'E004_VALIDATION_FAILED',
  E005_FILE_WRITE_ERROR = 'E005_FILE_WRITE_ERROR',
  E006_SESSION_ACTIVE = 'E006_SESSION_ACTIVE',
  E007_SESSION_DEAD = 'E007_SESSION_DEAD',
  E999_UNKNOWN_ERROR = 'E999_UNKNOWN_ERROR'
}

/**
 * Base custom error class for the MCP server.
 */
export class McpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: any
  ) {
    super(`[${code}] ${message}`);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Config missing or malformed */
export class McpConfigError extends McpError {
  constructor(message: string, code: ErrorCode = ErrorCode.E002_CONFIG_INVALID, details?: any) {
    super(code, message, details);
  }
}

/** Appium session or connection issues */
export class AppiumConnectionError extends McpError {
  constructor(message: string, details?: any) {
    super(ErrorCode.E003_APPIUM_UNREACHABLE, message, details);
  }
}

/** Validation failed (TypeScript, Gherkin, etc.) */
export class ValidationError extends McpError {
  constructor(message: string, details?: any) {
    super(ErrorCode.E004_VALIDATION_FAILED, message, details);
  }
}
