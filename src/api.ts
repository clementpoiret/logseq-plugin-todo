import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import dayjs from 'dayjs';
import { TaskEntityObject, TaskMarker, TaskPriority } from './models/TaskEntity';
import { GraphMode } from './state/graph';
import {
  DB_PROPERTY,
  DB_STATUS,
  dbPropertyApiKey,
  findPriorityChoice,
  findStatusChoice,
  loadDbTaskMetadata,
} from './logseq-db';

export const MARKER_GROUPS: Record<string, TaskMarker[]> = {
  [TaskMarker.TODO]: [TaskMarker.TODO, TaskMarker.DOING],
  [TaskMarker.LATER]: [TaskMarker.LATER, TaskMarker.NOW],
};

export interface ITaskOptions {
  graphMode?: GraphMode;
  marker?: TaskMarker | string;
  markerGroup?: (TaskMarker | string)[];
  priority?: TaskPriority | string;
  whereToPlaceNewTask?: string;
}

export function isTodayTask(task: TaskEntityObject) {
  const { scheduled } = task;
  if (!scheduled) return false;
  return dayjs().format('YYYYMMDD') === scheduled.toString();
}

function blockText(block: BlockEntity) {
  return block.title ?? block.content ?? '';
}

async function insertTaskBlock(
  page: { name: string; uuid: string },
  content: string,
  whereToPlaceNewTask?: string,
) {
  const blocksTree =
    (await logseq.Editor.getPageBlocksTree(page.uuid)) ?? [];
  if (!whereToPlaceNewTask) {
    return logseq.Editor.appendBlockInPage(page.name, content);
  }

  let parentBlock = blocksTree.find(
    (block) => blockText(block) === whereToPlaceNewTask,
  );
  if (!parentBlock) {
    parentBlock =
      (await logseq.Editor.appendBlockInPage(page.name, whereToPlaceNewTask)) ??
      undefined;
  }
  if (!parentBlock) throw new Error('Unable to create the task parent block.');
  return logseq.Editor.insertBlock(parentBlock.uuid, content);
}

async function createDbTask(content: string, opts: ITaskOptions) {
  const metadata = await loadDbTaskMetadata();
  const status =
    findStatusChoice(metadata, opts.marker) ??
    metadata.statuses.find((choice) => choice.ident === DB_STATUS.todo);
  if (!status) throw new Error('Logseq Todo status is unavailable.');

  const taskTag =
    (await logseq.Editor.getTag('logseq.class/Task')) ??
    (await logseq.Editor.getTag('Task'));
  if (!taskTag) throw new Error('Logseq Task tag is unavailable.');

  let page = await logseq.Editor.getTodayPage();
  if (!page) page = await logseq.Editor.createJournalPage(new Date());
  if (!page) throw new Error("Unable to open today's journal page.");

  const block = await insertTaskBlock(
    page,
    content,
    opts.whereToPlaceNewTask,
  );
  if (!block) throw new Error('Unable to create the task block.');

  try {
    await logseq.Editor.addBlockTag(block.uuid, taskTag.uuid);
    await logseq.Editor.upsertBlockProperty(
      block.uuid,
      dbPropertyApiKey(DB_PROPERTY.status),
      status.id,
    );

    const priority = findPriorityChoice(metadata, opts.priority);
    if (priority) {
      await logseq.Editor.upsertBlockProperty(
        block.uuid,
        dbPropertyApiKey(DB_PROPERTY.priority),
        priority.id,
      );
    }
  } catch (error) {
    await logseq.Editor.removeBlock(block.uuid);
    throw error;
  }
}

async function createLegacyTask(
  date: string,
  content: string,
  opts: ITaskOptions,
) {
  const marker = opts.marker ?? TaskMarker.LATER;
  const priority = opts.priority;
  const rawContent = `${marker}${priority ? ` [#${priority}]` : ''} ${content}`;
  let page = await logseq.Editor.getPage(date);
  if (!page) {
    page = await logseq.Editor.createPage(
      date,
      {},
      { journal: true, redirect: false },
    );
  }
  if (!page) throw new Error("Unable to create today's journal page.");

  const blocksTree = (await logseq.Editor.getPageBlocksTree(page.uuid)) ?? [];
  const block = await insertTaskBlock(
    page,
    rawContent,
    opts.whereToPlaceNewTask,
  );
  if (!block) throw new Error('Unable to create the task block.');

  if (blocksTree.length === 1 && blockText(blocksTree[0]) === '') {
    await logseq.Editor.removeBlock(blocksTree[0].uuid);
  }
}

export async function createNewTask(
  date: string,
  content: string,
  opts: ITaskOptions,
) {
  if (opts.graphMode === 'db') return createDbTask(content, opts);
  return createLegacyTask(date, content, opts);
}

export async function toggleTaskStatus(
  task: TaskEntityObject,
  options: ITaskOptions & Required<Pick<ITaskOptions, 'marker'>>,
) {
  if (task.graphMode === 'db') {
    const metadata = await loadDbTaskMetadata();
    const nextStatus = task.completed
      ? findStatusChoice(metadata, options.marker) ??
        metadata.statuses.find((choice) => choice.ident === DB_STATUS.todo)
      : metadata.statuses.find((choice) => choice.ident === DB_STATUS.done);
    if (!nextStatus) throw new Error('Unable to resolve the next task status.');
    return logseq.Editor.upsertBlockProperty(
      task.uuid,
      dbPropertyApiKey(DB_PROPERTY.status),
      nextStatus.id,
    );
  }

  const nextMarker = task.completed ? options.marker : TaskMarker.DONE;
  const newContent = task.rawContent.replace(
    new RegExp(`^${escapeRegExp(task.marker)}`),
    nextMarker,
  );
  return logseq.Editor.updateBlock(task.uuid, newContent);
}

interface IOpenTaskOptions {
  openInRightSidebar?: boolean;
}

export function openTask(task: TaskEntityObject, opts?: IOpenTaskOptions) {
  if (opts?.openInRightSidebar) {
    return logseq.Editor.openInRightSidebar(task.uuid);
  }
  return logseq.Editor.scrollToBlockInPage(task.page.name, task.uuid);
}

export function openTaskPage(
  page: TaskEntityObject['page'],
  opts?: IOpenTaskOptions,
) {
  if (opts?.openInRightSidebar) {
    return logseq.Editor.openInRightSidebar(page.uuid);
  }
  return logseq.Editor.scrollToBlockInPage(page.name, page.uuid);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function toggleTaskMarker(
  task: TaskEntityObject,
  options: ITaskOptions & Required<Pick<ITaskOptions, 'markerGroup'>>,
) {
  const { markerGroup } = options;
  if (markerGroup.length === 0) return;
  const currentIndex = markerGroup.findIndex((marker) => marker === task.marker);
  const newMarker = markerGroup[(currentIndex + 1) % markerGroup.length];

  if (task.graphMode === 'db') {
    const metadata = await loadDbTaskMetadata();
    const status = findStatusChoice(metadata, newMarker);
    if (!status) throw new Error(`Unknown Logseq task status: ${newMarker}`);
    return logseq.Editor.upsertBlockProperty(
      task.uuid,
      dbPropertyApiKey(DB_PROPERTY.status),
      status.id,
    );
  }

  const newRawContent = task.rawContent.replace(
    new RegExp(`^${escapeRegExp(task.marker)}`),
    newMarker,
  );
  return logseq.Editor.updateBlock(task.uuid, newRawContent);
}

export async function setTaskScheduled(
  task: TaskEntityObject,
  date: Date | null,
) {
  if (task.graphMode === 'db') {
    if (date === null) {
      return logseq.Editor.removeBlockProperty(
        task.uuid,
        dbPropertyApiKey(DB_PROPERTY.scheduled),
      );
    }
    return logseq.Editor.upsertBlockProperty(
      task.uuid,
      dbPropertyApiKey(DB_PROPERTY.scheduled),
      dayjs(date).startOf('day').valueOf(),
    );
  }

  let newRawContent = task.rawContent;
  if (date === null) {
    newRawContent = task.rawContent.replace(/SCHEDULED: <[^>]+>/, '');
    return logseq.Editor.updateBlock(task.uuid, newRawContent);
  }

  const scheduledString = `SCHEDULED: <${dayjs(date).format(
    'YYYY-MM-DD ddd',
  )}>`;
  if (task.rawContent.includes('SCHEDULED')) {
    newRawContent = task.rawContent.replace(
      /SCHEDULED: <[^>]+>/,
      scheduledString,
    );
  } else {
    const lines = task.rawContent.split('\n');
    lines.splice(1, 0, scheduledString);
    newRawContent = lines.join('\n');
  }

  return logseq.Editor.updateBlock(task.uuid, newRawContent);
}
