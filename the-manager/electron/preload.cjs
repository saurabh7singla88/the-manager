// preload.js — runs in the renderer's context with Node integration OFF
// Must use CommonJS require() — Electron does not support ESM in preload scripts.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info — useful for conditional UI behaviour
  platform:  process.platform,   // 'win32' | 'darwin' | 'linux'
  isElectron: true,
});
