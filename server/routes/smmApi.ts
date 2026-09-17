import { Router, Response } from 'express';
import { query, queryOne, run } from '../db.ts';
import { apiKeyAuth, AuthRequest } from '../middleware/auth.ts';

export const smmApiRouter = Router();

// Authenticate all requests via API key
smmApiRouter.use(apiKeyAuth);

/**
 * Standard SMM Reseller API (v1 / v2 compatible protocol)
 * Compatible with automated SMM bots, PerfectPanel, and external clients.
 */
smmApiRouter.all('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const action = req.body.action || req.query.action;
    const userId = req.user!.id;

    switch (action) {
      case 'services': {
        const services = await query(
          'SELECT id as service, name, platform, service_type as category, coin_price_per_1000 as rate, min_quantity as min, max_quantity as max FROM services WHERE is_active = 1'
        );
        res.json(services);
        return;
      }

      case 'balance': {
        const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);
        res.json({
          balance: user?.coin_balance || 0,
          currency: 'COINS',
          naira_equivalent: parseFloat((((user?.coin_balance || 0) / 10000) * 500).toFixed(2)),
        });
        return;
      }

      case 'add': {
        const serviceId = Number(req.body.service);
        const link = req.body.link;
        const quantity = Number(req.body.quantity);

        if (!serviceId || !link || !quantity || quantity <= 0) {
          res.status(400).json({ error: 'Missing required parameters: service, link, quantity.' });
          return;
        }

        const service = await queryOne<any>('SELECT * FROM services WHERE id = ? AND is_active = 1', [serviceId]);
        if (!service) {
          res.status(404).json({ error: 'Service not found or inactive.' });
          return;
        }

        if (quantity < service.min_quantity || quantity > service.max_quantity) {
          res.status(400).json({
            error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}.`,
          });
          return;
        }

        const coinCost = Math.ceil((quantity / 1000) * service.coin_price_per_1000);
        const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);

        if (!user || user.coin_balance < coinCost) {
          res.status(400).json({
            error: 'Not enough coins in account wallet balance.',
            required_coins: coinCost,
            current_balance: user?.coin_balance || 0,
          });
          return;
        }

        const newBalance = user.coin_balance - coinCost;
        await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [newBalance, userId]);

        const extId = 'EXT-' + Math.floor(100000 + Math.random() * 900000);
        const nairaEq = parseFloat(((coinCost / 10000) * 500).toFixed(2));

        const result = await run(
          `INSERT INTO orders (user_id, service_id, link_or_username, quantity, coin_cost, naira_equivalent, status, external_order_id, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'API Order', datetime('now'), datetime('now'))`,
          [userId, service.id, link.trim(), quantity, coinCost, nairaEq, extId]
        );

        const orderId = result.lastInsertRowid;
        const ref = `ORD-API-${orderId}-${Date.now().toString().slice(-4)}`;

        await run(
          `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
           VALUES (?, 'order', 0, ?, ?, ?, 'api', 'completed', ?, datetime('now'))`,
          [userId, -coinCost, newBalance, ref, `API Order #${orderId} - ${quantity} ${service.name}`]
        );

        res.json({ order: orderId, status: 'pending', cost_coins: coinCost, balance: newBalance });
        return;
      }

      case 'status': {
        const orderId = Number(req.body.order || req.query.order);
        if (!orderId) {
          res.status(400).json({ error: 'Order ID is required.' });
          return;
        }

        const order = await queryOne<any>(
          'SELECT id as order, status, coin_cost as charge, link_or_username as link, quantity FROM orders WHERE id = ? AND user_id = ?',
          [orderId, userId]
        );

        if (!order) {
          res.status(404).json({ error: 'Order not found.' });
          return;
        }

        res.json({
          order: order.order,
          status: order.status,
          charge: order.charge,
          remains: order.status === 'completed' ? 0 : order.quantity,
          currency: 'COINS',
        });
        return;
      }

      default:
        res.status(400).json({ error: 'Invalid action. Supported actions: services, balance, add, status' });
        return;
    }
  } catch (err: any) {
    console.error('SMM API error:', err);
    res.status(500).json({ error: 'Internal server error processing SMM API request.' });
  }
});
