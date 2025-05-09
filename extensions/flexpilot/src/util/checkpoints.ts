import * as vscode from 'vscode';

const checkpoints = new Map<string, string>();

export async function createCheckpoint(uri: vscode.Uri) {
    const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
    checkpoints.set(uri.toString(), content);
}

export async function restoreCheckpoint(uri: vscode.Uri) {
    const content = checkpoints.get(uri.toString());
    if (content !== undefined) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    }
}

export function clearCheckpoint(uri: vscode.Uri) {
    checkpoints.delete(uri.toString());
}
