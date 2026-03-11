import { execFile } from 'child_process';
import { promisify } from 'util';

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

export function parseProcessList(list: unknown[]): Pm2Process[] {
	return list
		.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
		.map((p) => {
			const env = p.pm2_env as Record<string, unknown> | undefined;
			const monit = p.monit as Record<string, unknown> | undefined;

			return {
				id: typeof env?.pm_id === 'number' ? env.pm_id : -1,
				name: typeof p.name === 'string' ? p.name : '',
				status: typeof env?.status === 'string' ? (env.status as Pm2Status) : Pm2Status.Stopped,
				pid: typeof p.pid === 'number' ? p.pid : null,
				cpu: typeof monit?.cpu === 'number' ? monit.cpu : 0,
				memory: typeof monit?.memory === 'number' ? monit.memory : 0
			};
		});
}
