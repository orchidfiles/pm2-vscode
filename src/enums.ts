// Known PM2 process statuses from pm2_env.status
export enum Pm2Status {
  Online = 'online',
  Stopped = 'stopped',
  Errored = 'errored',
  // Transient statuses — treated as stopped for menu context (no start/stop buttons shown)
  Stopping = 'stopping',
  Launching = 'launching',
}
