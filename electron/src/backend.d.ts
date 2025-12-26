/**
 * Type declarations for backend server module
 */

import type { Server } from 'http'

export interface ServerOptions {
  databasePath?: string
  appSecret?: string
  port?: number
  frontendURL?: string
}

export function startServer(options?: ServerOptions): Promise<Server>
