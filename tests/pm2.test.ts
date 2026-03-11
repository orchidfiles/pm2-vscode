import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Pm2Status } from '../src/enums';
import { Pm2Item } from '../src/pm2-item';
import { parseProcessList, shellQuote } from '../src/utils';

import type { Pm2Process } from '../src/types';

// vi.hoisted runs before module imports, so these classes are safe to use
// inside the vi.mock factory below without triggering the "before initialization" error.
const { MockThemeColor, MockThemeIcon, MockTreeItem, MockEventEmitter } = vi.hoisted(() => {
	class MockThemeColor {
		constructor(public readonly id: string) {}
	}

	class MockThemeIcon {
		constructor(
			public readonly id: string,
			public readonly color?: MockThemeColor
		) {}
	}

	class MockTreeItem {
		contextValue?: string;
		description?: string;
		iconPath?: MockThemeIcon;
		tooltip?: string;

		constructor(
			public readonly label: string,
			public readonly collapsibleState: number
		) {}
	}

	class MockEventEmitter {
		readonly event = vi.fn();
		fire = vi.fn();
		dispose = vi.fn();
	}

	return { MockThemeColor, MockThemeIcon, MockTreeItem, MockEventEmitter };
});

const mockShowErrorMessage = vi.fn();
const mockExecFileAsync = vi.fn();

vi.mock('vscode', () => ({
	TreeItem: MockTreeItem,
	TreeItemCollapsibleState: { None: 0 },
	ThemeIcon: MockThemeIcon,
	ThemeColor: MockThemeColor,
	EventEmitter: MockEventEmitter,
	window: {
		showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args)
	}
}));

vi.mock('../src/utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/utils')>();

	return {
		...actual,
		execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args)
	};
});

type TestPm2Item = Omit<Pm2Item, 'iconPath'> & { iconPath?: InstanceType<typeof MockThemeIcon> };

function makeProcess(overrides: Partial<Pm2Process> = {}): Pm2Process {
	return { id: 0, name: 'api', status: Pm2Status.Online, pid: 1234, cpu: 12, memory: 52428800, ...overrides };
}

describe('shellQuote', () => {
	it.each([
		['simple', 'api', "'api'"],
		['spaces', 'my app', "'my app'"],
		['single quotes', "it's", "'it'\\''s'"],
		['empty string', '', "''"],
		['only quotes', "'''", "''\\'''\\'''\\'''"]
	])('%s', (_label, input, expected) => {
		expect(shellQuote(input)).toBe(expected);
	});
});

describe('parseProcessList', () => {
	it('maps all fields from raw pm2 entry', () => {
		const input = [{ name: 'api', pid: 1234, pm2_env: { pm_id: 0, status: 'online' }, monit: { cpu: 5, memory: 52428800 } }];
		expect(parseProcessList(input)).toEqual([{ id: 0, name: 'api', status: 'online', pid: 1234, cpu: 5, memory: 52428800 }]);
	});

	it('filters out entries without pm_id', () => {
		const input = [{ name: 'x', pid: 1, pm2_env: { status: 'online' }, monit: { cpu: 0, memory: 0 } }];
		expect(parseProcessList(input)).toEqual([]);
	});

	it('filters out entries with empty name', () => {
		const input = [{ name: '', pid: 1, pm2_env: { pm_id: 1, status: 'online' }, monit: { cpu: 0, memory: 0 } }];
		expect(parseProcessList(input)).toEqual([]);
	});

	it('filters out entries with missing name', () => {
		const input = [{ pid: 1, pm2_env: { pm_id: 1, status: 'online' }, monit: { cpu: 0, memory: 0 } }];
		expect(parseProcessList(input)).toEqual([]);
	});

	it('preserves unknown status as-is', () => {
		const input = [{ name: 'svc', pid: null, pm2_env: { pm_id: 7, status: 'wait-restart' }, monit: { cpu: 0, memory: 0 } }];
		expect(parseProcessList(input)[0].status).toBe('wait-restart');
	});

	it('defaults status to "stopped" when status is missing', () => {
		const input = [{ name: 'svc', pid: null, pm2_env: { pm_id: 7 }, monit: { cpu: 0, memory: 0 } }];
		expect(parseProcessList(input)[0].status).toBe('stopped');
	});

	it('handles missing monit gracefully', () => {
		const input = [{ name: 'svc', pid: 1, pm2_env: { pm_id: 7, status: 'online' } }];
		const result = parseProcessList(input);
		expect(result[0].cpu).toBe(0);
		expect(result[0].memory).toBe(0);
	});

	it('filters out null, string, number entries', () => {
		expect(parseProcessList([null, 'string', 42])).toEqual([]);
	});
});

describe('Pm2Item', () => {
	it.each([
		{
			status: Pm2Status.Online,
			contextValue: 'online',
			description: '12% · 50 MB',
			icon: 'circle-filled',
			color: 'testing.iconPassed'
		},
		{
			status: Pm2Status.Errored,
			contextValue: 'errored',
			description: 'errored',
			icon: 'circle-filled',
			color: 'testing.iconFailed'
		},
		{ status: Pm2Status.Stopped, contextValue: 'stopped', description: 'stopped', icon: 'circle-outline', color: undefined },
		{ status: Pm2Status.Stopping, contextValue: 'stopping', description: 'stopping', icon: 'circle-outline', color: undefined },
		{ status: Pm2Status.Launching, contextValue: 'launching', description: 'launching', icon: 'circle-outline', color: undefined }
	])('$status: contextValue, description, icon', ({ status, contextValue, description, icon, color }) => {
		const item = new Pm2Item(makeProcess({ status })) as TestPm2Item;
		expect(item.contextValue).toBe(contextValue);
		expect(item.description).toBe(description);
		expect(item.iconPath?.id).toBe(icon);
		expect(item.iconPath?.color?.id).toBe(color);
	});

	it('unknown status falls through to default branch', () => {
		const item = new Pm2Item(makeProcess({ status: 'wait-restart' })) as TestPm2Item;
		expect(item.contextValue).toBe('wait-restart');
		expect(item.description).toBe('wait-restart');
		expect(item.iconPath?.id).toBe('circle-outline');
		expect(item.iconPath?.color).toBeUndefined();
	});

	describe('tooltip', () => {
		it('includes all fields when pid is set', () => {
			const item = new Pm2Item(makeProcess({ pid: 42, cpu: 3, memory: 1048576 }));
			expect(item.tooltip).toBe('Name: api\nStatus: online\nPID: 42\nCPU: 3%\nMemory: 1 MB');
		});

		it('omits PID line when pid is null', () => {
			expect(new Pm2Item(makeProcess({ pid: null })).tooltip).not.toContain('PID');
		});
	});
});

describe('Pm2Provider', () => {
	let Pm2Provider: typeof import('../src/pm2-provider').Pm2Provider;

	beforeEach(async () => {
		vi.useFakeTimers();
		mockExecFileAsync.mockReset();
		mockShowErrorMessage.mockReset();
		({ Pm2Provider } = await import('../src/pm2-provider'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.resetModules();
	});

	function makeRawProcess(id: number, name: string, status: string) {
		return { name, pid: 1, pm2_env: { pm_id: id, status }, monit: { cpu: 0, memory: 0 } };
	}

	function jlistResult(processes: object[]) {
		return { stdout: JSON.stringify(processes), stderr: '' };
	}

	it('getChildren returns items from pm2 jlist', async () => {
		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const provider = new Pm2Provider();
		const children = await provider.getChildren();
		expect(children).toHaveLength(1);
		expect(children[0].process.name).toBe('api');
		provider.dispose();
	});

	it('getChildren returns [] and shows error when pm2 is missing', async () => {
		mockExecFileAsync.mockRejectedValue(new Error('spawn pm2 ENOENT'));
		const provider = new Pm2Provider();
		const children = await provider.getChildren();
		expect(children).toHaveLength(0);
		expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
		provider.dispose();
	});

	it('pm2 missing error is shown only once', async () => {
		mockExecFileAsync.mockRejectedValue(new Error('spawn pm2 ENOENT'));
		const provider = new Pm2Provider();
		await provider.getChildren();
		await provider.getChildren();
		expect(mockShowErrorMessage).toHaveBeenCalledTimes(1);
		provider.dispose();
	});

	it('shows error when stdout has no JSON array', async () => {
		mockExecFileAsync.mockResolvedValue({ stdout: 'warning: something went wrong', stderr: '' });
		const provider = new Pm2Provider();
		await provider.getChildren();
		expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('failed to parse'));
		provider.dispose();
	});

	it('strips pm2 warnings before JSON array', async () => {
		const raw = [makeRawProcess(0, 'api', 'online')];
		mockExecFileAsync.mockResolvedValue({ stdout: `warn: some message\n${JSON.stringify(raw)}`, stderr: '' });
		const provider = new Pm2Provider();
		const children = await provider.getChildren();
		expect(children).toHaveLength(1);
		provider.dispose();
	});

	it('optimisticUpdate applies override immediately', async () => {
		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const provider = new Pm2Provider();
		await provider.getChildren();

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		provider.optimisticUpdate(makeProcess({ id: 0, name: 'api', status: Pm2Status.Online }), Pm2Status.Stopping, [
			Pm2Status.Stopped
		]);

		const children = await provider.getChildren();
		expect(children[0].process.status).toBe(Pm2Status.Stopping);
		provider.dispose();
	});

	it('abortPolling clears overrides and shows real state', async () => {
		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const provider = new Pm2Provider();
		await provider.getChildren();

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		provider.optimisticUpdate(makeProcess({ id: 0, name: 'api', status: Pm2Status.Online }), Pm2Status.Stopping, [
			Pm2Status.Stopped
		]);
		provider.abortPolling();

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const children = await provider.getChildren();
		expect(children[0].process.status).toBe('online');
		provider.dispose();
	});

	it('poll settles when status reaches settled state', async () => {
		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const provider = new Pm2Provider();
		await provider.getChildren();

		provider.optimisticUpdate(makeProcess({ id: 0, name: 'api', status: Pm2Status.Online }), Pm2Status.Stopping, [
			Pm2Status.Stopped
		]);

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'stopped')]));
		await vi.advanceTimersByTimeAsync(600);

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'stopped')]));
		const children = await provider.getChildren();
		expect(children[0].process.status).toBe('stopped');
		provider.dispose();
	});

	it('poll aborts on timeout', async () => {
		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'online')]));
		const provider = new Pm2Provider();
		await provider.getChildren();

		provider.optimisticUpdate(makeProcess({ id: 0, name: 'api', status: Pm2Status.Online }), Pm2Status.Stopping, [
			Pm2Status.Stopped
		]);

		await vi.advanceTimersByTimeAsync(10_001);

		mockExecFileAsync.mockResolvedValue(jlistResult([makeRawProcess(0, 'api', 'stopping')]));
		const children = await provider.getChildren();
		expect(children[0].process.status).toBe('stopping');
		provider.dispose();
	});
});
