# ✍️ Test Generation & Smart Refactoring

The core of the Appium-Cucumber MCP server is generating syntactically perfect, mobile-first BDD suites while maintaining a high degree of code reuse.

---

## 🔦 `analyze_codebase`
**(Automatically executed by the AI)**. Before the AI writes any code, it uses this tool to read your existing Step Definitions, Page Objects, and mobile utilities. It uses **AST Parsing** (`ts-morph`) to deeply understand your project's patterns, ensuring it doesn't duplicate existing steps or methods.

---

## ✍️ `generate_cucumber_pom`
This tool creates a rigid contextual prompt instructing the LLM on exactly how to write your `.feature` scenarios, TypeScript Page Objects, and Step Definitions.

**Key Features:**
*   **Platform Awareness**: Informs the AI if it should create `.android.ts` or `.ios.ts` files.
*   **Context Injection**: Injects live **XML Hierarchy** and **Screenshots** (if a session is active) so the AI can write precise locators.
*   **Step Reuse**: Lists every existing Gherkin step found during analysis to prevent the AI from writing "new" steps for common actions like `Starting the app`.

**Example Prompt to AI:**
> *"Write a test suite for the Checkout flow. The user should add a product, verify the cart total, and submit payment. Use the live Appium session XML for the 'Pay' button."*

---

## ✅ `validate_and_write`
Once the LLM drafts the code, this tool performs several safety checks before committing to disk:
1.  **Security Audit**: Scans for hardcoded secrets or dangerous code patterns.
2.  **Syntax Check**: Runs `tsc --noEmit` on the generated TypeScript to ensure it's error-free.
3.  **Gherkin Lint**: Validates that the `.feature` file follows correct BDD syntax.
4.  **Dry Run Mode**: Use `dryRun: true` to see a preview of the changes in the chat without affecting your files.

---

## 🛠️ `suggest_refactorings`
Analyzes your project's AST to find **Duplicate Step Definitions** or **Unused Page Object Methods** that are bloating your mobile repository. This is crucial for keeping a large mobile test suite maintainable.

**Example Prompt to AI:**
> *"Analyze my project and suggest refactorings to remove duplicate step definitions in the 'Login' and 'Sign Up' flows."*

---

## 🎲 `generate_test_data_factory`
Generates a typed mock data factory using `faker.js`. This is perfect for creating realistic, dynamic test data (User profiles, Product details) that changes on every test run.

**Example Prompt to AI:**
> *"Generate a test data factory for a 'MobileUser' entity. Include a realistic name, phone number, and a nested address object. Save it to `utils/factories/userFactory.ts`."*
