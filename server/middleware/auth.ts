import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne, run } from '../db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'smm_super_secret_jwt_key_2025';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smm_super_secret_refresh_jwt_key_2025';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  phone?: string;
  coin_balance?: number;
  is_verified?: number;
  api_key?: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateAccessToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export async function generateRefreshToken(userId: number): Promise<string> {
  const refreshToken = jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Store in sessions table
  await run(
    `INSERT INTO sessions (user_id, refresh_token, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
}

export async function verifyRefreshToken(token: string): Promise<number | null> {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { id: number };
    const session = await queryOne(
      'SELECT * FROM sessions WHERE refresh_token = ? AND user_id = ? AND expires_at > datetime("now")',
      [token, payload.id]
    );
    if (!session) return null;
    return payload.id;
  } catch {
    return null;
  }
}

/**
 * Middleware to authenticate requests via Bearer JWT or cookie
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: 'user' | 'admin'; name: string };
    
    // Check if user still exists and is not banned
    const user = await queryOne<AuthenticatedUser & { is_banned: number }>(
      'SELECT id, email, name, phone, role, coin_balance, is_verified, is_banned, api_key FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }

    if (user.is_banned) {
      res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ error: 'Invalid authentication token.' });
    }
  }
}

/**
 * Middleware to restrict endpoints to admin users
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    return;
  }
  next();
}

/**
 * Middleware for authenticating SMM Reseller API calls via api_key
 */
export async function apiKeyAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = (req.headers['x-api-key'] || req.query.api_key || req.query.key || (req.body && (req.body.api_key || req.body.key))) as string;

  if (!apiKey) {
    res.status(401).json({ status: 'error', error: 'Missing API key. Pass via X-API-KEY header, body or query param.' });
    return;
  }

  const user = await queryOne<AuthenticatedUser & { is_banned: number }>(
    'SELECT id, email, name, phone, role, coin_balance, is_verified, is_banned, api_key FROM users WHERE api_key = ?',
    [apiKey]
  );

  if (!user) {
    res.status(401).json({ status: 'error', error: 'Invalid API key provided.' });
    return;
  }

  if (user.is_banned) {
    res.status(403).json({ status: 'error', error: 'Account suspended.' });
    return;
  }

  req.user = user;
  next();
}

/**
 * In-memory sliding window rate limiter
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(windowMs: number = 60000, maxRequests: number = 10) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please slow down and try again in a moment.',
        retryAfterMs: record.resetTime - now,
      });
      return;
    }

    record.count++;
    next();
  };
}
