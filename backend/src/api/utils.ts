import { Request, Response, NextFunction } from 'express'

/**
 * Wraps async route handlers to catch errors and send proper error responses
 * @param fn Async function that handles the request
 * @returns Express middleware function
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: Error) => {
      console.error('API Error:', error)
      res.status(500).json({ error: error.message })
    })
  }
}
