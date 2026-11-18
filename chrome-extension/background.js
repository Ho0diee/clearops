const DEFAULTS = {
  vercelUrl: 'https://airbnb710.com/api/schoolwork/run',
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  litSlideId: '',
  precalcSlideId: '',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
};

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
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
 * Fetches Ms. Fox's Google Slide plain text across multi-login Chrome slots (/u/0..3/).
 */
async function fetchGoogleSlideTxt(slideId, preferredPrefix) {
  const cleanId = slideId
    .replace(/^.*\/presentation\/(?:u\/\d+\/)?d\//, '')
    .replace(/\/.*$/, '')
    .trim();

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

let isSyncing = false;

async function runOneClickSync(activeTab) {
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

    const targets = [];
    if (slidePathMatch) {
      const preferredPrefix = slidePathMatch[1];
      const openSlideId = slidePathMatch[2];
      const tabTitle = (activeTab.title || '').replace(/\s*-\s*Google Slides$/i, '').trim();
      if (cfg.litSlideId && openSlideId === cfg.litSlideId) {
        targets.push({
          courseId: 'lit',
          slideId: cfg.litSlideId,
          slideTitle: tabTitle || 'AP Lit Slide',
          preferredPrefix,
          allowTabDomFallback: true,
        });
      } else if (cfg.precalcSlideId && openSlideId === cfg.precalcSlideId) {
        targets.push({
          courseId: 'precalc',
          slideId: cfg.precalcSlideId,
          slideTitle: tabTitle || 'AP Pre-Calc Slide',
          preferredPrefix,
          allowTabDomFallback: true,
        });
      } else {
        targets.push({
          courseId: 'eco',
          slideId: openSlideId === cfg.ecoSlideId ? cfg.ecoSlideId : cfg.ecoSlideId,
          slideTitle:
            openSlideId === cfg.ecoSlideId && tabTitle
              ? tabTitle
              : 'AP Environmental Science (APES) Agenda 2026-2027',
          preferredPrefix: openSlideId === cfg.ecoSlideId ? preferredPrefix : null,
          allowTabDomFallback: openSlideId === cfg.ecoSlideId,
        });
      }
    } else {
      if (cfg.ecoSlideId) {
        targets.push({
          courseId: 'eco',
          slideId: cfg.ecoSlideId,
          slideTitle: 'AP Environmental Science (APES) Agenda 2026-2027',
          preferredPrefix: null,
          allowTabDomFallback: false,
        });
      }
      if (cfg.litSlideId) {
        targets.push({
          courseId: 'lit',
          slideId: cfg.litSlideId,
          slideTitle: 'AP Lit Slide',
          preferredPrefix: null,
          allowTabDomFallback: false,
        });
      }
      if (cfg.precalcSlideId) {
        targets.push({
          courseId: 'precalc',
          slideId: cfg.precalcSlideId,
          slideTitle: 'AP Pre-Calc Slide',
          preferredPrefix: null,
          allowTabDomFallback: false,
        });
      }
    }

    if (targets.length === 0) {
      throw new Error('No Google Slide ID configured. Right-click icon -> Options to add one.');
    }

    // 1. Pull live Audiobook Sheet CSV once
    const audiobookCsv = await fetchLiveAudiobookCsv(cfg.audiobookSheetId);

    let totalAdded = 0;
    let totalUpdated = 0;
    const summaries = [];
    const failures = [];

    for (const target of targets) {
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
        failures.push(target.courseId.toUpperCase());
        continue;
      }

      // 2. Send directly to Vercel (/api/schoolwork/run) -> Gemini 4 Hydrogen + Intuition Blob!
      const resp = await fetch(cfg.vercelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'webhook-ingest',
          courseId: target.courseId,
          slideTitle: finalSlideTitle,
          rawSlideText: finalSlideText,
          audiobookSheetCsv: audiobookCsv || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Vercel returned HTTP ${resp.status}`);
      }

      totalAdded += data.addedCount || 0;
      totalUpdated += data.updatedCount || 0;
      if (data.summary) summaries.push(data.summary);
    }

    if (failures.length === targets.length) {
      setBadge('!', '#DC2626');
      const errMsg =
        'Could not read the school Google Slide. Make sure you are signed into your school Google account in this Chrome profile (or open Ms. Fox’s slide tab and click the icon again).';
      await chrome.storage.local.set({
        lastRun: { ok: false, at: new Date().toISOString(), summary: errMsg },
      });
      notify('Intuition Sync Needed Sign-In', errMsg);
      setTimeout(() => setBadge('', '#2563EB'), 6000);
      return { ok: false, error: errMsg };
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

    const sheetNote = audiobookCsv ? 'Live Audiobook Sheet ✓' : 'Built-in Audiobook Sheet';
    const warnNote = failures.length ? ` (Could not read: ${failures.join(', ')})` : '';
    const fullSummary = `${sheetNote} · +${totalAdded} new, ${totalUpdated} updated${warnNote}. ${summaries.join(' ')}`.trim();

    await chrome.storage.local.set({
      lastRun: {
        ok: true,
        at: new Date().toISOString(),
        summary: fullSummary,
      },
    });

    notify('Intuition Synced!', fullSummary);
    setTimeout(() => setBadge('', '#15803D'), 8000);
    return { ok: true, summary: fullSummary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBadge('!', '#DC2626');
    await chrome.storage.local.set({
      lastRun: { ok: false, at: new Date().toISOString(), summary: msg },
    });
    notify('Intuition Sync Error', msg);
    setTimeout(() => setBadge('', '#DC2626'), 6000);
    return { ok: false, error: msg };
  } finally {
    isSyncing = false;
  }
}

// Strictly user-clicked (zero background polling): clicking the toolbar icon pulls & adds right away!
chrome.action.onClicked.addListener((tab) => {
  void runOneClickSync(tab);
});

// Also allow manual click from Options page
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_SYNC_FROM_OPTIONS') {
    runOneClickSync(null).then((res) => sendResponse(res));
    return true;
  }
});
