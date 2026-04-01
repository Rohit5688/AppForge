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
  // ─── Gesture Actions ───────────────────────────────
  {
    category: 'gesture',
    method: 'swipe',
    aliases: ['swipeup', 'swipedown', 'swipeleft', 'swiperight'],
    description: 'Swipes in a direction on the screen',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async swipe(direction: "up" | "down" | "left" | "right") { /* impl */ }'
  },
  {
    category: 'gesture',
    method: 'scroll',
    aliases: ['scrolldown', 'scrollup'],
    description: 'Scrolls the screen or a scrollable element',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async scroll(direction: "up" | "down", element?: string) { /* impl */ }'
  },
  {
    category: 'gesture',
    method: 'tap',
    aliases: ['click', 'touch'],
    description: 'Taps on an element',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async tap(selector: string) { /* impl */ }'
  },
  {
    category: 'gesture',
    method: 'doubleTap',
    aliases: ['doubleclick', 'doubletouch'],
    description: 'Double taps on an element',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async doubleTap(selector: string) { /* impl */ }'
  },
  {
    category: 'gesture',
    method: 'longPress',
    aliases: ['longclick', 'press', 'hold'],
    description: 'Long presses on an element',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async longPress(selector: string, duration?: number) { /* impl */ }'
  },
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
    category: 'gesture',
    method: 'pinch',
    aliases: ['zoomin', 'zoomout', 'zoom'],
    description: 'Pinch gesture for zooming',
    platform: 'both',
    suggestedUtilClass: 'GestureUtils',
    suggestedCode: 'static async pinch(direction: "in" | "out") { /* impl */ }'
  },

  // ─── Wait Utilities ────────────────────────────────
  {
    category: 'wait',
    method: 'waitForElement',
    aliases: ['waitfor', 'waituntil', 'waitforelement'],
    description: 'Waits for an element to exist',
    platform: 'both',
    suggestedUtilClass: 'WaitUtils',
    suggestedCode: 'static async waitForElement(selector: string, timeout?: number) { /* impl */ }'
  },
  {
    category: 'wait',
    method: 'waitForVisible',
    aliases: ['waitforvisible', 'waitdisplayed'],
    description: 'Waits for an element to be visible',
    platform: 'both',
    suggestedUtilClass: 'WaitUtils',
    suggestedCode: 'static async waitForVisible(selector: string, timeout?: number) { /* impl */ }'
  },
  {
    category: 'wait',
    method: 'waitForClickable',
    aliases: ['waitforclickable', 'waitenabled'],
    description: 'Waits for an element to be clickable',
    platform: 'both',
    suggestedUtilClass: 'WaitUtils',
    suggestedCode: 'static async waitForClickable(selector: string, timeout?: number) { /* impl */ }'
  },
  {
    category: 'wait',
    method: 'waitForText',
    aliases: ['waitfortext', 'waittextcontains'],
    description: 'Waits for element to contain specific text',
    platform: 'both',
    suggestedUtilClass: 'WaitUtils',
    suggestedCode: 'static async waitForText(selector: string, text: string, timeout?: number) { /* impl */ }'
  },
  {
    category: 'wait',
    method: 'waitForDisappear',
    aliases: ['waitfordisappear', 'waitnotexist', 'waitgone'],
    description: 'Waits for an element to disappear',
    platform: 'both',
    suggestedUtilClass: 'WaitUtils',
    suggestedCode: 'static async waitForDisappear(selector: string, timeout?: number) { /* impl */ }'
  },

  // ─── Element Actions ───────────────────────────────
  {
    category: 'element',
    method: 'getText',
    aliases: ['gettext', 'text'],
    description: 'Gets text content of an element',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async getText(selector: string): Promise<string> { /* impl */ }'
  },
  {
    category: 'element',
    method: 'setValue',
    aliases: ['setvalue', 'type', 'sendkeys'],
    description: 'Sets value of an input element',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async setValue(selector: string, value: string) { /* impl */ }'
  },
  {
    category: 'element',
    method: 'clearValue',
    aliases: ['clear', 'cleartext'],
    description: 'Clears value of an input element',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async clearValue(selector: string) { /* impl */ }'
  },
  {
    category: 'element',
    method: 'isVisible',
    aliases: ['isdisplayed', 'visible'],
    description: 'Checks if element is visible',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async isVisible(selector: string): Promise<boolean> { /* impl */ }'
  },
  {
    category: 'element',
    method: 'isEnabled',
    aliases: ['enabled', 'clickable'],
    description: 'Checks if element is enabled',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async isEnabled(selector: string): Promise<boolean> { /* impl */ }'
  },
  {
    category: 'element',
    method: 'isSelected',
    aliases: ['selected', 'checked'],
    description: 'Checks if element is selected (checkbox/radio)',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async isSelected(selector: string): Promise<boolean> { /* impl */ }'
  },
  {
    category: 'element',
    method: 'getAttribute',
    aliases: ['getattribute', 'attr'],
    description: 'Gets attribute value of an element',
    platform: 'both',
    suggestedUtilClass: 'ElementUtils',
    suggestedCode: 'static async getAttribute(selector: string, attribute: string): Promise<string> { /* impl */ }'
  },

  // ─── Assertions ────────────────────────────────────
  {
    category: 'assertion',
    method: 'assertVisible',
    aliases: ['assertdisplayed', 'shouldbevisible'],
    description: 'Asserts element is visible',
    platform: 'both',
    suggestedUtilClass: 'AssertionUtils',
    suggestedCode: 'static async assertVisible(selector: string, message?: string) { /* impl */ }'
  },
  {
    category: 'assertion',
    method: 'assertText',
    aliases: ['asserttextcontains', 'shouldhavetext'],
    description: 'Asserts element contains specific text',
    platform: 'both',
    suggestedUtilClass: 'AssertionUtils',
    suggestedCode: 'static async assertText(selector: string, expected: string) { /* impl */ }'
  },
  {
    category: 'assertion',
    method: 'assertScreenshot',
    aliases: ['screenshotdiff', 'visualcheck', 'visual'],
    description: 'Visual assertion using baseline screenshot',
    platform: 'both',
    suggestedUtilClass: 'AssertionUtils',
    suggestedCode: 'static async assertScreenshot(name: string, tolerance?: number) { /* impl */ }'
  },
  {
    category: 'assertion',
    method: 'assertExists',
    aliases: ['assertexist', 'shouldexist'],
    description: 'Asserts element exists in DOM',
    platform: 'both',
    suggestedUtilClass: 'AssertionUtils',
    suggestedCode: 'static async assertExists(selector: string, message?: string) { /* impl */ }'
  },

  // ─── Device & App Control ──────────────────────────
  {
    category: 'device',
    method: 'hideKeyboard',
    aliases: ['closekeyboard', 'dismisskeyboard'],
    description: 'Hides the device keyboard',
    platform: 'both',
    suggestedUtilClass: 'DeviceUtils',
    suggestedCode: 'static async hideKeyboard() { /* impl */ }'
  },
  {
    category: 'device',
    method: 'rotate',
    aliases: ['setorientation', 'orientation'],
    description: 'Rotates device orientation',
    platform: 'both',
    suggestedUtilClass: 'DeviceUtils',
    suggestedCode: 'static async rotate(orientation: "PORTRAIT" | "LANDSCAPE") { /* impl */ }'
  },
  {
    category: 'device',
    method: 'pressBack',
    aliases: ['back', 'goback'],
    description: 'Presses device back button',
    platform: 'android',
    suggestedUtilClass: 'DeviceUtils',
    suggestedCode: 'static async pressBack() { /* impl */ }'
  },
  {
    category: 'device',
    method: 'pressHome',
    aliases: ['home', 'gohome'],
    description: 'Presses device home button',
    platform: 'android',
    suggestedUtilClass: 'DeviceUtils',
    suggestedCode: 'static async pressHome() { /* impl */ }'
  },
  {
    category: 'app',
    method: 'launchApp',
    aliases: ['launch', 'openapp', 'startapp'],
    description: 'Launches the application',
    platform: 'both',
    suggestedUtilClass: 'AppUtils',
    suggestedCode: 'static async launchApp() { /* impl */ }'
  },
  {
    category: 'app',
    method: 'closeApp',
    aliases: ['close', 'terminateapp'],
    description: 'Closes the application',
    platform: 'both',
    suggestedUtilClass: 'AppUtils',
    suggestedCode: 'static async closeApp() { /* impl */ }'
  },
  {
    category: 'app',
    method: 'resetApp',
    aliases: ['reset', 'restart'],
    description: 'Resets application to initial state',
    platform: 'both',
    suggestedUtilClass: 'AppUtils',
    suggestedCode: 'static async resetApp() { /* impl */ }'
  },
  {
    category: 'app',
    method: 'handleOTP',
    aliases: ['readotp', 'getotp', 'getSms'],
    description: 'Reads OTP from notifications or messages',
    platform: 'both',
    suggestedUtilClass: 'AppUtils',
    suggestedCode: 'static async handleOTP(): Promise<string> { /* impl */ }'
  },
  {
    category: 'app',
    method: 'handlePermissions',
    aliases: ['permissions', 'allowpermissions', 'acceptpermissions'],
    description: 'Handles app permission dialogs',
    platform: 'both',
    suggestedUtilClass: 'AppUtils',
    suggestedCode: 'static async handlePermissions(action: "allow" | "deny") { /* impl */ }'
  },

  // ─── Context Switch ────────────────────────────────
  {
    category: 'context',
    method: 'switchContext',
    aliases: ['context', 'switchtowebview', 'switchtonative'],
    description: 'Switches between NATIVE_APP and WEBVIEW contexts',
    platform: 'both',
    suggestedUtilClass: 'ContextUtils',
    suggestedCode: 'static async switchContext(context: string) { /* impl */ }'
  },
  {
    category: 'context',
    method: 'getContexts',
    aliases: ['contexts', 'availablecontexts'],
    description: 'Gets all available contexts',
    platform: 'both',
    suggestedUtilClass: 'ContextUtils',
    suggestedCode: 'static async getContexts(): Promise<string[]> { /* impl */ }'
  },

  // ─── Network & Performance ─────────────────────────
  {
    category: 'network',
    method: 'setNetworkConnection',
    aliases: ['network', 'airplane', 'wifi'],
    description: 'Sets device network connection state',
    platform: 'android',
    suggestedUtilClass: 'NetworkUtils',
    suggestedCode: 'static async setNetworkConnection(mode: number) { /* impl */ }'
  },
  {
    category: 'device',
    method: 'getPerformanceData',
    aliases: ['performance', 'metrics'],
    description: 'Gets app performance metrics',
    platform: 'both',
    suggestedUtilClass: 'DeviceUtils',
    suggestedCode: 'static async getPerformanceData(packageName: string, dataType: string) { /* impl */ }'
  }
];
