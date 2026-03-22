/**
 * Structured error codes for predictable error handling and parsing.
 */
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["E001_CONFIG_NOT_FOUND"] = "E001_CONFIG_NOT_FOUND";
    ErrorCode["E002_CONFIG_INVALID"] = "E002_CONFIG_INVALID";
    ErrorCode["E003_APPIUM_UNREACHABLE"] = "E003_APPIUM_UNREACHABLE";
    ErrorCode["E004_VALIDATION_FAILED"] = "E004_VALIDATION_FAILED";
    ErrorCode["E005_FILE_WRITE_ERROR"] = "E005_FILE_WRITE_ERROR";
    ErrorCode["E006_SESSION_ACTIVE"] = "E006_SESSION_ACTIVE";
    ErrorCode["E007_SESSION_DEAD"] = "E007_SESSION_DEAD";
    ErrorCode["E999_UNKNOWN_ERROR"] = "E999_UNKNOWN_ERROR";
})(ErrorCode || (ErrorCode = {}));
/**
 * Base custom error class for the MCP server.
 */
export class McpError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(`[${code}] ${message}`);
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
/** Config missing or malformed */
export class McpConfigError extends McpError {
    constructor(message, code = ErrorCode.E002_CONFIG_INVALID, details) {
        super(code, message, details);
    }
}
/** Appium session or connection issues */
export class AppiumConnectionError extends McpError {
    constructor(message, details) {
        super(ErrorCode.E003_APPIUM_UNREACHABLE, message, details);
    }
}
/** Validation failed (TypeScript, Gherkin, etc.) */
export class ValidationError extends McpError {
    constructor(message, details) {
        super(ErrorCode.E004_VALIDATION_FAILED, message, details);
    }
}
