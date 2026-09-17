import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, run } from '../db.ts';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.ts';

export const adminRouter = Router();

// Protect ALL admin routes with both authentication and requireAdmin middleware
adminRouter.use(authenticate, requireAdmin);

// 1. ADMIN DASHBOARD STATS & METRICS
adminRouter.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userStats = await queryOne<{ total_users: number; banned_users: number }>(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as banned_users
       FROM users WHERE role = 'user'`
    );

    const orderStats = await queryOne<{
      total_orders: number;
      pending_orders: number;
      processing_orders: number;
      completed_orders: number;
      cancelled_orders: number;
      total_coins_spent: number;
    }>(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        COALESCE(SUM(coin_cost), 0) as total_coins_spent
       FROM orders`
    );

    const revenueStats = await queryOne<{ total_naira_revenue: number; total_coins_credited: number }>(
      `SELECT 
        COALESCE(SUM(amount_naira), 0) as total_naira_revenue,
        COALESCE(SUM(amount_coins), 0) as total_coins_credited
       FROM transactions WHERE type = 'deposit' AND status = 'completed'`
    );

    const circulation = await queryOne<{ coins_in_circulation: number }>(
      'SELECT COALESCE(SUM(coin_balance), 0) as coins_in_circulation FROM users'
    );

    // Recent orders
    const recentOrders = await query(
      `SELECT o.*, u.email as user_email, u.name as user_name, s.name as service_name, s.platform
       FROM orders o
       JOIN users u ON o.user_id = u.id
       JOIN services s ON o.service_id = s.id
       ORDER BY o.id DESC LIMIT 10`
    );

    // Daily breakdown for visual chart (last 7 days)
    const dailyData = await query(
      `SELECT 
        date(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(coin_cost), 0) as coins_volume,
        COALESCE(SUM(naira_equivalent), 0) as naira_volume
       FROM orders
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY date(created_at)
       ORDER BY date(created_at) ASC`
    );

    res.json({
      totalUsers: userStats?.total_users || 0,
      bannedUsers: userStats?.banned_users || 0,
      totalOrders: orderStats?.total_orders || 0,
      pendingOrders: orderStats?.pending_orders || 0,
      processingOrders: orderStats?.processing_orders || 0,
      completedOrders: orderStats?.completed_orders || 0,
      cancelledOrders: orderStats?.cancelled_orders || 0,
      totalCoinsSpent: orderStats?.total_coins_spent || 0,
      totalNairaRevenue: revenueStats?.total_naira_revenue || 0,
      coinsInCirculation: circulation?.coins_in_circulation || 0,
      recentOrders,
      dailyData,
    });
  } catch (err: any) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to load admin statistics.' });
  }
});

// 2. USER MANAGEMENT
// List users with search & filters
adminRouter.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, role, status } = req.query;
    let sql = 'SELECT id, email, name, phone, role, coin_balance, is_verified, is_banned, created_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (email LIKE ? OR name LIKE ? OR phone LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (role && typeof role === 'string' && role !== 'all') {
      sql += ' AND role = ?';
      params.push(role);
    }

    if (status === 'banned') {
      sql += ' AND is_banned = 1';
    } else if (status === 'active') {
      sql += ' AND is_banned = 0';
    }

    sql += ' ORDER BY id DESC LIMIT 100';

    const users = await query(sql, params);
    res.json({ users });
  } catch (err: any) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// Ban/unban user
adminRouter.post('/users/:id/toggle-ban', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = Number(req.params.id);
    const { reason } = req.body;

    const user = await queryOne<any>('SELECT id, is_banned, role, email FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.role === 'admin') {
      res.status(403).json({ error: 'Cannot ban an administrator account.' });
      return;
    }

    const newStatus = user.is_banned ? 0 : 1;
    await run('UPDATE users SET is_banned = ?, updated_at = datetime("now") WHERE id = ?', [newStatus, targetUserId]);

    // If banning, terminate all sessions
    if (newStatus === 1) {
      await run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
    }

    // Log admin action
    await run(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, 'user', ?, ?, datetime('now'))`,
      [req.user!.id, newStatus === 1 ? 'BAN_USER' : 'UNBAN_USER', targetUserId, reason || 'Status toggled by admin']
    );

    res.json({
      message: `User ${user.email} is now ${newStatus === 1 ? 'banned' : 'active'}.`,
      is_banned: newStatus,
    });
  } catch (err: any) {
    console.error('Toggle ban error:', err);
    res.status(500).json({ error: 'Failed to change user status.' });
  }
});

// Adjust user coin balance manually
const adjustBalanceSchema = z.object({
  amountCoins: z.number().int(),
  reason: z.string().min(2, 'Reason is required for manual coin adjustment'),
});

adminRouter.post('/users/:id/adjust-coins', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = Number(req.params.id);
    const parsed = adjustBalanceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { amountCoins, reason } = parsed.data;

    const user = await queryOne<{ id: number; email: string; coin_balance: number }>('SELECT id, email, coin_balance FROM users WHERE id = ?', [
      targetUserId,
    ]);

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const newBalance = Math.max(0, user.coin_balance + amountCoins);
    await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [newBalance, targetUserId]);

    // Record ledger transaction
    const ref = `MANUAL_ADJ_${Date.now()}`;
    await run(
      `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
       VALUES (?, 'admin_adjustment', 0, ?, ?, ?, 'system', 'completed', ?, datetime('now'))`,
      [targetUserId, amountCoins, newBalance, ref, `Admin adjustment: ${reason}`]
    );

    // Audit log
    await run(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'ADJUST_COINS', 'user', ?, ?, datetime('now'))`,
      [req.user!.id, targetUserId, `Adjusted by ${amountCoins} coins. New balance: ${newBalance}. Reason: ${reason}`]
    );

    res.json({
      message: `Balance adjusted successfully. New balance: ${newBalance.toLocaleString()} coins.`,
      newBalance,
    });
  } catch (err: any) {
    console.error('Adjust coins error:', err);
    res.status(500).json({ error: 'Failed to adjust coin balance.' });
  }
});

// 3. SERVICE MANAGEMENT (CRUD)
// List all services (including inactive)
adminRouter.get('/services', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const services = await query('SELECT * FROM services ORDER BY platform ASC, coin_price_per_1000 DESC');
    res.json({ services });
  } catch (err: any) {
    console.error('Admin services error:', err);
    res.status(500).json({ error: 'Failed to retrieve services.' });
  }
});

const serviceSchema = z.object({
  platform: z.string().min(2),
  service_type: z.string().min(2),
  name: z.string().min(3),
  description: z.string().optional(),
  coin_price_per_1000: z.number().int().positive('Price must be greater than 0'),
  min_quantity: z.number().int().positive(),
  max_quantity: z.number().int().positive(),
  delivery_speed: z.string().min(2),
  is_active: z.number().int().min(0).max(1).default(1),
});

// Create new service
adminRouter.post('/services', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const s = parsed.data;
    const result = await run(
      `INSERT INTO services (platform, service_type, name, description, coin_price_per_1000, min_quantity, max_quantity, delivery_speed, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [s.platform.toLowerCase(), s.service_type.toLowerCase(), s.name, s.description || null, s.coin_price_per_1000, s.min_quantity, s.max_quantity, s.delivery_speed, s.is_active]
    );

    const created = await queryOne('SELECT * FROM services WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Service created successfully!', service: created });
  } catch (err: any) {
    console.error('Create service error:', err);
    res.status(500).json({ error: 'Failed to create service.' });
  }
});

// Update service
adminRouter.put('/services/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const serviceId = Number(req.params.id);
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const s = parsed.data;
    await run(
      `UPDATE services SET 
        platform = ?, service_type = ?, name = ?, description = ?, coin_price_per_1000 = ?, 
        min_quantity = ?, max_quantity = ?, delivery_speed = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [s.platform.toLowerCase(), s.service_type.toLowerCase(), s.name, s.description || null, s.coin_price_per_1000, s.min_quantity, s.max_quantity, s.delivery_speed, s.is_active, serviceId]
    );

    const updated = await queryOne('SELECT * FROM services WHERE id = ?', [serviceId]);
    res.json({ message: 'Service updated successfully!', service: updated });
  } catch (err: any) {
    console.error('Update service error:', err);
    res.status(500).json({ error: 'Failed to update service.' });
  }
});

// Delete or toggle active
adminRouter.delete('/services/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const serviceId = Number(req.params.id);
    // Soft delete / disable
    await run('UPDATE services SET is_active = 0, updated_at = datetime("now") WHERE id = ?', [serviceId]);
    res.json({ message: 'Service deactivated successfully.' });
  } catch (err: any) {
    console.error('Delete service error:', err);
    res.status(500).json({ error: 'Failed to deactivate service.' });
  }
});

// 4. ORDER MANAGEMENT
// Get all orders with search & status filters
adminRouter.get('/orders', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, platform, search, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT o.*, u.email as user_email, u.name as user_name, s.name as service_name, s.platform, s.service_type
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN services s ON o.service_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && typeof status === 'string' && status !== 'all') {
      sql += ' AND o.status = ?';
      params.push(status.toLowerCase());
    }

    if (platform && typeof platform === 'string' && platform !== 'all') {
      sql += ' AND s.platform = ?';
      params.push(platform.toLowerCase());
    }

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (o.link_or_username LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR o.id = ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`, Number(search) || -1);
    }

    sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = ((Number(page) || 1) - 1) * limitNum;
    params.push(limitNum, offsetNum);

    const orders = await query(sql, params);
    res.json({ orders });
  } catch (err: any) {
    console.error('Admin orders error:', err);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

// Update order status (pending -> processing -> completed -> cancelled)
adminRouter.post('/orders/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const { status, notes, externalOrderId } = req.body;

    if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid order status value.' });
      return;
    }

    const order = await queryOne<any>('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const oldStatus = order.status;

    // If transitioning TO cancelled and was not cancelled before, refund coins to the user!
    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [order.user_id]);
      const refundBalance = (user?.coin_balance || 0) + order.coin_cost;

      await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [refundBalance, order.user_id]);

      const refundRef = `ADMIN_REFUND_ORD_${orderId}_${Date.now().toString().slice(-4)}`;
      await run(
        `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
         VALUES (?, 'refund', 0, ?, ?, ?, 'system', 'completed', ?, datetime('now'))`,
        [order.user_id, order.coin_cost, refundBalance, refundRef, `Refund for cancelled Order #${orderId} by Admin`]
      );
    }

    await run(
      `UPDATE orders SET status = ?, notes = COALESCE(?, notes), external_order_id = COALESCE(?, external_order_id), updated_at = datetime('now') WHERE id = ?`,
      [status, notes || null, externalOrderId || null, orderId]
    );

    // Audit log
    await run(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, 'UPDATE_ORDER_STATUS', 'order', ?, ?, datetime('now'))`,
      [req.user!.id, orderId, `Changed status from ${oldStatus} to ${status}`]
    );

    res.json({
      message: `Order #${orderId} status updated to '${status}'.`,
      status,
    });
  } catch (err: any) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// 5. COIN PACKAGES MANAGEMENT
adminRouter.get('/packages', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const packages = await query('SELECT * FROM coin_packages ORDER BY naira_price ASC');
    res.json({ packages });
  } catch (err: any) {
    console.error('Admin packages error:', err);
    res.status(500).json({ error: 'Failed to retrieve coin packages.' });
  }
});

const packageSchema = z.object({
  name: z.string().min(2),
  naira_price: z.number().int().positive(),
  coins: z.number().int().positive(),
  bonus_coins: z.number().int().min(0).default(0),
  badge: z.string().optional(),
  is_active: z.number().int().min(0).max(1).default(1),
});

adminRouter.post('/packages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = packageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const p = parsed.data;
    const result = await run(
      `INSERT INTO coin_packages (name, naira_price, coins, bonus_coins, badge, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [p.name, p.naira_price, p.coins, p.bonus_coins, p.badge || null, p.is_active]
    );

    const created = await queryOne('SELECT * FROM coin_packages WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Coin package created successfully!', package: created });
  } catch (err: any) {
    console.error('Create package error:', err);
    res.status(500).json({ error: 'Failed to create coin package.' });
  }
});

adminRouter.put('/packages/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pkgId = Number(req.params.id);
    const parsed = packageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const p = parsed.data;
    await run(
      `UPDATE coin_packages SET name = ?, naira_price = ?, coins = ?, bonus_coins = ?, badge = ?, is_active = ? WHERE id = ?`,
      [p.name, p.naira_price, p.coins, p.bonus_coins, p.badge || null, p.is_active, pkgId]
    );

    const updated = await queryOne('SELECT * FROM coin_packages WHERE id = ?', [pkgId]);
    res.json({ message: 'Coin package updated successfully!', package: updated });
  } catch (err: any) {
    console.error('Update package error:', err);
    res.status(500).json({ error: 'Failed to update coin package.' });
  }
});

// 6. TRANSACTIONS LOG & CSV EXPORT
adminRouter.get('/transactions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, search, limit = 50 } = req.query;
    let sql = `
      SELECT t.*, u.email as user_email, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type && typeof type === 'string' && type !== 'all') {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (t.reference LIKE ? OR u.email LIKE ? OR t.description LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    sql += ' ORDER BY t.id DESC LIMIT ?';
    params.push(Math.min(Number(limit) || 50, 200));

    const transactions = await query(sql, params);
    res.json({ transactions });
  } catch (err: any) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// Export CSV of transactions
adminRouter.get('/reports/transactions/export', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await query<any>(
      `SELECT t.id, t.reference, u.email as user_email, t.type, t.amount_naira, t.amount_coins, t.balance_after, t.status, t.payment_gateway, t.description, t.created_at
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       ORDER BY t.id DESC`
    );

    let csv = 'ID,Reference,User Email,Type,Naira Amount,Coins Amount,Balance After,Status,Gateway,Description,Date\n';
    for (const r of rows) {
      csv += `"${r.id}","${r.reference}","${r.user_email}","${r.type}","${r.amount_naira}","${r.amount_coins}","${r.balance_after}","${r.status}","${r.payment_gateway || ''}","${(r.description || '').replace(/"/g, '""')}","${r.created_at}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transactions_export_${Date.now()}.csv`);
    res.send(csv);
  } catch (err: any) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export transactions CSV.' });
  }
});

// 7. AUDIT LOGS
adminRouter.get('/logs', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await query(
      `SELECT l.*, u.email as admin_email, u.name as admin_name
       FROM admin_logs l
       JOIN users u ON l.admin_id = u.id
       ORDER BY l.id DESC LIMIT 100`
    );
    res.json({ logs });
  } catch (err: any) {
    console.error('Admin logs error:', err);
    res.status(500).json({ error: 'Failed to retrieve admin logs.' });
  }
});
