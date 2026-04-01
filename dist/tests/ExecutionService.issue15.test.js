import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionService } from '../services/ExecutionService.js';
/**
 * Issue #15 Test Suite: inspect_ui_hierarchy Invalid Selector Strategy Fix
 *
 * Verifies that parseXmlElements generates VALID WebdriverIO selectors instead of
 * the invalid `*[text()="..."]` format that was previously generated.
 */
describe('ExecutionService - Issue #15: Valid Locator Strategies', () => {
    it('should generate valid accessibility-id selector with ~ prefix', async () => {
        const executionService = new ExecutionService();
        const xml = `<android.widget.Button content-desc="Submit Button" text="Submit" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        assert.ok(result.elements.length > 0, 'Should have parsed at least one element');
        const element = result.elements[0];
        // Should have accessibility-id as first priority
        assert.ok(element.locatorStrategies.includes('~Submit Button'), 'Should include accessibility-id selector');
        // Should NOT contain invalid *[text()="..."] format
        const hasInvalidFormat = element.locatorStrategies.some(s => /^\*\[text\(\)=/.test(s));
        assert.strictEqual(hasInvalidFormat, false, 'Should NOT contain invalid *[text()="..."] format');
    });
    it('should generate valid resource-id selector with id= prefix', async () => {
        const executionService = new ExecutionService();
        const xml = `<android.widget.Button resource-id="com.app:id/submitBtn" text="Submit" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // Should have resource-id selector
        assert.ok(element.locatorStrategies.includes('id=com.app:id/submitBtn'), 'Should include resource-id selector');
        // Should NOT contain invalid selector format
        const hasInvalidFormat = element.locatorStrategies.some(s => /^\*\[/.test(s));
        assert.strictEqual(hasInvalidFormat, false, 'Should NOT contain selectors starting with *[');
    });
    it('should generate valid XPath selector for text attribute', async () => {
        const executionService = new ExecutionService();
        const xml = `<android.widget.TextView text="Login" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // Should generate valid XPath: //*[@text="Login"]
        assert.ok(element.locatorStrategies.includes('//*[@text="Login"]'), 'Should include valid XPath with @text attribute');
        // Should NOT generate invalid *[text()="Login"]
        assert.ok(!element.locatorStrategies.includes('*[text()="Login"]'), 'Should NOT include invalid *[text()= format');
        assert.ok(element.locatorStrategies.every(s => !s.startsWith('*[')), 'No selector should start with *[');
    });
    it('should escape double quotes in text for valid XPath', async () => {
        const executionService = new ExecutionService();
        const xml = `<android.widget.TextView text='He said "Hello"' bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // Should properly escape quotes in XPath
        assert.ok(element.locatorStrategies.includes('//*[@text="He said &quot;Hello&quot;"]'), 'Should escape double quotes in XPath');
    });
    it('should prioritize selectors in correct stability order', async () => {
        const executionService = new ExecutionService();
        const xml = `
      <android.widget.Button 
        content-desc="Submit" 
        resource-id="com.app:id/submitBtn" 
        text="Submit Form" 
        class="android.widget.Button"
        bounds="[0,0][100,50]" 
      />
    `;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        const strategies = element.locatorStrategies;
        // Priority order: accessibility-id > resource-id > xpath-by-text
        assert.ok(strategies.length > 0, 'Should have multiple strategies');
        // Accessibility ID should come first (most stable)
        assert.strictEqual(strategies[0], '~Submit', 'Accessibility ID should be first priority');
        // Resource ID should come before text-based XPath
        const resourceIdIndex = strategies.findIndex(s => s.startsWith('id='));
        const textXPathIndex = strategies.findIndex(s => s.includes('@text='));
        if (resourceIdIndex !== -1 && textXPathIndex !== -1) {
            assert.ok(resourceIdIndex < textXPathIndex, 'Resource ID should come before text-based XPath');
        }
    });
    it('should not generate selectors for invalid text (too long)', async () => {
        const executionService = new ExecutionService();
        const longText = 'A'.repeat(100); // 100 characters
        const xml = `<android.widget.TextView text="${longText}" resource-id="com.app:id/longText" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // Should have resource-id but NOT text-based XPath (too long)
        assert.ok(element.locatorStrategies.includes('id=com.app:id/longText'), 'Should include resource-id');
        assert.ok(element.locatorStrategies.every(s => !s.includes('@text=')), 'Should NOT include text-based XPath for long text');
    });
    it('should handle iOS elements with name attribute', async () => {
        const executionService = new ExecutionService();
        const xml = `<XCUIElementTypeButton name="loginButton" label="Login" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // iOS uses name for accessibility
        assert.ok(element.locatorStrategies.includes('~loginButton'), 'Should use name attribute for accessibility-id on iOS');
    });
    it('should generate class-based XPath as last resort', async () => {
        const executionService = new ExecutionService();
        const xml = `<android.widget.Button class="android.widget.Button" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // When no better option, use class-based selector
        assert.ok(element.locatorStrategies.includes('//android.widget.Button'), 'Should use class-based XPath as last resort');
        // But this should be the only option
        assert.strictEqual(element.locatorStrategies.length, 1, 'Should only have class-based selector when no better options');
    });
    it('regression test: should never generate invalid *[attribute] selectors', async () => {
        const executionService = new ExecutionService();
        // This is the exact scenario from Issue #15 that was failing
        const xml = `<android.widget.Button text="Submit" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // CRITICAL: Should NOT contain *[text()="Submit"]
        const hasInvalidSelector = element.locatorStrategies.some(s => s.startsWith('*[') || /^\*\[text\(\)=/.test(s));
        assert.strictEqual(hasInvalidSelector, false, 'CRITICAL: Should NOT generate invalid *[text()= selectors');
        // Should contain VALID XPath instead
        assert.ok(element.locatorStrategies.includes('//*[@text="Submit"]'), 'Should generate valid XPath //*[@text="Submit"] instead');
    });
    it('should return all element metadata including new fields', async () => {
        const executionService = new ExecutionService();
        const xml = `
      <android.widget.Button 
        content-desc="Submit" 
        resource-id="com.app:id/submitBtn" 
        text="Submit" 
        class="android.widget.Button"
        bounds="[0,0][100,50]" 
      />
    `;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // Should include all metadata
        assert.strictEqual(element.tag, 'android.widget.Button');
        assert.strictEqual(element.text, 'Submit');
        assert.strictEqual(element.bounds, '[0,0][100,50]');
        assert.strictEqual(element.className, 'android.widget.Button');
        assert.strictEqual(element.contentDesc, 'Submit');
        assert.strictEqual(element.resourceId, 'com.app:id/submitBtn');
        assert.ok(element.locatorStrategies !== undefined);
        assert.ok(Array.isArray(element.locatorStrategies));
    });
    it('should work with driver.$() in WebdriverIO', async () => {
        const executionService = new ExecutionService();
        // This test documents that all generated selectors are valid for driver.$()
        const xml = `<android.widget.Button content-desc="Submit" resource-id="com.app:id/btn" text="Click" bounds="[0,0][100,50]" />`;
        const result = await executionService.inspectHierarchy(xml, '');
        const element = result.elements[0];
        // All these selectors should work with: await driver.$('<selector>')
        const validFormats = [
            /^~.+/, // ~accessibilityId
            /^id=.+/, // id=resourceId
            /^\/\/\*\[@.+=".+"\]$/, // //*[@attribute="value"]
            /^\/\/.+/ // //ClassName
        ];
        element.locatorStrategies.forEach(strategy => {
            const matchesValidFormat = validFormats.some(pattern => pattern.test(strategy));
            assert.ok(matchesValidFormat, `Selector "${strategy}" should match a valid WebdriverIO format`);
        });
    });
});
