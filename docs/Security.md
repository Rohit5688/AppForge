# 🛡️ Appium-Cucumber POM MCP Security Architecture

This document details the layered defensive security implementation of the Appium Cucumber POM MCP server. Because this server writes to disk, interfaces with Appium APIs, and executes shell commands, it utilizes multiple guards to prevent data leakage and sandbox escapes.

---

## 🏗️ Core Threats Addressed

1.  **Path Traversal & Sandbox Escape**: Preventing the AI from overwriting system files outside the project root.
2.  **Credential Leakage**: Preventing CI/CD secrets (e.g., BrowserStack tokens) from returning to the LLM context.
3.  **Command Injection**: Preventing hazardous characters from being spliced into `npx wdio` commands.
4.  **Insecure Code Generation**: Preventing the AI from generating `eval()` or `exec()` calls in test code.

---

## 🔒 Security Layers

### 1. Project Root Path Guard
Inside the `FileWriterService`, every requested target file is processed via `SecurityUtils.validateProjectRoot()`. This utility ensures that the final absolute path stays strictly within the `projectRoot` directory (e.g., preventing `../../etc/passwd`).

### 2. Output & Input Redaction
Before any terminal output (like a WebdriverIO test exception or a read `.env` file) is returned to the MCP client, it passes through `SecurityUtils.sanitizeForShell()`. This strips shell-dangerous characters (`; & | > < $`) from arguments before execution.

### 3. Generated Code Security Audit
Before the `validate_and_write` tool writes new files to disk, it performs a static analysis of the generated TypeScript:
*   **Dangerous Pattern Scan**: Looks for `eval()`, `child_process.exec()`, and raw `process.env` leakages.
*   **Secret Detection**: Scans for common credential patterns (API keys, passwords, tokens) in both `.ts` and `.feature` files.
*   **AI Warning**: If a violation is caught, the server returns a 🔒 **SECURITY AUDIT FAILURE** message to the AI, forcing it to regenerate the code using secure practices (e.g., using `dotenv`).

### 4. Atomic Backups & Dry-Run Mode
*   **Backups**: Every file overwrite is preceded by a snapshot save to `.appium-mcp/backups/`. 
*   **Dry-Run**: The `validate_and_write` tool supports a `dryRun: true` parameter. This allows the AI to "test" its generation against the security auditor and TypeScript compiler without ever touching the user's disk.

### 5. Config Control
Sensitive configuration files like `mcp-config.json` and `.env` are restricted. They can only be modified via the dedicated `manage_config` and `set_credentials` tools, which apply their own schema-level validation.

---

## 🛠️ Best Practices for Users
*   **Use `.env`**: Always store your Appium URL and Cloud credentials in the `.env` file via `set_credentials`.
*   **Check Audit Reports**: If the AI says "I had to regenerate the code due to security concerns," trust the tool—it likely caught a hardcoded password!
*   **Restrict Permissions**: Run the MCP server with the minimum necessary filesystem permissions for your project directory.
