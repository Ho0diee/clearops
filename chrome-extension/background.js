const DEFAULTS = {
  vercelUrl: 'https://airbnb710.com/api/schoolwork/run',
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
  litClassroomUrl: 'https://classroom.google.com/u/1/w/ODc2NjEwODUwOTA2/t/all',
  mathClassroomUrl: 'https://classroom.google.com/u/1/c/ODY2Njc4NTA5ODM3',
  physicsClassroomUrl: 'https://classroom.google.com/u/1/c/ODcyNDg1NzU5NTU3',
  litSlideId: '',
  precalcSlideId: '',
  autoSyncHours: 6,
};

const AUTO_SYNC_ALARM = 'intuition-auto-sync';

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function ensureAutoSyncAlarm(forceReset = false) {
  const cfg = await getConfig();
  const hours = Number(cfg.autoSyncHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    await chrome.alarms.clear(AUTO_SYNC_ALARM);
    return null;
  }
  const periodInMinutes = Math.max(15, Math.round(hours * 60));
  const existing = await chrome.alarms.get(AUTO_SYNC_ALARM);
  if (!forceReset && existing && existing.periodInMinutes === periodInMinutes) {
    return existing;
  }
  await chrome.alarms.clear(AUTO_SYNC_ALARM);
  chrome.alarms.create(AUTO_SYNC_ALARM, {
    delayInMinutes: periodInMinutes,
    periodInMinutes,
  });
  return chrome.alarms.get(AUTO_SYNC_ALARM);
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title,
    message: String(message || '').slice(0, 260),
  });
}

function looksLikeLoginOrHtml(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    return true;
  }
  if (trimmed.includes('accounts.google.com/ServiceLogin')) {
    return true;
  }
  return false;
}

function cleanSlideId(raw) {
  return String(raw || '')
    .replace(/^.*\/presentation\/(?:u\/\d+\/)?d\//, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Fetches live CSV from your APES Audiobook Sheet across multi-login Chrome slots (/u/0..3/).
 */
async function fetchLiveAudiobookCsv(sheetId) {
  if (!sheetId) return null;
  const cleanId = sheetId
    .replace(/^.*\/spreadsheets\/(?:u\/\d+\/)?d\//, '')
    .replace(/\/.*$/, '')
    .trim();

  const urls = [
    `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/0/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/1/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/2/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/3/d/${cleanId}/export?format=csv&gid=0`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { credentials: 'include', redirect: 'follow' });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!looksLikeLoginOrHtml(text) && text.includes('Module')) {
        return text;
      }
    } catch {
      // Try next account slot
    }
  }
  return null;
}

/**
 * Fetches a Google Slide deck as plain text across multi-login Chrome slots (/u/0..3/).
 */
async function fetchGoogleSlideTxt(slideId, preferredPrefix) {
  const cleanId = cleanSlideId(slideId);
  if (!cleanId) return null;

  const urls = [];
  if (preferredPrefix) {
    urls.push(`https://docs.google.com${preferredPrefix}/export/txt`);
  }
  urls.push(
    `https://docs.google.com/presentation/d/${cleanId}/export/txt`,
    `https://docs.google.com/presentation/u/0/d/${cleanId}/export/txt`,
    `https://docs.google.com/presentation/u/1/d/${cleanId}/export/txt`,
    `https://docs.google.com/presentation/u/2/d/${cleanId}/export/txt`,
    `https://docs.google.com/presentation/u/3/d/${cleanId}/export/txt`
  );

  for (const url of Array.from(new Set(urls))) {
    try {
      const resp = await fetch(url, { credentials: 'include', redirect: 'follow' });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!looksLikeLoginOrHtml(text) && text.trim().length > 20) {
        return text;
      }
    } catch {
      // Try next slot
    }
  }
  return null;
}

/**
 * Fallback DOM reader if the user is viewing a slide whose teacher disabled File -> Download.
 */
async function readOpenSlideTabFallback(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const svgLines = Array.from(document.querySelectorAll('svg text'))
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean);

        const chunkLines = [];
        const seen = new Set();
        const strRegex = /"((?:\\.|[^"\\]){2,500})"/g;

        for (const sc of Array.from(document.scripts)) {
          const t = sc.textContent || '';
          if (t.indexOf('DOCS_modelChunk') === -1) continue;
          let m;
          strRegex.lastIndex = 0;
          while ((m = strRegex.exec(t)) !== null) {
            let s = m[1];
            try {
              s = JSON.parse('"' + s + '"');
            } catch {}
            s = String(s).replace(/\r/g, '').trim();
            if (!s || s.length < 2 || seen.has(s)) continue;
            if (
              /^(https?:|data:|blob:|#[0-9a-f]{3,8}$|g[0-9a-f_]{5,}$|[a-z]{1,3}\d+(_\d+)*$)/i.test(
                s
              )
            )
              continue;
            if (/^[A-Z0-9]+_[A-Z0-9_]+$/.test(s)) continue;
            if (
              s.indexOf(' ') === -1 &&
              !/(\d{1,2}\/\d{1,2}|\d{4}|due|lab|test|quiz|exam|hw|unit|mon|tue|wed|thu|fri)/i.test(
                s
              )
            )
              continue;
            if (/\S{60,}/.test(s)) continue;
            seen.add(s);
            chunkLines.push(s);
          }
        }

        const combined = [
          svgLines.length ? '--- Active Slide ---\n' + svgLines.join('\n') : '',
          chunkLines.length ? '--- Presentation Slides ---\n' + chunkLines.join('\n') : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 140000);

        return {
          title: document.title.replace(/\s*-\s*Google Slides$/i, '') || 'Eco Google Slide',
          text: combined,
        };
      },
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

/**
 * Parses a Google Classroom URL into its class ID, preferred /u/N/ slot, and view type ('c' or 'w').
 */
function parseClassroomUrl(rawUrl) {
  const cleaned = String(rawUrl || '').trim();
  if (!cleaned) return null;
  const m = cleaned.match(
    /https?:\/\/classroom\.google\.com\/(?:u\/(\d+)\/)?(c|w)\/([A-Za-z0-9_-]+)/i
  );
  if (!m) {
    return {
      rawUrl: cleaned,
      slot: null,
      view: null,
      classId: null,
    };
  }
  return {
    rawUrl: cleaned,
    slot: m[1] !== undefined ? Number(m[1]) : 0,
    view: m[2].toLowerCase(),
    classId: m[3],
  };
}

function buildClassroomViewUrl(classId, slot, view) {
  const prefix = `https://classroom.google.com/u/${slot}`;
  return view === 'w' ? `${prefix}/w/${classId}/t/all` : `${prefix}/c/${classId}`;
}

function waitForTabComplete(tabId, timeoutMs = 22000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve(ok);
    };

    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === 'complete') {
        finish(true);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t?.status === 'complete') finish(true);
      })
      .catch(() => finish(false));
  });
}

/**
 * Opens ONE temporary background tab for a Google Classroom page, waits for the SPA to render,
 * expands recent assignment items so full homework instructions & due dates are visible,
 * extracts structured text, and immediately closes the tab (zero leftover RAM usage!).
 */
async function scrapeSingleClassroomUrl(url) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    if (!tab?.id) {
      return { ok: false, error: 'Could not open background tab', finalUrl: url };
    }

    await waitForTabComplete(tab.id, 22000);

    const refreshed = await chrome.tabs.get(tab.id).catch(() => null);
    const currentUrl = refreshed?.url || url;
    if (
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('ServiceLogin')
    ) {
      return { ok: false, needsSignIn: true, finalUrl: currentUrl, error: 'Not signed in to Google' };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // 1. Wait for Classroom SPA content to finish hydrating
        const start = Date.now();
        while (Date.now() - start < 10000) {
          const txt = (document.body?.innerText || '').trim();
          const hasCards =
            document.querySelectorAll('[data-stream-item-id], [role="listitem"], main').length > 0;
          if (txt.length > 220 && hasCards) break;
          await sleep(350);
        }
        await sleep(1200);

        const bodyCheck = (document.body?.innerText || '').trim();
        if (
          /class not found|look for it in|you don'?t have access|sign in to continue|choose an account/i.test(
            bodyCheck
          )
        ) {
          return {
            ok: false,
            wrongAccountOrMissing: true,
            finalUrl: window.location.href,
            title: document.title,
            snippet: bodyCheck.slice(0, 300),
          };
        }

        // 2. Expand top 14 collapsed assignment rows inside <main> so full instructions appear
        const mainRoot = document.querySelector('main') || document.body;
        const expandCandidates = Array.from(
          mainRoot.querySelectorAll(
            'li [role="button"][aria-expanded="false"], [data-stream-item-id] [role="button"][aria-expanded="false"]'
          )
        ).slice(0, 14);

        for (const btn of expandCandidates) {
          try {
            btn.click();
            await sleep(140);
          } catch {
            // ignore
          }
        }

        // Also click any "Read more" / "View more" text toggles on top stream announcements
        const moreBtns = Array.from(mainRoot.querySelectorAll('button, [role="button"]'))
          .filter((el) => /^(read more|show more)$/i.test((el.textContent || '').trim()))
          .slice(0, 8);
        for (const btn of moreBtns) {
          try {
            btn.click();
            await sleep(120);
          } catch {
            // ignore
          }
        }

        if (expandCandidates.length > 0 || moreBtns.length > 0) {
          await sleep(700);
        }

        // 3. Extract structured items (preserving titles, due dates, turned-in status, and links)
        const streamItems = Array.from(mainRoot.querySelectorAll('[data-stream-item-id]'));
        const sections = [];
        const seenTexts = new Set();

        const collectItemText = (el) => {
          const text = (el.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((l) => l.trim())
            .filter(
              (l) =>
                l &&
                !/^(More options|Options|Add class comment|Send|Post|Class comments)$/i.test(l)
            )
            .join('\n');
          if (!text || text.length < 8) return null;

          const links = Array.from(el.querySelectorAll('a[href]'))
            .map((a) => {
              const href = a.href || '';
              const label = (a.textContent || a.getAttribute('aria-label') || '').trim();
              if (
                !href ||
                href.startsWith('javascript:') ||
                href.includes('classroom.google.com/u/') && !href.includes('/details') && !href.includes('/a/')
              ) {
                return null;
              }
              return label ? `${label} (${href})` : href;
            })
            .filter(Boolean)
            .slice(0, 5);

          return links.length ? `${text}\nLinks: ${links.join(' | ')}` : text;
        };

        if (streamItems.length > 0) {
          for (const item of streamItems.slice(0, 25)) {
            const block = collectItemText(item);
            if (block && !seenTexts.has(block)) {
              seenTexts.add(block);
              sections.push(block);
            }
          }
        }

        // Always include main innerText fallback if structured list was small/empty
        const mainText = (mainRoot.innerText || '')
          .replace(/\r/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');

        const combined =
          sections.length >= 2
            ? sections.join('\n\n---\n\n')
            : mainText;

        return {
          ok: combined.length > 40,
          finalUrl: window.location.href,
          title: document.title || 'Google Classroom',
          text: combined.slice(0, 45000),
        };
      },
    });

    return (
      results?.[0]?.result || {
        ok: false,
        finalUrl: currentUrl,
        error: 'No script result returned from Classroom page',
      }
    );
  } catch (err) {
    return {
      ok: false,
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

/**
 * Scrapes a configured Google Classroom course:
 * - Reads the exact configured page URL first (e.g. /w/.../t/all or /c/...).
 * - Automatically detects if the school account is on /u/0/ instead of /u/1/ (or vice versa).
 * - Also pulls the companion Classroom tab (Classwork + Stream) for that exact class ID so both
 *   Stream announcements ("due in class") and Classwork due dates + instructions are captured!
 */
async function scrapeClassroomCourse(rawUrl, preferredSlotOverride = null) {
  const parsed = parseClassroomUrl(rawUrl);
  if (!parsed) return { ok: false, error: 'Empty Classroom URL' };

  if (!parsed.classId) {
    const single = await scrapeSingleClassroomUrl(parsed.rawUrl);
    return {
      ...single,
      sourceUrls: [single.finalUrl || parsed.rawUrl],
      resolvedSlot: preferredSlotOverride,
    };
  }

  const slotCandidates = Array.from(
    new Set([
      ...(preferredSlotOverride !== null ? [preferredSlotOverride] : []),
      parsed.slot ?? 1,
      0,
      1,
      2,
    ])
  );

  const primaryView = parsed.view === 'w' ? 'w' : 'c';
  const secondaryView = primaryView === 'w' ? 'c' : 'w';

  let primaryRes = null;
  let workingSlot = parsed.slot ?? 1;

  for (const slot of slotCandidates) {
    const tryUrl = buildClassroomViewUrl(parsed.classId, slot, primaryView);
    const res = await scrapeSingleClassroomUrl(tryUrl);
    if (res.ok) {
      primaryRes = res;
      workingSlot = slot;
      break;
    }
    if (!res.wrongAccountOrMissing && !res.needsSignIn) {
      primaryRes = res;
      break;
    }
  }

  if (!primaryRes?.ok) {
    return {
      ok: false,
      error:
        primaryRes?.error ||
        'Could not read Classroom page — make sure you are signed into your school Google account.',
      sourceUrls: [parsed.rawUrl],
      resolvedSlot: preferredSlotOverride,
    };
  }

  // Pull the companion tab (Classwork if configured as Stream, or Stream if configured as Classwork)
  const secondaryUrl = buildClassroomViewUrl(parsed.classId, workingSlot, secondaryView);
  const secondaryRes = await scrapeSingleClassroomUrl(secondaryUrl);

  const parts = [
    `=== SPECIFIED SOURCE PAGE (${primaryView === 'w' ? 'Classwork' : 'Stream'}): ${primaryRes.finalUrl} ===\n${primaryRes.text}`,
  ];
  const sourceUrls = [primaryRes.finalUrl];

  if (secondaryRes?.ok && secondaryRes.text) {
    parts.push(
      `=== COMPANION CLASSROOM PAGE (${secondaryView === 'w' ? 'Classwork' : 'Stream'}): ${secondaryRes.finalUrl} ===\n${secondaryRes.text}`
    );
    sourceUrls.push(secondaryRes.finalUrl);
  }

  return {
    ok: true,
    title: primaryRes.title || 'Google Classroom',
    primarySourceUrl: primaryRes.finalUrl,
    sourceUrls,
    resolvedSlot: workingSlot,
    text: parts.join('\n\n').slice(0, 95000),
  };
}

let isSyncing = false;

async function postToIntuition(vercelUrl, payload) {
  const resp = await fetch(vercelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || `Vercel returned HTTP ${resp.status}`);
  }
  return data;
}

async function runFullSync(activeTab) {
  if (isSyncing) {
    return { ok: false, error: 'Sync already in progress...' };
  }
  isSyncing = true;
  setBadge('...', '#2563EB');

  try {
    const cfg = await getConfig();
    const tabUrl = activeTab?.url || '';
    const slidePathMatch = tabUrl.match(
      /^https:\/\/docs\.google\.com(\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+))/
    );

    const audiobookCsv = await fetchLiveAudiobookCsv(cfg.audiobookSheetId);

    let totalAdded = 0;
    let totalUpdated = 0;
    const summaries = [];
    const failures = [];
    const sourceLog = [];

    // ------------------------------------------------------------------
    // 1. Google Slides targets (Eco primary + optional Lit / Pre-Calc slides)
    // ------------------------------------------------------------------
    const slideTargets = [];
    if (cfg.ecoSlideId) {
      const cleanId = cleanSlideId(cfg.ecoSlideId);
      const isOpenTab = slidePathMatch && slidePathMatch[2] === cleanId;
      slideTargets.push({
        courseId: 'eco',
        label: 'Eco',
        slideId: cleanId,
        slideTitle: 'AP Environmental Science (APES) Agenda 2026-2027',
        sourceUrl: `https://docs.google.com/presentation/d/${cleanId}/edit`,
        preferredPrefix: isOpenTab ? slidePathMatch[1] : null,
        allowTabDomFallback: Boolean(isOpenTab),
      });
    }
    if (cfg.litSlideId) {
      const cleanId = cleanSlideId(cfg.litSlideId);
      const isOpenTab = slidePathMatch && slidePathMatch[2] === cleanId;
      slideTargets.push({
        courseId: 'lit',
        label: 'Lit Slide',
        slideId: cleanId,
        slideTitle: 'AP Lit Slide',
        sourceUrl: `https://docs.google.com/presentation/d/${cleanId}/edit`,
        preferredPrefix: isOpenTab ? slidePathMatch[1] : null,
        allowTabDomFallback: Boolean(isOpenTab),
      });
    }
    if (cfg.precalcSlideId) {
      const cleanId = cleanSlideId(cfg.precalcSlideId);
      const isOpenTab = slidePathMatch && slidePathMatch[2] === cleanId;
      slideTargets.push({
        courseId: 'precalc',
        label: 'Pre-Calc Slide',
        slideId: cleanId,
        slideTitle: 'AP Pre-Calc Slide',
        sourceUrl: `https://docs.google.com/presentation/d/${cleanId}/edit`,
        preferredPrefix: isOpenTab ? slidePathMatch[1] : null,
        allowTabDomFallback: Boolean(isOpenTab),
      });
    }

    for (const target of slideTargets) {
      try {
        let finalSlideText = await fetchGoogleSlideTxt(target.slideId, target.preferredPrefix);
        let finalSlideTitle = target.slideTitle;

        if (!finalSlideText && target.allowTabDomFallback && activeTab?.id) {
          const domRes = await readOpenSlideTabFallback(activeTab.id);
          if (domRes?.text) {
            finalSlideText = domRes.text;
            finalSlideTitle = domRes.title || finalSlideTitle;
          }
        }

        if (!finalSlideText) {
          failures.push(target.label);
          sourceLog.push({
            course: target.label,
            sourceUrl: target.sourceUrl,
            ok: false,
            detail: 'Could not read slide (sign into school Google account)',
          });
          continue;
        }

        const data = await postToIntuition(cfg.vercelUrl, {
          action: 'webhook-ingest',
          courseId: target.courseId,
          slideTitle: finalSlideTitle,
          sourceUrl: target.sourceUrl,
          rawSlideText: finalSlideText,
          audiobookSheetCsv: target.courseId === 'eco' ? audiobookCsv || undefined : undefined,
        });

        totalAdded += data.addedCount || 0;
        totalUpdated += data.updatedCount || 0;
        const sum = `${target.label}: +${data.addedCount || 0} new, ${data.updatedCount || 0} upd`;
        summaries.push(sum);
        sourceLog.push({
          course: target.label,
          sourceUrl: target.sourceUrl,
          ok: true,
          detail: data.summary || sum,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(target.label);
        sourceLog.push({
          course: target.label,
          sourceUrl: target.sourceUrl,
          ok: false,
          detail: msg,
        });
      }
    }

    // ------------------------------------------------------------------
    // 2. Google Classroom targets (Lit, Math / Pre-Calc, Physics)
    // ------------------------------------------------------------------
    const classroomTargets = [
      {
        courseId: 'lit',
        label: 'Lit (Classroom)',
        url: (cfg.litClassroomUrl || '').trim(),
      },
      {
        courseId: 'precalc',
        label: 'Math (Classroom)',
        url: (cfg.mathClassroomUrl || '').trim(),
      },
      {
        courseId: 'physics',
        label: 'Physics (Classroom)',
        url: (cfg.physicsClassroomUrl || '').trim(),
      },
    ].filter((t) => Boolean(t.url));

    let detectedSchoolSlot = null;

    for (const target of classroomTargets) {
      try {
        const scraped = await scrapeClassroomCourse(target.url, detectedSchoolSlot);
        if (scraped.resolvedSlot !== null && scraped.resolvedSlot !== undefined) {
          detectedSchoolSlot = scraped.resolvedSlot;
        }

        if (!scraped.ok || !scraped.text) {
          failures.push(target.label);
          sourceLog.push({
            course: target.label,
            sourceUrl: target.url,
            ok: false,
            detail: scraped.error || 'Could not read Classroom page',
          });
          continue;
        }

        const data = await postToIntuition(cfg.vercelUrl, {
          action: 'webhook-ingest',
          courseId: target.courseId,
          slideTitle: `${scraped.title} (Google Classroom)`,
          sourceUrl: scraped.primarySourceUrl || target.url,
          rawSlideText: scraped.text,
        });

        totalAdded += data.addedCount || 0;
        totalUpdated += data.updatedCount || 0;
        const sum = `${target.label}: +${data.addedCount || 0} new, ${data.updatedCount || 0} upd`;
        summaries.push(sum);
        sourceLog.push({
          course: target.label,
          sourceUrl: (scraped.sourceUrls || [target.url]).join(' + '),
          ok: true,
          detail: data.summary || sum,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(target.label);
        sourceLog.push({
          course: target.label,
          sourceUrl: target.url,
          ok: false,
          detail: msg,
        });
      }
    }

    const totalSources = slideTargets.length + classroomTargets.length;
    if (totalSources === 0) {
      throw new Error('No source URLs configured. Right-click icon -> Options to add them.');
    }

    if (failures.length === totalSources) {
      setBadge('!', '#DC2626');
      const errMsg =
        'Could not read any configured Slide or Classroom page. Make sure your school Google account is signed into this Chrome window.';
      await chrome.storage.local.set({
        lastRun: { ok: false, at: new Date().toISOString(), summary: errMsg, sources: sourceLog },
      });
      notify('Intuition Sync Needed Sign-In', errMsg);
      setTimeout(() => setBadge('', '#2563EB'), 6000);
      return { ok: false, error: errMsg, sources: sourceLog };
    }

    const totalTouched = totalAdded + totalUpdated;
    setBadge(totalTouched > 0 ? `+${totalTouched}` : '✓', '#15803D');

    // If user is currently looking at airbnb710.com, trigger an immediate cloud pull
    if (activeTab?.id && tabUrl.startsWith('https://airbnb710.com')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.dispatchEvent(new Event('focus')),
        });
      } catch {
        // Ignore if page script injection isn't allowed; 8s poller will pick it up anyway
      }
    }

    const sheetNote = audiobookCsv ? 'Audiobook Sheet ✓' : 'Built-in Audiobook Sheet';
    const warnNote = failures.length ? ` (Skipped: ${failures.join(', ')})` : '';
    const fullSummary = `${sheetNote} · +${totalAdded} new, ${totalUpdated} updated${warnNote}. ${summaries.join(' | ')}`.trim();

    await chrome.storage.local.set({
      lastRun: {
        ok: true,
        at: new Date().toISOString(),
        summary: fullSummary,
        sources: sourceLog,
      },
    });

    notify('Intuition Synced!', fullSummary);
    setTimeout(() => setBadge('', '#15803D'), 8000);
    return { ok: true, summary: fullSummary, sources: sourceLog };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBadge('!', '#DC2626');
    await chrome.storage.local.set({
      lastRun: { ok: false, at: new Date().toISOString(), summary: msg, sources: [] },
    });
    notify('Intuition Sync Error', msg);
    setTimeout(() => setBadge('', '#DC2626'), 6000);
    return { ok: false, error: msg };
  } finally {
    isSyncing = false;
  }
}

// Manual 1-click toolbar trigger anytime
chrome.action.onClicked.addListener((tab) => {
  void runFullSync(tab);
});

// Automatic background schedule (default: every 6 hours)
chrome.runtime.onInstalled.addListener(() => {
  void ensureAutoSyncAlarm(true);
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAutoSyncAlarm(false);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.autoSyncHours) {
    void ensureAutoSyncAlarm(true);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_SYNC_ALARM) {
    void runFullSync(null);
  }
});

// Ensure alarm exists whenever the service worker wakes up
void ensureAutoSyncAlarm(false);

// Also allow manual click & schedule inspection from Options page
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_SYNC_FROM_OPTIONS') {
    runFullSync(null).then((res) => sendResponse(res));
    return true;
  }
  if (msg?.type === 'GET_ALARM_STATUS') {
    ensureAutoSyncAlarm(false)
      .then((alarm) =>
        sendResponse({
          ok: true,
          scheduledTime: alarm?.scheduledTime ?? null,
          periodInMinutes: alarm?.periodInMinutes ?? null,
        })
      )
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
