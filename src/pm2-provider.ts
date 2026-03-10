import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// auto-refresh interval in milliseconds
const AUTO_REFRESH_MS = 5000;

export interface Pm2Process {
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'stopping' | 'launching' | string;
  pid: number | null;
  cpu: number;
  memory: number;
}

const STATUS_CONTEXT: Record<string, string> = {
  online: 'online',
  errored: 'errored',
};

export class Pm2Item extends vscode.TreeItem {
  constructor(public readonly process: Pm2Process) {
    super(process.name, vscode.TreeItemCollapsibleState.None);

    this.contextValue = STATUS_CONTEXT[process.status] ?? 'stopped';

    const memMb = Math.round(process.memory / 1024 / 1024);
    if (process.status === 'online') {
      this.description = `${process.cpu}% · ${memMb} MB`;
    } else {
      this.description = process.status;
    }

    if (process.status === 'online') {
      this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
    } else if (process.status === 'errored') {
      this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'));
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    }

    this.tooltip = [
      `Name: ${process.name}`,
      `Status: ${process.status}`,
      process.pid ? `PID: ${process.pid}` : null,
      `CPU: ${process.cpu}%`,
      `Memory: ${memMb} MB`,
    ].filter(Boolean).join('\n');
  }
}

export class Pm2Provider implements vscode.TreeDataProvider<Pm2Item> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Pm2Item | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private refreshInterval: ReturnType<typeof setInterval> | undefined;
  private pm2Missing = false;

  constructor() {
    this.startAutoRefresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => this.refresh(), AUTO_REFRESH_MS);
  }

  dispose(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: Pm2Item): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<Pm2Item[]> {
    const processes = await this.getProcesses();
    return processes.map((p) => new Pm2Item(p));
  }

  private async getProcesses(): Promise<Pm2Process[]> {
    let stdout: string;

    try {
      const result = await execFileAsync('pm2', ['jlist'], { encoding: 'utf-8' });
      stdout = result.stdout;
      this.pm2Missing = false;
    } catch (err: any) {
      if (!this.pm2Missing) {
        this.pm2Missing = true;
        vscode.window.showErrorMessage(`PM2: ${err.message}`);
      }
      return [];
    }

    if (!stdout) {
      return [];
    }

    try {
      const list = JSON.parse(stdout) as any[];
      return list.map((p) => ({
        name: p.name,
        status: p.pm2_env?.status ?? 'unknown',
        pid: p.pid ?? null,
        cpu: p.monit?.cpu ?? 0,
        memory: p.monit?.memory ?? 0,
      }));
    } catch {
      vscode.window.showErrorMessage('PM2: failed to parse process list');
      return [];
    }
  }
}
