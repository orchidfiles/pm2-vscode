import { execFile } from 'child_process';
import { promisify } from 'util';
import { Pm2Status } from './enums';
import { Pm2Process } from './types';

export const execFileAsync = promisify(execFile);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseProcessList(list: unknown[]): Pm2Process[] {
  return list
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
}
