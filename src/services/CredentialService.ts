import fs from 'fs/promises';
import path from 'path';

export interface TestUser {
  username: string;
  password: string;
  role?: string;
  [key: string]: string | undefined;
}

/**
 * Service to manage cloud credentials, environment variables, and multi-env test users.
 */
export class CredentialService {
  /**
   * Updates the .env file with provided key-value pairs.
   */
  public async setEnv(projectRoot: string, data: Record<string, string>): Promise<string> {
    const envPath = path.join(projectRoot, '.env');
    let content = '';

    try {
      content = await fs.readFile(envPath, 'utf8');
    } catch {
      // .env doesn't exist, start fresh
    }

    const lines = content.split('\n');
    for (const [key, value] of Object.entries(data)) {
      const index = lines.findIndex(line => line.startsWith(`${key}=`));
      if (index !== -1) {
        lines[index] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }
    }

    await fs.writeFile(envPath, lines.join('\n'), 'utf8');
    return `Updated .env at ${envPath}`;
  }

  /**
   * Manage multi-environment user credentials (users.{env}.json).
   * Supports creating, reading, and updating user sets for different environments.
   */
  public async manageUsers(
    projectRoot: string,
    operation: 'read' | 'write',
    env: string = 'staging',
    users?: TestUser[]
  ): Promise<string> {
    const usersDir = path.join(projectRoot, 'test-data');
    const usersFile = path.join(usersDir, `users.${env}.json`);

    if (operation === 'read') {
      try {
        const content = await fs.readFile(usersFile, 'utf8');
        return content;
      } catch {
        return JSON.stringify({ error: `No users file found for environment: ${env}`, path: usersFile });
      }
    }

    // Write operation
    try {
      await fs.mkdir(usersDir, { recursive: true });
    } catch {
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
  private async generateUserHelper(projectRoot: string, env: string): Promise<void> {
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
  const filePath = path.join(__dirname, '..', 'test-data', \`users.\${env}.json\`);
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
    await fs.writeFile(helperPath, content, 'utf8');
  }
}
