import type { GraphMode } from './state/graph';
import { TaskPriority } from './models/TaskEntity';

export const DB_PROPERTY = {
  status: ':logseq.property/status',
  priority: ':logseq.property/priority',
  scheduled: ':logseq.property/scheduled',
  deadline: ':logseq.property/deadline',
  repeated: ':logseq.property.repeat/repeated?',
} as const;

export const DB_STATUS = {
  backlog: ':logseq.property/status.backlog',
  todo: ':logseq.property/status.todo',
  doing: ':logseq.property/status.doing',
  inReview: ':logseq.property/status.in-review',
  done: ':logseq.property/status.done',
  canceled: ':logseq.property/status.canceled',
} as const;

export const DB_PRIORITY = {
  urgent: ':logseq.property/priority.urgent',
  high: ':logseq.property/priority.high',
  medium: ':logseq.property/priority.medium',
  low: ':logseq.property/priority.low',
} as const;

export interface DbChoice {
  id: number;
  ident?: string;
  name: string;
  order?: string;
  completed: boolean;
}

export interface DbTaskMetadata {
  statuses: DbChoice[];
  priorities: DbChoice[];
}

export const EMPTY_DB_TASK_METADATA: DbTaskMetadata = {
  statuses: [],
  priorities: [],
};

export function dbPropertyApiKey(property: string) {
  return property.replace(/^:/, '');
}

const CHOICES_QUERY = `
  [:find (pull ?choice [:db/id :db/ident :block/title :block/order :logseq.property/choice-checkbox-state]) ?property-ident
   :where
   [?choice :block/closed-value-property ?property]
   [?property :db/ident ?property-ident]
   [(contains? #{:logseq.property/status :logseq.property/priority} ?property-ident)]]
`;

function getNamespacedValue(entity: Record<string, unknown>, key: string) {
  return entity[key] ?? entity[key.replace(/^:/, '')];
}

function normalizeIdent(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.startsWith(':') ? value : `:${value}`;
}

function parseChoice(entity: Record<string, unknown>): DbChoice | null {
  const id = entity.id;
  const name = entity.title;
  if (typeof id !== 'number' || typeof name !== 'string') return null;

  return {
    id,
    ident: normalizeIdent(entity.ident),
    name,
    order: typeof entity.order === 'string' ? entity.order : undefined,
    completed:
      getNamespacedValue(entity, ':logseq.property/choice-checkbox-state') === true,
  };
}

export async function detectGraphMode(): Promise<GraphMode> {
  const checkCurrentIsDbGraph = logseq.App.checkCurrentIsDbGraph;
  if (typeof checkCurrentIsDbGraph !== 'function') return 'legacy';

  try {
    return (await checkCurrentIsDbGraph.call(logseq.App)) ? 'db' : 'legacy';
  } catch (error) {
    console.warn('Unable to detect Logseq graph type; using legacy mode.', error);
    return 'legacy';
  }
}

export async function loadDbTaskMetadata(): Promise<DbTaskMetadata> {
  const rows = await logseq.DB.datascriptQuery<
    Array<[Record<string, unknown>, string]>
  >(CHOICES_QUERY);

  const metadata: DbTaskMetadata = { statuses: [], priorities: [] };
  for (const [entity, propertyIdent] of rows ?? []) {
    const choice = parseChoice(entity);
    if (!choice) continue;

    const ident = normalizeIdent(propertyIdent);
    if (ident === DB_PROPERTY.status) metadata.statuses.push(choice);
    if (ident === DB_PROPERTY.priority) metadata.priorities.push(choice);
  }

  const byOrder = (a: DbChoice, b: DbChoice) =>
    (a.order ?? '').localeCompare(b.order ?? '');
  metadata.statuses.sort(byOrder);
  metadata.priorities.sort(byOrder);
  return metadata;
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^:/, '')
    .replace(/^logseq\.property\//, '')
    .replace(/^status\./, '')
    .replace(/^priority\./, '')
    .replace(/[\s_]+/g, '-');
}

const LEGACY_STATUS_ALIASES: Record<string, string> = {
  later: DB_STATUS.todo,
  todo: DB_STATUS.todo,
  now: DB_STATUS.doing,
  doing: DB_STATUS.doing,
  'in-progress': DB_STATUS.doing,
  wait: DB_STATUS.backlog,
  waiting: DB_STATUS.backlog,
  backlog: DB_STATUS.backlog,
  'in-review': DB_STATUS.inReview,
  done: DB_STATUS.done,
  canceled: DB_STATUS.canceled,
  cancelled: DB_STATUS.canceled,
};

export function statusIdentForAlias(value: string): string | undefined {
  return LEGACY_STATUS_ALIASES[normalizeToken(value)];
}

export function findStatusChoice(
  metadata: DbTaskMetadata,
  value: string | undefined,
): DbChoice | undefined {
  if (!value) return undefined;
  const aliasIdent = statusIdentForAlias(value);
  const token = normalizeToken(value);

  return metadata.statuses.find((choice) => {
    if (aliasIdent && choice.ident === aliasIdent) return true;
    if (choice.ident && normalizeToken(choice.ident) === token) return true;
    return normalizeToken(choice.name) === token;
  });
}

export function statusNamesMatch(left: string, right: string) {
  const leftAlias = statusIdentForAlias(left);
  const rightAlias = statusIdentForAlias(right);
  if (leftAlias || rightAlias) return leftAlias === rightAlias;
  return normalizeToken(left) === normalizeToken(right);
}

export function getActiveDbStatuses(
  metadata: DbTaskMetadata,
  customMarkers: string[],
) {
  const activeBuiltIns = new Set<string>([
    DB_STATUS.backlog,
    DB_STATUS.todo,
    DB_STATUS.doing,
    DB_STATUS.inReview,
  ]);

  return metadata.statuses.filter((choice) => {
    if (choice.completed) return false;
    if (choice.ident === DB_STATUS.done || choice.ident === DB_STATUS.canceled) {
      return false;
    }
    if (choice.ident && activeBuiltIns.has(choice.ident)) return true;
    return customMarkers.some((marker) => statusNamesMatch(choice.name, marker));
  });
}

export function priorityFromDbChoice(choice: DbChoice | undefined): TaskPriority {
  switch (choice?.ident) {
    case DB_PRIORITY.urgent:
      return TaskPriority.URGENT;
    case DB_PRIORITY.high:
      return TaskPriority.HIGH;
    case DB_PRIORITY.medium:
      return TaskPriority.MEDIUM;
    case DB_PRIORITY.low:
      return TaskPriority.LOW;
    default:
      return TaskPriority.NONE;
  }
}

export function findPriorityChoice(
  metadata: DbTaskMetadata,
  priority: TaskPriority | string | undefined,
) {
  if (!priority || priority === TaskPriority.NONE) return undefined;
  const ident = {
    [TaskPriority.URGENT]: DB_PRIORITY.urgent,
    [TaskPriority.HIGH]: DB_PRIORITY.high,
    [TaskPriority.MEDIUM]: DB_PRIORITY.medium,
    [TaskPriority.LOW]: DB_PRIORITY.low,
  }[priority];
  const token = normalizeToken(priority);

  return metadata.priorities.find(
    (choice) =>
      choice.ident === ident ||
      normalizeToken(choice.name) === token ||
      (choice.ident ? normalizeToken(choice.ident) === token : false),
  );
}

export function getPropertyValue(
  entity: Record<string, unknown>,
  key: string,
): unknown {
  const properties = entity.properties as Record<string, unknown> | undefined;
  return (
    getNamespacedValue(entity, key) ??
    (properties ? getNamespacedValue(properties, key) : undefined)
  );
}

export function getReferenceId(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'number' ? id : undefined;
}
