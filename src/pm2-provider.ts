import { cloneDeep, find, forEach, includes, keyBy } from 'lodash';
import * as vscode from 'vscode';

import { PM2_POLL, PM2_REFRESH_INTERVALS } from './constants';
import { Pm2Status } from './enums';
import { Pm2Item } from './pm2-item';
import { Pm2Process, PollHandle } from './types';
import {
	execFileAsync,
	sleep,
	parseProcessList,
	processListsEqual,
	processesStructureEqual,
	applyMetricsFromFresh,
	readRefreshIntervalSec,
	errorMessageFromUnknown
} from './utils';

type RefreshKind = 'all' | 'processes' | 'metrics';

interface ProcessMetrics {
	cpu: number;
	memory: number;
}

export class Pm2Provider implements vscode.TreeDataProvider<Pm2Item> {
	private _onDidChangeTreeData = new vscode.EventEmitter<Pm2Item | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private processesInterval: ReturnType<typeof setInterval> | undefined;
	private metricsInterval: ReturnType<typeof setInterval> | undefined;
	private configListener: vscode.Disposable | undefined;
	private pm2Missing = false;
	private lastProcesses: Pm2Process[] = [];
	private frozenMetrics = new Map<number, ProcessMetrics>();
	private initialLoadDone = false;
	private fetchInFlight: Promise<Pm2Process[]> | undefined;

	// Per-process optimistic overrides and active poll handles, keyed by pm_id.
	private optimisticCache = new Map<number, Pm2Process>();
	private pollHandles = new Map<number, PollHandle>();

	constructor() {
		this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('pm2')) {
				this.restartAutoRefresh();
			}
		});
		this.startAutoRefresh();
	}

	refresh(): void {
		void this.runRefresh('all');
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

		void this.poll(handle, id, settledStatuses, Date.now() + PM2_POLL.timeoutMs);
	}

	abortPolling(): void {
		forEach([...this.pollHandles.keys()], (id) => {
			this.abortPoll(id);
		});

		this.optimisticCache.clear();
		this.maybeResumeAutoRefresh();
		this._onDidChangeTreeData.fire();
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
			await sleep(PM2_POLL.intervalMs);

			if (handle.aborted) {
				return;
			}

			const processes = await this.fetchFromPm2();
			const proc = find(processes, (p) => p.id === id);

			if (!proc || includes(settledStatuses, proc.status) || Date.now() >= deadline) {
				this.abortPoll(id);
				this.optimisticCache.delete(id);
				this.applyFetched(processes, 'all');
				this.maybeResumeAutoRefresh();
				this.fireIfDisplayChanged('all');

				return;
			}
		}
	}

	private pauseAutoRefresh(): void {
		if (this.processesInterval) {
			clearInterval(this.processesInterval);
			this.processesInterval = undefined;
		}

		if (this.metricsInterval) {
			clearInterval(this.metricsInterval);
			this.metricsInterval = undefined;
		}
	}

	private maybeResumeAutoRefresh(): void {
		if (this.pollHandles.size === 0 && !this.processesInterval && !this.metricsInterval) {
			this.startAutoRefresh();
		}
	}

	private restartAutoRefresh(): void {
		this.pauseAutoRefresh();
		this.syncFrozenMetricsFromDisplay();

		if (this.pollHandles.size === 0) {
			this.startAutoRefresh();
		}
	}

	private getRefreshIntervalSec(interval: (typeof PM2_REFRESH_INTERVALS)[keyof typeof PM2_REFRESH_INTERVALS]): number {
		const config = vscode.workspace.getConfiguration('pm2');
		const value = config.get<number | string | null>(interval.setting);

		return readRefreshIntervalSec(value, interval.defaultSec);
	}

	private isMetricsAutoRefreshEnabled(): boolean {
		return this.getRefreshIntervalSec(PM2_REFRESH_INTERVALS.metrics) > 0;
	}

	private startAutoRefresh(): void {
		const processesSec = this.getRefreshIntervalSec(PM2_REFRESH_INTERVALS.processes);
		const metricsSec = this.getRefreshIntervalSec(PM2_REFRESH_INTERVALS.metrics);

		if (processesSec > 0) {
			this.processesInterval = setInterval(() => void this.runRefresh('processes'), processesSec * 1000);
		}

		if (metricsSec > 0) {
			this.metricsInterval = setInterval(() => void this.runRefresh('metrics'), metricsSec * 1000);
		}
	}

	private async runRefresh(kind: RefreshKind): Promise<void> {
		if (this.pollHandles.size > 0 && kind !== 'all') {
			return;
		}

		if (kind === 'metrics' && !this.isMetricsAutoRefreshEnabled()) {
			return;
		}

		const fresh = await this.fetchFromPm2();
		this.applyFetched(fresh, kind);
		this.initialLoadDone = true;
		this.fireIfDisplayChanged(kind);
	}

	private applyFetched(fresh: Pm2Process[], kind: RefreshKind): void {
		if (kind === 'metrics') {
			this.lastProcesses = applyMetricsFromFresh(this.lastProcesses, fresh);
			this.replaceFrozenFrom(this.lastProcesses);

			return;
		}

		if (kind === 'all') {
			this.lastProcesses = fresh;
			this.replaceFrozenFrom(fresh);

			return;
		}

		if (!this.isMetricsAutoRefreshEnabled()) {
			this.lastProcesses = this.mergeProcessesKeepingFrozenMetrics(fresh);

			return;
		}

		const byId = keyBy(this.lastProcesses, 'id');
		this.lastProcesses = fresh.map((process) => {
			const existing = byId[process.id];

			if (!existing) {
				return process;
			}

			return { ...process, cpu: existing.cpu, memory: existing.memory };
		});
	}

	private syncFrozenMetricsFromDisplay(): void {
		if (this.isMetricsAutoRefreshEnabled() || this.lastProcesses.length === 0) {
			return;
		}

		this.replaceFrozenFrom(this.lastProcesses);
	}

	private replaceFrozenFrom(processes: Pm2Process[]): void {
		this.frozenMetrics = new Map(processes.map((process) => [process.id, { cpu: process.cpu, memory: process.memory }]));
	}

	/** Structure from fresh; keep frozen metrics for existing processes. */
	private mergeProcessesKeepingFrozenMetrics(fresh: Pm2Process[]): Pm2Process[] {
		const previousById = keyBy(this.lastProcesses, 'id');

		return fresh.map((process) => {
			const previous = previousById[process.id];

			if (previous) {
				return this.withFrozenMetrics(process);
			}

			this.frozenMetrics.set(process.id, { cpu: process.cpu, memory: process.memory });

			return process;
		});
	}

	private withFrozenMetrics(process: Pm2Process): Pm2Process {
		const metrics = this.frozenMetrics.get(process.id);

		if (!metrics) {
			return { ...process, cpu: 0, memory: 0 };
		}

		return { ...process, cpu: metrics.cpu, memory: metrics.memory };
	}

	private toDisplayProcess(process: Pm2Process): Pm2Process {
		if (this.isMetricsAutoRefreshEnabled()) {
			return process;
		}

		return this.withFrozenMetrics(process);
	}

	private fireIfDisplayChanged(kind: RefreshKind = 'processes'): void {
		const displayed = this.lastProcesses.map((p) => {
			const override = this.optimisticCache.get(p.id);

			if (override) {
				return override;
			}

			return this.toDisplayProcess(p);
		});

		const includeMetrics = this.isMetricsAutoRefreshEnabled() || kind === 'all' || kind === 'metrics';
		const changed = includeMetrics
			? !processListsEqual(this.lastDisplayedSnapshot, displayed)
			: !processesStructureEqual(this.lastDisplayedSnapshot, displayed);

		if (changed) {
			this.lastDisplayedSnapshot = cloneDeep(displayed);
			this._onDidChangeTreeData.fire();
		}
	}

	private lastDisplayedSnapshot: Pm2Process[] = [];

	dispose(): void {
		this.pauseAutoRefresh();
		this.configListener?.dispose();

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
		if (this.pollHandles.size > 0) {
			return this.mapItems(this.lastProcesses);
		}

		if (!this.initialLoadDone) {
			await this.runRefresh('all');
		}

		return this.mapItems(this.lastProcesses);
	}

	private mapItems(processes: Pm2Process[]): Pm2Item[] {
		return processes.map((p) => {
			const override = this.optimisticCache.get(p.id);

			if (override) {
				return new Pm2Item(override);
			}

			return new Pm2Item(this.toDisplayProcess(p));
		});
	}

	private async fetchFromPm2(): Promise<Pm2Process[]> {
		if (this.fetchInFlight) {
			return this.fetchInFlight;
		}

		this.fetchInFlight = this.loadFromPm2().finally(() => {
			this.fetchInFlight = undefined;
		});

		return this.fetchInFlight;
	}

	private async loadFromPm2(): Promise<Pm2Process[]> {
		let stdout: string;

		try {
			const result = await execFileAsync('pm2', ['jlist'], { encoding: 'utf-8' });
			stdout = result.stdout;
			this.pm2Missing = false;
		} catch (err) {
			if (!this.pm2Missing) {
				this.pm2Missing = true;
				vscode.window.showErrorMessage(`PM2: ${errorMessageFromUnknown(err)}`);
			}

			return this.lastProcesses;
		}

		// pm2 may emit warning lines before the JSON array; find the first '[' at the
		// start of a line (or the very start of stdout) to skip them.
		const jsonStart = stdout.search(/(^|\n)\[/);

		if (jsonStart === -1) {
			vscode.window.showErrorMessage('PM2: failed to parse process list');

			return this.lastProcesses;
		}

		const jsonOffset = stdout[jsonStart] === '[' ? jsonStart : jsonStart + 1;

		try {
			const list = JSON.parse(stdout.slice(jsonOffset)) as unknown[];

			return parseProcessList(list);
		} catch {
			vscode.window.showErrorMessage('PM2: failed to parse process list');

			return this.lastProcesses;
		}
	}
}
