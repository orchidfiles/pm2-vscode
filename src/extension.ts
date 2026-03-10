import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { Pm2Provider, Pm2Item } from './pm2-provider';

// pm2 needs time to update process state after a command
const REFRESH_DELAY_MS = 1500;

export function activate(context: vscode.ExtensionContext) {
  const pm2Provider = new Pm2Provider();
  const pm2Tree = vscode.window.createTreeView('pm2Processes', {
    treeDataProvider: pm2Provider,
    showCollapseAll: false,
  });

  const pm2Refresh = vscode.commands.registerCommand('pm2.refresh', () => {
    pm2Provider.refresh();
  });

  const pm2Logs = vscode.commands.registerCommand('pm2.logs', (item?: Pm2Item) => {
    if (!item) {
      vscode.window.showInformationMessage('Select a PM2 process from the PM2 view first.');

      return;
    }

    const terminal = vscode.window.createTerminal(`pm2 logs: ${item.process.name}`);
    terminal.show();
    terminal.sendText(`pm2 logs ${item.process.name}`);
  });

  const actionCommands = (
    ['restart', 'stop', 'start'] as const
  ).map((action) =>
    vscode.commands.registerCommand(`pm2.${action}`, (item?: Pm2Item) => {
      if (!item) {
        vscode.window.showInformationMessage('Select a PM2 process from the PM2 view first.');

        return;
      }

      runPm2(action, item.process.name);
      setTimeout(() => pm2Provider.refresh(), REFRESH_DELAY_MS);
    }),
  );

  context.subscriptions.push(pm2Tree, pm2Provider, pm2Refresh, pm2Logs, ...actionCommands);
}

export function deactivate() {}

function runPm2(command: 'restart' | 'stop' | 'start', name: string): void {
  execFile('pm2', [command, name], (err) => {
    if (err) {
      vscode.window.showErrorMessage(`pm2 ${command} ${name}: ${err.message}`);
    }
  });
}
