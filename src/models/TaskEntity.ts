import removeMarkdown from 'remove-markdown';
import { BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin.user';
import { getBlockUUID } from '../utils';
import dayjs from 'dayjs';
import {
  DB_PROPERTY,
  DbTaskMetadata,
  getPropertyValue,
  getReferenceId,
  priorityFromDbChoice,
} from '../logseq-db';
import { GraphMode } from '../state/graph';

export enum TaskMarker {
  BACKLOG = 'Backlog',
  LATER = 'LATER',
  NOW = 'NOW',
  TODO = 'TODO',
  DOING = 'DOING',
  IN_REVIEW = 'In Review',
  DONE = 'DONE',
  CANCELED = 'Canceled',
  WAITING = 'WAITING',
}

export enum TaskPriority {
  URGENT = 'URGENT',
  HIGH = 'A',
  MEDIUM = 'B',
  LOW = 'C',
  NONE = 'NONE'
}

export const TASK_PRIORITY_WEIGHT = {
  [TaskPriority.URGENT]: 200,
  [TaskPriority.HIGH]: 100,
  [TaskPriority.MEDIUM]: 50,
  [TaskPriority.LOW]: 10,
  [TaskPriority.NONE]: 0,
};

export interface TaskEntityObject {
  graphMode: GraphMode;
  uuid: string;
  content: string;
  rawContent: string;
  marker: TaskMarker | string;
  statusId: number | undefined;
  statusIdent: string | undefined;
  priority: TaskPriority;
  priorityId: number | undefined;
  scheduled: number | undefined;
  repeated: boolean;
  completed: boolean;
  page: {
    name: string;
    uuid: string;
    journalDay: number | undefined;
    updatedAt: number | undefined;
  }
}

class TaskEntity {
  private block: BlockEntity;
  private page: PageEntity;
  private _content: string;
  private graphMode: GraphMode;
  private metadata: DbTaskMetadata;
  private treatJournalEntriesAsScheduled: boolean;

  constructor(
    block: BlockEntity,
    page: PageEntity,
    options: {
      graphMode: GraphMode;
      metadata: DbTaskMetadata;
      treatJournalEntriesAsScheduled: boolean;
    },
  ) {
    this.block = block;
    this.page = page;
    this.graphMode = options.graphMode;
    this.metadata = options.metadata;
    this.treatJournalEntriesAsScheduled =
      options.treatJournalEntriesAsScheduled;
    this._content = this.trimContent(this.rawContent);
  }

  public get uuid(): string {
    return getBlockUUID(this.block);
  }

  public get content(): string {
    return this._content;
  }

  public set content(value: string) {
    this._content = this.trimContent(value);
  }

  public trimContent(rawContent: string): string {
    let content = rawContent;
    if (this.graphMode === 'legacy') {
      content = content.replace(this.block.marker as string, '');
      content = content.replace(`[#${this.block.priority}]`, '');
      content = content.replace(/SCHEDULED: <[^>]+>/, '');
      content = content.replace(/DEADLINE: <[^>]+>/, '');
      content = content.replace(/(:LOGBOOK:)|(\*\s.*)|(:END:)|(CLOCK:.*)/gm, '');
      content = content.replace(/id::[^:]+/, '');
    }
    content = removeMarkdown(content);
    return content.trim();
  }

  public get rawContent(): string {
    return ((this.graphMode === 'db'
      ? this.block.title ?? this.block.content
      : this.block.content ?? this.block.title) ?? '') as string;
  }

  private get statusChoice() {
    const id = this.statusId;
    return this.metadata.statuses.find((choice) => choice.id === id);
  }

  public get statusId(): number | undefined {
    if (this.graphMode === 'legacy') return undefined;
    return getReferenceId(
      getPropertyValue(
        this.block as unknown as Record<string, unknown>,
        DB_PROPERTY.status,
      ),
    );
  }

  public get statusIdent(): string | undefined {
    return this.statusChoice?.ident;
  }

  public get marker(): TaskMarker | string {
    if (this.graphMode === 'legacy') return this.block.marker as TaskMarker;
    return this.statusChoice?.name ?? this.statusIdent ?? 'Todo';
  }

  public get priority(): TaskPriority {
    if (this.graphMode === 'db') {
      return priorityFromDbChoice(
        this.metadata.priorities.find((choice) => choice.id === this.priorityId),
      );
    }
    return (this.block.priority ?? TaskPriority.NONE) as TaskPriority;
  }

  public get priorityId(): number | undefined {
    if (this.graphMode === 'legacy') return undefined;
    return getReferenceId(
      getPropertyValue(
        this.block as unknown as Record<string, unknown>,
        DB_PROPERTY.priority,
      ),
    );
  }

  public get scheduled(): number | undefined {
    const explicit =
      this.graphMode === 'db'
        ? getPropertyValue(
            this.block as unknown as Record<string, unknown>,
            DB_PROPERTY.scheduled,
          ) ??
          getPropertyValue(
            this.block as unknown as Record<string, unknown>,
            DB_PROPERTY.deadline,
          )
        : this.block.scheduled ?? this.block.deadline;
    if (explicit !== undefined && explicit !== null) {
      if (this.graphMode === 'legacy') return explicit as number;
      const date = dayjs(Number(explicit));
      return date.isValid() ? Number(date.format('YYYYMMDD')) : undefined;
    }
    return this.treatJournalEntriesAsScheduled
      ? (this.page.journalDay as number | undefined)
      : undefined;
  }

  public get repeated(): boolean {
    if (this.graphMode === 'db') {
      return Boolean(
        getPropertyValue(
          this.block as unknown as Record<string, unknown>,
          DB_PROPERTY.repeated,
        ),
      );
    }
    return !!this.block.repeated;
  }

  public get completed(): boolean {
    if (this.graphMode === 'db') return Boolean(this.statusChoice?.completed);
    return this.marker === TaskMarker.DONE;
  }

  public getPageProperty<T>(key: string): T {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const sources = [
      this.page.properties ?? {},
      this.page as unknown as Record<string, unknown>,
    ];
    for (const source of sources) {
      for (const [propertyKey, value] of Object.entries(source)) {
        const propertyName = (
          propertyKey.split('/').pop() ?? propertyKey
        ).replace(/-[a-z0-9_-]{8}$/i, '');
        if (propertyName.replace(/[^a-z0-9]/gi, '').toLowerCase() === normalizedKey) {
          return value as T;
        }
      }
    }
    return undefined as T;
  }

  public toObject(): TaskEntityObject {
    return {
      graphMode: this.graphMode,
      uuid: this.uuid,
      content: this._content,
      rawContent: this.rawContent,
      marker: this.marker,
      statusId: this.statusId,
      statusIdent: this.statusIdent,
      priority: this.priority,
      priorityId: this.priorityId,
      scheduled: this.scheduled,
      repeated: this.repeated,
      completed: this.completed,
      page: {
        name: this.page.name,
        uuid: this.page.uuid,
        journalDay: this.page['journalDay'],
        updatedAt: this.page.updatedAt,
      },
    };
  }
}

export default TaskEntity;
