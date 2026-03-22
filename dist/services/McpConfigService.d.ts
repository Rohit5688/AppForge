export interface McpConfig {
    project: {
        language: string;
        testFramework: string;
        client: string;
    };
    mobile: {
        defaultPlatform: string;
        capabilitiesProfiles: Record<string, any>;
        cloud?: {
            provider: 'browserstack' | 'saucelabs' | 'none';
            username?: string | undefined;
            accessKey?: string | undefined;
        };
    };
    paths: {
        featuresRoot: string;
        pagesRoot: string;
        stepsRoot: string;
        utilsRoot: string;
    };
}
export declare class McpConfigService {
    private readonly configFileName;
    read(projectRoot: string): McpConfig;
    write(projectRoot: string, config: Partial<McpConfig>): void;
    updateAppPath(projectRoot: string, platform: 'android' | 'ios', appPath: string): void;
    setCloudProvider(projectRoot: string, provider: 'browserstack' | 'saucelabs' | 'none', username?: string, accessKey?: string): void;
}
//# sourceMappingURL=McpConfigService.d.ts.map