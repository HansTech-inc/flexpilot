/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logger } from '../logger';
import { AgentTools } from './agent-tools';

/**
 * Represents a step in the agent's workflow.
 */
interface WorkflowStep {
    type: 'explore' | 'analyze' | 'plan' | 'execute' | 'verify';
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    result?: unknown;
    toolUsed?: string;
}

/**
 * Represents the result of file analysis.
 */
interface FileAnalysisResult {
    uri: vscode.Uri;
    content: string;
}

/**
 * Represents the result of file verification.
 */
interface FileVerificationResult {
    uri: vscode.Uri;
    diagnostics: vscode.Diagnostic[];
}

/**
 * Manages the autonomous workflow of the Agent Mode.
 */
export class AgentWorkflow implements vscode.Disposable {
    private readonly _tools: AgentTools;
    private readonly _disposables: vscode.Disposable[] = [];
    private _currentWorkflow: WorkflowStep[] = [];

    constructor(tools: AgentTools) {
        this._tools = tools;
        logger.info('Agent workflow initialized');
    }

    /**
     * Handles incoming chat requests and manages the workflow.
     * Now supports multi-step, dynamic tool chaining for autonomous workflows.
     */
    async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        progress: vscode.Progress<vscode.ChatResponseFragment>,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        try {
            this._currentWorkflow = [];
            // --- Simple Planner: Map intent to tool chain ---
            // For demonstration, we'll use a basic rule-based planner.
            // In production, this could be LLM-driven or more sophisticated.
            const prompt = request.prompt.toLowerCase();
            let steps: WorkflowStep[] = [];
            let intermediateResults: any = {};

            // Example: If prompt mentions 'list files', 'directory', or 'tree', use getDirTree
            if (/list files|directory|tree/.test(prompt)) {
                steps.push({
                    type: 'explore',
                    description: 'Getting directory tree',
                    status: 'pending',
                    toolUsed: 'getDirTree'
                });
            }
            // Example: If prompt mentions 'search', use searchForFiles
            if (/search|find file/.test(prompt)) {
                steps.push({
                    type: 'explore',
                    description: 'Searching for files',
                    status: 'pending',
                    toolUsed: 'searchForFiles'
                });
            }
            // Example: If prompt mentions 'read', 'analyze', or 'content', use readFile
            if (/read|analyze|content/.test(prompt)) {
                steps.push({
                    type: 'analyze',
                    description: 'Reading file contents',
                    status: 'pending',
                    toolUsed: 'readFile'
                });
            }
            // Example: If prompt mentions 'symbol', 'function', or 'class', use listSymbolsInFile
            if (/symbol|function|class/.test(prompt)) {
                steps.push({
                    type: 'analyze',
                    description: 'Listing symbols in file',
                    status: 'pending',
                    toolUsed: 'listSymbolsInFile'
                });
            }
            // Example: If prompt mentions 'edit', 'modify', or 'change', use editFile
            if (/edit|modify|change/.test(prompt)) {
                steps.push({
                    type: 'execute',
                    description: 'Editing file',
                    status: 'pending',
                    toolUsed: 'editFile'
                });
            }
            // Example: If prompt mentions 'rewrite', use rewriteFile
            if (/rewrite|replace all/.test(prompt)) {
                steps.push({
                    type: 'execute',
                    description: 'Rewriting file',
                    status: 'pending',
                    toolUsed: 'rewriteFile'
                });
            }
            // Fallback: If no steps, just do a directory tree and file read
            if (steps.length === 0) {
                steps = [
                    { type: 'explore', description: 'Getting directory tree', status: 'pending', toolUsed: 'getDirTree' },
                    { type: 'analyze', description: 'Reading file contents', status: 'pending', toolUsed: 'readFile' }
                ];
            }

            // --- Execute Steps ---
            for (const step of steps) {
                if (token.isCancellationRequested) {
                    return { errorDetails: { message: 'Operation cancelled' } };
                }
                let result: any = undefined;
                switch (step.toolUsed) {
                    case 'getDirTree':
                        result = await this._tools.getDirTree();
                        intermediateResults.dirTree = result;
                        break;
                    case 'searchForFiles':
                        // Use a generic pattern for demonstration
                        result = await this._tools.searchForFiles('**/*');
                        intermediateResults.files = result;
                        break;
                    case 'readFile':
                        // Read the first file found, or a sample file
                        let fileToRead = intermediateResults.files?.[0] || (vscode.workspace.workspaceFolders?.[0]?.uri);
                        if (fileToRead) {
                            result = await this._tools.readFile(fileToRead);
                        } else {
                            result = 'No file found to read.';
                        }
                        intermediateResults.fileContent = result;
                        break;
                    case 'listSymbolsInFile':
                        // List symbols in the first file found
                        let fileForSymbols = intermediateResults.files?.[0] || (vscode.workspace.workspaceFolders?.[0]?.uri);
                        if (fileForSymbols) {
                            result = await this._tools.listSymbolsInFile(fileForSymbols);
                        } else {
                            result = 'No file found for symbol listing.';
                        }
                        intermediateResults.symbols = result;
                        break;
                    case 'editFile':
                        // For demo, just append a comment to the first file
                        let fileToEdit = intermediateResults.files?.[0] || (vscode.workspace.workspaceFolders?.[0]?.uri);
                        if (fileToEdit) {
                            const content = await this._tools.readFile(fileToEdit);
                            const newContent = content + '\n// Edited by Flexpilot Agent\n';
                            await this._tools.editFile(fileToEdit, newContent);
                            result = 'File edited.';
                        } else {
                            result = 'No file found to edit.';
                        }
                        break;
                    case 'rewriteFile':
                        // For demo, replace content of the first file
                        let fileToRewrite = intermediateResults.files?.[0] || (vscode.workspace.workspaceFolders?.[0]?.uri);
                        if (fileToRewrite) {
                            await this._tools.rewriteFile(fileToRewrite, '// Rewritten by Flexpilot Agent\n');
                            result = 'File rewritten.';
                        } else {
                            result = 'No file found to rewrite.';
                        }
                        break;
                    default:
                        result = 'Tool not implemented in workflow.';
                }
                step.result = result;
                step.status = 'completed';
                // Report progress for each step
                const message = [
                    `### ${step.description}`,
                    step.toolUsed ? `Using tool: \`${step.toolUsed}\`` : '',
                    step.result ? '```json\n' + JSON.stringify(step.result, null, 2) + '\n```' : ''
                ].filter(Boolean).join('\n\n');
                progress.report({ markdown: message });
            }

            return {
                errorDetails: undefined,
                metadata: {
                    workflow: steps
                }
            };
        } catch (error) {
            logger.error('Error in agent workflow:', error);
            return {
                errorDetails: {
                    message: 'An error occurred while processing your request'
                }
            };
        }
    }

    /**
     * Disposes of the workflow and its resources.
     */
    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        logger.info('Agent workflow disposed');
    }
}
