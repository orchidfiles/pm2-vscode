import * as vscode from 'vscode';

import { OPTIMISTIC_STATUS, PM2_ACTIONS, SETTLED_STATUS } from './constants';
import { Pm2Item } from './pm2-item';
import { Pm2Provider } from './pm2-provider';
import { Pm2Action } from './types';
import { execFileAsync } from './utils';

export function activate(context: vscode.ExtensionContext) {
	const pm2Provider = new Pm2Provider();
	const pm2Tree = vscode.window.createTreeView('pm2Processes', {
		treeDataProvider: pm2Provider,
		showCollapseAll: false
	});

	const pm2Logs = vscode.commands.registerCommand('pm2.logs', (item?: Pm2Item) => {
		if (!item) {
			vscode.window.showInformationMessage('Select a PM2 process from the PM2 view first.');

			return;
		}

		const terminal = vscode.window.createTerminal(`pm2 logs: ${item.process.name}`);
		terminal.show();
		terminal.sendText(`pm2 logs ${item.process.id}`);
	});

	const actionCommands = PM2_ACTIONS.map((action) =>
		vscode.commands.registerCommand(`pm2.${action}`, (item?: Pm2Item) => {
			if (!item) {
				vscode.window.showInformationMessage('Select a PM2 process from the PM2 view first.');

				return;
			}

			pm2Provider.optimisticUpdate(item.process, OPTIMISTIC_STATUS[action], SETTLED_STATUS[action]);
			runPm2(action, item.process.id).catch((err: unknown) => {
				const message = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`pm2 ${action} ${item.process.name}: ${message}`);
				pm2Provider.abortPolling();
			});
		})
	);

	const bulkCommands = PM2_ACTIONS.map((action) =>
		vscode.commands.registerCommand(`pm2.${action}All`, () => {
			runPm2All(action)
				.then(() => pm2Provider.refresh())
				.catch((err: unknown) => {
					const message = err instanceof Error ? err.message : String(err);
					vscode.window.showErrorMessage(`pm2 ${action} all: ${message}`);
				});
		})
	);

	context.subscriptions.push(pm2Tree, pm2Provider, pm2Logs, ...actionCommands, ...bulkCommands);
}

export function deactivate() {}

function runPm2(command: Pm2Action, id: number): Promise<void> {
	return execFileAsync('pm2', [command, String(id)]).then(() => undefined);
}

function runPm2All(command: Pm2Action): Promise<void> {
	return execFileAsync('pm2', [command, 'all']).then(() => undefined);
}
