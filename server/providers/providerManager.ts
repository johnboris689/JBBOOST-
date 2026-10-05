import crypto from 'crypto';
import { execute, getRow, getAllRows } from '../../db';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../utils/encryption';
import { SmmProvider, ISmmAdapter } from './types';
import { SmmV2Adapter } from './smmV2Adapter';

export class ProviderManager {
  private static adaptersCache = new Map<string, { adapter: ISmmAdapter; cachedAt: number }>();

  /**
   * Log an API action to provider_logs table
   */
  static async logAction(entry: {
    providerId: string;
    providerName?: string;
    orderId?: string;
    action: string;
    requestPayload: any;
    responsePayload: any;
    httpStatus: number;
    durationMs: number;
    error?: string;
  }) {
    try {
      const id = `plog-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date().toISOString();
      const reqStr = typeof entry.requestPayload === 'string' ? entry.requestPayload : JSON.stringify(entry.requestPayload);
      const resStr = typeof entry.responsePayload === 'string' ? entry.responsePayload : JSON.stringify(entry.responsePayload);

      await execute(
        `INSERT INTO provider_logs (id, providerId, providerName, orderId, action, requestPayload, responsePayload, httpStatus, durationMs, error, createdAt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          entry.providerId,
          entry.providerName || '',
          entry.orderId || null,
          entry.action,
          reqStr,
          resStr,
          entry.httpStatus,
          entry.durationMs,
          entry.error || null,
          now
        ]
      );
    } catch (logErr) {
      console.error('[ProviderManager] Failed to write to provider_logs table:', logErr);
    }
  }

  /**
   * Create an adapter instance for a given provider
   */
  static async getAdapter(providerId: string): Promise<ISmmAdapter> {
    const provider = await this.getProviderById(providerId, true);
    if (!provider) {
      throw new Error(`Provider not found with ID: ${providerId}`);
    }

    const plainApiKey = decryptApiKey(provider.apiKey);
    if (!plainApiKey) {
      throw new Error(`API key is missing or could not be decrypted for provider: ${provider.name}`);
    }

    const adapter = new SmmV2Adapter({
      id: provider.id,
      name: provider.name,
      apiUrl: provider.apiUrl,
      apiKey: plainApiKey,
      timeoutMs: 25000,
      onLog: async (log) => {
        await this.logAction({
          providerId: provider.id,
          providerName: provider.name,
          orderId: log.orderId,
          action: log.action,
          requestPayload: log.requestPayload,
          responsePayload: log.responsePayload,
          httpStatus: log.httpStatus,
          durationMs: log.durationMs,
          error: log.error
        });
      }
    });

    return adapter;
  }

  /**
   * Retrieve all providers (masks API keys for admin safety)
   */
  static async getAllProviders(includeKeys = false): Promise<SmmProvider[]> {
    const rows = await getAllRows(`SELECT * FROM providers ORDER BY createdAt DESC`);
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      apiUrl: r.apiurl ?? r.apiUrl,
      apiKey: includeKeys ? decryptApiKey(r.apikey ?? r.apiKey) : maskApiKey(r.apikey ?? r.apiKey),
      status: (r.status || 'active') as 'active' | 'inactive',
      balance: Number(r.balance ?? 0),
      currency: r.currency || 'USD',
      createdAt: r.createdat ?? r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedat ?? r.updatedAt ?? new Date().toISOString()
    }));
  }

  /**
   * Retrieve single provider by ID
   */
  static async getProviderById(id: string, includeRawKey = false): Promise<SmmProvider | null> {
    const row = await getRow(`SELECT * FROM providers WHERE id = $1`, [id]);
    if (!row) return null;

    const storedKey = row.apikey ?? row.apiKey ?? '';
    return {
      id: row.id,
      name: row.name,
      apiUrl: row.apiurl ?? row.apiUrl,
      apiKey: includeRawKey ? storedKey : maskApiKey(storedKey),
      status: (row.status || 'active') as 'active' | 'inactive',
      balance: Number(row.balance ?? 0),
      currency: row.currency || 'USD',
      createdAt: row.createdat ?? row.createdAt ?? new Date().toISOString(),
      updatedAt: row.updatedat ?? row.updatedAt ?? new Date().toISOString()
    };
  }

  /**
   * Add a new provider with encrypted API key
   */
  static async createProvider(data: {
    name: string;
    apiUrl: string;
    apiKey: string;
    status?: 'active' | 'inactive';
  }): Promise<SmmProvider> {
    const id = `prov-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const encryptedKey = encryptApiKey(data.apiKey.trim());

    await execute(
      `INSERT INTO providers (id, name, apiUrl, apiKey, status, balance, currency, createdAt, updatedAt)
       VALUES ($1, $2, $3, $4, $5, 0, 'USD', $6, $7)`,
      [id, data.name.trim(), data.apiUrl.trim(), encryptedKey, data.status || 'active', now, now]
    );

    // Initial balance check attempt (non-blocking)
    try {
      const adapter = await this.getAdapter(id);
      const { balance, currency } = await adapter.getBalance();
      await execute(`UPDATE providers SET balance = $1, currency = $2, updatedAt = $3 WHERE id = $4`, [
        balance,
        currency,
        new Date().toISOString(),
        id
      ]);
    } catch (err) {
      console.warn(`[ProviderManager] Initial balance check failed for ${data.name}:`, err);
    }

    const created = await this.getProviderById(id);
    return created!;
  }

  /**
   * Update existing provider
   */
  static async updateProvider(
    id: string,
    data: {
      name?: string;
      apiUrl?: string;
      apiKey?: string;
      status?: 'active' | 'inactive';
    }
  ): Promise<SmmProvider> {
    const existing = await this.getProviderById(id, true);
    if (!existing) {
      throw new Error('Provider not found');
    }

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const apiUrl = data.apiUrl !== undefined ? data.apiUrl.trim() : existing.apiUrl;
    const status = data.status !== undefined ? data.status : existing.status;

    let apiKey = existing.apiKey;
    if (data.apiKey && data.apiKey.trim() && !data.apiKey.includes('••••')) {
      apiKey = encryptApiKey(data.apiKey.trim());
    }

    await execute(
      `UPDATE providers SET name = $1, apiUrl = $2, apiKey = $3, status = $4, updatedAt = $5 WHERE id = $6`,
      [name, apiUrl, apiKey, status, now, id]
    );

    return (await this.getProviderById(id))!;
  }

  /**
   * Delete provider
   */
  static async deleteProvider(id: string): Promise<boolean> {
    await execute(`DELETE FROM providers WHERE id = $1`, [id]);
    return true;
  }

  /**
   * Test provider connection by fetching balance
   */
  static async testConnection(id: string): Promise<{
    success: boolean;
    balance: number;
    currency: string;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const adapter = await this.getAdapter(id);
      const result = await adapter.getBalance();
      const latencyMs = Date.now() - startTime;

      // Update stored balance
      await execute(`UPDATE providers SET balance = $1, currency = $2, updatedAt = $3 WHERE id = $4`, [
        result.balance,
        result.currency,
        new Date().toISOString(),
        id
      ]);

      return {
        success: true,
        balance: result.balance,
        currency: result.currency,
        latencyMs
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        balance: 0,
        currency: 'USD',
        latencyMs,
        error: err.message || 'Connection failed'
      };
    }
  }

  /**
   * Fetch services list from external provider
   */
  static async getProviderServices(id: string) {
    const adapter = await this.getAdapter(id);
    return await adapter.getServices();
  }

  /**
   * Query recent provider logs
   */
  static async getLogs(options?: { providerId?: string; orderId?: string; limit?: number }) {
    const limit = options?.limit || 100;
    let sql = `SELECT * FROM provider_logs`;
    const params: any[] = [];

    if (options?.providerId) {
      params.push(options.providerId);
      sql += ` WHERE providerId = $${params.length}`;
    } else if (options?.orderId) {
      params.push(options.orderId);
      sql += ` WHERE orderId = $${params.length}`;
    }

    sql += ` ORDER BY createdAt DESC LIMIT ${limit}`;
    const rows = await getAllRows(sql, params);

    return rows.map((r: any) => ({
      id: r.id,
      providerId: r.providerid ?? r.providerId,
      providerName: r.providername ?? r.providerName,
      orderId: r.orderid ?? r.orderId,
      action: r.action,
      requestPayload: r.requestpayload ?? r.requestPayload,
      responsePayload: r.responsepayload ?? r.responsePayload,
      httpStatus: Number(r.httpstatus ?? r.httpStatus ?? 0),
      durationMs: Number(r.durationms ?? r.durationMs ?? 0),
      error: r.error,
      createdAt: r.createdat ?? r.createdAt
    }));
  }
}
