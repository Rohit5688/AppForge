# 🚚 Legacy Migration Guide: Native to Appium

Porting legacy native mobile tests (Espresso, XCUITest, Detox) to modern Appium-Cucumber is notoriously difficult due to fundamental differences in locator strategies, synchronization, and execution environments.

The Appium-Cucumber MCP Server solves this using a **Heuristic Migration Engine**. By leveraging the `migrate_test` tool, the AI acts as a translation compiler that understands logical flow paradigms, not just 1-to-1 syntax mapping.

---

## 🚀 How to Start a Migration

You do **not** need to manually convert files line-by-line. Instead, you provide the AI with your legacy source code and specify the source framework.

### Prerequisites
1.  **Source Code**: The legacy `.java` (Espresso), `.swift` (XCUITest), or `.js` (Detox) file.
2.  **Framework Info**: Specify the source framework (`espresso`, `xcuitest`, or `detox`).

### Recommended Workflow Prompt
> *"I want to migrate this Espresso Java test for our login screen: [paste code]. Use the `migrate_test` tool with `sourceFramework: espresso`. Rewrite this as a TypeScript Appium Page Object and a Gherkin feature file."*

---

## 🧠 Engine Mapping Logic

The `migrate_test` tool enforces strict architectural transformations based on the source framework.

### 1. Espresso (Java / Android)
*   **Locators**: `withId(R.id.name)` → `$('id=com.app:id/name')`
*   **Actions**: `perform(typeText("..."))` → `await element.setValue("...")`
*   **Assertions**: `check(matches(isDisplayed()))` → `await expect(element).toBeDisplayed()`

### 2. XCUITest (Swift / iOS)
*   **Locators**: `app.buttons["Login"]` → `$('~Login')`
*   **Actions**: `.tap()` → `await element.click()`
*   **Assertions**: `XCTAssertTrue(.exists)` → `await expect(element).toExist()`

### 3. Detox (JS / Cross-Platform)
*   **Locators**: `by.id('testID')` → `$('~testID')`
*   **Actions**: `.typeText("...")` → `await element.setValue("...")`
*   **Assertions**: `.toBeVisible()` → `await expect(element).toBeDisplayed()`

---

## 🛠️ The Migration Result

When you use the `migrate_test` tool, the AI is instructed to deconstruct the legacy test into the **Appium MCP triad**:

1.  **Feature File**: Captures the business behavior in Given/When/Then steps.
2.  **Page Object**: Encapsulates the Appium locators and interactions in a clean TypeScript class.
3.  **Step Definitions**: Links the Gherkin steps to the Page Object methods.

### Example Transformation

**Legacy Espresso:**
```java
onView(withId(R.id.username)).perform(typeText("jane_doe"));
onView(withId(R.id.login_btn)).perform(click());
onView(withText("Welcome")).check(matches(isDisplayed()));
```

**Appium MCP Output:**
```typescript
// pages/LoginPage.ts
export class LoginPage extends BasePage {
    get usernameInput() { return $('id=com.app:id/username'); }
    get loginButton() { return $('id=com.app:id/login_btn'); }
    
    async login(user: string) {
        await this.usernameInput.setValue(user);
        await this.loginButton.click();
    }
}

// features/login.feature
Scenario: Successful Login
    Given I am on the "Login" screen
    When I login as "jane_doe"
    Then I should see the "Welcome" message
```

---

## 💡 Pro Tips for Migration
*   **XML Context**: If possible, start an Appium session on the target screen before migrating. This allows the AI to verify that the legacy `R.id` correctly maps to the live `resource-id` or `accessibility-id`.
*   **Refactor During Migration**: Use the migration as an opportunity to clean up "flaky" logic. The tool will automatically use `MobileGestures` for complex interactions like swiping or long-pressing that might have been hardcoded in legacy scripts.
