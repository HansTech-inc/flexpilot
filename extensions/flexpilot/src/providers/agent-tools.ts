/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logger } from '../logger';
import { ThemeIcon } from 'vscode';
import fetch from 'node-fetch';
import * as puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import * as url from 'url';
import { Buffer } from 'node:buffer';


/**
 * Tool contribution definition
 */
interface IToolContribution {
    name: string;
    displayName: string;
    modelDescription: string;
    toolReferenceName?: string;
    icon?: ThemeIcon;
    when?: string;
    tags?: string[];
    userDescription?: string;
    inputSchema?: any;
    canBeReferencedInPrompt?: boolean;
    execute: (args: any) => Promise<any>;
}

/**
 * Provides the core tools and capabilities for the Agent Mode.
 */
export class AgentTools implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _tools: Map<string, IToolContribution> = new Map();
    private _webSearchCache: Map<string, { result: string, timestamp: number }> = new Map();
    private _webSearchCacheTTL = 10 * 60 * 1000; // 10 minutes
    private _webSearchFeedback: Map<string, { up: number, down: number }> = new Map();

    constructor() {
        this._registerBuiltinTools();
        logger.info('Agent tools initialized');
    }

    /**
     * Registers the built-in tools available to the agent.
     */
    private _registerBuiltinTools(): void {
        // Codebase Exploration Tool
        this._tools.set('exploreCodebase', {
            name: 'exploreCodebase',
            displayName: 'Explore Codebase',
            modelDescription: 'Explores the codebase to understand project structure and dependencies',
            toolReferenceName: 'explore',
            icon: new ThemeIcon('search'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query to find relevant files'
                    },
                    excludePattern: {
                        type: 'string',
                        description: 'Pattern to exclude from search'
                    }
                },
                required: ['query']
            },
            execute: async (args: any) => this.exploreCodebase(args.query, args.excludePattern)
        });

        // File Analysis Tool
        this._tools.set('analyzeFile', {
            name: 'analyzeFile',
            displayName: 'Analyze File',
            modelDescription: 'Reads and analyzes file contents',
            toolReferenceName: 'analyze',
            icon: new ThemeIcon('file-code'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: {
                        type: 'string',
                        description: 'URI of the file to analyze'
                    }
                },
                required: ['uri']
            },
            execute: async (args: any) => this.readFile(vscode.Uri.parse(args.uri))
        });

        // File Editing Tool
        this._tools.set('editFile', {
            name: 'editFile',
            displayName: 'Edit File',
            modelDescription: 'Makes changes to files in the workspace',
            toolReferenceName: 'edit',
            icon: new ThemeIcon('edit'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: {
                        type: 'string',
                        description: 'URI of the file to edit'
                    },
                    content: {
                        type: 'string',
                        description: 'New content for the file'
                    }
                },
                required: ['uri', 'content']
            },
            execute: async (args: any) => this.editFile(vscode.Uri.parse(args.uri), args.content)
        });

        // Command Execution Tool
        this._tools.set('executeCommand', {
            name: 'executeCommand',
            displayName: 'Execute Command',
            modelDescription: 'Executes terminal commands',
            toolReferenceName: 'exec',
            icon: new ThemeIcon('terminal'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Command to execute'
                    }
                },
                required: ['command']
            },
            execute: async (args: any) => this.executeCommand(args.command)
        });

        // Code Verification Tool
        this._tools.set('verifyChanges', {
            name: 'verifyChanges',
            displayName: 'Verify Changes',
            modelDescription: 'Verifies changes and validates code quality',
            toolReferenceName: 'verify',
            icon: new ThemeIcon('check'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: {
                        type: 'string',
                        description: 'URI of the file to verify'
                    }
                },
                required: ['uri']
            },
            execute: async (args: any) => this.verifyChanges(vscode.Uri.parse(args.uri))
        });

        // Web Search Tool
        this._tools.set('searchWeb', {
            name: 'searchWeb',
            displayName: 'Search Web',
            modelDescription: 'Searches the web for documentation and best practices',
            toolReferenceName: 'web',
            icon: new ThemeIcon('globe'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query'
                    }
                },
                required: ['query']
            },
            execute: async (args: any) => this.searchWeb(args.query)
        });

        // --- NEW TOOLS ---
        // Create File or Folder Tool
        this._tools.set('createFileOrFolder', {
            name: 'createFileOrFolder',
            displayName: 'Create File or Folder',
            modelDescription: 'Creates a new file or folder in the workspace',
            toolReferenceName: 'create',
            icon: new ThemeIcon('new-file'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'URI of the file or folder to create' },
                    isFolder: { type: 'boolean', description: 'Whether to create a folder (true) or file (false)' }
                },
                required: ['uri', 'isFolder']
            },
            execute: async (args: any) => this.createFileOrFolder(vscode.Uri.parse(args.uri), args.isFolder)
        });

        // Rewrite File Tool
        this._tools.set('rewriteFile', {
            name: 'rewriteFile',
            displayName: 'Rewrite File',
            modelDescription: 'Replaces the entire content of a file',
            toolReferenceName: 'rewrite',
            icon: new ThemeIcon('replace'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'URI of the file to rewrite' },
                    content: { type: 'string', description: 'New content for the file' }
                },
                required: ['uri', 'content']
            },
            execute: async (args: any) => this.rewriteFile(vscode.Uri.parse(args.uri), args.content)
        });

        // Run Persistent Command Tool
        this._tools.set('runPersistentCommand', {
            name: 'runPersistentCommand',
            displayName: 'Run Persistent Command',
            modelDescription: 'Runs a persistent terminal command (e.g., dev server)',
            toolReferenceName: 'runPersistent',
            icon: new ThemeIcon('debug-start'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to run' }
                },
                required: ['command']
            },
            execute: async (args: any) => this.runPersistentCommand(args.command)
        });

        // Run Command Tool
        this._tools.set('runCommand', {
            name: 'runCommand',
            displayName: 'Run Command',
            modelDescription: 'Runs a one-off shell command and returns output',
            toolReferenceName: 'run',
            icon: new ThemeIcon('terminal-bash'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to run' }
                },
                required: ['command']
            },
            execute: async (args: any) => this.runCommand(args.command)
        });

        // Search In File Tool
        this._tools.set('searchInFile', {
            name: 'searchInFile',
            displayName: 'Search In File',
            modelDescription: 'Searches for a string or regex in a file',
            toolReferenceName: 'searchInFile',
            icon: new ThemeIcon('search'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'URI of the file to search' },
                    query: { type: 'string', description: 'String or regex to search for' }
                },
                required: ['uri', 'query']
            },
            execute: async (args: any) => this.searchInFile(vscode.Uri.parse(args.uri), args.query)
        });

        // List Symbols In File Tool
        this._tools.set('listSymbolsInFile', {
            name: 'listSymbolsInFile',
            displayName: 'List Symbols In File',
            modelDescription: 'Lists all symbols in a file',
            toolReferenceName: 'listSymbols',
            icon: new ThemeIcon('symbol-class'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'URI of the file' }
                },
                required: ['uri']
            },
            execute: async (args: any) => this.listSymbolsInFile(vscode.Uri.parse(args.uri))
        });

        // Get Directory Tree Tool
        this._tools.set('getDirTree', {
            name: 'getDirTree',
            displayName: 'Get Directory Tree',
            modelDescription: 'Gets the directory tree of the workspace or a folder',
            toolReferenceName: 'dirTree',
            icon: new ThemeIcon('folder'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    root: { type: 'string', description: 'Root URI to start from (optional)' }
                },
                required: []
            },
            execute: async (args: any) => this.getDirTree(args.root ? vscode.Uri.parse(args.root) : undefined)
        });

        // Search For Files Tool
        this._tools.set('searchForFiles', {
            name: 'searchForFiles',
            displayName: 'Search For Files',
            modelDescription: 'Searches for files matching a pattern',
            toolReferenceName: 'searchFiles',
            icon: new ThemeIcon('file-directory'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Glob pattern to search for' }
                },
                required: ['pattern']
            },
            execute: async (args: any) => this.searchForFiles(args.pattern)
        });

        // Find Symbol Tool
        this._tools.set('findSymbol', {
            name: 'findSymbol',
            displayName: 'Find Symbol',
            modelDescription: 'Finds a symbol in the workspace',
            toolReferenceName: 'findSymbol',
            icon: new ThemeIcon('symbol-method'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string', description: 'Symbol name to find' }
                },
                required: ['symbol']
            },
            execute: async (args: any) => this.findSymbol(args.symbol)
        });

        // Smart Search/Replace Tool
        this._tools.set('replaceInFile', {
            name: 'replaceInFile',
            displayName: 'Replace In File (Smart Patch)',
            modelDescription: 'Applies precise SEARCH/REPLACE blocks to a file, like a patch or diff.',
            toolReferenceName: 'replace',
            icon: new ThemeIcon('diff'),
            canBeReferencedInPrompt: true,
            inputSchema: {
                type: 'object',
                properties: {
                    uri: { type: 'string', description: 'URI of the file to patch' },
                    replaceBlocks: { type: 'string', description: 'SEARCH/REPLACE blocks string' }
                },
                required: ['uri', 'replaceBlocks']
            },
            execute: async (args: any) => this.applySearchReplaceBlocks(vscode.Uri.parse(args.uri), args.replaceBlocks)
        });
    }

    /**
     * Explores the codebase to understand project structure and dependencies.
     */
    async exploreCodebase(query: string, excludePattern?: string): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles(
            query,
            excludePattern || '**/node_modules/**'
        );
        return files;
    }

    /**
     * Reads and analyzes file contents.
     *
     * Note: Buffer is available globally in Node.js (VS Code extension host). If you see linter errors,
     * ensure @types/node is installed in your devDependencies.
     */
    async readFile(uri: vscode.Uri): Promise<string> {
        const content = await vscode.workspace.fs.readFile(uri);
        // Buffer is global in Node.js. For TypeScript, install @types/node if needed.
        return Buffer.from(content).toString('utf-8');
    }

    /**
     * Makes changes to files in the workspace.
     *
     * Note: Buffer is available globally in Node.js (VS Code extension host). If you see linter errors,
     * ensure @types/node is installed in your devDependencies.
     */
    async editFile(uri: vscode.Uri, content: string): Promise<void> {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    }

    /**
     * Executes terminal commands.
     */
    async executeCommand(command: string): Promise<void> {
        const terminal = vscode.window.createTerminal('FlexPilot Agent');
        terminal.sendText(command);
        this._disposables.push(terminal);
    }

    /**
     * Verifies changes and validates code quality.
     */
    async verifyChanges(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        return diagnostics;
    }

    /**
     * Enhanced web search with LLM query expansion, context injection, parallel fetching, caching, reranking, rich previews, and feedback hooks.
     * @param query The user query
     * @param options Optional: { codeContext?: string, sessionContext?: string[] }
     */
    async searchWeb(query: string, options?: { codeContext?: string, sessionContext?: string[] }): Promise<string> {
        // 0. Caching
        const cacheKey = JSON.stringify({ query, ...options });
        const now = Date.now();
        if (this._webSearchCache.has(cacheKey)) {
            const cached = this._webSearchCache.get(cacheKey)!;
            if (now - cached.timestamp < this._webSearchCacheTTL) {
                return cached.result + '\n\n[From cache]';
            } else {
                this._webSearchCache.delete(cacheKey);
            }
        }

        // 1. LLM-powered Query Expansion
        let expandedQuery = query;
        try {
            let expansionPrompt = `Rewrite and expand this search query for maximum coverage (add synonyms, related terms, clarify intent, but keep it concise and relevant):\n"${query}"`;
            if (options?.codeContext) {
                expansionPrompt += `\n\nRelevant code or error context:\n${options.codeContext}`;
            }
            if (options?.sessionContext && options.sessionContext.length > 0) {
                expansionPrompt += `\n\nSession context (previous chat):\n${options.sessionContext.join('\n')}`;
            }
            const expansionResult = await vscode.commands.executeCommand<any>(
                'vscode.lm.chat.complete',
                [
                    { role: 'system', content: 'You are an expert search assistant. Expand and clarify the user query for best web search coverage.' },
                    { role: 'user', content: expansionPrompt }
                ],
                { model: undefined, maxTokens: 64, temperature: 0.2 }
            );
            expandedQuery = expansionResult?.choices?.[0]?.message?.content?.trim() || query;
        } catch (err) {
            // fallback to original query
        }

        // 2. Google Custom Search API
        const searchApiKey = "AIzaSyCPR3fFs89C3KoUqlfQ3D7fuY_qE6QMtq8";
        const searchEngineId = "b5c87db0a2743426b";
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(expandedQuery)}`;
        let searchData: any;
        try {
            const searchRes = await fetch(searchUrl);
            searchData = await searchRes.json();
        } catch (err) {
            return `Failed to fetch search results: ${err}`;
        }
        if (!searchData.items || !Array.isArray(searchData.items)) {
            return "No search results found.";
        }
        // 3. Get top 7 results
        const topResults = searchData.items.slice(0, 7);        // 4. Parallel Scraping for Deep Content, Code, and Images
        let browser: puppeteer.Browser | undefined;
        let summaries: { title: string, url: string, snippet: string, content: string, codeBlocks: string[]; images: string[] }[] = [];
        try {
            browser = await puppeteer.launch({ headless: true });
            const scrapePromises = topResults.map(async (result: { title: string, link: string, snippet: string }) => {
                const { title, link: pageUrl, snippet } = result;
                let content = '';
                const codeBlocks: string[] = [];
                const images: string[] = [];
                try {
                    const page = await browser!.newPage();
                    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    const html = await page.content();
                    const $ = cheerio.load(html);
                    // Extract just the body text
                    content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
                    // Extract code blocks
                    $('pre, code').each((_: number, el: Element) => {
                        const code = $(el).text();
                        if (code && code.length > 10 && codeBlocks.length < 5) {
                            codeBlocks.push(code.slice(0, 500));
                        }
                    });
                    // Extract images
                    $('img').each((_: number, el: Element) => {
                        const src = $(el).attr('src');
                        if (src && images.length < 3) {
                            let absUrl = src;
                            if (!/^https?:\/\//.test(src)) {
                                absUrl = url.resolve(pageUrl, src);
                            }
                            images.push(absUrl);
                        }
                    });
                    await page.close();
                } catch (err) {
                    content = '[Failed to extract content]';
                }
                return { title, url: pageUrl, snippet, content, codeBlocks, images };
            });
            summaries = await Promise.all(scrapePromises);
        } catch (err) {
            return `Failed to launch browser or scrape pages: ${err}`;
        } finally {
            if (browser) await browser.close();
        }

        // 5. LLM-powered Reranking
        let rerankedSummaries = summaries;
        try {
            const rerankPrompt = `Given the expanded query: "${expandedQuery}", session context: ${options?.sessionContext?.join(' ') || ''}, and the following web search results, rerank them by relevance. Return a JSON array of indices in best order.\n\nResults:\n${summaries.map((s, i) => `[${i}] ${s.title} (${s.url})\n${s.snippet}\n`).join('\n')}\n---\nJSON:`;
            const rerankResult = await vscode.commands.executeCommand<any>(
                'vscode.lm.chat.complete',
                [
                    { role: 'system', content: 'You are a helpful assistant that reranks web search results for relevance.' },
                    { role: 'user', content: rerankPrompt }
                ],
                { model: undefined, maxTokens: 32, temperature: 0.1 }
            );
            const order = JSON.parse(rerankResult?.choices?.[0]?.message?.content || '[]');
            if (Array.isArray(order) && order.length === summaries.length) {
                rerankedSummaries = order.map((i: number) => summaries[i]);
            }
        } catch (err) {
            // fallback to original order
        }

        // 6. Compose LLM Summarization Prompt with Rich Previews
        let llmPrompt = `You are a smart assistant. Given the following web search results for the query: "${expandedQuery}", synthesize a clear, direct, and relevant answer. Use the extracted content, code, and images to answer, and cite or link to the most relevant sources.\n\n`;
        rerankedSummaries.forEach(({ title, url, content, codeBlocks, images }, i) => {
            llmPrompt += `Source ${i + 1}: ${title} (${url})\nContent: ${content}\n`;
            if (codeBlocks.length > 0) {
                llmPrompt += `Code Snippets:\n${codeBlocks.map(c => '```\n' + c + '\n```').join('\n')}\n`;
            }
            if (images.length > 0) {
                llmPrompt += `Images:\n${images.map(img => img).join('\n')}\n`;
            }
            llmPrompt += '\n';
        });
        llmPrompt += `\n---\nPlease write a concise answer to the query, referencing the sources as [Source 1], [Source 2], etc., where appropriate. Include links and code/images where helpful.`;

        // 7. LLM Summarization
        let summary = '';
        try {
            const llmResult = await vscode.commands.executeCommand<any>(
                'vscode.lm.chat.complete',
                [
                    { role: 'system', content: 'You are a helpful assistant that summarizes web search results and always cites sources.' },
                    { role: 'user', content: llmPrompt }
                ],
                { model: undefined, maxTokens: 512, temperature: 0.2 }
            );
            summary = llmResult?.choices?.[0]?.message?.content || '';
        } catch (err) {
            summary = '[Failed to summarize with LLM]';
        }

        // 8. Compose Response with Source Transparency and Rich Previews
        let response = `**Web Search Results for:** _${expandedQuery}_\n\n`;
        response += summary + '\n\n';
        response += `Citations:\n`;
        rerankedSummaries.forEach(({ title, url }, i) => {
            const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
            response += `[Source ${i + 1}: ${title} - ${domain}](${url})\n`;
        });
        response += '\n---\n';
        response += 'Was this result helpful? [👍](command:flexpilot.webSearchFeedback?%7B%22query%22%3A%22' + encodeURIComponent(query) + '%22,%22up%22%3Atrue%7D) [👎](command:flexpilot.webSearchFeedback?%7B%22query%22%3A%22' + encodeURIComponent(query) + '%22,%22down%22%3Atrue%7D)';

        // 9. Store in cache
        this._webSearchCache.set(cacheKey, { result: response, timestamp: now });

        return response;
    }

    /**
     * Structured web search: returns an array of 7 results with query, url, title, and extractedContent (main body, up to 3000 chars).
     */
    async searchWebStructured(query: string, options?: { codeContext?: string, sessionContext?: string[] }): Promise<Array<{ query: string, url: string, title: string, extractedContent: string }>> {
        // 1. LLM-powered Query Expansion (reuse from searchWeb)
        let expandedQuery = query;
        try {
            let expansionPrompt = `Rewrite and expand this search query for maximum coverage (add synonyms, related terms, clarify intent, but keep it concise and relevant):\n"${query}"`;
            if (options?.codeContext) {
                expansionPrompt += `\n\nRelevant code or error context:\n${options.codeContext}`;
            }
            if (options?.sessionContext && options.sessionContext.length > 0) {
                expansionPrompt += `\n\nSession context (previous chat):\n${options.sessionContext.join('\n')}`;
            }
            const expansionResult = await vscode.commands.executeCommand<any>(
                'vscode.lm.chat.complete',
                [
                    { role: 'system', content: 'You are an expert search assistant. Expand and clarify the user query for best web search coverage.' },
                    { role: 'user', content: expansionPrompt }
                ],
                { model: undefined, maxTokens: 64, temperature: 0.2 }
            );
            expandedQuery = expansionResult?.choices?.[0]?.message?.content?.trim() || query;
        } catch (err) {
            // fallback to original query
        }

        // 2. Google Custom Search API
        const searchApiKey = "AIzaSyCPR3fFs89C3KoUqlfQ3D7fuY_qE6QMtq8";
        const searchEngineId = "b5c87db0a2743426b";
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(expandedQuery)}`;
        let searchData: any;
        try {
            const searchRes = await fetch(searchUrl);
            searchData = await searchRes.json();
        } catch (err) {
            return [];
        }
        if (!searchData.items || !Array.isArray(searchData.items)) {
            return [];
        }
        // 3. Get top 7 results
        const topResults = searchData.items.slice(0, 7);        // 4. Parallel Scraping for Deep Content
        let browser: puppeteer.Browser | undefined;
        let summaries: { title: string, url: string, content: string }[] = [];
        try {
            browser = await puppeteer.launch({ headless: true });
            const scrapePromises = topResults.map(async (result: { title: string, link: string }) => {
                const { title, link: pageUrl } = result;
                let content = '';
                try {
                    const page = await browser!.newPage();
                    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    const html = await page.content();
                    const $ = cheerio.load(html);
                    // Extract just the body text
                    content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
                    await page.close();
                } catch (err) {
                    content = '[Failed to extract content]';
                }
                return { title, url: pageUrl, content };
            });
            summaries = await Promise.all(scrapePromises);
        } catch (err) {
            return [];
        } finally {
            if (browser) await browser.close();
        }

        // 5. Return structured array
        return summaries.map(({ title, url, content }) => ({
            query,
            url,
            title,
            extractedContent: content
        }));
    }

    // Feedback API (to be used by command handler/UI)
    public recordWebSearchFeedback(query: string, up: boolean, down: boolean) {
        const key = query.trim().toLowerCase();
        if (!this._webSearchFeedback.has(key)) {
            this._webSearchFeedback.set(key, { up: 0, down: 0 });
        }
        const entry = this._webSearchFeedback.get(key)!;
        if (up) entry.up++;
        if (down) entry.down++;
    }

    /**
     * Creates a new file or folder.
     */
    async createFileOrFolder(uri: vscode.Uri, isFolder: boolean): Promise<void> {
        if (isFolder) {
            await vscode.workspace.fs.createDirectory(uri);
        } else {
            await vscode.workspace.fs.writeFile(uri, new Uint8Array());
        }
    }

    /**
     * Rewrites the entire content of a file.
     *
     * Note: Buffer is available globally in Node.js (VS Code extension host). If you see linter errors,
     * ensure @types/node is installed in your devDependencies.
     */
    async rewriteFile(uri: vscode.Uri, content: string): Promise<void> {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    }

    /**
     * Runs a persistent terminal command (e.g., dev server).
     */
    async runPersistentCommand(command: string): Promise<void> {
        const terminal = vscode.window.createTerminal({ name: 'FlexPilot Persistent', isTransient: false });
        terminal.sendText(command);
        terminal.show();
        this._disposables.push(terminal);
    }

    /**
     * Runs a one-off shell command and returns output.
     *
     * Note: This only works in Node.js (desktop) extensions, not in web extensions.
     * Throws an error if called in a web extension context.
     */    async runCommand(command: string): Promise<string> {
        if (typeof window !== 'undefined') {
            throw new Error('runCommand is not supported in web extension context.');
        }
        // Dynamic import for Node.js core module
        const { exec } = await import('child_process');
        return new Promise((resolve, reject) => {
            exec(command, (error: any, stdout: string, stderr: string) => {
                if (error) return reject(stderr || error);
                resolve(stdout);
            });
        });
    }

    /**
     * Searches for a string or regex in a file.
     */
    async searchInFile(uri: vscode.Uri, query: string): Promise<number[]> {
        const content = await this.readFile(uri);
        const regex = new RegExp(query, 'g');
        const matches = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
            matches.push(match.index);
        }
        return matches;
    }

    /**
     * Lists all symbols in a file.
     */    async listSymbolsInFile(uri: vscode.Uri): Promise<vscode.DocumentSymbol[] | undefined> {
        await vscode.workspace.openTextDocument(uri);
        return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
    }

    /**
     * Gets the directory tree of the workspace or a folder.
     */
    async getDirTree(root?: vscode.Uri): Promise<any> {
        const folder = root || (vscode.workspace.workspaceFolders?.[0]?.uri);
        if (!folder) return null;
        const entries = await vscode.workspace.fs.readDirectory(folder);
        return entries.map(([name, type]) => ({ name, type: type === vscode.FileType.Directory ? 'folder' : 'file' }));
    }

    /**
     * Searches for files matching a pattern.
     */
    async searchForFiles(pattern: string): Promise<vscode.Uri[]> {
        return await vscode.workspace.findFiles(pattern);
    }

    /**
     * Finds a symbol in the workspace.
     */
    async findSymbol(symbol: string): Promise<any[]> {
        return await vscode.commands.executeCommand<any[]>('vscode.executeWorkspaceSymbolProvider', symbol);
    }

    /**
     * Applies SEARCH/REPLACE blocks to a file.
     */
    async applySearchReplaceBlocks(uri: vscode.Uri, replaceBlocks: string): Promise<string> {
        const content = await this.readFile(uri);
        let updatedContent = content;
        // Parse all blocks
        const blockRegex = /<<<<<<< ORIGINAL([\s\S]*?)=======([\s\S]*?)>>>>>>> UPDATED/g;
        let match;
        let replacements = 0;
        while ((match = blockRegex.exec(replaceBlocks)) !== null) {
            const original = match[1].trim();
            const final = match[2].trim();
            // Find the original code in the file
            const originalIndex = updatedContent.indexOf(original);
            if (originalIndex === -1) {
                continue; // skip if not found
            }
            // Replace only the first occurrence
            updatedContent = updatedContent.slice(0, originalIndex) + final + updatedContent.slice(originalIndex + original.length);
            replacements++;
        }
        if (replacements > 0) {
            await this.editFile(uri, updatedContent);
            return `Applied ${replacements} search/replace block(s) to ${uri.fsPath}`;
        } else {
            return `No matching blocks found in ${uri.fsPath}`;
        }
    }

    /**
     * Gets all registered tools.
     */
    getTools(): Map<string, IToolContribution> {
        return this._tools;
    }

    /**
     * Gets a specific tool by name.
     */
    getTool(name: string): IToolContribution | undefined {
        return this._tools.get(name);
    }

    /**
     * Disposes of the tools and their resources.
     */
    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        logger.info('Agent tools disposed');
    }
}
