// c:\Electron\main.js
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { autoUpdater } = require('electron-updater');
const geminiService = require('./gemini-service');

let mainWindow = null;
let setupWindow = null;

// ===============================
// Config
// ===============================
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const AVAILABLE_MODELS = [
  { id: 'models/gemini-3.8-live', label: 'Gemini 3.8 Live (current)' },
  { id: 'models/gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live Preview' },
  { id: 'models/gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Native Audio Preview (12/2025)' }
];

function readRawConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('Config read error:', e.message);
    return {};
  }
}

function getApiKey() {
  const cfg = readRawConfig();
  if (cfg.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(cfg.apiKeyEnc, 'base64'));
    } catch (e) {
      console.error('Failed to decrypt API key:', e.message);
      return '';
    }
  }
  return cfg.apiKeyPlain || '';
}

function getProxy() {
  const cfg = readRawConfig();
  return cfg.proxy || '';
}

function getSelectedModel() {
  const cfg = readRawConfig();
  return cfg.model || AVAILABLE_MODELS[0].id;
}

function hasValidConfig() {
  return !!getApiKey();
}

function saveConfig({ apiKey, proxy, model }) {
  const current = readRawConfig();
  const patch = { ...current };

  if (typeof apiKey === 'string') {
    if (safeStorage.isEncryptionAvailable()) {
      patch.apiKeyEnc = safeStorage.encryptString(apiKey).toString('base64');
      delete patch.apiKeyPlain;
    } else {
      patch.apiKeyPlain = apiKey;
      delete patch.apiKeyEnc;
    }
  }
  if (typeof proxy === 'string') patch.proxy = proxy;
  if (typeof model === 'string') patch.model = model;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(patch, null, 2));
}

function applyConfigToEnv() {
  const key = getApiKey();
  const proxy = getProxy();
  if (key) process.env.GEMINI_API_KEY = key;
  if (proxy) process.env.SOCKS_PROXY = proxy;
  else delete process.env.SOCKS_PROXY;
}

// ===============================
// Setup / Settings window
// ===============================
function openSetupWindow(isFirstRun) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 540,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: isFirstRun ? 'Nyoura Assistant — Setup' : 'Nyoura Assistant — Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile('setup.html');

  setupWindow.on('closed', () => {
    setupWindow = null;

    // If first run and still no key — quit the app
    if (isFirstRun && !hasValidConfig()) {
      app.quit();
    }
  });
}

// ===============================
// Main window
// ===============================
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default'
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    geminiService.disconnect();
  });
}

// ===============================
// Auto updates
// ===============================
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`🔄 Update available: ${info.version}`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('✅ No updates available.');
  });
  autoUpdater.on('download-progress', (p) => {
    console.log(`⬇️  Downloading: ${p.percent.toFixed(1)}%`);
  });
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: 'A new version has been downloaded. Restart now?',
      buttons: ['Restart', 'Later']
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
  });
  autoUpdater.on('error', (err) => {
    console.error('❌ Auto-update error:', err.message);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Update check error:', err.message);
    });
  }, 5000);
}

// ===============================
// App startup
// ===============================
app.whenReady().then(() => {
  applyConfigToEnv();

  if (!hasValidConfig()) {
    openSetupWindow(true);
  } else {
    createMainWindow();
    setupAutoUpdater();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!hasValidConfig()) openSetupWindow(true);
      else createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===============================
// IPC Handlers
// ===============================

// Save key/proxy (from setup or settings)
ipcMain.handle('setup-save', (event, { apiKey, proxy }) => {
  try {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API key is required.' };
    }

    saveConfig({ apiKey: apiKey.trim(), proxy: (proxy || '').trim() });
    applyConfigToEnv();

    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.close();
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
      setupAutoUpdater();
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get current values (to prefill settings form)
ipcMain.handle('setup-get-current', () => {
  const key = getApiKey();
  return {
    // Return masked hint so we don't expose the full key back to renderer
    apiKeyHint: key ? key.slice(0, 6) + '...' + key.slice(-4) : '',
    hasApiKey: !!key,
    proxy: getProxy()
  };
});

ipcMain.handle('setup-open-api-page', () => {
  shell.openExternal('https://aistudio.google.com/app/apikey');
  return { success: true };
});

// Open settings from the main window
ipcMain.handle('open-settings', () => {
  openSetupWindow(false);
  return { success: true };
});

// Models
ipcMain.handle('get-models', () => {
  return {
    models: AVAILABLE_MODELS,
    current: getSelectedModel()
  };
});

ipcMain.handle('set-model', (event, modelId) => {
  const valid = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!valid) return { success: false, error: 'Unknown model: ' + modelId };
  saveConfig({ model: modelId });
  console.log(`🧠 Model switched to: ${modelId}`);
  return { success: true, model: modelId };
});

// Gemini
ipcMain.handle('init-gemini', async () => {
  try {
    const model = getSelectedModel();
    console.log(`🔄 Initializing Gemini with model: ${model}`);

    await geminiService.connect({
      model,
      onAudioChunk: (buffer) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('play-audio-chunk', buffer);
        }
      },
      onError: (err) => {
        console.error('Gemini Service Error:', err);
      }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.on('send-audio-chunk', (event, arrayBuffer) => {
  if (!geminiService || typeof geminiService.sendAudio !== 'function') {
    console.error('❌ CRITICAL: geminiService.sendAudio is not a function!');
    return;
  }
  try {
    geminiService.sendAudio(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error('Error sending audio to Gemini:', e);
  }
});