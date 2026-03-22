# 👥 Team Collaboration & Mobile Learning

The Appium-Cucumber MCP Server doesn't just write code—it **Learns** from your mobile team's unique patterns. Mobile testing is full of tribal knowledge (e.g., "Always wait for the splash screen animation before clicking 'Login'"), and this MCP has a persistent memory (`.appium-mcp/mcp-learning.json`) to capture it.

---

## 🧠 Continuous Learning Loop

### 1. `train_on_example`
If the AI generates a locator or a swipe gesture that doesn't quite work for your app's unique UI, you can explicitly teach it the "Gold Standard" fix.

*   **issuePattern**: e.g., "Scrolling to 'Terms of Service'"
*   **solution**: e.g., "Use `MobileGestures.scrollUntilVisible('~tos_link')` instead of a raw swipe."

**Example Prompt to AI:**
> *"I noticed you tried to click the button by text, but in our app, we must use resource-id for buttons on the Home screen. Train yourself on this example."*

### 2. Auto-Learning from Self-Healing
When you use `verify_selector` to confirm a healed locator works on a live device, the tool **automatically** saves that fix into the project brain. You don't even have to ask!

---

## 🏷️ The `@mcp-learn` Scanner
Developers can leave "Rule Zero" comments directly in TypeScript Page Objects or Feature files. During `analyze_codebase`, the MCP server extracts these and injects them into the AI's prompt context.

```typescript
// @mcp-learn: On the 'Payment' screen, always call 'waitForLoader()' before clicking 'Pay'
async submitPayment() { ... }
```

---

## 📄 `export_team_knowledge`
As your mobile automation suite grows, so does the `.appium-mcp/mcp-learning.json` brain. You can convert this raw data into a human-readable Markdown document (`docs/team-knowledge.md`) for your team to review.

**Example Prompt to AI:**
> *"Export your current team knowledge base. I want to see a summary of all the mobile-specific rules you've learned so far."*

---

## 🤝 Benefits for the Team
*   **Faster Onboarding**: New engineers can read the `team-knowledge.md` to understand the app's automation quirks.
*   **Style Consistency**: The AI will maintain the same coding style (naming conventions, folder structure) as the rest of the team.
*   **Reduced Flakiness**: By learning which locators are unstable, the AI proactively avoids them in future test generation.
