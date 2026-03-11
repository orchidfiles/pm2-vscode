import { execFile } from 'child_process';
import { promisify } from 'util';

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

export function toKnownStatus(status: string): Pm2Status | undefined {
	return KNOWN_STATUSES.has(status) ? (status as Pm2Status) : undefined;
}

export function parseProcessList(list: unknown[]): Pm2Process[] {
	return list
		.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
		.flatMap((p) => {
			const env = p.pm2_env as Record<string, unknown> | undefined;
			const monit = p.monit as Record<string, unknown> | undefined;

			const id = typeof env?.pm_id === 'number' ? env.pm_id : null;
			const name = typeof p.name === 'string' && p.name !== '' ? p.name : null;

			if (id === null || name === null) {
				return [];
			}

			return [
				{
					id,
					name,
					status: typeof env?.status === 'string' ? env.status : 'stopped',
					pid: typeof p.pid === 'number' ? p.pid : null,
					cpu: typeof monit?.cpu === 'number' ? monit.cpu : 0,
					memory: typeof monit?.memory === 'number' ? monit.memory : 0
				}
			];
		});
}
