# 🚀 Execution & Self-Healing: The Mobile Loop

The Appium-Cucumber MCP doesn't just write code—it drives live device sessions, analyzes terminal output, and heals broken mobile locators automatically using real-time device XML and screenshots.

---

## 🏃 `run_cucumber_test`
Fires a Node subprocess to execute `npx wdio run wdio.conf.ts`. The tool sanitizes the CLI output (hiding secrets) and returns the test suite result in a structured format (Pass/Fail count, duration).

**Example Prompt to AI:**
> *"Run the Appium tests for the Android profile. Only run scenarios tagged with `@smoke`."*

---

## 🩹 `self_heal_test`
When a test fails because a locator breaks (e.g., a developer changed `~submit_btn` to `id=com.app:id/submit_new`), this tool acts as an automated triage.

1.  **Classification**: Analyzes `stderr` to determine if the failure is a **SCRIPTING issue** (broken locator) or an **APPLICATION BUG** (assertion mismatch).
2.  **Live Snapshot**: If it's a locator timeout, the tool leverages `start_appium_session` to grab the current screen's XML and a Base64 screenshot.
3.  **Healing**: It compares the live XML hierarchy against the failing code, providing the LLM with the *exact* new selector required to fix the Page Object.

**Example Prompt to AI:**
> *"My login test just failed. Use the self-healing tool to scrape the live device XML and figure out the correct accessibility-id for the password field."*

---

## 👁️ `start_appium_session` & `inspect_ui_hierarchy`
Use these tools to connect to a real emulator/simulator and dump a simplified, interactable UI tree. Use this **BEFORE** writing new Page Objects to ensure 100% selector accuracy.

*   **`start_appium_session`**: Creates the WebdriverIO connection and returns the initial state.
*   **`inspect_ui_hierarchy`**: Returns the raw XML tree and takes a visual screenshot.

**Example Prompt to AI:**
> *"Start an Appium session and inspect the UI hierarchy on the 'Dashboard' screen. Find the precise resource-id for the user profile icon."*

---

## ✅ `verify_selector`
A "sanity check" tool. After the AI proposes a healed selector, use `verify_selector` to instantly check if that element is truly visible on the device before updating your code.

**Example Prompt to AI:**
> *"I've found a new selector `~login_v2`. Verify this selector on the live device and, if it works, auto-learn the fix into the project brain."*

---

## 🧠 Auto-Learning Brain
Successfully verified heals are saved to the project's knowledge base. The MCP server proactively injects these "learned rules" into future generation prompts, ensuring the AI avoids known brittle areas and never makes the same mistake twice.
