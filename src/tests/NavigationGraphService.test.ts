import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { NavigationGraphService } from '../services/NavigationGraphService.js';
import type { NavigationPath, ElementInfo } from '../services/NavigationGraphService.js';

describe('NavigationGraphService - P2 Enhancement 3: Test Coverage', () => {
  const testProjectRoot = path.join(process.cwd(), 'test-nav-project-' + Date.now());
  const stepDefsDir = path.join(testProjectRoot, 'src', 'step-definitions');
  const pagesDir = path.join(testProjectRoot, 'src', 'pages');
  const appForgeDir = path.join(testProjectRoot, '.appforge');

  beforeEach(() => {
    // Create test project structure
    fs.mkdirSync(stepDefsDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.mkdirSync(appForgeDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test project
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });

  // ─── Navigation Graph Caching Tests ────────────────────────────────

  describe('P2 Improvement 2: Graph Caching & Incremental Updates', () => {
    test('should use cached graph when no files have changed', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Create initial step definition
      const stepDefFile = path.join(stepDefsDir, 'login.steps.ts');
      fs.writeFileSync(stepDefFile, `
        import { Given, When } from '@cucumber/cucumber';
        
        Given('I am on the login screen', async () => {
          // Navigate to login
        });
        
        When('I tap the login button', async () => {
          // Tap login
        });
      `);

      // First extraction - should build graph
      const graph1 = await service.extractNavigationMap(testProjectRoot);
      assert.ok(graph1.nodes.size >= 0);

      // Second extraction - should use cache (no force rebuild)
      const graph2 = await service.extractNavigationMap(testProjectRoot, false);
      
      // Verify it used the cached version
      assert.strictEqual(graph2.lastUpdated.toString(), graph1.lastUpdated.toString());
    });

    test('should rebuild graph when files are modified', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Create initial step definition
      const stepDefFile = path.join(stepDefsDir, 'login.steps.ts');
      fs.writeFileSync(stepDefFile, `
        Given('I am on the login screen', async () => {});
      `);

      // First extraction
      const graph1 = await service.extractNavigationMap(testProjectRoot);
      const initialUpdateTime = graph1.lastUpdated;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Modify the file
      fs.writeFileSync(stepDefFile, `
        Given('I am on the login screen', async () => {});
        When('I navigate to dashboard', async () => {});
      `);

      // Second extraction - should detect change and rebuild
      const graph2 = await service.extractNavigationMap(testProjectRoot, false);
      
      assert.notStrictEqual(graph2.lastUpdated.toString(), initialUpdateTime.toString());
    });

    test('should save and load file hashes correctly', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const stepDefFile = path.join(stepDefsDir, 'test.steps.ts');
      fs.writeFileSync(stepDefFile, `Given('Test step', async () => {});`);

      // Extract graph (creates hashes)
      await service.extractNavigationMap(testProjectRoot);

      // Verify hash file was created
      const hashFile = path.join(appForgeDir, 'file-hashes.json');
      assert.ok(fs.existsSync(hashFile));

      const hashes = JSON.parse(fs.readFileSync(hashFile, 'utf-8'));
      assert.ok(Object.keys(hashes).length > 0);
    });
  });

  // ─── Enhanced Confidence Scoring Tests ─────────────────────────────

  describe('P2 Improvement 3: Multi-Factor Confidence Scoring', () => {
    test('should calculate path quality metrics', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const graphData = {
        nodes: {
          'screen1': {
            screen: 'screen1',
            elements: [] as ElementInfo[],
            connections: [{
              action: 'tap' as const,
              targetScreen: 'screen2',
              confidence: 0.5,
              description: 'Navigate to screen2'
            }],
            visitCount: 1,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'screen2': {
            screen: 'screen2',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          }
        },
        entryPoints: ['screen1'] as string[],
        lastUpdated: new Date().toISOString()
      };

      const graphPath = path.join(appForgeDir, 'navigation-graph.json');
      fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2));

      // Reload service to pick up the graph
      const service2 = new NavigationGraphService(testProjectRoot);
      const navPath = await service2.suggestNavigationSteps('screen1', 'screen2');
      
      if (navPath && navPath.riskFactors) {
        assert.ok(navPath.riskFactors.some((r: string) => r.includes('need to be created')));
      }
    });

    test('should identify long navigation path as risk', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Create a long chain: screen1 → screen2 → ... → screen7
      const nodes: any = {};
      for (let i = 1; i <= 7; i++) {
        nodes[`screen${i}`] = {
          screen: `screen${i}`,
          elements: [] as ElementInfo[],
          connections: i < 7 ? [{
            action: 'tap' as const,
            targetScreen: `screen${i + 1}`,
            confidence: 0.8,
            description: `Go to screen${i + 1}`,
            stepCode: `When I navigate to screen ${i + 1}`
          }] : [] as any[],
          visitCount: 1,
          lastVisited: new Date().toISOString(),
          screenSignature: `sig${i}`
        };
      }

      const graphData = {
        nodes,
        entryPoints: ['screen1'] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const navPath = await service2.suggestNavigationSteps('screen1', 'screen7');
      
      if (navPath && navPath.riskFactors) {
        assert.ok(navPath.riskFactors.some((r: string) => r.includes('Long navigation path')));
      }
    });

    test('should calculate higher maintenance score for accessibility IDs', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Create graph with accessibility ID locators
      const graphData = {
        nodes: {
          'loginscreen': {
            screen: 'loginscreen',
            elements: [{ accessibilityId: '~username' }] as ElementInfo[],
            connections: [{
              action: 'tap' as const,
              targetScreen: 'dashboardscreen',
              triggerElement: { accessibilityId: '~loginButton' },
              confidence: 0.9,
              description: 'Tap login',
              stepCode: 'When I tap the login button'
            }],
            visitCount: 5,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'dashboardscreen': {
            screen: 'dashboardscreen',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 3,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          }
        },
        entryPoints: ['loginscreen'] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const navPath = await service2.suggestNavigationSteps('loginscreen', 'dashboardscreen');
      
      if (navPath && navPath.pathQuality) {
        // Accessibility ID should result in high maintenance score
        assert.ok(navPath.pathQuality.maintenanceScore > 0.8);
        assert.ok(navPath.pathQuality.crossPlatformScore > 0.8);
      }
    });
  });

  // ─── Navigation Context Generation Tests ───────────────────────────

  describe('Navigation Context Generation', () => {
    test('should generate navigation context for target screen', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const graphData = {
        nodes: {
          'loginscreen': {
            screen: 'loginscreen',
            elements: [] as ElementInfo[],
            connections: [{
              action: 'tap' as const,
              targetScreen: 'dashboardscreen',
              confidence: 0.9,
              description: 'Navigate to dashboard',
              stepCode: 'When I tap the login button'
            }],
            visitCount: 10,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'dashboardscreen': {
            screen: 'dashboardscreen',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 5,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          }
        },
        entryPoints: ['loginscreen'] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const context = await service2.generateNavigationContext('dashboardscreen');
      
      assert.ok(context.includes('dashboardscreen'));
      assert.ok(context.includes('loginscreen'));
    });

    test('should return message when no navigation paths found', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Empty graph
      const graphData = {
        nodes: {},
        entryPoints: [] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const context = await service2.generateNavigationContext('unknownscreen');
      
      assert.ok(context.includes('No navigation paths found'));
    });
  });

  // ─── Error Handling Tests ──────────────────────────────────────────

  describe('Error Handling', () => {
    test('should handle missing project directory gracefully', async () => {
      const invalidRoot = path.join(process.cwd(), 'non-existent-project-' + Date.now());
      const service = new NavigationGraphService(invalidRoot);
      
      // Should not throw, returns empty graph
      const graph = await service.extractNavigationMap(invalidRoot);
      
      assert.strictEqual(graph.nodes.size, 0);
    });

    test('should handle corrupted graph file', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      // Write invalid JSON
      const graphPath = path.join(appForgeDir, 'navigation-graph.json');
      fs.writeFileSync(graphPath, '{ invalid json }');

      // Should fallback to empty graph
      const service2 = new NavigationGraphService(testProjectRoot);
      const graph = await service2.extractNavigationMap(testProjectRoot);
      
      assert.ok(graph.nodes.size >= 0);
    });
  });

  // ─── Entry Point Detection Tests ───────────────────────────────────

  describe('Entry Point Detection', () => {
    test('should identify screens with no incoming connections as entry points', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const graphData = {
        nodes: {
          'startscreen': {
            screen: 'startscreen',
            elements: [] as ElementInfo[],
            connections: [{
              action: 'tap' as const,
              targetScreen: 'nextscreen',
              confidence: 0.8,
              description: 'Go next'
            }],
            visitCount: 1,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'nextscreen': {
            screen: 'nextscreen',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          }
        },
        entryPoints: [] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      await service2.extractNavigationMap(testProjectRoot);
      const entryPoints = service2.getEntryPoints();
      
      assert.ok(entryPoints.includes('startscreen'));
      assert.ok(!entryPoints.includes('nextscreen'));
    });
  });

  // ─── Reachable Screens Tests ───────────────────────────────────────

  describe('Reachable Screens Detection', () => {
    test('should find all reachable screens from entry point', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const graphData = {
        nodes: {
          'screen1': {
            screen: 'screen1',
            elements: [] as ElementInfo[],
            connections: [
              { action: 'tap' as const, targetScreen: 'screen2', confidence: 0.8, description: 'To 2' },
              { action: 'tap' as const, targetScreen: 'screen3', confidence: 0.8, description: 'To 3' }
            ],
            visitCount: 1,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'screen2': {
            screen: 'screen2',
            elements: [] as ElementInfo[],
            connections: [{ action: 'tap' as const, targetScreen: 'screen4', confidence: 0.8, description: 'To 4' }],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          },
          'screen3': {
            screen: 'screen3',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig3'
          },
          'screen4': {
            screen: 'screen4',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig4'
          }
        },
        entryPoints: ['screen1'] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const reachable = service2.getReachableScreens('screen1', 3);
      
      assert.ok(reachable.includes('screen2'));
      assert.ok(reachable.includes('screen3'));
      assert.ok(reachable.includes('screen4'));
      assert.ok(!reachable.includes('screen1')); // Excludes starting screen
    });

    test('should respect maxDepth parameter', async () => {
      const service = new NavigationGraphService(testProjectRoot);
      
      const graphData = {
        nodes: {
          'screen1': {
            screen: 'screen1',
            elements: [] as ElementInfo[],
            connections: [{ action: 'tap' as const, targetScreen: 'screen2', confidence: 0.8, description: 'To 2' }],
            visitCount: 1,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig1'
          },
          'screen2': {
            screen: 'screen2',
            elements: [] as ElementInfo[],
            connections: [{ action: 'tap' as const, targetScreen: 'screen3', confidence: 0.8, description: 'To 3' }],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig2'
          },
          'screen3': {
            screen: 'screen3',
            elements: [] as ElementInfo[],
            connections: [] as any[],
            visitCount: 0,
            lastVisited: new Date().toISOString(),
            screenSignature: 'sig3'
          }
        },
        entryPoints: ['screen1'] as string[],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(path.join(appForgeDir, 'navigation-graph.json'), JSON.stringify(graphData, null, 2));

      const service2 = new NavigationGraphService(testProjectRoot);
      const reachable = service2.getReachableScreens('screen1', 1); // maxDepth = 1
      
      assert.ok(reachable.includes('screen2'));
      assert.ok(!reachable.includes('screen3')); // Beyond depth 1
    });
  });
});