import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPriority } from './models/TaskEntity';
import {
  DB_PRIORITY,
  DB_STATUS,
  DbTaskMetadata,
  detectGraphMode,
  findPriorityChoice,
  findStatusChoice,
  getActiveDbStatuses,
  statusNamesMatch,
} from './logseq-db';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('graph detection', () => {
  it('detects database graphs when the host supports the DB API', async () => {
    vi.stubGlobal('logseq', {
      App: { checkCurrentIsDbGraph: vi.fn().mockResolvedValue(true) },
    });
    await expect(detectGraphMode()).resolves.toBe('db');
  });

  it('falls back to legacy mode on older Logseq hosts', async () => {
    vi.stubGlobal('logseq', { App: {} });
    await expect(detectGraphMode()).resolves.toBe('legacy');
  });
});

const metadata: DbTaskMetadata = {
  statuses: [
    { id: 1, ident: DB_STATUS.backlog, name: 'Backlog', completed: false },
    { id: 2, ident: DB_STATUS.todo, name: 'Todo', completed: false },
    { id: 3, ident: DB_STATUS.doing, name: 'Doing', completed: false },
    { id: 4, ident: DB_STATUS.inReview, name: 'In Review', completed: false },
    { id: 5, ident: DB_STATUS.done, name: 'Done', completed: true },
    { id: 6, ident: DB_STATUS.canceled, name: 'Canceled', completed: false },
    { id: 7, name: 'Blocked', completed: false },
    { id: 8, name: 'Shipped', completed: true },
  ],
  priorities: [
    { id: 10, ident: DB_PRIORITY.urgent, name: 'Urgent', completed: false },
    { id: 11, ident: DB_PRIORITY.high, name: 'High', completed: false },
    { id: 12, ident: DB_PRIORITY.medium, name: 'Medium', completed: false },
    { id: 13, ident: DB_PRIORITY.low, name: 'Low', completed: false },
  ],
};

describe('Logseq DB task choices', () => {
  it('maps legacy workflow aliases to native statuses', () => {
    expect(findStatusChoice(metadata, 'LATER')?.ident).toBe(DB_STATUS.todo);
    expect(findStatusChoice(metadata, 'NOW')?.ident).toBe(DB_STATUS.doing);
    expect(findStatusChoice(metadata, 'WAITING')?.ident).toBe(
      DB_STATUS.backlog,
    );
    expect(statusNamesMatch('WAITING', 'Backlog')).toBe(true);
  });

  it('includes native active and configured custom statuses only', () => {
    expect(getActiveDbStatuses(metadata, ['blocked']).map(({ name }) => name)).toEqual([
      'Backlog',
      'Todo',
      'Doing',
      'In Review',
      'Blocked',
    ]);
    expect(getActiveDbStatuses(metadata, ['Shipped']).map(({ name }) => name)).not.toContain(
      'Shipped',
    );
  });

  it('maps legacy priority values to DB choices', () => {
    expect(findPriorityChoice(metadata, TaskPriority.URGENT)?.ident).toBe(
      DB_PRIORITY.urgent,
    );
    expect(findPriorityChoice(metadata, TaskPriority.HIGH)?.ident).toBe(
      DB_PRIORITY.high,
    );
    expect(findPriorityChoice(metadata, TaskPriority.MEDIUM)?.ident).toBe(
      DB_PRIORITY.medium,
    );
    expect(findPriorityChoice(metadata, TaskPriority.LOW)?.ident).toBe(
      DB_PRIORITY.low,
    );
  });
});
