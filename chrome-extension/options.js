const DEFAULTS = {
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
  litClassroomUrl: 'https://classroom.google.com/u/1/w/ODc2NjEwODUwOTA2/t/all',
  mathClassroomUrl: 'https://classroom.google.com/u/1/c/ODY2Njc4NTA5ODM3',
  physicsClassroomUrl: 'https://classroom.google.com/u/1/c/ODcyNDg1NzU5NTU3',
  litSlideId: '',
  precalcSlideId: '',
  autoSyncHours: 6,
};

const fields = [
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
  const heading = document.createElement('div');
  heading.style.fontWeight = '700';
  heading.style.marginBottom = '6px';
  heading.textContent = 'Last Synced Source Pages:';
  sourcesLogEl.appendChild(heading);

  for (const s of sources) {
    const row = document.createElement('div');
    row.className = 'src-row';
    const badge = document.createElement('span');
    badge.className = s.ok ? 'src-ok' : 'src-err';
    badge.textContent = `${s.ok ? '✓' : '✗'} ${s.course}: `;
    row.appendChild(badge);
    row.appendChild(document.createTextNode(`${s.sourceUrl} — ${s.detail || ''}`));
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

load();
