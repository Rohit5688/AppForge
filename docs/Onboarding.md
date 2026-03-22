# 🚀 Appium-Cucumber MCP Onboarding & Configuration Guide

This guide provides the essential "First Contact" prompts and a configuration questionnaire to ensure the MCP tool is perfectly aligned with your project's unique mobile architecture.

---

## 1. The "First Contact" Prompts

When you connect this MCP to your AI assistant (e.g., Claude Desktop, Cursor, Antigravity), use these prompts sequentially to establish a solid foundation.

### Step 1: Smart Mobile Discovery
> "I want to integrate this MCP with my existing mobile project. Run `analyze_codebase` on `/your/project/path` to discover my existing Android and iOS Page Objects, step definitions, and environment configurations. If you find any existing `wdio.conf.ts` or `mcp-config.json` files, tell me how we can reuse them instead of creating new ones."

### Step 2: Environment Readiness Check
> "Check my environment using `check_environment`. Ensure the Appium server is reachable and tell me if I need to install any missing Android SDKs or iOS drivers. If my emulator isn't booted, please provide the exact command to start it."

### Step 3: Adaptive Upgrading
> "Based on your analysis, run `upgrade_project` to ensure my directory structure supports the latest Appium-Cucumber standards (like the `utils/MobileGestures.ts` and `.appium-mcp/` brain). Make sure you don't overwrite my existing capabilities if they work."

---

## 2. `mcp-config.json` Questionnaire

Before finalizing your setup, review this questionnaire. These values control how the AI thinks and writes mobile code for your team.

| Configuration Field | Your Decision | Example / Guide |
| :--- | :--- | :--- |
| **`defaultPlatform`** | Which OS do we test by default? | `"Android"`, `"iOS"`, or `"both"` (for dual-platform POMs). |
| **`capabilitiesProfiles`** | What devices are in your lab? | `{ "pixel8": { ... }, "iphone15": { ... } }` |
| **`locatorOrder`** | Which locators do we trust? | `["accessibility id", "resource-id", "text", "xpath"]` |
| **`paths`** | Where should files be saved? | `{ "featuresRoot": "features", "pagesRoot": "pages", ... }` |
| **`authStrategy`** | How do we handle login? | `"users-json"` (Recommended) or `"none"` for public apps. |
| **`projectRoot`** | Where is your actual code? | Absolute path to the mobile automation repo. |

---

## 3. The "Native First" Enforcement Rule

To prevent the AI from "taking shortcuts" (like using fragile XPaths in steps), always include this in your session instructions:

> "**ENFORCEMENT**: You must use the Page Object Model pattern. Every UI interaction must be encapsulated in a Page class method. Step definitions MUST NOT call `$(selector).click()` directly; they must call `await loginPage.submitForm()` or equivalents. Prioritize `accessibility id` (~ID) for all new locators to ensure cross-platform stability."

---

## 4. Why Use `MobileGestures.ts`?
The tool scaffolds a specialized `MobileGestures.ts` file. Instead of telling the AI to *"Swipe up using W3C actions"*, simply say:
> *"Use the `MobileGestures` utility to scroll until the 'Sign Out' button is visible."*

This ensures the generated code is clean, reusable, and handles the low-level coordinate math for you.
