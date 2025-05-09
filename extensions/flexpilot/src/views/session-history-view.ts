// This file will define the view for the session history tab.

import * as vscode from 'vscode';
import { SessionHistoryManager } from '../util/session-history-manager';

export class SessionHistoryView implements vscode.WebviewViewProvider {

    public static readonly viewId = 'flexpilot.sessionHistoryView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly sessionHistoryManager: SessionHistoryManager // Add SessionHistoryManager here
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

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'loadSessions':
                    const sessions = this.sessionHistoryManager.getSessions();
                    this._view?.webview.postMessage({ type: 'showSessions', sessions });
                    break;
                case 'openSession':
                    // TODO: Implement logic to open a specific session
                    console.log(`Attempting to open session: ${data.sessionId}`);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Return HTML content for the webview
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Session History</title>
            </head>
            <body>
                <h1>Session History</h1>
                <div id="session-list"></div>
                <script>
                    const vscode = acquireVsCodeApi();

                    // Load sessions when the view is ready
                    window.addEventListener('load', () => {
                        vscode.postMessage({ type: 'loadSessions' });
                    });

                    // Example function to display sessions
                    function displaySessions(sessions) {
                        const sessionList = document.getElementById('session-list');
                        sessionList.innerHTML = ''; // Clear current list
                        sessions.forEach(session => {
                            const sessionElement = document.createElement('div');
                            sessionElement.textContent = \`Session ID: \${session.id}\`; // Customize display
                            sessionElement.addEventListener('click', () => {
                                vscode.postMessage({ type: 'openSession', sessionId: session.id });
                            });
                            sessionList.appendChild(sessionElement);
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
