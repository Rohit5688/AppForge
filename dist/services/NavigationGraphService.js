import * as fs from 'fs';
import * as path from 'path';
/**
 * NavigationGraphService - Analyzes project step definitions to build navigation understanding
 *
 * Purpose: Help LLMs understand "how to navigate to X screen" by extracting and mapping
 * navigation patterns from existing test code.
 *
 * Features:
 * - Extracts navigation patterns from existing step definitions
 * - Builds a graph of screen-to-screen navigation paths
 * - Suggests optimal navigation sequences for test generation
 * - Maps existing step definitions to navigation actions
 * - Identifies reusable navigation building blocks
 */
export class NavigationGraphService {
    graph;
    graphPath;
    constructor(projectRoot) {
        this.graphPath = path.join(projectRoot, '.appforge', 'navigation-graph.json');
        this.graph = this.loadGraph();
    }
    /**
     * Extract navigation map from project's existing step definitions and page objects
     *
     * P2 IMPROVEMENT 2: Implements incremental updates with caching strategy
     * to avoid rebuilding the entire graph on every call.
     */
    async extractNavigationMap(projectRoot, forceRebuild = false) {
        console.error('[NavigationGraph] Analyzing project navigation patterns...');
        // Check if graph exists and is fresh
        if (!forceRebuild && await this.isGraphFresh(projectRoot)) {
            console.error('[NavigationGraph] Using cached graph (fresh)');
            return this.graph;
        }
        // Check for file changes since last build
        const changedFiles = await this.detectChangedFiles(projectRoot);
        if (changedFiles.length === 0 && !forceRebuild && this.graph.nodes.size > 0) {
            console.error('[NavigationGraph] Using cached graph (no changes detected)');
            return this.graph;
        }
        // Incremental update for small changes (< 10 files)
        if (changedFiles.length > 0 && changedFiles.length < 10 && !forceRebuild) {
            console.error(`[NavigationGraph] Performing incremental update for ${changedFiles.length} changed files`);
            await this.updateGraphIncremental(projectRoot, changedFiles);
        }
        else {
            // Full rebuild for major changes or force rebuild
            console.error('[NavigationGraph] Performing full graph rebuild');
            await this.rebuildGraphFull(projectRoot);
        }
        // Save updated graph with timestamp
        await this.saveGraph();
        console.error(`[NavigationGraph] Extracted ${this.graph.nodes.size} screens with ${this.getTotalConnections()} navigation paths`);
        return this.graph;
    }
    /**
     * Update navigation graph based on live session activity
     */
    async updateGraphFromSession(screenXml, previousScreen, action) {
        const screenSignature = this.generateScreenSignature(screenXml);
        const elements = this.extractElementsFromXml(screenXml);
        const screenName = this.inferScreenName(elements, screenSignature);
        // Update or create node
        const existingNode = this.graph.nodes.get(screenName);
        if (existingNode) {
            existingNode.visitCount++;
            existingNode.lastVisited = new Date();
            // Merge new elements (in case screen has dynamic content)
            existingNode.elements = this.mergeElements(existingNode.elements, elements);
        }
        else {
            const newNode = {
                screen: screenName,
                elements,
                connections: [],
                visitCount: 1,
                lastVisited: new Date(),
                screenSignature
            };
            this.graph.nodes.set(screenName, newNode);
        }
        // Add navigation edge if we have previous screen info
        if (previousScreen && action) {
            this.addNavigationEdge(previousScreen, screenName, action, 0.8); // Medium confidence from live session
        }
        await this.saveGraph();
    }
    /**
     * Suggest navigation steps from one screen to another
     *
     * P2 IMPROVEMENT 3: Enhanced with multi-factor confidence scoring
     */
    async suggestNavigationSteps(fromScreen, toScreen) {
        console.error(`[NavigationGraph] Finding path from '${fromScreen}' to '${toScreen}'`);
        // Use Dijkstra's algorithm to find optimal path
        const path = this.findShortestPath(fromScreen, toScreen);
        if (!path) {
            console.error(`[NavigationGraph] No path found from '${fromScreen}' to '${toScreen}'`);
            return null;
        }
        const navigationSteps = this.convertPathToSteps(path);
        const totalConfidence = this.calculatePathConfidence(path);
        const estimatedDuration = this.estimatePathDuration(path);
        // P2 IMPROVEMENT 3: Calculate enhanced path quality metrics
        const pathQuality = this.calculatePathQuality(navigationSteps);
        const riskFactors = this.identifyRiskFactors(navigationSteps);
        return {
            steps: navigationSteps,
            confidence: totalConfidence,
            estimatedDuration,
            pathQuality,
            riskFactors
        };
    }
    /**
     * Get all screens that can be reached from a given starting point
     */
    getReachableScreens(fromScreen, maxDepth = 3) {
        const visited = new Set();
        const reachable = [];
        const dfs = (screen, depth) => {
            if (depth > maxDepth || visited.has(screen))
                return;
            visited.add(screen);
            reachable.push(screen);
            const node = this.graph.nodes.get(screen);
            if (node) {
                for (const edge of node.connections) {
                    dfs(edge.targetScreen, depth + 1);
                }
            }
        };
        dfs(fromScreen, 0);
        return reachable.slice(1); // Remove starting screen
    }
    /**
     * Get common entry points for the application
     */
    getEntryPoints() {
        // Sort by visit count to find most common starting screens
        const screenUsage = Array.from(this.graph.nodes.entries())
            .map(([name, node]) => ({ name, visitCount: node.visitCount }))
            .sort((a, b) => b.visitCount - a.visitCount);
        return screenUsage.slice(0, 3).map(s => s.name); // Top 3 most visited screens
    }
    /**
     * Get existing step definitions that perform specific navigation
     */
    getNavigationStepDefinitions(fromScreen, toScreen) {
        const node = this.graph.nodes.get(fromScreen);
        if (!node)
            return [];
        return node.connections
            .filter(edge => edge.targetScreen === toScreen)
            .map(edge => edge.stepCode)
            .filter(code => code !== undefined);
    }
    /**
     * Generate navigation context for LLM test generation
     */
    async generateNavigationContext(targetScreen) {
        const entryPoints = this.getEntryPoints();
        const contextParts = [];
        contextParts.push(`## Available Navigation Paths to "${targetScreen}"`);
        contextParts.push('');
        for (const entryPoint of entryPoints) {
            const path = await this.suggestNavigationSteps(entryPoint, targetScreen);
            if (path) {
                contextParts.push(`### From ${entryPoint}:`);
                contextParts.push(`**Confidence**: ${Math.round(path.confidence * 100)}%`);
                contextParts.push(`**Estimated time**: ${Math.round(path.estimatedDuration / 1000)}s`);
                contextParts.push('');
                for (let i = 0; i < path.steps.length; i++) {
                    const step = path.steps[i];
                    const stepNum = i + 1;
                    if (step.stepDefinition) {
                        contextParts.push(`${stepNum}. **Reuse existing step**: \`${step.stepDefinition}\``);
                    }
                    else {
                        contextParts.push(`${stepNum}. **${step.action.action}** ${step.action.description}`);
                        if (step.action.triggerElement) {
                            const el = step.action.triggerElement;
                            const selector = el.accessibilityId || el.id || el.text || 'element';
                            contextParts.push(`   - Target: ${selector}`);
                        }
                    }
                }
                contextParts.push('');
            }
        }
        if (contextParts.length <= 3) {
            contextParts.push('*No navigation paths found. You may need to create navigation steps from scratch.*');
        }
        return contextParts.join('\n');
    }
    // ─── Private Implementation ──────────────────────────
    async analyzeStepDefinitions(projectRoot) {
        const stepFiles = this.findStepDefinitionFiles(projectRoot);
        const patterns = [];
        for (const filePath of stepFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const filePatterns = this.extractNavigationPatterns(content, filePath);
                patterns.push(...filePatterns);
            }
            catch (error) {
                console.error(`[NavigationGraph] Error analyzing ${filePath}:`, error);
            }
        }
        return patterns;
    }
    async analyzePageObjects(projectRoot) {
        const pageFiles = this.findPageObjectFiles(projectRoot);
        const patterns = [];
        for (const filePath of pageFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const filePatterns = this.extractPageObjectNavigationMethods(content, filePath);
                patterns.push(...filePatterns);
            }
            catch (error) {
                console.error(`[NavigationGraph] Error analyzing ${filePath}:`, error);
            }
        }
        return patterns;
    }
    extractNavigationPatterns(stepCode, filePath) {
        const patterns = [];
        // Look for step definitions that perform navigation
        const stepRegex = /@(?:Given|When|Then)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        const functionRegex = /(?:async\s+)?(?:function\s+|\w+\s*:\s*(?:async\s+)?(?:function\s*)?\()/g;
        let stepMatch;
        const lines = stepCode.split('\n');
        while ((stepMatch = stepRegex.exec(stepCode)) !== null) {
            const stepText = stepMatch[1];
            // Check if this step involves navigation
            if (this.isNavigationStep(stepText)) {
                const lineNumber = this.getLineNumber(stepCode, stepMatch.index);
                const functionBody = this.extractFunctionBody(lines, lineNumber);
                patterns.push({
                    stepText,
                    filePath,
                    lineNumber,
                    functionBody,
                    type: 'step_definition'
                });
            }
        }
        return patterns;
    }
    extractPageObjectNavigationMethods(pageCode, filePath) {
        const patterns = [];
        // Look for methods that perform navigation (goto, navigate, open, etc.)
        const methodRegex = /(goto|navigate|open|goTo|navigateTo)\w*\s*\([^)]*\)\s*{/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(pageCode)) !== null) {
            const methodName = methodMatch[0];
            const lineNumber = this.getLineNumber(pageCode, methodMatch.index);
            const lines = pageCode.split('\n');
            const functionBody = this.extractFunctionBody(lines, lineNumber);
            patterns.push({
                methodName,
                filePath,
                lineNumber,
                functionBody,
                type: 'page_object_method'
            });
        }
        return patterns;
    }
    isNavigationStep(stepText) {
        const navigationKeywords = [
            'navigate', 'go to', 'open', 'visit', 'click', 'tap', 'press',
            'swipe', 'scroll', 'back', 'return', 'close', 'menu', 'sidebar'
        ];
        const lowerStepText = stepText.toLowerCase();
        return navigationKeywords.some(keyword => lowerStepText.includes(keyword));
    }
    async buildNavigationGraph(stepDefinitions, pageObjects) {
        // Analyze patterns to infer screen connections
        const allPatterns = [...stepDefinitions, ...pageObjects];
        for (const pattern of allPatterns) {
            const screenInfo = this.inferScreenConnection(pattern);
            if (screenInfo) {
                this.addGraphNode(screenInfo.fromScreen, screenInfo.toScreen, screenInfo.action);
            }
        }
        // Set entry points based on common patterns
        this.identifyEntryPoints();
    }
    inferScreenConnection(pattern) {
        // This is a simplified inference - in practice, you'd want more sophisticated analysis
        const code = pattern.functionBody || '';
        // Look for screen references in comments or method names
        const screenMatches = code.match(/(?:screen|page|view)\s*['"]\s*(\w+)\s*['"]|(\w+)(?:Screen|Page|View)/gi);
        if (screenMatches && screenMatches.length >= 2) {
            const fromScreen = this.normalizeScreenName(screenMatches[0]);
            const toScreen = this.normalizeScreenName(screenMatches[1]);
            const action = {
                action: this.inferActionType(pattern.stepText || pattern.methodName),
                targetScreen: toScreen,
                confidence: 0.6, // Medium confidence from static analysis
                description: pattern.stepText || pattern.methodName,
                stepCode: pattern.stepText
            };
            return { fromScreen, toScreen, action };
        }
        return null;
    }
    inferActionType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('tap') || lower.includes('click') || lower.includes('press'))
            return 'tap';
        if (lower.includes('swipe'))
            return 'swipe';
        if (lower.includes('type') || lower.includes('enter'))
            return 'type';
        if (lower.includes('back'))
            return 'back';
        return 'navigate';
    }
    generateScreenSignature(screenXml) {
        // Create a hash based on stable elements (not dynamic content)
        const stableElements = this.extractStableElements(screenXml);
        return JSON.stringify(stableElements).slice(0, 64);
    }
    extractElementsFromXml(screenXml) {
        // Simplified XML parsing - in practice, use a proper XML parser
        const elements = [];
        const elementRegex = /<(\w+)[^>]*>/g;
        let match;
        while ((match = elementRegex.exec(screenXml)) !== null) {
            const attrs = this.parseAttributes(match[0]);
            if (attrs['resource-id'] || attrs['text'] || attrs['accessibility-id']) {
                elements.push({
                    id: attrs['resource-id'],
                    text: attrs['text'],
                    accessibilityId: attrs['accessibility-id'],
                    className: attrs['class']
                });
            }
        }
        return elements;
    }
    parseAttributes(elementTag) {
        const attrs = {};
        const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(elementTag)) !== null) {
            attrs[match[1]] = match[2];
        }
        return attrs;
    }
    extractStableElements(screenXml) {
        const elements = this.extractElementsFromXml(screenXml);
        // Filter to stable elements (those with IDs or accessibility labels)
        return elements.filter(el => el.id || el.accessibilityId);
    }
    inferScreenName(elements, signature) {
        // Try to infer screen name from stable elements
        for (const element of elements) {
            if (element.id) {
                const parts = element.id.split(/[:./]/);
                for (const part of parts) {
                    if (part.toLowerCase().includes('screen') || part.toLowerCase().includes('page')) {
                        return this.normalizeScreenName(part);
                    }
                }
            }
        }
        // Fallback to signature-based name
        return `Screen_${signature.slice(0, 8)}`;
    }
    normalizeScreenName(name) {
        return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }
    mergeElements(existing, newElements) {
        const merged = [...existing];
        for (const newEl of newElements) {
            const exists = merged.some(el => el.id === newEl.id || el.accessibilityId === newEl.accessibilityId);
            if (!exists) {
                merged.push(newEl);
            }
        }
        return merged;
    }
    addNavigationEdge(fromScreen, toScreen, action, confidence) {
        const fromNode = this.graph.nodes.get(fromScreen);
        if (!fromNode)
            return;
        // Check if edge already exists
        const existingEdge = fromNode.connections.find(edge => edge.targetScreen === toScreen);
        if (existingEdge) {
            // Update confidence to be average of old and new
            existingEdge.confidence = (existingEdge.confidence + confidence) / 2;
        }
        else {
            const newEdge = {
                action: action,
                targetScreen: toScreen,
                confidence,
                description: `${action} to ${toScreen}`
            };
            fromNode.connections.push(newEdge);
        }
    }
    findShortestPath(fromScreen, toScreen) {
        if (fromScreen === toScreen)
            return [];
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();
        // Initialize
        for (const [screenName] of this.graph.nodes) {
            distances.set(screenName, Infinity);
            unvisited.add(screenName);
        }
        distances.set(fromScreen, 0);
        while (unvisited.size > 0) {
            // Find unvisited node with minimum distance
            let current = null;
            let minDistance = Infinity;
            for (const node of unvisited) {
                const dist = distances.get(node) || Infinity;
                if (dist < minDistance) {
                    minDistance = dist;
                    current = node;
                }
            }
            if (!current || minDistance === Infinity)
                break;
            unvisited.delete(current);
            if (current === toScreen) {
                // Build path
                const path = [];
                let step = toScreen;
                while (previous.has(step)) {
                    const node = this.graph.nodes.get(step);
                    if (node)
                        path.unshift(node);
                    step = previous.get(step);
                }
                return path;
            }
            // Check neighbors
            const currentNode = this.graph.nodes.get(current);
            if (currentNode) {
                for (const edge of currentNode.connections) {
                    const neighbor = edge.targetScreen;
                    if (unvisited.has(neighbor)) {
                        const weight = 1 / edge.confidence; // Lower confidence = higher weight
                        const alt = (distances.get(current) || 0) + weight;
                        if (alt < (distances.get(neighbor) || Infinity)) {
                            distances.set(neighbor, alt);
                            previous.set(neighbor, current);
                        }
                    }
                }
            }
        }
        return null; // No path found
    }
    convertPathToSteps(path) {
        const steps = [];
        for (let i = 0; i < path.length - 1; i++) {
            const fromNode = path[i];
            const toNode = path[i + 1];
            const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
            if (edge) {
                steps.push({
                    fromScreen: fromNode.screen,
                    toScreen: toNode.screen,
                    action: edge,
                    stepDefinition: edge.stepCode
                });
            }
        }
        return steps;
    }
    calculatePathConfidence(path) {
        if (path.length <= 1)
            return 1.0;
        let totalConfidence = 0;
        let edgeCount = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const fromNode = path[i];
            const toNode = path[i + 1];
            const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
            if (edge) {
                totalConfidence += edge.confidence;
                edgeCount++;
            }
        }
        return edgeCount > 0 ? totalConfidence / edgeCount : 0;
    }
    estimatePathDuration(path) {
        // Estimate based on number of steps and action types
        const baseStepTime = 2000; // 2 seconds per step
        const actionMultipliers = {
            tap: 1.0,
            swipe: 1.5,
            type: 3.0,
            back: 0.5,
            navigate: 1.0
        };
        let totalTime = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const fromNode = path[i];
            const toNode = path[i + 1];
            const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
            if (edge) {
                const multiplier = actionMultipliers[edge.action] || 1.0;
                totalTime += baseStepTime * multiplier;
            }
        }
        return totalTime;
    }
    getTotalConnections() {
        let total = 0;
        for (const [, node] of this.graph.nodes) {
            total += node.connections.length;
        }
        return total;
    }
    findStepDefinitionFiles(projectRoot) {
        const files = [];
        const searchDirs = [
            path.join(projectRoot, 'src', 'step-definitions'),
            path.join(projectRoot, 'src', 'steps'),
            path.join(projectRoot, 'step-definitions'),
            path.join(projectRoot, 'steps')
        ];
        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                const dirFiles = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
                    .map(file => path.join(dir, file));
                files.push(...dirFiles);
            }
        }
        return files;
    }
    findPageObjectFiles(projectRoot) {
        const files = [];
        const searchDirs = [
            path.join(projectRoot, 'src', 'pages'),
            path.join(projectRoot, 'src', 'page-objects'),
            path.join(projectRoot, 'pages'),
            path.join(projectRoot, 'page-objects')
        ];
        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                const dirFiles = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
                    .map(file => path.join(dir, file));
                files.push(...dirFiles);
            }
        }
        return files;
    }
    getLineNumber(text, index) {
        return text.substring(0, index).split('\n').length - 1;
    }
    extractFunctionBody(lines, startLine) {
        let braceCount = 0;
        let body = '';
        let inFunction = false;
        for (let i = startLine; i < lines.length && i < startLine + 20; i++) {
            const line = lines[i];
            body += line + '\n';
            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                    inFunction = true;
                }
                else if (char === '}') {
                    braceCount--;
                    if (inFunction && braceCount === 0) {
                        return body;
                    }
                }
            }
        }
        return body;
    }
    addGraphNode(fromScreen, toScreen, action) {
        // Ensure both nodes exist
        if (!this.graph.nodes.has(fromScreen)) {
            this.graph.nodes.set(fromScreen, {
                screen: fromScreen,
                elements: [],
                connections: [],
                visitCount: 0,
                lastVisited: new Date(),
                screenSignature: ''
            });
        }
        if (!this.graph.nodes.has(toScreen)) {
            this.graph.nodes.set(toScreen, {
                screen: toScreen,
                elements: [],
                connections: [],
                visitCount: 0,
                lastVisited: new Date(),
                screenSignature: ''
            });
        }
        // Add connection
        const fromNode = this.graph.nodes.get(fromScreen);
        const existingConnection = fromNode.connections.find(c => c.targetScreen === toScreen);
        if (!existingConnection) {
            fromNode.connections.push(action);
        }
    }
    identifyEntryPoints() {
        // Common entry point patterns
        const entryPatterns = ['splash', 'main', 'home', 'login', 'welcome', 'start'];
        for (const [screenName] of this.graph.nodes) {
            const lower = screenName.toLowerCase();
            if (entryPatterns.some(pattern => lower.includes(pattern))) {
                if (!this.graph.entryPoints.includes(screenName)) {
                    this.graph.entryPoints.push(screenName);
                }
            }
        }
        // If no entry points found, use nodes with no incoming connections
        if (this.graph.entryPoints.length === 0) {
            const hasIncoming = new Set();
            for (const [, node] of this.graph.nodes) {
                for (const edge of node.connections) {
                    hasIncoming.add(edge.targetScreen);
                }
            }
            for (const [screenName] of this.graph.nodes) {
                if (!hasIncoming.has(screenName)) {
                    this.graph.entryPoints.push(screenName);
                }
            }
        }
    }
    loadGraph() {
        if (fs.existsSync(this.graphPath)) {
            try {
                const data = fs.readFileSync(this.graphPath, 'utf-8');
                const parsed = JSON.parse(data);
                // Convert plain object to Map
                const nodes = new Map();
                for (const [key, value] of Object.entries(parsed.nodes || {})) {
                    nodes.set(key, value);
                }
                return {
                    nodes,
                    entryPoints: parsed.entryPoints || [],
                    lastUpdated: new Date(parsed.lastUpdated || Date.now())
                };
            }
            catch (error) {
                console.error('[NavigationGraph] Error loading graph, starting fresh:', error);
            }
        }
        return {
            nodes: new Map(),
            entryPoints: [],
            lastUpdated: new Date()
        };
    }
    async saveGraph() {
        try {
            const dir = path.dirname(this.graphPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Convert Map to plain object for JSON serialization
            const serializable = {
                nodes: Object.fromEntries(this.graph.nodes),
                entryPoints: this.graph.entryPoints,
                lastUpdated: new Date().toISOString() // Update timestamp
            };
            fs.writeFileSync(this.graphPath, JSON.stringify(serializable, null, 2));
            // P2 IMPROVEMENT 2: Save file hashes for change detection
            await this.saveFileHashes(path.dirname(this.graphPath));
        }
        catch (error) {
            console.error('[NavigationGraph] Error saving graph:', error);
        }
    }
    // ─── P2 IMPROVEMENT 2: Caching & Incremental Updates ────────────────
    /**
     * Check if the cached graph is still fresh (no source file changes)
     */
    async isGraphFresh(projectRoot) {
        if (this.graph.nodes.size === 0)
            return false;
        const hashFile = path.join(path.dirname(this.graphPath), 'file-hashes.json');
        if (!fs.existsSync(hashFile) || !fs.existsSync(this.graphPath)) {
            return false;
        }
        try {
            const savedHashes = JSON.parse(fs.readFileSync(hashFile, 'utf-8'));
            const currentHashes = await this.computeFileHashes(projectRoot);
            // Compare hashes
            const savedKeys = Object.keys(savedHashes);
            const currentKeys = Object.keys(currentHashes);
            if (savedKeys.length !== currentKeys.length)
                return false;
            for (const file of savedKeys) {
                if (savedHashes[file] !== currentHashes[file]) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            console.error('[NavigationGraph] Error checking freshness:', error);
            return false;
        }
    }
    /**
     * Detect which files have changed since last graph build
     */
    async detectChangedFiles(projectRoot) {
        const hashFile = path.join(path.dirname(this.graphPath), 'file-hashes.json');
        if (!fs.existsSync(hashFile)) {
            // No previous hashes, consider all files changed
            const allFiles = [
                ...this.findStepDefinitionFiles(projectRoot),
                ...this.findPageObjectFiles(projectRoot)
            ];
            return allFiles;
        }
        try {
            const savedHashes = JSON.parse(fs.readFileSync(hashFile, 'utf-8'));
            const currentHashes = await this.computeFileHashes(projectRoot);
            const changedFiles = [];
            // Check for new or modified files
            for (const [file, hash] of Object.entries(currentHashes)) {
                if (savedHashes[file] !== hash) {
                    changedFiles.push(file);
                }
            }
            // Check for deleted files
            for (const file of Object.keys(savedHashes)) {
                if (!(file in currentHashes)) {
                    changedFiles.push(file);
                }
            }
            return changedFiles;
        }
        catch (error) {
            console.error('[NavigationGraph] Error detecting changes:', error);
            return [];
        }
    }
    /**
     * Compute file hashes for change detection
     */
    async computeFileHashes(projectRoot) {
        const crypto = await import('crypto');
        const allFiles = [
            ...this.findStepDefinitionFiles(projectRoot),
            ...this.findPageObjectFiles(projectRoot)
        ];
        const hashes = {};
        for (const file of allFiles) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                const hash = crypto.createHash('md5').update(content).digest('hex');
                hashes[file] = hash;
            }
            catch (error) {
                console.error(`[NavigationGraph] Error hashing ${file}:`, error);
            }
        }
        return hashes;
    }
    /**
     * Save file hashes for future change detection
     */
    async saveFileHashes(dir) {
        try {
            const projectRoot = path.dirname(dir);
            const hashes = await this.computeFileHashes(projectRoot);
            const hashFile = path.join(dir, 'file-hashes.json');
            fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2));
        }
        catch (error) {
            console.error('[NavigationGraph] Error saving file hashes:', error);
        }
    }
    /**
     * Update graph incrementally for a small number of changed files
     */
    async updateGraphIncremental(projectRoot, changedFiles) {
        // Remove connections from nodes affected by changed files
        const affectedScreens = new Set();
        for (const file of changedFiles) {
            // Identify which screens are affected by this file
            for (const [screenName, node] of this.graph.nodes) {
                // Check if any connections reference this file
                for (const edge of node.connections) {
                    if (edge.stepCode && file.includes(path.basename(file))) {
                        affectedScreens.add(screenName);
                        break;
                    }
                }
            }
        }
        // Re-analyze only the changed files
        const patterns = [];
        for (const file of changedFiles) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                if (file.includes('step-definition') || file.includes('steps')) {
                    patterns.push(...this.extractNavigationPatterns(content, file));
                }
                else if (file.includes('page')) {
                    patterns.push(...this.extractPageObjectNavigationMethods(content, file));
                }
            }
            catch (error) {
                console.error(`[NavigationGraph] Error analyzing ${file}:`, error);
            }
        }
        // Remove old connections from affected screens
        for (const screenName of affectedScreens) {
            const node = this.graph.nodes.get(screenName);
            if (node) {
                node.connections = node.connections.filter(edge => !changedFiles.some(f => edge.stepCode && f.includes(path.basename(f))));
            }
        }
        // Add new patterns
        for (const pattern of patterns) {
            const screenInfo = this.inferScreenConnection(pattern);
            if (screenInfo) {
                this.addGraphNode(screenInfo.fromScreen, screenInfo.toScreen, screenInfo.action);
            }
        }
        // Re-identify entry points
        this.identifyEntryPoints();
    }
    /**
     * Rebuild the entire graph from scratch
     */
    async rebuildGraphFull(projectRoot) {
        const stepDefinitions = await this.analyzeStepDefinitions(projectRoot);
        const pageObjects = await this.analyzePageObjects(projectRoot);
        // Clear existing graph
        this.graph.nodes.clear();
        this.graph.entryPoints = [];
        // Build navigation graph from analysis
        await this.buildNavigationGraph(stepDefinitions, pageObjects);
    }
    // ─── P2 IMPROVEMENT 3: Enhanced Confidence Scoring ───────────────────
    /**
     * Calculate multi-factor path quality metrics
     */
    calculatePathQuality(steps) {
        if (steps.length === 0) {
            return {
                completenessScore: 1.0,
                reliabilityScore: 1.0,
                maintenanceScore: 1.0,
                crossPlatformScore: 1.0
            };
        }
        // Completeness: How many steps have existing step definitions
        const stepsWithDefinitions = steps.filter(s => s.stepDefinition).length;
        const completenessScore = stepsWithDefinitions / steps.length;
        // Reliability: Based on edge confidence (proxy for test success)
        let totalReliability = 0;
        for (const step of steps) {
            totalReliability += step.action.confidence;
        }
        const reliabilityScore = totalReliability / steps.length;
        // Maintenance: Higher score for accessor-based locators
        let maintenancePoints = 0;
        for (const step of steps) {
            if (step.action.triggerElement) {
                const el = step.action.triggerElement;
                if (el.accessibilityId) {
                    maintenancePoints += 1.0; // Best: accessibility ID
                }
                else if (el.id || el.resourceId) {
                    maintenancePoints += 0.7; // Good: resource ID
                }
                else if (el.xpath) {
                    maintenancePoints += 0.3; // Poor: XPath
                }
                else {
                    maintenancePoints += 0.5; // Medium: other
                }
            }
            else {
                maintenancePoints += 0.8; // No element reference (likely a high-level action)
            }
        }
        const maintenanceScore = steps.length > 0 ? maintenancePoints / steps.length : 1.0;
        // Cross-platform: Check if steps use platform-agnostic selectors
        let crossPlatformPoints = 0;
        for (const step of steps) {
            if (step.action.triggerElement?.accessibilityId) {
                crossPlatformPoints += 1.0; // Accessibility ID works on both platforms
            }
            else if (step.action.triggerElement?.xpath) {
                crossPlatformPoints += 0.5; // XPath might need platform-specific tweaks
            }
            else {
                crossPlatformPoints += 0.7; // Other selectors
            }
        }
        const crossPlatformScore = steps.length > 0 ? crossPlatformPoints / steps.length : 1.0;
        return {
            completenessScore,
            reliabilityScore,
            maintenanceScore,
            crossPlatformScore
        };
    }
    /**
     * Identify risk factors in a navigation path
     */
    identifyRiskFactors(steps) {
        const risks = [];
        let xpathCount = 0;
        let missingStepDefCount = 0;
        let complexActionsCount = 0;
        for (const step of steps) {
            // Check for XPath usage
            if (step.action.triggerElement?.xpath) {
                xpathCount++;
            }
            // Check for missing step definitions
            if (!step.stepDefinition) {
                missingStepDefCount++;
            }
            // Check for complex actions (swipe, type)
            if (step.action.action === 'swipe' || step.action.action === 'type') {
                complexActionsCount++;
            }
        }
        if (xpathCount > 0) {
            risks.push(`Contains ${xpathCount} brittle XPath locator(s) - consider using accessibility IDs`);
        }
        if (missingStepDefCount > 0) {
            risks.push(`${missingStepDefCount} step(s) need to be created from scratch`);
        }
        if (complexActionsCount > steps.length / 2) {
            risks.push('Path contains many complex gestures - may be flaky on slower devices');
        }
        if (steps.length > 5) {
            risks.push('Long navigation path - consider creating a direct navigation helper');
        }
        return risks;
    }
}
