import * as vscode from 'vscode';
import { execFileAsync, sleep } from './utils';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, AUTO_REFRESH_MS } from './constants';
import { Pm2Status } from './enums';
import { Pm2Process } from './types';

export class Pm2Item extends vscode.TreeItem {
  constructor(public readonly process: Pm2Process) {
    super(process.name, vscode.TreeItemCollapsibleState.None);

    const memMb = Math.round(process.memory / 1024 / 1024);

    switch (process.status) {
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
      `Memory: ${memMb} MB`,
    ].filter((x): x is string => x !== null).join('\n');
  }
}

export class Pm2Provider implements vscode.TreeDataProvider<Pm2Item> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Pm2Item | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private refreshInterval: ReturnType<typeof setInterval> | undefined;
  private pollAborted = false;
  private polling = false;
  private pm2Missing = false;
  private lastProcesses: Pm2Process[] = [];
  // Optimistic status overrides by process name, cleared after polling.
  private optimisticCache = new Map<string, Pm2Process>();

  constructor() {
    this.startAutoRefresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // Optimistically update a single item's status before pm2 confirms the change.
  // Pauses auto-refresh and starts polling until settled status or timeout.
  optimisticUpdate(item: Pm2Item, status: Pm2Status, settledStatuses: Pm2Status[]): void {
    this.optimisticCache.set(item.process.name, { ...item.process, status, cpu: 0, memory: 0 });
    this._onDidChangeTreeData.fire();

    this.stopPolling();
    this.pollAborted = false;
    this.polling = true;
    this.pauseAutoRefresh();

    void this.poll(item.process.name, settledStatuses, Date.now() + POLL_TIMEOUT_MS);
  }

  abortPolling(): void {
    this.stopPolling();
    this.optimisticCache.clear();
    this.resumeAutoRefresh();
    this.refresh();
  }

  private async poll(name: string, settledStatuses: Pm2Status[], deadline: number): Promise<void> {
    while (!this.pollAborted) {
      await sleep(POLL_INTERVAL_MS);

      if (this.pollAborted) {
        return;
      }

      const processes = await this.getProcesses();
      const proc = processes.find((p) => p.name === name);

      if (!proc || settledStatuses.includes(proc.status as Pm2Status) || Date.now() >= deadline) {
        this.stopPolling();
        this.optimisticCache.clear();
        this.resumeAutoRefresh();
        this.refresh();
        return;
      }
    }
  }

  private stopPolling(): void {
    this.pollAborted = true;
    this.polling = false;
  }

  private pauseAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private resumeAutoRefresh(): void {
    if (!this.refreshInterval) {
      this.startAutoRefresh();
    }
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => this.refresh(), AUTO_REFRESH_MS);
  }

  dispose(): void {
    this.pauseAutoRefresh();
    this.stopPolling();
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: Pm2Item): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<Pm2Item[]> {
    // During polling render instantly from last known data + optimistic overrides,
    // without waiting for pm2 jlist
    const processes = this.polling ? this.lastProcesses : await this.getProcesses();

    return processes.map((p) => {
      const override = this.optimisticCache.get(p.name);
      return new Pm2Item(override ?? p);
    });
  }

  private async getProcesses(): Promise<Pm2Process[]> {
    let stdout: string;

    try {
      const result = await execFileAsync('pm2', ['jlist'], { encoding: 'utf-8' });
      stdout = result.stdout;
      this.pm2Missing = false;
    } catch (err) {
      if (!this.pm2Missing) {
        this.pm2Missing = true;
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`PM2: ${message}`);
      }
      return [];
    }

    if (!stdout) {
      return [];
    }

    try {
      const list = JSON.parse(stdout) as unknown[];
      this.lastProcesses = list
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => {
          const env = p['pm2_env'] as Record<string, unknown> | undefined;
          const monit = p['monit'] as Record<string, unknown> | undefined;
          return {
            name: String(p['name'] ?? ''),
            status: String(env?.['status'] ?? Pm2Status.Stopped) as Pm2Status | string,
            pid: typeof p['pid'] === 'number' ? p['pid'] : null,
            cpu: typeof monit?.['cpu'] === 'number' ? monit['cpu'] : 0,
            memory: typeof monit?.['memory'] === 'number' ? monit['memory'] : 0,
          };
        });
      return this.lastProcesses;
    } catch {
      vscode.window.showErrorMessage('PM2: failed to parse process list');
      return [];
    }
  }
}
