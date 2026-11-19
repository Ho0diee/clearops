const DEFAULTS = {
  schoolAccount: 'auto',
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
  litClassroomUrl: 'https://classroom.google.com/u/1/w/ODc2NjEwODUwOTA2/t/all',
  mathClassroomUrl: 'https://classroom.google.com/u/1/w/ODY2Njc4NTA5ODM3/t/all',
  physicsClassroomUrl: 'https://classroom.google.com/u/1/w/ODcyNDg1NzU5NTU3/t/all',
  litSlideId: '',
  precalcSlideId: '',
  autoSyncHours: 6,
};

const fields = [
  'schoolAccount',
  'litClassroomUrl',
  'mathClassroomUrl',
  'physicsClassroomUrl',
  'ecoSlideId',
  'audiobookSheetId',
  'litSlideId',
  'precalcSlideId',
];
const statusEl = document.getElementById('status');
const sourcesLogEl = document.getElementById('sourcesLog');
const hoursEl = document.getElementById('autoSyncHours');

function formatScheduleLine(alarmRes) {
  if (!alarmRes?.ok || !alarmRes.scheduledTime || !alarmRes.periodInMinutes) {
    return 'Auto-sync: Disabled';
  }
  const hrs = +(alarmRes.periodInMinutes / 60).toFixed(2);
  const nextStr = new Date(alarmRes.scheduledTime).toLocaleString();
  return `Auto-sync: Every ${hrs}h · Next run: ${nextStr}`;
}

function renderSourcesLog(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesLogEl.style.display = 'none';
    sourcesLogEl.innerHTML = '';
    return;
  }
  sourcesLogEl.style.display = 'block';
  sourcesLogEl.innerHTML = '';
  const topBar = document.createElement('div');
  topBar.style.display = 'flex';
  topBar.style.justifyContent = 'space-between';
  topBar.style.alignItems = 'center';
  topBar.style.marginBottom = '8px';

  const heading = document.createElement('div');
  heading.style.fontWeight = '700';
  heading.textContent = 'Last Synced Source Pages & AI Inspector:';
  topBar.appendChild(heading);

  const copyAllBtn = document.createElement('button');
  copyAllBtn.className = 'secondary';
  copyAllBtn.style.padding = '4px 10px';
  copyAllBtn.style.fontSize = '11.5px';
  copyAllBtn.textContent = 'Copy Full Debug Report';
  copyAllBtn.addEventListener('click', async () => {
    const text = sources
      .map((s) => {
        const items = (s.extractedAssignments || [])
          .map(
            (a) =>
              `  - [${a.workLocation === 'in-class' ? 'IN-CLASS' : (a.category || 'hw').toUpperCase()}] ${a.title} (due ${a.dueDate}${a.isCompleted ? ', DONE' : ''}) | ${a.startingStep || ''}`
          )
          .join('\n');
        return [
          `=== ${s.course} (${s.ok ? 'OK' : 'FAIL'}) ===`,
          `URL: ${s.sourceUrl}`,
          `Detail: ${s.detail || ''}`,
          `AI Extracted (${(s.extractedAssignments || []).length}):\n${items || '  (none)'}`,
          `Raw Text Sent to AI (${s.rawCharCount || (s.preview || '').length} chars):\n${(s.preview || '').slice(0, 6000)}`,
        ].join('\n');
      })
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    copyAllBtn.textContent = 'Copied ✓';
    setTimeout(() => (copyAllBtn.textContent = 'Copy Full Debug Report'), 2000);
  });
  topBar.appendChild(copyAllBtn);
  sourcesLogEl.appendChild(topBar);

  for (const s of sources) {
    const row = document.createElement('div');
    row.className = 'src-row';
    row.style.paddingBottom = '8px';
    row.style.marginBottom = '8px';
    row.style.borderBottom = '1px solid #ece8df';

    const badge = document.createElement('span');
    badge.className = s.ok ? 'src-ok' : 'src-err';
    badge.textContent = `${s.ok ? '✓' : '✗'} ${s.course}: `;
    row.appendChild(badge);
    row.appendChild(document.createTextNode(`${s.sourceUrl} — ${s.detail || ''}`));

    if (Array.isArray(s.extractedAssignments) && s.extractedAssignments.length > 0) {
      const detAi = document.createElement('details');
      detAi.open = true;
      detAi.style.marginTop = '5px';
      const sumAi = document.createElement('summary');
      sumAi.style.cursor = 'pointer';
      sumAi.style.fontWeight = '600';
      sumAi.style.color = '#15803d';
      sumAi.textContent = `AI Extracted Assignments (${s.extractedAssignments.length})${s.aiModelUsed ? ` · ${s.aiModelUsed}` : ''}`;
      detAi.appendChild(sumAi);

      const list = document.createElement('div');
      list.style.marginTop = '4px';
      list.style.padding = '6px 8px';
      list.style.background = '#f4f2ec';
      list.style.borderRadius = '6px';
      list.style.fontSize = '11.5px';
      for (const a of s.extractedAssignments) {
        const item = document.createElement('div');
        item.style.marginBottom = '4px';
        const tag = a.workLocation === 'in-class' ? 'IN-CLASS' : String(a.category || 'hw').toUpperCase();
        item.textContent = `• [${tag}] ${a.title} — Due ${a.dueDate}${a.isCompleted ? ' (Done)' : ''}${a.startingStep ? ` — ${a.startingStep}` : ''}`;
        list.appendChild(item);
      }
      detAi.appendChild(list);
      row.appendChild(detAi);
    }

    if (s.preview) {
      const det = document.createElement('details');
      det.style.marginTop = '4px';
      const sum = document.createElement('summary');
      sum.style.cursor = 'pointer';
      sum.style.color = '#57534e';
      const charLabel = (s.rawCharCount || s.preview.length).toLocaleString();
      sum.textContent = `View Raw Text Sent to AI (${charLabel} chars)`;
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.fontSize = '11px';
      pre.style.background = '#f4f2ec';
      pre.style.padding = '8px';
      pre.style.borderRadius = '6px';
      pre.style.maxHeight = '240px';
      pre.style.overflow = 'auto';
      pre.textContent = s.preview;
      det.appendChild(sum);
      det.appendChild(pre);
      row.appendChild(det);
    }
    sourcesLogEl.appendChild(row);
  }
}

async function renderStatus(prefix) {
  const { lastRun } = await chrome.storage.local.get(['lastRun']);
  const alarmRes = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_ALARM_STATUS' }, resolve)
  );
  const lines = [];
  if (prefix) lines.push(prefix);
  lines.push(formatScheduleLine(alarmRes));
  if (lastRun) {
    lines.push(
      `Last run (${new Date(lastRun.at).toLocaleString()}): ${lastRun.summary}`
    );
  }
  statusEl.textContent = lines.join('\n');
  renderSourcesLog(lastRun?.sources);
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  for (const id of fields) {
    document.getElementById(id).value = cfg[id] || '';
  }
  hoursEl.value = cfg.autoSyncHours ?? 6;
  await renderStatus();
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const next = {};
  for (const id of fields) {
    next[id] = document.getElementById(id).value.trim();
  }
  const parsedHours = Number(hoursEl.value);
  next.autoSyncHours = Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : 6;
  await chrome.storage.sync.set(next);
  await renderStatus('Saved specified source pages & schedule!');
});

document.getElementById('detectBtn').addEventListener('click', () => {
  statusEl.textContent =
    'Checking signed-in Google Classroom accounts (/u/0/, /u/1/, /u/2/) to find your school classes...';
  const currentUrls = ['litClassroomUrl', 'mathClassroomUrl', 'physicsClassroomUrl']
    .map((id) => document.getElementById(id).value.trim())
    .filter(Boolean);
  chrome.runtime.sendMessage(
    { type: 'DETECT_SCHOOL_ACCOUNT', classroomUrls: currentUrls },
    async (res) => {
      if (!res) {
        statusEl.textContent = 'Detection failed — reload the extension and try again.';
        return;
      }
      const summaryLines = (res.checks || []).map(
        (c) =>
          `  /u/${c.slot}/ (${c.email || 'unknown'}) -> ${c.note}` +
          (c.classCount === 0 && c.sampleText ? ` [page: "${c.sampleText.slice(0, 90)}"]` : '')
      );
      if (res.ok && res.chosenSlot !== null) {
        const slot = String(res.chosenSlot);
        const chosenVal = res.chosenEmail || slot;
        document.getElementById('schoolAccount').value = chosenVal;
        for (const id of ['litClassroomUrl', 'mathClassroomUrl', 'physicsClassroomUrl']) {
          const el = document.getElementById(id);
          const raw = el.value.trim();
          const m = raw.match(/\/(?:c|w)\/([A-Za-z0-9_-]+)/);
          if (m) {
            el.value = `https://classroom.google.com/u/${slot}/w/${m[1]}/t/all`;
          } else if (raw) {
            el.value = raw.replace(/\/u\/\d+\//, `/u/${slot}/`);
          }
        }
        await chrome.storage.sync.set({
          schoolAccount: chosenVal,
          litClassroomUrl: document.getElementById('litClassroomUrl').value.trim(),
          mathClassroomUrl: document.getElementById('mathClassroomUrl').value.trim(),
          physicsClassroomUrl: document.getElementById('physicsClassroomUrl').value.trim(),
        });
        await renderStatus(
          `Detected school account: ${chosenVal} (/u/${slot}/) and saved!\n${summaryLines.join('\n')}`
        );
      } else {
        statusEl.textContent =
          `Could not find your school classes in any signed-in Classroom slot.\n` +
          `${summaryLines.join('\n')}\n` +
          `Open https://classroom.google.com in a tab first to make sure your school account is logged in.`;
      }
    }
  );
});

document.getElementById('syncBtn').addEventListener('click', () => {
  statusEl.textContent =
    'Pulling Eco Slide + Audiobook Sheet + Lit/Math/Physics Google Classroom pages (this opens brief background tabs and closes them automatically)...';
  chrome.runtime.sendMessage({ type: 'RUN_SYNC_FROM_OPTIONS' }, async (res) => {
    if (!res || !res.ok) {
      await renderStatus('Error: ' + (res?.error || 'Sync failed'));
    } else {
      await renderStatus('Synced! ' + res.summary);
    }
  });
});

document.getElementById('wipeBtn').addEventListener('click', () => {
  const ok = window.confirm(
    'Wipe all auto-synced schoolwork blocks, in-class tags, and schoolwork notes from Intuition (airbnb710.com)? Your personal events, alerts, classes, and notes stay untouched.'
  );
  if (!ok) return;
  statusEl.textContent = 'Wiping all auto-synced schoolwork data from Intuition...';
  chrome.runtime.sendMessage({ type: 'WIPE_SCHOOLWORK_FROM_OPTIONS' }, async (res) => {
    if (!res || !res.ok) {
      await renderStatus('Wipe Error: ' + (res?.error || 'Could not wipe data'));
    } else {
      await renderStatus('Cleaned! ' + (res.summary || 'Wiped all auto-synced schoolwork data.'));
    }
  });
});

load();
