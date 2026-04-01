export class TestGenerationService {
    /**
     * Generates a structured system prompt for the LLM.
     * Adapts to the project's detected architecture pattern (POM vs YAML vs Facade).
     */
    generateAppiumPrompt(projectRoot, testDescription, config, analysis, testName, learningPrompt, screenXml, screenshotBase64) {
        const platform = config.mobile.defaultPlatform;
        const locatorOrder = config.reuse?.locatorOrder ?? [
            'accessibility id', 'resource-id', 'xpath', 'class chain', 'predicate', 'text'
        ];
        const paths = analysis.detectedPaths ?? config.paths ?? {
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
        const conflictsWarning = analysis.conflicts.length > 0
            ? `\n## ⚠️ STEP CONFLICTS DETECTED\nThe following step patterns are duplicated across files. DO NOT create any of these:\n${analysis.conflicts.map(c => `- \`${c.pattern}\` (in: ${c.files.join(', ')})`).join('\n')}\n`
            : '';
        const aliasesWarning = analysis.importAliases && Object.keys(analysis.importAliases).length > 0
            ? `\n## 🧰 TYPESCRIPT IMPORT ALIASES (tsconfig.json)\nDo NOT use deep relative paths (e.g. '../../pages/Login'). You MUST map imports to these aliases:\n\`\`\`json\n${JSON.stringify(analysis.importAliases, null, 2)}\n\`\`\`\n`
            : '';
        // Decide output file type based on architecture
        const locatorFileEntry = (analysis.architecturePattern === 'yaml-locators' || analysis.architecturePattern === 'facade')
            ? '{ "path": "locators/example.yaml", "content": "..." }'
            : '{ "path": "pages/ExamplePage.ts", "content": "..." }';
        return `
You are an expert Mobile Automation Engineer specializing in **Appium + WebdriverIO + @cucumber/cucumber** BDD testing.
Generate a COMPLETE Appium/WebdriverIO Cucumber POM test suite from this plain English request:

⚠️ **CRITICAL CONSTRAINT**: This project uses **ONLY WebdriverIO** with \`driver.$()\` selectors and **Appium** locator strategies. Use \`@wdio/globals\`, \`import { $ }\`, and Appium strategies (accessibility-id, resource-id, xpath). Do NOT import web testing libraries, page objects, or fixtures from other frameworks.

"${testDescription}"
${testName ? `Test Name: "${testName}"` : ''}

## ENVIRONMENT
- Default Platform: ${platform}
- Detected Architecture: **${analysis.architecturePattern}**
- Locator Priority: ${locatorOrder.join(' -> ')}
- Features Dir: ${paths.featuresRoot}/
- Steps Dir: ${paths.stepsRoot}/
- Pages Dir: ${paths.pagesRoot}/
- Utils Dir: ${paths.utilsRoot}/
${analysis.yamlLocatorFiles.length > 0 ? `- YAML Locator Files: ${analysis.yamlLocatorFiles.join(', ')}` : ''}

${screenXml ? `## [XML] LIVE UI HIERARCHY\nUse this to extract EXACT locators instead of guessing.\n\\\`\\\`\\\`xml\n${screenXml}\n\\\`\\\`\\\`\n` : ''}
${screenshotBase64 ? `## [IMAGE] SCREENSHOT\nA Base64 screenshot is attached. Use it to visually confirm elements before creating locators.\n` : ''}

## REQUIRED SCENARIO COVERAGE
1. **Happy Path**: Implement the primary user flow.
2. **Negative Scenarios**: Suggest/implement at least one failure path (e.g. invalid login, empty fields).
3. **Accessibility**: Include steps to verify significant elements have TalkBack/VoiceOver labels.
4. **[PHASE 4: STATE-MACHINE MICRO-PROMPTING]**: If this request requires generating a very large Page Object AND complex step definitions simultaneously across multiple files, you MUST serialize your work. Generate and invoke \`validate_and_write\` for ONLY the \`jsonPageObjects\` first. Wait for the compilation success response before generating the \`.feature\` and \`.steps.ts\` files in a subsequent attempt. Do NOT overwhelm your context window.

## EXISTING CODE (REUSE THESE -- DO NOT DUPLICATE)
${conflictsWarning}
${aliasesWarning}
### Existing Step Definitions:
${existingStepsSummary}

### Existing Page Objects:
${existingPagesSummary}

### Existing Utility Helpers:
${existingUtilsSummary}

${this.getArchitectureRules(analysis, platform)}

${learningPrompt ?? ''}

## OUTPUT FORMAT (JSON ONLY)

Return ONLY a valid JSON object matching this schema. DO NOT write raw TypeScript strings for Page Objects. You MUST output Page Objects exclusively in the \`jsonPageObjects\` array. The MCP server will generate the TypeScript files for you:
\\\`\\\`\\\`json
{
  "reusePlan": "Human-readable explanation of what was reused and what is new",
  "filesToCreate": [
    { "path": "features/example.feature", "content": "..." },
    { "path": "step-definitions/example.steps.ts", "content": "..." },
    ${locatorFileEntry}
  ],
  "filesToUpdate": [
    { "path": "...", "content": "...full updated content...", "reason": "Added newMethod()" }
  ],
  "jsonPageObjects": [
    {
      "className": "LoginScreen",
      "path": "pages/LoginScreen.ts",
      "extendsClass": "BasePage",
      "imports": ["import { $ } from '@wdio/globals';"],
      "locators": [
         { "name": "submitBtn", "selector": "~submit" }
      ],
      "methods": [
         { "name": "submit", "args": [], "body": ["await this.submitBtn.click();"] }
      ]
    }
  ]
}
\\\`\\\`\\\`

DO NOT include any text outside the JSON block. DO NOT use markdown code fences outside the JSON.
`;
    }
    /**
     * Returns architecture-specific rules for the generation prompt.
     * Adapts to the project's existing locator strategy.
     */
    getArchitectureRules(analysis, platform) {
        const arch = analysis.architecturePattern;
        if (arch === 'yaml-locators' || arch === 'facade') {
            const yamlFiles = analysis.yamlLocatorFiles?.join(', ') || '(none yet - create new ones)';
            return `
## STRICT RULES - YAML LOCATOR ARCHITECTURE (Detected: ${arch})

This project uses **YAML-based locator files** with a resolver function. Follow this pattern EXACTLY:

1. **Locators in YAML**: Store ALL locators in \`.yaml\` files under the \`locators/\` directory. Format:
\\\`\\\`\\\`yaml
# locators/login.yaml
login_button:
  ios: ~loginButton
  android: ~login_btn

username_field:
  ios: ~usernameInput
  android: //android.widget.EditText[@resource-id="com.app:id/username"]
\\\`\\\`\\\`

2. **resolveLocator()**: In step definitions and utils, use \`resolveLocator('login_button')\` to get the platform-specific selector at runtime. NEVER hardcode selectors inline in .ts files.
3. **No POM Classes with inline selectors**: Do NOT create Page Object classes with inline \`$()\` selectors. Use utility helpers + resolveLocator() instead.
4. **Existing YAML files**: ${yamlFiles}
5. **BDD Triad**: Generate a \`.feature\` file, a \`.steps.ts\` file, and a \`.yaml\` locator file.
6. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
7. **Data-Driven**: If the scenario involves multiple users/values, use Scenario Outline with Examples.
8. **Reuse**: If an existing step or util method matches, DO NOT create a new one.
9. **Cross-Platform**: The YAML file handles platform differences. Step definitions remain shared.
`;
        }
        if (arch === 'hybrid') {
            return `
## STRICT RULES - HYBRID ARCHITECTURE (Detected: ${arch})

This project uses BOTH Page Object classes AND YAML locator files. Follow the EXISTING pattern:

1. **Check existing patterns first**: Look at how existing pages/steps handle locators.
2. **If the screen already has a YAML file**, add new locators to it and use resolveLocator().
3. **If the screen already has a Page Object**, extend it with new methods.
4. **For new screens**, prefer the YAML locator pattern (more maintainable for cross-platform).
5. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
6. **Reuse**: If an existing step or method matches, DO NOT create a new one.
`;
        }
        // Default: POM architecture (ISSUE #11 FIX: Removed Playwright references)
        const envStrategyRule = analysis.envConfig?.present
            ? "Assume the project uses a `.env` file (e.g., `process.env.APP_URL`). Use WebdriverIO's config loading or `dotenv` rather than hardcoding."
            : "Assume the project manages configuration dynamically (e.g., via a `config/` directory or custom module). Infer the config import from context and use IT rather than hardcoding.";
        const dotenvImportRule = analysis.envConfig?.present
            ? "15. **Environment Setup**: Every Page Object MUST import `dotenv/config` so `.env` values are accessible."
            : "15. **Environment Setup**: Do NOT inject `import 'dotenv/config';`. Use the project's native configuration strategy as inferred from existing Page Objects or Utility helpers.";
        return `
## STRICT RULES - PAGE OBJECT MODEL (Detected: ${arch})

1. **BDD Triad**: Generate a Gherkin \`.feature\` file, a \`.steps.ts\` file, and a \`.page.ts\` file.
2. **Strict POM**: ALL locators and driver commands belong ONLY inside Page Object methods. Step definitions MUST call page methods only.
3. **Page Classes extend BasePage**: Import and extend \`BasePage\` from \`../pages/BasePage\`.
4. **Locators**: Use accessibility-id (\`~id\`) as the PRIMARY strategy. Fall back to \`resource-id\` or \`xpath\` only when necessary.
5. **Reuse**: If an existing step or page method matches, DO NOT create a new one.
6. **Mobile Gestures**: Import \`MobileGestures\` from \`../utils/MobileGestures\` for swipe, longPress, scrollToText, handleAlert.
7. **Action Utilities**: Import \`ActionUtils\` from \`../utils/ActionUtils\` for all element interactions: \`ActionUtils.tap(selector)\`, \`ActionUtils.type(selector, text)\`, \`ActionUtils.clear(selector)\`, \`ActionUtils.tapByText(text)\`, \`ActionUtils.tapByIndex(selector, n)\`, \`ActionUtils.tapAndWait(tap, waitFor)\`, \`ActionUtils.hideKeyboard()\`, \`ActionUtils.tapBack()\`. Do NOT call \`$(selector).click()\` or \`$(selector).setValue()\` directly inside Page Objects — always go through ActionUtils.
8. **API Mocking**: If the test requires specific backend state, use \`MockServer\` from \`../utils/MockServer\`.
9. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
10. **Data-Driven**: If the scenario involves multiple users/values, use a Scenario Outline with Examples.
11. **WebView Screens**: Use \`this.switchToWebView()\` before interacting with web elements and \`this.switchToNativeContext()\` to return to native.
12. **App Lifecycle**: Use \`this.openDeepLink(url)\` for direct navigation. Use \`this.handlePermissionDialog(accept)\` for system popups.
13. **TSConfig Autowiring**: If your implementation creates a NEW top-level architectural directory (e.g., \`models/\`, \`types/\`, \`helpers/\`), you MUST also actively update \`tsconfig.json\` in the target project via standard file editing tools. You must append the corresponding path alias (e.g., \`"@models/*": ["./models/*"]\`) to \`compilerOptions.paths\`, and ENSURE your newly generated TypeScript files strictly use that alias in their imports.
${platform === 'both' ? `
## CROSS-PLATFORM RULES (platform: both)

When platform is "both", generate SEPARATE Page Objects per platform:
- \`pages/LoginPage.android.ts\` -- Uses Android locators
- \`pages/LoginPage.ios.ts\` -- Uses iOS locators
- \`pages/LoginPage.ts\` -- Platform router
` : ''}
`;
    }
}
