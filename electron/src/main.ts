import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startEmbeddedServer, stopEmbeddedServer } from './server.js'
import { createApplicationMenu } from './menu.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let serverPort: number | null = null
let isShuttingDown = false

/**
 * Wait for server to be ready by checking health endpoint
 */
async function waitForServer(port: number, maxAttempts: number = 10): Promise<boolean> {
  const healthURL = `http://localhost:${port}/api/health`

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Checking server health (attempt ${attempt}/${maxAttempts})...`)
      const response = await fetch(healthURL)
      if (response.ok) {
        console.log('✅ Server is ready')
        return true
      }
    } catch (error) {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.error('❌ Server failed to respond after', maxAttempts, 'attempts')
  return false
}

async function createWindow(): Promise<void> {
  try {
    // Start embedded Express server first
    console.log('Starting embedded Express server...')
    serverPort = await startEmbeddedServer()
    console.log(`Embedded server started on port ${serverPort}`)

    // Wait for server to be ready
    const serverReady = await waitForServer(serverPort)
    if (!serverReady) {
      throw new Error('Server failed to start properly')
    }

    // Create the browser window
    mainWindow = new BrowserWindow({
      width: 1800,
      height: 1200,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      },
      icon: path.join(__dirname, '../assets/icon.png'),
      title: 'TobyAI - MCP Chatbot',
      show: false // Don't show until ready-to-show
    })

    // Clear cache before loading
    await mainWindow.webContents.session.clearCache()
    console.log('🗑️  Cache cleared')

    // Set Content Security Policy for security
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "connect-src 'self' http://localhost:* https:; " +
            "font-src 'self' data:; " +
            "child-src 'self' blob:"
          ]
        }
      })
    })

    // Set application menu
    const menu = createApplicationMenu()
    Menu.setApplicationMenu(menu)

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })

    // Load frontend from embedded server
    // Add timestamp to bust cache
    const frontendURL = `http://localhost:${serverPort}/?t=${Date.now()}`
    console.log(`Loading frontend from ${frontendURL}`)

    try {
      await mainWindow.loadURL(frontendURL, {
        extraHeaders: 'pragma: no-cache\n'
      })
      console.log('✅ Frontend loaded successfully')
    } catch (error) {
      console.error('❌ Failed to load frontend URL:', error)
      throw error
    }

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools()
    }

    // Log any page load errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('❌ Page failed to load:', {
        errorCode,
        errorDescription,
        url: validatedURL
      })
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

  } catch (error) {
    console.error('Error creating window:', error)
    app.quit()
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.log('Shutting down gracefully...')

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
  }

  await stopEmbeddedServer()
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async (event) => {
  if (!isShuttingDown) {
    event.preventDefault()
    await shutdown()
    app.quit()
  }
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  app.quit()
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  app.quit()
})
