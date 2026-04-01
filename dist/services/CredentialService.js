import fs from 'fs/promises';
import path from 'path';
import { McpConfigService } from './McpConfigService.js';
/**
 * Service to manage cloud credentials, environment variables, and multi-env test users.
 */
export class CredentialService {
    mcpConfigService = new McpConfigService();
    /**
     * Updates the .env file with provided key-value pairs.
     */
    async setEnv(projectRoot, data) {
        const envPath = path.join(projectRoot, '.env');
        let content = '';
        try {
            content = await fs.readFile(envPath, 'utf8');
        }
        catch {
            // .env doesn't exist, start fresh
        }
        const lines = content.split('\n');
        for (const [key, value] of Object.entries(data)) {
            const index = lines.findIndex(line => line.startsWith(`${key}=`));
            if (index !== -1) {
                lines[index] = `${key}=${value}`;
            }
            else {
                lines.push(`${key}=${value}`);
            }
        }
        await fs.writeFile(envPath, lines.join('\n'), 'utf8');
        return `Updated .env at ${envPath}`;
    }
    /**
     * Manage multi-environment user credentials (users.{env}.json).
     * Supports creating, reading, and updating user sets for different environments.
     *
     * The directory path is resolved from mcp-config.json's paths.testDataRoot,
     * falling back to 'src/test-data' if not configured.
     */
    async manageUsers(projectRoot, operation, env = 'staging', users) {
        // Resolve the test data directory from config with fallback
        let testDataDir = 'src/test-data'; // Default fallback
        try {
            const config = this.mcpConfigService.read(projectRoot);
            // Check for testDataRoot in paths config
            if (config.paths && 'testDataRoot' in config.paths) {
                testDataDir = config.paths.testDataRoot;
            }
        }
        catch (error) {
            // Config doesn't exist or can't be read, use fallback
            // This is not an error - projects may not have config yet
        }
        const usersDir = path.join(projectRoot, testDataDir);
        const usersFile = path.join(usersDir, `users.${env}.json`);
        if (operation === 'read') {
            try {
                const content = await fs.readFile(usersFile, 'utf8');
                return content;
            }
            catch {
                return JSON.stringify({ error: `No users file found for environment: ${env}`, path: usersFile });
            }
        }
        // Write operation
        try {
            await fs.mkdir(usersDir, { recursive: true });
        }
        catch {
            // Dir exists
        }
        await fs.writeFile(usersFile, JSON.stringify(users ?? [], null, 2), 'utf8');
        // Also generate a typed helper for easy access in tests
        await this.generateUserHelper(projectRoot, env);
        return `Updated users for ${env} at ${usersFile}`;
    }
    /**
     * Generates a typed getUser() helper for test code to import.
     */
    async generateUserHelper(projectRoot, env) {
        // Resolve the test data directory from config with fallback
        let testDataDir = 'src/test-data'; // Default fallback
        try {
            const config = this.mcpConfigService.read(projectRoot);
            if (config.paths && 'testDataRoot' in config.paths) {
                testDataDir = config.paths.testDataRoot;
            }
        }
        catch (error) {
            // Use fallback
        }
        // Calculate the relative path from utils directory to test-data directory
        const utilsDirPath = path.join(projectRoot, 'utils');
        const testDataPath = path.join(projectRoot, testDataDir);
        const relativePath = path.relative(utilsDirPath, testDataPath).replace(/\\/g, '/');
        const content = `import * as fs from 'fs';
import * as path from 'path';

export interface TestUser {
  username: string;
  password: string;
  role?: string;
  [key: string]: string | undefined;
}

/**
 * Retrieves a test user from the environment-specific users file.
 * @param env - Environment name (staging, prod, etc.)
 * @param role - Optional role filter (admin, user, etc.)
 */
export function getUser(env: string = '${env}', role?: string): TestUser {
  const filePath = path.join(__dirname, '${relativePath}', \`users.\${env}.json\`);
  const users: TestUser[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (role) {
    const filtered = users.find(u => u.role === role);
    if (!filtered) throw new Error(\`No user found with role "\${role}" in \${env}\`);
    return filtered;
  }

  if (users.length === 0) throw new Error(\`No users found in \${env}\`);
  return users[0];
}
`;
        const helperPath = path.join(projectRoot, 'utils', 'getUser.ts');
        // Ensure utils directory exists
        const utilsDir = path.join(projectRoot, 'utils');
        try {
            await fs.mkdir(utilsDir, { recursive: true });
        }
        catch {
            // Dir exists
        }
        await fs.writeFile(helperPath, content, 'utf8');
    }
}
