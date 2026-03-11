import { execFile } from 'child_process';
import { promisify } from 'util';

export const execFileAsync = promisify(execFile);

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
