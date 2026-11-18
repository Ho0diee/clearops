import React, { useEffect, useRef } from 'react';
import type {
  CalendarBlock,
  IdeaItem,
  OpsState,
  PacedGoal,
  ReminderItem,
} from '../types/schema';

interface IncomingSchoolworkOutbox {
  version: number;
  managedPrefix: 'sch-';
  projectsToEnsure: string[];
  blocks: CalendarBlock[];
  reminders: ReminderItem[];
  ideas: IdeaItem[];
  pacedGoals: PacedGoal[];
}

const EXTRACTOR_SYNC_URL = 'http://127.0.0.1:5174/api/intuition/sync';

function sortCalendarBlocks(blocks: CalendarBlock[]): CalendarBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

export function useSchoolworkExtractorBridge(
  state: OpsState,
  setState: React.Dispatch<React.SetStateAction<OpsState>>
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  const appliedVersionRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    // Only poll local Schoolwork Extractor when running on localhost / 127.0.0.1 / LAN HTTP
    const isHttpsProd =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    if (isHttpsProd) return;

    const runSyncTick = async () => {
      if (inFlightRef.current || document.visibilityState === 'hidden') return;
      inFlightRef.current = true;

      try {
        const cur = stateRef.current;
        const resp = await fetch(EXTRACTOR_SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientOutboxVersion: appliedVersionRef.current,
            snapshot: {
              selectedDate: cur.selectedDate,
              blocks: cur.blocks,
              reminders: cur.reminders,
              ideas: cur.ideas,
              pacedGoals: cur.pacedGoals,
              projects: cur.projects,
            },
          }),
        });

        if (!resp.ok) return;
        const data = (await resp.json()) as {
          ok: boolean;
          hasUpdate?: boolean;
          outbox?: IncomingSchoolworkOutbox;
          currentVersion?: number;
        };

        if (!data.ok || !data.hasUpdate || !data.outbox) {
          if (typeof data.currentVersion === 'number') {
            appliedVersionRef.current = data.currentVersion;
          }
          return;
        }

        const outbox = data.outbox;
        const wasInitialConnect = appliedVersionRef.current === 0;
        appliedVersionRef.current = outbox.version;

        setState((prev) => {
          const prevManagedMap = new Map<string, CalendarBlock>();
          for (const b of prev.blocks) {
            if (b.id.startsWith('sch-')) prevManagedMap.set(b.id, b);
          }

          // Preserve user manual drag/time moves or checkmarks already made in Intuition
          const mergedIncomingBlocks = outbox.blocks.map((inc) => {
            const localExisting = prevManagedMap.get(inc.id);
            if (!localExisting) return inc;
            return {
              ...inc,
              date: localExisting.date,
              startTime: localExisting.startTime,
              endTime: localExisting.endTime,
              completed: localExisting.completed || inc.completed,
              customColor: localExisting.customColor || inc.customColor,
            };
          });

          const nonManagedBlocks = prev.blocks.filter((b) => !b.id.startsWith('sch-'));
          const nonManagedReminders = prev.reminders.filter((r) => !r.id.startsWith('sch-'));
          const nonManagedIdeas = prev.ideas.filter((i) => !i.id.startsWith('sch-'));
          const nonManagedGoals = prev.pacedGoals.filter((g) => !g.id.startsWith('sch-'));

          const nextProjects = Array.from(
            new Set([...prev.projects, ...(outbox.projectsToEnsure || [])])
          );

          const hadNewItems = mergedIncomingBlocks.length !== prevManagedMap.size;

          return {
            ...prev,
            projects: nextProjects,
            blocks: sortCalendarBlocks([...nonManagedBlocks, ...mergedIncomingBlocks]),
            reminders: [...nonManagedReminders, ...outbox.reminders],
            ideas: [...nonManagedIdeas, ...outbox.ideas],
            pacedGoals: [...nonManagedGoals, ...outbox.pacedGoals],
            toastMessage:
              !wasInitialConnect || hadNewItems
                ? `Schoolwork Extractor synced (${mergedIncomingBlocks.length} blocks, ${outbox.reminders.length} pins)`
                : prev.toastMessage,
          };
        });
      } catch {
        // Silently ignore when Schoolwork Extractor server isn't running
      } finally {
        inFlightRef.current = false;
      }
    };

    runSyncTick();
    const timer = window.setInterval(runSyncTick, 3500);
    window.addEventListener('focus', runSyncTick);
    document.addEventListener('visibilitychange', runSyncTick);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', runSyncTick);
      document.removeEventListener('visibilitychange', runSyncTick);
    };
  }, [setState]);
}
