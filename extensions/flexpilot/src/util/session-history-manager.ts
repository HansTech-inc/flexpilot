// This file will manage the storage and retrieval of chat and editing sessions.

import * as vscode from 'vscode';
import { ISessionHistoryEntry } from '../types/session';

const SESSION_HISTORY_KEY = 'flexpilot.sessionHistory';
const MAX_SESSIONS = 100; // Maximum number of sessions to store

export class SessionHistoryManager {
    private _sessions: ISessionHistoryEntry[];

    constructor(private context: vscode.ExtensionContext) {
        // Load sessions from global state
        this._sessions = this.context.globalState.get<ISessionHistoryEntry[]>(SESSION_HISTORY_KEY, []);
    }

    /**
     * Adds a new session to the history
     * @param session The session to add
     */
    addSession(session: ISessionHistoryEntry): void {
        // Add session to the beginning of the array (newest first)
        this._sessions.unshift(session);

        // Trim the history if it exceeds the maximum number of sessions
        if (this._sessions.length > MAX_SESSIONS) {
            this._sessions = this._sessions.slice(0, MAX_SESSIONS);
        }

        this._saveSessions();
    }

    /**
     * Gets all sessions, optionally filtered by criteria
     * @param filter Optional filter criteria
     * @returns Array of matching sessions
     */
    getSessions(filter?: Partial<ISessionHistoryEntry>): ISessionHistoryEntry[] {
        // If no filter, return all sessions
        if (!filter) {
            return this._sessions;
        }

        // Filter sessions based on provided criteria
        return this._sessions.filter(session => {
            for (const [key, value] of Object.entries(filter)) {
                // Skip undefined filter values
                if (value === undefined) {
                    continue;
                }

                // If any filter criterion doesn't match, exclude this session
                if (session[key as keyof ISessionHistoryEntry] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Get a specific session by its ID
     * @param id The session ID to look for
     * @returns The session if found, undefined otherwise
     */
    getSessionById(id: string): ISessionHistoryEntry | undefined {
        return this._sessions.find(session => session.id === id);
    }

    /**
     * Clear all session history
     */
    clearHistory(): void {
        this._sessions = [];
        this._saveSessions();
    }

    /**
     * Delete a specific session by its ID
     * @param id The ID of the session to delete
     * @returns true if deleted, false if not found
     */
    deleteSession(id: string): boolean {
        const initialLength = this._sessions.length;
        this._sessions = this._sessions.filter(session => session.id !== id);

        if (this._sessions.length !== initialLength) {
            this._saveSessions();
            return true;
        }
        return false;
    }

    /**
     * Save sessions to extension storage
     */
    private _saveSessions(): void {
        this.context.globalState.update(SESSION_HISTORY_KEY, this._sessions);
    }
}
