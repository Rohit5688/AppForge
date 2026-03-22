import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import http from 'http';

const execAsync = promisify(exec);

export interface EnvironmentCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fixHint?: string;
}

export interface EnvironmentReport {
  ready: boolean;
  checks: EnvironmentCheck[];
  summary: string;
}

export class EnvironmentCheckService {
  /**
   * Performs a comprehensive pre-flight check for Appium mobile automation.
   * Verifies: Appium server, Node.js, SDK paths, emulator/simulator, app file, drivers.
   */
  public async check(projectRoot: string, platform: string = 'android', appPath?: string): Promise<EnvironmentReport> {
    const checks: EnvironmentCheck[] = [];

    // 1. Node.js version
    checks.push(await this.checkNode());

    // 2. Appium Server
    checks.push(await this.checkAppiumServer());

    // 3. Appium CLI / drivers
    checks.push(await this.checkAppiumDrivers(platform));

    // 4. Platform SDK
    if (platform === 'android' || platform === 'both') {
      checks.push(this.checkAndroidSdk());
      checks.push(await this.checkAndroidEmulator());
    }
    if (platform === 'ios' || platform === 'both') {
      checks.push(await this.checkXcode());
      checks.push(await this.checkIosSimulator());
    }

    // 5. App file
    if (appPath) {
      checks.push(this.checkAppFile(appPath));
    }

    // 6. Project dependencies
    checks.push(this.checkProjectDeps(projectRoot));

    // 7. mcp-config.json
    checks.push(this.checkMcpConfig(projectRoot));

    const failing = checks.filter(c => c.status === 'fail');
    const warnings = checks.filter(c => c.status === 'warn');
    const ready = failing.length === 0;

    const summary = this.buildSummary(checks, ready, failing.length, warnings.length);

    return { ready, checks, summary };
  }

  // ─── Individual Checks ─────────────────────────────

  private async checkNode(): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim();
      const major = parseInt(version.replace('v', '').split('.')[0]);
      if (major < 18) {
        return { name: 'Node.js', status: 'warn', message: `${version} — recommend v18+ for full compatibility`, fixHint: 'Download from https://nodejs.org or use nvm: nvm install 20' };
      }
      return { name: 'Node.js', status: 'pass', message: version };
    } catch {
      return { name: 'Node.js', status: 'fail', message: 'Node.js not found', fixHint: 'Install from https://nodejs.org or use nvm:\n  nvm install 20\n  nvm use 20' };
    }
  }

  private async checkAppiumServer(): Promise<EnvironmentCheck> {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:4723/status', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.value?.ready) {
              resolve({ name: 'Appium Server', status: 'pass', message: 'Running on localhost:4723' });
            } else {
              resolve({ name: 'Appium Server', status: 'warn', message: 'Server responded but not ready', fixHint: 'Restart Appium:\n  npx appium' });
            }
          } catch {
            resolve({ name: 'Appium Server', status: 'pass', message: 'Running on localhost:4723' });
          }
        });
      });
      req.on('error', () => {
        resolve({ name: 'Appium Server', status: 'fail', message: 'Not running on localhost:4723', fixHint: 'Start Appium in another terminal:\n  npx appium\n\nOr install globally:\n  npm install -g appium\n  appium' });
      });
      req.setTimeout(3000, () => {
        req.destroy();
        resolve({ name: 'Appium Server', status: 'fail', message: 'Connection timeout to localhost:4723', fixHint: 'Start Appium:\n  npx appium' });
      });
    });
  }

  private async checkAppiumDrivers(platform: string): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execAsync('appium driver list --installed --json');
      const drivers = JSON.parse(stdout);

      const needed = platform === 'ios' ? 'xcuitest' : 'uiautomator2';
      const driverKeys = Object.keys(drivers);

      if (driverKeys.some(k => k.toLowerCase().includes(needed))) {
        return { name: 'Appium Driver', status: 'pass', message: `${needed} driver installed` };
      }
      return { name: 'Appium Driver', status: 'fail', message: `${needed} driver not installed`, fixHint: `Install the driver:\n  appium driver install ${needed}` };
    } catch {
      return { name: 'Appium Driver', status: 'warn', message: 'Could not check drivers', fixHint: 'Install Appium 2.x and drivers:\n  npm install -g appium\n  appium driver install uiautomator2\n  appium driver install xcuitest' };
    }
  }

  private checkAndroidSdk(): EnvironmentCheck {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (androidHome && fs.existsSync(androidHome)) {
      return { name: 'Android SDK', status: 'pass', message: `ANDROID_HOME: ${androidHome}` };
    }
    return { name: 'Android SDK', status: 'fail', message: 'ANDROID_HOME / ANDROID_SDK_ROOT not set', fixHint: 'Install Android Studio, then set the env variable:\n  Windows: setx ANDROID_HOME "%LOCALAPPDATA%\\Android\\Sdk"\n  macOS/Linux: export ANDROID_HOME=~/Android/Sdk\n\nThen add platform-tools to PATH.' };
  }

  private async checkAndroidEmulator(): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execAsync('adb devices');
      const lines = stdout.trim().split('\n').slice(1).filter(l => l.includes('device'));
      if (lines.length > 0) {
        return { name: 'Android Device', status: 'pass', message: `${lines.length} device(s) connected` };
      }
      return { name: 'Android Device', status: 'fail', message: 'No devices connected', fixHint: 'Start an emulator:\n  emulator -avd <avd_name>\n\nOr connect a physical device via USB with USB debugging enabled.\nList available AVDs: emulator -list-avds' };
    } catch {
      return { name: 'Android Device', status: 'fail', message: 'adb not found', fixHint: 'Add Android SDK platform-tools to PATH:\n  Windows: %ANDROID_HOME%\\platform-tools\n  macOS/Linux: $ANDROID_HOME/platform-tools' };
    }
  }

  private async checkXcode(): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execAsync('xcodebuild -version');
      return { name: 'Xcode', status: 'pass', message: stdout.trim().split('\n')[0] };
    } catch {
      if (process.platform === 'darwin') {
        return { name: 'Xcode', status: 'fail', message: 'Xcode not installed', fixHint: 'Install Xcode from the Mac App Store, then run:\n  sudo xcode-select --install\n  sudo xcodebuild -license accept' };
      }
      return { name: 'Xcode', status: 'warn', message: 'Xcode check skipped (not macOS)' };
    }
  }

  private async checkIosSimulator(): Promise<EnvironmentCheck> {
    try {
      const { stdout } = await execAsync('xcrun simctl list devices booted --json');
      const json = JSON.parse(stdout);
      const booted = Object.values(json.devices as Record<string, any[]>).flat().filter((d: any) => d.state === 'Booted');
      if (booted.length > 0) {
        return { name: 'iOS Simulator', status: 'pass', message: `${booted.length} simulator(s) booted` };
      }
      return { name: 'iOS Simulator', status: 'fail', message: 'No booted simulators', fixHint: 'Boot a simulator:\n  xcrun simctl boot "iPhone 15"\n  open -a Simulator\n\nList available: xcrun simctl list devices available' };
    } catch {
      if (process.platform === 'darwin') {
        return { name: 'iOS Simulator', status: 'fail', message: 'simctl not available', fixHint: 'Install Xcode command line tools:\n  xcode-select --install' };
      }
      return { name: 'iOS Simulator', status: 'warn', message: 'iOS check skipped (not macOS)' };
    }
  }

  private checkAppFile(appPath: string): EnvironmentCheck {
    if (fs.existsSync(appPath)) {
      const stats = fs.statSync(appPath);
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
      return { name: 'App Binary', status: 'pass', message: `Found: ${appPath} (${sizeMb}MB)` };
    }
    return { name: 'App Binary', status: 'fail', message: `Not found: ${appPath}`, fixHint: `Ensure the app binary exists at the specified path.\nFor Android: build an APK and place it at ${appPath}\nFor iOS: build a .app and place it at ${appPath}` };
  }

  private checkProjectDeps(projectRoot: string): EnvironmentCheck {
    const nodeModules = path.join(projectRoot, 'node_modules');
    if (fs.existsSync(nodeModules)) {
      return { name: 'Dependencies', status: 'pass', message: 'node_modules exists' };
    }
    return { name: 'Dependencies', status: 'fail', message: 'node_modules missing', fixHint: `Install project dependencies:\n  cd ${projectRoot}\n  npm install` };
  }

  private checkMcpConfig(projectRoot: string): EnvironmentCheck {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (fs.existsSync(configPath)) {
      return { name: 'MCP Config', status: 'pass', message: 'mcp-config.json found' };
    }
    return { name: 'MCP Config', status: 'warn', message: 'mcp-config.json not found', fixHint: 'Run setup_project to generate the config, or create it manually.' };
  }

  // ─── Summary Builder ─────────────────────────────

  private buildSummary(checks: EnvironmentCheck[], ready: boolean, failCount: number, warnCount: number): string {
    const lines: string[] = [];
    lines.push(ready ? '✅ Environment is ready for testing!' : '❌ Environment has issues that need to be fixed.');
    lines.push('');

    for (const check of checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '🟡' : '❌';
      lines.push(`${icon} ${check.name}: ${check.message}`);
    }

    // Quick-fix section for failing checks
    const fixable = checks.filter(c => c.status === 'fail' && c.fixHint);
    if (fixable.length > 0) {
      lines.push('');
      lines.push('─── Quick Fix Guide ───');
      for (const check of fixable) {
        lines.push('');
        lines.push(`🔧 ${check.name}:`);
        lines.push(check.fixHint!);
      }
    }

    if (warnCount > 0 && failCount === 0) {
      lines.push('');
      lines.push(`⚠️ ${warnCount} warning(s) — tests may still run, but consider addressing them.`);
    }

    return lines.join('\n');
  }
}
