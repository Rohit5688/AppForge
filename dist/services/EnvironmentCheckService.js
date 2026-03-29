import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { Questioner } from '../utils/Questioner.js';
const execAsync = promisify(exec);
export class EnvironmentCheckService {
    /**
     * Performs a comprehensive pre-flight check for Appium mobile automation.
     * Verifies: Appium server, Node.js, SDK paths, emulator/simulator, app file, drivers.
     */
    async check(projectRoot, platform = 'android', appPath) {
        const checks = [];
        // 1. Node.js version
        checks.push(await this.checkNode());
        // 2. Appium Server
        const appiumCheck = await this.checkAppiumServer();
        checks.push(appiumCheck);
        if (appiumCheck.status === 'warn' && appiumCheck.message.includes('1.x')) {
            Questioner.clarify("Migrate to Appium 2.x?", "Appium 1.x detected. Appium 1 is deprecated and lacks W3C compliance required for modern automation.", ["Yes (npm install -g appium@latest)", "No, keep 1.x"]);
        }
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
    async checkNode() {
        try {
            const { stdout } = await execAsync('node --version');
            const version = stdout.trim();
            const major = parseInt(version.replace('v', '').split('.')[0]);
            if (major < 18) {
                return { name: 'Node.js', status: 'warn', message: `${version} — recommend v18+ for full compatibility`, fixHint: 'Download from https://nodejs.org or use nvm: nvm install 20' };
            }
            return { name: 'Node.js', status: 'pass', message: version };
        }
        catch {
            return { name: 'Node.js', status: 'fail', message: 'Node.js not found', fixHint: 'Install from https://nodejs.org or use nvm:\n  nvm install 20\n  nvm use 20' };
        }
    }
    async checkAppiumServer() {
        return new Promise((resolve) => {
            const req = http.get('http://localhost:4723/status', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.value?.build?.version?.startsWith('1.')) {
                            resolve({ name: 'Appium Server', status: 'warn', message: `Running Appium 1.x (${json.value.build.version})`, fixHint: 'Upgrade to Appium 2.x:\n  npm install -g appium@latest' });
                        }
                        else if (json.value?.ready) {
                            resolve({ name: 'Appium Server', status: 'pass', message: 'Running on localhost:4723' });
                        }
                        else {
                            resolve({ name: 'Appium Server', status: 'warn', message: 'Server responded but not ready', fixHint: 'Restart Appium:\n  npx appium' });
                        }
                    }
                    catch {
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
    async checkAppiumDrivers(platform) {
        try {
            const { stdout } = await execAsync('appium driver list --installed --json');
            const drivers = JSON.parse(stdout);
            const needed = platform === 'ios' ? 'xcuitest' : 'uiautomator2';
            const driverKeys = Object.keys(drivers);
            if (driverKeys.some(k => k.toLowerCase().includes(needed))) {
                return { name: 'Appium Driver', status: 'pass', message: `${needed} driver installed` };
            }
            return { name: 'Appium Driver', status: 'fail', message: `${needed} driver not installed`, fixHint: `Install the driver:\n  appium driver install ${needed}` };
        }
        catch {
            return { name: 'Appium Driver', status: 'warn', message: 'Could not check drivers', fixHint: 'Install Appium 2.x and drivers:\n  npm install -g appium\n  appium driver install uiautomator2\n  appium driver install xcuitest' };
        }
    }
    checkAndroidSdk() {
        const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (androidHome && fs.existsSync(androidHome)) {
            return { name: 'Android SDK', status: 'pass', message: `ANDROID_HOME: ${androidHome}` };
        }
        return { name: 'Android SDK', status: 'fail', message: 'ANDROID_HOME / ANDROID_SDK_ROOT not set', fixHint: 'Install Android Studio, then set the env variable:\n  Windows: setx ANDROID_HOME "%LOCALAPPDATA%\\Android\\Sdk"\n  macOS/Linux: export ANDROID_HOME=~/Android/Sdk\n\nThen add platform-tools to PATH.' };
    }
    async checkAndroidEmulator() {
        try {
            const { stdout } = await execAsync('adb devices');
            const lines = stdout.trim().split('\n').slice(1).filter(l => l.includes('device') && !l.includes('offline'));
            if (lines.length > 0) {
                return { name: 'Android Device', status: 'pass', message: `${lines.length} device(s) connected` };
            }
            Questioner.clarify("No device detected. Do you want help starting an emulator?", "adb devices returned no connected devices or emulators.", ["Yes — show AVD list", "No — I'll connect manually"]);
            return { name: 'Android Device', status: 'fail', message: 'No devices connected', fixHint: 'Start an emulator:\n  emulator -avd <avd_name>\n\nOr connect a physical device via USB with USB debugging enabled.\nList available AVDs: emulator -list-avds' };
        }
        catch (e) {
            if (e instanceof Error && e.name === 'ClarificationRequired')
                throw e;
            return { name: 'Android Device', status: 'fail', message: 'adb not found', fixHint: 'Add Android SDK platform-tools to PATH:\n  Windows: %ANDROID_HOME%\\platform-tools\n  macOS/Linux: $ANDROID_HOME/platform-tools' };
        }
    }
    async checkXcode() {
        try {
            const { stdout } = await execAsync('xcodebuild -version');
            return { name: 'Xcode', status: 'pass', message: stdout.trim().split('\n')[0] };
        }
        catch {
            if (process.platform === 'darwin') {
                return { name: 'Xcode', status: 'fail', message: 'Xcode not installed', fixHint: 'Install Xcode from the Mac App Store, then run:\n  sudo xcode-select --install\n  sudo xcodebuild -license accept' };
            }
            return { name: 'Xcode', status: 'warn', message: 'Xcode check skipped (not macOS)' };
        }
    }
    async checkIosSimulator() {
        try {
            const { stdout } = await execAsync('xcrun simctl list devices booted --json');
            const json = JSON.parse(stdout);
            const booted = Object.values(json.devices).flat().filter((d) => d.state === 'Booted');
            if (booted.length > 0) {
                return { name: 'iOS Simulator', status: 'pass', message: `${booted.length} simulator(s) booted` };
            }
            return { name: 'iOS Simulator', status: 'fail', message: 'No booted simulators', fixHint: 'Boot a simulator:\n  xcrun simctl boot "iPhone 15"\n  open -a Simulator\n\nList available: xcrun simctl list devices available' };
        }
        catch {
            if (process.platform === 'darwin') {
                return { name: 'iOS Simulator', status: 'fail', message: 'simctl not available', fixHint: 'Install Xcode command line tools:\n  xcode-select --install' };
            }
            return { name: 'iOS Simulator', status: 'warn', message: 'iOS check skipped (not macOS)' };
        }
    }
    checkAppFile(appPath) {
        if (fs.existsSync(appPath)) {
            const stats = fs.statSync(appPath);
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
            return { name: 'App Binary', status: 'pass', message: `Found: ${appPath} (${sizeMb}MB)` };
        }
        return { name: 'App Binary', status: 'fail', message: `Not found: ${appPath}`, fixHint: `Ensure the app binary exists at the specified path.\nFor Android: build an APK and place it at ${appPath}\nFor iOS: build a .app and place it at ${appPath}` };
    }
    checkProjectDeps(projectRoot) {
        const nodeModules = path.join(projectRoot, 'node_modules');
        if (fs.existsSync(nodeModules)) {
            return { name: 'Dependencies', status: 'pass', message: 'node_modules exists' };
        }
        return { name: 'Dependencies', status: 'fail', message: 'node_modules missing', fixHint: `Install project dependencies:\n  cd ${projectRoot}\n  npm install` };
    }
    checkMcpConfig(projectRoot) {
        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (fs.existsSync(configPath)) {
            return { name: 'MCP Config', status: 'pass', message: 'mcp-config.json found' };
        }
        return { name: 'MCP Config', status: 'warn', message: 'mcp-config.json not found', fixHint: 'Run setup_project to generate the config, or create it manually.' };
    }
    // ─── Summary Builder ─────────────────────────────
    buildSummary(checks, ready, failCount, warnCount) {
        const lines = [];
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
                lines.push(check.fixHint);
            }
        }
        if (warnCount > 0 && failCount === 0) {
            lines.push('');
            lines.push(`⚠️ ${warnCount} warning(s) — tests may still run, but consider addressing them.`);
        }
        return lines.join('\n');
    }
}
