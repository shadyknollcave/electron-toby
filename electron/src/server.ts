import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { config as dotenvConfig } from 'dotenv'
import type { Server } from 'http'

// Import backend server module (type declaration in backend.d.ts)
// @ts-ignore - Importing compiled JS from backend
import { startServer } from '../../backend/dist/server.js'

let serverInstance: Server | null = null

/**
 * Get or generate APP_SECRET for Electron app
 * In development: Use .env file
 * In production: Generate and store in userData
 */
function getOrGenerateSecret(): string {
  // Development mode: Try .env file
  if (process.env.NODE_ENV === 'development') {
    dotenvConfig({ path: path.join(__dirname, '../../.env') })
    if (process.env.APP_SECRET) {
      console.log('Using APP_SECRET from .env file')
      return process.env.APP_SECRET
    }
  }

  // Production mode: Store in userData
  const secretPath = path.join(app.getPath('userData'), 'app-secret.txt')

  if (fs.existsSync(secretPath)) {
    const secret = fs.readFileSync(secretPath, 'utf8').trim()
    console.log('Loaded APP_SECRET from userData')
    return secret
  }

  // Generate new secret
  const secret = crypto.randomBytes(32).toString('hex')
  const userDataPath = app.getPath('userData')

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  // Write secret with restricted permissions
  fs.writeFileSync(secretPath, secret, { mode: 0o600 })
  console.log('Generated new APP_SECRET and saved to userData')

  return secret
}

/**
 * Check if port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net')
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close()
        resolve(true)
      })
      .listen(port)
  })
}

/**
 * Find an available port starting from the preferred port
 */
async function findAvailablePort(preferredPort: number): Promise<number> {
  let port = preferredPort
  const maxAttempts = 10

  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) {
      return port
    }
    port++
  }

  throw new Error(`Could not find available port after ${maxAttempts} attempts`)
}

/**
 * Start the embedded Express server
 * @returns The port number the server is listening on
 */
export async function startEmbeddedServer(): Promise<number> {
  try {
    // Get APP_SECRET
    const appSecret = getOrGenerateSecret()

    // Get database path in userData
    const databasePath = path.join(app.getPath('userData'), 'config.db')
    console.log(`Database path: ${databasePath}`)

    // Find available port
    const port = await findAvailablePort(3000)
    console.log(`Using port: ${port}`)

    // Start the backend server with Electron-specific configuration
    serverInstance = await startServer({
      databasePath,
      appSecret,
      port,
      frontendURL: `http://localhost:${port}`
    })

    console.log(`Embedded Express server started on port ${port}`)
    return port

  } catch (error) {
    console.error('Failed to start embedded server:', error)
    throw error
  }
}

/**
 * Stop the embedded Express server gracefully
 */
export async function stopEmbeddedServer(): Promise<void> {
  if (!serverInstance) {
    return
  }

  return new Promise((resolve, reject) => {
    serverInstance!.close((err) => {
      if (err) {
        console.error('Error stopping server:', err)
        reject(err)
      } else {
        console.log('Embedded server stopped')
        serverInstance = null
        resolve()
      }
    })
  })
}
