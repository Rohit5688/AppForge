# Phase 5 — Structural Gaps Plan

## Overview
Phase 5 addresses **Gaps 3-6** from the Production Readiness assessment. These are architectural improvements that enable reliable production deployment, team collaboration, and operational observability.

## Scope Summary
- **Gap 3:** Versioning & Changelog Management
- **Gap 4:** Consistent Error Contract
- **Gap 5:** Session Lifecycle Management
- **Gap 6:** Observability & Structured Logging
- **Estimated Effort:** 3-4 days AI + 2 days review
- **Recommended Model:** Claude Sonnet 4.5

---

## Phase 5.1 — Versioning & Changelog (Gap 3)

### Objective
Implement semantic versioning, tool manifest version field, and maintain a changelog so MCP clients can pin to stable behaviors and track breaking changes.

### Current State
- No version field in tool manifest
- No CHANGELOG.md
- Breaking changes invisible to MCP clients
- CI/CD cannot enforce version constraints
- No release process

### Target State
- Semantic versioning (MAJOR.MINOR.PATCH)
- `version` field in all tool schemas
- `CHANGELOG.md` following Keep a Changelog format
- Documented deprecation policy
- Automated version bump on release

---

## Versioning Architecture

### Version Management

```typescript
// src/version.ts

export const VERSION = '2.0.0';  // Manual bump for major releases
export const API_VERSION = 'v2';  // Stable API contract identifier

export interface VersionInfo {
  version: string;
  apiVersion: string;
  buildDate: string;
  commit: string;
}

export function getVersionInfo(): VersionInfo {
  return {
    version: VERSION,
    apiVersion: API_VERSION,
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    commit: process.env.GIT_COMMIT || 'dev'
  };
}
```

### Tool Manifest Integration

```typescript
// src/index.ts

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const versionInfo = getVersionInfo();
  
  return {
    tools: [
      {
        name: 'setup_project',
        version: versionInfo.version,  // Add version to each tool
        description: '...',
        inputSchema: { ... }
      },
      // ... all tools
    ],
    _meta: {
      serverVersion: versionInfo.version,
      apiVersion: versionInfo.apiVersion,
      buildDate: versionInfo.buildDate
    }
  };
});
```

### Changelog Structure

```markdown
# Changelog

All notable changes to AppForge MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New tools or features in development

### Changed
- Updates to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Vulnerability patches

---

## [2.0.0] - 2026-01-15

### Added
- Input validation middleware for all tools
- Comprehensive test suite (40+ tests)
- Session lifecycle management
- Structured logging with request tracing
- Version field in tool manifest

### Changed
- **BREAKING:** Error responses now use consistent `{ success: false, error: string, code: string }` format
- **BREAKING:** `wdio.conf.ts` import now respects `platform` parameter (Issue #16)
- `generate_cucumber_pom` prompt now correctly identifies framework as Appium/WebdriverIO (Issue #11)

### Fixed
- **SECURITY:** Shell injection via `tags` and `specificArgs` in `run_cucumber_test` (Issue #17)
- **SECURITY:** Sandbox bypass via `require` and `process` in `execute_sandbox_code` (Issue #19)
- **SECURITY:** Directory traversal in `validate_and_write` (CB-2)
- **SECURITY:** Shell injection via `projectRoot` parameter (CB-1)
- Path resolution bugs in `manage_users`, `suggest_refactorings`, `audit_utils` (Issues #14, #13, #20)
- Invalid selector generation in `inspect_ui_hierarchy` (Issue #15)
- TypeScript file writes before validation in `validate_and_write` (Issue #12)
- YAML selector parsing gaps in `audit_mobile_locators` (Issue #18)

### Deprecated
- Direct `execSync` usage (use validation middleware instead)

---

## [1.0.0] - 2025-12-01

### Added
- Initial MCP server release
- 30+ Appium automation tools
- Basic project setup and test generation
- Appium session management
```

### Deprecation Policy

```markdown
# Deprecation Policy

## Versioning Scheme
AppForge follows Semantic Versioning:
- **MAJOR:** Breaking changes to tool signatures or response formats
- **MINOR:** New tools or backward-compatible enhancements
- **PATCH:** Bug fixes with no API changes

## Breaking Change Process
1. **Deprecation Warning (MINOR release):**
   - Add deprecation notice to tool description
   - Log warning when deprecated feature is used
   - Update CHANGELOG.md with deprecation notice
   - Minimum 90-day deprecation period

2. **Breaking Change (MAJOR release):**
   - Remove deprecated feature
   - Update CHANGELOG.md with removal notice
   - Provide migration guide

## Example Deprecation
```typescript
// Version 1.5.0 — Deprecation warning
{
  name: 'old_tool_name',
  description: '⚠️ DEPRECATED: Use `new_tool_name` instead. Will be removed in v2.0.0.',
  // ... tool still works
}

// Version 2.0.0 — Removal
// old_tool_name removed from manifest
```

---

## Timeline

### Day 1: Version Infrastructure
| Hour | Task | Deliverable |
|------|------|-------------|
| 1-2 | Create version.ts | - `VERSION` constant<br>- `getVersionInfo()` function |
| 3-4 | Update tool manifest | - Version field on all tools<br>- `_meta` block with version info |
| 5-6 | Create CHANGELOG.md | - Full historical changelog<br>- Unreleased section template |
| 7-8 | Deprecation policy | - `DEPRECATION_POLICY.md`<br>- Warning log system |

---

## Phase 5.2 — Consistent Error Contract (Gap 4)

### Objective
Standardize error responses across all tools so MCP clients have a predictable error handling interface.

### Current State
- Some tools throw exceptions
- Some tools return `{ success: false, error: string }`
- Some tools return `{ error: string }` without `success` flag
- Error codes absent
- Stack traces leaked to clients

### Target State
- All tools return consistent response shape
- Never throw unhandled exceptions
- Error codes for programmatic handling
- User-friendly error messages
- Stack traces only in debug mode

---

## Error Contract Architecture

### Standard Response Types

```typescript
// src/types/Response.ts

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  executionTimeMs?: number;
}

export interface ErrorResponse {
  success: false;
  error: string;        // User-friendly message
  code: ErrorCode;      // Machine-readable error type
  details?: any;        // Additional context (optional)
  requestId?: string;   // For tracing
}

export type ToolResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export enum ErrorCode {
  // Validation errors (4xx equivalent)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_PATH = 'INVALID_PATH',
  INVALID_PLATFORM = 'INVALID_PLATFORM',
  MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',
  PATH_TRAVERSAL_DETECTED = 'PATH_TRAVERSAL_DETECTED',
  SHELL_INJECTION_DETECTED = 'SHELL_INJECTION_DETECTED',
  
  // Runtime errors (5xx equivalent)
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  TYPESCRIPT_COMPILATION_ERROR = 'TYPESCRIPT_COMPILATION_ERROR',
  APPIUM_SESSION_ERROR = 'APPIUM_SESSION_ERROR',
  COMMAND_EXECUTION_ERROR = 'COMMAND_EXECUTION_ERROR',
  
  // System errors
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}
```

### Error Factory

```typescript
// src/utils/ErrorFactory.ts

export class ErrorFactory {
  static validationError(message: string, details?: any): ErrorResponse {
    return {
      success: false,
      error: message,
      code: ErrorCode.VALIDATION_ERROR,
      details
    };
  }
  
  static pathTraversal(path: string): ErrorResponse {
    return {
      success: false,
      error: `Path traversal detected: ${path}`,
      code: ErrorCode.PATH_TRAVERSAL_DETECTED,
      details: { path }
    };
  }
  
  static fileNotFound(path: string): ErrorResponse {
    return {
      success: false,
      error: `File not found: ${path}`,
      code: ErrorCode.FILE_NOT_FOUND,
      details: { path }
    };
  }
  
  static shellInjection(parameter: string): ErrorResponse {
    return {
      success: false,
      error: `Shell injection detected in ${parameter}`,
      code: ErrorCode.SHELL_INJECTION_DETECTED,
      details: { parameter }
    };
  }
  
  static typescriptError(errors: string[]): ErrorResponse {
    return {
      success: false,
      error: 'TypeScript compilation failed',
      code: ErrorCode.TYPESCRIPT_COMPILATION_ERROR,
      details: { errors }
    };
  }
  
  static internalError(err: Error, includeStack = false): ErrorResponse {
    return {
      success: false,
      error: 'Internal server error',
      code: ErrorCode.INTERNAL_ERROR,
      details: includeStack ? { 
        message: err.message, 
        stack: err.stack 
      } : { message: err.message }
    };
  }
}
```

### Global Error Handler

```typescript
// src/utils/ErrorHandler.ts

export async function safeExecute<T>(
  toolName: string,
  handler: () => Promise<T>,
  requestId?: string
): Promise<ToolResponse<T>> {
  const startTime = Date.now();
  
  try {
    const result = await handler();
    const executionTimeMs = Date.now() - startTime;
    
    return {
      success: true,
      data: result,
      executionTimeMs
    };
    
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    
    // Known error with ErrorResponse shape
    if (isErrorResponse(error)) {
      return { ...error, requestId };
    }
    
    // Unexpected exception
    const includeStack = process.env.DEBUG === 'true';
    return {
      ...ErrorFactory.internalError(error as Error, includeStack),
      requestId
    };
  }
}

function isErrorResponse(obj: any): obj is ErrorResponse {
  return obj && obj.success === false && 'code' in obj;
}
```

### Handler Migration Example

```typescript
// BEFORE: Inconsistent error handling
export async function handleManageUsers(args: any) {
  if (!args.projectRoot) {
    throw new Error('projectRoot is required');  // ❌ Thrown exception
  }
  
  const usersFile = resolveUsersFile(args);
  if (!fs.existsSync(usersFile)) {
    return { error: 'File not found' };  // ❌ No success flag, no code
  }
  
  return readUsers(usersFile);  // ❌ What if this throws?
}

// AFTER: Consistent error contract
export async function handleManageUsers(args: any): Promise<ToolResponse> {
  return safeExecute('manage_users', async () => {
    // Validation middleware already ran, inputs are safe
    const { projectRoot, operation, environment } = args;
    
    const config = await loadConfig(projectRoot);
    const usersFile = resolveUsersFile(config, environment);
    
    if (!fs.existsSync(usersFile)) {
      return ErrorFactory.fileNotFound(usersFile);
    }
    
    const users = readUsers(usersFile);
    return users;  // Auto-wrapped in SuccessResponse by safeExecute
  });
}
```

---

## Timeline

### Day 2: Error Contract
| Hour | Task | Deliverable |
|------|------|-------------|
| 1-2 | Define response types | - `Response.ts` with types<br>- `ErrorCode` enum |
| 3-4 | Error factory | - `ErrorFactory.ts`<br>- Error creation helpers |
| 5-6 | Global handler | - `ErrorHandler.ts`<br>- `safeExecute()` wrapper |
| 7-8 | Migrate handlers | - Update 10 critical handlers<br>- Error contract tests |

### Day 3: Complete Migration
| Hour | Task | Deliverable |
|------|------|-------------|
| 1-4 | Migrate remaining handlers | - All 30+ handlers use error contract |
| 5-8 | Testing & validation | - Error response tests<br>- Client integration tests |

---

## Phase 5.3 — Session Lifecycle Management (Gap 5)

### Objective
Replace module-level session storage with a proper session manager that handles persistence, TTL, cleanup, and recovery.

### Current State
- Appium session stored in module-level variable
- No persistence across server restarts
- No session timeout/cleanup
- No way to list active sessions
- Memory leak if sessions not closed

### Target State
- Session manager with in-memory store
- Configurable session TTL (default 30 minutes)
- Automatic cleanup of expired sessions
- Graceful shutdown handler
- Session recovery on reconnect
- Optional Redis persistence for multi-instance

---

## Session Management Architecture

### Session Store

```typescript
// src/services/SessionStore.ts

export interface AppiumSession {
  sessionId: string;
  driver: WebdriverIO.Browser;
  capabilities: any;
  projectRoot: string;
  platform: 'android' | 'ios';
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

export class SessionStore {
  private sessions: Map<string, AppiumSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
  
  constructor(private ttlMs: number = this.DEFAULT_TTL_MS) {
    this.startCleanupTimer();
  }
  
  // Store session
  set(sessionId: string, session: Omit<AppiumSession, 'sessionId' | 'createdAt' | 'lastAccessedAt' | 'expiresAt'>): void {
    const now = new Date();
    this.sessions.set(sessionId, {
      sessionId,
      ...session,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs)
    });
  }
  
  // Get session and refresh TTL
  get(sessionId: string): AppiumSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    
    // Check expiration
    if (new Date() > session.expiresAt) {
      this.delete(sessionId);
      return undefined;
    }
    
    // Refresh TTL
    const now = new Date();
    session.lastAccessedAt = now;
    session.expiresAt = new Date(now.getTime() + this.ttlMs);
    
    return session;
  }
  
  // Remove session
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clean up driver
      session.driver.deleteSession().catch(err => {
        console.error(`Failed to delete Appium session ${sessionId}:`, err);
      });
    }
    return this.sessions.delete(sessionId);
  }
  
  // List all active sessions
  list(): AppiumSession[] {
    return Array.from(this.sessions.values())
      .filter(s => new Date() <= s.expiresAt);
  }
  
  // Cleanup expired sessions
  private cleanup(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        this.delete(sessionId);
      }
    }
  }
  
  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log(`Shutting down ${this.sessions.size} active sessions...`);
    
    const closePromises = Array.from(this.sessions.values()).map(async (session) => {
      try {
        await session.driver.deleteSession();
        console.log(`Session ${session.sessionId} closed`);
      } catch (err) {
        console.error(`Failed to close session ${session.sessionId}:`, err);
      }
    });
    
    await Promise.allSettled(closePromises);
    this.sessions.clear();
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
```

### Updated Session Handlers

```typescript
// src/handlers/startAppiumSession.ts

import { sessionStore } from '../services/SessionStore';

export async function handleStartAppiumSession(args: any): Promise<ToolResponse> {
  return safeExecute('start_appium_session', async () => {
    const { projectRoot, profileName } = args;
    
    const config = await loadConfig(projectRoot);
    const capabilities = resolveCapabilities(config, profileName);
    
    // Start Appium session
    const driver = await remote({ capabilities });
    const sessionId = driver.sessionId;
    
    // Store in session manager
    sessionStore.set(sessionId, {
      driver,
      capabilities,
      projectRoot,
      platform: capabilities.platformName.toLowerCase(),
    });
    
    // Return session info
    const pageSource = await driver.getPageSource();
    const screenshot = await driver.takeScreenshot();
    
    return {
      sessionId,
      deviceName: capabilities.deviceName,
      platformVersion: capabilities.platformVersion,
      pageSource,
      screenshot,
      expiresIn: '30 minutes'
    };
  });
}
```

### Graceful Shutdown Hook

```typescript
// src/index.ts

import { sessionStore } from './services/SessionStore';

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await sessionStore.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await sessionStore.shutdown();
  process.exit(0);
});
```

---

## Timeline

### Day 4: Session Management
| Hour | Task | Deliverable |
|------|------|-------------|
| 1-2 | Session store | - `SessionStore.ts`<br>- TTL and cleanup logic |
| 3-4 | Update session handlers | - `start_appium_session`<br>- `end_appium_session`<br>- `verify_selector` |
| 5-6 | Graceful shutdown | - Shutdown hooks<br>- Session cleanup on exit |
| 7-8 | Testing | - Session lifecycle tests<br>- TTL expiration tests |

---

## Phase 5.4 — Observability & Logging (Gap 6)

### Objective
Implement structured logging and request tracing so operations teams can diagnose issues in production.

### Current State
- No structured logs
- `console.log` scattered throughout
- No request correlation
- No performance metrics
- Cannot debug CI failures post-hoc

### Target State
- Structured JSON logging
- Request ID for tracing
- Performance metrics per tool
- Log levels (DEBUG, INFO, WARN, ERROR)
- Optional log streaming to external services

---

## Observability Architecture

### Structured Logger

```typescript
// src/utils/Logger.ts

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  toolName?: string;
  projectRoot?: string;
  durationMs?: number;
  error?: any;
  metadata?: Record<string, any>;
}

export class Logger {
  private level: LogLevel;
  
  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }
  
  private log(level: LogLevel, levelName: string, message: string, context?: Partial<LogEntry>): void {
    if (level < this.level) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      ...context
    };
    
    // Structured JSON output
    console.log(JSON.stringify(entry));
  }
  
  debug(message: string, context?: Partial<LogEntry>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context);
  }
  
  info(message: string, context?: Partial<LogEntry>): void {
    this.log(LogLevel.INFO, 'INFO', message, context);
  }
  
  warn(message: string, context?: Partial<LogEntry>): void {
    this.log(LogLevel.WARN, 'WARN', message, context);
  }
  
  error(message: string, context?: Partial<LogEntry>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, context);
  }
}

// Singleton logger
export const logger = new Logger(
  process.env.LOG_LEVEL === 'DEBUG' ? LogLevel.DEBUG : LogLevel.INFO
);
```

### Request Tracing Middleware

```typescript
// src/utils/RequestTracer.ts

import { randomUUID } from 'crypto';
import { logger } from './Logger';

export class RequestTracer {
  static generateRequestId(): string {
    return randomUUID();
  }
  
  static async traceRequest<T>(
    toolName: string,
    args: any,
    handler: (requestId: string) => Promise<T>
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    logger.info(`Tool invocation started`, {
      requestId,
      toolName,
      projectRoot: args.projectRoot,
      metadata: { arguments: this.sanitizeArgs(args) }
    });
    
    try {
      const result = await handler(requestId);
      const durationMs = Date.now() - startTime;
      
      logger.info(`Tool invocation succeeded`, {
        requestId,
        toolName,
        durationMs,
        metadata: { resultSize: JSON.stringify(result).length }
      });
      
      return result;
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      logger.error(`Tool invocation failed`, {
        requestId,
        toolName,
        durationMs,
        error: {
          message: (error as Error).message,
          code: (error as any).code
        }
      });
      
      throw error;
    }
  }
  
  private static sanitizeArgs(args: any): any {
    // Remove sensitive data from logs
    const sanitized = { ...args };
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret'];
    
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }
}
```

### Handler Integration

```typescript
// Wrap handlers with tracing
export async function handleSetupProject(args: any): Promise<ToolResponse> {
  return RequestTracer.traceRequest('setup_project', args, async (requestId) => {
    return safeExecute('setup_project', async () => {
      // Handler logic here
      logger.debug('Creating project structure', { requestId, projectRoot: args.projectRoot });
      
      // ... implementation
      
      logger.info('Project created successfully', { requestId, projectRoot: args.projectRoot });
      return { projectPath: args.projectRoot };
    });
  });
}
```

### Performance Metrics

```typescript
// src/utils/Metrics.ts

export class Metrics {
  private static toolMetrics: Map<string, {
    totalCalls: number;
    totalDurationMs: number;
    successCount: number;
    errorCount: number;
  }> = new Map();
  
  static recordToolExecution(
    toolName: string,
    durationMs: number,
    success: boolean
  ): void {
    if (!this.toolMetrics.has(toolName)) {
      this.toolMetrics.set(toolName, {
        totalCalls: 0,
        totalDurationMs: 0,
        successCount: 0,
        errorCount: 0
      });
    }
    
    const metrics = this.toolMetrics.get(toolName)!;
    metrics.totalCalls++;
    metrics.totalDurationMs += durationMs;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }
  }
  
  static getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [toolName, metrics] of this.toolMetrics.entries()) {
      result[toolName] = {
        ...metrics,
        avgDurationMs: Math.round(metrics.totalDurationMs / metrics.totalCalls),
        successRate: (metrics.successCount / metrics.totalCalls * 100).toFixed(2) + '%'
      };
    }
    
    return result;
  }
  
  static reset(): void {
    this.toolMetrics.clear();
  }
}
```

### Metrics Endpoint

```typescript
// Add to index.ts for optional metrics endpoint
import express from 'express';

if (process.env.ENABLE_METRICS === 'true') {
  const app = express();
  
  app.get('/metrics', (req, res) => {
    res.json({
      metrics: Metrics.getMetrics(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeSessions: sessionStore.list().length
    });
  });
  
  app.listen(9090, () => {
    logger.info('Metrics server started', { metadata: { port: 9090 } });
  });
}
```

---

## Timeline

### Day 5-6: Observability
| Day | Task | Deliverable |
|-----|------|-------------|
| **Day 5** (Hours 1-4) | Structured logging | - `Logger.ts`<br>- JSON log format<br>- Log levels |
| **Day 5** (Hours 5-8) | Request tracing | - `RequestTracer.ts`<br>- Request ID generation<br>- Trace 10 handlers |
| **Day 6** (Hours 1-4) | Performance metrics | - `Metrics.ts`<br>- Metrics endpoint<br>- Tool execution tracking |
| **Day 6** (Hours 5-8) | Testing & integration | - Logging tests<br>- Metrics tests<br>- Update all handlers |

---

## Success Criteria

### Gap 3: Versioning & Changelog
- ✅ Version field in all tool schemas
- ✅ `CHANGELOG.md` with full history
- ✅ `DEPRECATION_POLICY.md` documented
- ✅ Automated version bump in CI/CD
- ✅ Breaking changes clearly documented

### Gap 4: Error Contract
- ✅ All handlers return consistent response shape
- ✅ Zero unhandled exceptions
- ✅ Error codes for all failure types
- ✅ User-friendly error messages
- ✅ Stack traces only in debug mode

### Gap 5: Session Management
- ✅ Session store with TTL
- ✅ Automatic cleanup of expired sessions
- ✅ Graceful shutdown handler
- ✅ No memory leaks from unclosed sessions
- ✅ Session recovery on reconnect

### Gap 6: Observability
- ✅ Structured JSON logging
- ✅ Request ID tracing
- ✅ Performance metrics per tool
- ✅ Configurable log levels
- ✅ Metrics endpoint available

---

## Review Process

### Architecture Review Checklist
- [ ] Version scheme follows semantic versioning
- [ ] Error responses are consistent across all tools
- [ ] Session lifecycle management is robust
- [ ] Logging does not expose sensitive data
- [ ] Metrics do not impact performance

### Code Review Checklist
- [ ] All handlers use error contract
- [ ] All handlers use request tracing
- [ ] Session store handles edge cases (timeout, reconnect)
- [ ] Logger sanitizes sensitive fields
- [ ] Metrics are accurate and useful

### Documentation Review
- [ ] CHANGELOG.md is complete and accurate
- [ ] DEPRECATION_POLICY.md is clear
- [ ] Error codes are documented
- [ ] Log format is documented
- [ ] Metrics endpoint is documented

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes in v2.0 | MCP clients break | Document migration guide; provide backward-compat shim for 90 days |
| Logging overhead | Performance degradation | Use async logging; configurable log levels |
| Session store memory leak | Server OOM | Enforce TTL; monitor memory usage; add Redis option for scale |
| Metrics endpoint security | Data exposure | Require auth token; bind to localhost only |

---

## Dependencies

### Phase 5.1-5.2 (Versioning & Errors)
- No new dependencies
- Uses Node.js built-ins

### Phase 5.3 (Session Management)
- No new dependencies (in-memory)
- Optional: `ioredis` for Redis persistence

### Phase 5.4 (Observability)
- Optional: `express` for metrics endpoint
- Optional: `pino` for high-performance logging

---

## Deliverables

### Phase 5.1
1. **Version Management**
   - `src/version.ts`
   - `CHANGELOG.md`
   - `DEPRECATION_POLICY.md`

### Phase 5.2
1. **Error Contract**
   - `src/types/Response.ts`
   - `src/utils/ErrorFactory.ts`
   - `src/utils/ErrorHandler.ts`
2. **Updated Handlers** (all 30+ tools)

### Phase 5.3
1. **Session Management**
   - `src/services/SessionStore.ts`
   - Updated session handlers
   - Shutdown hooks

### Phase 5.4
1. **Observability**
   - `src/utils/Logger.ts`
   - `src/utils/RequestTracer.ts`
   - `src/utils/Metrics.ts`
   - Optional metrics endpoint

---

## Post-Phase 5 Verification

Run these commands to verify completion:

```bash
# Verify version is exposed
npm run build && node dist/index.js --version

# Verify error contract
npm test -- Response.test.ts

# Verify session lifecycle
npm test -- SessionStore.test.ts

# Verify logging
LOG_LEVEL=DEBUG npm start 2>&1 | jq -r '.message'

# Verify metrics (if enabled)
curl http://localhost:9090/metrics | jq
```

**Expected Output:**
- ✅ Version number displayed
- ✅ All error tests passing
- ✅ Session tests passing
- ✅ Structured JSON logs
- ✅ Metrics endpoint responding

---

## Integration with Phase 4

Phase 5 builds on Phase 4 deliverables:
- Error contract uses validation middleware (Phase 4.2)
- All handlers have tests (Phase 4.1)
- Logging captures validation failures
- Metrics track test execution

---

## Production Readiness Checklist

After completing Phase 5:

### Deployment
- [ ] Version number in tool manifest
- [ ] CHANGELOG.md updated
- [ ] Error responses consistent
- [ ] Session cleanup on shutdown
- [ ] Structured logging enabled

### Operations
- [ ] Log aggregation configured (ELK, Datadog, etc.)
- [ ] Metrics dashboard created
- [ ] Alerting on error rates
- [ ] Session timeout monitoring
- [ ] Version pinning in clients

### Documentation
- [ ] CHANGELOG.md maintained
- [ ] DEPRECATION_POLICY.md published
- [ ] Error codes documented
- [ ] Log format documented
- [ ] Metrics endpoint documented

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-04  
**Status:** READY FOR IMPLEMENTATION  
**Previous Phase:** [Phase 4 — Test Suite & Validation](./PHASE4_TEST_SUITE_PLAN.md)  
**Total Estimated Time:** Phase 4 (5-6 days) + Phase 5 (5-6 days) = **10-12 days total**