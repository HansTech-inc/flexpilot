import * as vscode from 'vscode';
import { logger } from '../logger';

export interface ResolvedSymbol {
    name: string;
    kind: vscode.SymbolKind;
    uri: vscode.Uri;
    range?: vscode.Range;
    containerName?: string;
}

export interface ResolvedEntity {
    originalSymbol: string;
    uri?: vscode.Uri;
    symbols?: ResolvedSymbol[];
    isFolder?: boolean;
    isUrl?: boolean;
    url?: string;
    error?: string;
}

export class SymbolResolver {
    // Regex to find @-symbols. Handles filenames, paths, symbols, and URLs.
    // Examples: @file.ts, @folder/file.ts, @mySymbol, @folder/, @https://example.com
    private static readonly AT_SYMBOL_REGEX = /@([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*(?:\.[a-zA-Z0-9_.-]+)?|\/?|https?:\/\/[^\s]+)/g;

    // URL regex pattern
    private static readonly URL_PATTERN = /^https?:\/\/[^\s]+$/;    /**
     * Resolves a query string to a file or folder URI
     * Handles both direct paths and fuzzy finding
     *
     * @param query The string to resolve to a file or folder
     * @returns A URI pointing to the resolved file or folder, or undefined if not found
     */
    public async resolveFileOrFolder(query: string): Promise<vscode.Uri | undefined> {
        logger.debug(`Resolving file/folder for @-query: ${query}`);
        try {
            // Try direct path first (if query is a relative path from workspace root)
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const directUri = vscode.Uri.joinPath(workspaceFolders[0].uri, query);
                try {
                    const stat = await vscode.workspace.fs.stat(directUri);
                    if (stat) {
                        logger.debug(`Resolved @-query '${query}' to direct URI: ${directUri.toString()}`);
                        return directUri;
                    }
                } catch {
                    // Not a direct path, proceed to search
                }
            }

            // Fuzzy search for files/folders
            // For folders, we might need to adjust the query or use a different findFiles pattern
            const isLikelyFolder = query.endsWith('/');
            let searchPattern: string;

            if (isLikelyFolder) {
                // For folders, search for all files within that folder pattern
                const folderPattern = query.endsWith('/') ? query : `${query}/`;
                searchPattern = `${folderPattern}**`;
            } else {
                // For files, search in all folders
                searchPattern = `**/${query}`;
            }

            // Exclude node_modules, .git and other common directories that should be ignored
            const foundUris = await vscode.workspace.findFiles(searchPattern, '**/node_modules/**', 10);

            if (foundUris.length > 0) {
                if (isLikelyFolder) {
                    // For folders, get the common parent directory
                    const folderPath = this.extractCommonPath(foundUris);
                    if (folderPath) {
                        logger.debug(`Resolved @-query '${query}' to folder: ${folderPath.toString()}`);
                        return folderPath;
                    }
                }

                // Prefer exact match if possible, or shortest path
                const exactMatch = foundUris.find(uri => uri.path.endsWith(query));
                const bestMatch = exactMatch || foundUris.sort((a, b) => a.path.length - b.path.length)[0];
                logger.debug(`Resolved @-query '${query}' to URI: ${bestMatch.toString()}`);
                return bestMatch;
            }

            logger.warn(`Could not resolve file/folder for @-query: ${query}`);
            return undefined;
        } catch (error) {
            logger.error(`Error resolving file/folder for @-query '${query}':`, error);
            return undefined;
        }
    }

    /**
     * Extracts the common parent directory from a list of URIs
     */
    private extractCommonPath(uris: vscode.Uri[]): vscode.Uri | undefined {
        if (!uris.length) {
            return undefined;
        }

        if (uris.length === 1) {
            // If it's a single file, return its parent directory
            const pathParts = uris[0].path.split('/');
            pathParts.pop(); // Remove filename
            return vscode.Uri.parse(uris[0].with({ path: pathParts.join('/') }).toString());
        }

        // For multiple files, find common path
        const paths = uris.map(uri => uri.path.split('/'));
        const minLength = Math.min(...paths.map(parts => parts.length));

        let commonPathParts: string[] = [];
        for (let i = 0; i < minLength; i++) {
            const part = paths[0][i];
            if (paths.every(p => p[i] === part)) {
                commonPathParts.push(part);
            } else {
                break;
            }
        }

        if (commonPathParts.length === 0) {
            return undefined;
        }

        // Construct common parent URI
        return vscode.Uri.parse(uris[0].with({ path: commonPathParts.join('/') }).toString());
    }

    public async resolveSymbol(query: string, documentUri?: vscode.Uri): Promise<ResolvedSymbol[]> {
        logger.debug(`Resolving symbol for @-query: ${query} (doc: ${documentUri?.toString()})`);
        const resolvedSymbols: ResolvedSymbol[] = [];
        try {
            if (documentUri) {
                const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    documentUri
                );
                if (documentSymbols) {
                    this.findSymbolsInDocument(query, documentSymbols, documentUri, undefined, resolvedSymbols);
                }
            }

            // If not found in a specific document or no documentUri, search workspace
            if (resolvedSymbols.length === 0) {
                const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                    'vscode.executeWorkspaceSymbolProvider',
                    query
                );
                if (workspaceSymbols) {
                    workspaceSymbols.forEach(symbolInfo => {
                        resolvedSymbols.push({
                            name: symbolInfo.name,
                            kind: symbolInfo.kind,
                            uri: symbolInfo.location.uri,
                            range: symbolInfo.location.range,
                            containerName: symbolInfo.containerName,
                        });
                    });
                }
            }
            logger.debug(`Found ${resolvedSymbols.length} symbols for @-query '${query}'`);
            return resolvedSymbols;
        } catch (error) {
            logger.error(`Error resolving symbol for @-query '${query}':`, error);
            return [];
        }
    }

    private findSymbolsInDocument(
        query: string,
        symbols: vscode.DocumentSymbol[],
        uri: vscode.Uri,
        containerName: string | undefined,
        results: ResolvedSymbol[]
    ): void {
        for (const symbol of symbols) {
            if (symbol.name === query) {
                results.push({
                    name: symbol.name,
                    kind: symbol.kind,
                    uri,
                    range: symbol.selectionRange, // Use selectionRange for more precise targeting
                    containerName,
                });
            }
            if (symbol.children && symbol.children.length > 0) {
                this.findSymbolsInDocument(query, symbol.children, uri, symbol.name, results);
            }
        }
    }    /**
     * Parses a prompt string and extracts all @-references.
     * Supports files, folders, symbols, and URLs.
     *
     * @param prompt The prompt text to parse
     * @returns An object containing the raw prompt and an array of extracted @-references
     */
    public parseAndResolvePrompt(prompt: string): { rawPrompt: string, atReferences: string[] } {
        const atReferences = new Set<string>();
        let match;
        while ((match = SymbolResolver.AT_SYMBOL_REGEX.exec(prompt)) !== null) {
            if (match[1]) { // match[1] is the captured group
                atReferences.add(match[1]);
            }
        }
        return { rawPrompt: prompt, atReferences: Array.from(atReferences) };
    }    /**
     * Resolves an @-reference to the appropriate entity type:
     * - URL: Web links starting with http:// or https://
     * - File: Source code files
     * - Folder: Directory paths (typically ending with /)
     * - Symbol: Code symbols like classes, methods, functions, etc.
     *
     * @param ref The reference string without the @ symbol
     * @returns A ResolvedEntity containing the resolved information
     */
    public async resolveAtReference(ref: string): Promise<ResolvedEntity> {
        logger.debug(`Resolving @-reference: ${ref}`);
        const entity: ResolvedEntity = { originalSymbol: ref };

        // First check if it's a URL
        if (SymbolResolver.URL_PATTERN.test(ref)) {
            logger.debug(`Detected URL reference: ${ref}`);
            entity.isUrl = true;
            entity.url = ref;
            return entity;
        }

        // Check if it's a file or folder
        const isFileOrFolderLike = ref.includes('.') || ref.endsWith('/') || ref.includes('/');
        if (isFileOrFolderLike) {
            const uri = await this.resolveFileOrFolder(ref);
            if (uri) {
                entity.uri = uri;
                // Determine if it's a folder
                try {
                    const stat = await vscode.workspace.fs.stat(uri);
                    entity.isFolder = (stat.type === vscode.FileType.Directory);
                    logger.debug(`Resolved @-reference '${ref}' to ${entity.isFolder ? 'folder' : 'file'}: ${uri.toString()}`);
                } catch (error) {
                    logger.warn(`Error checking file type for ${uri.toString()}:`, error);
                }
            } else {
                // If file/folder not found, try as symbol as a fallback if it doesn't look like a path
                if (!ref.includes('/')) {
                    const symbols = await this.resolveSymbol(ref);
                    if (symbols.length > 0) {
                        entity.symbols = symbols;
                    } else {
                        entity.error = `Could not resolve file, folder, or symbol: ${ref}`;
                    }
                } else {
                    entity.error = `Could not resolve file or folder: ${ref}`;
                }
            }
        } else { // Treat as symbol
            const symbols = await this.resolveSymbol(ref);
            if (symbols.length > 0) {
                entity.symbols = symbols;
            } else {
                // Fallback: Could it be a filename without extension that got misclassified?
                const uri = await this.resolveFileOrFolder(ref);
                if (uri) {
                    entity.uri = uri;
                    // Check if it's a folder
                    try {
                        const stat = await vscode.workspace.fs.stat(uri);
                        entity.isFolder = (stat.type === vscode.FileType.Directory);
                    } catch {
                        // Ignore errors for this check
                    }
                } else {
                    entity.error = `Could not resolve symbol or file: ${ref}`;
                }
            }
        }
        return entity;
    }
}

// Example Usage (for testing, remove later)
// async function testResolver() {
//     const resolver = new SymbolResolver();
//     const prompt = "Please explain @SymbolResolver class and open @agent-tools.ts then look at @src/util/";
//     const { atReferences } = resolver.parseAndResolvePrompt(prompt);
//     console.log("Found @-references:", atReferences);

//     for (const ref of atReferences) {
//         const resolved = await resolver.resolveAtReference(ref);
//         console.log(`Resolved '@${ref}':`, resolved);
//     }
// }
// testResolver();
