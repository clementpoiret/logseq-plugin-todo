import { atom } from 'recoil';
import type { DbTaskMetadata } from '../logseq-db';

export type GraphMode = 'legacy' | 'db';

export const graphModeState = atom<GraphMode>({
  key: 'graphMode',
  default: 'legacy',
});

export const dbTaskMetadataState = atom<DbTaskMetadata>({
  key: 'dbTaskMetadata',
  default: { statuses: [], priorities: [] },
});
