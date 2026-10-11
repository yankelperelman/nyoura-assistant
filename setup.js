// c:\Electron\setup.js
const apiKeyInput = document.getElementById('apiKey');
const proxyInput = document.getElementById('proxy');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const msgEl = document.getElementById('msg');
const getKeyLink = document.getElementById('get-key-link');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const keyHint = document.getElementById('key-hint');

getKeyLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.electronAPI.openApiKeyPage();
});

// Prefill from current config (when opened as Settings)
(async function prefill() {
  try {
    const cur = await window.electronAPI.setupGetCurrent();
    if (cur && cur.hasApiKey) {
      titleEl.textContent = 'Nyoura Assistant — Settings';
      subtitleEl.textContent = 'Change your API key or proxy settings.';
      apiKeyInput.placeholder = `Current: ${cur.apiKeyHint} — paste new to change`;
      keyHint.innerHTML = 'Leave empty to keep the current key. ' +
        'Get a new one at <a class="link" id="get-key-link2">aistudio.google.com/app/apikey</a>';
      const link2 = document.getElementById('get-key-link2');
      if (link2) link2.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openApiKeyPage();
      });
      if (cur.proxy) proxyInput.value = cur.proxy;
    }
  } catch (_) { /* ignore */ }
})();

async function save() {
  const apiKey = apiKeyInput.value.trim();
  const proxy = proxyInput.value.trim();

  // If opened as Settings and key field left empty, just update proxy
  const cur = await window.electronAPI.setupGetCurrent().catch(() => null);
  const isSettings = cur && cur.hasApiKey;

  if (!apiKey && !isSettings) {
    msgEl.className = 'error';
    msgEl.textContent = 'API key is required.';
    return;
  }

  if (!apiKey && isSettings) {
    // Only proxy is being changed — send a placeholder that signals "keep"
    // We still need the current key, so just skip — or better, tell main to only update proxy
    // Simplest: send empty and let main handle it
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  msgEl.className = 'error';
  msgEl.textContent = '';

  try {
    // If settings and no new key provided — we need to send the current key.
    // Easier: main handles "apiKey === ''" as "keep current key"
    const payload = { apiKey, proxy };
    const result = await window.electronAPI.setupSave(payload);

    if (result && result.success) {
      msgEl.className = 'ok';
      msgEl.textContent = 'Saved.';
      setTimeout(() => window.close(), 500);
    } else {
      msgEl.className = 'error';
      msgEl.textContent = result?.error || 'Failed to save.';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  } catch (e) {
    msgEl.className = 'error';
    msgEl.textContent = e.message;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

saveBtn.addEventListener('click', save);
cancelBtn.addEventListener('click', () => window.close());
apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
proxyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
window.addEventListener('DOMContentLoaded', () => apiKeyInput.focus());