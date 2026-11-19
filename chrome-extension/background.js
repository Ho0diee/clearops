const DEFAULTS = {
  vercelUrl: 'https://airbnb710.com/api/schoolwork/run',
  schoolAccount: 'auto', // 'auto', '0', '1', '2', or your exact school email (e.g. name@msad17.org)
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
  litClassroomUrl: 'https://classroom.google.com/u/1/w/ODc2NjEwODUwOTA2/t/all',
  mathClassroomUrl: 'https://classroom.google.com/u/1/w/ODY2Njc4NTA5ODM3/t/all',
  physicsClassroomUrl: 'https://classroom.google.com/u/1/w/ODcyNDg1NzU5NTU3/t/all',
  litSlideId: '',
  precalcSlideId: '',
  autoSyncHours: 6,
};

const AUTO_SYNC_ALARM = 'intuition-auto-sync';
const MAX_EXPAND_ROWS_PER_CLASS = 20;
const MAX_DETAIL_PAGES_PER_COURSE = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * Fetches live CSV from your APES Audiobook Sheet across multi-login Chrome slots (/u/0..3/ + authuser).
 */
async function fetchLiveAudiobookCsv(sheetId, schoolAccount) {
  if (!sheetId) return null;
  const cleanId = sheetId
    .replace(/^.*\/spreadsheets\/(?:u\/\d+\/)?d\//, '')
    .replace(/\/.*$/, '')
    .trim();

  const urls = [];
  const acct = String(schoolAccount || '').trim();
  if (acct && acct.includes('@')) {
    urls.push(
      `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&gid=0&authuser=${encodeURIComponent(acct)}`
    );
  } else if (/^\d+$/.test(acct)) {
    urls.push(`https://docs.google.com/spreadsheets/u/${acct}/d/${cleanId}/export?format=csv&gid=0`);
  }
  urls.push(
    `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/0/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/1/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/2/d/${cleanId}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/u/3/d/${cleanId}/export?format=csv&gid=0`
  );

  for (const url of Array.from(new Set(urls))) {
    try {
      const resp = await fetch(url, { credentials: 'include', redirect: 'follow' });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!looksLikeLoginOrHtml(text) && text.includes('Module')) {
        return text;
      }
    } catch {
      // Try next slot
    }
  }
  return null;
}

/**
 * Fetches a Google Slide deck as plain text across multi-login Chrome slots (/u/0..3/ + authuser).
 */
async function fetchGoogleSlideTxt(slideId, preferredPrefix, schoolAccount) {
  const cleanId = cleanSlideId(slideId);
  if (!cleanId) return null;

  const urls = [];
  if (preferredPrefix) {
    urls.push(`https://docs.google.com${preferredPrefix}/export/txt`);
  }
  const acct = String(schoolAccount || '').trim();
  if (acct && acct.includes('@')) {
    urls.push(
      `https://docs.google.com/presentation/d/${cleanId}/export/txt?authuser=${encodeURIComponent(acct)}`
    );
  } else if (/^\d+$/.test(acct)) {
    urls.push(`https://docs.google.com/presentation/u/${acct}/d/${cleanId}/export/txt`);
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

function buildClassroomViewUrl(classId, accountSelector, view) {
  const sel = String(accountSelector ?? '0').trim();
  if (sel.includes('@')) {
    const path = view === 'w' ? `/w/${classId}/t/all` : `/c/${classId}`;
    return `https://classroom.google.com${path}?authuser=${encodeURIComponent(sel)}`;
  }
  const slotNum = /^\d+$/.test(sel) ? sel : '0';
  return view === 'w'
    ? `https://classroom.google.com/u/${slotNum}/w/${classId}/t/all`
    : `https://classroom.google.com/u/${slotNum}/c/${classId}`;
}

/**
 * Opens a brand-new background tab directly at `url` and waits until Chrome finishes
 * loading AND any instant redirect settles (no stale-tab race!).
 */
async function openFreshTabAtUrl(url, timeoutMs = 24000) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    if (!tab?.id) return { ok: false, tabId: null, finalUrl: url };
    const tabId = tab.id;

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        resolve();
      };
      const onUpdated = (updatedId, changeInfo, tabInfo) => {
        if (updatedId !== tabId) return;
        if (changeInfo.status === 'complete' && /^https?:\/\//i.test(tabInfo?.url || '')) {
          finish();
        }
      };
      const timer = setTimeout(finish, timeoutMs);
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs
        .get(tabId)
        .then((t) => {
          if (t?.status === 'complete' && /^https?:\/\//i.test(t.url || '')) finish();
        })
        .catch(finish);
    });

    // Give Google account redirects a moment to settle if still bouncing
    await sleep(1200);
    const settledTab = await chrome.tabs.get(tabId).catch(() => null);
    if (settledTab?.status === 'loading') {
      await sleep(2500);
    }
    const finalTab = await chrome.tabs.get(tabId).catch(() => null);
    return {
      ok: Boolean(finalTab?.id),
      tabId,
      finalUrl: finalTab?.url || url,
    };
  } catch {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
    return { ok: false, tabId: null, finalUrl: url };
  }
}

/**
 * Inspects Chrome's signed-in Google Classroom slots (/u/0/h, /u/1/h, /u/2/h) to detect:
 * - Which email is signed into each slot
 * - Which slot actually contains the user's configured classes (Lit, Pre-Calc, Physics)!
 */
async function detectSchoolClassroomSlot(targetClassIds) {
  const checks = [];
  const wantedIds = (targetClassIds || []).filter(Boolean);

  for (const slot of [0, 1, 2]) {
    let tabId = null;
    try {
      const homeUrl = `https://classroom.google.com/u/${slot}/h`;
      const opened = await openFreshTabAtUrl(homeUrl, 18000);
      tabId = opened.tabId;
      if (!tabId) continue;

      if (
        opened.finalUrl.includes('accounts.google.com') ||
        opened.finalUrl.includes('ServiceLogin')
      ) {
        checks.push({
          slot,
          email: null,
          finalUrl: opened.finalUrl,
          matchedClassIds: [],
          classCount: 0,
          note: 'Not signed in',
        });
        continue;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [wantedIds],
        func: async (idsToFind) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const start = Date.now();
          while (Date.now() - start < 15000) {
            const links = document.querySelectorAll('a[href*="/c/"]').length;
            const mainEl = document.querySelector('[role="main"]') || document.body;
            const mainTxt = (mainEl?.innerText || '').trim();
            if (links > 0) break;
            if (
              Date.now() - start > 5000 &&
              /create or join your first class|don'?t see your existing classes|add a class to get started|no classes/i.test(
                mainTxt
              )
            ) {
              break;
            }
            await wait(350);
          }
          await wait(1000);

          // Extract signed-in email from Google account button aria-label or title
          let email = null;
          for (const el of Array.from(document.querySelectorAll('[aria-label], [title]'))) {
            const lbl = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
            const em = lbl.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
            if (em) {
              email = em[1];
              break;
            }
          }

          const hrefs = Array.from(document.querySelectorAll('a[href*="/c/"]')).map(
            (a) => a.href || ''
          );
          const dataCourseIds = Array.from(document.querySelectorAll('[data-course-id]'))
            .map((el) => el.getAttribute('data-course-id') || '')
            .filter(Boolean);
          const uniqueClassIds = Array.from(
            new Set([
              ...hrefs
                .map((h) => h.match(/\/c\/([A-Za-z0-9_-]+)/)?.[1])
                .filter(Boolean),
              ...dataCourseIds,
            ])
          );
          const matchedClassIds = idsToFind.filter((id) => uniqueClassIds.includes(id));

          return {
            finalUrl: window.location.href,
            email,
            classCount: uniqueClassIds.length,
            matchedClassIds,
            sampleText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
          };
        },
      });

      const info = results?.[0]?.result;
      if (info) {
        // Detect if Chrome bounced /u/2/ back to /u/0/ or /h (means slot 2 doesn't exist)
        const actualSlotMatch = info.finalUrl.match(/\/u\/(\d+)\//);
        const actualSlot = actualSlotMatch
          ? Number(actualSlotMatch[1])
          : /classroom\.google\.com\/h\b/i.test(info.finalUrl)
            ? 0
            : slot;
        const normalizedEmail = (info.email || '').toLowerCase();
        if (
          (actualSlot !== slot && checks.some((c) => c.slot === actualSlot)) ||
          (normalizedEmail && checks.some((c) => (c.email || '').toLowerCase() === normalizedEmail))
        ) {
          continue;
        }
        checks.push({
          slot: actualSlot,
          email: info.email,
          finalUrl: info.finalUrl,
          matchedClassIds: info.matchedClassIds || [],
          classCount: info.classCount || 0,
          sampleText: info.sampleText || '',
          note:
            info.matchedClassIds?.length > 0
              ? `Matched ${info.matchedClassIds.length}/${wantedIds.length} classes!`
              : `${info.classCount || 0} class(es) visible`,
        });
      }
    } catch (err) {
      checks.push({
        slot,
        email: null,
        finalUrl: `https://classroom.google.com/u/${slot}/h`,
        matchedClassIds: [],
        classCount: 0,
        note: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (tabId) {
        await chrome.tabs.remove(tabId).catch(() => {});
      }
    }
  }

  // Pick slot with the most matched class IDs (or most total classes as fallback)
  const best = [...checks].sort((a, b) => {
    if (b.matchedClassIds.length !== a.matchedClassIds.length) {
      return b.matchedClassIds.length - a.matchedClassIds.length;
    }
    return b.classCount - a.classCount;
  })[0];

  const chosenSlot =
    best && (best.matchedClassIds.length > 0 || best.classCount > 0) ? best.slot : null;

  return {
    ok: chosenSlot !== null,
    chosenSlot,
    chosenEmail: best?.email || null,
    checks,
  };
}

/**
 * Opens ONE fresh background tab for a single Classroom overview URL (`/w/.../t/all` or `/c/...`),
 * waits for real Classroom content, expands up to 20 Classwork assignments IN-PLACE, extracts full text
 * + `/details` links, and closes the tab cleanly.
 */
async function scrapeClassroomViewInFreshTab(url, expectedClassId, viewKind, maxExpandRows) {
  let tabId = null;
  try {
    const opened = await openFreshTabAtUrl(url, 24000);
    tabId = opened.tabId;
    if (!tabId) {
      return {
        ok: false,
        finalUrl: url,
        error: 'Could not open background tab',
        detailLinks: [],
        expandedCount: 0,
      };
    }

    const currentUrl = opened.finalUrl || url;
    if (
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('ServiceLogin')
    ) {
      return {
        ok: false,
        needsSignIn: true,
        finalUrl: currentUrl,
        error: `Redirected to Google Sign-In (${currentUrl.slice(0, 70)})`,
        detailLinks: [],
        expandedCount: 0,
      };
    }

    const runExtract = () =>
      chrome.scripting.executeScript({
        target: { tabId },
        args: [expectedClassId || '', viewKind, maxExpandRows],
        func: async (classId, view, maxExpand) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const getMain = () =>
            document.querySelector('[role="main"]') ||
            document.querySelector('main') ||
            document.body;

          // Wait up to 20s for real Classroom content inside [role="main"]
          const start = Date.now();
          while (Date.now() - start < 20000) {
            const href = window.location.href;
            if (classId && !href.includes(classId) && Date.now() - start > 3000) break;

            const mainEl = getMain();
            const mainTxt = (mainEl?.innerText || '').trim();
            const itemCount = mainEl
              ? mainEl.querySelectorAll('[data-stream-item-id], [data-item-id], ol li, [role="listitem"]').length
              : 0;

            if (
              /class not found|don'?t have access|sign in to continue|create or join/i.test(mainTxt) &&
              itemCount === 0 &&
              Date.now() - start > 3000
            ) {
              break;
            }

            const hasMarkers =
              /(Due\s|Posted\s|Edited\s|No due date|Turned in|Assigned|Missing|Graded|View instructions|Material|Assignment|Announce something)/i.test(
                mainTxt
              );
            if ((itemCount >= 2 && mainTxt.length > 140) || (hasMarkers && mainTxt.length > 220)) {
              break;
            }
            await wait(350);
          }
          await wait(1400);

          const finalHref = window.location.href;
          const mainRoot = getMain();
          const preText = (mainRoot?.innerText || document.body?.innerText || '').trim();
          const snippet = preText.replace(/\s+/g, ' ').slice(0, 180);

          if (classId && !finalHref.includes(classId)) {
            return {
              ok: false,
              wrongAccountOrMissing: true,
              finalUrl: finalHref,
              title: document.title,
              error: `Landed on ${finalHref} (not class ${classId}): "${snippet}"`,
              detailLinks: [],
              expandedCount: 0,
            };
          }

          const rawItems = mainRoot
            ? Array.from(mainRoot.querySelectorAll('li[data-stream-item-id], [data-stream-item-id]'))
            : [];

          if (
            rawItems.length === 0 &&
            preText.length < 1600 &&
            /class not found|look for it in|you don'?t have access|sign in to continue|choose an account|create or join/i.test(
              preText
            )
          ) {
            return {
              ok: false,
              wrongAccountOrMissing: true,
              finalUrl: finalHref,
              title: document.title,
              error: `Wrong account or missing class on ${finalHref}: "${snippet}"`,
              detailLinks: [],
              expandedCount: 0,
            };
          }

          // Expand up to `maxExpand` Classwork rows IN-PLACE so full descriptions & due dates render
          let expandedCount = 0;
          if (view === 'w' && mainRoot) {
            const candidateRows =
              rawItems.length > 0
                ? rawItems
                : Array.from(mainRoot.querySelectorAll('ol > li, [role="listitem"]')).filter(
                    (li) => (li.innerText || '').trim().length > 12
                  );

            const clickedEls = new Set();
            for (const row of candidateRows.slice(0, maxExpand)) {
              try {
                row.scrollIntoView({ block: 'center', behavior: 'instant' });
                await wait(80);

                const toggle =
                  row.querySelector('[aria-expanded="false"]:not([aria-label*="More options"]):not([aria-label*="Topic"])') ||
                  row.querySelector('[role="button"]:not([aria-label*="More options"]):not([aria-label*="options"]):not(a)') ||
                  row.querySelector('[tabindex="0"]:not(a):not([aria-label*="More options"])');

                if (toggle && !clickedEls.has(toggle)) {
                  if (toggle.getAttribute('aria-expanded') === 'true') continue;
                  clickedEls.add(toggle);
                  toggle.click();
                  expandedCount += 1;
                  await wait(220);
                }
              } catch {}
            }

            if (expandedCount > 0) {
              await wait(1200);
            }
          }

          // Click any "Read more" / "Show more" toggles
          if (mainRoot) {
            const moreBtns = Array.from(mainRoot.querySelectorAll('button, [role="button"]'))
              .filter((el) => /^(read more|show more|view more)$/i.test((el.textContent || '').trim()))
              .slice(0, 10);
            for (const btn of moreBtns) {
              try {
                btn.click();
                await wait(140);
              } catch {}
            }
            if (moreBtns.length > 0) await wait(600);
          }

          // Collect ALL unique /details links
          const detailLinks = [];
          const seenLinks = new Set();
          const detailRegex =
            /^https:\/\/classroom\.google\.com\/(?:u\/\d+\/)?c\/[A-Za-z0-9_-]+\/(?:a|sa|m|p)\/[A-Za-z0-9_-]+\/details/i;

          const scanRoot = mainRoot || document.body;
          for (const a of Array.from(scanRoot.querySelectorAll('a[href]'))) {
            const cleanHref = (a.href || '').split('?')[0].split('#')[0];
            if (detailRegex.test(cleanHref) && !seenLinks.has(cleanHref)) {
              seenLinks.add(cleanHref);
              detailLinks.push(cleanHref);
            }
          }

          const cleanedLines = (scanRoot.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((l) => l.trim())
            .filter(
              (l) =>
                l &&
                !/^(More options|Options|Add class comment|Send|Post|Skip to main content|Google apps|Main menu|Copy link|Report abuse)$/i.test(
                  l
                )
            );

          const finalText = cleanedLines.join('\n').slice(0, 48000);

          return {
            ok: finalText.length > 40,
            finalUrl: finalHref,
            title: document.title || 'Google Classroom',
            text: finalText,
            detailLinks,
            expandedCount,
            rowCount: rawItems.length,
          };
        },
      });

    let results;
    try {
      results = await runExtract();
    } catch {
      await sleep(1800);
      results = await runExtract();
    }

    return (
      results?.[0]?.result || {
        ok: false,
        finalUrl: currentUrl,
        error: `Empty script result on ${currentUrl}`,
        detailLinks: [],
        expandedCount: 0,
      }
    );
  } catch (err) {
    return {
      ok: false,
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
      detailLinks: [],
      expandedCount: 0,
    };
  } finally {
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

/**
 * Opens ONE fresh background tab for an assignment `/details` page, reads full description & comments,
 * and closes it cleanly.
 */
async function scrapeClassroomDetailInFreshTab(detailUrl) {
  let tabId = null;
  try {
    const opened = await openFreshTabAtUrl(detailUrl, 18000);
    tabId = opened.tabId;
    if (!tabId) return { ok: false, finalUrl: detailUrl, text: '' };

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const getMain = () =>
          document.querySelector('[role="main"]') ||
          document.querySelector('main') ||
          document.body;

        const start = Date.now();
        while (Date.now() - start < 8000) {
          const txt = (getMain()?.innerText || '').trim();
          if (txt.length > 100 && window.location.href.includes('/details')) break;
          await wait(250);
        }
        await wait(900);

        const mainRoot = getMain();
        const expanders = Array.from(mainRoot.querySelectorAll('button, [role="button"]'))
          .filter((el) =>
            /^(read more|show more|\d+\s+class comments?)$/i.test((el.textContent || '').trim())
          )
          .slice(0, 4);
        for (const btn of expanders) {
          try {
            btn.click();
            await wait(150);
          } catch {}
        }
        if (expanders.length > 0) await wait(400);

        const text = (mainRoot.innerText || '')
          .replace(/\r/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(
            (l) =>
              l &&
              !/^(More options|Add or create|Mark as done|Unsubmit|Add private comment|Add class comment|Send|Skip to main content|Google apps|Main menu)$/i.test(
                l
              )
          )
          .join('\n');

        return {
          ok: text.length > 30,
          finalUrl: window.location.href,
          text: text.slice(0, 6500),
        };
      },
    });

    return results?.[0]?.result || { ok: false, finalUrl: detailUrl, text: '' };
  } catch {
    return { ok: false, finalUrl: detailUrl, text: '' };
  } finally {
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

/**
 * Scrapes a Google Classroom course using fresh tabs per view (zero stale-redirect race!):
 * 1. Tries the exact detected/configured school account selector (email or /u/N/) FIRST,
 *    with automatic fallback across /u/0/, /u/1/, /u/2/.
 * 2. Reads Classwork (`/w/<id>/t/all`) with up to 20 assignments expanded IN-PLACE.
 * 3. Reads Stream (`/c/<id>`) for teacher announcements ("test is tomorrow!").
 * 4. Reads up to 6 newest `/details` pages for full untruncated descriptions & comments.
 */
async function scrapeClassroomCourse(rawUrl, accountSelectorHint) {
  const parsed = parseClassroomUrl(rawUrl);
  if (!parsed) return { ok: false, error: 'Empty Classroom URL' };

  if (!parsed.classId) {
    const single = await scrapeClassroomViewInFreshTab(
      parsed.rawUrl,
      '',
      'w',
      MAX_EXPAND_ROWS_PER_CLASS
    );
    return {
      ...single,
      primarySourceUrl: single.finalUrl || parsed.rawUrl,
      sourceUrls: [single.finalUrl || parsed.rawUrl],
      detailCount: 0,
      resolvedAccount: accountSelectorHint,
    };
  }

  const candidateSelectors = [];
  const hint = String(accountSelectorHint ?? '').trim();
  if (hint && hint !== 'auto') {
    candidateSelectors.push(hint);
  }
  if (parsed.slot !== null && parsed.slot !== undefined) {
    candidateSelectors.push(String(parsed.slot));
  }
  candidateSelectors.push('0', '1', '2');
  const uniqueSelectors = Array.from(new Set(candidateSelectors));

  let classworkRes = null;
  let workingSelector = uniqueSelectors[0];
  const attemptTrace = [];

  for (const sel of uniqueSelectors) {
    const tryUrl = buildClassroomViewUrl(parsed.classId, sel, 'w');
    const res = await scrapeClassroomViewInFreshTab(
      tryUrl,
      parsed.classId,
      'w',
      MAX_EXPAND_ROWS_PER_CLASS
    );
    if (res.ok) {
      classworkRes = res;
      workingSelector = sel;
      break;
    }
    attemptTrace.push(`[${sel}] ${res.error || res.finalUrl}`);
    if (!res.wrongAccountOrMissing && !res.needsSignIn) {
      classworkRes = res;
      break;
    }
  }

  if (!classworkRes?.ok) {
    return {
      ok: false,
      error: `Failed across accounts: ${attemptTrace.join(' ; ')}`,
      sourceUrls: [parsed.rawUrl],
      detailCount: 0,
      expandedCount: 0,
      resolvedAccount: accountSelectorHint,
    };
  }

  // Pull companion Stream (`/c/<id>`) using the exact same working account selector
  const streamUrl = buildClassroomViewUrl(parsed.classId, workingSelector, 'c');
  const streamRes = await scrapeClassroomViewInFreshTab(streamUrl, parsed.classId, 'c', 0);

  const parts = [
    `=== SPECIFIED CLASSWORK PAGE (Expanded ${classworkRes.expandedCount || 0} assignments): ${classworkRes.finalUrl} ===\n${classworkRes.text}`,
  ];
  const sourceUrls = [classworkRes.finalUrl];

  if (streamRes?.ok && streamRes.text) {
    parts.push(
      `=== CLASSROOM STREAM ANNOUNCEMENTS: ${streamRes.finalUrl} ===\n${streamRes.text}`
    );
    sourceUrls.push(streamRes.finalUrl);
  }

  // Visit top newest `/details` pages for full untruncated descriptions & comments,
  // ensuring every detail link targets the exact resolved school account slot
  const resolvedSlotMatch = (classworkRes.finalUrl || '').match(/\/u\/(\d+)\//);
  const resolvedSlot = resolvedSlotMatch ? resolvedSlotMatch[1] : /^\d+$/.test(String(workingSelector)) ? String(workingSelector) : null;

  const normalizeDetailUrl = (rawDetail) => {
    if (/\/u\/\d+\//.test(rawDetail)) return rawDetail;
    if (resolvedSlot !== null) {
      return rawDetail.replace(
        /^https:\/\/classroom\.google\.com\//i,
        `https://classroom.google.com/u/${resolvedSlot}/`
      );
    }
    if (String(workingSelector || '').includes('@')) {
      return `${rawDetail}?authuser=${encodeURIComponent(workingSelector)}`;
    }
    return rawDetail;
  };

  const uniqueDetailLinks = Array.from(
    new Set(
      [...(streamRes?.detailLinks || []), ...(classworkRes.detailLinks || [])].map(
        normalizeDetailUrl
      )
    )
  ).slice(0, MAX_DETAIL_PAGES_PER_COURSE);

  let detailCount = 0;
  for (const dUrl of uniqueDetailLinks) {
    const detailRes = await scrapeClassroomDetailInFreshTab(dUrl);
    if (detailRes?.ok && detailRes.text) {
      parts.push(`=== ASSIGNMENT DETAIL PAGE: ${detailRes.finalUrl} ===\n${detailRes.text}`);
      detailCount += 1;
    }
  }

  const fullText = parts.join('\n\n').slice(0, 145000);

  return {
    ok: true,
    title: classworkRes.title || 'Google Classroom',
    primarySourceUrl: classworkRes.finalUrl,
    sourceUrls,
    expandedCount: classworkRes.expandedCount || 0,
    detailCount,
    charCount: fullText.length,
    preview: fullText.slice(0, 700),
    resolvedAccount: workingSelector,
    text: fullText,
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

    const audiobookCsv = await fetchLiveAudiobookCsv(cfg.audiobookSheetId, cfg.schoolAccount);

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
        let finalSlideText = await fetchGoogleSlideTxt(
          target.slideId,
          target.preferredPrefix,
          cfg.schoolAccount
        );
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
          scrapeMeta: {
            accountSelector: String(cfg.schoolAccount || 'auto'),
            sourceUrls: [target.sourceUrl],
          },
        });

        totalAdded += data.addedCount || 0;
        totalUpdated += data.updatedCount || 0;
        const sum = `${target.label}: +${data.addedCount || 0} new, ${data.updatedCount || 0} upd`;
        summaries.push(sum);
        sourceLog.push({
          course: target.label,
          courseId: target.courseId,
          sourceUrl: target.sourceUrl,
          ok: true,
          detail: data.summary || sum,
          aiModelUsed: data.aiModelUsed || '',
          extractedAssignments: data.extractedAssignments || [],
          rawCharCount: finalSlideText.length,
          preview: finalSlideText.slice(0, 30000),
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
    // 2. Google Classroom targets (Lit, Pre-Calc, Honors Physics)
    // ------------------------------------------------------------------
    const classroomTargets = [
      {
        courseId: 'lit',
        label: 'Lit (Classroom)',
        url: (cfg.litClassroomUrl || '').trim(),
      },
      {
        courseId: 'precalc',
        label: 'Pre-Calc (Classroom)',
        url: (cfg.mathClassroomUrl || '').trim(),
      },
      {
        courseId: 'physics',
        label: 'Honors Physics (Classroom)',
        url: (cfg.physicsClassroomUrl || '').trim(),
      },
    ].filter((t) => Boolean(t.url));

    let accountSelector = String(cfg.schoolAccount || 'auto').trim();
    if ((!accountSelector || accountSelector === 'auto') && classroomTargets.length > 0) {
      const wantedIds = classroomTargets
        .map((t) => parseClassroomUrl(t.url)?.classId)
        .filter(Boolean);
      const detected = await detectSchoolClassroomSlot(wantedIds);
      if (detected.ok && detected.chosenSlot !== null) {
        accountSelector = String(detected.chosenSlot);
      }
    }

    for (const target of classroomTargets) {
      try {
        const scraped = await scrapeClassroomCourse(target.url, accountSelector);
        if (scraped.resolvedAccount && scraped.resolvedAccount !== 'auto') {
          accountSelector = String(scraped.resolvedAccount);
        }

        if (!scraped.ok || !scraped.text) {
          failures.push(target.label);
          const failDetail = scraped.error || 'Could not read Classroom page';
          // Upload failure diagnostic so airbnb710.com/api/schoolwork/run?debug=1 records what happened
          await postToIntuition(cfg.vercelUrl, {
            action: 'log-scrape-failure',
            courseId: target.courseId,
            slideTitle: `${target.label} (Scrape Diagnostic)`,
            sourceUrl: target.url,
            rawSlideText: scraped.text || '',
            error: failDetail,
            scrapeMeta: {
              accountSelector: String(accountSelector || 'auto'),
              sourceUrls: scraped.sourceUrls || [target.url],
              error: failDetail,
            },
          }).catch(() => {});
          sourceLog.push({
            course: target.label,
            courseId: target.courseId,
            sourceUrl: target.url,
            ok: false,
            detail: failDetail,
            rawCharCount: 0,
            preview: scraped.text || '',
          });
          continue;
        }

        const data = await postToIntuition(cfg.vercelUrl, {
          action: 'webhook-ingest',
          courseId: target.courseId,
          slideTitle: `${scraped.title} (Google Classroom)`,
          sourceUrl: scraped.primarySourceUrl || target.url,
          rawSlideText: scraped.text,
          scrapeMeta: {
            accountSelector: String(accountSelector || 'auto'),
            expandedCount: scraped.expandedCount || 0,
            detailCount: scraped.detailCount || 0,
            sourceUrls: scraped.sourceUrls || [target.url],
          },
        });

        totalAdded += data.addedCount || 0;
        totalUpdated += data.updatedCount || 0;
        const stats = `acct=${accountSelector}, ${scraped.expandedCount || 0} expanded, ${scraped.detailCount || 0} detail pages, ${Math.round((scraped.charCount || 0) / 100) / 10}k chars`;
        const sum = `${target.label}: +${data.addedCount || 0} new, ${data.updatedCount || 0} upd (${stats})`;
        summaries.push(sum);
        sourceLog.push({
          course: target.label,
          courseId: target.courseId,
          sourceUrl: (scraped.sourceUrls || [target.url]).join(' + '),
          ok: true,
          detail: `(${stats}) — ${data.summary || sum}`,
          aiModelUsed: data.aiModelUsed || '',
          extractedAssignments: data.extractedAssignments || [],
          rawCharCount: scraped.charCount || scraped.text.length,
          preview: scraped.text.slice(0, 35000),
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
        'Could not read any configured Slide or Classroom page. Click "Detect School Account" in Options to verify which Gmail slot has your classes.';
      await chrome.storage.local.set({
        lastRun: { ok: false, at: new Date().toISOString(), summary: errMsg, sources: sourceLog },
      });
      notify('Intuition Sync Needed Sign-In', errMsg);
      setTimeout(() => setBadge('', '#2563EB'), 6000);
      return { ok: false, error: errMsg, sources: sourceLog };
    }

    const totalTouched = totalAdded + totalUpdated;
    setBadge(totalTouched > 0 ? `+${totalTouched}` : '✓', '#15803D');

    if (activeTab?.id && tabUrl.startsWith('https://airbnb710.com')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.dispatchEvent(new Event('focus')),
        });
      } catch {}
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

// Options page message handlers
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_SYNC_FROM_OPTIONS') {
    runFullSync(null).then((res) => sendResponse(res));
    return true;
  }
  if (msg?.type === 'DETECT_SCHOOL_ACCOUNT') {
    getConfig()
      .then((cfg) => {
        const urls =
          Array.isArray(msg.classroomUrls) && msg.classroomUrls.length > 0
            ? msg.classroomUrls
            : [cfg.litClassroomUrl, cfg.mathClassroomUrl, cfg.physicsClassroomUrl];
        const ids = urls.map((u) => parseClassroomUrl(u)?.classId).filter(Boolean);
        return detectSchoolClassroomSlot(ids);
      })
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
      );
    return true;
  }
  if (msg?.type === 'WIPE_SCHOOLWORK_FROM_OPTIONS') {
    getConfig()
      .then((cfg) => postToIntuition(cfg.vercelUrl, { action: 'wipe-schoolwork' }))
      .then(async (res) => {
        await chrome.storage.local.set({
          lastRun: {
            ok: true,
            at: new Date().toISOString(),
            summary: res.summary || 'Wiped all auto-synced schoolwork data.',
            sources: [],
          },
        });
        sendResponse(res);
      })
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
      );
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
