import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query, queryOne, run } from '../db.ts';
import { authenticate, AuthRequest } from '../middleware/auth.ts';

export const walletRouter = Router();

const KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY || '';
const KORAPAY_WEBHOOK_SECRET = process.env.KORAPAY_WEBHOOK_SECRET || KORAPAY_SECRET_KEY;
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

walletRouter.get('/packages', async (_req: Request, res: Response): Promise<void> => {
  try {
    const packages = await query('SELECT * FROM coin_packages WHERE is_active = 1 ORDER BY naira_price ASC');
    res.json({ packages });
  } catch (err) {
    console.error('Error fetching coin packages:', err);
    res.status(500).json({ error: 'Failed to retrieve coin packages.' });
  }
});

walletRouter.get('/summary', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);
    const transactions = await query('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50', [userId]);
    const stats = await queryOne<{ total_deposited_naira: number; total_spent_coins: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount_naira ELSE 0 END), 0) as total_deposited_naira,
              COALESCE(SUM(CASE WHEN type = 'order' THEN ABS(amount_coins) ELSE 0 END), 0) as total_spent_coins
       FROM transactions WHERE user_id = ?`, [userId]
    );
    res.json({
      coin_balance: user?.coin_balance || 0,
      naira_value: parseFloat((((user?.coin_balance || 0) / 10000) * 500).toFixed(2)),
      total_deposited_naira: stats?.total_deposited_naira || 0,
      total_spent_coins: stats?.total_spent_coins || 0,
      transactions,
    });
  } catch (err) {
    console.error('Wallet summary error:', err);
    res.status(500).json({ error: 'Failed to load wallet details.' });
  }
});

const initPurchaseSchema = z.object({
  packageId: z.number().int().positive().optional(),
  customNaira: z.number().int().min(100, 'Minimum top-up is ₦100').max(1000000).optional(),
});

walletRouter.post('/initialize', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!KORAPAY_SECRET_KEY.trim()) {
      res.status(503).json({ error: 'KoraPay is not configured. Please contact support.' });
      return;
    }
    const parsed = initPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { packageId, customNaira } = parsed.data;
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    let nairaAmount = 0;
    let coinsToCredit = 0;
    let packageName = 'Custom Naira Coin Purchase';

    if (packageId) {
      const pkg = await queryOne<any>('SELECT * FROM coin_packages WHERE id = ? AND is_active = 1', [packageId]);
      if (!pkg) {
        res.status(404).json({ error: 'Selected coin package not found.' });
        return;
      }
      nairaAmount = Number(pkg.naira_price);
      coinsToCredit = Number(pkg.coins) + Number(pkg.bonus_coins || 0);
      packageName = pkg.name;
    } else if (customNaira) {
      nairaAmount = Number(customNaira);
      coinsToCredit = Math.floor(nairaAmount * 20);
    } else {
      res.status(400).json({ error: 'Please choose a coin package or enter a custom Naira amount.' });
      return;
    }

    const reference = `JBBOOST_KORA_${Date.now()}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [userId]);
    const currentBalance = Number(user?.coin_balance || 0);

    await run(
      `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
       VALUES (?, 'deposit', ?, ?, ?, ?, 'korapay', 'pending', ?, datetime('now'))`,
      [userId, nairaAmount, coinsToCredit, currentBalance, reference,
       `JB BOOST coin purchase: ${packageName} (${coinsToCredit.toLocaleString()} coins)`]
    );

    const redirectUrl = `${APP_URL || 'http://localhost:3000'}/?payment=korapay&reference=${encodeURIComponent(reference)}`;
    const notificationUrl = `${APP_URL || 'http://localhost:3000'}/api/wallet/korapay/webhook`;
    const payload = {
      reference,
      amount: nairaAmount,
      currency: 'NGN',
      customer: { name: req.user!.name || 'JB BOOST Customer', email: userEmail },
      redirect_url: redirectUrl,
      notification_url: notificationUrl,
      merchant_bears_cost: true,
      channels: ['card', 'bank_transfer', 'pay_with_bank'],
      metadata: { userId, purpose: 'coin_purchase', coinsToCredit },
    };

    const response = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KORAPAY_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as any;

    if (!response.ok || !data.status || !data.data?.checkout_url) {
      await run('UPDATE transactions SET status = ? WHERE reference = ?', ['failed', reference]);
      res.status(502).json({ error: data.message || 'Failed to initialize KoraPay payment.' });
      return;
    }

    res.json({
      message: 'KoraPay payment initialized successfully.',
      reference: data.data.reference || reference,
      nairaAmount,
      coinsToCredit,
      gateway: 'korapay',
      checkoutUrl: data.data.checkout_url,
    });
  } catch (err: any) {
    console.error('KoraPay initialization error:', err);
    res.status(500).json({ error: 'Failed to initialize KoraPay payment.' });
  }
});

async function creditVerifiedTransaction(reference: string, providerAmount: number, providerCurrency: string): Promise<{ credited: boolean; message: string }> {
  const tx = await queryOne<any>('SELECT * FROM transactions WHERE reference = ?', [reference]);
  if (!tx) return { credited: false, message: 'Transaction not found.' };
  if (tx.status === 'completed') return { credited: false, message: 'Transaction already credited.' };
  if (String(providerCurrency).toUpperCase() !== 'NGN') {
    await run('UPDATE transactions SET status = ? WHERE id = ?', ['failed', tx.id]);
    return { credited: false, message: 'Payment currency mismatch.' };
  }
  if (Number(providerAmount) !== Number(tx.amount_naira)) {
    await run('UPDATE transactions SET status = ? WHERE id = ?', ['failed', tx.id]);
    return { credited: false, message: 'Payment amount mismatch.' };
  }
  const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [tx.user_id]);
  const newBalance = Number(user?.coin_balance || 0) + Number(tx.amount_coins);
  await run('UPDATE users SET coin_balance = ?, updated_at = datetime("now") WHERE id = ?', [newBalance, tx.user_id]);
  await run('UPDATE transactions SET status = ?, balance_after = ? WHERE id = ?', ['completed', newBalance, tx.id]);
  return { credited: true, message: `Payment confirmed. ${Number(tx.amount_coins).toLocaleString()} coins credited.` };
}

walletRouter.post('/verify/:reference', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reference = req.params.reference;
    const tx = await queryOne<any>('SELECT * FROM transactions WHERE reference = ? AND user_id = ?', [reference, req.user!.id]);
    if (!tx) { res.status(404).json({ error: 'Payment transaction record not found.' }); return; }
    if (tx.status === 'completed') {
      const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [req.user!.id]);
      res.json({ message: 'Payment has already been processed and credited.', status: 'completed', coin_balance: user?.coin_balance || 0 });
      return;
    }
    const response = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${KORAPAY_SECRET_KEY}` },
    });
    const data = await response.json() as any;
    if (!response.ok || !data.status || !data.data) { res.status(502).json({ error: 'Unable to verify payment with KoraPay.' }); return; }
    const payment = data.data;
    if (payment.status !== 'success') { res.status(400).json({ error: 'KoraPay payment is not yet confirmed.', status: payment.status || 'pending' }); return; }
    const result = await creditVerifiedTransaction(reference, Number(payment.amount_paid ?? payment.amount), payment.currency || 'NGN');
    if (!result.credited && result.message !== 'Transaction already credited.') { res.status(400).json({ error: result.message }); return; }
    const user = await queryOne<{ coin_balance: number }>('SELECT coin_balance FROM users WHERE id = ?', [req.user!.id]);
    res.json({ message: result.message, status: 'completed', newBalance: user?.coin_balance || 0 });
  } catch (err) {
    console.error('KoraPay verification error:', err);
    res.status(500).json({ error: 'Failed to verify KoraPay payment.' });
  }
});

async function processKorapayWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = String(req.headers['x-korapay-signature'] || '');
    if (!signature || !KORAPAY_WEBHOOK_SECRET) { res.status(400).send('Invalid webhook signature'); return; }
    const payload = req.body;
    const signedData = (req as any).rawBody || JSON.stringify(payload?.data ?? {});
    const expected = crypto.createHmac('sha256', KORAPAY_WEBHOOK_SECRET).update(signedData).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(400).send('Invalid webhook signature'); return; }

    const event = String(payload?.event || '').toLowerCase();
    const data = payload?.data;
    if (event === 'charge.success' && (data?.status === 'success' || !data?.status)) {
      const reference = String(data?.reference || '');
      if (!reference) { res.status(400).send('Missing reference'); return; }
      const result = await creditVerifiedTransaction(reference, Number(data?.amount_paid ?? data?.amount), data?.currency || 'NGN');
      console.log(`[KoraPay Webhook] ${result.message} ref=${reference}`);
    }
    res.status(200).send('Webhook processed');
  } catch (err) {
    console.error('KoraPay webhook error:', err);
    res.status(500).send('Webhook error');
  }
}

walletRouter.post('/korapay/webhook', processKorapayWebhook);
// Compatibility alias for the conventional project-wide payment webhook path.
walletRouter.post('/payment/webhook/korapay', processKorapayWebhook);
