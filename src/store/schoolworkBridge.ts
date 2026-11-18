import React, { useEffect, useRef } from 'react';
import type { OpsState } from '../types/schema';
import type { SchoolDelayRecord, SyncTombstones } from './universalMerge';
import {
  getEasternNow,
  reconcileSchoolworkLifecycle,
} from '../schoolwork/standardizedEngine';

/**
 * Runs 100% inside Intuition (no local PC daemon required; paired with Vercel's hourly schedule):
 * - Enforces the 2-hour unfinished homework rollover rule -> moves unfinished `sch-hw-*` blocks
 *   to the next day's next available empty space or Senior Privileges (+30m home) / after-school (+30m home) slot.
 * - Keeps OHCHS class entries (`ohchs-YYYY-MM-DD-p5` etc.) updated with `DUE TODAY` descriptions
 *   and the 6:00 PM night-before alarm (`360 + classStartMins`), disabling the alarm once completed.
 */
export function useSchoolworkExtractorBridge(
  state: OpsState,
  setState: React.Dispatch<React.SetStateAction<OpsState>>,
  _tombstonesRef?: React.MutableRefObject<SyncTombstones | null>,
  ohchsDelaysRef?: React.MutableRefObject<Record<string, SchoolDelayRecord>>
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const checkLifecycle = () => {
      const cur = stateRef.current;
      const hasAnySchoolHw = cur.blocks.some(
        (b) =>
          b.id.startsWith('sch-hw-') ||
          (b.id.startsWith('ohchs-') && b.notes?.includes('--- Homework & Deadlines ---'))
      );
      if (!hasAnySchoolHw) return;

      const { todayIso, nowMinutesOfDay } = getEasternNow();
      const res = reconcileSchoolworkLifecycle({
        blocks: cur.blocks,
        todayIso,
        nowMinutesOfDay,
        delaysByDate: ohchsDelaysRef?.current ?? {},
      });

      if (res.changed) {
        setState((prev) => ({
          ...prev,
          blocks: res.blocks,
        }));
      }
    };

    const initId = window.setTimeout(checkLifecycle, 600);
    const intervalId = window.setInterval(checkLifecycle, 45_000);
    window.addEventListener('focus', checkLifecycle);
    document.addEventListener('visibilitychange', checkLifecycle);

    return () => {
      window.clearTimeout(initId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkLifecycle);
      document.removeEventListener('visibilitychange', checkLifecycle);
    };
  }, [setState, ohchsDelaysRef]);
}
