/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Message, jsxToChatMessage, jsxToMarkdown } from './jsx-utilities';
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
 * Generates the welcome message for the user in the editor session panel.
 */
export const getWelcomeMessage = (username: string): vscode.MarkdownString => {
	return jsxToMarkdown(
		{
			role: 'user',
			content: `
<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
  <span style="font-size: 2.2em;">🛠️</span>
  <span style="font-weight: 700; font-size: 1.3em; color: #6C63FF;">Welcome, <b>@${username}</b>!</span>
</div>
<p style="font-size: 1.1em; color: #444;">
  This is <b>Flexpilot Edit Session</b> — your <b>autonomous AI developer</b>.<br/>
  Define your <b>working set</b> and describe the changes you want.<br/>
  I'll plan, edit, and refactor your codebase <b>autonomously</b>.<br/>
  <span style="color: #6C63FF;">Ready for multi-file, multi-step, and complex refactors.</span>
</p>
<ul style="margin-top: 10px; color: #888; font-size: 1em;">
  <li>🤖 <b>Agentic autonomy</b> for end-to-end code changes</li>
  <li>🗂️ <b>Working set</b> for precise file control</li>
  <li>🔄 <b>Auto-verifies</b> and <b>auto-fixes</b> after edits</li>
  <li>📈 <b>Summarizes</b> all changes for you</li>
</ul>
<p style="margin-top: 12px; color: #6C63FF; font-weight: 600;">
  Let's supercharge your workflow!
</p>
`
		}
	);
};

/**
 * Builds the request for the editing session based on the context and request
 */
export const buildRequest = async (
	response: vscode.ChatResponseStream,
	context: vscode.ChatContext,
	request: vscode.ChatRequest
): Promise<vscode.LanguageModelChatMessage[]> => {
	// Initialize the messages array to store the generated messages
	const messages: vscode.LanguageModelChatMessage[] = [];

	// Initialize AgentTools
	const agentTools = new AgentTools();
	const availableTools = agentTools.getTools();

	// Extract instructions from the history and request to provide context
	const instructions: string[] = [];
	context.history.map((item) => {
		if ('prompt' in item && item.prompt) {
			instructions.push(item.prompt);
		}
	});
	instructions.push(request.prompt);

	// --- Web Search Context Injection ---
	// If any instruction contains @web, call the web search tool and prepend the result as a system message
	const webRefInstruction = instructions.find(instr => /@web\b/i.test(instr));
	if (webRefInstruction) {
		// Remove @web from the query for the search
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
				jsxToChatMessage({
					role: 'system',
					content: `<h3>Web Search Context</h3>\n<p>${summary}</p>\n<p><strong>Citations:</strong><br/>${citations}</p>`
				})
			);
		} catch (err) {
			messages.push(
				jsxToChatMessage({
					role: 'system',
					content: `Web search failed: ${String(err)}`
				})
			);
		}
	}

	// Add the system message with the role and context information
	messages.push(
		jsxToChatMessage({
			role: 'system',
			content: `
<h2><strong>Agent Mode: Autonomous AI Developer</strong></h2>
<ul>
  <li>You are an <strong>autonomous AI coding agent</strong> named <strong>Flexpilot</strong>, operating inside VS Code IDE on <strong>(typeof process !== 'undefined' && process.platform) ? process.platform : 'unknown'</strong>.</li>
  <li>You have <strong>full access to the entire codebase</strong> and are empowered to <strong>explore, create, edit, and delete any file or folder</strong> as needed to accomplish the user's request.</li>
  <li>You can <strong>autonomously plan and execute multi-step changes</strong> across the project, including searching, editing, creating files, running terminal commands, and using all available tools.</li>
  <li>You may <strong>search the codebase, documentation, and the web</strong> to gather context and inform your actions.</li>
  <li>You should <strong>break down complex tasks into manageable steps</strong>, plan your approach, and execute changes in sequence.</li>
  <li>After making changes, <strong>verify your results</strong> (e.g., by running tests, checking diagnostics, or reviewing code) and <strong>auto-fix issues</strong> if detected.</li>
  <li>Once the task is complete, <strong>summarize the changes you made</strong> for the user, including any new files, deleted files, or major refactors.</li>
  <li>You have access to the following tools, which you can call at any time using the format:
    <pre>&lt;tool-call&gt;
  &lt;tool-name&gt;toolName&lt;/tool-name&gt;
  &lt;tool-args&gt;
    {"arg1": "value1", "arg2": "value2"}
  &lt;/tool-args&gt;
&lt;/tool-call&gt;</pre>
  </li>
  <li>
    Available tools:
    <ul>
      ${Array.from(availableTools.entries()).map(([name, tool]) => `<li><strong>${tool.displayName}</strong>: ${tool.modelDescription}</li>`).join('')}
    </ul>
  </li>
  <li>
    <strong>Best Practices:</strong>
    <ul>
      <li>Be proactive and take initiative to solve the user's request end-to-end.</li>
      <li>Document your plan and reasoning as you go.</li>
      <li>Use checkpoints or summaries before and after major changes.</li>
      <li>Ask for clarification only if absolutely necessary.</li>
      <li>Always cite sources when using web search results.</li>
    </ul>
  </li>
  <li>
    <strong>Editing Methods:</strong>
    <ul>
      <li>
        You can edit files in two ways:
        <ol>
          <li><strong>Whole-file replace:</strong> Replace the entire content of a file (using <code>editFile</code> or <code>rewriteFile</code>).</li>
          <li><strong>Smart patch (SEARCH/REPLACE blocks):</strong> For precise, minimal edits, generate SEARCH/REPLACE blocks and use the <code>replaceInFile</code> tool. This is preferred for small or multi-location changes.</li>
        </ol>
      </li>
      <li>
        <strong>SEARCH/REPLACE block format:</strong>
        <pre>&lt;&lt;&lt;&lt;&lt;&lt;&lt; ORIGINAL
// ... original code ...
=======
// ... new code ...
&gt;&gt;&gt;&gt;&gt;&gt;&gt; UPDATED</pre>
        <ul>
          <li>Each block must match the original code exactly and replace it with the new code.</li>
          <li>Output only the blocks, no extra text.</li>
          <li>You may output multiple blocks for multiple changes in a file.</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>Prefer smart patch (SEARCH/REPLACE) edits for small, precise, or multi-location changes, as it is safer and easier to review.</li>
</ul>
<h2>Response Format</h2>
<p><strong>The response should follow below format strictly</strong></p>
<pre>
&lt;file-modification&gt;
	&lt;change-description&gt;
		Text description of why this particular test1.ts change was made
	&lt;/change-description&gt;
	&lt;complete-file-uri&gt;
		file:///exact/complete/path/to/file/test1.ts
	&lt;/complete-file-uri&gt;
	&lt;updated-file-content&gt;
import * as fs from 'fs';
	&lt;/updated-file-content&gt;
&lt;/file-modification&gt;

&lt;file-modification&gt;
	&lt;change-description&gt;
		Text description of why this particular test2.ts change was made
	&lt;/change-description&gt;
	&lt;complete-file-uri&gt;
		file:///exact/complete/path/to/file/test2.ts
	&lt;/complete-file-uri&gt;
	&lt;updated-file-content&gt;
import * as path from 'path';
	&lt;/updated-file-content&gt;
&lt;/file-modification&gt;
</pre>
    `
		})
	);

	// Resolve variables to core messages
	const variables = await resolveVariablesToCoreMessages(request, response);
	variables.forEach((item) => messages.push(item));

	// Extract working set files from the request
	const workingSet: vscode.Uri[] = [];
	for (const reference of request.references) {
		if (
			reference.modelDescription === 'edit-session:working-set' &&
			reference.value instanceof vscode.Uri
		) {
			workingSet.push(reference.value);
		}
	}

	// Add the user prompt message with the working set files and instructions
	messages.push(
		jsxToChatMessage(
			<Message role='user'>
				<p>
					Please make the necessary changes to the codebase based on the
					instructions provided below in the{' '}
					<strong>instructions section</strong>.
				</p>
				<h3>Working Set Files</h3>
				<ul>
					{workingSet.map((uri, index) => (
						<li key={index}>{uri.toString()}</li>
					))}
				</ul>
				<h3>Very Important Note</h3>
				<ul>
					<li>
						Ensure that the updated file content has proper indentation and
						formatting to maintain consistency with the codebase.
					</li>
					<li>
						When giving the updated file content, provide the
						<strong>exact code</strong> that can be replaced{' '}
						<strong>as it is</strong> with the whole content of the original
						file. <strong>Do not truncate or shorten the code</strong> by saying
						'rest of the code goes here' or 'existing code goes here' or 'rest
						of the code remains unchanged' or similar placeholders. It is
						important to include the full and exact code that needs to be
						replaced.
					</li>
					<li>
						Ensure that the file URI is in its full format, including the
						scheme, authority, and other components. For example:
						<strong>
							web-fs://github/folder/containing/script/src/index.ts
						</strong>
						Where <strong>web-fs</strong> is the scheme, <strong>github</strong>{' '}
						is the authority, and the rest is the path.{' '}
						<strong>
							This is important for properly identifying the file.
						</strong>
					</li>
					<li>
						<strong>
							You cannot create new files, delete files or change files outside
							of files mentioned in the working set.
						</strong>
						You can only modify files that are mentioned as part of the working
						set only. If you require a file that is not part of the working set,
						please ask the user to add it to the working set first, before
						moving forward.
					</li>
					<li>
						Strictly follow the given response format.{' '}
						<strong>
							Dont enclose your response in any other tags like <code>```</code>
						</strong>
					</li>
					<li>
						<strong>
							You can only modify files that are mentioned as part of the
							working set only.
						</strong>
						If you require to modify a file that is not part of the working set,
						please ask the user to add it to the working set first, before
						moving forward.
					</li>
					<li>
						<strong>
							Dont assume files in locations which are not mentioned in the
							request or working set.
						</strong>
					</li>
					<li>
						<strong>
							You cannot create new files, delete files or change files outside
							of files mentioned in the working set.
						</strong>
					</li>
				</ul>
				<h3>Instructions</h3>
				<ul>
					{instructions.map((instruction, index) => (
						<li key={index}>{instruction}</li>
					))}
				</ul>
				<h3>Response Format</h3>
				<p>
					<strong>The response should follow below format strictly</strong>
				</p>
				<pre>
					{`
<file-modification>
	<change-description>
		Text description of why this particular test1.ts change was made
	</change-description>
	<complete-file-uri>
		file:///exact/complete/path/to/file/test1.ts
	</complete-file-uri>
	<updated-file-content>
import * as fs from 'fs';
	</updated-file-content>
</file-modification>

<file-modification>
	<change-description>
		Text description of why this particular test2.ts change was made
	</change-description>
	<complete-file-uri>
		file:///exact/complete/path/to/file/test2.ts
	</complete-file-uri>
	<updated-file-content>
import * as path from 'path';
	</updated-file-content>
</file-modification>
						`.trim()}
				</pre>
			</Message>
		)
	);

	// Return the generated messages for the request to be sent to the chat model
	return messages;
};
