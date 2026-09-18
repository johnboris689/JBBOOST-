import cron from 'node-cron';
import crypto from 'crypto';
import { execute, getRow, getAllRows } from '../../db';
import { ProviderManager } from '../providers/providerManager';

export interface SyncStats {
  checked: number;
  updated: number;
  completed: number;
  canceled: number;
  partial: number;
  refunded: number;
  flagged: number;
  errors: string[];
}

export class OrderSyncService {
  private static isRunning = false;
  private static cronScheduled = false;

  /**
   * Start the background cron job (runs every 2 minutes)
   */
  static startCronJob(cronExpression = '*/2 * * * *') {
    if (this.cronScheduled) return;
    this.cronScheduled = true;

    console.log(`[OrderSyncService] Initializing automated order status sync cron (${cronExpression})...`);
    cron.schedule(cronExpression, async () => {
      try {
        const stats = await this.syncAllActiveOrders();
        if (stats.checked > 0) {
          console.log(`[OrderSyncService] Sync finished: ${stats.checked} checked, ${stats.updated} updated (${stats.completed} completed, ${stats.canceled} canceled, ${stats.partial} partial, ${stats.refunded} refunded).`);
        }
      } catch (err: any) {
        console.error('[OrderSyncService] Error during automated sync job:', err.message);
      }
    });
  }

  /**
   * Main synchronization routine: iterates active orders with providerOrderId
   */
  static async syncAllActiveOrders(): Promise<SyncStats> {
    if (this.isRunning) {
      return { checked: 0, updated: 0, completed: 0, canceled: 0, partial: 0, refunded: 0, flagged: 0, errors: ['Sync already in progress'] };
    }

    this.isRunning = true;
    const stats: SyncStats = {
      checked: 0,
      updated: 0,
      completed: 0,
      canceled: 0,
      partial: 0,
      refunded: 0,
      flagged: 0,
      errors: []
    };

    try {
      // Find orders that have been sent to an external provider and are not finalized
      const activeOrders = await getAllRows(
        `SELECT * FROM social_orders
         WHERE (providerOrderId IS NOT NULL AND providerOrderId <> '')
           AND LOWER(status) IN ('pending', 'processing', 'in_progress')
         ORDER BY createdAt ASC`
      );

      stats.checked = activeOrders.length;
      if (activeOrders.length === 0) {
        return stats;
      }

      // Group orders by providerId
      const ordersByProvider: Record<string, any[]> = {};
      for (const order of activeOrders) {
        const pId = order.providerid ?? order.providerId;
        if (!pId) continue;
        if (!ordersByProvider[pId]) {
          ordersByProvider[pId] = [];
        }
        ordersByProvider[pId].push(order);
      }

      // Process orders for each provider
      for (const [providerId, orders] of Object.entries(ordersByProvider)) {
        try {
          const adapter = await ProviderManager.getAdapter(providerId);
          const providerOrderIds = orders.map((o) => String(o.providerorderid ?? o.providerOrderId));

          // Fetch statuses (batch query or parallel fallback)
          const statuses = await adapter.getOrderStatuses(providerOrderIds);

          for (const order of orders) {
            const extOrderId = String(order.providerorderid ?? order.providerOrderId);
            const statusInfo = statuses[extOrderId];

            if (statusInfo && !statusInfo.error) {
              const updated = await this.applyOrderStatusUpdate(order, statusInfo);
              if (updated) {
                stats.updated++;
                if (updated.status === 'completed') stats.completed++;
                if (updated.status === 'cancelled') stats.canceled++;
                if (updated.status === 'partial') stats.partial++;
                if (updated.refunded) stats.refunded++;
              }
            } else if (statusInfo?.error) {
              stats.errors.push(`Order ${order.id} (${extOrderId}): ${statusInfo.error}`);
            }

            // Check for 48-hour staleness
            const createdTime = new Date(order.createdat ?? order.createdAt).getTime();
            const ageHours = (Date.now() - createdTime) / (1000 * 60 * 60);
            const isFlagged = Number(order.flaggedforreview ?? order.flaggedForReview ?? 0);

            if (ageHours >= 48 && isFlagged === 0 && !['completed', 'cancelled'].includes(String(order.status).toLowerCase())) {
              await execute(
                `UPDATE social_orders SET flaggedForReview = 1, updatedAt = $1 WHERE id = $2`,
                [new Date().toISOString(), order.id]
              );
              stats.flagged++;
            }
          }
        } catch (provErr: any) {
          console.error(`[OrderSyncService] Failed to query provider ${providerId}:`, provErr.message);
          stats.errors.push(`Provider ${providerId}: ${provErr.message}`);
        }
      }

      return stats;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single specific order immediately (e.g., triggered by admin "Check Status Now" button)
   */
  static async syncSingleOrder(orderId: string): Promise<{ success: boolean; status?: string; details?: any; error?: string }> {
    const order = await getRow(`SELECT * FROM social_orders WHERE id = $1`, [orderId]);
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    const providerId = order.providerid ?? order.providerId;
    const providerOrderId = order.providerorderid ?? order.providerOrderId;

    if (!providerId || !providerOrderId) {
      return { success: false, error: 'Order has not been forwarded to an external provider yet.' };
    }

    try {
      const adapter = await ProviderManager.getAdapter(providerId);
      const statusInfo = await adapter.getOrderStatus(providerOrderId);

      if (statusInfo.error) {
        return { success: false, error: statusInfo.error };
      }

      const updateResult = await this.applyOrderStatusUpdate(order, statusInfo);
      return {
        success: true,
        status: updateResult ? updateResult.status : order.status,
        details: statusInfo
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to sync order with provider.' };
    }
  }

  /**
   * Applies provider status update to the database and processes automatic refunds
   */
  private static async applyOrderStatusUpdate(order: any, statusInfo: any): Promise<{ status: string; refunded: boolean } | null> {
    const rawStatus = String(statusInfo.status || '').trim();
    if (!rawStatus) return null;

    const normalizedStatus = this.mapProviderStatus(rawStatus);
    const quantity = Number(order.quantity || 0);
    const amount = Number(order.amount || 0);
    const userEmail = String(order.useremail ?? order.userEmail).toLowerCase();
    const nowIso = new Date().toISOString();

    const currentDelivered = Number(order.deliveredquantity ?? order.deliveredQuantity ?? 0);
    const currentRefunded = Number(order.refundedamount ?? order.refundedAmount ?? 0);

    const remains = statusInfo.remains !== undefined && statusInfo.remains !== null
      ? Math.max(0, Number(statusInfo.remains))
      : Math.max(0, quantity - currentDelivered);

    const startCount = statusInfo.start_count !== undefined
      ? Number(statusInfo.start_count)
      : Number(order.startcount ?? order.startCount ?? 0);

    let delivered = Math.max(0, quantity - remains);
    if (normalizedStatus === 'completed') {
      delivered = quantity;
    }

    let refunded = false;

    // -------------------------------------------------------------
    // EDGE CASE: FULL REFUND ON CANCELED
    // -------------------------------------------------------------
    if (normalizedStatus === 'cancelled' && currentRefunded === 0 && amount > 0) {
      await this.processUserRefund(userEmail, amount, order.id, 'Full refund for canceled order');
      refunded = true;

      await execute(
        `UPDATE social_orders SET
          status = 'cancelled',
          remains = $1,
          remainingQuantity = $1,
          deliveredQuantity = 0,
          startCount = $2,
          refundedAmount = $3,
          lastProgressAt = $4,
          lastSyncedAt = $4,
          updatedAt = $4
         WHERE id = $5`,
        [quantity, startCount, amount, nowIso, order.id]
      );

      return { status: 'cancelled', refunded: true };
    }

    // -------------------------------------------------------------
    // EDGE CASE: PROPORTIONAL REFUND ON PARTIAL
    // -------------------------------------------------------------
    if (normalizedStatus === 'partial' && currentRefunded === 0 && amount > 0) {
      const unfulfilledUnits = Math.min(quantity, Math.max(1, remains));
      const partialRefund = Math.round((unfulfilledUnits / quantity) * amount * 100) / 100;

      if (partialRefund > 0) {
        await this.processUserRefund(
          userEmail,
          partialRefund,
          order.id,
          `Partial refund (${unfulfilledUnits}/${quantity} units not delivered)`
        );
        refunded = true;
      }

      await execute(
        `UPDATE social_orders SET
          status = 'partial',
          remains = $1,
          remainingQuantity = $1,
          deliveredQuantity = $2,
          startCount = $3,
          refundedAmount = $4,
          lastProgressAt = $5,
          lastSyncedAt = $5,
          updatedAt = $5
         WHERE id = $6`,
        [remains, delivered, startCount, partialRefund, nowIso, order.id]
      );

      return { status: 'partial', refunded: true };
    }

    // -------------------------------------------------------------
    // STANDARD UPDATES: In Progress / Completed
    // -------------------------------------------------------------
    const completedAt = normalizedStatus === 'completed' ? nowIso : null;

    await execute(
      `UPDATE social_orders SET
        status = $1,
        remains = $2,
        remainingQuantity = $2,
        deliveredQuantity = $3,
        startCount = $4,
        lastProgressAt = $5,
        lastSyncedAt = $5,
        completedAt = COALESCE(completedAt, $6),
        updatedAt = $5
       WHERE id = $7`,
      [normalizedStatus, remains, delivered, startCount, nowIso, completedAt, order.id]
    );

    return { status: normalizedStatus, refunded };
  }

  /**
   * Process refund into user's wallet and log transaction
   */
  private static async processUserRefund(userEmail: string, refundAmount: number, orderId: string, reason: string) {
    if (refundAmount <= 0) return;

    try {
      // 1. Credit user balance
      await execute(
        `UPDATE users SET balance = balance + $1 WHERE LOWER(email) = LOWER($2)`,
        [refundAmount, userEmail]
      );

      // 2. Create normalized refund transaction record
      const nowIso = new Date().toISOString();
      const txId = `tx-ref-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      try {
        await execute(
          `INSERT INTO transactions (id, userId, amount, type, status, reference, timestamp)
           VALUES ($1, $2, $3, 'refund', 'success', $4, $5)
           ON CONFLICT(id) DO NOTHING`,
          [txId, userEmail, refundAmount, orderId, nowIso]
        );
      } catch (tErr) {
        console.warn('[OrderSyncService] Normalized transaction insert skipped:', tErr);
      }

      console.log(`[OrderSyncService] Refunded ₦${refundAmount} to ${userEmail} for order ${orderId} (${reason}).`);
    } catch (refundErr) {
      console.error(`[OrderSyncService] Failed to process refund for ${userEmail}:`, refundErr);
    }
  }

  /**
   * Map provider status strings to local normalized statuses
   */
  private static mapProviderStatus(raw: string): string {
    const s = raw.toLowerCase().trim();
    if (s.includes('complete')) return 'completed';
    if (s.includes('cancel')) return 'cancelled';
    if (s.includes('partial')) return 'partial';
    if (s.includes('progress') || s.includes('process')) return 'in_progress';
    if (s.includes('pend')) return 'pending';
    if (s.includes('fail')) return 'failed';
    return s || 'in_progress';
  }
}
