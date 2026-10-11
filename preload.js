// c:\Electron\preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Gemini
    initGemini: () => ipcRenderer.invoke('init-gemini'),
    sendAudioChunk: (buf) => ipcRenderer.send('send-audio-chunk', buf),
    onPlayAudio: (cb) => {
        ipcRenderer.removeAllListeners('play-audio-chunk');
        ipcRenderer.on('play-audio-chunk', (e, data) => cb(data));
    },

    // Models
    getModels: () => ipcRenderer.invoke('get-models'),
    setModel: (id) => ipcRenderer.invoke('set-model', id),

    // Setup / Settings
    setupSave: (payload) => ipcRenderer.invoke('setup-save', payload),
    setupGetCurrent: () => ipcRenderer.invoke('setup-get-current'),
    openApiKeyPage: () => ipcRenderer.invoke('setup-open-api-page'),
    openSettings: () => ipcRenderer.invoke('open-settings')
});