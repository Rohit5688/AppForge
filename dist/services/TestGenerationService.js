export class TestGenerationService {
    /**
     * Generates a structured system prompt for the LLM.
     * The prompt instructs the LLM to return a JSON matching GenerationOutput schema.
     */
    generateAppiumPrompt(projectRoot, testDescription, config, analysis, testName, learningPrompt, screenXml, screenshotBase64) {
        const platform = config.mobile.defaultPlatform;
        const locatorOrder = config.reuse?.locatorOrder ?? [
            'accessibility id', 'resource-id', 'xpath', 'class chain', 'predicate', 'text'
        ];
        const paths = config.paths ?? {
            featuresRoot: 'features',
            pagesRoot: 'pages',
            stepsRoot: 'step-definitions',
            utilsRoot: 'utils'
        };
        const existingStepsSummary = analysis.existingStepDefinitions
            .map(s => `  File: ${s.file}\n    Steps: ${s.steps.map(st => `${st.type}('${st.pattern}')`).join(', ')}`)
            .join('\n') || '  (none found)';
        const existingPagesSummary = analysis.existingPageObjects
            .map(p => `  ${p.path}: [${p.publicMethods.join(', ')}]`)
            .join('\n') || '  (none found)';
        const existingUtilsSummary = analysis.existingUtils
            ? analysis.existingUtils.map(u => `  ${u.path}: [${u.publicMethods.join(', ')}]`).join('\n')
            : '  (none found)';
        return `
You are an expert Mobile Automation Engineer (Appium + WebdriverIO + Cucumber BDD).
Generate a COMPLETE test suite from this plain English request:

"${testDescription}"
${testName ? `Test Name: "${testName}"` : ''}

## ENVIRONMENT
- Default Platform: ${platform}
- Locator Priority: ${locatorOrder.join(' → ')}
- Features Dir: ${paths.featuresRoot}/
- Steps Dir: ${paths.stepsRoot}/
- Pages Dir: ${paths.pagesRoot}/
- Utils Dir: ${paths.utilsRoot}/

${screenXml ? `## 📱 LIVE UI HIERARCHY (XML)\nUse this to extract EXACT locators instead of guessing.\n\`\`\`xml\n${screenXml}\n\`\`\`\n` : ''}
${screenshotBase64 ? `## 🖼️ SCREENSHOT\nA Base64 screenshot is attached. Use it to visually confirm elements before creating locators.\n` : ''}

## REQUIRED SCENARIO COVERAGE
1. **Happy Path**: Implement the primary user flow.
2. **Negative Scenarios**: Suggest/implement at least one failure path (e.g. invalid login, empty fields).
3. **Accessibility**: Include steps to verify significant elements have TalkBack/VoiceOver labels.

## EXISTING CODE (REUSE THESE — DO NOT DUPLICATE)

### Existing Step Definitions:
${existingStepsSummary}

### Existing Page Objects:
${existingPagesSummary}

### Existing Utility Helpers:
${existingUtilsSummary}

## STRICT RULES

1. **BDD Triad**: Generate a Gherkin \`.feature\` file, a \`.steps.ts\` file, and a \`.page.ts\` file.
2. **Strict POM**: ALL locators and driver commands belong ONLY inside Page Object methods. Step definitions MUST call page methods only.
3. **Page Classes**: ${analysis.existingPageObjects.some(p => p.className === 'BasePage') ? 'Import and extend \\`BasePage\\` from \\`../pages/BasePage\\`.' : 'Export a simple class. Do NOT try to extend BasePage if it does not exist in the project.'}
4. **Locators Strategy**: If \`LocatorUtils\` exists in the utility classes, YOU MUST store locators in \`src/locators/<feature>.yaml\` and fetch them using \`LocatorUtils.getLocator('<feature>', 'key')\` in the Page Object. If LocatorUtils does NOT exist, follow the project's current locator strategy.
5. **Locators Rules**: Use accessibility-id (\`~id\`) as the PRIMARY strategy. AVOID xpath or css selectors unless absolutely necessary, as they lead to flaky mobile automation. Fall back to \`resource-id\` (Android) or \`-ios predicate string\` (iOS) before resorting to xpath.
6. **Reuse**: If an existing step or page method matches, DO NOT create a new one. Reference the existing one and explain in \`reusePlan\`.
7. **Mobile Gestures**: Import \`MobileGestures\` from \`../utils/MobileGestures\` for swipe, longPress, scrollToText, handleAlert.
8. **Action Utilities**: Import \`ActionUtils\` from \`../utils/ActionUtils\` for all element interactions: \`ActionUtils.tap(selector)\`, \`ActionUtils.type(selector, text)\`, \`ActionUtils.clear(selector)\`, \`ActionUtils.tapByText(text)\`, \`ActionUtils.tapByIndex(selector, n)\`, \`ActionUtils.tapAndWait(tap, waitFor)\`, \`ActionUtils.hideKeyboard()\`, \`ActionUtils.tapBack()\`. Do NOT call \`$(selector).click()\` or \`$(selector).setValue()\` directly inside Page Objects — always go through ActionUtils.
8. **API Mocking**: If the test requires specific backend state, use \`MockServer\` from \`../utils/MockServer\`.
8. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
9. **Data-Driven**: If the scenario involves multiple users/values, use a Scenario Outline with an Examples table.
10. **WebView Screens**: If the test involves a WebView (embedded browser, payment form, settings page), use \`this.switchToWebView()\` before interacting with web elements and \`this.switchToNativeContext()\` to return to native.
11. **App Lifecycle**: Use \`this.openDeepLink(url)\` for direct navigation to screens. Use \`this.handlePermissionDialog(accept)\` for system permission popups.
${platform === 'both' ? `
## CROSS-PLATFORM RULES (platform: both)

When platform is "both", generate SEPARATE Page Objects per platform:
- \`pages/LoginPage.android.ts\` — Uses Android locators (\`resource-id\`, \`content-desc\`)
- \`pages/LoginPage.ios.ts\` — Uses iOS locators (\`accessibility-id\`, \`-ios predicate\`)
- \`pages/LoginPage.ts\` — Platform router that imports the correct file based on \`driver.capabilities.platformName\`

Example platform router:
\\\`\\\`\\\`typescript
import { LoginPageAndroid } from './LoginPage.android';
import { LoginPageIOS } from './LoginPage.ios';
import { browser } from '@wdio/globals';

export function getLoginPage() {
  const platform = (browser.capabilities as any).platformName;
  return platform === 'iOS' ? new LoginPageIOS() : new LoginPageAndroid();
}
\\\`\\\`\\\`
The .feature file and .steps.ts file remain shared — only Page Objects split.
` : ''}
${learningPrompt ?? ''}

## OUTPUT FORMAT (JSON ONLY)

Return ONLY a valid JSON object matching this schema:
\\\`\\\`\\\`json
{
  "reusePlan": "Human-readable explanation of what was reused and what is new",
  "filesToCreate": [
    { "path": "features/example.feature", "content": "..." },
    { "path": "step-definitions/example.steps.ts", "content": "..." },
    { "path": "pages/ExamplePage.ts", "content": "..." }
  ],
  "filesToUpdate": [
    { "path": "pages/ExistingPage.ts", "content": "...full updated content...", "reason": "Added newMethod()" }
  ]
}
\\\`\\\`\\\`

DO NOT include any text outside the JSON block. DO NOT use markdown code fences outside the JSON.
`;
    }
}
