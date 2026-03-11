import * as vscode from 'vscode';

import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, AUTO_REFRESH_MS } from './constants';
import { Pm2Status } from './enums';
import { Pm2Item } from './pm2-item';
import { Pm2Process, PollHandle } from './types';
import { execFileAsync, sleep, parseProcessList } from './utils';

export class Pm2Provider implements vscode.TreeDataProvider<Pm2Item> {
	private _onDidChangeTreeData = new vscode.EventEmitter<Pm2Item | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private refreshInterval: ReturnType<typeof setInterval> | undefined;
	private pm2Missing = false;
	private lastProcesses: Pm2Process[] = [];

	// Per-process optimistic overrides and active poll handles, keyed by pm_id.
	private optimisticCache = new Map<number, Pm2Process>();
	private pollHandles = new Map<number, PollHandle>();

	constructor() {
		this.startAutoRefresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	// Optimistically update a single item's status before pm2 confirms the change.
	// Pauses auto-refresh while any polling is active; resumes when all polls settle.
	optimisticUpdate(process: Pm2Process, status: Pm2Status, settledStatuses: string[]): void {
		const id = process.id;

		// Cancel any previous poll for this process before starting a new one.
		this.abortPoll(id);

		this.optimisticCache.set(id, { ...process, status, cpu: 0, memory: 0 });
		this._onDidChangeTreeData.fire();

		this.pauseAutoRefresh();

		const handle: PollHandle = { aborted: false };

		this.pollHandles.set(id, handle);

		void this.poll(handle, id, settledStatuses, Date.now() + POLL_TIMEOUT_MS);
	}

	abortPolling(): void {
		for (const id of this.pollHandles.keys()) {
			this.abortPoll(id);
		}

		this.optimisticCache.clear();
		this.maybeResumeAutoRefresh();
		this.refresh();
	}

	private abortPoll(id: number): void {
		const handle = this.pollHandles.get(id);

		if (handle) {
			handle.aborted = true;
			this.pollHandles.delete(id);
		}
	}

	private async poll(handle: PollHandle, id: number, settledStatuses: string[], deadline: number): Promise<void> {
		while (!handle.aborted) {
			await sleep(POLL_INTERVAL_MS);

			if (handle.aborted) {
				return;
			}

			const processes = await this.getProcesses();
			const proc = processes.find((p) => p.id === id);

			if (!proc || settledStatuses.includes(proc.status) || Date.now() >= deadline) {
				this.abortPoll(id);
				this.optimisticCache.delete(id);
				this.maybeResumeAutoRefresh();
				this.refresh();

				return;
			}
		}
	}

	private pauseAutoRefresh(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = undefined;
		}
	}

	private maybeResumeAutoRefresh(): void {
		if (this.pollHandles.size === 0 && !this.refreshInterval) {
			this.startAutoRefresh();
		}
	}

	private startAutoRefresh(): void {
		this.refreshInterval = setInterval(() => this.refresh(), AUTO_REFRESH_MS);
	}

	dispose(): void {
		this.pauseAutoRefresh();

		for (const handle of this.pollHandles.values()) {
			handle.aborted = true;
		}

		this.pollHandles.clear();
		this._onDidChangeTreeData.dispose();
	}

	getTreeItem(element: Pm2Item): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<Pm2Item[]> {
		// During active polling render instantly from last known data + optimistic overrides,
		// without waiting for pm2 jlist.
		const processes = this.pollHandles.size > 0 ? this.lastProcesses : await this.getProcesses();

		return processes.map((p) => {
			const override = this.optimisticCache.get(p.id);

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

		// pm2 may emit warning lines before the JSON array; find the first '[' at the
		// start of a line (or the very start of stdout) to skip them.
		const jsonStart = stdout.search(/(^|\n)\[/);

		if (jsonStart === -1) {
			vscode.window.showErrorMessage('PM2: failed to parse process list');

			return [];
		}

		const jsonOffset = stdout[jsonStart] === '[' ? jsonStart : jsonStart + 1;

		try {
			const list = JSON.parse(stdout.slice(jsonOffset)) as unknown[];
			this.lastProcesses = parseProcessList(list);

			return this.lastProcesses;
		} catch {
			vscode.window.showErrorMessage('PM2: failed to parse process list');

			return [];
		}
	}
}
