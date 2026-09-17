import crypto from 'crypto';
import { execute, getAllRows, getRow, withTransaction } from '../db';

const PROVIDER = 'smm_pwr';
const DEFAULT_URL = 'https://smmpwr.com/api/v2';
const SUPPORTED = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'X', 'Telegram'];
const STATUS_INTERVAL_MS = 60_000;
const CATALOG_INTERVAL_MS = 4 * 60_000;
const LOW_BALANCE_THRESHOLD = Number(process.env.SMM_LOW_BALANCE_THRESHOLD || 5);

function apiUrl() { return String(process.env.SMM_PROVIDER_API_URL || DEFAULT_URL).trim() || DEFAULT_URL; }
function apiKey() { return String(process.env.SMM_PROVIDER_API_KEY || '').trim(); }
function usdNgnRate() {
  const n = Number(process.env.SMM_USD_NGN_RATE || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function supportedPlatform(raw: string) {
  const x = String(raw || '').toLowerCase();
  if (x.includes('instagram')) return 'Instagram';
  if (x.includes('tiktok') || x.includes('tik tok')) return 'TikTok';
  if (x.includes('youtube') || x.includes('yt ')) return 'YouTube';
  if (x.includes('facebook') || x.includes('fb ')) return 'Facebook';
  if (x.includes('twitter') || x.includes('x/twitter') || /^x\b/.test(x)) return 'X';
  if (x.includes('telegram')) return 'Telegram';
  return '';
}
function compatibleService(s: any) {
  const platform = supportedPlatform(`${s.category || ''} ${s.name || ''}`);
  if (!SUPPORTED.includes(platform)) return null;
  const type = String(s.type || '').toLowerCase();
  const name = String(s.name || '').toLowerCase();
  // The JB Boster generic order form accepts a target link/handle and quantity.
  // Exclude custom-comment/subscription lines that require different provider parameters.
  if (type && !['default', ''].includes(type) && !/followers?|subscribers?|members?|likes?|comments?|shares?|views?|reposts?|reactions?|watch time|story views?|page likes?|group members?|channel members?/i.test(name)) return null;
  if (!Number.isFinite(Number(s.min)) || !Number.isFinite(Number(s.max)) || Number(s.max) <= 0) return null;
  return platform;
}
function targetType(name: string, platform: string) {
  return /follower|subscriber|member|members|page likes/i.test(`${platform} ${name}`) ? 'profile' : 'post';
}
function targetLabel(name: string, platform: string) {
  const t = targetType(name, platform);
  if (t === 'profile') {
    if (platform === 'YouTube') return 'Target channel URL / @handle';
    if (platform === 'Telegram') return 'Target channel/group username or supported invite/link';
    return 'Target profile URL / @username';
  }
  if (platform === 'YouTube') return 'Target video URL';
  if (platform === 'TikTok') return 'Target video/post URL';
  if (platform === 'Instagram') return 'Target post/reel URL';
  if (platform === 'Facebook') return 'Target post URL';
  if (platform === 'X') return 'Target post URL';
  if (platform === 'Telegram') return 'Target post/message URL';
  return 'Target post URL';
}
function serviceType(name: string, platform: string) {
  const n = `${platform} ${name}`.toLowerCase();
  if (/subscriber/.test(n)) return 'Subscribers';
  if (/follower/.test(n)) return 'Followers';
  if (/channel member|telegram member|group member|\bmember/.test(n)) return 'Members';
  if (/comment/.test(n)) return 'Comments';
  if (/share|repost/.test(n)) return /repost/.test(n) ? 'Reposts' : 'Shares';
  if (/reaction/.test(n)) return 'Reactions';
  if (/story view/.test(n)) return 'Story views';
  if (/page like/.test(n)) return 'Page likes';
  if (/watch time/.test(n)) return 'Watch time';
  if (/view/.test(n)) return 'Views';
  if (/like/.test(n)) return 'Likes';
  return 'Engagement';
}
function timeoutSignal(ms: number) { return AbortSignal.timeout(ms); }

async function providerRequest(params: Record<string, string | number>, timeoutMs = 15_000) {
  if (!apiKey()) throw new Error('SMM provider API key is not configured on the server.');
  const body = new URLSearchParams();
  body.set('key', apiKey());
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const response = await fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: timeoutSignal(timeoutMs) });
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`Provider returned non-JSON response (${response.status}).`); }
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${String(data?.error || 'request failed')}`);
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) throw new Error(String(data.error));
  return data;
}
function parseBool(v: any) { return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1'; }
function providerStatusMap(raw: string) {
  const s = String(raw || '').toLowerCase();
  if (s === 'completed') return 'COMPLETED';
  if (s === 'partial') return 'PARTIAL';
  if (s === 'canceled' || s === 'cancelled') return 'CANCELLED';
  if (s === 'in progress' || s === 'processing') return 'PROCESSING';
  if (s === 'pending') return 'PENDING';
  return 'FAILED';
}

function estimateMinutes(s: any) {
  const candidates = [s.average_completion_time, s.averageCompletionTime, s.average_time, s.averageTime, s.completion_time, s.completionTime, s.delivery_time, s.deliveryTime];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'number' && raw > 0 && raw < 60 * 24 * 60) return Math.round(raw);
    const text = String(raw).toLowerCase();
    const h = text.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = text.match(/(\d+(?:\.\d+)?)\s*m/);
    const min = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
    if (min > 0) return Math.round(min);
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  }
  return null;
}

function servicePriceCoins(providerRateUsd: number, markupPercent: number, exchangeRate: number) {
  if (!(providerRateUsd > 0) || !(exchangeRate > 0)) return 0;
  const customerNairaPer1000 = providerRateUsd * exchangeRate * (1 + Math.max(0, markupPercent) / 100);
  return Math.max(1, Math.ceil(customerNairaPer1000 * 2));
}

export function validateTarget(target: string, type: string) {
  const v = String(target || '').trim();
  if (!v || v.length > 500) return false;
  if (type === 'profile') return /^https?:\/\//i.test(v) || /^@[A-Za-z0-9_.-]{2,}$/.test(v);
  return /^https?:\/\//i.test(v);
}

export async function syncProviderCatalogue() {
  const started = Date.now();
  try {
    const services = await providerRequest({ action: 'services' }, 20_000);
    if (!Array.isArray(services)) throw new Error('Provider services response was not an array.');
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const exchangeRate = usdNgnRate();
    for (const s of services) {
      const platform = compatibleService(s);
      if (!platform) continue;
      const providerId = String(s.service || '').trim();
      if (!providerId) continue;
      seen.add(providerId);
      const rowId = `${PROVIDER}-${providerId}`;
      const name = String(s.name || `${platform} service ${providerId}`).trim();
      const category = String(s.category || '').trim();
      const description = String(s.description || s.desc || '').trim();
      const estimatedMinutes = estimateMinutes(s);
      const rate = Number(s.rate || 0);
      const min = Math.floor(Number(s.min || 0));
      const max = Math.floor(Number(s.max || 0));
      await execute(`INSERT INTO provider_services (id,provider,providerServiceId,platform,serviceName,serviceType,category,ratePer1000,minQuantity,maxQuantity,refillAvailable,cancelAvailable,dripfeedAvailable,description,providerStatus,isAvailable,rawData,lastSyncedAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'available',1,$15,$16)
        ON CONFLICT(provider,providerServiceId) DO UPDATE SET platform=EXCLUDED.platform,serviceName=EXCLUDED.serviceName,serviceType=EXCLUDED.serviceType,category=EXCLUDED.category,ratePer1000=EXCLUDED.ratePer1000,minQuantity=EXCLUDED.minQuantity,maxQuantity=EXCLUDED.maxQuantity,refillAvailable=EXCLUDED.refillAvailable,cancelAvailable=EXCLUDED.cancelAvailable,dripfeedAvailable=EXCLUDED.dripfeedAvailable,description=EXCLUDED.description,providerStatus='available',isAvailable=1,rawData=EXCLUDED.rawData,lastSyncedAt=EXCLUDED.lastSyncedAt`,
        [rowId,PROVIDER,providerId,platform,name,serviceType(name,platform),category,rate,min,max,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,description,JSON.stringify(s),now]);

      const existing = await getRow(`SELECT * FROM social_services WHERE provider=$1 AND providerServiceId=$2`, [PROVIDER, providerId]);
      if (!existing) {
        const id = `svc-${PROVIDER}-${providerId}`;
        const defaultMarkup = Number(process.env.SMM_DEFAULT_MARKUP_PERCENT || 100);
        const coins = servicePriceCoins(rate, defaultMarkup, exchangeRate);
        await execute(`INSERT INTO social_services (id,platform,name,description,ratePer1000,minQuantity,maxQuantity,enabled,createdAt,estimatedMinutes,providerServiceId,provider,customerCoinsPer1000,refillAvailable,cancelAvailable,dripfeedAvailable,providerDescription,providerLastSyncedAt,providerAvailable)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)`,
          [id,platform,name,description,rate,min,max,coins>0?1:0,now,estimatedMinutes,providerId,PROVIDER,coins,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,description,now]);
        await execute(`INSERT INTO provider_service_mappings (id,provider,providerServiceId,socialServiceId,customerCoinsPer1000,markupPercent,enabled,createdAt,updatedAt) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7) ON CONFLICT(provider,socialServiceId) DO UPDATE SET providerServiceId=EXCLUDED.providerServiceId,updatedAt=EXCLUDED.updatedAt`,
          [`map-${PROVIDER}-${providerId}`,PROVIDER,providerId,id,coins,defaultMarkup,now]);
      } else {
        await execute(`UPDATE social_services SET platform=$1,name=$2,description=$3,ratePer1000=$4,minQuantity=$5,maxQuantity=$6,providerDescription=$7,providerLastSyncedAt=$8,providerAvailable=1,refillAvailable=$9,cancelAvailable=$10,dripfeedAvailable=$11,estimatedMinutes=$12 WHERE id=$13`,
          [platform,name,description,rate,min,max,description,now,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,estimatedMinutes,existing.id]);
      }
    }
    // Existing provider services that disappeared are retained but made unavailable.
    const existingProvider = await getAllRows(`SELECT providerServiceId FROM provider_services WHERE provider=$1`, [PROVIDER]);
    for (const r of existingProvider) {
      const id = String(r.providerserviceid || r.providerServiceId || '');
      if (id && !seen.has(id)) {
        await execute(`UPDATE provider_services SET isAvailable=0,providerStatus='unavailable',lastSyncedAt=$1 WHERE provider=$2 AND providerServiceId=$3`, [now,PROVIDER,id]);
        await execute(`UPDATE social_services SET providerAvailable=0,enabled=0 WHERE provider=$1 AND providerServiceId=$2`, [PROVIDER,id]);
      }
    }
    await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'services','success',$3,$4,$5)`, [`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,PROVIDER,`Synchronized ${seen.size} compatible services.`,Date.now()-started,now]);
    return { count: seen.size, exchangeRate };
  } catch (e: any) {
    await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'services','failed',$3,$4,$5)`, [`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,PROVIDER,String(e?.message || e),Date.now()-started,new Date().toISOString()]).catch(()=>{});
    throw e;
  }
}

export async function getProviderBalance() {
  const data = await providerRequest({ action: 'balance' });
  return { balance: Number(data?.balance || 0), currency: String(data?.currency || 'USD') };
}

export async function submitProviderOrder(serviceId: string, target: string, quantity: number) {
  const data = await providerRequest({ action: 'add', service: serviceId, link: target, quantity });
  const id = String(data?.order || '').trim();
  if (!id) throw new Error('Provider did not return an order ID.');
  return id;
}

export async function getProviderStatuses(ids: string[]) {
  if (!ids.length) return {};
  const data = await providerRequest({ action: 'status', orders: ids.slice(0,100).join(',') });
  return data || {};
}

export async function requestProviderRefill(providerOrderId: string) { return providerRequest({ action: 'refill', order: providerOrderId }); }
export async function getProviderRefillStatus(refillId: string) { return providerRequest({ action: 'refill_status', refill: refillId }); }
export async function cancelProviderOrders(ids: string[]) { return providerRequest({ action: 'cancel', orders: ids.slice(0,100).join(',') }); }

async function refundOrderOnce(internalOrderId: string, reason: string) {
  return withTransaction(async q => {
    const orderRes = await q(`SELECT * FROM social_orders WHERE id=$1 FOR UPDATE`, [internalOrderId]);
    const order = orderRes.rows?.[0];
    if (!order || Number(order.refundapplied ?? order.refundApplied ?? 0) === 1) return false;
    const coins = Number(order.customercoins ?? order.customerCoins ?? 0);
    const naira = coins / 2;
    const userRes = await q(`SELECT balance FROM users WHERE LOWER(email)=LOWER($1) FOR UPDATE`, [order.useremail ?? order.userEmail]);
    const user = userRes.rows?.[0];
    if (!user) throw new Error('Customer account not found while applying refund.');
    const newBalance = Number(user.balance || 0) + naira;
    await q(`UPDATE users SET balance=$1 WHERE LOWER(email)=LOWER($2)`, [newBalance, order.useremail ?? order.userEmail]);
    await q(`UPDATE social_orders SET refundApplied=1,failureReason=$1,updatedAt=$2 WHERE id=$3`, [reason,new Date().toISOString(),internalOrderId]);
    await q(`INSERT INTO transactions (id,userId,amount,type,status,reference,timestamp) VALUES ($1,$2,$3,'social_order_refund','completed',$4,$5) ON CONFLICT(id) DO NOTHING`, [`refund-${internalOrderId}`,order.useremail ?? order.userEmail,naira,internalOrderId,new Date().toISOString()]);
    return true;
  });
}

export async function synchronizeOpenOrders() {
  const rows = await getAllRows(`SELECT so.*,po.providerOrderId AS po_provider_order_id FROM social_orders so JOIN provider_orders po ON po.internalOrderId=so.id WHERE LOWER(so.status) IN ('pending','processing','partial') AND po.providerOrderId IS NOT NULL AND po.providerOrderId <> '' ORDER BY so.createdAt ASC LIMIT 500`);
  if (!rows.length) return { count: 0 };
  for (let i=0;i<rows.length;i+=100) {
    const batch = rows.slice(i,i+100);
    const ids = batch.map((r:any)=>String(r.po_provider_order_id));
    let statuses: any = {};
    try { statuses = await getProviderStatuses(ids); } catch (e: any) {
      await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'status','failed',$3,0,$4)`, [`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,PROVIDER,String(e?.message || e),new Date().toISOString()]).catch(()=>{});
      continue;
    }
    for (const row of batch) {
      const pid = String(row.po_provider_order_id);
      const st = statuses?.[pid] || statuses?.[Number(pid)];
      if (!st || st.error) continue;
      const rawStatus = String(st.status || 'Pending');
      const mapped = providerStatusMap(rawStatus);
      const quantity = Number(row.quantity || 0);
      const remains = Math.max(0, Math.min(quantity, Math.floor(Number(st.remains ?? quantity))));
      const delivered = Math.max(0, Math.min(quantity, quantity-remains));
      const now = new Date().toISOString();
      const completedAt = mapped === 'COMPLETED' || mapped === 'CANCELLED' || mapped === 'FAILED' ? now : null;
      await withTransaction(async q => {
        const actualCharge = Number(st.charge || 0);
        const actualCurrency = String(st.currency || 'USD');
        const actualProfit = actualCurrency.toUpperCase() === 'USD' && Number(row.exchangerate ?? row.exchangeRate ?? 0) > 0
          ? Number(row.amount || 0) - (actualCharge * Number(row.exchangerate ?? row.exchangeRate ?? 0))
          : Number(row.amount || 0);
        await q(`UPDATE social_orders SET status=$1,providerStatus=$2,providerCharge=$3,providerCurrency=$4,startCount=$5,remainingQuantity=$6,deliveredQuantity=$7,profit=$8,lastProgressAt=$9,lastProviderSyncAt=$9,completedAt=COALESCE(completedAt,$10),updatedAt=$9 WHERE id=$11`,
          [mapped,rawStatus,actualCharge,actualCurrency,Number(st.start_count || 0),remains,delivered,actualProfit,now,completedAt,row.id]);
        await q(`UPDATE provider_orders SET providerCharge=$1,providerCurrency=$2,startCount=$3,providerStatus=$4,remainingQuantity=$5,lastSynchronizedAt=$6,updatedAt=$6 WHERE internalOrderId=$7`,
          [Number(st.charge || 0),String(st.currency || 'USD'),Number(st.start_count || 0),rawStatus,remains,now,row.id]);
        await q(`UPDATE transactions SET status=$1 WHERE reference=$2`, [mapped.toLowerCase(), row.id]);
        await q(`INSERT INTO provider_order_status_history (id,internalOrderId,providerOrderId,providerStatus,mappedStatus,charge,startCount,remains,currency,rawData,createdAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [`hist-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,row.id,pid,rawStatus,mapped,Number(st.charge || 0),Number(st.start_count || 0),remains,String(st.currency || 'USD'),JSON.stringify(st),now]);
      });
      if (mapped === 'CANCELLED' || mapped === 'FAILED') await refundOrderOnce(row.id, `Provider reported ${rawStatus}.`);
    }
  }
  return { count: rows.length };
}

async function synchronizePendingRefills() {
  const rows = await getAllRows(`SELECT * FROM provider_refills WHERE provider=$1 AND LOWER(status) IN ('pending','processing','in progress') ORDER BY requestedAt ASC LIMIT 100`, [PROVIDER]);
  for (const row of rows) {
    try {
      const result = await getProviderRefillStatus(String(row.providerrefillid || row.providerRefillId || ''));
      const status = String(result?.status || 'UNKNOWN');
      const done = /completed|canceled|cancelled|failed/i.test(status);
      await execute(`UPDATE provider_refills SET status=$1,completedAt=$2,rawData=$3 WHERE id=$4`, [status, done ? new Date().toISOString() : null, JSON.stringify(result), row.id]);
    } catch (e:any) {
      console.warn('[SMM PWR] Refill status sync failed:', e?.message || e);
    }
  }
}

let started = false;
export function startFulfillmentWorker() {
  if (started || !apiKey()) {
    if (!apiKey()) console.warn('[SMM PWR] Provider worker not started: SMM_PROVIDER_API_KEY is missing.');
    return;
  }
  started = true;
  const runCatalog = async () => { try { await syncProviderCatalogue(); } catch (e:any) { console.error('[SMM PWR] Catalogue sync failed:', e?.message || e); } };
  const runStatus = async () => { try { await synchronizeOpenOrders(); await synchronizePendingRefills(); } catch (e:any) { console.error('[SMM PWR] Status sync failed:', e?.message || e); } };
  runCatalog();
  runStatus();
  setInterval(runCatalog, CATALOG_INTERVAL_MS).unref?.();
  setInterval(runStatus, STATUS_INTERVAL_MS).unref?.();
}

export { PROVIDER, SUPPORTED, targetType, targetLabel, servicePriceCoins, usdNgnRate, providerStatusMap };
