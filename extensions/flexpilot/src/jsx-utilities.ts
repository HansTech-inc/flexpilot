import * as vscode from 'vscode';

/**
 * Represents a chat message with role and content
 */
export interface Message {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Code block component for syntax highlighting
 */
export interface Code {
    language: string;
    children: string;
}

/**
 * Converts JSX message to chat message format
 */
export function jsxToChatMessage(message: Message): vscode.LanguageModelChatMessage {
    return message.role === 'user'
        ? vscode.LanguageModelChatMessage.User(message.content)
        : vscode.LanguageModelChatMessage.Assistant(message.content);
}

/**
 * Converts JSX to Markdown format
 */
export function jsxToMarkdown(message: Message): vscode.MarkdownString {
    return new vscode.MarkdownString(message.content);
}
