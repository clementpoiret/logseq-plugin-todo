import { BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin';
import { selectorFamily } from 'recoil';
import TaskEntity, {
  TaskEntityObject,
  TaskMarker,
  TASK_PRIORITY_WEIGHT,
} from '../models/TaskEntity';
import { getBlockUUID, isValidUUID } from '../utils';
import { markerState, priorityState, sortState, SortType } from './filter';
import { GraphMode } from './graph';
import getTasksQuery from '../querys/tasks';
import {
  EMPTY_DB_TASK_METADATA,
  getActiveDbStatuses,
  loadDbTaskMetadata,
} from '../logseq-db';
import { isTaskInSection, TaskSectionType } from '../querys/sections';

export interface TaskQueryOptions {
  [key: string]: GraphMode | string[] | boolean | number | TaskSectionType;
  graphMode: GraphMode;
  customMarkers: string[];
  treatJournalEntriesAsScheduled: boolean;
}

export interface FilteredTasksOptions extends TaskQueryOptions {
  section: TaskSectionType;
  numberOfNextNDays: number;
  showNextNDaysTask: boolean;
}

function isTruthyProperty(value: unknown) {
  return value === true || String(value).toLowerCase() === 'true';
}

async function getTaskEntities(options: TaskQueryOptions) {
  const metadata =
    options.graphMode === 'db'
      ? await loadDbTaskMetadata()
      : EMPTY_DB_TASK_METADATA;
  const collections = await logseq.DB.datascriptQuery<BlockEntity[][]>(
    getTasksQuery(options.graphMode),
  );

  const tasks = await Promise.all(
    (collections ?? []).map(async ([item]) => {
      const uuid = getBlockUUID(item);
      const block = await logseq.Editor.getBlock(uuid, {
        includeChildren: true,
      });
      if (!block) return null;

      const pageRef = block.page as PageEntity | number;
      const pageIdentity =
        typeof pageRef === 'number' ? pageRef : pageRef?.id ?? pageRef?.name;
      if (pageIdentity === undefined) return null;

      const page = await logseq.Editor.getPage(pageIdentity);
      if (!page) return null;

      if (options.graphMode === 'db') {
        page.properties =
          (await logseq.Editor.getPageProperties(page.id)) ?? page.properties;
      } else if (page.journalDay) {
        const blocksTree = await logseq.Editor.getPageBlocksTree(page.uuid);
        page.properties = Object.assign(
          page.properties ?? {},
          blocksTree?.[0]?.properties ?? {},
        );
      }

      const taskEntity = new TaskEntity(block, page, {
        graphMode: options.graphMode,
        metadata,
        treatJournalEntriesAsScheduled:
          options.treatJournalEntriesAsScheduled,
      });

      if (
        taskEntity.content.startsWith('((') &&
        taskEntity.content.endsWith('))')
      ) {
        const referencedUuid = taskEntity.content.slice(2, -2);
        if (isValidUUID(referencedUuid)) {
          const referencedBlock = await logseq.Editor.getBlock(referencedUuid, {
            includeChildren: true,
          });
          if (referencedBlock) {
            const content = referencedBlock.title ?? referencedBlock.content;
            taskEntity.content = typeof content === 'string' ? content : '';
          }
        }
      }
      return taskEntity;
    }),
  );

  const activeDbStatusIds = new Set(
    getActiveDbStatuses(metadata, options.customMarkers).map(
      (choice) => choice.id,
    ),
  );
  const activeLegacyMarkers = new Set<string>([
    TaskMarker.NOW,
    TaskMarker.LATER,
    TaskMarker.TODO,
    TaskMarker.DOING,
    ...options.customMarkers,
  ]);

  return tasks
    .filter((task): task is TaskEntity => {
      if (!task || isTruthyProperty(task.getPageProperty('todoIgnore'))) {
        return false;
      }
      return options.graphMode === 'db'
        ? task.statusId !== undefined && activeDbStatusIds.has(task.statusId)
        : activeLegacyMarkers.has(task.marker);
    })
    .map((task) => task.toObject())
    .sort((a, b) => {
      if (a.scheduled !== undefined || b.scheduled !== undefined) {
        if (a.scheduled === b.scheduled) {
          return (
            TASK_PRIORITY_WEIGHT[b.priority] -
            TASK_PRIORITY_WEIGHT[a.priority]
          );
        }
        return (b.scheduled ?? 0) - (a.scheduled ?? 0);
      }

      if (a.page.updatedAt !== undefined || b.page.updatedAt !== undefined) {
        if (a.page.updatedAt === b.page.updatedAt) {
          return (
            TASK_PRIORITY_WEIGHT[b.priority] -
            TASK_PRIORITY_WEIGHT[a.priority]
          );
        }
        return (b.page.updatedAt ?? 0) - (a.page.updatedAt ?? 0);
      }

      return 0;
    });
}

export const tasksState = selectorFamily<
  TaskEntityObject[],
  TaskQueryOptions
>({
  key: 'tasks',
  get: (options) => () => getTaskEntities(options),
  cachePolicy_UNSTABLE: {
    eviction: 'most-recent',
  },
});

export const filterdTasksState = selectorFamily<
  TaskEntityObject[],
  FilteredTasksOptions
>({
  key: 'filterd-tasks',
  get:
    (options) =>
    ({ get }) => {
      const tasks = get(
        tasksState({
          graphMode: options.graphMode,
          customMarkers: options.customMarkers,
          treatJournalEntriesAsScheduled:
            options.treatJournalEntriesAsScheduled,
        }),
      );
      const marker = get(markerState);
      const priority = get(priorityState);
      const sort = get(sortState);

      return tasks
        .filter((task) => {
          if (marker.value && task.marker !== marker.value) return false;
          if (priority.value && task.priority !== priority.value) return false;
          return isTaskInSection(task, { ...options, type: options.section });
        })
        .sort((a, b) => {
          if (a.scheduled === undefined || b.scheduled === undefined) return 0;
          return sort.value === SortType.Asc
            ? a.scheduled - b.scheduled
            : b.scheduled - a.scheduled;
        });
    },
});
