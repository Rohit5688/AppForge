# 📱 Appium-Cucumber POM MCP: Ultimate User Guide

Welcome to the future of mobile automation! This guide will walk you through setting up, mastering, and troubleshooting your Appium-Cucumber MCP integration. No more fighting with brittle XPaths or complex Appium configs—let's get your mobile tests running at light speed. 🚀

---

## 🏗️ 1. Getting Started

### 🌟 New Project: From Zero to "Green" in 60 Seconds
If you're starting from scratch, the `setup_project` tool is your best friend.

1.  **Run the Tool**: Call `setup_project` with an empty directory.
2.  **What Happens?**: 
    *   Creates `features/`, `pages/`, `step-definitions/`, and `utils/` folders.
    *   Installs `webdriverio`, `@cucumber/cucumber`, and `ts-morph`.
    *   Scaffolds `wdio.conf.ts` and `tsconfig.json`.
    *   Generates `BasePage.ts`, `MobileGestures.ts`, and `MockServer.ts`.
    *   Creates a starter `mcp-config.json` with Android/iOS profiles.
3.  **Next Step**: Run `npx wdio run wdio.conf.ts` to see the example pass!

### 🔄 Existing Project: Bring the Magic to Your Code
Already have a WebdriverIO project? We'll adapt to *you*.

1.  **Run Analysis**: Call `analyze_codebase`.
2.  **Self-Healing Upgrade**: The MCP server will automatically detect your patterns and apply missing configurations like `mcp-config.json`.
3.  **Zero-Config Maintenance**: The `upgrade_project` tool ensures your dependencies stay up-to-date with current mobile automation standards.

---

## 🛠️ 2. The Power Tools in Your Belt

| Tool | Purpose | When to Use |
| :--- | :--- | :--- |
| `analyze_codebase` | 🔦 The Scout | Before generating new tests. It learns your Page Objects, steps, and naming conventions. |
| `generate_cucumber_pom` | ✍️ The Architect | When you have a new requirement. It prepares the system instructions for the AI. |
| `validate_and_write` | ✅ The Builder | After the AI generates code. It validates TypeScript/Gherkin and writes files safely. |
| \`start_appium_session\` | 👁️ The Visionary | To connect to a live device. Returns XML and screenshots for 100% accurate locators. |
| `self_heal_test` | 🩹 The Doc | If a test fails, run this. It analyzes the failure and tells the AI how to fix the broken locator. |
| `manage_users` | 👥 The Team Lead | To manage test credentials across `staging`, `prod`, etc. with typed helpers. |
| `analyze_coverage` | 📈 The Strategist | To identify gaps in your test suite and suggest missing negative/A11y scenarios. |
| `migrate_test` | 🚚 The Mover | To translate legacy Espresso/XCUITest/Detox tests into modern Appium Cucumber code. |

---

## 🧪 3. Real-World Power Examples

### 🚪 A. Cross-Platform POM (The Pro Way)
The tool enforces separate logic for Android and iOS when needed, while keeping the Gherkin shared.

**1. Generate the Page Object:**
Ask the AI: *"Create a Login page for both platforms."*

**2. What you get:**
- `pages/LoginPage.android.ts` (using `resource-id`)
- `pages/LoginPage.ios.ts` (using `accessibility-id`)
- Shared interface to keep step definitions clean!

### 🖱️ B. Advanced Gestures: Swipe & Scroll
No more complex W3C action code. Use our `MobileGestures` utility.

**Scenario**: Scroll down a settings list.
```gherkin
Scenario: Find Version Info
  Given I am on the "Settings" screen
  When I scroll down until I see "Version"
  Then I verify "Version" is displayed
```

**Implementation Tip**:
The AI will automatically use `MobileGestures.swipeUp()` or `scrollIntoView()` methods generated during setup.

### 🧠 C. Self-Healing in Action
Stale locator? No problem.
1. Test fails on `~submit_btn`.
2. Run `self_heal_test` with the output.
3. The tool starts a live session, grabs the XML, finds the element has moved to `id=com.app:id/submit_new`, and proposes the fix.
4. **Auto-Learning**: Once you verify the fix, the system saves it to its internal brain so it never breaks again.

---

## 🩹 4. Troubleshooting: The "Squash the Bug" Matrix 💥

| Symptom | Probable Root Cause | The Fix 🛠️ |
| :--- | :--- | :--- |
| `Appium not reachable` | Server not running. | Run `check_environment` to get the exact `appium` command to start the server. |
| `Undefined Step` | Regex mismatch. | Run `analyze_codebase`. If missing, tell the AI: *"The step 'X' is missing, please regenerate the step file."* |
| `Session creation failed` | Profile mismatch. | Check `mcp-config.json` profiles. Ensure `deviceName` matches your booted emulator. |
| `TSC Validation Error` | Syntax error in POM. | Use `validate_and_write` with `dryRun: true` first to see the exact TypeScript error. |
| `MockServer not working` | Target IP mismatch. | Use `MockServer.getBaseUrl()` helper. Android uses `10.0.2.2` instead of `localhost`. |

---

## 📝 5. Prompting Masterclass: How to Talk to the AI 🤖

### 📗 A. Live Context is King
*   **Prompt**: *"Start an Appium session, look at the current screen, and generate a login test based on what you see."*
*   **Best for**: High accuracy locators on new or changing screens.

### 📗 B. Migration Requests
*   **Prompt**: *"Here is an Espresso test `LoginActivityTest.java`. Please migrate it to Appium Cucumber using my existing Page Objects."*
*   **Best for**: Moving off legacy native frameworks.

### 📗 C. Coverage Strategy
*   **Prompt**: *"Analyze the coverage for my project. What negative scenarios am I missing for the checkout flow?"*
*   **Best for**: Quality assurance planning.

---

## ✅ 6. The "Dos & Don'ts" of AI Prompting

| Do 👍 | Don't 👎 |
| :--- | :--- |
| **Provide Profile Names**: Say *"Use the 'pixel8' profile"* to save the AI time. | **Hardcode Credentials**: Let the AI use `manage_users` and `.env` files. |
| **Mention Accessibility**: Ask for A11y checks to trigger `content-desc` validation. | **Ignored Environment Checks**: Always run `check_environment` before a big test run. |
| **Use Dry Runs**: Verify code structure before committing to disk. | **Manual Rewrites**: Let the AI heal. Hand-coded fixes won't be "learned" by the brain. |

---

> [!NOTE]
> **Pro Tip**: Use `generate_ci_workflow` to automatically get a GitHub Action that runs your Appium tests on every PR!

**Happy Mobile Testing! 📱✨**
