/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logger } from '../logger';
import { registerDisposable } from '../context';
import { AgentModeProvider } from '../providers/agent-mode-provider';

// The agent mode provider instance
let agentModeProvider: AgentModeProvider | undefined;

/**
 * Registers the agent mode provider for the extension.
 */
export const register = async () => {
	// Dispose of the existing provider if it exists
	await agentModeProvider?.dispose();

	// Create and register the new agent mode provider
	agentModeProvider = new AgentModeProvider();
	registerDisposable(agentModeProvider);
	logger.info('Agent mode provider registered');
};

/**
 * Disposes of the agent mode provider.
 */
export const dispose = async () => {
	await agentModeProvider?.dispose();
	agentModeProvider = undefined;
	logger.info('Agent mode provider disposed');
};
