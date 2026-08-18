import { BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { DB_PRIORITY, DB_STATUS, DbTaskMetadata } from '../logseq-db';
import TaskEntity, { TaskPriority } from './TaskEntity';

const metadata: DbTaskMetadata = {
  statuses: [
    { id: 76, ident: DB_STATUS.todo, name: 'Todo', completed: false },
    { id: 79, ident: DB_STATUS.done, name: 'Done', completed: true },
  ],
  priorities: [
    { id: 82, ident: DB_PRIORITY.high, name: 'High', completed: false },
  ],
};

function page(overrides: Partial<PageEntity> = {}) {
  return {
    id: 2,
    uuid: '00000000-0000-0000-0000-000000000002',
    name: 'aug 18th, 2026',
    journalDay: 20260818,
    properties: {},
    ...overrides,
  } as PageEntity;
}

describe('TaskEntity', () => {
  it('preserves legacy task parsing', () => {
    const block = {
      uuid: '00000000-0000-0000-0000-000000000001',
      content: 'TODO [#A] Ship release\nSCHEDULED: <2026-08-18 Tue>',
      marker: 'TODO',
      priority: 'A',
      scheduled: 20260818,
    } as unknown as BlockEntity;
    const task = new TaskEntity(block, page(), {
      graphMode: 'legacy',
      metadata: { statuses: [], priorities: [] },
      treatJournalEntriesAsScheduled: true,
    }).toObject();

    expect(task.content).toBe('Ship release');
    expect(task.marker).toBe('TODO');
    expect(task.priority).toBe(TaskPriority.HIGH);
    expect(task.scheduled).toBe(20260818);
  });

  it('reads DB task title and structured properties', () => {
    const scheduledAt = new Date('2026-08-20T09:30:00+02:00').getTime();
    const block = {
      uuid: '00000000-0000-0000-0000-000000000001',
      title: '**Ship release**',
      ':logseq.property/status': 76,
      ':logseq.property/priority': 82,
      ':logseq.property/scheduled': scheduledAt,
      ':logseq.property.repeat/repeated?': true,
    } as unknown as BlockEntity;
    const task = new TaskEntity(block, page(), {
      graphMode: 'db',
      metadata,
      treatJournalEntriesAsScheduled: true,
    }).toObject();

    expect(task.rawContent).toBe('**Ship release**');
    expect(task.content).toBe('Ship release');
    expect(task.marker).toBe('Todo');
    expect(task.statusId).toBe(76);
    expect(task.priority).toBe(TaskPriority.HIGH);
    expect(task.scheduled).toBe(Number(dayjs(scheduledAt).format('YYYYMMDD')));
    expect(task.repeated).toBe(true);
  });

  it('uses a journal date only when configured', () => {
    const block = {
      uuid: '00000000-0000-0000-0000-000000000001',
      title: 'Journal task',
      ':logseq.property/status': 76,
    } as unknown as BlockEntity;

    expect(
      new TaskEntity(block, page(), {
        graphMode: 'db',
        metadata,
        treatJournalEntriesAsScheduled: true,
      }).scheduled,
    ).toBe(20260818);
    expect(
      new TaskEntity(block, page(), {
        graphMode: 'db',
        metadata,
        treatJournalEntriesAsScheduled: false,
      }).scheduled,
    ).toBeUndefined();
  });

  it('recognizes imported todo-ignore properties', () => {
    const block = {
      uuid: '00000000-0000-0000-0000-000000000001',
      title: 'Ignored task',
      ':logseq.property/status': 76,
    } as unknown as BlockEntity;
    const task = new TaskEntity(
      block,
      page({ properties: { ':user.property/todo-ignore-aB12_-xy': true } }),
      {
        graphMode: 'db',
        metadata,
        treatJournalEntriesAsScheduled: true,
      },
    );

    expect(task.getPageProperty('todoIgnore')).toBe(true);
  });
});
