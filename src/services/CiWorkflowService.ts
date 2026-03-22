export class CiWorkflowService {
  /**
   * Generates a CI/CD workflow file for running Appium tests.
   * Supports GitHub Actions and GitLab CI.
   */
  public generate(
    provider: 'github' | 'gitlab',
    platform: string = 'android',
    options?: {
      appPath?: string;
      nodeVersion?: string;
      appiumVersion?: string;
    }
  ): { filename: string; content: string } {
    const nodeVersion = options?.nodeVersion ?? '20';
    const appiumVersion = options?.appiumVersion ?? 'latest';

    if (provider === 'github') {
      return this.generateGitHub(platform, nodeVersion, appiumVersion, options?.appPath);
    }
    return this.generateGitLab(platform, nodeVersion, appiumVersion, options?.appPath);
  }

  private generateGitHub(platform: string, nodeVersion: string, appiumVersion: string, appPath?: string): { filename: string; content: string } {
    const isAndroid = platform !== 'ios';
    const content = `name: Appium Mobile Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  appium-tests:
    runs-on: ${isAndroid ? 'ubuntu-latest' : 'macos-latest'}
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
${isAndroid ? `
      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Start Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          target: google_apis
          arch: x86_64
          profile: pixel_6
          emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim
          script: |
            npm install -g appium@${appiumVersion}
            appium driver install uiautomator2
            appium &
            sleep 5
            npx cucumber-js --tags '@android'
` : `
      - name: Start iOS Simulator
        run: |
          xcrun simctl boot "iPhone 14" || true
          xcrun simctl bootstatus "iPhone 14" -b

      - name: Install Appium
        run: |
          npm install -g appium@${appiumVersion}
          appium driver install xcuitest

      - name: Start Appium Server
        run: appium &

      - name: Wait for Appium
        run: sleep 5

      - name: Run Tests
        run: npx cucumber-js --tags '@ios'
`}
      - name: Upload Reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: reports/
          retention-days: 14
`;
    return { filename: '.github/workflows/appium-tests.yml', content };
  }

  private generateGitLab(platform: string, nodeVersion: string, appiumVersion: string, appPath?: string): { filename: string; content: string } {
    const isAndroid = platform !== 'ios';
    const content = `stages:
  - test

variables:
  NODE_VERSION: "${nodeVersion}"
  APPIUM_VERSION: "${appiumVersion}"

appium-tests:
  stage: test
  image: node:\${NODE_VERSION}
  timeout: 30m
${isAndroid ? `
  services:
    - name: budtmo/docker-android:emulator_14.0
      alias: android-emulator

  variables:
    EMULATOR_DEVICE: "Samsung Galaxy S10"
    WEB_VNC: "true"

  before_script:
    - npm ci
    - npm install -g appium@\${APPIUM_VERSION}
    - appium driver install uiautomator2
    - appium &
    - sleep 10

  script:
    - npx cucumber-js --tags '@android'
` : `
  tags:
    - macos

  before_script:
    - npm ci
    - npm install -g appium@\${APPIUM_VERSION}
    - appium driver install xcuitest
    - xcrun simctl boot "iPhone 14" || true
    - appium &
    - sleep 5

  script:
    - npx cucumber-js --tags '@ios'
`}
  artifacts:
    when: always
    paths:
      - reports/
    expire_in: 14 days
`;
    return { filename: '.gitlab-ci.yml', content };
  }
}
