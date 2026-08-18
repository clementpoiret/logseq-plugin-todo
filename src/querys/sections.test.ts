import { describe, expect, it } from 'vitest';
import { TaskEntityObject, TaskPriority } from '../models/TaskEntity';
import { isTaskInSection, TaskSectionType } from './sections';

function task(scheduled?: number) {
  return {
    graphMode: 'db',
    uuid: '00000000-0000-0000-0000-000000000001',
    content: 'Task',
    rawContent: 'Task',
    marker: 'Todo',
    statusId: 76,
    statusIdent: ':logseq.property/status.todo',
    priority: TaskPriority.NONE,
    priorityId: undefined,
    scheduled,
    repeated: false,
    completed: false,
    page: {
      name: 'page',
      uuid: '00000000-0000-0000-0000-000000000002',
      journalDay: undefined,
      updatedAt: undefined,
    },
  } as TaskEntityObject;
}

const base = {
  numberOfNextNDays: 14,
  showNextNDaysTask: true,
  now: '2026-08-18',
};

describe('task sections', () => {
  it('partitions overdue, near-future, later, and anytime tasks', () => {
    expect(
      isTaskInSection(task(20260817), { ...base, type: TaskSectionType.Today }),
    ).toBe(true);
    expect(
      isTaskInSection(task(20260818), { ...base, type: TaskSectionType.Today }),
    ).toBe(true);
    expect(
      isTaskInSection(task(20260819), {
        ...base,
        type: TaskSectionType.NextNDays,
      }),
    ).toBe(true);
    expect(
      isTaskInSection(task(20260901), {
        ...base,
        type: TaskSectionType.NextNDays,
      }),
    ).toBe(true);
    expect(
      isTaskInSection(task(20260902), {
        ...base,
        type: TaskSectionType.Scheduled,
      }),
    ).toBe(true);
    expect(
      isTaskInSection(task(), { ...base, type: TaskSectionType.Anytime }),
    ).toBe(true);
  });

  it('puts all future tasks in Scheduled when Next N Days is disabled', () => {
    expect(
      isTaskInSection(task(20260819), {
        ...base,
        showNextNDaysTask: false,
        type: TaskSectionType.Scheduled,
      }),
    ).toBe(true);
  });
});
