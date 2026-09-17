import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { queryOne, run } from '../db.ts';
import {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  rateLimiter,
  AuthRequest,
  AuthenticatedUser,
} from '../middleware/auth.ts';

export const authRouter = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').toLowerCase(),
  phone: z.string().min(8, 'Phone number is too short').max(20).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// REGISTER
authRouter.post('/register', rateLimiter(60000, 15), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { name, email, phone, password } = parsed.data;

    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const apiKey = 'smm_' + crypto.randomBytes(24).toString('hex');

    const result = await run(
      `INSERT INTO users (name, email, phone, password_hash, role, coin_balance, is_verified, is_banned, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user', 0, 1, 0, ?, datetime('now'), datetime('now'))`,
      [name, email, phone || null, passwordHash, apiKey]
    );

    const newUser: AuthenticatedUser = {
      id: result.lastInsertRowid,
      email,
      name,
      role: 'user',
      phone: phone || undefined,
      coin_balance: 0,
      is_verified: 1,
      api_key: apiKey,
    };

    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateRefreshToken(newUser.id);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Registration successful! Welcome to SMM Boost Panel.',
      user: newUser,
      accessToken,
      refreshToken,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
});

// LOGIN
authRouter.post('/login', rateLimiter(60000, 20), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { email, password, rememberMe } = parsed.data;

    const user = await queryOne<any>(
      'SELECT id, email, password_hash, name, phone, role, coin_balance, is_verified, is_banned, api_key FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.is_banned) {
      res.status(403).json({ error: 'Your account has been suspended. Please contact admin support.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      coin_balance: user.coin_balance,
      is_verified: user.is_verified,
      api_key: user.api_key,
    };

    const accessToken = generateAccessToken(authUser);
    const refreshToken = await generateRefreshToken(authUser.id);

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
    });

    res.json({
      message: 'Login successful!',
      user: authUser,
      accessToken,
      refreshToken,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// REFRESH TOKEN
authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token missing.' });
      return;
    }

    const userId = await verifyRefreshToken(refreshToken);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    const user = await queryOne<AuthenticatedUser>(
      'SELECT id, email, name, phone, role, coin_balance, is_verified, api_key FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }

    const newAccessToken = generateAccessToken(user);

    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.json({
      accessToken: newAccessToken,
      user,
    });
  } catch (err: any) {
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Server error refreshing token.' });
  }
});

// LOGOUT
authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const refreshToken = req.body.refreshToken;
    if (refreshToken && req.user) {
      await run('DELETE FROM sessions WHERE refresh_token = ? AND user_id = ?', [refreshToken, req.user.id]);
    } else if (req.user) {
      await run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
    }

    res.clearCookie('access_token');
    res.json({ message: 'Logged out successfully.' });
  } catch (err: any) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Error logging out.' });
  }
});

// FORGOT PASSWORD
authRouter.post('/forgot-password', rateLimiter(60000, 5), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { email } = parsed.data;
    const user = await queryOne<{ id: number; email: string }>('SELECT id, email FROM users WHERE email = ?', [email]);

    if (!user) {
      // Return success message to prevent user enumeration
      res.json({
        message: 'If an account exists with this email, a password reset link has been dispatched.',
      });
      return;
    }

    // Invalidate previous tokens
    await run('UPDATE password_resets SET used = 1 WHERE user_id = ?', [user.id]);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await run(
      `INSERT INTO password_resets (user_id, token, expires_at, used, created_at)
       VALUES (?, ?, ?, 0, datetime('now'))`,
      [user.id, resetToken, expiresAt]
    );

    // Provide resetToken in response for immediate preview/testing convenience
    res.json({
      message: 'Password reset instructions dispatched.',
      demoResetToken: resetToken,
      resetLink: `/reset-password?token=${resetToken}`,
    });
  } catch (err: any) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error processing password reset.' });
  }
});

// RESET PASSWORD
authRouter.post('/reset-password', rateLimiter(60000, 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { token, password } = parsed.data;

    const resetRecord = await queryOne<any>(
      'SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ? AND used = 0',
      [token]
    );

    if (!resetRecord) {
      res.status(400).json({ error: 'Invalid or already-used reset token.' });
      return;
    }

    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'This reset token has expired. Please request a new one.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [
      passwordHash,
      resetRecord.user_id,
    ]);

    // Mark token as used
    await run('UPDATE password_resets SET used = 1 WHERE id = ?', [resetRecord.id]);

    // Clear all existing sessions for security
    await run('DELETE FROM sessions WHERE user_id = ?', [resetRecord.user_id]);

    res.json({ message: 'Password has been successfully updated! You can now log in.' });
  } catch (err: any) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error resetting password.' });
  }
});

// GET CURRENT USER PROFILE & WALLET BALANCE
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await queryOne<AuthenticatedUser>(
      'SELECT id, email, name, phone, role, coin_balance, is_verified, api_key FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user });
  } catch (err: any) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error retrieving profile.' });
  }
});

// UPDATE PROFILE
authRouter.put('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone } = req.body;
    if (!name || name.trim().length < 2) {
      res.status(400).json({ error: 'Name must be at least 2 characters.' });
      return;
    }

    await run('UPDATE users SET name = ?, phone = ?, updated_at = datetime("now") WHERE id = ?', [
      name.trim(),
      phone ? phone.trim() : null,
      req.user!.id,
    ]);

    const updatedUser = await queryOne<AuthenticatedUser>(
      'SELECT id, email, name, phone, role, coin_balance, is_verified, api_key FROM users WHERE id = ?',
      [req.user!.id]
    );

    res.json({ message: 'Profile updated successfully!', user: updatedUser });
  } catch (err: any) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});

// CHANGE PASSWORD
authRouter.put('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const user = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [
      req.user!.id,
    ]);

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [
      newHash,
      req.user!.id,
    ]);

    res.json({ message: 'Password changed successfully!' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

// REGENERATE SMM RESELLER API KEY
authRouter.post('/regenerate-api-key', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const newApiKey = 'smm_' + crypto.randomBytes(24).toString('hex');
    await run('UPDATE users SET api_key = ?, updated_at = datetime("now") WHERE id = ?', [newApiKey, req.user!.id]);

    res.json({ message: 'API key regenerated successfully!', apiKey: newApiKey });
  } catch (err: any) {
    console.error('Regenerate API key error:', err);
    res.status(500).json({ error: 'Server error regenerating API key.' });
  }
});
