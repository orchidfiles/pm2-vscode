import { Pm2Status } from './enums';

export type Pm2Action = 'restart' | 'stop' | 'start';

export interface Pm2Process {
  name: string;
  status: Pm2Status | string;
  pid: number | null;
  cpu: number;
  memory: number;
}
