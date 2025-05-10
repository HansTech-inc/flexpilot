/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	Code,
	Message,
	jsxToChatMessage,
	jsxToMarkdown,
} from './jsx-utilities';
import { resolveVariablesToCoreMessages } from '../variables';
import { AgentTools } from '../providers/agent-tools';

// Minimal JSX namespace for TSX compatibility in non-React environments
// This allows TSX syntax for markdown/JSX-to-markdown utilities
declare global {
	namespace JSX {
		interface IntrinsicElements {
			[elemName: string]: any;
		}
	}
}

/**
 * Generates the welcome message for the user in the chat panel.
 */
export const getWelcomeMessage = (username: string): vscode.MarkdownString => {
	return jsxToMarkdown(
		{
			role: 'user',
			content: `
<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
  <span style="font-size: 2.2em;">🚀</span>
  <span style="font-weight: 700; font-size: 1.3em; color: #6C63FF;">Welcome, <b>@${username}</b>!</span>
</div>
<p style="font-size: 1.1em; color: #444;">
  I'm <b>Flexpilot</b> — your next-gen AI pair programmer.<br/>
  Ready to help you <b>code faster, smarter, and with confidence</b>.<br/>
  <span style="color: #6C63FF;">Ask me anything, or type <code>/</code> for commands.</span>
</p>
<ul style="margin-top: 10px; color: #888; font-size: 1em;">
  <li>✨ <b>Autonomous agent</b> for complex, multi-step tasks</li>
  <li>🔍 <b>Understands your codebase</b> and context</li>
  <li>🌐 <b>Web search</b> and <b>tool integration</b> built-in</li>
  <li>🧠 <b>Proactive suggestions</b> and <b>auto-fixes</b></li>
</ul>
<p style="margin-top: 12px; color: #6C63FF; font-weight: 600;">
  Let's build something amazing together!
</p>
`
		}
	);
};

/**
 * Builds the title provider request for the chat model based on the previous conversation
 */
export const buildTitleProviderRequest = (context: vscode.ChatContext) => {
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
		jsxToChatMessage({ role: 'system', content: `
<h2>Important Instructions</h2>
<ul>
	<li>
		You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>(typeof process !== 'undefined' && process.platform) ? process.platform : 'unknown'</strong> operating system, assisting a fellow developer in <strong>crafting a perfect title for a chat conversation</strong>.
	</li>
	<li>
		You must provide a <strong>concise title</strong> that encapsulates the main topic of the chat dialogue in <strong>under 10 words in a single sentence.</strong>
	</li>
	<li>
		<strong>Very Important: Strictly follow below response format in the output</strong>
	</li>
</ul>
<h2>Response Format:</h2>
<pre>
	{`<chat-summary-title>Perfect title for the chat conversation</chat-summary-title>`}
</pre>

<h2>Example Responses</h2>
<pre>
	{`<chat-summary-title>Optimizing SQL query performance</chat-summary-title>`}
</pre>
<pre>
	{`<chat-summary-title>Debugging memory leaks in C++ applications</chat-summary-title>`}
</pre>
<pre>
	{`<chat-summary-title>Configuring Kubernetes ingress controllers</chat-summary-title>`}
</pre>
<pre>
	{`<chat-summary-title>Implementing JWT authentication in Node.js</chat-summary-title>`}
</pre>
` })
	);

	// Add the user prompt from the context history
	messages.push(
		jsxToChatMessage({ role: 'user', content: `
Provide a concise title for the below chat conversation that encapsulates the main topic discussed. It must be under 10 words in a single sentence and strictly follow response format
` })
	);

	// Add the user prompt from the context history
	messages.push(
		jsxToChatMessage({ role: 'user', content: `
<h3>Chat Conversation</h3>
<ul>
	{prompt && (
		<li>
			<strong>User:</strong> {prompt}
		</li>
	)}
	{response && (
		<li>
			<strong>Assistant:</strong> {response}
		</li>
	)}
</ul>
` })
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
) => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({ role: 'system', content: `
<h2>Important Instructions</h2>
<ul>
	<li>
		You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>(typeof process !== 'undefined' && process.platform) ? process.platform : 'unknown'</strong> operating system, assisting a fellow developer in <strong>crafting follow-up question</strong> for the current chat conversation.
	</li>
	<li>
		You must provide a <strong>short, one-sentence question</strong> that the <strong>user can ask naturally</strong> that follows from the previous few questions and answers. The question must be <strong>under 10 words</strong> or fewer and in a <strong>single line.</strong>
	</li>
	<li>
		<strong>Very Important: Strictly follow below response format in the output</strong>
	</li>
</ul>
<h2>Response Format:</h2>
<pre>
	{`<follow-up-question>Short follow-up question</follow-up-question>`}
</pre>
<h2>Example Responses</h2>
<pre>
	{`<follow-up-question>How can I optimize this SQL query?</follow-up-question>`}
</pre>
<pre>
	{`<follow-up-question>What are the best practices for using Docker?</follow-up-question>`}
</pre>
<pre>
	{`<follow-up-question>How can I improve the performance of my React app?</follow-up-question>`}
</pre>
<pre>
	{`<follow-up-question>What are the common pitfalls of using Node.js?</follow-up-question>`}
</pre>
` })
	);

	// Add the user prompt from the context history to the messages array
	context.history.forEach((item) => {
		if (item instanceof vscode.ChatResponseTurn) {
			messages.push(
				vscode.LanguageModelChatMessage.User(item.result.metadata?.request)
			);
			messages.push(
				vscode.LanguageModelChatMessage.Assistant(
					item.result.metadata?.response
				)
			);
		}
	});

	// Add the user prompt for the latest response
	messages.push(vscode.LanguageModelChatMessage.User(result.metadata?.request));
	messages.push(
		vscode.LanguageModelChatMessage.Assistant(result.metadata?.response)
	);

	// Add the user prompt from the context history
	messages.push(
		jsxToChatMessage({ role: 'user', content: `
Write a short (under 10 words) one-sentence follow up question that the user can ask naturally that follows from the previous few questions and answers.
` })
	);

	// Return the generated messages array for the chat model
	return messages;
};

export const buildRequest = async (
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	model: string,
	response: vscode.ChatResponseStream
) => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({ role: 'system', content: `
<h1>Important Points</h1>
<ul>
	<li>
		You are an AI programming assistant and a skilled programmer named <strong>Flexpilot</strong>, who is <strong>working inside VS Code IDE</strong> in <strong>(typeof process !== 'undefined' && process.platform) ? process.platform : 'unknown'</strong> operating system, assisting a fellow developer.
	</li>
	<li>Follow the user's requirements carefully & to the letter.</li>
	<li>Keep your answers short and impersonal.</li>
	<li>
		You are powered by <b>{model}</b> Large Language Model
	</li>
	<li>Use Markdown formatting in your answers.</li>
	<li>
		Make sure to include the programming language name at the start of the Markdown code blocks like below
	</li>
	<Code language='python'>print('hello world')</Code>
	<li>Avoid wrapping the whole response in triple backticks.</li>
	<li>
		The active file or document is the source code the user is looking at right now.
	</li>
</ul>
` })
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
			`\n---\nPlease write a concise answer to the query, referencing the sources as [1], [2], etc., where appropriate. Include links where helpful.`;
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
				jsxToChatMessage({ role: 'system', content: `
<h3>Web Search Context</h3>
<p>${summary}</p>
<p><strong>Citations:</strong><br/>${citations}</p>
` })
			);
		} catch (err) {
			messages.push(
				jsxToChatMessage({ role: 'system', content: `
Web search failed: ${String(err)}
` })
			);
		}
	}

	// Add the chat history prompts to the messages array
	context.history.forEach((item) => {
		if ('prompt' in item) {
			return vscode.LanguageModelChatMessage.User(item.prompt);
		} else {
			// Check if the response has metadata
			if (item.result.metadata?.response?.trim()) {
				const message = item.result.metadata?.response?.trim();
				return vscode.LanguageModelChatMessage.Assistant(message);
			}

			// Loop through the response parts to get the markdown content
			const messageParts: string[] = [];
			for (const part of item.response) {
				if (part.value instanceof vscode.MarkdownString) {
					messageParts.push(part.value.value);
				}
			}

			// Check if the response has a `response` property
			return vscode.LanguageModelChatMessage.Assistant(
				messageParts.join('\n\n').trim()
			);
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
	getHelpTextPrefix(): vscode.MarkdownString {
		return jsxToMarkdown(
			{
				role: 'user',
				content: `
📚 Explore the Flexpilot IDE official documentation <a href='https://flexpilot.ai'>here</a> for all the details.
`
			}
		);
	},
};
