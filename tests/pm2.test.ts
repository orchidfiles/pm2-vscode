import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pm2Status } from '../src/enums';
import type { Pm2Process } from '../src/types';
import { vscodeMock, MockThemeIcon } from './utils/vscode-mock';
import { parseProcessList } from '../src/utils';
import { Pm2Item } from '../src/pm2-provider';

vi.mock('vscode', () => vscodeMock);

type TestPm2Item = Omit<Pm2Item, 'iconPath'> & { iconPath?: MockThemeIcon };

function makeProcess(overrides: Partial<Pm2Process> = {}): Pm2Process {
  return { name: 'api', status: Pm2Status.Online, pid: 1234, cpu: 12, memory: 52428800, ...overrides };
}

function fixture(name: string) {
  return JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8'));
}

describe('parseProcessList', () => {
  it('maps raw pm2 jlist to Pm2Process[]', () => {
    const input = fixture('parse-process-list/input.json');
    const output = fixture('parse-process-list/output.json');
    expect(parseProcessList(input)).toEqual(output);
  });
});

describe('Pm2Item', () => {
  it.each([
    { status: Pm2Status.Online,    contextValue: 'online',    description: '12% · 50 MB', icon: 'circle-filled',  color: 'testing.iconPassed' },
    { status: Pm2Status.Errored,   contextValue: 'errored',   description: 'errored',     icon: 'circle-filled',  color: 'testing.iconFailed' },
    { status: Pm2Status.Stopped,   contextValue: 'stopped',   description: 'stopped',     icon: 'circle-outline', color: undefined },
    { status: Pm2Status.Stopping,  contextValue: 'stopping',  description: 'stopping',    icon: 'circle-outline', color: undefined },
    { status: Pm2Status.Launching, contextValue: 'launching', description: 'launching',   icon: 'circle-outline', color: undefined },
  ])('$status: contextValue, description, icon', ({ status, contextValue, description, icon, color }) => {
    const item = new Pm2Item(makeProcess({ status })) as TestPm2Item;
    expect(item.contextValue).toBe(contextValue);
    expect(item.description).toBe(description);
    expect(item.iconPath?.id).toBe(icon);
    expect(item.iconPath?.color?.id).toBe(color);
  });

  describe('tooltip', () => {
    it('includes all fields when pid is set', () => {
      const item = new Pm2Item(makeProcess({ pid: 42, cpu: 3, memory: 1048576 }));
      expect(item.tooltip).toBe('Name: api\nStatus: online\nPID: 42\nCPU: 3%\nMemory: 1 MB');
    });

    it('omits PID line when pid is null', () => {
      expect(new Pm2Item(makeProcess({ pid: null })).tooltip).not.toContain('PID');
    });
  });
});
