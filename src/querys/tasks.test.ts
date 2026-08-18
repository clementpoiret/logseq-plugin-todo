import { describe, expect, it } from 'vitest';
import getTasksQuery from './tasks';

describe('task query', () => {
  it('uses structured statuses in database graphs', () => {
    expect(getTasksQuery('db')).toContain(':logseq.property/status');
    expect(getTasksQuery('db')).not.toContain(':block/marker');
  });

  it('keeps marker queries for file graphs', () => {
    expect(getTasksQuery('legacy')).toContain(':block/marker');
    expect(getTasksQuery('legacy')).not.toContain(':logseq.property/status');
  });
});
