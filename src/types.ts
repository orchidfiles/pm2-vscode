import { Pm2Status } from './enums';

export type Pm2Action = 'restart' | 'stop' | 'start';

export interface PollHandle {
	aborted: boolean;
}

export interface Pm2Process {
	/** pm2_env.pm_id — stable numeric identifier across restarts */
	id: number;
	name: string;
	/** Known pm2 statuses map to Pm2Status; unknown values are passed through as-is. */
	status: Pm2Status | string;
	pid: number | null;
	cpu: number;
	memory: number;
}
