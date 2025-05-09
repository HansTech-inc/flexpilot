/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logger } from '../logger';
import { AgentTools } from './agent-tools';
import { AgentWorkflow } from './agent-workflow';

/**
 * Provides the core functionality for Agent Mode.
 */
export class AgentModeProvider implements vscode.Disposable {
    private readonly _tools: AgentTools;
    private readonly _workflow: AgentWorkflow;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._tools = new AgentTools();
        this._workflow = new AgentWorkflow(this._tools);

        // Register the agent mode chat participant
        this._disposables.push(
            vscode.chat.registerChatParticipant('flexpilot.agent', {
                name: 'FlexPilot Agent',
                description: 'Autonomous AI coding agent that independently explores, plans, and executes complex codebase changes',
                fullName: 'FlexPilot Agent Mode',
                iconPath: new vscode.ThemeIcon('sparkle'),
                isDefault: true,
                supportIssueReporting: true,
                handle: async (request: vscode.ChatRequest, context: vscode.ChatContext, progress: vscode.Progress<vscode.ChatResponseFragment>, token: vscode.CancellationToken): Promise<vscode.ChatResult> => {
                    return this._workflow.handleChatRequest(request, context, progress, token);
                }
            })
        );

        logger.info('Agent mode provider initialized');
    }

    /**
     * Disposes of the provider and its resources.
     */
    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._tools.dispose();
        this._workflow.dispose();
        logger.info('Agent mode provider disposed');
    }
}
