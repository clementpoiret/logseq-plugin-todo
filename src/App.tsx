import 'virtual:windi.css';
import React, { useEffect, useRef } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import TaskInput, { ITaskInputRef } from './components/TaskInput';
import TaskSection, { GroupBy } from './components/TaskSection';
import TaskFilter from './components/TaskFilter';
import { logseq as plugin } from '../package.json';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { visibleState } from './state/visible';
import { userConfigsState } from './state/user-configs';
import { themeStyleState } from './state/theme';
import { settingsState } from './state/settings';
import * as api from './api';
import { fixPreferredDateFormat } from './utils';
import './style.css';
import { markerState, priorityState } from './state/filter';
import { TaskMarker, TaskPriority } from './models/TaskEntity';
import { useRefreshAll } from './hooks/useRefreshAll';
import { useHotKey } from './hooks/useHotKey';
import { dbTaskMetadataState, graphModeState } from './state/graph';
import { loadDbTaskMetadata } from './logseq-db';
import { TaskSectionType } from './querys/sections';

dayjs.extend(advancedFormat);

function ErrorFallback({ error }: FallbackProps) {
  return (
    <div role="alert" className="text-red-500">
      <p className="font-semibold">Todo list failed to render.</p>
      <p className="text-sm">Can you re-index your graph and try again?</p>
      <p className="text-sm">[Error]: {error.message}</p>
    </div>
  );
}

function App() {
  const innerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ITaskInputRef>(null);
  const visible = useRecoilValue(visibleState);
  const [userConfigs, setUserConfigs] = useRecoilState(userConfigsState);
  const themeStyle = useRecoilValue(themeStyleState);
  const settings = useRecoilValue(settingsState);
  const marker = useRecoilValue(markerState);
  const priority = useRecoilValue(priorityState);
  const refreshAll = useRefreshAll();
  const graphMode = useRecoilValue(graphModeState);
  const setDbTaskMetadata = useSetRecoilState(dbTaskMetadataState);

  useHotKey(settings.hotkey);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      refreshAll();
    }

    logseq.App.getUserConfigs().then((configs) => {
      setUserConfigs((current) => ({ ...current, ...configs }));
    });
    if (graphMode === 'db') {
      loadDbTaskMetadata().then(setDbTaskMetadata).catch(console.error);
    }
  }, [visible, refreshAll, setUserConfigs, graphMode, setDbTaskMetadata]);

  const handleClickOutside = (e: React.MouseEvent) => {
    if (!innerRef.current?.contains(e.target as unknown as Node)) {
      window.logseq.hideMainUI();
    }
  };

  const createNewTask = async (content: string) => {
    const { preferredDateFormat, preferredTodo } = userConfigs!;
    const { whereToPlaceNewTask } = settings;
    const date = dayjs().format(
      fixPreferredDateFormat(preferredDateFormat ?? 'yyyy-MM-dd'),
    );
    await api.createNewTask(date, content, {
      graphMode,
      marker:
        marker.value ||
        settings.defaultMarker ||
        (graphMode === 'db'
          ? TaskMarker.TODO
          : (preferredTodo as TaskMarker) || TaskMarker.LATER),
      priority: priority.value as TaskPriority,
      whereToPlaceNewTask,
    });
    refreshAll();
  };

  return (
    <main
      className={`w-screen h-screen ${visible ? 'block' : 'hidden'}`}
      onClick={handleClickOutside}
    >
      <div ref={innerRef} id={plugin.id}>
        <div
          className="absolute p-4 w-90 h-120 -left-13rem bg-white shadow rounded-lg overflow-y-auto scrollbar-hide border-2 transition-all transition-200"
          style={{
            backgroundColor: themeStyle.primaryBackgroundColor,
            borderColor: themeStyle.secondaryBackgroundColor,
          }}
        >
          {/*
            The DB graph worker may not be connected yet when the plugin loads,
            so tasks are only queried while the panel is open, and toggling the
            panel clears a failed render so the next open queries again.
          */}
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            resetKeys={[visible]}
            onResetKeysChange={refreshAll}
          >
            <TaskInput ref={inputRef} onCreateTask={createNewTask} />
            <TaskFilter />
            {visible && (
              <div>
                <TaskSection title="Today" section={TaskSectionType.Today} />
                {settings.showNextNDaysTask && (
                  <TaskSection
                    title={`Next ${settings.numberOfNextNDays} Days`}
                    section={TaskSectionType.NextNDays}
                  />
                )}
                <TaskSection
                  title="Scheduled"
                  section={TaskSectionType.Scheduled}
                />
                <TaskSection
                  title="Anytime"
                  section={TaskSectionType.Anytime}
                  groupBy={GroupBy.Page}
                />
              </div>
            )}
          </ErrorBoundary>
        </div>
      </div>
    </main>
  );
}

export default App;
