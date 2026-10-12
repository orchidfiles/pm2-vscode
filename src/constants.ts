import { Pm2Status } from './enums';
import { Pm2Action } from './types';

// Optimistic status to show immediately after action, before pm2 confirms
export const OPTIMISTIC_STATUS: Record<Pm2Action, Pm2Status> = {
	stop: Pm2Status.Stopping,
	start: Pm2Status.Launching,
	restart: Pm2Status.Launching
};

// Settled statuses to stop polling after action
export const SETTLED_STATUS: Record<Pm2Action, Pm2Status[]> = {
	stop: [Pm2Status.Stopped],
	start: [Pm2Status.Online, Pm2Status.Errored],
	restart: [Pm2Status.Online, Pm2Status.Errored]
};

export const PM2_POLL = {
	intervalMs: 500,
	timeoutMs: 10_000
} as const;

export const PM2_REFRESH_INTERVALS = {
	processes: {
		setting: 'processesRefreshInterval',
		defaultSec: 5
	},
	metrics: {
		setting: 'metricsRefreshInterval',
		defaultSec: 15
	}
} as const;

export const KNOWN_STATUSES = new Set<string>(Object.values(Pm2Status));

export const PM2_ACTIONS = ['restart', 'stop', 'start'] as const satisfies Pm2Action[];
