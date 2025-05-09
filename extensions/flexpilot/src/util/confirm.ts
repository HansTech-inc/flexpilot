import * as vscode from 'vscode';

export async function confirmFileChange(uri: vscode.Uri, newContent: string): Promise<boolean> {
	const tempUri = uri.with({ path: uri.path + '.flexpilot-preview' });
	await vscode.workspace.fs.writeFile(tempUri, Buffer.from(newContent, 'utf-8'));
	await vscode.commands.executeCommand('vscode.diff', uri, tempUri, 'Review Change');

	const result = await vscode.window.showInformationMessage(
		`Apply change to ${uri.fsPath}?`,
		{ modal: true },
		'Accept', 'Reject'
	);

	await vscode.workspace.fs.delete(tempUri);
	return result === 'Accept';
}
