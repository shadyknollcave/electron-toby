import { contextBridge } from 'electron'

/**
 * Preload script for security
 *
 * This script runs before the renderer process loads.
 * It exposes minimal, safe APIs to the renderer via contextBridge.
 *
 * With contextIsolation enabled, this is the only way for the renderer
 * to access Node.js APIs in a secure manner.
 */

// Expose minimal platform information to the renderer
contextBridge.exposeInMainWorld('electron', {
  // Platform information
  platform: process.platform,

  // Version information
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})

// Log that preload script has run
console.log('Preload script loaded')
