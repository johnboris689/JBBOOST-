import crypto from 'crypto';
import { execute, getAllRows, getRow, withTransaction } from '../db';

/**
 * JB Boster fulfillment pool.
 * Each configured provider must expose the common SMM-panel API shape:
 * services, add, status, balance, refill, refill_status and cancel.
 * Provider credentials are server-only environment variables.
 */
const LEGACY_PROVIDER = 'smm_pwr';
const DEFAULT_URL = 'https://smmpwr.com/api/v2';
export const PROVIDER = LEGACY_PROVIDER; // kept for backward compatibility
export const SUPPORTED = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'X', 'Telegram'];
const STATUS_INTERVAL_MS = 60_000;
const CATALOG_INTERVAL_MS = 4 * 60_000;
const LOW_BALANCE_THRESHOLD = Number(process.env.SMM_LOW_BALANCE_THRESHOLD || 5);

export type ProviderConfig = { name: string; apiUrl: string; apiKey: string };

function configuredProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  const push = (name: string | undefined, url: string | undefined, key: string | undefined) => {
    const n = String(name || '').trim();
    const u = String(url || '').trim();
    const k = String(key || '').trim();
    if (n && u && k) out.push({ name: n.toLowerCase().replace(/[^a-z0-9_-]+/g, '_'), apiUrl: u, apiKey: k });
  };
  // Existing configuration remains valid.
  push(process.env.SMM_PROVIDER_NAME || 'smm_pwr', process.env.SMM_PROVIDER_API_URL || DEFAULT_URL, process.env.SMM_PROVIDER_API_KEY);
  // Additional providers can be enabled without changing application code.
  for (let i = 1; i <= 6; i++) {
    push(process.env[`SMM_PROVIDER_${i}_NAME`], process.env[`SMM_PROVIDER_${i}_API_URL`], process.env[`SMM_PROVIDER_${i}_API_KEY`]);
  }
  // Friendly aliases for common panels; URL remains explicit so no undocumented endpoint is invented.
  push('smmwiz', process.env.SMMWIZ_API_URL, process.env.SMMWIZ_API_KEY);
  push('fortunesmm', process.env.FORTUNESMM_API_URL, process.env.FORTUNESMM_API_KEY);
  push('smmroyale', process.env.SMMROYALE_API_URL, process.env.SMMROYALE_API_KEY);
  const seen = new Set<string>();
  return out.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
}

function providerByName(name: string): ProviderConfig | undefined {
  return configuredProviders().find(p => p.name === String(name || '').toLowerCase());
}
function apiUrl(provider: ProviderConfig) { return provider.apiUrl; }
function apiKey(provider: ProviderConfig) { return provider.apiKey; }
function usdNgnRate() {
  const n = Number(process.env.SMM_USD_NGN_RATE || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function nairaPerCoin() {
  const n = Number(process.env.NAIRA_PER_COIN || 1.5);
  return Number.isFinite(n) && n > 0 ? n : 1.5;
}
function defaultMarkupPercent() {
  const n = Number(process.env.SMM_DEFAULT_MARKUP_PERCENT ?? 50);
  return Number.isFinite(n) && n >= 0 ? n : 50;
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
function serviceKey(platform: string, name: string) {
  const type = serviceType(name, platform).toLowerCase();
  // Group comparable services across providers while keeping platform + metric distinct.
  return `${platform.toLowerCase()}::${type}`;
}
function compatibleService(s: any) {
  const platform = supportedPlatform(`${s.category || ''} ${s.name || ''}`);
  if (!SUPPORTED.includes(platform)) return null;
  const type = String(s.type || '').toLowerCase();
  const name = String(s.name || '').toLowerCase();
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
function timeoutSignal(ms: number) { return AbortSignal.timeout(ms); }

async function providerRequest(provider: ProviderConfig, params: Record<string, string | number>, timeoutMs = 15_000) {
  const body = new URLSearchParams();
  body.set('key', apiKey(provider));
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const response = await fetch(apiUrl(provider), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: timeoutSignal(timeoutMs) });
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`Provider ${provider.name} returned non-JSON response (${response.status}).`); }
  if (!response.ok) throw new Error(`Provider ${provider.name} HTTP ${response.status}: ${String(data?.error || 'request failed')}`);
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
function rateCurrency(s: any) { return String(s.currency || s.currency_code || s.currencyCode || 'USD').toUpperCase(); }
function providerRateNaira(rate: number, currency: string, exchangeRate: number) {
  if (!(rate > 0)) return 0;
  if (currency === 'NGN' || currency === 'NGR') return rate;
  if (currency === 'USD') return exchangeRate > 0 ? rate * exchangeRate : 0;
  const custom = Number(process.env[`SMM_${currency}_NGN_RATE`] || 0);
  return custom > 0 ? rate * custom : 0;
}
function servicePriceCoins(providerRate: number, markupPercent: number, exchangeRate: number, currency = 'USD') {
  const providerNairaPer1000 = providerRateNaira(providerRate, currency, exchangeRate);
  if (!(providerNairaPer1000 > 0)) return 0;
  const customerNairaPer1000 = providerNairaPer1000 * (1 + Math.max(0, markupPercent) / 100);
  return Math.max(1, Math.ceil(customerNairaPer1000 / nairaPerCoin()));
}

export function validateTarget(target: string, type: string) {
  const v = String(target || '').trim();
  if (!v || v.length > 500) return false;
  if (type === 'profile') return /^https?:\/\//i.test(v) || /^@[A-Za-z0-9_.-]{2,}$/.test(v);
  return /^https?:\/\//i.test(v);
}

export async function syncProviderCatalogue() {
  const started = Date.now();
  const providers = configuredProviders();
  if (!providers.length) throw new Error('No fulfillment provider is configured.');
  const exchangeRate = usdNgnRate();
  let total = 0;
  const results: any[] = [];
  for (const provider of providers) {
    const providerStarted = Date.now();
    try {
      const services = await providerRequest(provider, { action: 'services' }, 20_000);
      if (!Array.isArray(services)) throw new Error('Provider services response was not an array.');
      const now = new Date().toISOString();
      const seen = new Set<string>();
      for (const s of services) {
        const platform = compatibleService(s);
        if (!platform) continue;
        const providerId = String(s.service || '').trim();
        if (!providerId) continue;
        seen.add(providerId);
        const rowId = `${provider.name}-${providerId}`;
        const name = String(s.name || `${platform} service ${providerId}`).trim();
        const category = String(s.category || '').trim();
        const description = String(s.description || s.desc || '').trim();
        const estimatedMinutes = estimateMinutes(s);
        const rate = Number(s.rate || 0);
        const currency = rateCurrency(s);
        const min = Math.floor(Number(s.min || 0));
        const max = Math.floor(Number(s.max || 0));
        const type = serviceType(name, platform);
        const key = serviceKey(platform, name);
        await execute(`INSERT INTO provider_services (id,provider,providerServiceId,platform,serviceName,serviceType,category,ratePer1000,minQuantity,maxQuantity,refillAvailable,cancelAvailable,dripfeedAvailable,description,providerStatus,isAvailable,rawData,lastSyncedAt)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'available',1,$15,$16)
          ON CONFLICT(provider,providerServiceId) DO UPDATE SET platform=EXCLUDED.platform,serviceName=EXCLUDED.serviceName,serviceType=EXCLUDED.serviceType,category=EXCLUDED.category,ratePer1000=EXCLUDED.ratePer1000,minQuantity=EXCLUDED.minQuantity,maxQuantity=EXCLUDED.maxQuantity,refillAvailable=EXCLUDED.refillAvailable,cancelAvailable=EXCLUDED.cancelAvailable,dripfeedAvailable=EXCLUDED.dripfeedAvailable,description=EXCLUDED.description,providerStatus='available',isAvailable=1,rawData=EXCLUDED.rawData,lastSyncedAt=EXCLUDED.lastSyncedAt`,
          [rowId,provider.name,providerId,platform,name,type,category,rate,min,max,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,description,JSON.stringify({...s,currency,serviceKey:key}),now]);

        const existing = await getRow(`SELECT * FROM social_services WHERE provider=$1 AND providerServiceId=$2`, [provider.name, providerId]);
        const coins = servicePriceCoins(rate, defaultMarkupPercent(), exchangeRate, currency);
        if (!existing) {
          const id = `svc-${provider.name}-${providerId}`;
          await execute(`INSERT INTO social_services (id,platform,name,description,ratePer1000,minQuantity,maxQuantity,enabled,createdAt,estimatedMinutes,providerServiceId,provider,customerCoinsPer1000,refillAvailable,cancelAvailable,dripfeedAvailable,providerDescription,providerLastSyncedAt,providerAvailable,serviceKey)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1,$19)`,
            [id,platform,name,description,rate,min,max,coins>0?1:0,now,estimatedMinutes,providerId,provider.name,coins,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,description,now,key]);
          await execute(`INSERT INTO provider_service_mappings (id,provider,providerServiceId,socialServiceId,customerCoinsPer1000,markupPercent,enabled,createdAt,updatedAt) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7) ON CONFLICT(provider,socialServiceId) DO UPDATE SET providerServiceId=EXCLUDED.providerServiceId,customerCoinsPer1000=EXCLUDED.customerCoinsPer1000,markupPercent=EXCLUDED.markupPercent,updatedAt=EXCLUDED.updatedAt`,
            [`map-${provider.name}-${providerId}`,provider.name,providerId,id,coins,defaultMarkupPercent(),now]);
        } else {
          await execute(`UPDATE social_services SET platform=$1,name=$2,description=$3,ratePer1000=$4,minQuantity=$5,maxQuantity=$6,providerDescription=$7,providerLastSyncedAt=$8,providerAvailable=1,refillAvailable=$9,cancelAvailable=$10,dripfeedAvailable=$11,estimatedMinutes=$12,serviceKey=$13 WHERE id=$14`,
            [platform,name,description,rate,min,max,description,now,parseBool(s.refill)?1:0,parseBool(s.cancel)?1:0,parseBool(s.dripfeed)?1:0,estimatedMinutes,key,existing.id]);
          // Refresh the automatic price for imported services. Admin overrides can still be applied later.
          if (!Number(existing.customercoinsper1000 ?? existing.customerCoinsPer1000 ?? 0) || String(process.env.SMM_AUTO_REFRESH_PRICES || 'true').toLowerCase() === 'true') {
            await execute(`UPDATE social_services SET customerCoinsPer1000=$1,enabled=$2,serviceKey=$3 WHERE id=$4`, [coins,coins>0?1:0,key,existing.id]);
            await execute(`UPDATE provider_service_mappings SET customerCoinsPer1000=$1,markupPercent=$2,updatedAt=$3 WHERE provider=$4 AND socialServiceId=$5`, [coins,defaultMarkupPercent(),now,provider.name,existing.id]);
          }
        }
        total++;
      }
      const existingProvider = await getAllRows(`SELECT providerServiceId FROM provider_services WHERE provider=$1`, [provider.name]);
      for (const r of existingProvider) {
        const id = String(r.providerserviceid || r.providerServiceId || '');
        if (id && !seen.has(id)) {
          await execute(`UPDATE provider_services SET isAvailable=0,providerStatus='unavailable',lastSyncedAt=$1 WHERE provider=$2 AND providerServiceId=$3`, [now,provider.name,id]);
          await execute(`UPDATE social_services SET providerAvailable=0,enabled=0 WHERE provider=$1 AND providerServiceId=$2`, [provider.name,id]);
        }
      }
      await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'services','success',$3,$4,$5)`, [`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,provider.name,`Synchronized ${seen.size} compatible services.`,Date.now()-providerStarted,now]);
      results.push({provider:provider.name,count:seen.size,status:'success'});
    } catch (e:any) {
      const message=String(e?.message||e);
      await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'services','failed',$3,$4,$5)`, [`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,provider.name,message,Date.now()-providerStarted,new Date().toISOString()]).catch(()=>{});
      results.push({provider:provider.name,count:0,status:'failed',error:message});
    }
  }
  return { count: total, providers: results, exchangeRate, nairaPerCoin: nairaPerCoin(), markupPercent: defaultMarkupPercent(), durationMs: Date.now()-started };
}

export async function getProviderBalance(providerName?: string) {
  const providers = providerName ? [providerByName(providerName)].filter(Boolean) as ProviderConfig[] : configuredProviders();
  if (!providers.length) throw new Error('No fulfillment provider is configured.');
  const balances:any[]=[];
  for (const p of providers) {
    try {
      const data=await providerRequest(p,{action:'balance'});
      balances.push({provider:p.name,balance:Number(data?.balance||0),currency:String(data?.currency||'USD'),configured:true});
    } catch(e:any) { balances.push({provider:p.name,balance:0,currency:'USD',configured:true,error:String(e?.message||e)}); }
  }
  return providerName ? balances[0] : {providers:balances};
}

export async function submitProviderOrder(providerName: string, serviceId: string, target: string, quantity: number) {
  const provider=providerByName(providerName); if(!provider) throw new Error(`Provider ${providerName} is not configured.`);
  const data=await providerRequest(provider,{action:'add',service:serviceId,link:target,quantity});
  const id=String(data?.order||'').trim(); if(!id) throw new Error(`Provider ${provider.name} did not return an order ID.`); return id;
}
export async function getProviderStatuses(providerName: string, ids: string[]) {
  if(!ids.length)return {};
  const provider=providerByName(providerName); if(!provider) throw new Error(`Provider ${providerName} is not configured.`);
  return await providerRequest(provider,{action:'status',orders:ids.slice(0,100).join(',')});
}
export async function requestProviderRefill(providerName:string, providerOrderId:string){const p=providerByName(providerName);if(!p)throw new Error(`Provider ${providerName} is not configured.`);return providerRequest(p,{action:'refill',order:providerOrderId});}
export async function getProviderRefillStatus(providerName:string, refillId:string){const p=providerByName(providerName);if(!p)throw new Error(`Provider ${providerName} is not configured.`);return providerRequest(p,{action:'refill_status',refill:refillId});}
export async function cancelProviderOrders(providerName:string,ids:string[]){const p=providerByName(providerName);if(!p)throw new Error(`Provider ${providerName} is not configured.`);return providerRequest(p,{action:'cancel',orders:ids.slice(0,100).join(',')});}

export function findBestServiceCandidates(rows:any[]) {
  const groups=new Map<string,any>();
  for(const row of rows){
    const key=String(row.servicekey||row.serviceKey||serviceKey(String(row.platform||''),String(row.name||'')));
    const coins=Number(row.customercoinsper1000??row.customerCoinsPer1000??0);
    if(!(coins>0))continue;
    const current=groups.get(key);
    if(!current || coins<Number(current.customercoinsper1000??current.customerCoinsPer1000??Infinity)) groups.set(key,row);
  }
  return [...groups.values()];
}

async function refundOrderOnce(internalOrderId: string, reason: string) {
  return withTransaction(async q => {
    const orderRes = await q(`SELECT * FROM social_orders WHERE id=$1 FOR UPDATE`, [internalOrderId]);
    const order = orderRes.rows?.[0];
    if (!order || Number(order.refundapplied ?? order.refundApplied ?? 0) === 1) return false;
    const coins = Number(order.customercoins ?? order.customerCoins ?? 0);
    const naira = coins * nairaPerCoin();
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
  const rows=await getAllRows(`SELECT so.*,po.providerOrderId AS po_provider_order_id,po.provider AS po_provider FROM social_orders so JOIN provider_orders po ON po.internalOrderId=so.id WHERE LOWER(so.status) IN ('pending','processing','partial') AND po.providerOrderId IS NOT NULL AND po.providerOrderId <> '' ORDER BY so.createdAt ASC LIMIT 500`);
  if(!rows.length)return {count:0};
  let processed=0;
  for(const provider of configuredProviders()){
    const providerRows=rows.filter((r:any)=>String(r.po_provider||r.provider||'').toLowerCase()===provider.name);
    for(let i=0;i<providerRows.length;i+=100){
      const batch=providerRows.slice(i,i+100); const ids=batch.map((r:any)=>String(r.po_provider_order_id)); let statuses:any={};
      try{statuses=await getProviderStatuses(provider.name,ids)}catch(e:any){await execute(`INSERT INTO provider_sync_logs (id,provider,action,status,message,durationMs,createdAt) VALUES ($1,$2,'status','failed',$3,0,$4)`,[`sync-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,provider.name,String(e?.message||e),new Date().toISOString()]).catch(()=>{});continue;}
      for(const row of batch){
        const pid=String(row.po_provider_order_id); const st=statuses?.[pid]||statuses?.[Number(pid)]; if(!st||st.error)continue;
        const rawStatus=String(st.status||'Pending'); const mapped=providerStatusMap(rawStatus); const quantity=Number(row.quantity||0);
        const remains=Math.max(0,Math.min(quantity,Math.floor(Number(st.remains??quantity)))); const delivered=Math.max(0,Math.min(quantity,quantity-remains)); const now=new Date().toISOString();
        const completedAt=['COMPLETED','CANCELLED','FAILED'].includes(mapped)?now:null;
        await withTransaction(async q=>{
          const actualCharge=Number(st.charge||0); const actualCurrency=String(st.currency||'USD');
          const actualProfit=actualCurrency.toUpperCase()==='USD'&&Number(row.exchangerate??row.exchangeRate??0)>0?Number(row.amount||0)-(actualCharge*Number(row.exchangerate??row.exchangeRate??0)):Number(row.amount||0);
          await q(`UPDATE social_orders SET status=$1,providerStatus=$2,providerCharge=$3,providerCurrency=$4,startCount=$5,remainingQuantity=$6,deliveredQuantity=$7,profit=$8,lastProgressAt=$9,lastProviderSyncAt=$9,completedAt=COALESCE(completedAt,$10),updatedAt=$9 WHERE id=$11`,[mapped,rawStatus,actualCharge,actualCurrency,Number(st.start_count||0),remains,delivered,actualProfit,now,completedAt,row.id]);
          await q(`UPDATE provider_orders SET providerCharge=$1,providerCurrency=$2,startCount=$3,providerStatus=$4,remainingQuantity=$5,lastSynchronizedAt=$6,updatedAt=$6 WHERE internalOrderId=$7`,[actualCharge,actualCurrency,Number(st.start_count||0),rawStatus,remains,now,row.id]);
          await q(`UPDATE transactions SET status=$1 WHERE reference=$2`,[mapped.toLowerCase(),row.id]);
          await q(`INSERT INTO provider_order_status_history (id,internalOrderId,providerOrderId,providerStatus,mappedStatus,charge,startCount,remains,currency,rawData,createdAt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[`hist-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,row.id,pid,rawStatus,mapped,actualCharge,Number(st.start_count||0),remains,actualCurrency,JSON.stringify(st),now]);
        });
        processed++;
        if(mapped==='CANCELLED'||mapped==='FAILED')await refundOrderOnce(row.id,`Provider reported ${rawStatus}.`);
      }
    }
  }
  return {count:processed};
}

async function synchronizePendingRefills(){
  const rows=await getAllRows(`SELECT * FROM provider_refills WHERE LOWER(status) IN ('pending','processing','in progress') ORDER BY requestedAt ASC LIMIT 100`);
  for(const row of rows){try{const result=await getProviderRefillStatus(String(row.provider||''),String(row.providerrefillid||row.providerRefillId||''));const status=String(result?.status||'UNKNOWN');const done=/completed|canceled|cancelled|failed/i.test(status);await execute(`UPDATE provider_refills SET status=$1,completedAt=$2,rawData=$3 WHERE id=$4`,[status,done?new Date().toISOString():null,JSON.stringify(result),row.id]);}catch(e:any){console.warn('[JB Boster] Refill status sync failed:',e?.message||e);}}
}

let started=false;
export function startFulfillmentWorker(){
  const providers=configuredProviders();
  if(started||!providers.length){if(!providers.length)console.warn('[JB Boster] Fulfillment worker not started: no provider credentials configured.');return;}
  started=true;
  const runCatalog=async()=>{try{await syncProviderCatalogue();}catch(e:any){console.error('[JB Boster] Catalogue sync failed:',e?.message||e);}};
  const runStatus=async()=>{try{await synchronizeOpenOrders();await synchronizePendingRefills();}catch(e:any){console.error('[JB Boster] Status sync failed:',e?.message||e);}};
  runCatalog();runStatus();setInterval(runCatalog,CATALOG_INTERVAL_MS).unref?.();setInterval(runStatus,STATUS_INTERVAL_MS).unref?.();
}

export { targetType, targetLabel, servicePriceCoins, usdNgnRate, providerStatusMap, nairaPerCoin, defaultMarkupPercent, configuredProviders, providerRateNaira };

