const DEFAULTS = {
  ecoSlideId: '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI',
  audiobookSheetId: '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4',
  litSlideId: '',
  precalcSlideId: '',
};

const fields = ['ecoSlideId', 'audiobookSheetId', 'litSlideId', 'precalcSlideId'];
const statusEl = document.getElementById('status');

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  for (const id of fields) {
    document.getElementById(id).value = cfg[id] || '';
  }
  const { lastRun } = await chrome.storage.local.get(['lastRun']);
  if (lastRun) {
    statusEl.textContent = `Last run (${new Date(lastRun.at).toLocaleTimeString()}): ${
      lastRun.summary
    }`;
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const next = {};
  for (const id of fields) {
    next[id] = document.getElementById(id).value.trim();
  }
  await chrome.storage.sync.set(next);
  statusEl.textContent = 'Saved! Click the extension icon in Chrome toolbar anytime to sync.';
});

document.getElementById('syncBtn').addEventListener('click', () => {
  statusEl.textContent = 'Pulling Eco slide + live Audiobook Sheet & sending to Vercel...';
  chrome.runtime.sendMessage({ type: 'RUN_SYNC_FROM_OPTIONS' }, (res) => {
    if (!res || !res.ok) {
      statusEl.textContent = 'Error: ' + (res?.error || 'Sync failed');
    } else {
      statusEl.textContent = 'Synced! ' + res.summary;
    }
  });
});

load();
