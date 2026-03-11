import * as vscode from 'vscode';

import { Pm2Status } from './enums';
import { Pm2Process } from './types';
import { toKnownStatus } from './utils';

export class Pm2Item extends vscode.TreeItem {
	constructor(public readonly process: Pm2Process) {
		super(process.name, vscode.TreeItemCollapsibleState.None);

		const memMb = Math.round(process.memory / 1024 / 1024);
		const status = toKnownStatus(process.status);

		switch (status) {
			case Pm2Status.Online:
				this.contextValue = Pm2Status.Online;
				this.description = `${process.cpu}% · ${memMb} MB`;
				this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
				break;
			case Pm2Status.Errored:
				this.contextValue = Pm2Status.Errored;
				this.description = process.status;
				this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'));
				break;
			case Pm2Status.Stopped:
				this.contextValue = Pm2Status.Stopped;
				this.description = process.status;
				this.iconPath = new vscode.ThemeIcon('circle-outline');
				break;
			default:
				// stopping, launching, unknown — no action buttons
				this.contextValue = process.status;
				this.description = process.status;
				this.iconPath = new vscode.ThemeIcon('circle-outline');
		}

		this.tooltip = [
			`Name: ${process.name}`,
			`Status: ${process.status}`,
			process.pid ? `PID: ${process.pid}` : null,
			`CPU: ${process.cpu}%`,
			`Memory: ${memMb} MB`
		]
			.filter((x): x is string => x !== null)
			.join('\n');
	}
}
