import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewTask,
  setTaskScheduled,
  toggleTaskMarker,
  toggleTaskStatus,
} from './api';
import {
  DB_PRIORITY,
  DB_PROPERTY,
  DB_STATUS,
  dbPropertyApiKey,
} from './logseq-db';
import { TaskEntityObject, TaskPriority } from './models/TaskEntity';

const statusRows = [
  [{ id: 76, ident: DB_STATUS.todo, title: 'Todo', order: 'a' }, DB_PROPERTY.status],
  [{ id: 77, ident: DB_STATUS.doing, title: 'Doing', order: 'b' }, DB_PROPERTY.status],
  [
    {
      id: 79,
      ident: DB_STATUS.done,
      title: 'Done',
      order: 'c',
      ':logseq.property/choice-checkbox-state': true,
    },
    DB_PROPERTY.status,
  ],
  [{ id: 82, ident: DB_PRIORITY.high, title: 'High', order: 'a' }, DB_PROPERTY.priority],
];

function dbTask(overrides: Partial<TaskEntityObject> = {}): TaskEntityObject {
  return {
    graphMode: 'db',
    uuid: '00000000-0000-0000-0000-000000000001',
    content: 'Task',
    rawContent: 'Task',
    marker: 'Todo',
    statusId: 76,
    statusIdent: DB_STATUS.todo,
    priority: TaskPriority.NONE,
    priorityId: undefined,
    scheduled: undefined,
    repeated: false,
    completed: false,
    page: {
      name: 'aug 18th, 2026',
      uuid: '00000000-0000-0000-0000-000000000002',
      journalDay: 20260818,
      updatedAt: 1,
    },
    ...overrides,
  };
}

function mockLogseq() {
  const Editor = {
    getTag: vi.fn().mockResolvedValue({
      uuid: '00000000-0000-0000-0000-000000000003',
    }),
    getTodayPage: vi.fn().mockResolvedValue({
      name: 'aug 18th, 2026',
      uuid: '00000000-0000-0000-0000-000000000002',
    }),
    createJournalPage: vi.fn(),
    getPageBlocksTree: vi.fn().mockResolvedValue([]),
    appendBlockInPage: vi.fn().mockResolvedValue({
      uuid: '00000000-0000-0000-0000-000000000001',
      title: 'New task',
    }),
    insertBlock: vi.fn(),
    addBlockTag: vi.fn().mockResolvedValue(undefined),
    upsertBlockProperty: vi.fn().mockResolvedValue(undefined),
    removeBlockProperty: vi.fn().mockResolvedValue(undefined),
    removeBlock: vi.fn().mockResolvedValue(undefined),
    updateBlock: vi.fn().mockResolvedValue(undefined),
    getPage: vi.fn(),
    createPage: vi.fn(),
  };
  const logseqMock = {
    DB: { datascriptQuery: vi.fn().mockResolvedValue(statusRows) },
    Editor,
  };
  vi.stubGlobal('logseq', logseqMock);
  return logseqMock;
}

describe('task mutations', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates DB tasks with clean titles and structured properties', async () => {
    const { Editor } = mockLogseq();
    await createNewTask('ignored', 'New task', {
      graphMode: 'db',
      marker: 'Todo',
      priority: TaskPriority.HIGH,
    });

    expect(Editor.appendBlockInPage).toHaveBeenCalledWith(
      'aug 18th, 2026',
      'New task',
    );
    expect(Editor.addBlockTag).toHaveBeenCalled();
    expect(Editor.upsertBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.status),
      76,
    );
    expect(Editor.upsertBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.priority),
      82,
    );
  });

  it('updates DB status without rewriting content', async () => {
    const { Editor } = mockLogseq();
    await toggleTaskStatus(dbTask(), { marker: 'Todo' });
    expect(Editor.upsertBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.status),
      79,
    );
    expect(Editor.updateBlock).not.toHaveBeenCalled();

    await toggleTaskMarker(dbTask(), { markerGroup: ['Todo', 'Doing'] });
    expect(Editor.upsertBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.status),
      77,
    );
  });

  it('sets and removes DB scheduled properties', async () => {
    const { Editor } = mockLogseq();
    const date = new Date('2026-08-20T16:00:00+02:00');
    await setTaskScheduled(dbTask(), date);
    expect(Editor.upsertBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.scheduled),
      dayjs(date).startOf('day').valueOf(),
    );

    await setTaskScheduled(dbTask(), null);
    expect(Editor.removeBlockProperty).toHaveBeenCalledWith(
      expect.any(String),
      dbPropertyApiKey(DB_PROPERTY.scheduled),
    );
  });

  it('keeps legacy status changes in block content', async () => {
    const { Editor } = mockLogseq();
    const task = dbTask({
      graphMode: 'legacy',
      rawContent: 'TODO Legacy task',
      marker: 'TODO',
      statusId: undefined,
      statusIdent: undefined,
    });
    await toggleTaskStatus(task, { marker: 'TODO' });
    expect(Editor.updateBlock).toHaveBeenCalledWith(
      task.uuid,
      'DONE Legacy task',
    );
  });

  it('keeps legacy task creation syntax', async () => {
    const { Editor } = mockLogseq();
    Editor.getPage.mockResolvedValue({
      name: '2026-08-18',
      uuid: '00000000-0000-0000-0000-000000000002',
    });

    await createNewTask('2026-08-18', 'Legacy task', {
      graphMode: 'legacy',
      marker: 'TODO',
      priority: TaskPriority.HIGH,
    });

    expect(Editor.appendBlockInPage).toHaveBeenCalledWith(
      '2026-08-18',
      'TODO [#A] Legacy task',
    );
    expect(Editor.addBlockTag).not.toHaveBeenCalled();
  });
});
