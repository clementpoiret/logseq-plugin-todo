import dayjs, { ConfigType } from 'dayjs';
import { TaskEntityObject } from '../models/TaskEntity';

export enum TaskSectionType {
  Today = 'today',
  NextNDays = 'next-n-days',
  Scheduled = 'scheduled',
  Anytime = 'anytime',
}

export interface TaskSectionOptions {
  type: TaskSectionType;
  numberOfNextNDays: number;
  showNextNDaysTask: boolean;
  now?: ConfigType;
}

export function isTaskInSection(
  task: TaskEntityObject,
  options: TaskSectionOptions,
) {
  const today = Number(dayjs(options.now).format('YYYYMMDD'));
  const next = Number(
    dayjs(options.now).add(options.numberOfNextNDays, 'day').format('YYYYMMDD'),
  );
  const scheduled = task.scheduled;

  switch (options.type) {
    case TaskSectionType.Today:
      return scheduled !== undefined && scheduled <= today;
    case TaskSectionType.NextNDays:
      return scheduled !== undefined && scheduled > today && scheduled <= next;
    case TaskSectionType.Scheduled:
      return (
        scheduled !== undefined &&
        scheduled > (options.showNextNDaysTask ? next : today)
      );
    case TaskSectionType.Anytime:
      return scheduled === undefined;
  }
}
