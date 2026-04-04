import fs from 'fs';
import path from 'path';
import { AppForgeError, ErrorCode } from '../utils/ErrorCodes.js';
import { Questioner } from '../utils/Questioner.js';
export interface McpConfig {
  $schema?: string;
  version?: string;
  project: {
    language: string;
    testFramework: string;
    client: string;
    executionCommand?: string;
  };
  mobile: {
    defaultPlatform: string;
    capabilitiesProfiles: Record<string, any>;
    cloud?: {
      provider: 'browserstack' | 'saucelabs' | 'none';
      username?: string;
      accessKey?: string;
    };
  };
  paths?: {
    featuresRoot?: string;
    pagesRoot?: string;
    stepsRoot?: string;
    utilsRoot?: string;
    testDataRoot?: string;
    reportsRoot?: string;
  };
  execution?: {
    timeoutMs?: number;
    reportPath?: string;
  };
  reuse?: {
    locatorOrder?: string[];
  };
  builds?: Record<string, BuildProfile>;
  activeBuild?: string;
}

export interface BuildProfile {
  appPath: string;
  bundleId?: string;
  serverUrl?: string;
  env?: string;
}

/** Returns safe default paths merged with config paths. */
function resolvePaths(config: McpConfig) {
  return {
    featuresRoot: config.paths?.featuresRoot ?? 'features',
    pagesRoot: config.paths?.pagesRoot ?? 'pages',
    stepsRoot: config.paths?.stepsRoot ?? 'step-definitions',
    utilsRoot: config.paths?.utilsRoot ?? 'utils',
    testDataRoot: config.paths?.testDataRoot ?? 'src/test-data',
    reportsRoot: config.paths?.reportsRoot ?? 'reports'
  };
}

export class McpConfigService {
  private readonly configFileName = 'mcp-config.json';
  private readonly CURRENT_VERSION = '1.1.0';

  public read(projectRoot: string): McpConfig {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw new AppForgeError(ErrorCode.E008_PRECONDITION_FAIL, `Configuration file not found at ${configPath}. Please run setup_project first.`, ["Run setup_project"]);
    }

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // Auto-migration
      if (!raw.version || raw.version === '1.0.0') {
        raw.version = this.CURRENT_VERSION;
        raw.$schema = './.AppForge/configSchema.json'; // Enables IDE autocompletion
        this.write(projectRoot, raw);
        this.generateSchema(projectRoot);
      }

      // Apply defaults so older configs don't crash
      raw.paths = resolvePaths(raw);
      return raw as McpConfig;
    } catch (error: any) {
      throw new AppForgeError(ErrorCode.E005_CONFIG_CORRUPT, `Failed to parse mcp-config.json: ${error.message}. Fix the JSON syntax error (trailing comma, missing brace, etc.) and retry.`, ["Fix the JSON syntax error in mcp-config.json", "Run: npx jsonlint mcp-config.json"]);
    }
  }

  /**
   * Generates a JSON schema file for IDE autocompletion.
   */
  private generateSchema(projectRoot: string) {
    const schemaDir = path.join(projectRoot, '.AppForge');
    if (!fs.existsSync(schemaDir)) {
      fs.mkdirSync(schemaDir, { recursive: true });
    }
    const schemaPath = path.join(schemaDir, 'configSchema.json');
    if (!fs.existsSync(schemaPath)) {
      const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "MCP Config Schema",
        "type": "object",
        "properties": {
          "version": { "type": "string" },
          "project": {
            "type": "object",
            "properties": {
              "language": { "type": "string", "enum": ["typescript"] },
              "testFramework": { "type": "string", "enum": ["cucumber"] },
              "client": { "type": "string", "enum": ["webdriverio"] }
            },
            "required": ["language", "testFramework", "client"]
          },
          "mobile": {
            "type": "object",
            "required": ["defaultPlatform", "capabilitiesProfiles"]
          }
        },
        "required": ["project", "mobile"]
      };
      fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    }
  }

  public write(projectRoot: string, config: Partial<McpConfig>): void {
    const configPath = path.join(projectRoot, this.configFileName);
    let existingConfig: any = {};
    if (fs.existsSync(configPath)) {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    const newConfig = { ...existingConfig, ...config };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
  }

  public updateAppPath(projectRoot: string, platform: 'android' | 'ios', appPath: string, forceWrite: boolean = false): void {
    if (!fs.existsSync(appPath) && !appPath.startsWith('http') && !forceWrite) {
      console.warn(`[AppForge] ⚠️ appPath does not exist on disk: ${appPath}. Saving anyway (forceWrite was not set but proceeding defensively).`);
    }
    const config = this.read(projectRoot);
    for (const profileName in config.mobile.capabilitiesProfiles) {
      const profile = config.mobile.capabilitiesProfiles[profileName];
      if (profile.platformName?.toLowerCase() === platform.toLowerCase()) {
        profile['appium:app'] = appPath;
      }
    }
    this.write(projectRoot, config);
  }

  public setCloudProvider(projectRoot: string, provider: 'browserstack' | 'saucelabs' | 'none', username?: string, accessKey?: string): void {
    const config = this.read(projectRoot);
    config.mobile.cloud = { provider, username, accessKey };
    this.write(projectRoot, config);
  }

  /** Resolves the configured paths (with defaults). */
  public getPaths(config: McpConfig) {
    return resolvePaths(config);
  }

  /**
   * Set or update a named build profile (debug, staging, release, etc.).
   */
  public setBuildProfile(projectRoot: string, name: string, profile: BuildProfile): void {
    const config = this.read(projectRoot);
    if (!config.builds) config.builds = {};
    config.builds[name] = profile;
    this.write(projectRoot, config);
  }

  /**
   * Set the active build profile (injects appPath into capabilities).
   */
  public activateBuild(projectRoot: string, buildName: string): string {
    const config = this.read(projectRoot);
    if (!config.builds?.[buildName]) {
      throw new Error(`Build profile "${buildName}" not found. Available: ${Object.keys(config.builds ?? {}).join(', ')}`);
    }
    const profile = config.builds[buildName];
    config.activeBuild = buildName;

    // Inject app path into all matching capability profiles
    for (const capName in config.mobile.capabilitiesProfiles) {
      config.mobile.capabilitiesProfiles[capName]['appium:app'] = profile.appPath;
    }

    this.write(projectRoot, config);
    return `Activated build "${buildName}" — app: ${profile.appPath}${profile.serverUrl ? ', server: ' + profile.serverUrl : ''}`;
  }

  /**
   * Returns the currently active build profile.
   */
  public getActiveBuild(config: McpConfig): BuildProfile | undefined {
    if (config.activeBuild && config.builds?.[config.activeBuild]) {
      return config.builds[config.activeBuild];
    }
    return undefined;
  }
}
