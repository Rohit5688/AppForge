# 🗺️ Appium-Cucumber POM MCP Implementation Plan (Revised)

This document outlines the architectural enhancements and development phases of the Appium-Cucumber POM MCP server, focusing on project bridging, live mobile sessions, and advanced AI-driven testing patterns.

---

## 🏗️ Architecture & Philosophy
*   **Custom Orchestrator Chassis**: Reuse routing patterns from the high-performance Playwright MCP project.
*   **Multi-Modal Self-Healing**: Pair Appium XML dumps with **Base64 Device Screenshots** for LLM Vision healing.
*   **Mobile First**: Native scaffolding for `MobileGestures.ts` (W3C Actions), `BasePage.ts`, and `MockServer.ts`.
*   **Locator Stability**: Enforced `accessibility-id` priority with automated "Developer Ticket Reports" for brittle XPaths.

---

## 📋 Development Phases

### Phase 1: Base Setup & MCP Discovery ✅
*   Initialize TypeScript repository with `@modelcontextprotocol/sdk`.
*   Implement `setup_project` for full framework scaffolding.
*   Scaffold `MobileGestures.ts` and `MockServer.ts`.

### Phase 2: Configuration & App Provisioning ✅
*   Implement `manage_config` for complex Appium capabilities.
*   Add native Cloud Device abstraction (BrowserStack/SauceLabs).
*   Implement `inject_app_build` for `.apk` and `.ipa` tracking.

### Phase R1-R4: Remediation & Core Fixes ✅
*   **R1**: Fix `ProjectSetupService` missing `cucumber.js`, `tsconfig.json`, and hooks.
*   **R2**: Restructure `TestGenerationService` for structured JSON output.
*   **R3**: Implement `ts-morph` AST parsing for codebase analysis.
*   **R4**: Fix `SelfHealingService` to utilize XML parsing and Vision prompts.

### Phase 9: Live Appium Session Integration ✅
*   **9.1**: Create `AppiumSessionService` (startSession, getPageSource, screenshot).
*   **9.2**: Auto-fetch XML in `inspect_ui_hierarchy`.
*   **9.3**: Integrate Appium lifecycle with `run_cucumber_test`.
*   **9.4**: Close self-healing loop—verify fixes via live session.

### Phase 10: Hardening & Real-World Validation ✅
*   **10.4**: Fix MockServer localhost reachability (10.0.2.2 for Android).
*   **10.6**: Enforce Cross-platform POM rules (`.android.ts` / `.ios.ts`).
*   **10.8**: Actionable error messages and environment fix hints.

### Phase 11: Robustness, Security & Transport ✅
*   **11.1**: Add SSE (Server-Sent Events) transport option.
*   **11.3**: Generated code security audits (eval, exec, secrets).
*   **11.4**: `--dry-run` mode for `validate_and_write`.
*   **11.6**: Automatic file backups before overwrites.
*   **11.9**: Idempotent `upgrade_project` tool.

### Phase 12: Advanced Intelligence ✅
*   **12.1**: Screen-context-aware generation (Screenshot + XML).
*   **12.4**: Coverage gap analysis and heatmap generation.
*   **12.7**: Multi-framework migration (Espresso, XCUITest, Detox).
*   **12.10**: Auto-learning brain for verified selector fixes.

---

## 🚀 Future Roadmap (Phase 13+)

*   **Phase 13: ADB/Xcode Direct Control**: Deep integration for clearing app data, Granting permissions, and Biometric simulation.
*   **Phase 14: Visual Regression**: AI-driven visual baseline verification for native components.
*   **Phase 15: Device Farm Orchestration**: Managing parallel execution across multiple local/remote devices.
*   **Phase 16: Interactive Debugger**: An MCP tool that stays "connected" to a session, allowing users to send one-off Appium commands via chat.
