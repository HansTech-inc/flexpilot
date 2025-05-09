import * as vscode from 'vscode';
import * as path from 'path';
import { SymbolResolver } from '../util/symbol-resolver';
import { logger } from '../logger';

/**
 * CompletionItemProvider that provides completions for @-prefixed symbols,
 * including files, folders, and code symbols.
 */
export class SymbolCompletionProvider implements vscode.CompletionItemProvider {
	private symbolResolver: SymbolResolver;
	private fileCache: Map<string, vscode.CompletionItem[]>;
	private lastCacheUpdate: number;
	private cacheExpiration = 30000; // 30 seconds

	constructor() {
		this.symbolResolver = new SymbolResolver();
		this.fileCache = new Map();
		this.lastCacheUpdate = 0;
	}

	/**
	 * Provide completion items for the given position in the document.
	 */
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
		// Check if the user just typed '@' or is in the middle of typing a reference
		const linePrefix = document.lineAt(position).text.substring(0, position.character);
		const atMatch = linePrefix.match(/@([^\s@]*)$/);

		if (!atMatch) {
			return [];
		}

		// Get the partial text after @ if any
		const query = atMatch[1] || '';

		try {
			// Initialize items array
			const items: vscode.CompletionItem[] = [];

			// Add file and folder completions
			const fileItems = await this.getFileAndFolderCompletions(query);
			items.push(...fileItems);

			// Add symbol completions
			const symbolItems = await this.getSymbolCompletions(query, document.uri);
			items.push(...symbolItems);

			// Add special @web completion
			if (query === '' || 'web'.startsWith(query)) {
				const webItem = new vscode.CompletionItem('web', vscode.CompletionItemKind.Event);
				webItem.insertText = 'web';
				webItem.detail = 'Web Search (trigger web search tool)';
				webItem.documentation = new vscode.MarkdownString('Trigger a web search as context using @web.');
				webItem.filterText = '@web';
				webItem.sortText = '0web'; // Appear at the top
				items.unshift(webItem);
			}

			// Return as CompletionList to allow for incremental updates
			return new vscode.CompletionList(items, true);
		} catch (error) {
			logger.error('Error in symbol completion provider:', error);
			return [];
		}
	}

	/**
	 * Get file and folder completion items for the given query
	 */
	private async getFileAndFolderCompletions(query: string): Promise<vscode.CompletionItem[]> {
		// Check if we have a valid cache that's not expired
		const now = Date.now();
		if (this.fileCache.has(query) && (now - this.lastCacheUpdate < this.cacheExpiration)) {
			return this.fileCache.get(query) || [];
		}

		const items: vscode.CompletionItem[] = [];
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders || workspaceFolders.length === 0) {
			return items;
		}

		try {
			// Use glob pattern to find matching files and folders
			let pattern = '**/*';
			if (query) {
				// If query contains path separators, search in specific folder
				if (query.includes('/')) {
					const lastSlashIndex = query.lastIndexOf('/');
					const prefix = query.substring(0, lastSlashIndex + 1);
					const suffix = query.substring(lastSlashIndex + 1);
					pattern = `${prefix}*${suffix}*`;
				} else {
					pattern = `**/*${query}*`;
				}
			}

			const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
			const seenPaths = new Set<string>();
			const rootPath = workspaceFolders[0].uri.fsPath;

			// Process each found URI
			for (const uri of uris) {
				try {
					// Get relative path from workspace root
					const relativePath = path.relative(rootPath, uri.fsPath).replace(/\\/g, '/');
					if (seenPaths.has(relativePath)) {
						continue;
					}

					seenPaths.add(relativePath);

					// Check if it's a directory
					const stat = await vscode.workspace.fs.stat(uri);
					const isDirectory = stat.type === vscode.FileType.Directory;

					// Create completion item
					const label = path.basename(relativePath);
					const completionItem = new vscode.CompletionItem(
						label,
						isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
					);

					// Set the text to insert (including @ and trailing / for folders)
					const insertText = isDirectory ? `${relativePath}/` : relativePath;
					completionItem.insertText = insertText;

					// Add full path as detail
					completionItem.detail = relativePath;

					// Add documentation with path information
					completionItem.documentation = new vscode.MarkdownString(
						isDirectory ?
							`📁 **${relativePath}/**` :
							`📄 **${relativePath}**`
					);

					// Set filtering text to help with searching
					completionItem.filterText = `@${relativePath}`;

					// Set sort text to ensure files/folders appear before symbols
					const sortPrefix = isDirectory ? '1' : '2';
					completionItem.sortText = `${sortPrefix}${relativePath}`;

					items.push(completionItem);
				} catch (error) {
					// Skip errors for individual files
					logger.debug(`Error processing file completion for ${uri.fsPath}:`, error);
				}
			}

			// Cache the results
			this.fileCache.set(query, items);
			this.lastCacheUpdate = Date.now();

			return items;
		} catch (error) {
			logger.error('Error getting file completions:', error);
			return [];
		}
	}

	/**
	 * Get code symbol completion items for the given query
	 */
	private async getSymbolCompletions(query: string, documentUri: vscode.Uri): Promise<vscode.CompletionItem[]> {
		const items: vscode.CompletionItem[] = [];

		try {
			// Get workspace symbols matching the query
			const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
				'vscode.executeWorkspaceSymbolProvider',
				query
			);

			if (!symbols || symbols.length === 0) {
				return items;
			}

			// Add symbol completion items
			for (const symbol of symbols) {
				// Skip certain kinds of symbols that aren't useful in direct references
				if (
					symbol.kind === vscode.SymbolKind.String ||
					symbol.kind === vscode.SymbolKind.Number ||
					symbol.kind === vscode.SymbolKind.Boolean ||
					symbol.kind === vscode.SymbolKind.Array
				) {
					continue;
				}

				const completionItem = new vscode.CompletionItem(
					symbol.name,
					this.symbolKindToCompletionItemKind(symbol.kind)
				);

				// Set the insert text to just the symbol name
				completionItem.insertText = symbol.name;

				// Add container/file information as detail
				const fileName = path.basename(symbol.location.uri.fsPath);
				completionItem.detail = symbol.containerName ?
					`${symbol.name} in ${symbol.containerName} (${fileName})` :
					`${symbol.name} (${fileName})`;

				// Add documentation with location information
				const relativePath = vscode.workspace.asRelativePath(symbol.location.uri);
				completionItem.documentation = new vscode.MarkdownString(
					`${this.symbolKindToIcon(symbol.kind)} **${symbol.name}**\n\n` +
					`${symbol.containerName ? `in ${symbol.containerName}\n\n` : ''}` +
					`📄 ${relativePath}:${symbol.location.range.start.line + 1}`
				);

				// Set filtering text
				completionItem.filterText = `@${symbol.name}`;

				// Set sort text to ensure symbols appear after files/folders
				completionItem.sortText = `3${symbol.name}`;

				items.push(completionItem);
			}

			return items;
		} catch (error) {
			logger.error('Error getting symbol completions:', error);
			return [];
		}
	}

	/**
	 * Convert VS Code SymbolKind to CompletionItemKind
	 */
	private symbolKindToCompletionItemKind(kind: vscode.SymbolKind): vscode.CompletionItemKind {
		switch (kind) {
			case vscode.SymbolKind.File: return vscode.CompletionItemKind.File;
			case vscode.SymbolKind.Module: return vscode.CompletionItemKind.Module;
			case vscode.SymbolKind.Namespace: return vscode.CompletionItemKind.Module;
			case vscode.SymbolKind.Package: return vscode.CompletionItemKind.Module;
			case vscode.SymbolKind.Class: return vscode.CompletionItemKind.Class;
			case vscode.SymbolKind.Method: return vscode.CompletionItemKind.Method;
			case vscode.SymbolKind.Property: return vscode.CompletionItemKind.Property;
			case vscode.SymbolKind.Field: return vscode.CompletionItemKind.Field;
			case vscode.SymbolKind.Constructor: return vscode.CompletionItemKind.Constructor;
			case vscode.SymbolKind.Enum: return vscode.CompletionItemKind.Enum;
			case vscode.SymbolKind.Interface: return vscode.CompletionItemKind.Interface;
			case vscode.SymbolKind.Function: return vscode.CompletionItemKind.Function;
			case vscode.SymbolKind.Variable: return vscode.CompletionItemKind.Variable;
			case vscode.SymbolKind.Constant: return vscode.CompletionItemKind.Constant;
			case vscode.SymbolKind.String: return vscode.CompletionItemKind.Text;
			case vscode.SymbolKind.Number: return vscode.CompletionItemKind.Value;
			case vscode.SymbolKind.Boolean: return vscode.CompletionItemKind.Value;
			case vscode.SymbolKind.Array: return vscode.CompletionItemKind.Value;
			default: return vscode.CompletionItemKind.Text;
		}
	}

	/**
	 * Get an icon for a specific symbol kind for documentation
	 */
	private symbolKindToIcon(kind: vscode.SymbolKind): string {
		switch (kind) {
			case vscode.SymbolKind.File: return '📄';
			case vscode.SymbolKind.Module: return '📦';
			case vscode.SymbolKind.Namespace: return '📦';
			case vscode.SymbolKind.Package: return '📦';
			case vscode.SymbolKind.Class: return '🔶';
			case vscode.SymbolKind.Method: return '🔹';
			case vscode.SymbolKind.Property: return '🔸';
			case vscode.SymbolKind.Field: return '🔸';
			case vscode.SymbolKind.Constructor: return '🔧';
			case vscode.SymbolKind.Enum: return '🔢';
			case vscode.SymbolKind.Interface: return '🔷';
			case vscode.SymbolKind.Function: return '🔹';
			case vscode.SymbolKind.Variable: return '🔸';
			case vscode.SymbolKind.Constant: return '🔒';
			case vscode.SymbolKind.String: return '📝';
			case vscode.SymbolKind.Number: return '🔢';
			case vscode.SymbolKind.Boolean: return '⚖️';
			case vscode.SymbolKind.Array: return '🗃️';
			default: return '❓';
		}
	}
}
