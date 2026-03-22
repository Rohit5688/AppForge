import fs from 'fs';
import path from 'path';
import { McpConfigError } from '../utils/Errors.js';
/** Returns safe default paths merged with config paths. */
function resolvePaths(config) {
    return {
        featuresRoot: config.paths?.featuresRoot ?? 'features',
        pagesRoot: config.paths?.pagesRoot ?? 'pages',
        stepsRoot: config.paths?.stepsRoot ?? 'step-definitions',
        utilsRoot: config.paths?.utilsRoot ?? 'utils'
    };
}
export class McpConfigService {
    configFileName = 'mcp-config.json';
    CURRENT_VERSION = '1.1.0';
    read(projectRoot) {
        const configPath = path.join(projectRoot, this.configFileName);
        if (!fs.existsSync(configPath)) {
            throw new McpConfigError(`Configuration file not found at ${configPath}. Please run setup_project first.`);
        }
        try {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            // Auto-migration
            if (!raw.version || raw.version === '1.0.0') {
                raw.version = this.CURRENT_VERSION;
                raw.$schema = './.appium-mcp/configSchema.json'; // Enables IDE autocompletion
                this.write(projectRoot, raw);
                this.generateSchema(projectRoot);
            }
            // Apply defaults so older configs don't crash
            raw.paths = resolvePaths(raw);
            return raw;
        }
        catch (error) {
            throw new McpConfigError(`Failed to parse mcp-config.json: ${error.message}`);
        }
    }
    /**
     * Generates a JSON schema file for IDE autocompletion.
     */
    generateSchema(projectRoot) {
        const schemaDir = path.join(projectRoot, '.appium-mcp');
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
    write(projectRoot, config) {
        const configPath = path.join(projectRoot, this.configFileName);
        let existingConfig = {};
        if (fs.existsSync(configPath)) {
            existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        const newConfig = { ...existingConfig, ...config };
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    }
    updateAppPath(projectRoot, platform, appPath) {
        const config = this.read(projectRoot);
        for (const profileName in config.mobile.capabilitiesProfiles) {
            const profile = config.mobile.capabilitiesProfiles[profileName];
            if (profile.platformName?.toLowerCase() === platform.toLowerCase()) {
                profile['appium:app'] = appPath;
            }
        }
        this.write(projectRoot, config);
    }
    setCloudProvider(projectRoot, provider, username, accessKey) {
        const config = this.read(projectRoot);
        config.mobile.cloud = { provider, username, accessKey };
        this.write(projectRoot, config);
    }
    /** Resolves the configured paths (with defaults). */
    getPaths(config) {
        return resolvePaths(config);
    }
    /**
     * Set or update a named build profile (debug, staging, release, etc.).
     */
    setBuildProfile(projectRoot, name, profile) {
        const config = this.read(projectRoot);
        if (!config.builds)
            config.builds = {};
        config.builds[name] = profile;
        this.write(projectRoot, config);
    }
    /**
     * Set the active build profile (injects appPath into capabilities).
     */
    activateBuild(projectRoot, buildName) {
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
    getActiveBuild(config) {
        if (config.activeBuild && config.builds?.[config.activeBuild]) {
            return config.builds[config.activeBuild];
        }
        return undefined;
    }
}
