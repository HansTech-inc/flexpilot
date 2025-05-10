/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interface representing a session entry in the session history.
 */
export interface ISessionHistoryEntry {
	/**
	 * Unique identifier for the session
	 */
	id: string;

	/**
	 * Timestamp when the session was created
	 */
	timestamp: number;

	/**
	 * Type of session (e.g., "editing", "chat")
	 */
	type: 'editing' | 'chat';

	/**
	 * User prompt/request that initiated the session
	 */
	request: string;

	/**
	 * Generated response from the model
	 */
	response: string;

	/**
	 * Whether the session included file modifications
	 */
	isFileModification: boolean;

	/**
	 * List of files that were modified during this session
	 */
	modifiedFiles?: string[];

	/**
	 * Model ID used for this session
	 */
	modelId?: string;

	/**
	 * Additional metadata related to the session
	 */
	metadata?: Record<string, any>;
}
