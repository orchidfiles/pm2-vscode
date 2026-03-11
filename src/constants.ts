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

export const POLL_INTERVAL_MS = 500;
export const POLL_TIMEOUT_MS = 10_000;
export const AUTO_REFRESH_MS = 5000;

export const KNOWN_STATUSES = new Set<string>(Object.values(Pm2Status));
