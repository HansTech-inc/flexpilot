/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { ISessionHistoryEntry } from '../types/session';
import { SessionHistoryManager } from '../util/session-history-manager';
import { logger } from '../logger';

/**
 * Singleton to maintain a session history manager instance
 */
class SessionManager {
	private static _instance: SessionManager;
	private _historyManager?: SessionHistoryManager;

	private constructor() { }

	/**
	 * Get the singleton instance
	 */
	public static get instance(): SessionManager {
		if (!this._instance) {
			this._instance = new SessionManager();
		}
		return this._instance;
	}
	/**
	 * Initialize with extension context
	 */
	public static initialize(context: vscode.ExtensionContext): void {
		const instance = SessionManager.instance;
		if (!instance._historyManager) {
			instance._historyManager = new SessionHistoryManager(context);
			logger.info('Session manager initialized');
		}
	}
	/**
	 * Get the history manager
	 */
	public get historyManager(): SessionHistoryManager | undefined {
		return this._historyManager;
	}
	/**
	 * Save a session to history
	 */
	public static saveSession(
		type: 'editing' | 'chat',
		request: string,
		response: string,
		isFileModification: boolean,
		modifiedFiles: string[] = []
	): void {
		const instance = SessionManager.instance;
		if (!instance._historyManager) {
			logger.error('Cannot save session: Session manager not initialized');
			return;
		}
		try {
			const session: ISessionHistoryEntry = {
				id: uuidv4(),
				timestamp: Date.now(),
				type,
				request,
				response,
				isFileModification,
				modifiedFiles,
				modelId: vscode.workspace.getConfiguration().get<string>('flexpilot.editingSession.defaultModel')
			};

			instance._historyManager.addSession(session);
			logger.debug(`Session saved to history: ${session.id}`);
		} catch (error) {
			logger.error('Failed to save session to history:', error);
		}
	}
}

// Export the SessionManager class to allow for static method access
export default SessionManager;
