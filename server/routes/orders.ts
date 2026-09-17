import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, run } from '../db.ts';
import { authenticate, AuthRequest } from '../middleware/auth.ts';

export const ordersRouter = Router();

// Order creation schema
const createOrderSchema = z.object({
  serviceId: z.number().int().positive('Service ID is required'),
  link: z.string().min(3, 'Target URL or username is required').max(500).optional(),
  linkOrUsername: z.string().min(3, 'Target URL or username is required').max(500).optional(),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  notes: z.string().max(500).optional(),
}).refine((data) => data.link || data.linkOrUsername, {
  message: 'Target URL or username is required',
  path: ['link'],
});

// PLACE NEW ORDER
ordersRouter.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log('Order validation issues:', JSON.stringify(parsed.error.issues));
      res.status(400).json({ error: parsed.error.issues[0].message, issues: parsed.error.issues });
      return;
    }

    const { serviceId, link, linkOrUsername, quantity, notes } = parsed.data;
    const targetLink = (link || linkOrUsername)!.trim();
    const userId = req.user!.id;

    // 1. Fetch service
    const service = await queryOne<any>(
      'SELECT id, name, platform, service_type, coin_price_per_1000, min_quantity, max_quantity, is_active FROM services WHERE id = ?',
      [serviceId]
    );

    if (!service || !service.is_active) {
      res.status(404).json({ error: 'Selected service is currently unavailable or inactive.' });
      return;
    }

    // 2. Validate quantity limits
    if (quantity < service.min_quantity) {
      res.status(400).json({
        error: `Minimum order quantity for this service is ${service.min_quantity.toLocaleString()} units.`,
      });
      return;
    }

    if (quantity > service.max_quantity) {
      res.status(400).json({
        error: `Maximum order quantity for this service is ${service.max_quantity.toLocaleString()} units.`,
      });
      return;
    }

    // 3. Calculate coin cost and Naira equivalent (₦500 = 10,000 coins => ₦0.05 per coin)
    const coinCost = Math.ceil((quantity / 1000) * service.coin_price_per_1000);
    const nairaEquivalent = parseFloat(((coinCost / 10000) * 500).toFixed(2));

    // 4. Fetch fresh user coin balance
    const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    if (user.coin_balance < coinCost) {
      const deficit = coinCost - user.coin_balance;
      res.status(400).json({
        error: `Insufficient coins. You have ${user.coin_balance.toLocaleString()} coins, but this order requires ${coinCost.toLocaleString()} coins. You need ${deficit.toLocaleString()} more coins.`,
        code: 'INSUFFICIENT_COINS',
        coinsNeeded: deficit,
        nairaEquivalentNeeded: parseFloat(((deficit / 10000) * 500).toFixed(2)),
      });
      return;
    }

    // 5. Deduct coins and update user balance
    const newBalance = user.coin_balance - coinCost;
    await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [newBalance, userId]);

    // 6. Generate external order tracking ID
    const externalOrderId = 'EXT-' + Math.floor(100000 + Math.random() * 900000);

    // 7. Insert order
    const orderResult = await run(
      `INSERT INTO orders (user_id, service_id, link_or_username, quantity, coin_cost, naira_equivalent, status, external_order_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`,
      [userId, service.id, targetLink, quantity, coinCost, nairaEquivalent, externalOrderId, notes || null]
    );

    const orderId = orderResult.lastInsertRowid;
    const orderRef = `ORD-${orderId}-${Date.now().toString().slice(-6)}`;

    // 8. Insert transaction ledger entry
    await run(
      `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
       VALUES (?, 'order', 0, ?, ?, ?, 'system', 'completed', ?, datetime('now'))`,
      [userId, -coinCost, newBalance, orderRef, `Order #${orderId} - ${quantity.toLocaleString()} ${service.name}`]
    );

    // 9. Fetch created order with service information
    const createdOrder = await queryOne(
      `SELECT o.*, s.name as service_name, s.platform, s.service_type, s.delivery_speed
       FROM orders o
       JOIN services s ON o.service_id = s.id
       WHERE o.id = ?`,
      [orderId]
    );

    res.status(201).json({
      message: 'Order placed successfully! We have started queuing your boost.',
      order: createdOrder,
      newBalance,
    });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to process order.' });
  }
});

// GET USER ORDERS
ordersRouter.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status, platform, search, limit = 50, page = 1 } = req.query;

    let sql = `
      SELECT o.*, s.name as service_name, s.platform, s.service_type, s.delivery_speed
      FROM orders o
      JOIN services s ON o.service_id = s.id
      WHERE o.user_id = ?
    `;
    const params: any[] = [userId];

    if (status && typeof status === 'string' && status !== 'all') {
      sql += ' AND o.status = ?';
      params.push(status.toLowerCase());
    }

    if (platform && typeof platform === 'string' && platform !== 'all') {
      sql += ' AND s.platform = ?';
      params.push(platform.toLowerCase());
    }

    if (search && typeof search === 'string' && search.trim()) {
      sql += ' AND (o.link_or_username LIKE ? OR s.name LIKE ? OR o.id = ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, Number(search) || -1);
    }

    sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = ((Number(page) || 1) - 1) * limitNum;
    params.push(limitNum, offsetNum);

    const orders = await query(sql, params);

    // Count total for stats
    const totalStats = await queryOne<{ total: number; pending: number; processing: number; completed: number }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM orders WHERE user_id = ?`,
      [userId]
    );

    res.json({
      orders,
      stats: totalStats || { total: 0, pending: 0, processing: 0, completed: 0 },
    });
  } catch (err: any) {
    console.error('Fetch orders error:', err);
    res.status(500).json({ error: 'Failed to retrieve order history.' });
  }
});

// CANCEL PENDING ORDER & REFUND COINS
ordersRouter.post('/:id/cancel', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user!.id;

    const order = await queryOne<any>(
      'SELECT id, user_id, coin_cost, status, quantity FROM orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    );

    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.status !== 'pending') {
      res.status(400).json({
        error: `Cannot cancel an order that is already '${order.status}'. Only pending orders can be cancelled.`,
      });
      return;
    }

    // Refund coins to user
    const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);
    const refundBalance = (user?.coin_balance || 0) + order.coin_cost;

    await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [refundBalance, userId]);

    // Update order status
    await run('UPDATE orders SET status = "cancelled", updated_at = datetime("now") WHERE id = ?', [orderId]);

    // Transaction ledger record
    const refundRef = `REFUND-ORD-${orderId}-${Date.now().toString().slice(-5)}`;
    await run(
      `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
       VALUES (?, 'refund', 0, ?, ?, 'system', 'completed', ?, datetime('now'))`,
      [userId, order.coin_cost, refundBalance, refundRef, `Refund for cancelled Order #${orderId}`]
    );

    res.json({
      message: `Order #${orderId} has been cancelled. ${order.coin_cost.toLocaleString()} coins have been refunded to your wallet.`,
      newBalance: refundBalance,
    });
  } catch (err: any) {
    console.error('Cancel order error:', err);
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
});
