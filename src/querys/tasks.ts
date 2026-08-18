import { GraphMode } from '../state/graph';

export default function getTasksQuery(graphMode: GraphMode) {
  const taskAttribute =
    graphMode === 'db' ? ':logseq.property/status' : ':block/marker';

  return `
    [:find (pull ?b [*])
     :where
     [?b ${taskAttribute}]]
  `;
}
