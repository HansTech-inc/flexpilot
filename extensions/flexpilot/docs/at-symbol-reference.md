# @-Symbol Reference System

The @-symbol reference system allows you to quickly reference files, folders, code symbols, and URLs in your chat prompts.

## Usage

When writing a chat prompt, you can use the @ character followed by a reference to:

1. **@Files** - Reference entire source code files
   - Example: `@filename.ts`, `@path/to/file.js`

2. **@Folders** - Reference entire directories
   - Example: `@src/util/`, `@components/`

3. **@Symbols** - Reference specific code symbols (functions, classes, variables, etc.)
   - Example: `@SymbolResolver`, `@parseAndResolvePrompt`

4. **@URLs** - Reference web links
   - Example: `@https://example.com`, `@http://docs.example.com`

## Autocompletion

As you type the @ character, an autocompletion dropdown will appear showing available files, folders, and symbols.

- Files are marked with a file icon
- Folders are marked with a folder icon
- Symbols are marked with their corresponding symbol type icon

## How It Works

The system uses VS Code's built-in APIs to:

1. Detect when you type the @ character
2. Find matching files, folders, and symbols in your workspace
3. Present them as completion suggestions
4. When selected, insert the appropriate reference

## Behind the Scenes

The system consists of two main components:

1. **SymbolResolver**: Handles parsing and resolving references to files, folders, symbols, and URLs
2. **SymbolCompletionProvider**: Provides autocompletion suggestions when typing @ characters

These components work together to provide a seamless experience when referencing code artifacts in your conversations.
