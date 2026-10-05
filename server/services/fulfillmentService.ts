import { execute, getRow } from '../../db';
import { ProviderManager } from '../providers/providerManager';

export interface FulfillmentResult {
  success: boolean;
  providerOrderId?: string;
  fulfillmentStatus: 'automated' | 'manual' | 'failed';
  error?: string;
}

// In-memory mutex to prevent double-submission race conditions across async ticks
const activeOrderLocks = new Set<string>();

export class FulfillmentService {
  /**
   * Forwards a social order to its mapped external provider.
   * Includes idempotency protection, service mapping lookup, and exponential backoff.
   */
  static async processOrder(orderId: string, options?: { maxRetries?: number }): Promise<FulfillmentResult> {
    // 1. Acquire in-memory execution lock for this order
    if (activeOrderLocks.has(orderId)) {
      return {
        success: false,
        fulfillmentStatus: 'manual',
        error: 'Order fulfillment is currently in progress. Locked to prevent duplicate dispatch.'
      };
    }

    activeOrderLocks.add(orderId);

    try {
      // 2. Fetch the fresh order record from database
      const order = await getRow(`SELECT * FROM social_orders WHERE id = $1`, [orderId]);
      if (!order) {
        return { success: false, fulfillmentStatus: 'failed', error: `Order ${orderId} not found.` };
      }

      // 3. Idempotency Check: Don't re-dispatch if already successfully assigned a provider order ID
      const existingProviderOrderId = order.providerorderid ?? order.providerOrderId;
      const currentFulfillment = order.fulfillmentstatus ?? order.fulfillmentStatus;
      if (existingProviderOrderId && currentFulfillment === 'automated') {
        return {
          success: true,
          providerOrderId: existingProviderOrderId,
          fulfillmentStatus: 'automated'
        };
      }

      // 4. Fetch the associated social service
      const serviceId = order.serviceid ?? order.serviceId;
      const service = await getRow(`SELECT * FROM social_services WHERE id = $1`, [serviceId]);
      if (!service) {
        const errorMsg = `Associated service ${serviceId} could not be found.`;
        await execute(
          `UPDATE social_orders SET fulfillmentStatus = 'failed', fulfillmentError = $1, updatedAt = $2 WHERE id = $3`,
          [errorMsg, new Date().toISOString(), orderId]
        );
        return { success: false, fulfillmentStatus: 'failed', error: errorMsg };
      }

      // 5. Check if service is mapped to a provider
      const providerId = service.providerid ?? service.providerId;
      const providerServiceId = service.providerserviceid ?? service.providerServiceId;
      const autoFulfill = Number(service.autofulfill ?? service.autoFulfill ?? 1);

      if (!providerId || !providerServiceId || autoFulfill === 0) {
        // Not mapped or manual only -> set to manual fulfillment
        await execute(
          `UPDATE social_orders SET fulfillmentStatus = 'manual', fulfillmentError = 'Service has no provider mapping configured.', updatedAt = $1 WHERE id = $2`,
          [new Date().toISOString(), orderId]
        );
        return {
          success: false,
          fulfillmentStatus: 'manual',
          error: 'Service is not mapped to an external provider. Set to manual fulfillment.'
        };
      }

      // 6. Check provider status
      const provider = await ProviderManager.getProviderById(providerId, true);
      if (!provider) {
        const errorMsg = `Configured provider ${providerId} does not exist.`;
        await execute(
          `UPDATE social_orders SET fulfillmentStatus = 'failed', fulfillmentError = $1, updatedAt = $2 WHERE id = $3`,
          [errorMsg, new Date().toISOString(), orderId]
        );
        return { success: false, fulfillmentStatus: 'failed', error: errorMsg };
      }

      if (provider.status !== 'active') {
        const errorMsg = `Provider '${provider.name}' is currently inactive.`;
        await execute(
          `UPDATE social_orders SET fulfillmentStatus = 'failed', fulfillmentError = $1, updatedAt = $2 WHERE id = $3`,
          [errorMsg, new Date().toISOString(), orderId]
        );
        return { success: false, fulfillmentStatus: 'failed', error: errorMsg };
      }

      // 7. Mark order as 'processing' dispatch lock in DB
      const dispatchStartTime = new Date().toISOString();
      await execute(
        `UPDATE social_orders SET fulfillmentStatus = 'processing', providerId = $1, updatedAt = $2 WHERE id = $3`,
        [provider.id, dispatchStartTime, orderId]
      );

      // 8. Attempt order submission to provider with retry backoff
      const adapter = await ProviderManager.getAdapter(provider.id);
      const targetUrl = order.targeturl ?? order.targetUrl;
      const quantity = Number(order.quantity || 0);

      const maxRetries = options?.maxRetries ?? 3;
      let attempt = 0;
      let lastError: any = null;
      let addResult: any = null;

      while (attempt < maxRetries) {
        attempt++;
        try {
          addResult = await adapter.createOrder({
            service: providerServiceId,
            link: targetUrl,
            quantity
          });

          if (addResult?.orderId) {
            break; // Success!
          }
        } catch (dispatchErr: any) {
          lastError = dispatchErr;
          console.warn(`[FulfillmentService] Order ${orderId} dispatch attempt ${attempt}/${maxRetries} failed:`, dispatchErr.message);

          if (attempt < maxRetries) {
            // Exponential backoff delay: 1.5s, 3s, etc.
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 6000);
            await new Promise((res) => setTimeout(res, backoffMs));
          }
        }
      }

      const nowIso = new Date().toISOString();

      // 9. Handle dispatch outcome
      if (addResult?.orderId) {
        const providerOrderId = String(addResult.orderId);

        await execute(
          `UPDATE social_orders SET
            providerId = $1,
            providerOrderId = $2,
            fulfillmentStatus = 'automated',
            fulfillmentError = NULL,
            status = 'in_progress',
            lastProgressAt = $3,
            updatedAt = $3
           WHERE id = $4`,
          [provider.id, providerOrderId, nowIso, orderId]
        );

        return {
          success: true,
          providerOrderId,
          fulfillmentStatus: 'automated'
        };
      } else {
        const failureReason = lastError?.message || 'Failed to submit order to external provider.';

        await execute(
          `UPDATE social_orders SET
            fulfillmentStatus = 'failed',
            fulfillmentError = $1,
            retryCount = retryCount + $2,
            updatedAt = $3
           WHERE id = $4`,
          [failureReason, attempt, nowIso, orderId]
        );

        return {
          success: false,
          fulfillmentStatus: 'failed',
          error: failureReason
        };
      }
    } catch (unhandledErr: any) {
      console.error(`[FulfillmentService] Unhandled error during order ${orderId} processing:`, unhandledErr);
      return {
        success: false,
        fulfillmentStatus: 'failed',
        error: unhandledErr.message || 'Internal order fulfillment error.'
      };
    } finally {
      activeOrderLocks.delete(orderId);
    }
  }
}
