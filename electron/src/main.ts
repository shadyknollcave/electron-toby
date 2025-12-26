import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startEmbeddedServer, stopEmbeddedServer } from './server.js'
import { createApplicationMenu } from './menu.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let serverPort: number | null = null

async function createWindow(): Promise<void> {
  try {
    // Start embedded Express server first
    console.log('Starting embedded Express server...')
    serverPort = await startEmbeddedServer()
    console.log(`Embedded server started on port ${serverPort}`)

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

    // Set application menu
    const menu = createApplicationMenu()
    Menu.setApplicationMenu(menu)

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })

    // Load frontend from embedded server
    const frontendURL = `http://localhost:${serverPort}`
    console.log(`Loading frontend from ${frontendURL}`)
    await mainWindow.loadURL(frontendURL)

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools()
    }

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
  console.log('Shutting down gracefully...')

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
  }

  await stopEmbeddedServer()

  app.quit()
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
    shutdown()
  }
})

app.on('before-quit', async (event) => {
  event.preventDefault()
  await shutdown()
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  shutdown()
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  shutdown()
})
