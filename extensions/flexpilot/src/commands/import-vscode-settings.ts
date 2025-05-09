import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Command to auto-import VS Code settings.json into Flexpilot IDE.
 */
const handler = async () => {
    let settingsPath: string;
    const platform = process.platform;
    if (platform === 'win32') {
        settingsPath = path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json');
    } else if (platform === 'darwin') {
        settingsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    } else {
        // Assume Linux
        settingsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
    }

    try {
        if (!fs.existsSync(settingsPath)) {
            vscode.window.showErrorMessage(`VS Code settings.json not found at: ${settingsPath}`);
            return;
        }
        const settingsRaw = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsRaw);
        // Apply each setting
        for (const [key, value] of Object.entries(settings)) {
            await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
        }
        vscode.window.showInformationMessage('✅ Successfully imported VS Code settings into Flexpilot IDE!');
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to import VS Code settings: ${err}`);
    }
};

export const registerImportVSCodeSettingsAutoCommand = () => {
    vscode.commands.registerCommand('flexpilot.importVSCodeSettingsAuto', handler);
};
