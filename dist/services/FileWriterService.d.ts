export interface FileToWrite {
    path: string;
    content: string;
}
export declare class FileWriterService {
    /**
     * Writes the AI-generated test files to disk.
     */
    writeFiles(projectRoot: string, files: FileToWrite[]): Promise<string>;
}
//# sourceMappingURL=FileWriterService.d.ts.map