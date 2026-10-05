import { ISmmAdapter, ProviderServiceItem, ProviderOrderStatus, AddOrderParams, AddOrderResult } from './types';

export interface SmmV2AdapterOptions {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
  onLog?: (entry: {
    action: string;
    orderId?: string;
    requestPayload: any;
    responsePayload: any;
    httpStatus: number;
    durationMs: number;
    error?: string;
  }) => void | Promise<void>;
}

export class SmmV2Adapter implements ISmmAdapter {
  readonly id: string;
  readonly name: string;
  readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly onLog?: SmmV2AdapterOptions['onLog'];

  constructor(options: SmmV2AdapterOptions) {
    this.id = options.id;
    this.name = options.name;
    // Normalize URL: remove trailing slash
    this.apiUrl = options.apiUrl.trim().replace(/\/+$/, '');
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs || 20000;
    this.onLog = options.onLog;
  }

  /**
   * Helper to execute an API POST request using form urlencoded standard format
   */
  private async postAction<T = any>(action: string, params: Record<string, any> = {}, orderId?: string): Promise<T> {
    const startTime = Date.now();
    let httpStatus = 0;
    let responseData: any = null;
    let errorMessage: string | undefined;

    const payload: Record<string, string> = {
      key: this.apiKey,
      action,
      ...Object.entries(params).reduce((acc, [k, v]) => {
        if (v !== undefined && v !== null) {
          acc[k] = String(v);
        }
        return acc;
      }, {} as Record<string, string>)
    };

    // Prepare masked payload for logging
    const maskedPayload = { ...payload, key: '••••••••' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const bodyParams = new URLSearchParams(payload);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'JB-Boost-SMM-Engine/1.0',
          'Accept': 'application/json'
        },
        body: bodyParams.toString(),
        signal: controller.signal
      });

      httpStatus = response.status;
      const text = await response.text();

      try {
        responseData = JSON.parse(text);
      } catch (jsonErr) {
        // If response is HTML, truncate for logging
        const cleanText = text.replace(/<[^>]*>?/gm, ' ').trim().slice(0, 300);
        errorMessage = `Non-JSON response from provider (HTTP ${httpStatus}): ${cleanText || 'Invalid response'}`;
        throw new Error(errorMessage);
      }

      // Check if provider returned an explicit error object, e.g. { "error": "Incorrect request" }
      if (responseData && typeof responseData === 'object' && responseData.error) {
        errorMessage = String(responseData.error);
        throw new Error(`Provider error: ${errorMessage}`);
      }

      return responseData as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        errorMessage = `Request timed out after ${this.timeoutMs}ms`;
        err.message = errorMessage;
      } else if (!errorMessage) {
        errorMessage = err.message || 'Unknown network error';
      }
      throw err;
    } finally {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (this.onLog) {
        try {
          await this.onLog({
            action,
            orderId,
            requestPayload: maskedPayload,
            responsePayload: responseData || { rawError: errorMessage },
            httpStatus,
            durationMs,
            error: errorMessage
          });
        } catch (logErr) {
          console.error('[SmmV2Adapter] Failed to record provider log:', logErr);
        }
      }
    }
  }

  /**
   * Action: balance
   * Returns current provider balance & currency
   */
  async getBalance(): Promise<{ balance: number; currency: string }> {
    const data = await this.postAction('balance');
    const balance = Number(data?.balance ?? 0);
    const currency = String(data?.currency || 'USD').toUpperCase();
    return { balance, currency };
  }

  /**
   * Action: services
   * Returns list of services provided by the external SMM panel
   */
  async getServices(): Promise<ProviderServiceItem[]> {
    const data = await this.postAction('services');
    if (!Array.isArray(data)) {
      if (data && typeof data === 'object') {
        // Some rare providers return an object keyed by service ID
        return Object.values(data);
      }
      return [];
    }
    return data.map((item: any) => ({
      service: item.service ?? item.id,
      name: item.name || `Service #${item.service}`,
      type: item.type || 'Default',
      category: item.category || 'General',
      rate: Number(item.rate ?? 0),
      min: Number(item.min ?? 1),
      max: Number(item.max ?? 10000),
      refill: Boolean(item.refill),
      cancel: Boolean(item.cancel),
      dripfeed: Boolean(item.dripfeed)
    }));
  }

  /**
   * Action: add
   * Forwards a new order to the provider.
   * Returns { orderId }
   */
  async createOrder(params: AddOrderParams): Promise<AddOrderResult> {
    const data = await this.postAction('add', {
      service: params.service,
      link: params.link,
      quantity: params.quantity,
      ...(params.comments ? { comments: params.comments } : {}),
      ...(params.runs ? { runs: params.runs } : {}),
      ...(params.interval ? { interval: params.interval } : {})
    });

    const orderId = String(data?.order || data?.order_id || '');
    if (!orderId) {
      throw new Error(`Provider did not return an order ID. Response: ${JSON.stringify(data)}`);
    }

    return { orderId, rawResponse: data };
  }

  /**
   * Action: status (single order)
   */
  async getOrderStatus(orderId: string): Promise<ProviderOrderStatus> {
    const data = await this.postAction('status', { order: orderId }, orderId);
    return {
      status: data?.status || 'Pending',
      charge: data?.charge,
      start_count: data?.start_count ?? 0,
      remains: data?.remains ?? 0,
      currency: data?.currency,
      error: data?.error
    };
  }

  /**
   * Action: status (multiple orders batch query)
   * Provider API v2 specifies comma-separated orders: action=status&orders=1,2,3 or order=1,2,3
   */
  async getOrderStatuses(orderIds: string[]): Promise<Record<string, ProviderOrderStatus>> {
    if (!orderIds || orderIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    const results: Record<string, ProviderOrderStatus> = {};

    // Standard v2 supports comma-separated list
    const commaSeparated = uniqueIds.join(',');

    try {
      // Try both orders and order param (standard v2 usually uses "orders" or "order")
      const data = await this.postAction('status', { orders: commaSeparated, order: commaSeparated });

      if (data && typeof data === 'object') {
        // If batch response returned an object keyed by ID:
        // { "123": { "status": "Completed", "remains": "0", "start_count": "100" }, ... }
        let hasMatchedAny = false;
        for (const id of uniqueIds) {
          if (data[id]) {
            hasMatchedAny = true;
            const item = data[id];
            results[id] = {
              status: item.status || 'Pending',
              charge: item.charge,
              start_count: item.start_count ?? 0,
              remains: item.remains ?? 0,
              currency: item.currency,
              error: item.error
            };
          }
        }

        // If batch was answered as a single order status (some providers don't support batch, only returned the first)
        if (!hasMatchedAny && uniqueIds.length === 1 && data.status) {
          results[uniqueIds[0]] = {
            status: data.status,
            charge: data.charge,
            start_count: data.start_count ?? 0,
            remains: data.remains ?? 0,
            currency: data.currency
          };
          return results;
        }

        if (hasMatchedAny) {
          return results;
        }
      }
    } catch (batchErr) {
      console.warn(`[SmmV2Adapter] Batch status check failed for provider ${this.name}, falling back to individual queries:`, batchErr);
    }

    // Fallback: Query individually in parallel (concurrency limit 5)
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += 5) {
      chunks.push(uniqueIds.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (id) => {
          try {
            results[id] = await this.getOrderStatus(id);
          } catch (singleErr: any) {
            results[id] = {
              status: 'Unknown',
              error: singleErr.message || 'Failed to query status'
            };
          }
        })
      );
    }

    return results;
  }
}
