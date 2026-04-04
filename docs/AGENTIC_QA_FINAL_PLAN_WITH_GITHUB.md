# Agentic QA Ecosystem - Final Config-Driven Plan with GitHub Integration

## Executive Summary

**ENHANCED APPROACH: Multi-project, GitHub-aware, Config-driven**

This plan incorporates:
1. ✅ **Multi-project Jira support** (PROJ1, PROJ2, etc.)
2. ✅ **GitHub PR integration** for code-level context
3. ✅ **Xray test linkage** for coverage traceability
4. ✅ **Config-driven architecture** (all credentials/settings in MCP config)
5. ✅ **Sketch integration** (design alternative to Figma)
6. ✅ **Enhanced requirement understanding** (Jira + GitHub PR + Figma/Sketch)

---

## 1. Enhanced Architecture with GitHub Integration

```
                         ┌─────────────────────┐
                         │    AI Agent         │
                         │  (Claude/GPT-4o)    │
                         └──────────┬──────────┘
                                    │
                         ┌──────────┴──────────┐
                         │  AppForge/TestForge │
                         │  Orchestrator       │
                         └──────────┬──────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
  ┌────────────┐            ┌─────────────┐          ┌──────────────┐
  │ Requirement│            │   Design    │          │     Code     │
  │  Sources   │            │   Sources   │          │   Sources    │
  └────────────┘            └─────────────┘          └──────────────┘
         │                          │                          │
    ┌────┴────┐              ┌──────┴──────┐           ┌──────┴──────┐
    │         │              │             │           │             │
    ▼         ▼              ▼             ▼           ▼             ▼
┌──────┐ ┌──────────┐  ┌────────┐  ┌──────────┐ ┌────────┐  ┌──────────┐
│ Jira │ │Confluence│  │ Figma  │  │  Sketch  │ │ GitHub │  │  GitLab  │
│ MCP  │ │   MCP    │  │  MCP   │  │ (Fetch)  │ │  MCP   │  │   MCP    │
└──────┘ └──────────┘  └────────┘  └──────────┘ └────────┘  └──────────┘
    │         │              │            │           │            │
    ▼         ▼              ▼            ▼           ▼            ▼
[Tickets] [PRDs]      [Designs]    [Designs]    [PRs/Diffs]  [PRs/Diffs]
    │         │              │            │           │            │
    └─────────┴──────────────┴────────────┴───────────┴────────────┘
                                  │
                         ┌────────┴────────┐
                         │   Test Suite    │
                         │   Generation    │
                         └────────┬────────┘
                                  │
                         ┌────────┴────────┐
                         │      Xray       │
                         │   (via Fetch)   │
                         └─────────────────┘
                                  │
                         ┌────────┴────────┐
                         │  Coverage       │
                         │  Traceability   │
                         │  Matrix         │
                         └─────────────────┘
```

---

## 2. Config-Driven MCP Configuration

### Complete `.mcp/config.json` Structure

```json
{
  "version": "1.0.0",
  "projects": {
    "PROJ1": {
      "name": "E-Commerce Platform",
      "jira": {
        "projectKey": "PROJ1",
        "url": "https://company.atlassian.net",
        "email": "{{JIRA_EMAIL}}",
        "apiToken": "{{JIRA_API_TOKEN}}"
      },
      "confluence": {
        "spaceKey": "PROJ1",
        "url": "https://company.atlassian.net/wiki",
        "email": "{{CONFLUENCE_EMAIL}}",
        "apiToken": "{{CONFLUENCE_API_TOKEN}}"
      },
      "xray": {
        "url": "https://xray.cloud.getxray.app",
        "clientId": "{{XRAY_CLIENT_ID}}",
        "clientSecret": "{{XRAY_CLIENT_SECRET}}",
        "testSetPrefix": "TS-PROJ1",
        "linkField": "customfield_10100"
      },
      "github": {
        "owner": "company-org",
        "repo": "ecommerce-platform",
        "token": "{{GITHUB_TOKEN}}",
        "baseBranch": "main"
      },
      "design": {
        "tool": "figma",
        "figma": {
          "token": "{{FIGMA_TOKEN}}",
          "fileKey": "abc123xyz",
          "teamId": "team-ecommerce"
        }
      },
      "testFramework": "playwright-bdd",
      "coverageThreshold": 80
    },
    "PROJ2": {
      "name": "Mobile Banking App",
      "jira": {
        "projectKey": "PROJ2",
        "url": "https://company.atlassian.net",
        "email": "{{JIRA_EMAIL}}",
        "apiToken": "{{JIRA_API_TOKEN}}"
      },
      "confluence": {
        "spaceKey": "BANKING",
        "url": "https://company.atlassian.net/wiki",
        "email": "{{CONFLUENCE_EMAIL}}",
        "apiToken": "{{CONFLUENCE_API_TOKEN}}"
      },
      "xray": {
        "url": "https://xray.cloud.getxray.app",
        "clientId": "{{XRAY_CLIENT_ID}}",
        "clientSecret": "{{XRAY_CLIENT_SECRET}}",
        "testSetPrefix": "TS-PROJ2",
        "linkField": "customfield_10100"
      },
      "github": {
        "owner": "company-org",
        "repo": "mobile-banking",
        "token": "{{GITHUB_TOKEN}}",
        "baseBranch": "develop"
      },
      "design": {
        "tool": "sketch",
        "sketch": {
          "token": "{{SKETCH_TOKEN}}",
          "workspaceId": "ws-banking",
          "documentId": "doc-mobile-app"
        }
      },
      "testFramework": "appium-cucumber",
      "coverageThreshold": 85
    }
  },
  "observability": {
    "sentry": {
      "enabled": true,
      "orgSlug": "company",
      "token": "{{SENTRY_TOKEN}}",
      "projects": ["ecommerce-web", "banking-app"]
    },
    "datadog": {
      "enabled": true,
      "apiKey": "{{DATADOG_API_KEY}}",
      "appKey": "{{DATADOG_APP_KEY}}",
      "site": "datadoghq.com"
    }
  },
  "vlm": {
    "provider": "openai",
    "model": "gpt-4o",
    "apiKey": "{{OPENAI_API_KEY}}",
    "maxTokens": 4096,
    "temperature": 0.2
  },
  "vectorStore": {
    "enabled": true,
    "provider": "chroma",
    "host": "localhost",
    "port": 8000,
    "collectionPrefix": "test-requirements"
  }
}
```

---

## 3. GitHub Integration: The Missing Link

### Why GitHub Integration is Critical

**Problem:** Jira tickets often lack technical depth
- ✅ "As a user, I want to reset my password"
- ❌ Doesn't mention: rate limiting, email templates, token expiration, DB schema changes

**Solution:** GitHub PR provides code-level context
1. **What files changed** (frontend vs. backend vs. DB)
2. **What functions were added/modified** (new API endpoints, validation logic)
3. **Edge cases in code** (error handling, null checks, boundary conditions)
4. **Dependencies updated** (new libraries, breaking changes)

### Existing GitHub MCP Server

**Server:** `@modelcontextprotocol/server-github`
- **Repository:** https://github.com/modelcontextprotocol/servers/tree/main/src/github
- **Capabilities:**
  - `create_or_update_file` - Create/update files
  - `search_repositories` - Search repos
  - `create_repository` - Create new repo
  - `get_file_contents` - Read file contents
  - `push_files` - Push multiple files
  - `create_issue` - Create GitHub issues
  - `create_pull_request` - Create PRs
  - `fork_repository` - Fork repos
  - `create_branch` - Create branches
  - `list_commits` - List commits
  - `list_issues` - List issues
  - `update_issue` - Update issues
  - `add_issue_comment` - Comment on issues
  - `search_code` - Search codebase
  - `search_issues` - Search issues/PRs

**Configuration:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      }
    }
  }
}
```

---

## 4. Enhanced Requirement Gathering Flow

### Traditional Approach (Incomplete):
```
Jira Ticket → Test Cases
```

### Enhanced Approach (Complete):
```
Jira Ticket
    ↓
    ├─→ Fetch linked Confluence PRD (business context)
    ├─→ Fetch linked Figma/Sketch design (UI context)
    ├─→ Search GitHub for related PRs (code context)
    │       ↓
    │   Extract from PR:
    │   • Changed files
    │   • Function signatures
    │   • Test files added
    │   • Dependencies updated
    │   • Code review comments
    ↓
Synthesized Requirement (Business + UI + Code)
    ↓
Generate Comprehensive Test Cases
    ↓
Link to Xray for Coverage Tracking
```

---

## 5. New Service: `GitHubContextAnalyzer`

### Purpose: Extract code-level insights from PRs linked to Jira tickets

```typescript
export class GitHubContextAnalyzer {
  constructor(private mcpClient: ExternalMcpClient) {}
  
  async analyzeTicketChanges(
    projectConfig: ProjectConfig,
    ticketId: string
  ): Promise<GitHubContextAnalysis> {
    
    // 1. Search for PRs mentioning the ticket ID
    const prs = await this.mcpClient.callGitHubTool('search_issues', {
      query: `repo:${projectConfig.github.owner}/${projectConfig.github.repo} is:pr ${ticketId} is:closed`
    });
    
    // 2. For each PR, get detailed changes
    const prAnalyses = await Promise.all(
      prs.items.map(pr => this.analyzePR(projectConfig, pr.number))
    );
    
    // 3. Aggregate insights
    return this.synthesizeCodeContext(prAnalyses);
  }
  
  private async analyzePR(
    projectConfig: ProjectConfig,
    prNumber: number
  ): Promise<PRAnalysis> {
    
    // Get PR details and commits
    const commits = await this.mcpClient.callGitHubTool('list_commits', {
      owner: projectConfig.github.owner,
      repo: projectConfig.github.repo,
      pull_number: prNumber
    });
    
    // Extract changed files
    const changedFiles: string[] = [];
    const newFunctions: string[] = [];
    const modifiedFunctions: string[] = [];
    const testFilesAdded: string[] = [];
    
    for (const commit of commits) {
      // Get file contents before and after
      const diff = await this.getCommitDiff(projectConfig, commit.sha);
      
      // Parse diff to extract:
      // - New functions/classes
      // - Modified functions/classes
      // - New test files
      const parsed = this.parseDiff(diff);
      
      changedFiles.push(...parsed.files);
      newFunctions.push(...parsed.newFunctions);
      modifiedFunctions.push(...parsed.modifiedFunctions);
      testFilesAdded.push(...parsed.testFiles);
    }
    
    // Get code review comments for edge cases mentioned by reviewers
    const reviewComments = await this.getReviewComments(projectConfig, prNumber);
    const edgeCasesMentioned = this.extractEdgeCases(reviewComments);
    
    return {
      prNumber,
      changedFiles,
      newFunctions,
      modifiedFunctions,
      testFilesAdded,
      edgeCasesMentioned,
      techStack: this.detectTechStack(changedFiles),
      hasDBChanges: this.detectDBMigrations(changedFiles),
      hasAPIChanges: this.detectAPIChanges(changedFiles)
    };
  }
  
  private parseDiff(diff: string): ParsedDiff {
    // Use AST parsing to extract meaningful changes
    // For TypeScript/JavaScript: use @babel/parser
    // For Python: use ast module
    // For Java: use JavaParser
    
    return {
      files: [...],
      newFunctions: ['handlePasswordReset', 'validateEmailToken'],
      modifiedFunctions: ['sendEmail', 'logSecurityEvent'],
      testFiles: ['passwordReset.test.ts', 'emailValidation.test.ts']
    };
  }
  
  private extractEdgeCases(comments: Comment[]): string[] {
    // Use NLP/LLM to extract edge cases from review comments
    // Example comments:
    // "What happens if the email doesn't exist?"
    // "Should we rate limit this endpoint?"
    // "Need to handle expired tokens"
    
    return [
      'Non-existent email address',
      'Rate limiting (max 3 attempts per hour)',
      'Expired password reset tokens',
      'Concurrent reset requests'
    ];
  }
}
```

---

## 6. Enhanced Requirement Synthesizer with GitHub

### Updated `RequirementsSynthesizer`

```typescript
export class RequirementsSynthesizer {
  constructor(
    private mcpClient: ExternalMcpClient,
    private githubAnalyzer: GitHubContextAnalyzer
  ) {}
  
  async fetchRequirements(
    projectKey: string,
    ticketId: string
  ): Promise<EnhancedRequirement> {
    
    const projectConfig = this.getProjectConfig(projectKey);
    
    // 1. Fetch Jira ticket
    const ticket = await this.mcpClient.callJiraTool('get_issue', {
      issueKey: ticketId
    });
    
    // 2. Extract business requirements
    const businessReqs = this.extractBusinessRequirements(ticket);
    
    // 3. Fetch linked Confluence PRDs
    const confluenceLinks = this.extractConfluenceLinks(ticket);
    const prds = await this.fetchConfluenceDocs(confluenceLinks, projectConfig);
    
    // 4. Fetch design files (Figma or Sketch)
    const designLinks = this.extractDesignLinks(ticket);
    const designs = await this.fetchDesigns(designLinks, projectConfig);
    
    // 5. Analyze GitHub PRs for code context
    const codeContext = await this.githubAnalyzer.analyzeTicketChanges(
      projectConfig,
      ticketId
    );
    
    // 6. Synthesize all sources
    return {
      ticketId,
      projectKey,
      summary: ticket.fields.summary,
      description: ticket.fields.description,
      acceptanceCriteria: this.extractACs(ticket),
      
      // Business layer
      businessRequirements: businessReqs,
      prdContext: prds,
      
      // Design layer
      designFiles: designs,
      uiExpectations: this.extractUIExpectations(designs),
      
      // Code layer
      codeChanges: codeContext,
      changedFiles: codeContext.allChangedFiles,
      newFunctions: codeContext.allNewFunctions,
      modifiedFunctions: codeContext.allModifiedFunctions,
      techStack: codeContext.techStack,
      
      // Edge cases (combination of all sources)
      edgeCases: [
        ...this.extractEdgeCasesFromACs(ticket),
        ...this.extractEdgeCasesFromDesign(designs),
        ...codeContext.edgeCasesMentioned
      ],
      
      // Test hints
      existingTests: codeContext.testFilesAdded,
      suggestedTestAreas: this.identifyTestAreas(codeContext),
      
      // Coverage tracking
      xrayTestSet: this.generateXrayTestSetName(projectConfig, ticketId)
    };
  }
  
  private identifyTestAreas(codeContext: GitHubContextAnalysis): string[] {
    const areas: string[] = [];
    
    if (codeContext.hasAPIChanges) {
      areas.push('API endpoint testing');
      areas.push('Request validation');
      areas.push('Response schema validation');
      areas.push('Error handling (4xx/5xx)');
    }
    
    if (codeContext.hasDBChanges) {
      areas.push('Database migration testing');
      areas.push('Data integrity checks');
      areas.push('Rollback scenarios');
    }
    
    if (codeContext.hasFrontendChanges) {
      areas.push('UI component testing');
      areas.push('User interaction flows');
      areas.push('Visual regression testing');
    }
    
    return areas;
  }
}
```

---

## 7. Xray Integration with Traceability

### Enhanced `XrayIntegration` Service

```typescript
export class XrayIntegration {
  constructor(private mcpClient: ExternalMcpClient) {}
  
  async createTestCaseWithLinkage(
    projectKey: string,
    ticketId: string,
    testCase: GeneratedTestCase
  ): Promise<XrayTestCase> {
    
    const projectConfig = this.getProjectConfig(projectKey);
    
    // 1. Authenticate with Xray
    const token = await this.authenticateXray(projectConfig);
    
    // 2. Create test case in Xray
    const xrayTest = await this.mcpClient.callFetchTool(
      `${projectConfig.xray.url}/api/v2/import/feature`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: this.formatGherkinForXray(testCase.gherkin, {
          projectKey,
          testSetPrefix: projectConfig.xray.testSetPrefix,
          tags: [ticketId, ...testCase.tags]
        })
      }
    );
    
    // 3. Link test to Jira requirement
    await this.linkTestToRequirement(
      projectConfig,
      xrayTest.testKey,
      ticketId
    );
    
    // 4. Add to test set
    await this.addToTestSet(
      projectConfig,
      xrayTest.testKey,
      this.getTestSetId(projectConfig, ticketId)
    );
    
    // 5. Add traceability metadata
    await this.addTraceabilityMetadata(
      projectConfig,
      xrayTest.testKey,
      {
        sourceFiles: testCase.sourceFiles,
        coverage: testCase.coverageAreas,
        relatedPRs: testCase.relatedPRs
      }
    );
    
    return xrayTest;
  }
  
  private async linkTestToRequirement(
    projectConfig: ProjectConfig,
    testKey: string,
    requirementKey: string
  ): Promise<void> {
    
    // Use Jira MCP to update the requirement issue
    await this.mcpClient.callJiraTool('update_issue', {
      issueKey: requirementKey,
      fields: {
        [projectConfig.xray.linkField]: [
          { key: testKey }
        ]
      }
    });
    
    // Also add comment to both issues
    await this.mcpClient.callJiraTool('add_comment', {
      issueKey: requirementKey,
      body: `Automated test created: ${testKey}\nCoverage areas: ${testCase.coverageAreas.join(', ')}`
    });
    
    await this.mcpClient.callJiraTool('add_comment', {
      issueKey: testKey,
      body: `Tests requirement: ${requirementKey}\nGenerated from: Jira + GitHub PR analysis + Figma design`
    });
  }
  
  async generateCoverageReport(projectKey: string): Promise<CoverageReport> {
    const projectConfig = this.getProjectConfig(projectKey);
    
    // 1. Get all requirements in project
    const requirements = await this.mcpClient.callJiraTool('list_issues', {
      jql: `project = ${projectKey} AND type = Story`
    });
    
    // 2. For each requirement, check linked tests
    const coverage = await Promise.all(
      requirements.issues.map(async (req) => {
        const linkedTests = await this.getLinkedTests(projectConfig, req.key);
        
        return {
          requirementKey: req.key,
          requirementSummary: req.fields.summary,
          testCount: linkedTests.length,
          testKeys: linkedTests.map(t => t.key),
          coverage: linkedTests.length > 0 ? 'covered' : 'not-covered'
        };
      })
    );
    
    // 3. Generate matrix
    return {
      projectKey,
      totalRequirements: requirements.total,
      coveredRequirements: coverage.filter(c => c.coverage === 'covered').length,
      coveragePercentage: (coverage.filter(c => c.coverage === 'covered').length / requirements.total) * 100,
      details: coverage
    };
  }
}
```

---

## 8. Sketch Integration (Alternative to Figma)

### Sketch Cloud API Integration

**Note:** Sketch doesn't have an official MCP server, but we can use `@modelcontextprotocol/server-fetch`:

```typescript
export class SketchIntegration {
  constructor(private mcpClient: ExternalMcpClient) {}
  
  async fetchDesign(
    workspaceId: string,
    documentId: string,
    token: string
  ): Promise<SketchDesign> {
    
    // 1. Get document metadata
    const doc = await this.mcpClient.callFetchTool(
      `https://api.sketch.com/v1/documents/${documentId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // 2. Get artboards (screens)
    const artboards = await this.mcpClient.callFetchTool(
      `https://api.sketch.com/v1/documents/${documentId}/artboards`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    // 3. For each artboard, get preview image
    const artboardImages = await Promise.all(
      artboards.data.map(async (artboard) => {
        const preview = await this.mcpClient.callFetchTool(
          `https://api.sketch.com/v1/artboards/${artboard.id}/preview`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        return {
          artboardId: artboard.id,
          name: artboard.name,
          imageUrl: preview.url
        };
      })
    );
    
    return {
      documentId,
      name: doc.name,
      artboards: artboardImages
    };
  }
}
```

---

## 9. Complete Orchestration Flow

### Enhanced `AgenticOrchestrator`

```typescript
export class AgenticOrchestrator {
  constructor(
    private requirementsSynth: RequirementsSynthesizer,
    private visualAnalyzer: VisualAnalyzer,
    private testGenerator: TestGenerationService,
    private xrayIntegration: XrayIntegration
  ) {}
  
  async generateTestsFromJiraTicket(
    projectKey: string,
    ticketId: string
  ): Promise<TestGenerationResult> {
    
    // Step 1: Gather comprehensive requirements
    console.log(`📋 Fetching requirements for ${ticketId}...`);
    const requirements = await this.requirementsSynth.fetchRequirements(
      projectKey,
      ticketId
    );
    
    console.log(`✅ Gathered context from:
      - Jira ticket: ${requirements.summary}
      - Confluence PRDs: ${requirements.prdContext.length} documents
      - Design files: ${requirements.designFiles.length} screens
      - GitHub PRs: ${requirements.codeChanges.prs.length} pull requests
      - Changed files: ${requirements.changedFiles.length}
      - Edge cases identified: ${requirements.edgeCases.length}
    `);
    
    // Step 2: Analyze designs with VLM (if available)
    let visualValidations = [];
    if (requirements.designFiles.length > 0) {
      console.log(`🎨 Analyzing designs with VLM...`);
      visualValidations = await Promise.all(
        requirements.designFiles.map(design => 
          this.visualAnalyzer.analyzeDesign(design)
        )
      );
    }
    
    // Step 3: Generate test cases with AI
    console.log(`🤖 Generating test cases...`);
    const testPlan = await this.testGenerator.generateFromEnhancedRequirements({
      requirements,
      visualValidations,
      codeContext: requirements.codeChanges,
      framework: this.getFramework(projectKey)
    });
    
    console.log(`✅ Generated ${testPlan.testCases.length} test cases:
      - Happy path: ${testPlan.testCases.filter(t => t.type === 'happy-path').length}
      - Edge cases: ${testPlan.testCases.filter(t => t.type === 'edge-case').length}
      - Error handling: ${testPlan.testCases.filter(t => t.type === 'error').length}
      - Visual validation: ${testPlan.testCases.filter(t => t.type === 'visual').length}
    `);
    
    // Step 4: Write test files to codebase
    console.log(`📝 Writing test files...`);
    const writtenFiles = await this.writeTestFiles(projectKey, testPlan);
    
    // Step 5: Push tests to Xray and link to requirement
    console.log(`🔗 Linking tests to Xray...`);
    const xrayTests = await Promise.all(
      testPlan.testCases.map(testCase =>
        this.xrayIntegration.createTestCaseWithLinkage(
          projectKey,
          ticketId,
          testCase
        )
      )
    );
    
    // Step 6: Generate coverage report
    console.log(`📊 Generating coverage report...`);
    const coverageReport = await this.xrayIntegration.generateCoverageReport(projectKey);
    
    return {
      ticketId,
      projectKey,
      testCases: testPlan.testCases,
      xrayTestKeys: xrayTests.map(t => t.testKey),
      writtenFiles,
      coverageReport,
      summary: {
        requirementsCovered: requirements.acceptanceCriteria.length,
        testCasesGenerated: testPlan.testCases.length,
        edgeCasesIdentified: requirements.edgeCases.length,
        filesChanged: requirements.changedFiles.length,
        overallCoverage: coverageReport.coveragePercentage
      }
    };
  }
}
```

---

## 10. Example: Complete Flow for Password Reset Feature

### Scenario: PROJ1-1234: Implement Password Reset

#### 1. Jira Ticket (PROJ1-1234)
```
Summary: Implement password reset flow
Description: Users should be able to reset their password via email

Acceptance Criteria:
- User enters email on forgot password page
- System sends reset link to email
- Link expires after 24 hours
- User can set new password
```

#### 2. GitHub PR (#456) - Code Changes
```
Changed files:
- src/api/auth/passwordReset.ts (NEW)
- src/services/emailService.ts (MODIFIED)
- src/database/migrations/add_reset_tokens.sql (NEW)
- src/utils/tokenGenerator.ts (MODIFIED)

New functions:
- initiatePasswordReset(email: string)
- validateResetToken(token: string)
- resetPassword(token: string, newPassword: string)

Review comments:
- "What if user requests multiple resets?" → Rate limiting needed
- "Token should be single-use" → Invalidate after use
- "Should we notify on successful reset?" → Send confirmation email
```

#### 3. Figma Design
```
Screens:
- Forgot Password page (email input + submit)
- Check Email confirmation (success message)
- Reset Password page (new password + confirm)
- Success confirmation

UI Elements detected by VLM:
- Email input field (required)
- Submit button (primary)
- Error message box (for invalid email)
- Success message (green background)
```

#### 4. Confluence PRD
```
Additional requirements:
- Must comply with GDPR (email verification)
- Rate limit: 3 attempts per hour per IP
- Password requirements: min 8 chars, 1 uppercase, 1 number
- Audit logging for all reset attempts
```

#### 5. Generated Test Cases

**From Jira AC:**
```gherkin
@PROJ1-1234
Feature: Password Reset Flow

Scenario: User requests password reset
  Given I am on the forgot password page
  When I enter "user@example.com"
  And I click "Send Reset Link"
  Then I should see "Check your email for reset instructions"
  And a reset email should be sent to "user@example.com"
```

**From GitHub PR (edge cases):**
```gherkin
Scenario: User requests multiple resets (rate limiting)
  Given I have requested password reset 3 times in the last hour
  When I request password reset again
  Then I should see error "Too many reset attempts. Try again later."
  And no email should be sent

Scenario: Token is single-use
  Given I have a valid reset token
  And I have already used it to reset my password
  When I try to use the same token again
  Then I should see error "This reset link has already been used"
```

**From Figma (visual validation):**
```gherkin
Scenario: Visual validation of forgot password page
  Given I am on the forgot password page
  Then I should see an email input field
  And I should see a "Send Reset Link" button
  And the button should have primary styling (blue background)
```

**From PRD (compliance):**
```gherkin
Scenario: Password complexity requirements
  Given I am on the reset password page with a valid token
  When I enter password "weak"
  Then I should see error "Password must be at least 8 characters"
  
Scenario: Audit logging
  Given I initiate a password reset
  Then the system should log the event with timestamp and IP address
```

#### 6. Xray Linkage
```
Test Set: TS-PROJ1-1234-PASSWORD-RESET
Tests:
  - TEST-1001: Basic password reset flow → Linked to PROJ1-1234
  - TEST-1002: Rate limiting validation → Linked to PROJ1-1234
  - TEST-1003: Token single-use validation → Linked to PROJ1-1234
  - TEST-1004: Visual UI validation → Linked to PROJ1-1234
  - TEST-1005: Password complexity → Linked to PROJ1-1234
  - TEST-1006: Audit logging → Linked to PROJ1-1234

Coverage Matrix:
PROJ1-1234 → 6 tests → 100% coverage
```

---

## 11. Additional Integrations to Consider

### GitLab Integration
**Server:** `@modelcontextprotocol/server-gitlab` (if available, else use `fetch`)

```json
{
  "gitlab": {
    "url": "https://gitlab.company.com",
    "token": "{{GITLAB_TOKEN}}",
    "projectId": "123"
  }
}
```

### Linear Integration (Alternative to Jira)
**Use:** `@modelcontextprotocol/server-fetch`

```typescript
const issues = await mcpClient.callFetchTool(
  'https://api.linear.app/graphql',
  {
    method: 'POST',
    headers: { 'Authorization': LINEAR_TOKEN },
    body: JSON.stringify({
      query: `query { issues(filter: { id: { eq: "${issueId}" } }) { nodes { title description } } }`
    })
  }
);
```

### Notion Integration (Alternative to Confluence)
**Server:** `@modelcontextprotocol/server-notion` or `fetch`

### Storybook Integration  (Component Documentation)
Parse Storybook stories for component behavior specs:

```typescript
const storybook = await mcpClient.callFetchTool(
  'https://storybook.company.com/stories.json',
  {}
);

// Extract component props, states, interactions from stories
```

---

## 12. Revised Implementation Phases

### 📦 PHASE 1: Config-Driven Foundation (Week 1-2)
**Deliverables:**
1. Multi-project MCP config schema
2. `ConfigManager` service to read/validate config
3. Install external MCP servers (Jira, Confluence, Figma, GitHub, Fetch)
4. `ExternalMcpClient` with project-aware routing

**Exit Criteria:**
- Can fetch data from all sources for both PROJ1 and PROJ2
- Config validation working
- Project switching functional

---

### 📦 PHASE 2: GitHub Integration (Week 3)
**Deliverables:**
1. `GitHubContextAnalyzer` service
2. PR search and diff parsing
3. Code review comment extraction
4. Edge case identification from code

**Exit Criteria:**
- Can analyze PRs linked to Jira tickets
- Extracts changed files, new functions, edge cases
- Identifies test areas (API, DB, UI)

---

### 📦 PHASE 3: Enhanced Requirements Synthesis (Week 4)
**Deliverables:**
1. Updated `RequirementsSynthesizer` with GitHub integration
2. Multi-source context aggregation
3. Edge case deduplication
4. Test area identification

**Exit Criteria:**
- Generates comprehensive requirement from Jira + GitHub + Confluence + Figma
- Edge cases from all sources aggregated
- Suggested test areas identified

---

### 📦 PHASE 4: Visual Intelligence (Week 5-6)
**Deliverables:**
1. `VisualAnalyzer` service with VLM
2. Figma integration
3. Sketch integration (via Fetch MCP)
4. UI validation test generation

**Exit Criteria:**
- Can analyze Figma/Sketch designs
- Generates visual validation tests
- Cross-validates with design metadata

---

### 📦 PHASE 5: Test Generation (Week 7-8)
**Deliverables:**
1. Enhanced `TestGenerationService` 
2. Multi-source test case generation
3. Coverage area mapping
4. Test categorization (happy/edge/visual/security)

**Exit Criteria:**
- Generates tests from all sources
- Proper categorization
- Coverage aligned with changed files

---

### 📦 PHASE 6: Xray Integration & Traceability (Week 9-10)
**Deliverables:**
1. `XrayIntegration` service
2. Test-requirement linking
3. Coverage matrix generation
4. Traceability metadata

**Exit Criteria:**
- Tests pushed to Xray
- Linked to Jira requirements
- Coverage report generated
- Metadata includes source files and PRs

---

### 📦 PHASE 7: Observability & Prioritization (Week 11)
**Deliverables:**
1. Sentry/Datadog integration
2. Error frequency analysis
3. Risk-based test prioritization

**Exit Criteria:**
- Tests prioritized by production errors
- High-risk areas get more coverage

---

### 📦 PHASE 8: Polish & Documentation (Week 12)
**Deliverables:**
1. Error handling
2. Rate limiting
3. Cost monitoring
4. User documentation

---

## 13. Final Recommendations

### ✅ What Makes This Approach Superior

**1. Complete Context:**
- Jira: Business requirements
- Confluence: Detailed specifications
- Figma/Sketch: Visual expectations
- GitHub: Code-level reality + edge cases from reviews
- Observability: Production behavior

**2. True Coverage:**
- Tests linked to requirements (traceability)
- Coverage matrix shows gaps
- Org has visibility into test coverage

**3. Config-Driven:**
- One config file controls all integrations
- Easy to add new projects
- Token management centralized

**4. Multi-Project Support:**
- PROJ1, PROJ2, etc. all supported
- Project-specific configs (Figma vs. Sketch, Playwright vs. Appium)

**5. GitHub Integration is Key:**
- Code review comments reveal edge cases humans already thought of
- Changed files guide test focus
- Existing tests avoid duplication

### 🎯 Additional Suggestions

**1. Add Slack Integration:**
Notify team when tests are generated:
```json
{
  "slack": {
    "webhookUrl": "{{SLACK_WEBHOOK}}",
    "channel": "#test-automation"
  }
}
```

**2. Add CI/CD Integration:**
Trigger test generation on PR merge:
```yaml
# .github/workflows/auto-test-gen.yml
on:
  pull_request:
    types: [closed]
    
jobs:
  generate-tests:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Extract Jira ticket from PR
      - name: Call AppForge/TestForge to generate tests
      - name: Create PR with new tests
```

**3. Add Test Execution Results Back to Xray:**
After CI runs tests, push results to Xray:
```typescript
await xrayIntegration.updateTestExecution(testKey, {
  status: 'PASSED',
  executionTime: 1234,
  environment: 'staging',
  logs: testOutput
});
```

**4. Add AI-Powered Test Maintenance:**
When a test fails repeatedly, use GitHub Issues MCP to create a bug:
```typescript
if (failureCount > 3) {
  await mcpClient.callGitHubTool('create_issue', {
    owner: 'company',
    repo: 'ecommerce',
    title: `Flaky test: ${testName}`,
    body: `Test has failed ${failureCount} times.\n\nFailure logs:\n${logs}`,
    labels: ['test-flake', 'auto-generated']
  });
}
```

---

## 14. Summary

**This final plan delivers:**

✅ Multi-project support (PROJ1, PROJ2, ...)  
✅ GitHub PR integration for code-level context  
✅ Xray traceability with coverage matrix  
✅ Config-driven architecture  
✅ Figma + Sketch support  
✅ Complete requirement understanding (Business + Design + Code)  
✅ Edge cases from code reviews  
✅ Test-requirement linking  
✅ Production observability  

**Timeline:** 12 weeks  
**Cost:** $120K-150K  
**Team:** 3 people  
**ROI:** High (comprehensive test coverage, traceability, reduced manual work)

The key insight: **GitHub integration is critical** - it provides the missing technical depth that Jira tickets lack.

---

**Document Version:** 3.0 (Final)  
**Date:** 2026-01-04  
**Author:** Cline (AI Analysis)  
**Status:** PRODUCTION-READY PLAN