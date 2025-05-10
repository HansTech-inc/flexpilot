/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { logger } from './logger';
import { registerDisposable, setExtensionContext } from './context';
import { checkUpdateAvailable, setContext } from './utilities';
import { registerCheckInternetConnectionCommand } from './commands/check-connection';
import { handleGitHubFileSystemProvider } from './fs-provider';
import { registerVfsInfoMessageCommand } from './commands/vfs-info-message';
import { registerEditorVariable, registerSelectionVariable, registerTerminalLastCommandVariable, registerTerminalSelectionVariable } from './variables';
import { registerGithubSignInCommand } from './commands/github-sign-in';
import { registerStatusIconMenuCommand } from './commands/status-icon-menu';
import { registerConfigureModelCommand } from './commands/configure-model';
import { registerUsagePreferencesCommand } from './commands/usage-preferences';
import { registerCommitMessageCommand } from './commands/commit-message';
import { registerShowDiagnosticsCommand } from './commands/show-diagnostics';
import { SymbolCompletionProvider } from './providers/symbol-completion-provider';
import { SessionHistoryView } from './views/session-history-view';
import { ModelManagementProvider } from './providers/model-management-provider';
import { registerImportVSCodeSettingsAutoCommand } from './commands/import-vscode-settings';
import SessionManager from './interfaces/session-manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Activates the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
	// Initialize the SessionManager
	SessionManager.initialize(context);

	await setContext('isLoaded', false);
	await setContext('isNetworkConnected', true);
	await setContext('isLoggedIn', false);

	// Check for updates when the extension is activated
	checkUpdateAvailable();

	// set the extension context to the global context
	setExtensionContext(context);

	// Register the logger with the context
	registerDisposable(logger);
	logger.info('Activating Flexpilot extension');

	// --- AUTO-IMPORT VS CODE SETTINGS ON FIRST LAUNCH ---
	const globalState = context.globalState;
	const importFlag = 'flexpilot.didAutoImportVSCodeSettings';
	if (!globalState.get(importFlag)) {
		let settingsPath: string;
		const platform = process.platform;
		if (platform === 'win32') {
			settingsPath = path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json');
		} else if (platform === 'darwin') {
			settingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
		} else {
			settingsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
		}
		try {
			if (fs.existsSync(settingsPath)) {
				const settingsRaw = fs.readFileSync(settingsPath, 'utf-8');
				const settings = JSON.parse(settingsRaw);
				for (const [key, value] of Object.entries(settings)) {
					await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
				}
				await globalState.update(importFlag, true);
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Flexpilot: Failed to auto-import VS Code settings: ${err}`);
		}
	}

	// Register the commands
	registerCheckInternetConnectionCommand();
	registerGithubSignInCommand();
	registerUsagePreferencesCommand();
	registerConfigureModelCommand();
	registerStatusIconMenuCommand();
	registerVfsInfoMessageCommand();
	registerCommitMessageCommand();
	registerShowDiagnosticsCommand();
	registerImportVSCodeSettingsAutoCommand();

	// Register the variables
	registerEditorVariable();
	registerSelectionVariable();
	registerTerminalLastCommandVariable();
	registerTerminalSelectionVariable();

	// Register @-symbol completion provider
	const symbolCompletionProvider = new SymbolCompletionProvider();
	registerDisposable(
		vscode.languages.registerCompletionItemProvider(
			{ scheme: '*' }, // Register for all document schemes
			symbolCompletionProvider,
			'@' // Trigger character
		)
	);

	// Register Agent Mode capabilities
	await registerAgentMode();

	// Check the internet connection and activate
	vscode.commands.executeCommand('flexpilot.checkInternetConnection');

	// Check if the workspace is a GitHub workspace
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (
		(typeof navigator !== 'undefined' && navigator.userAgent.includes('Web')) &&
		workspaceFolder &&
		workspaceFolder.uri.scheme === 'web-fs' &&
		workspaceFolder.uri.authority === 'github'
	) {
		// Handle the GitHub file system provider
		logger.info('Handling GitHub file system provider');
		await handleGitHubFileSystemProvider(workspaceFolder.uri);
	}

	// Show the chat panel
	vscode.commands.executeCommand('workbench.action.chat.open');

	logger.info('Flexpilot extension initial activation complete');

	// Register the Session History View
	const historyManager = SessionManager.instance.historyManager;

	if (historyManager) {
		const sessionHistoryViewProvider = new SessionHistoryView(context.extensionUri, historyManager);
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(SessionHistoryView.viewId, sessionHistoryViewProvider)
		);
	} else {
		logger.error('Failed to register SessionHistoryView: history manager is not initialized');
	}

	// Register the command to open the Session History View
	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.openSessionHistory', () => {
			vscode.commands.executeCommand('workbench.view.extension.flexpilot-session-history');
		})
	);

	// Register model management provider
	const modelManagementProvider = new ModelManagementProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ModelManagementProvider.viewType,
			modelManagementProvider
		)
	);

	// Register command to open model management
	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.openModelManagement', () => {
			vscode.commands.executeCommand('workbench.view.extension.flexpilot-model-management');
		})
	);

	// Register the command to open settings
	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.openSettings', () => {
			const panel = vscode.window.createWebviewPanel(
				'flexpilotSettings',
				'AI Settings',
				vscode.ViewColumn.Active,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);
			const settingsHtmlPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'views', 'model-management.html');
			vscode.workspace.fs.readFile(settingsHtmlPath).then(buffer => {
				panel.webview.html = buffer.toString();
			});
		})
	);

	// Register session history commands
	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.clearSessionHistory', async () => {
			const historyManager = SessionManager.instance.historyManager;
			if (historyManager) {
				const result = await vscode.window.showWarningMessage(
					'Are you sure you want to clear all session history? This cannot be undone.',
					{ modal: true },
					'Clear All', 'Cancel'
				);

				if (result === 'Clear All') {
					historyManager.clearHistory();
					vscode.window.showInformationMessage('Session history cleared successfully');
				}
			} else {
				vscode.window.showErrorMessage('Failed to clear history: Session manager not initialized');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.exportSessionHistory', async () => {
			const historyManager = SessionManager.instance.historyManager;
			if (historyManager) {
				try {
					const sessions = historyManager.getSessions();
					const jsonData = JSON.stringify(sessions, null, 2);

					// Show save dialog to get file path
					const savePath = await vscode.window.showSaveDialog({
						filters: { 'JSON Files': ['json'] },
						defaultUri: vscode.Uri.file('flexpilot-session-history.json')
					});

					if (savePath) {
						await vscode.workspace.fs.writeFile(savePath, Buffer.from(jsonData, 'utf8'));
						vscode.window.showInformationMessage(`Session history exported to ${savePath.fsPath}`);
					}
				} catch (error) {
					logger.error('Failed to export session history:', error);
					vscode.window.showErrorMessage(`Failed to export session history: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			} else {
				vscode.window.showErrorMessage('Failed to export history: Session manager not initialized');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('flexpilot.filterSessionHistory', async () => {
			// Display a quick pick to select filter type
			const filterType = await vscode.window.showQuickPick(
				[
					{ label: 'All Sessions', description: 'Show all sessions', value: undefined },
					{ label: 'Chat Sessions', description: 'Show only chat sessions', value: 'chat' },
					{ label: 'Editing Sessions', description: 'Show only editing sessions', value: 'editing' },
					{ label: 'File Modifications', description: 'Show only sessions that modified files', value: 'fileModification' }
				],
				{
					placeHolder: 'Select session filter'
				}
			);

			if (filterType) {
				// We need to tell the webview to apply this filter
				// This will be handled by the webview provider
				vscode.commands.executeCommand('workbench.view.extension.flexpilot-session-history');
				// The filter selection is passed to the webview via a command
				setTimeout(() => {
					const params = filterType.value ? {
						type: filterType.value === 'fileModification' ? undefined : filterType.value,
						isFileModification: filterType.value === 'fileModification'
					} : {};
					vscode.commands.executeCommand('flexpilot.sessionHistoryView.applyFilter', params);
				}, 500);
			}
		})
	);

	// Set the extension as loaded
	await setContext('isLoaded', true);
}
