import React, { useEffect, useRef } from 'react';
import type { OpsState } from '../types/schema';
import type { SchoolDelayRecord, SyncTombstones } from './universalMerge';
import {
  getEasternNow,
  hasAutoSchoolworkSection,
  reconcileSchoolworkLifecycle,
} from '../schoolwork/standardizedEngine';

interface BookmarkletHashPayload {
  courseId?: 'eco' | 'lit' | 'precalc' | 'physics';
  slideTitle?: string;
  slideUrl?: string;
  rawText?: string;
  ts?: number;
}

/**
 * Runs inside Intuition (no local PC server required; paired with Vercel's hourly schedule):
 * 1. Receives user-triggered 1-click bookmarklet payloads (`#schoolwork-sync=...`) directly on
 *    https://airbnb710.com and sends them straight to Vercel `/api/schoolwork/run` (Gemini 4 Hydrogen).
 * 2. Enforces the 2-hour unfinished homework rollover rule -> moves unfinished `sch-hw-*` blocks
 *    to the next day's next available empty space or Senior Privileges (+30m home) / after-school (+30m home) slot.
 * 3. Keeps OHCHS class entries (`ohchs-YYYY-MM-DD-p5` etc.) updated with `DUE TODAY` descriptions
 *    and the 6:00 PM night-before alarm (`360 + classStartMins`), disabling the alarm once completed.
 */
export function useSchoolworkExtractorBridge(
  state: OpsState,
  setState: React.Dispatch<React.SetStateAction<OpsState>>,
  _tombstonesRef?: React.MutableRefObject<SyncTombstones | null>,
  ohchsDelaysRef?: React.MutableRefObject<Record<string, SchoolDelayRecord>>,
  onCloudPullNeeded?: () => void
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  const processedHashSigRef = useRef<string | null>(null);
  const cloudPullRef = useRef(onCloudPullNeeded);
  cloudPullRef.current = onCloudPullNeeded;

  // 1. Handle user-clicked Bookmarklet `#schoolwork-sync=...` directly on airbnb710.com -> Vercel API
  useEffect(() => {
    const processHashSync = async () => {
      const hash = window.location.hash || '';
      if (!hash.startsWith('#schoolwork-sync=')) return;

      const encoded = hash.slice('#schoolwork-sync='.length);
      window.history.replaceState({}, '', window.location.pathname + window.location.search);

      try {
        const parsed = JSON.parse(decodeURIComponent(encoded)) as BookmarkletHashPayload;
        if (!parsed?.rawText?.trim()) return;

        const sig = `${parsed.courseId || 'eco'}:${parsed.ts || 0}:${parsed.rawText.length}`;
        if (processedHashSigRef.current === sig) return;
        processedHashSigRef.current = sig;

        const courseLabel =
          parsed.courseId === 'lit'
            ? 'Lit'
            : parsed.courseId === 'precalc'
            ? 'Pre-Calc'
            : parsed.courseId === 'physics'
            ? 'Physics'
            : 'Eco';

        setState((prev) => ({
          ...prev,
          toastMessage: `Extracting ${courseLabel} slide via Gemini 4 Hydrogen on Vercel...`,
        }));

        const isLocalDev =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        const apiUrl = isLocalDev
          ? 'https://airbnb710.com/api/schoolwork/run'
          : '/api/schoolwork/run';

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'webhook-ingest',
            courseId: parsed.courseId || 'eco',
            slideTitle: parsed.slideTitle || `${courseLabel} Google Slide`,
            rawSlideText: parsed.rawText,
          }),
        });

        const data = (await resp.json()) as {
          ok?: boolean;
          addedCount?: number;
          updatedCount?: number;
          summary?: string;
          error?: string;
        };

        if (!resp.ok || !data.ok) {
          setState((prev) => ({
            ...prev,
            toastMessage: `Slide sync error: ${data.error || resp.statusText}`,
          }));
          return;
        }

        // Pull fresh Vercel Blob workspace straight into Intuition immediately
        cloudPullRef.current?.();
        window.setTimeout(() => {
          cloudPullRef.current?.();
        }, 900);

        setState((prev) => ({
          ...prev,
          toastMessage: `Synced ${courseLabel} (+${data.addedCount ?? 0} new, ${
            data.updatedCount ?? 0
          } updated) — calendar & 6pm alerts updated!`,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          toastMessage:
            err instanceof Error
              ? `Slide sync error: ${err.message}`
              : 'Could not read slide bookmarklet payload',
        }));
      }
    };

    void processHashSync();
    const onHashChange = () => {
      void processHashSync();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setState]);

  // 2. Periodic 2-hour missed-window rollover & 6:00 PM night-before class alert monitor
  useEffect(() => {
    const checkLifecycle = () => {
      const cur = stateRef.current;
      const hasAnySchoolHw = cur.blocks.some(
        (b) =>
          b.id.startsWith('sch-hw-') ||
          (b.id.startsWith('ohchs-') && hasAutoSchoolworkSection(b.notes))
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
