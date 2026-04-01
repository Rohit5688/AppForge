# 🎯 AppForge AI Prompt Cheatbook
**The Human's Guide to Effective AI Collaboration in Mobile Test Automation**

> This cheatbook provides battle-tested prompt templates with placeholders to help you communicate effectively with your AI assistant when working with AppForge. Each template is optimized for clarity, precision, and successful execution.

---

## 📋 Table of Contents
1. [Project Setup & Initialization](#1-project-setup--initialization)
2. [Test Generation & Development](#2-test-generation--development)
3. [Live Device Interaction](#3-live-device-interaction)
4. [Self-Healing & Debugging](#4-self-healing--debugging)
5. [Code Analysis & Quality](#5-code-analysis--quality)
6. [Migration & Refactoring](#6-migration--refactoring)
7. [Configuration Management](#7-configuration-management)
8. [CI/CD & DevOps](#8-cicd--devops)
9. [Advanced Scenarios](#9-advanced-scenarios)
10. [Training the AI Assistant](#10-training-the-ai-assistant)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. 🏗️ Project Setup & Initialization

### 1.1 Starting a Brand New Project
```
Create a new mobile automation project with the following configuration:
- Platform: [android/ios/both]
- App Name: [YOUR_APP_NAME]
- Project Path: [ABSOLUTE_PATH or "current directory"]

Use the setup_project tool to scaffold the complete framework with Page Objects, hooks, and utilities.
```

**Example:**
```
Create a new mobile automation project with the following configuration:
- Platform: android
- App Name: ShoppingApp
- Project Path: current directory

Use the setup_project tool to scaffold the complete framework with Page Objects, hooks, and utilities.
```

---

### 1.2 Analyzing Existing Project Structure
```
Analyze my existing mobile automation project to understand:
- What Page Objects already exist
- What step definitions are implemented
- The current naming conventions
- Any architectural patterns in use

Project location: [PATH]
Include analysis of: [features/pages/step-definitions/utils/all]
```

**Example:**
```
Analyze my existing mobile automation project to understand:
- What Page Objects already exist
- What step definitions are implemented
- The current naming conventions
- Any architectural patterns in use

Project location: /Users/myname/projects/shopping-app-tests
Include analysis of: all
```

---

### 1.3 Upgrading/Maintaining Existing Project
```
Upgrade my existing Appium project to the latest standards:
- Update dependencies to latest compatible versions
- Migrate configuration files to modern format
- Ensure TypeScript and ESLint configurations are current
- Apply any security patches

Project Root: [PATH]
```

---

## 2. ✍️ Test Generation & Development

### 2.1 Generating a New Feature with Page Objects
```
Generate a new Cucumber feature for [FEATURE_NAME] with the following scenarios:
[LIST_YOUR_SCENARIOS]

Requirements:
- Platform: [android/ios/cross-platform]
- Use existing Page Objects where applicable (analyze codebase first)
- Follow [POM/cross-platform split] architecture pattern
- Priority locator strategy: [accessibility-id/resource-id/xpath]
- Include [positive/negative/both] test scenarios

After analysis, create:
1. Feature file with Gherkin scenarios
2. Page Object(s) with strictly-typed locators
3. Step definitions implementing the scenarios
4. Validate TypeScript syntax before writing
```

**Example:**
```
Generate a new Cucumber feature for User Login with the following scenarios:
- Successful login with valid credentials
- Failed login with invalid password
- Failed login with empty fields

Requirements:
- Platform: cross-platform
- Use existing Page Objects where applicable (analyze codebase first)
- Follow cross-platform split architecture pattern
- Priority locator strategy: accessibility-id
- Include both positive and negative test scenarios

After analysis, create:
1. Feature file with Gherkin scenarios
2. Page Object(s) with strictly-typed locators
3. Step definitions implementing the scenarios
4. Validate TypeScript syntax before writing
```

---

### 2.2 Adding Scenarios to Existing Feature
```
Add new scenarios to the existing feature file: [FEATURE_FILE_PATH]

New scenarios to add:
[DESCRIBE_SCENARIOS]

Requirements:
- Reuse existing step definitions where possible (analyze codebase first)
- Create only NEW steps that don't already exist
- Maintain consistent Gherkin style with existing scenarios
- Update Page Objects only if new UI elements are needed
```

**Example:**
```
Add new scenarios to the existing feature file: src/features/login.feature

New scenarios to add:
- Login with social media (Google, Facebook)
- Remember me functionality
- Forgot password flow

Requirements:
- Reuse existing step definitions where possible (analyze codebase first)
- Create only NEW steps that don't already exist
- Maintain consistent Gherkin style with existing scenarios
- Update Page Objects only if new UI elements are needed
```

---

### 2.3 Creating Platform-Specific Page Objects
```
Create a [android/ios/cross-platform] Page Object for [SCREEN_NAME] screen with the following elements:

UI Elements:
- [ELEMENT_NAME]: [element_type] - [description/purpose]
- [ELEMENT_NAME]: [element_type] - [description/purpose]
[...]

Requirements:
- Use [accessibility-id/resource-id/xpath] as primary strategy
- Include common actions: [tap, input, swipe, verify, etc.]
- Extend BasePage
- Follow existing project naming conventions
- For cross-platform: create .android.ts and .ios.ts variants
```

**Example:**
```
Create a cross-platform Page Object for Product Details screen with the following elements:

UI Elements:
- productImage: image - Main product photo
- productTitle: text - Product name
- productPrice: text - Current price
- addToCartButton: button - Primary CTA
- quantitySelector: dropdown - Quantity picker
- reviewsSection: scrollable view - Customer reviews

Requirements:
- Use accessibility-id as primary strategy
- Include common actions: tap, input, swipe, verify
- Extend BasePage
- Follow existing project naming conventions
- For cross-platform: create .android.ts and .ios.ts variants
```

---

## 3. 📱 Live Device Interaction

### 3.1 Starting Live Device Session for Context
```
Start a live Appium session for my [android/ios] app to gather real-time context:

Configuration:
- Device Profile: [PROFILE_NAME from mcp-config.json or "default"]
- App Package/Bundle: [PACKAGE_ID]
- Purpose: [screen inspection/test development/debugging]

After connection:
1. Capture current screen hierarchy (XML)
2. Take screenshot for visual reference
3. Use this context to [generate accurate locators/debug failing test/verify element existence]
```

**Example:**
```
Start a live Appium session for my android app to gather real-time context:

Configuration:
- Device Profile: pixel8_emulator
- App Package: com.shopping.app
- Purpose: screen inspection for checkout flow

After connection:
1. Capture current screen hierarchy (XML)
2. Take screenshot for visual reference
3. Use this context to generate accurate locators for payment screen Page Object
```

---

### 3.2 Inspecting Current Screen Elements
```
With the active Appium session, inspect the current screen and:
1. List all interactive elements with their locator strategies
2. Identify unique identifiers (accessibility-id, resource-id, etc.)
3. Highlight elements suitable for [test action you need]
4. Suggest optimal locator strategy based on element properties

Focus on: [specific UI section/entire screen]
```

---

### 3.3 Verifying Selector in Real-Time
```
Verify if the following selector works on the current screen:
Selector: [YOUR_SELECTOR]
Strategy: [accessibility-id/xpath/id/etc.]

If it doesn't work:
- Suggest alternatives from the current screen hierarchy
- Explain why the original selector failed
- Provide the corrected selector
```

**Example:**
```
Verify if the following selector works on the current screen:
Selector: ~checkout_button
Strategy: accessibility-id

If it doesn't work:
- Suggest alternatives from the current screen hierarchy
- Explain why the original selector failed
- Provide the corrected selector
```

---

## 4. 🩹 Self-Healing & Debugging

### 4.1 Healing a Failed Test
```
Heal the failing test with the following information:

Test Details:
- Feature File: [PATH_TO_FEATURE]
- Failing Scenario: [SCENARIO_NAME]
- Error Output: [PASTE_ERROR_MESSAGE]

Actions Required:
1. Analyze the failure (element not found/timeout/assertion/etc.)
2. Start live Appium session if needed to inspect current UI
3. Identify the broken selector: [SUSPECTED_SELECTOR if known]
4. Propose corrected locator using live hierarchy
5. Update affected Page Object(s) and step definitions
6. Learn this fix for future prevention (save to knowledge base)
```

**Example:**
```
Heal the failing test with the following information:

Test Details:
- Feature File: src/features/checkout.feature
- Failing Scenario: Complete purchase with credit card
- Error Output: Error: element ("~submit_payment_btn") still not existing after 10000ms

Actions Required:
1. Analyze the failure (element not found/timeout/assertion/etc.)
2. Start live Appium session if needed to inspect current UI
3. Identify the broken selector: ~submit_payment_btn
4. Propose corrected locator using live hierarchy
5. Update affected Page Object(s) and step definitions
6. Learn this fix for future prevention (save to knowledge base)
```

---

### 4.2 Debugging with Vision + XML Context
```
Debug the test failure using both visual and structural context:

Test: [TEST_NAME]
Error: [ERROR_MESSAGE]

Debugging approach:
1. Start Appium session
2. Navigate to failing screen: [NAVIGATION_STEPS]
3. Capture screenshot + XML hierarchy
4. Compare visual vs XML to understand element structure
5. Identify why selector "[FAILING_SELECTOR]" doesn't match
6. Provide comprehensive fix with explanation
```

---

### 4.3 Batch Healing Multiple Failed Tests
```
Multiple tests are failing after app update. Heal the following:

Failed Tests:
1. [TEST_1] - Error: [ERROR_1]
2. [TEST_2] - Error: [ERROR_2]
3. [TEST_3] - Error: [ERROR_3]

Approach:
- Start session once and inspect all affected screens
- Identify common changes (e.g., UI redesign, ID changes)
- Update all affected Page Objects
- Save learnings to prevent similar issues
- Provide summary of all changes made
```

---

## 5. 📊 Code Analysis & Quality

### 5.1 Analyzing Test Coverage
```
Analyze test coverage for my mobile automation project:

Scope: [entire project/specific feature/module]
Focus Areas:
- Functional coverage: [core flows/edge cases/error handling]
- Platform coverage: [Android/iOS/both]
- Negative scenarios
- Accessibility testing (TalkBack/VoiceOver)

Provide:
1. Coverage report with metrics
2. Gap analysis (what's missing)
3. Prioritized suggestions for new test scenarios
4. Risk assessment of untested areas
```

**Example:**
```
Analyze test coverage for my mobile automation project:

Scope: checkout and payment flows
Focus Areas:
- Functional coverage: core flows and edge cases
- Platform coverage: both Android and iOS
- Negative scenarios
- Accessibility testing (TalkBack/VoiceOver)

Provide:
1. Coverage report with metrics
2. Gap analysis (what's missing)
3. Prioritized suggestions for new test scenarios
4. Risk assessment of untested areas
```

---

### 5.2 Auditing Locator Quality
```
Audit all locators in my project for quality and maintainability:

Scan directories: [pages/src/pages/locators]
Evaluate:
- Locator strategy distribution (accessibility-id vs XPath vs resource-id)
- Brittle selectors (complex XPaths, index-based)
- Missing accessibility identifiers
- Platform-specific issues

Provide:
- Detailed audit report with classifications (optimal/acceptable/brittle/critical)
- Specific recommendations for improvement
- Priority order for refactoring
```

---

### 5.3 Suggesting Refactorings
```
Analyze my codebase and suggest refactorings:

Analysis Scope: [entire project/specific directory]
Look For:
- Duplicate step definitions
- Unused Page Object methods
- Code smell patterns
- Opportunities for helper utilities
- Inconsistent naming conventions

Provide actionable refactoring suggestions with:
- What to refactor
- Why it needs refactoring
- How to refactor (specific steps)
- Expected benefits
```

---

## 6. 🚚 Migration & Refactoring

### 6.1 Migrating from Native Framework
```
Migrate the following [Espresso/XCUITest/Detox] test to Appium Cucumber:

Source Framework: [espresso/xcuitest/detox]
Test File: [PASTE_TEST_CODE or PATH]

Migration Requirements:
- Target Platform: [android/ios/cross-platform]
- Use existing Page Objects if applicable (analyze first)
- Maintain test intent and coverage
- Follow project's architectural patterns
- Convert to BDD Gherkin + Page Object Model

Deliver:
1. Gherkin feature file
2. Corresponding Page Objects
3. Step definitions
4. Migration notes (mapping of old vs new patterns)
```

**Example:**
```
Migrate the following Espresso test to Appium Cucumber:

Source Framework: espresso
Test File:
```

```java
@Test
public void loginSuccess() {
    onView(withId(R.id.username)).perform(typeText("testuser"));
    onView(withId(R.id.password)).perform(typeText("password123"));
    onView(withId(R.id.login_button)).perform(click());
    onView(withId(R.id.welcome_message)).check(matches(isDisplayed()));
}
```

```
Migration Requirements:
- Target Platform: android
- Use existing Page Objects if applicable (analyze first)
- Maintain test intent and coverage
- Follow project's architectural patterns
- Convert to BDD Gherkin + Page Object Model

Deliver:
1. Gherkin feature file
2. Corresponding Page Objects
3. Step definitions
4. Migration notes (mapping of old vs new patterns)
```

---

### 6.2 Batch Migration of Test Suite
```
Migrate an entire test suite from [SOURCE_FRAMEWORK] to Appium:

Source: [DIRECTORY_PATH or REPO_URL]
Test Files: [LIST_FILES or "scan all .java/.swift/.js files"]

Approach:
1. Analyze all source test files
2. Group by feature/functionality
3. Create consolidated Gherkin features (avoid duplication)
4. Build reusable Page Objects
5. Generate step definitions
6. Provide migration summary report

Target Architecture: [standard POM/cross-platform split]
```

---

## 7. ⚙️ Configuration Management

### 7.1 Managing MCP Configuration
```
Update my mcp-config.json with the following changes:

Operation: [read/update/add profile/set cloud provider]

Changes:
[SPECIFY_CHANGES]

Examples:
- Add new device profile "[PROFILE_NAME]" for [android/ios]
- Update app path for [platform] to: [APP_PATH]
- Configure [BrowserStack/SauceLabs] cloud testing with credentials
- Set active build profile to: [BUILD_NAME]
```

**Example:**
```
Update my mcp-config.json with the following changes:

Operation: add profile

Changes:
- Add new device profile "samsung_s23" for android
  - Device Name: Samsung Galaxy S23
  - Platform Version: 14
  - App Package: com.shopping.app
  - App Activity: .MainActivity
  - Also update automation name to UIAutomator2
```

---

### 7.2 Checking Environment Readiness
```
Check if my development environment is ready for mobile automation:

Target Platform: [android/ios/both]
App Path: [PATH_TO_APK_OR_APP]
Check Items:
- Node.js version
- Appium server installation and reachability
- Required drivers (UIAutomator2/XCUITest)
- SDK/Xcode configuration
- Emulator/simulator availability
- Project dependencies
- MCP configuration validity

Provide:
- Detailed environment report
- Issues found with severity
- Exact commands to fix each issue
```

---

### 7.3 Managing Test Credentials
```
Set up credential management for test users:

Environment: [staging/production/dev]
Users to configure:
- [USER_TYPE_1]: [username/email] (e.g., valid_user, admin_user)
- [USER_TYPE_2]: [username/email]
[...]

Requirements:
- Store in .env file securely
- Generate typed helper in [PATH]
- Add to .gitignore if not already present
- Create usage examples in comments
```

**Example:**
```
Set up credential management for test users:

Environment: staging
Users to configure:
- valid_customer: test.user@example.com
- premium_member: premium@example.com
- admin_user: admin@example.com

Requirements:
- Store in .env.staging file securely
- Generate typed helper in src/utils/TestUsers.ts
- Add to .gitignore if not already present
- Create usage examples in comments
```

---

## 8. 🔄 CI/CD & DevOps

### 8.1 Generating CI Pipeline
```
Generate a CI/CD workflow for running my Appium tests:

CI Platform: [GitHub Actions/GitLab CI/Jenkins/CircleCI]
Configuration:
- Platform: [android/ios/both]
- Node Version: [18/20/latest]
- Appium Version: [2.x]
- Trigger: [on PR/on push to main/scheduled/manual]
- Device: [emulator name or cloud device]
- Test Command: [your cucumber execution command]
- Reports: Store in [directory]
- App Path: [path to .apk or .app file]

Additional:
- Include [linting/type checking/security scans]
- Notification: [Slack/Email/none]
```

**Example:**
```
Generate a CI/CD workflow for running my Appium tests:

CI Platform: GitHub Actions
Configuration:
- Platform: android
- Node Version: 20
- Appium Version: 2.x
- Trigger: on PR to main branch
- Device: pixel_8_emulator
- Test Command: npm run test:android
- Reports: Store in test-results/
- App Path: app/build/outputs/apk/debug/app-debug.apk

Additional:
- Include linting and type checking
- Notification: Slack channel #qa-automation
```

---

### 8.2 Exporting Bug Report
```
Generate a comprehensive bug report for the following test failure:

Test: [FEATURE_FILE:SCENARIO_NAME]
Error: [ERROR_MESSAGE]
Stack Trace: [PASTE_STACK_TRACE]

Environment:
- Platform: [android/ios]
- Device: [DEVICE_INFO]
- App Version: [VERSION]
- OS Version: [OS_VERSION]

Include:
- Severity classification
- Root cause analysis
- Steps to reproduce
- Suggested fix
- Related tests that might be affected
- Format: [Jira/GitHub Issue/Linear/Markdown]
```

---

## 9. 🧩 Advanced Scenarios

### 9.1 Creating Test Data Factory
```
Generate a test data factory for [ENTITY_NAME] with the following schema:

Schema Definition:
```typescript
interface [ENTITY_NAME] {
  [FIELD_1]: [TYPE];
  [FIELD_2]: [TYPE];
  // ... more fields
}
```

Requirements:
- Use faker.js for realistic data generation
- Include factory methods: create, createMany, createWith(overrides)
- Add data builder pattern support
- Support different data scenarios: [valid/invalid/edge cases]
- Generate TypeScript with strict types
```

**Example:**
```
Generate a test data factory for User with the following schema:

Schema Definition:
```typescript
interface User {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  address: Address;
  membershipTier: 'free' | 'premium' | 'enterprise';
}
```

Requirements:
- Use faker.js for realistic data generation
- Include factory methods: create, createMany, createWith(overrides)
- Add data builder pattern support
- Support different data scenarios: valid, invalid email, missing fields
- Generate TypeScript with strict types
```

---

### 9.2 Setting Up Mock Server
```
Create a mock API server configuration for testing:

Endpoints to mock:
- [METHOD] [ENDPOINT_PATH]: [RESPONSE_SCENARIO]
- [METHOD] [ENDPOINT_PATH]: [RESPONSE_SCENARIO]
[...]

Requirements:
- Use project's MockServer utility
- Support multiple scenarios per endpoint (success/error/timeout)
- Include response delay simulation
- Add request validation
- Generate mock data using test data factories
- Provide usage examples in step definitions
```

---

### 9.3 Implementing Accessibility Testing
```
Add accessibility testing coverage for [FEATURE/SCREEN]:

Checks Required:
- All interactive elements have accessibility labels
- Proper content descriptions
- Sufficient color contrast
- Touch target sizes meet guidelines
- Screen reader navigation works correctly
- Focus order is logical

Platform: [android (TalkBack)/ios (VoiceOver)/both]

Generate:
1. Accessibility-focused scenarios in Gherkin
2. Helper utilities for a11y verification
3. Page Object methods for a11y checks
4. Documentation on running with screen readers
```

---

## 10. 🧠 Training the AI Assistant

AppForge includes a **Learning Service** that allows the AI to learn from successful test healings and build a knowledge base. This "AI memory" helps prevent recurring issues and improves automation quality over time.

### 10.1 Understanding the Learning System

The AI learns automatically when:
- Tests are successfully healed using the `self_heal_test` tool
- You explicitly teach patterns using prompts
- Failed locators are corrected and verified

**Knowledge is stored in**: `.mcp-knowledge.json` in your project root

---

### 10.2 Teaching the AI a Pattern
```
Teach the AI this pattern to remember for future test generation:

Pattern: [DESCRIBE_THE_PATTERN]
Context: [WHEN_TO_APPLY]
Solution: [WHAT_TO_DO]
Tags: [RELEVANT_TAGS for easier retrieval, e.g., locators, android, ios, login]

Example Pattern:
"When dealing with dynamic IDs in the checkout flow, always prefer accessibility-id over resource-id because the app generates random suffixes like _12345"

Save this to the knowledge base so it's used in future test generation and healing.
```

**Example:**
```
Teach the AI this pattern to remember for future test generation:

Pattern: Payment button locator changes based on payment method
Context: When generating or healing tests for the payment screen
Solution: Use the accessibility-id "payment_submit_button" which remains constant across all payment methods (credit card, PayPal, Apple Pay), instead of the text-based selector which changes to "Pay Now", "Pay with PayPal", etc.
Tags: payment, locators, cross-platform, checkout

Save this to the knowledge base so it's used in future test generation and healing.
```

---

### 10.3 Reviewing What the AI Has Learned
```
Show me the current knowledge base for this project:

Display:
1. All learned patterns and solutions
2. When each was learned (timestamp)
3. How many times each pattern has been referenced
4. Categories/tags of knowledge

Format: [Markdown table/detailed list/JSON]
```

---

### 10.4 Teaching App-Specific Conventions
```
Teach the AI about our app's specific conventions:

App Conventions:
- [CONVENTION_1]: [DESCRIPTION]
- [CONVENTION_2]: [DESCRIPTION]
[...]

Examples:
- All buttons use accessibility-id with suffix "_btn"
- Android uses "com.myapp:id/" prefix for all resource IDs
- iOS screens use "Screen_" prefix for accessibility identifiers
- Input fields follow pattern: "[field_name]_input"
- Error messages appear in element with id "error_banner"

Store these conventions for consistent test generation.
```

**Example:**
```
Teach the AI about our app's specific conventions:

App Conventions:
- All primary action buttons use accessibility-id ending with "_primary_btn"
- Secondary buttons end with "_secondary_btn"
- Input fields use pattern "[screen_name]_[field_purpose]_input"
- All modals/dialogs have accessibility-id starting with "modal_"
- Success messages: id="success_toast", error messages: id="error_toast"
- Loading indicators always use accessibility-id "loading_spinner"
- Navigation bar items use format "nav_[destination]"

Store these conventions for consistent test generation.
```

---

### 10.5 Training on Screen Navigation Patterns
```
Teach the AI the navigation flow for [FEATURE_NAME]:

Navigation Steps:
1. [STEP_1]: [SCREEN_TO_SCREEN with actions]
2. [STEP_2]: [SCREEN_TO_SCREEN with actions]
[...]

Key Elements for Each Screen:
- [SCREEN_NAME]:
  - Primary identifier: [LOCATOR]
  - Key elements: [LIST_KEY_ELEMENTS]
  - Navigation actions: [HOW_TO_ENTER/EXIT]

Use this for accurate test generation and healing navigation.
```

**Example:**
```
Teach the AI the navigation flow for Checkout Process:

Navigation Steps:
1. Cart Screen → Tap "checkout_btn" → Shipping Screen
2. Shipping Screen → Fill address fields → Tap "continue_to_payment_btn" → Payment Screen  
3. Payment Screen → Select payment method → Fill card details → Tap "complete_order_btn" → Confirmation Screen
4. Confirmation Screen → Verify "order_confirmation_message" → Tap "view_order_btn" → Order Details Screen

Key Elements for Each Screen:
- Cart Screen:
  - Primary identifier: ~cart_title
  - Key elements: item_list, subtotal_text, checkout_btn
  - Navigation: Main tab → Cart icon
- Shipping Screen:
  - Primary identifier: ~shipping_address_title
  - Key elements: address_line1_input, city_input, zip_input, continue_to_payment_btn
  - Back: shipping_back_btn
- Payment Screen:
  - Primary identifier: ~payment_method_title
  - Key elements: card_number_input, expiry_input, cvv_input, complete_order_btn
  - Back: payment_back_btn

Use this for accurate test generation and healing navigation.
```

---

### 10.6 Teaching Error Patterns and Recovery
```
Teach the AI common error patterns and recovery strategies:

Error Scenario: [ERROR_DESCRIPTION]
Symptoms: [HOW_TO_IDENTIFY]
Root Cause: [WHY_IT_HAPPENS]
Solution: [HOW_TO_FIX]
Prevention: [HOW_TO_AVOID]

Tag: [error-handling/recovery/network/etc.]
```

**Example:**
```
Teach the AI common error patterns and recovery strategies:

Error Scenario: Network timeout during payment processing
Symptoms: 
- Test hangs on payment screen
- "payment_loading_spinner" never disappears
- No error message displayed after 30+ seconds
Root Cause: App doesn't handle network timeouts gracefully, spinner keeps spinning
Solution: 
- Wait for max 30 seconds for spinner
- Force navigate back and retry
- Check for error toast with longer timeout
Prevention: 
- Add explicit network failure test scenarios
- Use shorter timeouts in test (20s max)
- Verify error states are reachable

Tag: network, error-handling, payment, flaky-tests
```

---

### 10.7 Bulk Training from Documentation
```
I have app documentation that describes UI patterns and conventions. Extract and learn from it:

Documentation: [PASTE_DOCUMENTATION or PATH_TO_FILE]

Extract and save:
- UI element naming conventions
- Screen flow patterns
- Common locator strategies
- Platform-specific differences
- Error handling approaches
- Accessibility guidelines

Create a comprehensive knowledge base entry for each pattern found.
```

---

### 10.8 Forgetting Outdated Patterns
```
Remove this outdated pattern from the knowledge base:

Pattern to Remove: [DESCRIPTION or PATTERN_ID]
Reason: [WHY_IT'S_NO_LONGER_VALID]

Examples of reasons:
- UI redesign changed element structure
- App switched frameworks (React Native → Flutter)
- Locator strategy changed company-wide
- Screen was removed from app
```

**Example:**
```
Remove this outdated pattern from the knowledge base:

Pattern to Remove: "Use resource-id 'submit_button' for checkout"
Reason: App UI was redesigned in v3.0. The checkout button now uses accessibility-id 'checkout_submit_btn' and the old resource-id no longer exists.
```

---

### 10.9 Exporting Knowledge for Team Sharing
```
Export the knowledge base to share with the team:

Export Format: [Markdown/JSON/CSV]
Include:
- All learned patterns
- Usage statistics
- Creation/modification dates
- Tags and categories

Purpose: [team onboarding/documentation/backup/migration]
```

---

### 10.10 Importing Team Knowledge
```
Import knowledge from another project or team member:

Source: [FILE_PATH or PASTE_JSON]
Merge Strategy: [replace duplicates/keep both/skip conflicts]

Validate:
- Check for conflicts with existing patterns
- Verify patterns are still relevant
- Update tags if needed
```

---

## 11. 🔧 Troubleshooting

### 11.1 Generic Troubleshooting
```
Help me debug the following issue:

Problem: [DESCRIBE_THE_ISSUE]
Error Message (if any): [ERROR_TEXT]
What I Expected: [EXPECTED_BEHAVIOR]
What Actually Happened: [ACTUAL_BEHAVIOR]

Context:
- Platform: [android/ios]
- Test File: [PATH]
- Recent Changes: [WHAT_CHANGED]

Troubleshooting Steps:
1. Analyze the error and identify root cause
2. Check environment if relevant (use check_environment tool)
3. Verify configuration files
4. Suggest specific fixes with commands
5. Provide prevention tips
```

---

### 11.2 Performance Issues
```
My tests are running slowly. Help optimize:

Current Issues:
- Average test duration: [DURATION]
- Bottlenecks: [implicit waits/complex XPaths/network calls/etc.]
- Platform: [android/ios]

Analyze:
1. Review wait strategies in Page Objects
2. Check for inefficient locators
3. Examine unnecessary delays
4. Review hooks and setup/teardown

Provide:
- Performance audit report
- Specific optimization recommendations
- Refactoring examples
- Expected improvement estimates
```

---

### 11.3 Flaky Test Investigation
```
This test is flaky and fails intermittently:

Test: [FEATURE:SCENARIO]
Failure Rate: [PERCENTAGE or "fails 1 in 3 runs"]
Error Pattern: [DESCRIBE_ERROR_VARIATIONS]

Investigation needed:
1. Analyze test code for timing issues
2. Review element locators for uniqueness
3. Check for race conditions
4. Examine wait conditions
5. Look for environmental dependencies

Provide:
- Root cause analysis
- Stabilization strategy
- Code fixes
- Monitoring recommendations
```

---

## 📝 Best Practices for Prompting

### ✅ DO:
- **Be Specific**: Include exact file paths, element names, and configurations
- **Provide Context**: Share error messages, stack traces, and environment details
- **State Intent**: Explain what you're trying to achieve, not just what to do
- **Include Constraints**: Mention architectural patterns, coding standards, or limitations
- **Request Validation**: Ask the AI to validate before writing files
- **Ask for Analysis First**: Request codebase analysis before generation to avoid duplication

### ❌ DON'T:
- **Be Vague**: "Fix my tests" → Instead: "Fix the login test that's failing on line 45 with selector error"
- **Assume Context**: Don't assume the AI remembers previous conversations
- **Skip Analysis**: Don't ask to generate code without analyzing existing codebase first
- **Ignore Errors**: Share complete error messages, not summaries
- **Rush**: Give the AI time to analyze, validate, and execute properly

---

## 🎯 Placeholder Glossary

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `[PATH]` | Absolute or relative file/directory path | `/Users/me/projects/app` or `./src/features` |
| `[PROFILE_NAME]` | Device profile from mcp-config.json | `pixel8_emulator`, `iphone15_sim` |
| `[FEATURE_NAME]` | Name of feature/functionality | `User Authentication`, `Shopping Cart` |
| `[SCENARIO_NAME]` | Specific test scenario | `Login with valid credentials` |
| `[PLATFORM]` | Target mobile platform | `android`, `ios`, `both`, `cross-platform` |
| `[SELECTOR]` | Element locator | `~login_button`, `id=submit`, `//android.widget.Button` |
| `[ERROR_MESSAGE]` | Actual error text from test run | Full error/stack trace output |
| `[YOUR_APP_NAME]` | Application name | `ShoppingApp`, `BankingMobile` |
| `[PACKAGE_ID]` | App package/bundle identifier | `com.example.app`, `com.company.MyApp` |
| `[BUILD_NAME]` | Build profile name | `staging`, `production`, `qa` |

---

## 🚀 Quick Start Workflow

**For a New Project:**
1. Use prompt [1.1](#11-starting-a-brand-new-project) to set up project
2. Use prompt [7.2](#72-checking-environment-readiness) to verify environment
3. Use prompt [2.1](#21-generating-a-new-feature-with-page-objects) to create first test

**For Existing Project:**
1. Use prompt [1.2](#12-analyzing-existing-project-structure) to understand codebase
2. Use prompt [5.1](#51-analyzing-test-coverage) to find gaps
3. Use prompt [2.1](#21-generating-a-new-feature-with-page-objects) or [2.2](#22-adding-scenarios-to-existing-feature) to expand coverage

**When Tests Fail:**
1. Use prompt [4.1](#41-healing-a-failed-test) for self-healing
2. If still unclear, use prompt [3.1](#31-starting-live-device-session-for-context) for live inspection
3. Use prompt [4.2](#42-debugging-with-vision--xml-context) for complex issues

---

## 💡 Pro Tips

1. **Always Analyze First**: Before generating new code, ask the AI to analyze your codebase to avoid duplication
2. **Use Live Sessions**: When creating new Page Objects, start a live Appium session for accurate locators
3. **Learn from Healing**: When tests self-heal, the AI saves learnings - these prevent future failures
4. **Batch Operations**: When possible, group related tasks in one prompt for efficiency
5. **Validate Before Writing**: Use dry-run modes to preview changes before committing
6. **Layer Your Prompts**: Break complex tasks into steps: analyze → plan → generate → validate → execute

---

## 📚 Related Documentation
- [AppForge README](../README.md) - Overview and capabilities
- [User Guide](./UserGuide.md) - Detailed feature documentation
- [MCP Configuration](./McpConfig.md) - Configuration reference
- [Test Generation Guide](./TestGeneration.md) - Deep dive into test generation

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Maintained by**: AppForge Team

*This cheatbook is a living document. Contribute improved prompts via GitHub issues or discussions.*