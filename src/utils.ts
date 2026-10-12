import { execFile } from 'child_process';
import { promisify } from 'util';

import {
	clamp,
	flatMap,
	isEqual,
	isNil,
	isNumber,
	isPlainObject,
	isString,
	keyBy,
	merge,
	pick,
	toNumber,
	toString
} from 'lodash';

import { KNOWN_STATUSES } from './constants';
import { Pm2Status } from './enums';
import { Pm2Process } from './types';

export const execFileAsync = promisify(execFile);

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POSIX-safe single-quote escaping for shell arguments sent via sendText(). */
export function shellQuote(arg: string): string {
	return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function errorMessageFromUnknown(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}

	if (isString(err)) {
		return err;
	}

	return toString(err);
}

export function toKnownStatus(status: string): Pm2Status | undefined {
	return KNOWN_STATUSES.has(status) ? (status as Pm2Status) : undefined;
}

export function readRefreshIntervalSec(value: number | string | null | undefined, defaultSec: number): number {
	if (isNil(value)) {
		return defaultSec;
	}

	const parsed = toNumber(value);

	if (!Number.isFinite(parsed)) {
		return defaultSec;
	}

	return clamp(parsed, 0, Number.MAX_SAFE_INTEGER);
}

const structureFields = ['id', 'name', 'status', 'pid'] as const;
const metricFields = ['id', 'cpu', 'memory'] as const;

export function processesStructureEqual(a: Pm2Process[], b: Pm2Process[]): boolean {
	return isEqual(
		a.map((process) => pick(process, structureFields)),
		b.map((process) => pick(process, structureFields))
	);
}

export function processesMetricsEqual(a: Pm2Process[], b: Pm2Process[]): boolean {
	return isEqual(
		a.map((process) => pick(process, metricFields)),
		b.map((process) => pick(process, metricFields))
	);
}

export function processListsEqual(a: Pm2Process[], b: Pm2Process[]): boolean {
	return processesStructureEqual(a, b) && processesMetricsEqual(a, b);
}

/** Update CPU/memory from fresh list; order and non-metric fields stay as in current. */
export function applyMetricsFromFresh(current: Pm2Process[], fresh: Pm2Process[]): Pm2Process[] {
	const byId = keyBy(fresh, 'id');

	return current.map((process) => {
		const updated = byId[process.id];

		if (!updated) {
			return process;
		}

		return merge({}, process, pick(updated, ['cpu', 'memory']));
	});
}

export function parseProcessList(list: unknown[]): Pm2Process[] {
	return flatMap(list, (entry) => {
		if (!isPlainObject(entry)) {
			return [];
		}

		const raw = entry as Record<string, unknown>;
		const env = raw.pm2_env as Record<string, unknown> | undefined;
		const monit = raw.monit as Record<string, unknown> | undefined;

		const id = isNumber(env?.pm_id) ? env.pm_id : null;
		const name = isString(raw.name) && raw.name !== '' ? raw.name : null;

		if (id === null || name === null) {
			return [];
		}

		const process: Pm2Process = {
			id,
			name,
			status: isString(env?.status) ? env.status : 'stopped',
			pid: isNumber(raw.pid) ? raw.pid : null,
			cpu: isNumber(monit?.cpu) ? monit.cpu : 0,
			memory: isNumber(monit?.memory) ? monit.memory : 0
		};

		return [process];
	});
}
