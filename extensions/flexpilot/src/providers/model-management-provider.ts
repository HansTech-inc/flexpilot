/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Flexpilot AI. All rights reserved.
 *  Licensed under the GPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { modelConfigs, globalState, usagePreferences } from '../context';
import { IModelConfig } from '../types';
import { ModelProviders, modelProviderManager } from '.';
import { logger } from '../logger';

export class ModelManagementProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'flexpilot.modelManagement';
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		this._setWebviewMessageListener(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'views', 'model-management.html');
		let html = fs.readFileSync(htmlPath, 'utf-8');

		// Make paths local to webview
		html = html.replace(/src="([^"]*)"/g, (match, src) => {
			return `src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, src))}"`;
		});

		return html;
	}

	private async _setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(async (message) => {
			const { type, data } = message;

			switch (type) {
				case 'getModels':
					await this._sendModels(webview);
					break;

				case 'getPreferences':
					await this._sendPreferences(webview);
					break;

				case 'getCompletionsConfig':
					await this._sendCompletionsConfig(webview);
					break;

				case 'saveModel':
					await this._saveModel(data);
					await this._sendModels(webview);
					break;

				case 'deleteModel':
					await this._deleteModel(data);
					await this._sendModels(webview);
					break;

				case 'savePreference':
					await this._savePreference(data);
					await this._sendPreferences(webview);
					break;

				case 'saveCompletionsConfig':
					await this._saveCompletionsConfig(data);
					await this._sendCompletionsConfig(webview);
					break;
			}
		});
	}

	private async _sendModels(webview: vscode.Webview) {
		const chatModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
		const models = [];

		for (const chatModel of chatModels) {
			const config = modelConfigs.get<IModelConfig>(chatModel.id);
			if (!config) continue;

			const provider = ModelProviders.find(p => p.providerId === config.providerId);
			if (!provider) continue;

			models.push({
				id: chatModel.id,
				nickname: chatModel.name,
				provider: provider.providerName,
				modelId: config.modelId,
				temperature: config.temperature,
				supportsToolCalls: config.supportsToolCalls,
				baseUrl: config.baseUrl,
				apiKey: config.apiKey
			});
		}

		webview.postMessage({ type: 'models', data: models });
	}

	private async _sendPreferences(webview: vscode.Webview) {
		const preferences = {};
		const locations = [
			{ id: 'chat', label: 'Chat' },
			{ id: 'inline', label: 'Inline Completions' },
			{ id: 'notebook', label: 'Notebook' }
		];

		for (const location of locations) {
			preferences[location.label] = usagePreferences.get(`preference.${location.id}`);
		}

		webview.postMessage({ type: 'preferences', data: preferences });
	}

	private async _sendCompletionsConfig(webview: vscode.Webview) {
		const config = globalState.get('completions.config') || {};
		webview.postMessage({ type: 'completionsConfig', data: config });
	}

	private async _saveModel(data: any) {
		const configId = Date.now().toString();
		const provider = ModelProviders.find(p => p.providerId === `${data.provider}-chat`);

		if (!provider) {
			throw new Error(`Provider not found: ${data.provider}`);
		}

		const config: IModelConfig = {
			providerId: provider.providerId,
			nickname: data.nickname,
			modelId: data.modelId,
			baseUrl: data.baseUrl,
			apiKey: data.apiKey,
			temperature: data.temperature,
			supportsToolCalls: data.supportsToolCalls,
			family: 'chat',
			version: '1.0.0'
		};

		modelConfigs.update(configId, config);
		await modelProviderManager.register(configId);
		logger.notifyInfo('Saved model configuration successfully');
	}

	private async _deleteModel(configId: string) {
		const config = modelConfigs.get<IModelConfig>(configId);
		if (!config) return;

		modelConfigs.update(configId, undefined);
		await modelProviderManager.dispose(configId);
		logger.notifyInfo(`Deleted model configuration: ${config.nickname}`);
	}

	private async _savePreference(data: { location: string, modelId: string | null }) {
		const locationMap = {
			'Chat': 'chat',
			'Inline Completions': 'inline',
			'Notebook': 'notebook'
		};

		const locationId = locationMap[data.location];
		if (!locationId) return;

		await usagePreferences.update(`preference.${locationId}`, data.modelId);
		logger.notifyInfo(`Updated usage preference for ${data.location}`);
	}

	private async _saveCompletionsConfig(config: any) {
		await globalState.update('completions.config', config);
		logger.notifyInfo('Updated completions configuration');
	}
}
