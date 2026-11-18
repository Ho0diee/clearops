import React, { useEffect, useRef } from 'react';
import type {
  CalendarBlock,
  IdeaItem,
  OpsState,
  PacedGoal,
  ReminderItem,
} from '../types/schema';
import { createEmptyTombstones, type SyncTombstones } from './universalMerge';
import { loadLocalTombstones, saveLocalTombstones } from './universalSyncClient';

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
const MANAGED_COURSE_PROJECTS = ['AP Env Science', 'AP Lit', 'AP Pre-Calc'];

function sortCalendarBlocks(blocks: CalendarBlock[]): CalendarBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

export function useSchoolworkExtractorBridge(
  state: OpsState,
  setState: React.Dispatch<React.SetStateAction<OpsState>>,
  tombstonesRef: React.MutableRefObject<SyncTombstones | null>
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  const appliedVersionRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    const isHttpsProd =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    if (isHttpsProd) return;

    let cancelled = false;

    const runSyncTick = async () => {
      if (cancelled || inFlightRef.current) return;
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

        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as {
          ok: boolean;
          hasUpdate?: boolean;
          outbox?: IncomingSchoolworkOutbox;
          currentVersion?: number;
        };

        if (cancelled) return;

        if (!data.ok || !data.hasUpdate || !data.outbox) {
          if (typeof data.currentVersion === 'number') {
            appliedVersionRef.current = data.currentVersion;
          }
          return;
        }

        const outbox = data.outbox;
        const wasInitialConnect = appliedVersionRef.current === 0;
        appliedVersionRef.current = outbox.version;

        const nowMs = Date.now();
        const baseTs = tombstonesRef.current ?? loadLocalTombstones() ?? createEmptyTombstones();
        const nextTombstones: SyncTombstones = {
          blocks: { ...baseTs.blocks },
          reminders: { ...baseTs.reminders },
          ideas: { ...baseTs.ideas },
          pacedGoals: { ...baseTs.pacedGoals },
          projects: { ...baseTs.projects },
          offloadedTasks: { ...baseTs.offloadedTasks },
          checkups: { ...baseTs.checkups },
        };

        const outBlockIds = new Set(outbox.blocks.map((b) => b.id));
        const outRemIds = new Set(outbox.reminders.map((r) => r.id));
        const outIdeaIds = new Set(outbox.ideas.map((i) => i.id));
        const outGoalIds = new Set(outbox.pacedGoals.map((g) => g.id));

        // Tombstone any removed sch-* entities so Cloud Sync also purges them permanently!
        for (const b of cur.blocks) {
          if (b.id.startsWith('sch-') && !outBlockIds.has(b.id)) {
            nextTombstones.blocks[b.id] = nowMs;
          }
        }
        for (const b of outbox.blocks) {
          delete nextTombstones.blocks[b.id];
        }

        for (const r of cur.reminders) {
          if (r.id.startsWith('sch-') && !outRemIds.has(r.id)) {
            nextTombstones.reminders[r.id] = nowMs;
          }
        }
        for (const r of outbox.reminders) {
          delete nextTombstones.reminders[r.id];
        }

        for (const i of cur.ideas) {
          if (i.id.startsWith('sch-') && !outIdeaIds.has(i.id)) {
            nextTombstones.ideas[i.id] = nowMs;
          }
        }
        for (const i of outbox.ideas) {
          delete nextTombstones.ideas[i.id];
        }

        for (const g of cur.pacedGoals) {
          if (g.id.startsWith('sch-') && !outGoalIds.has(g.id)) {
            nextTombstones.pacedGoals[g.id] = nowMs;
          }
        }
        for (const g of outbox.pacedGoals) {
          delete nextTombstones.pacedGoals[g.id];
        }

        const activeCourseProjs = new Set(outbox.projectsToEnsure || []);
        for (const proj of MANAGED_COURSE_PROJECTS) {
          const hasNonManagedIdea = cur.ideas.some(
            (i) => !i.id.startsWith('sch-') && i.project === proj
          );
          if (!activeCourseProjs.has(proj) && !hasNonManagedIdea) {
            if (cur.projects.includes(proj)) {
              nextTombstones.projects[proj] = nowMs;
            }
          } else {
            delete nextTombstones.projects[proj];
          }
        }

        tombstonesRef.current = nextTombstones;
        saveLocalTombstones(nextTombstones);

        setState((prev) => {
          const prevManagedMap = new Map<string, CalendarBlock>();
          for (const b of prev.blocks) {
            if (b.id.startsWith('sch-')) prevManagedMap.set(b.id, b);
          }

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

          const allNextIdeas = [...nonManagedIdeas, ...outbox.ideas];
          const managedProjectSet = new Set(MANAGED_COURSE_PROJECTS);
          const baseProjects = prev.projects.filter(
            (p) => !managedProjectSet.has(p) || allNextIdeas.some((i) => i.project === p)
          );
          const nextProjects = Array.from(
            new Set([...baseProjects, ...(outbox.projectsToEnsure || [])])
          );

          const hadChange =
            mergedIncomingBlocks.length !== prevManagedMap.size ||
            outbox.ideas.length !== prev.ideas.length - nonManagedIdeas.length;

          return {
            ...prev,
            projects: nextProjects,
            blocks: sortCalendarBlocks([...nonManagedBlocks, ...mergedIncomingBlocks]),
            reminders: [...nonManagedReminders, ...outbox.reminders],
            ideas: allNextIdeas,
            pacedGoals: [...nonManagedGoals, ...outbox.pacedGoals],
            toastMessage:
              hadChange && mergedIncomingBlocks.length === 0 && outbox.ideas.length === 0
                ? 'Cleared all test Eco & Extractor items from calendar'
                : !wasInitialConnect && hadChange
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

    const initTimer = window.setTimeout(runSyncTick, 150);
    const timer = window.setInterval(runSyncTick, 3500);
    window.addEventListener('focus', runSyncTick);
    document.addEventListener('visibilitychange', runSyncTick);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      window.clearInterval(timer);
      window.removeEventListener('focus', runSyncTick);
      document.removeEventListener('visibilitychange', runSyncTick);
    };
  }, [setState, tombstonesRef]);
}
