/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	jsxToChatMessage,
	jsxToMarkdown,
} from './jsx-utilities';
import { resolveVariablesToCoreMessages } from '../variables';
import { AgentTools } from '../providers/agent-tools';
import { ChatMessage, ChatRole, Feedback, PanelMode } from '../types';
import * as React from 'react';
import { ReactNode, CSSProperties } from 'react';

/**
 * Generates the welcome message for the user in the chat panel.
 */
export const getWelcomeMessage = (modelName?: string): vscode.MarkdownString => {
	const modelDisplayName = modelName || 'current model';
	const content = `Welcome to Flexpilot! I'm your AI assistant, powered by ${modelDisplayName}. How can I help you today?`;
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '', // jsxToChatMessage will use children
		customRender: true,
		children: `<div>${content}</div>`
	});
};

/**
 * Builds the title provider request for the chat model based on the previous conversation
 */
export const buildTitleProviderRequest = (context: vscode.ChatContext): vscode.LanguageModelChatMessage[] => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Get the user prompt from the context history
	let prompt: string | undefined;
	if (context.history[0] instanceof vscode.ChatRequestTurn) {
		prompt = context.history[0].prompt;
	}

	// Get the response from the context history
	const responseParts: string[] = [];
	if (context.history[1] instanceof vscode.ChatResponseTurn) {
		context.history[1].response.forEach((item) => {
			if (item instanceof vscode.ChatResponseMarkdownPart) {
				responseParts.push(item.value.value);
			}
		});
	}
	const response = responseParts ? responseParts.join('\n') : undefined;

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({
			children: `<div>
				<h2>Important Instructions</h2>
				<ul>
					<li>
						You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>the current</strong> operating system, assisting a fellow developer in <strong>crafting a perfect title for a chat conversation</strong>.
					</li>
					<li>
						You must provide a <strong>concise title</strong> that encapsulates the main topic of the chat dialogue in <strong>under 10 words in a single sentence.</strong>
					</li>
					<li>
						<strong>Very Important: Strictly follow below response format in the output</strong>
					</li>
				</ul>
				<h2>Response Format:</h2>
				<pre>&lt;chat-summary-title&gt;Perfect title for the chat conversation&lt;/chat-summary-title&gt;</pre>

				<h2>Example Responses</h2>
				<pre>&lt;chat-summary-title&gt;Optimizing SQL query performance&lt;/chat-summary-title&gt;</pre>
				<pre>&lt;chat-summary-title&gt;Debugging memory leaks in C++ applications&lt;/chat-summary-title&gt;</pre>
				<pre>&lt;chat-summary-title&gt;Configuring Kubernetes ingress controllers&lt;/chat-summary-title&gt;</pre>
				<pre>&lt;chat-summary-title&gt;Implementing JWT authentication in Node.js&lt;/chat-summary-title&gt;</pre>
			</div>`,
			role: 'system'
		})
	);

	messages.push(
		jsxToChatMessage({
			children: '<div>Provide a concise title for the below chat conversation that encapsulates the main topic discussed. It must be under 10 words in a single sentence and strictly follow response format</div>',
			role: 'user'
		})
	);

	messages.push(
		jsxToChatMessage({
			children: `<div>
				<h3>Chat Conversation</h3>
				<ul>
					${prompt ? `
						<li>
							<strong>User:</strong> ${prompt}
						</li>
					` : ''}
					${response ? `
						<li>
							<strong>Assistant:</strong> ${response}
						</li>
					` : ''}
				</ul>
			</div>`,
			role: 'user'
		})
	);

	// Return the generated messages array for the chat model
	return messages;
};

/**
 * Builds the follow-up provider request for the chat model based on the previous conversation
 */
export const buildFollowupProviderRequest = (
	result: vscode.ChatResult,
	context: vscode.ChatContext
): vscode.LanguageModelChatMessage[] => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({
			children: `<div>
				<h2>Important Instructions</h2>
				<ul>
					<li>
						You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>the current</strong> operating system, assisting a fellow developer in <strong>crafting follow-up question</strong> for the current chat conversation.
					</li>
					<li>
						You must provide a <strong>short, one-sentence question</strong> that the <strong>user can ask naturally</strong> that follows from the previous few questions and answers. The question must be <strong>under 10 words</strong> or fewer and in a <strong>single line.</strong>
					</li>
					<li>
						<strong>Very Important: Strictly follow below response format in the output</strong>
					</li>
				</ul>
				<h2>Response Format:</h2>
				<pre>&lt;follow-up-question&gt;Short follow-up question&lt;/follow-up-question&gt;</pre>

				<h2>Example Responses</h2>
				<pre>&lt;follow-up-question&gt;How can I optimize this SQL query?&lt;/follow-up-question&gt;</pre>
				<pre>&lt;follow-up-question&gt;What are the best practices for using Docker?&lt;/follow-up-question&gt;</pre>
				<pre>&lt;follow-up-question&gt;How can I improve the performance of my React app?&lt;/follow-up-question&gt;</pre>
				<pre>&lt;follow-up-question&gt;What are the common pitfalls of using Node.js?&lt;/follow-up-question&gt;</pre>
			</div>`,
			role: 'system'
		})
	);

	// Add the user prompt from the context history to the messages array
	context.history.forEach((item) => {
		if (item instanceof vscode.ChatResponseTurn && item.result.metadata) {
			if (item.result.metadata.request) {
				messages.push(
					vscode.LanguageModelChatMessage.User(item.result.metadata.request)
				);
			}
			if (item.result.metadata.response) {
				messages.push(
					vscode.LanguageModelChatMessage.Assistant(item.result.metadata.response)
				);
			}
		}
	});

	// Add the user prompt for the latest response
	messages.push(vscode.LanguageModelChatMessage.User(result.metadata?.request));
	messages.push(
		vscode.LanguageModelChatMessage.Assistant(result.metadata?.response)
	);

	// Add the user prompt from the context history
	messages.push(
		jsxToChatMessage({
			children: '<div>Write a short (under 10 words) one-sentence follow up question that the user can ask naturally that follows from the previous few questions and answers.</div>',
			role: 'user'
		})
	);

	// Return the generated messages array for the chat model
	return messages;
};

export const buildRequest = async (
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	model: string,
	response: vscode.ChatResponseStream
): Promise<vscode.LanguageModelChatMessage[]> => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({
			children: `<div>
				<h1>Important Points</h1>
				<ul>
					<li>
						You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>the current</strong> operating system, assisting a fellow developer.
					</li>
					<li>Follow the user's requirements carefully & to the letter.</li>
					<li>Keep your answers short and impersonal.</li>
					<li>
						You are powered by <b>${model}</b> Large Language Model
					</li>
					<li>Use Markdown formatting in your answers.</li>
					<li>
						Make sure to include the programming language name at the start of the Markdown code blocks
					</li>
					<li><code>python\nprint('hello world')</code></li>
					<li>Avoid wrapping the whole response in triple backticks.</li>
					<li>
						The active file or document is the source code the user is looking at right now.
					</li>
				</ul>
			</div>`,
			role: 'system'
		})
	);

	// --- Web Search Context Injection ---
	const instructions: string[] = [];
	context.history.forEach((item) => {
		if ('prompt' in item && item.prompt) {
			instructions.push(item.prompt);
		}
	});
	instructions.push(request.prompt);

	const webRefInstruction = instructions.find(instr => /@web\b/i.test(instr));
	if (webRefInstruction) {
		const agentTools = new AgentTools();
		const webQuery = webRefInstruction.replace(/@web\b/gi, '').trim() || 'web search';
		try {
			const webResults = await agentTools.searchWebStructured(webQuery);
			// Compose a prompt for the LLM to synthesize a curated answer and cite sources
			const llmPrompt = `You are a smart assistant. Given the following web search results for the query: "${webQuery}", synthesize a clear, direct, and relevant answer. Use the extracted content to answer, and cite or link to the most relevant sources.\n\n` +
				webResults.map((r, i) => `Source [${i+1}]: ${r.title} (${r.url})\nContent: ${r.extractedContent}\n`).join('\n') +
			`\n---\nPlease write a concise answer to the query, referencing the sources as [1], [2], etc., where appropriate. Include links where helpful.`
			const llmResult = await vscode.commands.executeCommand<any>(
				'vscode.lm.chat.complete',
				[
					{ role: 'system', content: 'You are a helpful assistant that summarizes web search results and always cites sources.' },
					{ role: 'user', content: llmPrompt }
				],
				{ model: undefined, maxTokens: 512, temperature: 0.2 }
			);
			const summary = llmResult?.choices?.[0]?.message?.content || '[Failed to summarize with LLM]';
			// Add the summary and citations as a system message
			const citations = webResults.map((r, i) => `[${i+1}] ${r.title} (${r.url})`).join('\n');
			messages.push(
				jsxToChatMessage({
					children: `<div>
						<h3>Web Search Context</h3>
						<p>${summary}</p>
						<p><strong>Citations:</strong><br/>${citations}</p>
					</div>`,
					role: 'system'
				})
			);
		} catch (err) {
			messages.push(
				jsxToChatMessage({
					children: `<div>Web search failed: ${String(err)}</div>`,
					role: 'system'
				})
			);
		}
	}

	// Add the chat history prompts to the messages array
	context.history.forEach((item) => {
		if ('prompt' in item && item.prompt) {
			messages.push(vscode.LanguageModelChatMessage.User(item.prompt));
		} else if (item instanceof vscode.ChatResponseTurn) {
			// Check if the response has metadata
			if (item.result.metadata?.response) {
				const message = item.result.metadata.response.trim();
				messages.push(vscode.LanguageModelChatMessage.Assistant(message));
			} else {
				// Loop through the response parts to get the markdown content
				const messageParts: string[] = [];
				for (const part of item.response) {
					if (part.value instanceof vscode.MarkdownString) {
						messageParts.push(part.value.value);
					}
				}
				if (messageParts.length > 0) {
					messages.push(
						vscode.LanguageModelChatMessage.Assistant(messageParts.join('\n\n').trim())
					);
				}
			}
		}
	});

	// Resolve variables to core messages
	const variables = await resolveVariablesToCoreMessages(request, response);
	variables.forEach((item) => messages.push(item));

	// Add the user prompt to the messages array
	messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

	// Return the generated messages array for the chat model
	return messages;
};

/**
 * PanelChatPrompt class handles the generation of prompts for panel chat functionality.
 */
export const panelChatPrompts = {
	/**
	 * Generates the help text prefix.
	 */
	getHelpTextPrefix(mode: PanelMode, modelName?: string): vscode.MarkdownString {
		const modelDisplayName = modelName || 'current model';
		let content;
		if (mode === PanelMode.EXPLAIN) {
			content = `### Explain Code
The current file and your selection will be sent to the ${modelDisplayName} for an explanation.`;
		} else if (mode === PanelMode.OPTIMIZE) {
			content = `### Optimize Code
The current file and your selection (if any) will be sent to the ${modelDisplayName} to be optimized. The model will respond with suggestions.`;
		} else if (mode === PanelMode.DOCS) {
			content = `### Generate Docs
The current file and your selection (if any) will be sent to the ${modelDisplayName} to generate documentation.`;
		} else { // default to CHAT
			content = `### Chat with ${modelDisplayName}
Ask any question or enter a command. Use \`/\` to see a list of commands.`;
		}
		return jsxToMarkdown({
			props: {},
			type: 'div',
			children: `<div>${content}</div>`
		});
	},
};

export const getProcessingMessage = () => {
	const content = 'Processing your request...';
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '',
		customRender: true,
		children: `<div>${content}</div>`,
		renderMarkdown: false // Explicitly false as it's a status message
	});
};

export const getErrorMessage = (errorMessage: string) => {
	const content = `Sorry, I encountered an error: ${errorMessage}`;
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '',
		customRender: true,
		children: `<div>${content}</div>`,
		renderMarkdown: false // Error messages are typically plain
	});
};

export const getInitialMessageForExistingChat = (modelName?: string, history?: ChatMessage[]) => {
	if (history && history.length > 0) {
		// If there's history, the last message usually serves as a good "initial" state.
		// Or, we could return a specific message indicating the chat is being continued.
		// For now, let's just return null and let the existing history render.
		return null;
	}
	const modelDisplayName = modelName || 'current model';
	const content = `Continuing your session with ${modelDisplayName}. What's next?`;
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '',
		customRender: true,
		children: `<div>${content}</div>`,
	});
};

export const getFeedbackMessage = (feedback: Feedback) => {
	let content = '';
	if (feedback === Feedback.POSITIVE) {
		content = 'Thanks for your feedback! I\'m glad I could help.';
	} else if (feedback === Feedback.NEGATIVE) {
		content = 'Thanks for your feedback! I\'ll try to do better next time.';
	} else {
		// No specific message for 'NONE' or other cases.
		return null;
	}
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '',
		customRender: true,
		children: `<div>${content}</div>`,
		renderMarkdown: false,
	});
};

export const getThinkingMessage = (): ChatMessage => {
	const content = '_Flexpilot is thinking..._';
	return jsxToChatMessage({
		role: ChatRole.ASSISTANT,
		content: '', // Content is from children
		customRender: true, // Uses a custom rendering logic, not direct markdown
		children: `<div>${content}</div>`,
		isLoading: true, // Special flag for UI to show loading indicator perhaps
		renderMarkdown: true // Allow markdown for italics
	});
};

export interface PanelProps {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
}

export const Panel: React.FC<PanelProps> = ({ children, className, style }) => {
	return (
		<div className={className} style={style}>
			{children}
		</div>
	);
};

export interface MessageProps {
	message: ChatMessage;
	feedback?: Feedback;
	onFeedback?: (feedback: Feedback) => void;
	children?: ReactNode;
}

export const Message: React.FC<MessageProps> = ({ children }) => {
	// ... rest of the component implementation
	return (
		<div className="message">
			{children}
		</div>
	);
};


