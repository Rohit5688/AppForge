/**
 * MigrationService — Automates translating native automated tests (Espresso, XCUITest, Detox)
 * into Appium + Cucumber feature files and Page Objects.
 */
export class MigrationService {
    /**
     * Generates an LLM migration prompt based on existing test code.
     * Understands source frameworks to map specific native interactions to Appium commands.
     */
    generateMigrationPrompt(sourceCode, sourceFileName, config) {
        const mappings = this.getFrameworkMappings(config.sourceFramework);
        return `
You are migrating an existing mobile automation test from ${config.sourceFramework} (${config.sourceLanguage})
into **Appium + Cucumber (TypeScript)** using Page Object Models.

### Source File: \`${sourceFileName}\`
\`\`\`${config.sourceLanguage}
${sourceCode}
\`\`\`

### Migration Requirements:
1. Identify the logical flow (user setup, actions, assertions).
2. Generate a \`.feature\` file capturing the business behavior in Given/When/Then steps.
3. Generate the required Page Object Model (\`.ts\`) classes encapsulating Appium locators.
4. Translate native locators safely:
   ${mappings.locators}
5. Translate native interactions safely:
   ${mappings.actions}

### Output Rules
Return the result strictly as a JSON object matching this schema:
{
  "featureFile": {
    "filename": "features/<feature-name>.feature",
    "content": "Feature: ..."
  },
  "pageObjects": [
    {
      "filename": "pages/<ScreenName>.ts",
      "content": "import { BasePage } ..."
    }
  ]
}
`.trim();
    }
    getFrameworkMappings(framework) {
        switch (framework) {
            case 'espresso':
                return {
                    locators: `- \`withId(R.id.name)\` → \`$('id=com.app:id/name')\`\n   - \`withContentDescription("...")\` → \`$('~...')\`\n   - \`withText("...")\` → \`$('*=...')\``,
                    actions: `- \`perform(click())\` → \`await element.click()\`\n   - \`perform(typeText("..."))\` → \`await element.setValue("...")\`\n   - \`check(matches(isDisplayed()))\` → \`await expect(element).toBeDisplayed()\``
                };
            case 'xcuitest':
                return {
                    locators: `- \`app.buttons["name"]\` → \`$('~name')\`\n   - \`app.staticTexts["name"]\` → \`$('~name')\`\n   - \`app.descendants(matching: .any).matching(identifier: "...")\` → \`$('~...')\``,
                    actions: `- \`.tap()\` → \`await element.click()\`\n   - \`.typeText("...")\` → \`await element.setValue("...")\`\n   - \`XCTAssertTrue(.exists)\` → \`await expect(element).toExist()\``
                };
            case 'detox':
                return {
                    locators: `- \`by.id('testID')\` → \`$('~testID')\`\n   - \`by.text('...')\` → \`$('*=...')\`\n   - \`by.label('...')\` → \`$('~...')\``,
                    actions: `- \`.tap()\` → \`await element.click()\`\n   - \`.typeText("...")\` → \`await element.setValue("...")\`\n   - \`.toBeVisible()\` → \`await expect(element).toBeDisplayed()\``
                };
        }
    }
}
