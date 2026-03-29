export interface ApiEntry {
  category: 'element' | 'gesture' | 'wait' | 'assertion' | 'device' | 'app' | 'context' | 'network';
  method: string;
  aliases: string[];
  description: string;
  platform: 'android' | 'ios' | 'both';
  suggestedUtilClass: string;
  suggestedCode: string;
}

export const APPIUM_API_SURFACE: ApiEntry[] = [
  {
    category: 'gesture',
    method: 'dragAndDrop',
    aliases: ['drag', 'drop', 'dragdrop'],
    description: 'Drags an element from one place to another',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async dragAndDrop(source: string, target: string) { /* impl */ }'
  },
  {
    category: 'gesture',
    method: 'scrollIntoView',
    aliases: ['scrollto', 'scrollvisible'],
    description: 'Scrolls element into viewport',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async scrollIntoView(selector: string) { /* impl */ }'
  },
  {
    category: 'assertion',
    method: 'assertScreenshot',
    aliases: ['screenshotdiff', 'visualcheck', 'visual'],
    description: 'Visual assertion using baseline screenshot',
    platform: 'both',
    suggestedUtilClass: 'AssertionUtils',
    suggestedCode: 'static async assertScreenshot(name: string, tolerance: number = 0) { /* impl */ }'
  },
  {
    category: 'app',
    method: 'handleOTP',
    aliases: ['readotp', 'getotp', 'getSms'],
    description: 'Reads OTP from notifications or messages',
    platform: 'both',
    suggestedUtilClass: 'AppiumDriver',
    suggestedCode: 'static async handleOTP() { /* impl */ }'
  }
];
