// This file will define the view for the session history tab.

import * as vscode from 'vscode';
import { SessionHistoryManager } from '../util/session-history-manager';
import { ISessionHistoryEntry } from '../types/session';
import { logger } from '../logger';

export class SessionHistoryView implements vscode.WebviewViewProvider {

    public static readonly viewId = 'flexpilot.sessionHistoryView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly sessionHistoryManager: SessionHistoryManager
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Register command to apply filter from outside
        const disposable = vscode.commands.registerCommand('flexpilot.sessionHistoryView.applyFilter', (filter: any) => {
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'filterSessions',
                    filter: filter || {}
                });
            }
        });

        // Make sure to dispose command when view is disposed
        webviewView.onDidDispose(() => {
            disposable.dispose();
        });

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            try {
                switch (data.type) {
                    case 'loadSessions':
                        const sessions = this.sessionHistoryManager.getSessions();
                        this._view?.webview.postMessage({ type: 'showSessions', sessions });
                        break;
                    case 'openSession':
                        await this.openSession(data.sessionId);
                        break;
                    case 'deleteSession':
                        if (await this.confirmDelete()) {
                            this.sessionHistoryManager.deleteSession(data.sessionId);
                            // Refresh the session list
                            const updatedSessions = this.sessionHistoryManager.getSessions();
                            this._view?.webview.postMessage({ type: 'showSessions', sessions: updatedSessions });
                        }
                        break;
                    case 'clearHistory':
                        if (await this.confirmClearAll()) {
                            this.sessionHistoryManager.clearHistory();
                            // Refresh the session list
                            this._view?.webview.postMessage({ type: 'showSessions', sessions: [] });
                        }
                        break;
                    case 'filterSessions':
                        const filteredSessions = this.sessionHistoryManager.getSessions({
                            type: data.filter.type
                        });
                        this._view?.webview.postMessage({ type: 'showSessions', sessions: filteredSessions });
                        break;
                }
            } catch (error) {
                logger.error('Error in session history view:', error);
                vscode.window.showErrorMessage(`Session history error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }

    /**
     * Open a session from history in the appropriate interface
     */
    private async openSession(sessionId: string): Promise<void> {
        try {
            const session = this.sessionHistoryManager.getSessionById(sessionId);

            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            // Open the right panel based on session type
            if (session.type === 'editing') {
                // Open the editing session interface
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    extensionId: 'flexpilot.editing.session',
                    text: session.request
                });
            } else {
                // Open the regular chat interface
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    extensionId: 'flexpilot.panel.default',
                    text: session.request
                });
            }

            vscode.window.showInformationMessage(`Session "${session.request.substring(0, 30)}..." loaded`);
        } catch (error) {
            logger.error('Error opening session:', error);
            vscode.window.showErrorMessage(`Failed to open session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async confirmDelete(): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this session?',
            { modal: true },
            'Delete', 'Cancel'
        );
        return result === 'Delete';
    }

    private async confirmClearAll(): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all session history? This cannot be undone.',
            { modal: true },
            'Clear All', 'Cancel'
        );
        return result === 'Clear All';
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Return HTML content for the webview
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Session History</title>
                <style>
                    :root {
                        --container-padding: 20px;
                        --input-padding-vertical: 6px;
                        --input-padding-horizontal: 4px;
                        --input-margin-vertical: 4px;
                        --input-margin-horizontal: 0;
                    }

                    body {
                        padding: 0 var(--container-padding);
                        color: var(--vscode-foreground);
                        font-size: var(--vscode-font-size);
                        font-weight: var(--vscode-font-weight);
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-editor-background);
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .controls {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 15px;
                    }

                    select {
                        background-color: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        border: 1px solid var(--vscode-dropdown-border);
                        padding: 2px 6px;
                    }

                    button {
                        padding: 2px 8px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        cursor: pointer;
                    }

                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    .session-item {
                        padding: 8px;
                        margin-bottom: 8px;
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 4px;
                        cursor: pointer;
                    }

                    .session-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }

                    .session-header {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 4px;
                    }

                    .session-title {
                        font-weight: bold;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        flex: 1;
                    }

                    .session-timestamp {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.8em;
                    }

                    .session-type {
                        display: inline-block;
                        padding: 2px 6px;
                        border-radius: 3px;
                        margin-right: 6px;
                        font-size: 0.8em;
                    }

                    .session-type-editing {
                        background-color: var(--vscode-editorInfo-background);
                        color: var(--vscode-editorInfo-foreground);
                    }

                    .session-type-chat {
                        background-color: var(--vscode-editorHint-background);
                        color: var(--vscode-editorHint-foreground);
                    }

                    .session-actions {
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 6px;
                    }

                    .session-action {
                        margin-left: 6px;
                        padding: 2px 6px;
                        font-size: 0.8em;
                    }

                    .empty-state {
                        text-align: center;
                        margin-top: 40px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .session-prompt {
                        color: var(--vscode-descriptionForeground);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        margin-bottom: 5px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Session History</h2>
                </div>

                <div class="controls">
                    <select id="filter-type">
                        <option value="all">All Sessions</option>
                        <option value="chat">Chat Only</option>
                        <option value="editing">Editing Only</option>
                    </select>
                    <button id="clear-history">Clear All</button>
                </div>

                <div id="session-list"></div>

                <script>
                    const vscode = acquireVsCodeApi();

                    // Initialize UI and events
                    document.addEventListener('DOMContentLoaded', () => {
                        // Setup filter change handler
                        document.getElementById('filter-type').addEventListener('change', (e) => {
                            const filterType = e.target.value;
                            vscode.postMessage({
                                type: 'filterSessions',
                                filter: {
                                    type: filterType === 'all' ? undefined : filterType
                                }
                            });
                        });

                        // Setup clear history button
                        document.getElementById('clear-history').addEventListener('click', () => {
                            vscode.postMessage({ type: 'clearHistory' });
                        });
                    });

                    // Load sessions when the view is ready
                    window.addEventListener('load', () => {
                        vscode.postMessage({ type: 'loadSessions' });
                    });

                    // Format date for display
                    function formatDate(timestamp) {
                        const date = new Date(timestamp);
                        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                    }

                    // Display sessions in the UI
                    function displaySessions(sessions) {
                        const sessionList = document.getElementById('session-list');
                        sessionList.innerHTML = '';

                        if (!sessions || sessions.length === 0) {
                            sessionList.innerHTML = '<div class="empty-state">No sessions found</div>';
                            return;
                        }

                        sessions.forEach(session => {
                            const sessionItem = document.createElement('div');
                            sessionItem.className = 'session-item';

                            // Create header with title and timestamp
                            const sessionHeader = document.createElement('div');
                            sessionHeader.className = 'session-header';

                            const sessionTitle = document.createElement('span');
                            sessionTitle.className = 'session-title';
                            sessionTitle.textContent = session.request.substring(0, 50) + (session.request.length > 50 ? '...' : '');

                            const sessionTime = document.createElement('span');
                            sessionTime.className = 'session-timestamp';
                            sessionTime.textContent = formatDate(session.timestamp);

                            sessionHeader.appendChild(sessionTitle);
                            sessionHeader.appendChild(sessionTime);
                            sessionItem.appendChild(sessionHeader);

                            // Type badge
                            const typeContainer = document.createElement('div');
                            const typeEl = document.createElement('span');
                            typeEl.className = 'session-type session-type-' + session.type;
                            typeEl.textContent = session.type;
                            typeContainer.appendChild(typeEl);

                            if (session.isFileModification) {
                                const fileModBadge = document.createElement('span');
                                fileModBadge.className = 'session-type';
                                fileModBadge.style.backgroundColor = 'var(--vscode-terminal-ansiGreen)';
                                fileModBadge.textContent = 'File Changes';
                                typeContainer.appendChild(fileModBadge);
                            }

                            sessionItem.appendChild(typeContainer);

                            // Prompt preview
                            const promptPreview = document.createElement('div');
                            promptPreview.className = 'session-prompt';
                            promptPreview.textContent = session.request;
                            sessionItem.appendChild(promptPreview);

                            // Action buttons
                            const actions = document.createElement('div');
                            actions.className = 'session-actions';

                            const openBtn = document.createElement('button');
                            openBtn.className = 'session-action';
                            openBtn.textContent = 'Open';
                            openBtn.onclick = (e) => {
                                e.stopPropagation();
                                vscode.postMessage({ type: 'openSession', sessionId: session.id });
                            };

                            const deleteBtn = document.createElement('button');
                            deleteBtn.className = 'session-action';
                            deleteBtn.textContent = 'Delete';
                            deleteBtn.onclick = (e) => {
                                e.stopPropagation();
                                vscode.postMessage({ type: 'deleteSession', sessionId: session.id });
                            };

                            actions.appendChild(openBtn);
                            actions.appendChild(deleteBtn);
                            sessionItem.appendChild(actions);

                            // Make the whole item clickable to open
                            sessionItem.addEventListener('click', () => {
                                vscode.postMessage({ type: 'openSession', sessionId: session.id });
                            });

                            sessionList.appendChild(sessionItem);
                        });
                    }

                    // Listen for messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'showSessions':
                                displaySessions(message.sessions);
                                break;
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
