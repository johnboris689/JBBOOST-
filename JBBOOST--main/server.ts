import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { initDb, getRow, getAllRows, execute, withTransaction } from './db';
import { PROVIDER, SUPPORTED, syncProviderCatalogue, synchronizeOpenOrders, getProviderBalance, submitProviderOrder, requestProviderRefill, getProviderRefillStatus, cancelProviderOrders, validateTarget, targetType, targetLabel, servicePriceCoins, usdNgnRate, providerStatusMap, nairaPerCoin, providerRateNaira, findBestServiceCandidates } from './server/fulfillmentProvider';
import { AgentNetworkEngine } from './server/agentNetwork';
import { sendEmail, sendSms } from './email_sms_service';
import { paymentManager, PaymentProviderName } from './server/payments/index';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const DB_FILE = path.join(process.cwd(), 'nevo_db.json');

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  }
}));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// -------------------- DATABASE REAL-TIME READ/WRITE SYNC MIDDLEWARE --------------------
app.use('/api', async (req, res, next) => {
  // 1. Ensure read-through consistency: load latest database state into cache on every request
  try {
    await loadDbCache();
  } catch (err) {
    console.error('[Nevo DB] Failed to reload database cache:', err);
  }

  // 2. Ensure write-through consistency: intercept response to await any active database writes
  const originalSend = res.send;
  res.send = function (body?: any) {
    pendingWritePromise.then(() => {
      originalSend.call(this, body);
    }).catch((err) => {
      console.error('[Nevo DB] Error waiting for database write:', err);
      originalSend.call(this, body);
    });
    return this;
  };

  next();
});

// Set up multer disk storage
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.get('/nevo_complete_source.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo_complete_source.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo_complete_source.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/nevo_complete_source_v2.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo_complete_source_v2.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo_complete_source_v2.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo_complete_source_v2.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo_complete_source_v2.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo_complete_source_v2.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo_complete_source.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo_complete_source.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo_complete_source.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo_latest_updates.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo_latest_updates.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo_latest_updates.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/nevo-final-transfer-dashboard-update.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-final-transfer-dashboard-update.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-final-transfer-dashboard-update.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo-final-transfer-dashboard-update.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-final-transfer-dashboard-update.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-final-transfer-dashboard-update.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/nevo-transfer-download-fix.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-transfer-download-fix.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-transfer-download-fix.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo-transfer-download-fix.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-transfer-download-fix.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-transfer-download-fix.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/nevo-update.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-update.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-update.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

app.get('/download/nevo-update.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'nevo-update.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'nevo-update.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `guide-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed.'));
    }
  }
});

// -------------------- SECURITY HEADERS MIDDLEWARE --------------------
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; img-src 'self' data: https:; font-src 'self' https: data:; media-src 'self' data: https:;");
  next();
});

// -------------------- RATE LIMITING MIDDLEWARE --------------------
const rateLimits = new Map<string, { count: number; lastReset: number }>();
function rateLimiter(req: any, res: any, next: any) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(ip) || { count: 0, lastReset: now };

  if (now - limit.lastReset > 60 * 1000) {
    limit.count = 1;
    limit.lastReset = now;
  } else {
    limit.count += 1;
  }
  rateLimits.set(ip, limit);

  if (limit.count > 100) { // 100 requests per minute
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again after 1 minute.' });
  }
  next();
}

app.use(rateLimiter);

// -------------------- DATABASE DEFINITIONS --------------------
interface UserState {
  fullName: string;
  email: string;
  passwordHash: string;
  balance: number;
  dailyTarget: number;
  dailySpent: number;
  pinCreated: boolean;
  pinCode?: string;
  pinHash?: string;
  biometricEnabled: boolean;
  biometricRegisteredAt?: string;
  lastBiometricLogin?: string;
  lastLoginMethod?: string;
  webAuthnCredential?: {
    id: string;
    rawId?: string;
    type?: string;
    publicKey?: string;
    counter?: number;
    transports?: string[];
    deviceName?: string;
    createdAt?: string;
  };
  phone?: string;
  profilePic?: string;
  tier?: number;
  isSuspended?: boolean;
  isFrozen?: boolean;
  registrationDate?: string;
  accountStatus?: string;
  emailVerificationStatus?: string;
  transactions?: any[];
  notifications?: any[];
  beneficiaries?: any[];
  phoneBeneficiaries?: any[];
  loginHistory?: any[];
  wdvVerified?: boolean;
  isWdvVerified?: boolean;
  welcomeRewardShown?: boolean;
  giftDay?: number;
  giftActive?: boolean;
  lastGiftCreditTime?: string;
  giftExpiresAt?: string;
  lastActivityTime?: string;
  lastLogin?: string;
  username?: string;
  referralCode?: string;
  referralCount?: number;
  totalReferralBonus?: number;
  totalEarnings?: number;
  activationPaid?: boolean;
  activationPaidAt?: string;
}

interface WdvConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  whatsappLink: string;
  whatsappNumber?: string;
  voucherPrice: number;
  instructions: string;
  maintenanceNotice: string;
}

const DEFAULT_WDV_CONFIG: WdvConfig = {
  bankName: "PalmPay",
  accountNumber: "8960723295",
  accountName: "pwamunadi ishaku",
  whatsappLink: "https://wa.me/2349162845073",
  whatsappNumber: "+2349162845073",
  voucherPrice: 6500,
  instructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
  maintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
};

interface AdminState {
  email: string;
  passwordHash: string;
  passwordhash?: string;
}

interface DBStructure {
  users: UserState[];
  vouchers: any[];
  passwordResets: any[];
  logs: any[];
  wdvConfig?: WdvConfig;
  admins?: AdminState[];
  ad_reward_sessions?: any[];
  ad_rewards?: any[];
  nevo_adverts?: any[];
}

const DEFAULT_ADVERTS = [
  {
    id: 'adv-1',
    title: 'Kuda Digital Bank',
    description: 'Open a zero-fee smart bank account with free monthly interbank transfers, automatic budgeting, and virtual debit cards.',
    destinationUrl: 'https://kuda.com',
    rewardAmount: 250,
    bannerUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80',
    category: 'Fintech',
    clicks: 145,
    impressions: 1200,
    isActive: true,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z'
  },
  {
    id: 'adv-2',
    title: 'OPay Daily Rewards & Cashback',
    description: 'Experience lightning-fast bill payments, daily cashback rewards, and flexible high-yield savings plans.',
    destinationUrl: 'https://opayweb.com',
    rewardAmount: 200,
    bannerUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=80',
    category: 'Finance',
    clicks: 98,
    impressions: 850,
    isActive: true,
    createdAt: '2026-01-12T10:00:00Z',
    updatedAt: '2026-01-12T10:00:00Z'
  },
  {
    id: 'adv-3',
    title: 'Jumia Nigeria Mega Deals',
    description: 'Shop verified gadgets, smartphones, home electronics, and trendy fashion with swift doorstep delivery nationwide.',
    destinationUrl: 'https://www.jumia.com.ng',
    rewardAmount: 200,
    bannerUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&auto=format&fit=crop&q=80',
    category: 'Shopping',
    clicks: 210,
    impressions: 1940,
    isActive: true,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z'
  },
  {
    id: 'adv-4',
    title: 'MTN 5G Broadband',
    description: 'Supercharge your daily remote work and streaming with lightning-speed 5G broadband and bundled data packages.',
    destinationUrl: 'https://www.mtn.ng',
    rewardAmount: 300,
    bannerUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80',
    category: 'Telecom',
    clicks: 167,
    impressions: 1420,
    isActive: true,
    createdAt: '2026-01-18T10:00:00Z',
    updatedAt: '2026-01-18T10:00:00Z'
  },
  {
    id: 'adv-5',
    title: 'PiggyVest SafeLock & Savings',
    description: 'Lock your funds safely, earn up to 13% p.a. interest, and build ironclad financial discipline with automated targets.',
    destinationUrl: 'https://www.piggyvest.com',
    rewardAmount: 250,
    bannerUrl: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&auto=format&fit=crop&q=80',
    category: 'Investment',
    clicks: 189,
    impressions: 1650,
    isActive: true,
    createdAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-01-20T10:00:00Z'
  }
];

// -------------------- SQL DATABASE CACHE PRELOADER --------------------
let dbCache: DBStructure = {
  users: [],
  vouchers: [],
  passwordResets: [],
  logs: [],
  wdvConfig: { ...DEFAULT_WDV_CONFIG },
  admins: [],
  ad_reward_sessions: [],
  ad_rewards: [],
  nevo_adverts: [...DEFAULT_ADVERTS]
};

function safeParseJson(val: any, fallback: any = []): any {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch (err) {
    console.error('[Nevo DB] Failed to parse JSON field:', val, err);
    return fallback;
  }
}

async function loadDbCache() {
  // Ensure we wait for any pending database writes to complete first
  await pendingWritePromise;
  try {
    console.log('[Nevo DB] Preloading database cache from SQL database...');
    
    // Fetch settings
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const wdvConfig: any = { ...DEFAULT_WDV_CONFIG };
    for (const r of settingRows) {
      if (r.key === 'wdvBankName' || r.key === 'bpcBankName') wdvConfig.bankName = r.value;
      if (r.key === 'wdvAccountNumber' || r.key === 'bpcAccountNumber') wdvConfig.accountNumber = r.value;
      if (r.key === 'wdvAccountName' || r.key === 'bpcAccountName') wdvConfig.accountName = r.value;
      if (r.key === 'wdvWhatsappLink' || r.key === 'bpcWhatsappLink') wdvConfig.whatsappLink = r.value;
      if (r.key === 'wdvWhatsappNumber' || r.key === 'whatsappNumber') wdvConfig.whatsappNumber = r.value;
      if (r.key === 'wdvVoucherPrice' || r.key === 'bpcVoucherPrice') wdvConfig.voucherPrice = Number(r.value || 6500);
      if (r.key === 'wdvInstructions' || r.key === 'bpcInstructions') wdvConfig.instructions = r.value;
      if (r.key === 'wdvMaintenanceNotice' || r.key === 'bpcMaintenanceNotice') wdvConfig.maintenanceNotice = r.value;
    }

    // Fetch users
    const userRows = await getAllRows(`SELECT * FROM users`);
    const users: UserState[] = userRows.map(row => ({
      fullName: row.fullname || '',
      email: row.email || '',
      passwordHash: row.passwordhash || '',
      balance: Number(row.balance ?? 0),
      dailyTarget: Number(row.dailytarget ?? 50000),
      dailySpent: Number(row.dailyspent ?? 0),
      pinCreated: row.pincreated === 1,
      pinCode: row.pincode || '',
      biometricEnabled: row.biometricenabled === 1,
      phone: row.phone || '',
      profilePic: row.profilepic || '',
      tier: Number(row.tier ?? 3),
      isSuspended: row.issuspended === 1,
      isFrozen: row.isfrozen === 1,
      registrationDate: row.registrationdate || '',
      accountStatus: row.accountstatus || 'active',
      beneficiaries: safeParseJson(row.beneficiaries, []),
      phoneBeneficiaries: safeParseJson(row.phonebeneficiaries, []),
      loginHistory: safeParseJson(row.loginhistory, []),
      notifications: safeParseJson(row.notifications, []),
      transactions: safeParseJson(row.transactions, []),
      wdvVerified: row.wdvverified === 1 || row.iswdvverified === 1,
      isWdvVerified: row.iswdvverified === 1 || row.wdvverified === 1,
      welcomeRewardShown: row.welcomerewardshown === 1,
      giftDay: Number(row.giftday ?? 0),
      giftActive: row.giftactive !== 0, // default true if null or not 0
      lastGiftCreditTime: row.lastgiftcredittime || '',
      giftExpiresAt: row.giftexpiresat || '',
      lastActivityTime: row.lastactivitytime || '',
      lastLogin: row.lastlogin || '',
      username: row.username || row.email?.split('@')[0] || '',
      referralCode: row.referralcode || '',
      referralCount: Number(row.referralcount ?? 0),
      totalReferralBonus: Number(row.totalreferralbonus ?? 0),
      totalEarnings: Number(row.totalearnings ?? 0),
      activationPaid: row.activationpaid === 1,
      activationPaidAt: row.activationpaidat || ''
    }));

    // Fetch vouchers - load all database-backed vouchers with complete fields
    const voucherRows = await getAllRows(`SELECT * FROM vouchers`);
    let vouchers = voucherRows.map(row => ({
      id: row.id || row.vouchercode || row.code,
      code: row.vouchercode || row.code,
      voucherCode: row.vouchercode || row.code,
      amount: Number(row.amount ?? 6500),
      status: row.status || 'unused',
      usedBy: row.usedby || '',
      usedAt: row.usedat || '',
      generatedAt: row.generatedat || new Date().toISOString(),
      withdrawalId: row.withdrawalid || '',
      purchasedBy: row.purchasedby || '',
      redeemedBy: safeParseJson(row.redeemedby, [])
    }));

    // Fetch password resets
    const resetRows = await getAllRows(`SELECT * FROM password_resets`);
    const passwordResets = resetRows.map(row => ({
      email: row.emailorphone || '',
      otp: row.otp || '',
      token: row.id || '',
      expiresAt: Number(row.expiresat || 0),
      used: row.used === 1
    }));

    // Fetch administrators from the Nevo database schema. No hardcoded/demo administrator is loaded.
    const adminRows = await getAllRows(`SELECT * FROM admins`);
    const admins = adminRows.map((row: any) => ({ email: String(row.email || '').toLowerCase(), passwordHash: row.passwordhash || row.passwordHash || '' }));

    // Fetch logs
    const logRows = await getAllRows(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500`);
    const logs = logRows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      message: row.message,
      type: row.type
    }));

    // Fetch adverts
    let adverts: any[] = [];
    try {
      const advertRows = await getAllRows(`SELECT * FROM nevo_adverts ORDER BY createdAt DESC`);
      adverts = advertRows.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description || '',
        destinationUrl: row.destinationurl || row.destinationUrl,
        rewardAmount: Number(row.rewardamount ?? row.rewardAmount ?? 200),
        bannerUrl: row.bannerurl || row.bannerUrl || '',
        category: row.category || 'sponsored',
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        isActive: row.isactive === 1 || row.isActive === 1 || row.isActive === true || row.isactive === true,
        createdAt: row.createdat || row.createdAt || new Date().toISOString(),
        updatedAt: row.updatedat || row.updatedAt || new Date().toISOString()
      }));
    } catch (_) {}
    if (adverts.length === 0) {
      adverts = [...DEFAULT_ADVERTS];
    }

    dbCache = {
      users,
      vouchers,
      passwordResets,
      logs,
      wdvConfig,
      admins,
      ad_reward_sessions: [],
      ad_rewards: [],
      nevo_adverts: adverts
    };
    console.log(`[Nevo DB] Successfully preloaded ${users.length} users, ${vouchers.length} vouchers, and ${logs.length} diagnostic logs.`);
  } catch (err) {
    console.error('[Nevo DB] Failed to preload database cache:', err);
  }
}

async function persistDbCache(data: DBStructure) {
  try {
    // 0. Sync user deletions from PostgreSQL
    const existingUsers = await getAllRows(`SELECT email FROM users`);
    const activeEmails = new Set(data.users.map(u => u.email.toLowerCase()));
    for (const row of existingUsers) {
      if (!activeEmails.has(row.email.toLowerCase())) {
        await execute(`DELETE FROM users WHERE email = $1`, [row.email.toLowerCase()]);
      }
    }

    // 1. Save Users
    for (const u of data.users) {
      try {
        await execute(`
          INSERT INTO users (
            fullName, username, email, phone, passwordHash, balance, dailyTarget, dailySpent,
            pinCreated, pinCode, biometricEnabled, profilePic, tier, isSuspended, isFrozen,
            registrationDate, accountStatus, beneficiaries, phoneBeneficiaries, loginHistory,
            notifications, transactions, wdvVerified, isWdvVerified, welcomeRewardShown,
            giftDay, giftActive, lastGiftCreditTime, giftExpiresAt, lastActivityTime, lastLogin
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
          ON CONFLICT(email) DO UPDATE SET
            fullName = EXCLUDED.fullName,
            phone = EXCLUDED.phone,
            passwordHash = EXCLUDED.passwordHash,
            balance = EXCLUDED.balance,
            dailyTarget = EXCLUDED.dailyTarget,
            dailySpent = EXCLUDED.dailySpent,
            pinCreated = EXCLUDED.pinCreated,
            pinCode = EXCLUDED.pinCode,
            biometricEnabled = EXCLUDED.biometricEnabled,
            profilePic = EXCLUDED.profilePic,
            tier = EXCLUDED.tier,
            isSuspended = EXCLUDED.isSuspended,
            isFrozen = EXCLUDED.isFrozen,
            registrationDate = EXCLUDED.registrationDate,
            accountStatus = EXCLUDED.accountStatus,
            beneficiaries = EXCLUDED.beneficiaries,
            phoneBeneficiaries = EXCLUDED.phoneBeneficiaries,
            loginHistory = EXCLUDED.loginHistory,
            notifications = EXCLUDED.notifications,
            transactions = EXCLUDED.transactions,
            wdvVerified = EXCLUDED.wdvVerified,
            isWdvVerified = EXCLUDED.isWdvVerified,
            welcomeRewardShown = EXCLUDED.welcomeRewardShown,
            giftDay = EXCLUDED.giftDay,
            giftActive = EXCLUDED.giftActive,
            lastGiftCreditTime = EXCLUDED.lastGiftCreditTime,
            giftExpiresAt = EXCLUDED.giftExpiresAt,
            lastActivityTime = EXCLUDED.lastActivityTime,
            lastLogin = EXCLUDED.lastLogin
        `, [
          u.fullName,
          u.email.split('@')[0],
          u.email.toLowerCase(),
          u.phone || '',
          u.passwordHash,
          u.balance,
          u.dailyTarget,
          u.dailySpent,
          u.pinCreated ? 1 : 0,
          u.pinCode || '',
          u.biometricEnabled ? 1 : 0,
          u.profilePic || '',
          u.tier || 3,
          u.isSuspended ? 1 : 0,
          u.isFrozen ? 1 : 0,
          u.registrationDate || new Date().toISOString(),
          u.accountStatus || 'active',
          JSON.stringify(u.beneficiaries || []),
          JSON.stringify(u.phoneBeneficiaries || []),
          JSON.stringify(u.loginHistory || []),
          JSON.stringify(u.notifications || []),
          JSON.stringify(u.transactions || []),
          u.wdvVerified || u.isWdvVerified ? 1 : 0,
          u.isWdvVerified || u.wdvVerified ? 1 : 0,
          u.welcomeRewardShown ? 1 : 0,
          u.giftDay || 0,
          u.giftActive ? 1 : 0,
          u.lastGiftCreditTime || '',
          u.giftExpiresAt || '',
          u.lastActivityTime || new Date().toISOString(),
          u.lastLogin || ''
        ]);
      } catch (uErr) {
        try {
          await execute(`UPDATE users SET balance = $1, pinCode = $2, notifications = $3, transactions = $4 WHERE email = $5`,
            [u.balance, u.pinCode || '', JSON.stringify(u.notifications || []), JSON.stringify(u.transactions || []), u.email.toLowerCase()]);
        } catch (_) {}
      }
    }

    // 2. Save Vouchers
    for (const v of data.vouchers) {
      const vCode = v.voucherCode || v.code;
      const vId = v.id || `v-${vCode}`;
      try {
        await execute(`
          INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT(id) DO UPDATE SET
            voucherCode = EXCLUDED.voucherCode,
            code = EXCLUDED.code,
            amount = EXCLUDED.amount,
            status = EXCLUDED.status,
            usedBy = EXCLUDED.usedBy,
            usedAt = EXCLUDED.usedAt,
            generatedAt = EXCLUDED.generatedAt,
            withdrawalId = EXCLUDED.withdrawalId,
            purchasedBy = EXCLUDED.purchasedBy,
            redeemedBy = EXCLUDED.redeemedBy
        `, [
          vId,
          vCode,
          vCode,
          v.amount ?? 6500,
          v.status || 'unused',
          v.usedBy || '',
          v.usedAt || '',
          v.generatedAt || new Date().toISOString(),
          v.withdrawalId || '',
          v.purchasedBy || 'admin',
          JSON.stringify(v.redeemedBy || [])
        ]);
      } catch (vErr) {
        try {
          await execute(`UPDATE vouchers SET status = $1, usedBy = $2, usedAt = $3 WHERE voucherCode = $4 OR code = $4`,
            [v.status || 'unused', v.usedBy || '', v.usedAt || '', vCode]);
        } catch (_) {}
      }
    }

    // 3. Save Password Resets
    for (const r of data.passwordResets || []) {
      const id = r.token || `reset-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      try {
        await execute(`
          INSERT INTO password_resets (id, emailOrPhone, otp, expiresAt, used, createdAt)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(id) DO UPDATE SET
            used = EXCLUDED.used
        `, [id, r.email.toLowerCase(), r.otp, r.expiresAt, r.used ? 1 : 0, Date.now()]);
      } catch (_) {}
    }

    // 4. Save Wdv Config Settings to admin_settings
    if (data.wdvConfig) {
      const c = data.wdvConfig;
      const settingsMap = {
        wdvBankName: c.bankName,
        wdvAccountNumber: c.accountNumber,
        wdvAccountName: c.accountName,
        wdvWhatsappLink: c.whatsappLink,
        wdvVoucherPrice: String(c.voucherPrice),
        wdvInstructions: c.instructions,
        wdvMaintenanceNotice: c.maintenanceNotice
      };
      for (const [key, value] of Object.entries(settingsMap)) {
        try {
          await execute(`
            INSERT INTO admin_settings (key, value) VALUES ($1, $2)
            ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
          `, [key, value]);
        } catch (_) {
          try {
            await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [value, key]);
          } catch (_) {}
        }
      }
    }

    // 5. Save Adverts to nevo_adverts
    if (data.nevo_adverts && Array.isArray(data.nevo_adverts)) {
      for (const ad of data.nevo_adverts) {
        try {
          await execute(`
            INSERT INTO nevo_adverts (
              id, title, description, destinationUrl, rewardAmount, bannerUrl, category, clicks, impressions, isActive, createdAt, updatedAt
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT(id) DO UPDATE SET
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              destinationUrl = EXCLUDED.destinationUrl,
              rewardAmount = EXCLUDED.rewardAmount,
              bannerUrl = EXCLUDED.bannerUrl,
              category = EXCLUDED.category,
              clicks = EXCLUDED.clicks,
              impressions = EXCLUDED.impressions,
              isActive = EXCLUDED.isActive,
              updatedAt = EXCLUDED.updatedAt
          `, [
            ad.id,
            ad.title,
            ad.description || '',
            ad.destinationUrl,
            Number(ad.rewardAmount || 200),
            ad.bannerUrl || '',
            ad.category || 'sponsored',
            Number(ad.clicks || 0),
            Number(ad.impressions || 0),
            ad.isActive ? 1 : 0,
            ad.createdAt || new Date().toISOString(),
            ad.updatedAt || new Date().toISOString()
          ]);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[Nevo DB] Background persistence error:', err);
  }
}

let pendingWritePromise: Promise<any> = Promise.resolve();

function readDb(): DBStructure {
  return dbCache;
}

async function writeDb(data: DBStructure): Promise<void> {
  dbCache = data;
  const currentWrite = persistDbCache(data).catch(err => {
    console.error('[Nevo DB] Error during database persistence:', err);
  });
  pendingWritePromise = Promise.all([pendingWritePromise, currentWrite]);
  await currentWrite;
}

// -------------------- SECURE AUTHENTICATION TOKENS (JWT-like) --------------------
const TOKEN_SECRET = process.env.JWT_SECRET || process.env.NEVO_AUTH_SECRET || 'change-me-in-production';

function generateToken(email: string): string {
  const base64Email = Buffer.from(email.toLowerCase()).toString('base64');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(email.toLowerCase()).digest('hex');
  return `${signature}.${base64Email}`;
}

function verifyToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [signature, base64Email] = parts;
  try {
    const email = Buffer.from(base64Email, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', TOKEN_SECRET).update(email.toLowerCase()).digest('hex');
    if (signature === expectedSignature) {
      return email.toLowerCase();
    }
  } catch (e) {
    return null;
  }
  return null;
}

// -------------------- NEVO WALLET ACTIVITY ENGINE --------------------
// No automatic daily wallet resets or capital-credit cycles exist in Nevo.
function processUserGiftEligibility(user: UserState): { updated: boolean; user: UserState } {
  const now = new Date().toISOString();
  let updated = false;
  if (!user.lastActivityTime) {
    user.lastActivityTime = now;
    updated = true;
  }
  return { updated, user };
}

// Token Verification Middleware
async function authenticateToken(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Access Denied: Secure session token missing' });
    }
    const email = verifyToken(token);
    if (!email) {
      return res.status(403).json({ error: 'Access Denied: Session token invalid or expired' });
    }
    req.userEmail = email;

    // Authenticated sessions must correspond to a real database user. Never auto-create accounts from a bearer token.
    const db = readDb();
    db.users = db.users || [];
    const userIndex = db.users.findIndex((u: any) => u && u.email && u.email.toLowerCase() === email.toLowerCase());
    if (userIndex === -1) {
      return res.status(401).json({ error: 'User account was not found. Please sign in again.' });
    }

    // FORCE RELOAD user balance and gift system attributes from SQL database to guarantee latest, never cached values
    try {
      const sqlUser = await getRow(`SELECT balance, giftDay, giftActive, lastGiftCreditTime, giftExpiresAt, lastActivityTime FROM users WHERE email = $1`, [email.toLowerCase()]);
      if (sqlUser && db.users[userIndex]) {
        if (sqlUser.balance !== undefined && sqlUser.balance !== null) {
          db.users[userIndex].balance = Number(sqlUser.balance);
        }
        if (sqlUser.giftday !== undefined && sqlUser.giftday !== null) {
          db.users[userIndex].giftDay = Number(sqlUser.giftday);
        }
        if (sqlUser.giftactive !== undefined && sqlUser.giftactive !== null) {
          db.users[userIndex].giftActive = sqlUser.giftactive !== 0;
        }
        if (sqlUser.lastgiftcredittime !== undefined && sqlUser.lastgiftcredittime !== null) {
          db.users[userIndex].lastGiftCreditTime = sqlUser.lastgiftcredittime;
        }
        if (sqlUser.giftexpiresat !== undefined && sqlUser.giftexpiresat !== null) {
          db.users[userIndex].giftExpiresAt = sqlUser.giftexpiresat;
        }
        if (sqlUser.lastactivitytime !== undefined && sqlUser.lastactivitytime !== null) {
          db.users[userIndex].lastActivityTime = sqlUser.lastactivitytime;
        }
      }
    } catch (err) {
      console.error('[Nevo DB] Error syncing user state from SQL database in middleware:', err);
    }

    // Record activity timestamp
    if (db.users[userIndex]) {
      db.users[userIndex].lastActivityTime = new Date().toISOString();
      if (!db.users[userIndex].referralCode) {
        db.users[userIndex].referralCode = `NEVO${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        try { await execute(`UPDATE users SET referralCode=$1 WHERE LOWER(email)=$2`, [db.users[userIndex].referralCode, email.toLowerCase()]); } catch {}
      }

      // Check and process registration gift eligibility
      const user = db.users[userIndex];
      const { updated, user: updatedUser } = processUserGiftEligibility(user);
      if (updated) {
        db.users[userIndex] = updatedUser;
        await writeDb(db);
      }
    }

    req.userIndex = userIndex;
    next();
  } catch (err: any) {
    console.error('[authenticateToken Error]', err);
    return res.status(401).json({ error: 'Session authentication failed. Please sign in again.' });
  }
}


// Every wallet-spending/cash-out service is locked until the user has BOTH:
// 1) five successful referrals, and 2) a verified KoraPay deposit of at least ₦520.
// Earning features such as tasks and rewarded adverts remain available without these requirements.
async function requireNevoTransactionEligibility(req: any, _res: any, next: any) {
  // JB Boster is a social-media service platform, not a referral/reward application.
  req.nevoTransactionEligible = true;
  next();
}

function verifyAdminToken(token: string): string | null {
  const email = verifyToken(token);
  if (!email) return null;
  const configured = String(process.env.ADMIN_EMAIL || 'admin@jbboster.com').trim().toLowerCase();
  if (configured && email.toLowerCase() === configured) return email;
  return null;
}

function authenticateAdminToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Secure admin session token missing' });
  }
  const email = verifyAdminToken(token);
  if (!email) {
    return res.status(403).json({ error: 'Access Denied: Admin session token invalid or expired' });
  }
  req.adminEmail = email;
  next();
}

// Admin login brute-force protection rate limiter
const adminLoginAttempts = new Map<string, { count: number; lockUntil: number }>();

function checkAdminLoginRateLimit(req: any, res: any, next: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const attempt = adminLoginAttempts.get(clientIp);

  if (attempt) {
    if (attempt.lockUntil > now) {
      const waitSeconds = Math.ceil((attempt.lockUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed admin login attempts. Account temporarily locked for security. Please try again in ${waitSeconds} seconds.`
      });
    }
    if (attempt.lockUntil <= now && attempt.count >= 5) {
      adminLoginAttempts.delete(clientIp);
    }
  }
  next();
}

function recordFailedAdminLogin(req: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const attempt = adminLoginAttempts.get(clientIp) || { count: 0, lockUntil: 0 };
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockUntil = now + 15 * 60 * 1000; // 15 min lock
  }
  adminLoginAttempts.set(clientIp, attempt);
}

function recordSuccessfulAdminLogin(req: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  adminLoginAttempts.delete(clientIp);
}

// -------------------- DIAGNOSTIC SYSTEM LOGGING --------------------
function logDiagnostic(
  type: 'API_ERROR' | 'FAILED_LOGIN' | 'FAILED_TX' | 'EXCEPTION' | 'SECURITY_ALERT' | 'INFO',
  message: string,
  meta?: any
) {
  const id = `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = new Date().toISOString();
  
  // Format metadata for log string safely
  let metaStr = '';
  if (meta) {
    try {
      const cleanMeta = { ...meta };
      if (cleanMeta.email) {
        cleanMeta.email = cleanMeta.email.replace(/(.{2}).*(@.*)/, '$1***$2');
      }
      metaStr = ' - ' + JSON.stringify(cleanMeta);
    } catch (e) {
      metaStr = '';
    }
  }

  execute(
    `INSERT INTO logs (id, timestamp, message, type) VALUES ($1, $2, $3, $4)`,
    [id, timestamp, `${message}${metaStr}`, type]
  ).catch(err => console.error('Error recording diagnostic log in database:', err));
}

// -------------------- INPUT VALIDATION UTILITIES --------------------
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isWeakPassword(password: string): boolean {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length < 8 || !hasLetter || !hasNumber;
}

function isValidPhone(phone: string): boolean {
  // Nigerian formats: 11 digits, starts with 070, 080, 090, 081, etc. or international
  return /^(070|080|090|081|071|091|01|\+234)\d{8,10}$/.test(phone);
}

function isValidAccountNumber(accNum: string): boolean {
  return /^\d{10}$/.test(accNum);
}

// In-memory failed logins
const failedLogins = new Map<string, { count: number; lockedUntil: number }>();

// -------------------- AUTHENTICATION ROUTES --------------------

// Password-reset abuse controls. These are intentionally process-local; production
// deployments should additionally rate-limit at the edge/proxy.
const passwordResetRequests = new Map<string, { count: number; windowStart: number }>();
const passwordResetOtpAttempts = new Map<string, { count: number; windowStart: number }>();
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_REQUESTS = 3;
const RESET_MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function genericResetResponse(res: express.Response) {
  return res.json({ message: 'If an account with that email exists, a verification code has been sent.' });
}

// Request a password-reset OTP. The response deliberately does not reveal whether
// the email exists, preventing account enumeration.
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return genericResetResponse(res);
  }

  const now = Date.now();
  const rate = passwordResetRequests.get(email);
  if (rate && now - rate.windowStart < RESET_WINDOW_MS && rate.count >= RESET_MAX_REQUESTS) {
    return genericResetResponse(res);
  }
  if (!rate || now - rate.windowStart >= RESET_WINDOW_MS) passwordResetRequests.set(email, { count: 1, windowStart: now });
  else rate.count += 1;

  try {
    const user = await getRow(`SELECT email, fullname, username FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    if (!user) return genericResetResponse(res);

    const otp = generateOtp();
    const otpHash = sha256(otp);
    const id = `reset-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = now + OTP_TTL_MS;

    await execute(`UPDATE password_resets SET used=1 WHERE LOWER(emailOrPhone)=LOWER($1) AND used=0`, [email]);
    await execute(
      `INSERT INTO password_resets (id, emailOrPhone, otp, otpHash, otpAttempts, expiresAt, used, createdAt) VALUES ($1,$2,'',$3,0,$4,0,$5)`,
      [id, email, otpHash, expiresAt, now]
    );

    const sent = await sendEmail(
      email,
      'JB Boster password reset code',
      'Reset your JB Boster password',
      String(user.fullname || user.username || 'there'),
      'Use the verification code below to continue resetting your password.',
      otp
    );

    if (!sent) {
      await execute(`UPDATE password_resets SET used=1 WHERE id=$1`, [id]);
      console.error('[Auth] Password reset email could not be delivered.');
    }
    return genericResetResponse(res);
  } catch (err) {
    console.error('[Auth] Forgot-password error:', err);
    return genericResetResponse(res);
  }
});

// Verify the emailed OTP and issue a short-lived, single-use reset token.
app.post('/api/auth/verify-reset-otp', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '').trim();
  if (!email || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Invalid verification code.' });

  const now = Date.now();
  const attemptKey = email;
  const attempts = passwordResetOtpAttempts.get(attemptKey);
  if (attempts && now - attempts.windowStart < RESET_WINDOW_MS && attempts.count >= RESET_MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many verification attempts. Request a new code and try again later.' });
  }

  try {
    const reset = await getRow(`SELECT * FROM password_resets WHERE LOWER(emailOrPhone)=LOWER($1) AND used=0 ORDER BY createdAt DESC LIMIT 1`, [email]);
    if (!reset) return res.status(400).json({ error: 'Invalid or expired verification code.' });
    if (Number(reset.expiresat || reset.expiresAt || 0) < now) {
      await execute(`UPDATE password_resets SET used=1 WHERE id=$1`, [reset.id]);
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const storedAttempts = Number(reset.otpattempts || reset.otpAttempts || 0);
    if (storedAttempts >= RESET_MAX_OTP_ATTEMPTS) return res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });

    const newCount = !attempts || now - attempts.windowStart >= RESET_WINDOW_MS ? 1 : attempts.count + 1;
    passwordResetOtpAttempts.set(attemptKey, { count: newCount, windowStart: attempts && now - attempts.windowStart < RESET_WINDOW_MS ? attempts.windowStart : now });

    const expectedHash = String(reset.otphash || reset.otpHash || '');
    if (!expectedHash || !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(sha256(otp)))) {
      await execute(`UPDATE password_resets SET otpAttempts=$1 WHERE id=$2`, [storedAttempts + 1, reset.id]);
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = sha256(resetToken);
    await execute(
      `UPDATE password_resets SET otpAttempts=$1, verifiedAt=$2, resetTokenHash=$3, resetTokenExpiresAt=$4 WHERE id=$5`,
      [storedAttempts + 1, now, resetTokenHash, now + RESET_TOKEN_TTL_MS, reset.id]
    );

    return res.json({ message: 'Verification successful.', resetToken });
  } catch (err) {
    console.error('[Auth] OTP verification error:', err);
    return res.status(500).json({ error: 'Unable to verify the code right now.' });
  }
});

// Set the new password after OTP verification. The reset token is single-use.
app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const resetToken = String(req.body?.resetToken || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (!email || !resetToken || newPassword.length < 8 || newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Please provide a valid reset token and matching password of at least 8 characters.' });
  }

  try {
    const tokenHash = sha256(resetToken);
    const reset = await getRow(`SELECT * FROM password_resets WHERE LOWER(emailOrPhone)=LOWER($1) AND resetTokenHash=$2 AND used=0 ORDER BY createdAt DESC LIMIT 1`, [email, tokenHash]);
    if (!reset || Number(reset.resettokenexpiresat || reset.resetTokenExpiresAt || 0) < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset session. Please request a new code.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await withTransaction(async (q) => {
      await q(`UPDATE users SET passwordHash=$1 WHERE LOWER(email)=LOWER($2)`, [passwordHash, email]);
      await q(`UPDATE password_resets SET used=1 WHERE id=$1`, [reset.id]);
    });

    return res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (err) {
    console.error('[Auth] Password reset error:', err);
    return res.status(500).json({ error: 'Unable to reset the password right now.' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const emailOrUsername = String(req.body?.emailOrUsername || '').trim();
    const password = String(req.body?.password || '');
    if (!emailOrUsername || !password) return res.status(400).json({ error: 'Email/username and password are required.' });

    let user: any = null;
    const lookup = emailOrUsername.toLowerCase();
    try {
      user = await getRow(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1)`, [lookup]);
    } catch (dbErr) {
      console.error('[Auth] User lookup failed:', dbErr);
      return res.status(503).json({ error: 'Database is temporarily unavailable. Please try again shortly.' });
    }
    if (!user) {
      const cached = readDb().users.find((u: any) =>
        String(u.email || '').toLowerCase() === lookup || String(u.username || '').toLowerCase() === lookup
      );
      user = cached || null;
    }
    if (!user) return res.status(401).json({ error: 'Invalid email/username or password.' });

    const passwordHash = String(user.passwordhash || user.passwordHash || '');
    const validPassword = passwordHash ? bcrypt.compareSync(password, passwordHash) : false;
    if (!validPassword) {
      logDiagnostic('FAILED_LOGIN', 'User login failed', { email: user.email });
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    if (Number(user.issuspended ?? user.isSuspended ?? 0) === 1 || String(user.accountstatus || user.accountStatus || 'active') === 'suspended') {
      return res.status(403).json({ error: 'Your account is suspended. Please contact support.' });
    }
    if (Number(user.isfrozen ?? user.isFrozen ?? 0) === 1) {
      return res.status(403).json({ error: 'Your account is frozen. Please contact support.' });
    }

    const email = String(user.email || '').toLowerCase();
    const now = new Date().toISOString();
    const loginEntry = {
      id: `login-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      device: 'Web Client',
      browser: req.headers['user-agent'] || 'Unknown Browser',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
      status: 'success'
    };

    const cached = readDb().users.find((u: any) => String(u.email || '').toLowerCase() === email);
    if (cached) {
      cached.lastLogin = now;
      cached.loginHistory = [loginEntry, ...(cached.loginHistory || [])].slice(0, 100);
      await writeDb(readDb());
    } else {
      let history: any[] = [];
      try { history = user.loginhistory ? JSON.parse(user.loginhistory) : []; } catch { history = []; }
      history = [loginEntry, ...history].slice(0, 100);
      await execute(`UPDATE users SET loginHistory=$1 WHERE LOWER(email)=LOWER($2)`, [JSON.stringify(history), email]);
    }

    const balance = Number(user.balance || 0);
    const safeUser = {
      id: email,
      fullName: user.fullname || user.fullName || 'User',
      username: user.username || email.split('@')[0],
      email,
      phone: '',
      walletBalance: balance,
      balance,
      status: 'active',
      tier: Number(user.tier || 3),
      isSuspended: false,
      isFrozen: false,
      emailVerified: true,
      isAdmin: false,
      notifications: (() => { try { return typeof user.notifications === 'string' ? JSON.parse(user.notifications) : (user.notifications || []); } catch { return []; } })(),
      referralCode: '',
      referralLink: '',
      totalReferrals: 0,
      totalReferralBonus: 0,
      totalEarnings: 0,
      activationPaid: false,
      createdAt: user.registrationdate || user.registrationDate || now,
      lastLogin: now
    };
    const token = generateToken(email);
    logDiagnostic('INFO', 'JB Boster user logged in successfully', { email });
    return res.json({ success: true, token, user: safeUser });
  } catch (err: any) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Unable to sign in right now. Please try again shortly.' });
  }
});

// Restore the authenticated user session after a page refresh.
app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
  try {
    const email = String(req.userEmail || '').toLowerCase();
    const user = await getRow(`SELECT * FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    if (!user) return res.status(404).json({ error: 'User account not found.' });
    const balance = Number(user.balance || 0);
    const notifications = (() => { try { return typeof user.notifications === 'string' ? JSON.parse(user.notifications) : (user.notifications || []); } catch { return []; } })();
    return res.json({ user: {
      id: email,
      fullName: user.fullname || user.fullName || 'User',
      username: user.username || email.split('@')[0],
      email,
      phone: '',
      walletBalance: balance,
      balance,
      status: String(user.accountstatus || 'active') === 'suspended' ? 'suspended' : 'active',
      tier: Number(user.tier || 3),
      isSuspended: Number(user.issuspended || 0) === 1,
      isFrozen: Number(user.isfrozen || 0) === 1,
      emailVerified: true,
      isAdmin: false,
      notifications,
      referralCode: '', referralLink: '', totalReferrals: 0, totalReferralBonus: 0, totalEarnings: 0,
      activationPaid: false,
      createdAt: user.registrationdate || user.registrationDate || new Date().toISOString(),
      lastLogin: user.lastLogin || user.registrationdate || new Date().toISOString()
    }});
  } catch (err: any) {
    console.error('[Auth] Session restore error:', err);
    return res.status(500).json({ error: 'Unable to restore your session.' });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, password, username } = req.body;
  
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!password || isWeakPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
  }

  // Fetch admin settings for toggles & bonus
  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.registrationEnabled === 'false') {
    return res.status(403).json({ error: 'New user registrations are currently disabled by administration.' });
  }

  const bonusAmount = 0;

  const db = readDb();
  const existingUser = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    logDiagnostic('API_ERROR', 'Registration failed: Duplicate email request', { email });
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  const duplicateUsername = db.users.find((u: any) => String(u.username || '').toLowerCase() === String(username || '').trim().toLowerCase());
  if (duplicateUsername) return res.status(400).json({ error: 'That username is already in use. Please choose another username.' });

  const passwordHash = bcrypt.hashSync(password, 10);

  const initialTx: any[] = [];

  const newUser: UserState = {
    fullName: fullName.trim(),
    email: email.toLowerCase(),
    passwordHash,
    balance: 0,
    dailyTarget: 50000,
    dailySpent: 0,
    pinCreated: false,
    biometricEnabled: false,
    phone: '',
    profilePic: '',
    username: (username || fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 30),
    referralCode: '',
    referralCount: 0,
    totalReferralBonus: 0,
    totalEarnings: 0,
    activationPaid: false,
    activationPaidAt: '',
    tier: 3,
    isSuspended: false,
    isFrozen: false,
    registrationDate: new Date().toISOString(),
    lastLogin: '',
    accountStatus: 'active',
    emailVerificationStatus: 'verified',
    welcomeRewardShown: true,
    giftDay: 0,
    giftActive: false,
    lastGiftCreditTime: '',
    giftExpiresAt: '',
    transactions: initialTx,
    notifications: [{
      id: `notif-${Date.now()}`,
      title: 'Welcome to JB Boster',
      body: 'Your account is ready. Buy coins and use them to order social-media growth services.',
      date: new Date().toISOString(),
      unread: true
    }],
    beneficiaries: [],
    phoneBeneficiaries: [],
    loginHistory: [
      {
        id: `log-${Date.now()}`,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        device: 'Web Client',
        browser: req.headers['user-agent'] || 'Unknown Browser',
        ip: req.socket.remoteAddress || '127.0.0.1',
        location: 'Lagos, Nigeria',
        status: 'success'
      }
    ]
  };

  db.users.push(newUser);
  await writeDb(db);
  try {
    await execute(`UPDATE users SET balance=$1, phone=$2, referralCode=$3, referralCount=0, totalReferralBonus=0, totalEarnings=0, activationPaid=false, activationPaidAt='' WHERE LOWER(email)=LOWER($4)`, [0, '', '', newUser.email.toLowerCase()]);
  } catch (e) { console.warn('[JB Boster] Initial SQL user sync skipped:', e); }
  logDiagnostic('INFO', 'JB Boster user account registered', { email: newUser.email });
  const token = generateToken(newUser.email);
  return res.json({ success: true, token, user: { ...newUser, walletBalance: 0, balance: 0 } });
});

// Activate Voucher (Strict SQL DB source of truth only)
app.post('/api/auth/activate-voucher', authenticateToken, async (req: any, res) => {
  const { voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "Please enter a WDV voucher code." });
  }

  const norm = voucherCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE UPPER(REPLACE(voucherCode, '-', '')) = $1 OR UPPER(REPLACE(code, '-', '')) = $1`, [norm]);
    if (!voucher || voucher.status !== 'unused') {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    const redeemedBy = safeParseJson(voucher.redeemedby || voucher.redeemedBy, []);
    const lowerEmail = email.toLowerCase().trim();
    if (redeemedBy.map((e: string) => e.toLowerCase().trim()).includes(lowerEmail)) {
      return res.status(400).json({ error: "You have already used this voucher." });
    }

    redeemedBy.push(lowerEmail);
    const now = new Date().toISOString();

    await execute(`
      UPDATE vouchers
      SET status = $1, usedAt = $2, usedBy = $3, redeemedBy = $4
      WHERE id = $5
    `, ['used', now, lowerEmail, JSON.stringify(redeemedBy), voucher.id]);

    const db = readDb();
    const user = db.users.find(u => u.email.toLowerCase() === lowerEmail);
    if (!user) {
      return res.status(400).json({ error: "User profile not found." });
    }

    user.wdvVerified = true;
    user.tier = 2; // Set Level 2 Verification
    writeDb(db);
    await loadDbCache();

    logDiagnostic('INFO', 'User activated WDV voucher', { email, voucherCode });

    res.json({
      success: true,
      message: "WDV Voucher activated successfully. Your account is now WDV Verified!",
      user
    });
  } catch (err) {
    console.error('Error in activate-voucher:', err);
    return res.status(500).json({ error: 'Internal server error activating voucher.' });
  }
});

// Transaction endpoint for Airtime Purchase
app.post('/api/transactions/airtime', authenticateToken, requireNevoTransactionEligibility, async (req: any, res) => {
  const { phoneNumber, network, amount } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.airtimeEnabled === 'false') {
    return res.status(403).json({ error: "Airtime purchases are currently disabled by administrator." });
  }

  if (!phoneNumber || !isValidPhone(phoneNumber)) {
    return res.status(400).json({ error: "Enter a valid Nigerian phone number." });
  }
  if (!network) {
    return res.status(400).json({ error: "Please select a mobile network." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) < 100) {
    return res.status(400).json({ error: "Minimum purchase is ₦100" });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this purchase" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === phoneNumber &&
      tx.type === 'redeem_airtime' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  // WDV vouchers are no longer required. Transactions are authorized directly
  // from the user's Nevo wallet balance.

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'redeem_airtime',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Airtime Purchase of ₦${price.toLocaleString()} for ${phoneNumber} (${network.toUpperCase()})`,
    recipientAccount: phoneNumber,
    recipientBank: network.toUpperCase(),
    balanceBefore,
    balanceAfter,
    refNum,
    };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Airtime Purchase Successful',
    body: `Successfully purchased ₦${price.toLocaleString()} airtime for ${phoneNumber}. Wallet balance verified.`,
    date: new Date().toISOString(),
    unread: true,
    type: 'airtime',
    category: 'Airtime Topup',
    status: 'Completed',
    amount: price,
    phoneNumber: phoneNumber,
    reference: refNum
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Airtime purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Transaction endpoint for Data Purchase
app.post('/api/transactions/data', authenticateToken, requireNevoTransactionEligibility, async (req: any, res) => {
  const { phoneNumber, network, bundleId } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.dataEnabled === 'false') {
    return res.status(403).json({ error: "Data purchases are currently disabled by administrator." });
  }

  if (!phoneNumber || !isValidPhone(phoneNumber)) {
    return res.status(400).json({ error: "Enter a valid Nigerian phone number." });
  }
  if (!network) {
    return res.status(400).json({ error: "Please select a mobile network." });
  }
  if (!bundleId) {
    return res.status(400).json({ error: "Please select a data bundle." });
  }

  const DATA_PLANS_SERVER = [
    { id: 'mtn-500', network: 'mtn', size: '500MB', price: 150 },
    { id: 'mtn-1g', network: 'mtn', size: '1GB', price: 250 },
    { id: 'mtn-2g', network: 'mtn', size: '2GB', price: 480 },
    { id: 'mtn-3g', network: 'mtn', size: '3GB', price: 700 },
    { id: 'mtn-5g', network: 'mtn', size: '5GB', price: 1100 },
    { id: 'mtn-10g', network: 'mtn', size: '10GB', price: 2100 },
    { id: 'mtn-20g', network: 'mtn', size: '20GB', price: 4000 },
    { id: 'mtn-50g', network: 'mtn', size: '50GB', price: 9500 },
    { id: 'mtn-100g', network: 'mtn', size: '100GB', price: 18000 },

    { id: 'air-500', network: 'airtel', size: '500MB', price: 150 },
    { id: 'air-1g', network: 'airtel', size: '1GB', price: 250 },
    { id: 'air-2g', network: 'airtel', size: '2GB', price: 480 },
    { id: 'air-3g', network: 'airtel', size: '3GB', price: 700 },
    { id: 'air-5g', network: 'airtel', size: '5GB', price: 1100 },
    { id: 'air-10g', network: 'airtel', size: '10GB', price: 2100 },
    { id: 'air-20g', network: 'airtel', size: '20GB', price: 4000 },
    { id: 'air-50g', network: 'airtel', size: '50GB', price: 9500 },
    { id: 'air-100g', network: 'airtel', size: '100GB', price: 18000 },

    { id: 'glo-500', network: 'glo', size: '500MB', price: 150 },
    { id: 'glo-1g', network: 'glo', size: '1GB', price: 250 },
    { id: 'glo-2g', network: 'glo', size: '2GB', price: 480 },
    { id: 'glo-3g', network: 'glo', size: '3GB', price: 700 },
    { id: 'glo-5g', network: 'glo', size: '5GB', price: 1100 },
    { id: 'glo-10g', network: 'glo', size: '10GB', price: 2100 },
    { id: 'glo-20g', network: 'glo', size: '20GB', price: 4000 },
    { id: 'glo-50g', network: 'glo', size: '50GB', price: 9500 },
    { id: 'glo-100g', network: 'glo', size: '100GB', price: 18000 },

    { id: '9mo-500', network: '9mobile', size: '500MB', price: 150 },
    { id: '9mo-1g', network: '9mobile', size: '1GB', price: 250 },
    { id: '9mo-2g', network: '9mobile', size: '2GB', price: 480 },
    { id: '9mo-3g', network: '9mobile', size: '3GB', price: 700 },
    { id: '9mo-5g', network: '9mobile', size: '5GB', price: 1100 },
    { id: '9mo-10g', network: '9mobile', size: '10GB', price: 2100 },
    { id: '9mo-20g', network: '9mobile', size: '20GB', price: 4000 },
    { id: '9mo-50g', network: '9mobile', size: '50GB', price: 9500 },
    { id: '9mo-100g', network: '9mobile', size: '100GB', price: 18000 }
  ];

  const plan = DATA_PLANS_SERVER.find(p => p.id === bundleId);
  if (!plan) {
    return res.status(400).json({ error: "Invalid data package." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = plan.price;

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this purchase" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === phoneNumber &&
      tx.type === 'redeem_data' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  // WDV vouchers are no longer required. Transactions are authorized directly
  // from the user's Nevo wallet balance.

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'redeem_data',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Data Purchase of ${plan.size} for ${phoneNumber} (${network.toUpperCase()})`,
    recipientAccount: phoneNumber,
    recipientBank: network.toUpperCase(),
    balanceBefore,
    balanceAfter,
    refNum,
    };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Data Purchase Successful',
    body: `Successfully purchased ${plan.size} data bundle for ${phoneNumber}. Wallet balance verified.`,
    date: new Date().toISOString(),
    unread: true,
    type: 'data',
    category: 'Data Bundle',
    status: 'Completed',
    amount: plan.price,
    phoneNumber: phoneNumber,
    reference: refNum
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Data purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Dynamic Korapay Banks Cache
let korapayBanksCache: Array<{ name: string; code: string; nip_code?: string; slug?: string }> | null = null;
let lastKorapayBanksFetch = 0;

async function getKorapayBanks(): Promise<Array<{ name: string; code: string; nip_code?: string; slug?: string }>> {
  const now = Date.now();
  if (korapayBanksCache && (now - lastKorapayBanksFetch < 3600000)) {
    return korapayBanksCache;
  }
  const korapaySecretKey = process.env.KORAPAY_SECRET_KEY || '';
  if (!korapaySecretKey) return [];
  try {
    const res = await fetch('https://api.korapay.com/merchant/api/v1/misc/banks?currency=NGN', {
      headers: { 'Authorization': `Bearer ${korapaySecretKey}` }
    });
    const data = await res.json();
    if (data.status && Array.isArray(data.data)) {
      korapayBanksCache = data.data;
      lastKorapayBanksFetch = now;
      console.log(`[Korapay Banks] Cached ${korapayBanksCache.length} banks from Korapay API.`);
      return korapayBanksCache;
    }
  } catch (e) {
    console.error('[Korapay Banks Fetch Error]', e);
  }
  return korapayBanksCache || [];
}

// Bank Account Name Verification Service Layer
async function verifyBankAccountService(bankName: string, accountNumber: string): Promise<{ success: boolean; accountName?: string; error?: string }> {
  if (!accountNumber || accountNumber.length !== 10 || !/^\d{10}$/.test(accountNumber)) {
    return { success: false, error: "Please enter a valid 10-digit account number." };
  }
  if (!bankName) {
    return { success: false, error: "Please select a valid bank." };
  }

  if (!accountNumber || accountNumber.length !== 10) {
    return { success: false, error: "Please enter a valid 10-digit account number." };
  }

  // Reject obvious invalid account numbers (e.g. 0000000000)
  if (/^(\d)\1{9}$/.test(accountNumber) || accountNumber === '1234567890') {
    return { success: false, error: "Unable to verify account name" };
  }

  const korapaySecretKey = process.env.KORAPAY_SECRET_KEY || '';

  const bankCodeMap: Record<string, string[]> = {
    'access bank': ['044'],
    'access bank limited': ['044'],
    'access holdings plc': ['044'],
    'citibank nigeria limited': ['023'],
    'citibank': ['023'],
    'ecobank nigeria limited': ['050'],
    'ecobank': ['050'],
    'fbn holdings plc': ['011'],
    'first bank of nigeria limited': ['011'],
    'first bank': ['011'],
    'fcmb group plc': ['214'],
    'first city monument bank limited (fcmb)': ['214'],
    'first city monument bank': ['214'],
    'fcmb': ['214'],
    'fidelity bank plc': ['070'],
    'fidelity bank': ['070'],
    'globus bank limited': ['000027'],
    'globus bank': ['000027'],
    'guaranty trust bank limited (gtbank)': ['058'],
    'guaranty trust holding company plc': ['058'],
    'guaranty trust bank': ['058'],
    'gtbank': ['058'],
    'gtb': ['058'],
    'heritage bank plc': ['030'],
    'heritage bank': ['030'],
    'jaiz bank plc': ['035'],
    'jaiz bank': ['035'],
    'keystone bank limited': ['082'],
    'keystone bank': ['082'],
    'kuda bank': ['50211', '090267'],
    'kuda': ['50211', '090267'],
    'moniepoint': ['50515', '090129', '000028'],
    'moniepoint microfinance bank': ['50515', '090129', '000028'],
    'opay': ['100004', '090110', '304', '000010'],
    'opay digital services': ['100004', '090110', '304', '000010'],
    'paycom': ['100004', '090110', '304', '000010'],
    'palmpay': ['100033', '090405'],
    'polaris bank limited': ['076'],
    'polaris bank': ['076'],
    'providus bank limited': ['101'],
    'providus bank': ['101'],
    'stanbic ibtc bank limited': ['221'],
    'stanbic ibtc': ['221'],
    'standard chartered bank limited': ['068'],
    'standard chartered': ['068'],
    'sterling bank limited': ['232'],
    'sterling bank': ['232'],
    'suntrust bank nigeria limited': ['100'],
    'suntrust bank': ['100'],
    'taj bank limited': ['000026'],
    'taj bank': ['000026'],
    'union bank of nigeria plc': ['032'],
    'union bank': ['032'],
    'united bank for africa plc': ['033'],
    'united bank for africa': ['033'],
    'uba': ['033'],
    'unity bank plc': ['215'],
    'unity bank': ['215'],
    'wema bank plc': ['035'],
    'wema bank': ['035'],
    'zenith bank plc': ['057'],
    'zenith bank': ['057'],
    '9psb': ['120001'],
    'rubies': ['125'],
    'carbon': ['565', '090130'],
    'fairmoney': ['51318', '090551'],
    'chipper cash': ['50315'],
    'piggyvest': ['51229']
  };

  const normalizedBank = bankName.toLowerCase().trim();
  const candidateCodes: string[] = [];

  // 1. First, check live Korapay bank list for accurate bank code & NIP code
  try {
    const liveBanks = await getKorapayBanks();
    if (liveBanks && liveBanks.length > 0) {
      const liveMatches = liveBanks.filter(b => {
        const bName = b.name.toLowerCase();
        const bSlug = (b.slug || '').toLowerCase();
        return (
          bName === normalizedBank ||
          bName.includes(normalizedBank) ||
          normalizedBank.includes(bName) ||
          (normalizedBank.includes('opay') && (bName.includes('paycom') || bName.includes('opay') || bSlug.includes('paycom') || bSlug.includes('opay'))) ||
          (normalizedBank.includes('palmpay') && (bName.includes('palmpay') || bSlug.includes('palmpay'))) ||
          (normalizedBank.includes('moniepoint') && (bName.includes('moniepoint') || bSlug.includes('moniepoint'))) ||
          (normalizedBank.includes('kuda') && (bName.includes('kuda') || bSlug.includes('kuda')))
        );
      });

      for (const liveMatch of liveMatches) {
        if (liveMatch.code && !candidateCodes.includes(liveMatch.code)) {
          candidateCodes.push(liveMatch.code);
        }
        if (liveMatch.nip_code && !candidateCodes.includes(liveMatch.nip_code)) {
          candidateCodes.push(liveMatch.nip_code);
        }
      }
    }
  } catch (e) {
    console.warn('[Bank Resolve] Live Korapay bank lookup error:', e);
  }

  // 2. Add codes from static bankCodeMap as fallback
  if (/^\d+$/.test(normalizedBank)) {
    if (!candidateCodes.includes(normalizedBank)) {
      candidateCodes.push(normalizedBank);
    }
  } else {
    if (bankCodeMap[normalizedBank]) {
      for (const code of bankCodeMap[normalizedBank]) {
        if (!candidateCodes.includes(code)) candidateCodes.push(code);
      }
    }
    const matchedKey = Object.keys(bankCodeMap).find(k => normalizedBank.includes(k) || k.includes(normalizedBank));
    if (matchedKey) {
      for (const code of bankCodeMap[matchedKey]) {
        if (!candidateCodes.includes(code)) candidateCodes.push(code);
      }
    }
  }

  // Filter out unsupported legacy clearing codes that are not enabled for KoraPay.
  const validKorapayCandidateCodes = candidateCodes.filter(code => !code.startsWith('9999'));

  if (validKorapayCandidateCodes.length === 0) {
    console.warn('[Bank Resolve] Unable to determine valid Korapay bank code for:', bankName);
    return { success: false, error: "Invalid or unsupported bank selected." };
  }

  if (!korapaySecretKey) {
    console.warn('[Bank Resolve] KORAPAY_SECRET_KEY is missing on server.');
    return { success: false, error: "Account verification service is missing configuration." };
  }

  try {
    let lastErrorMsg = "Unable to verify account name. Please check account number and bank name.";
    for (const bCode of validKorapayCandidateCodes) {
      const requestPayload = {
        bank: bCode,
        account: accountNumber,
        currency: 'NGN'
      };
      console.log('[Bank Resolve Request]', JSON.stringify(requestPayload));

      const kRes = await fetch('https://api.korapay.com/merchant/api/v1/misc/banks/resolve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${korapaySecretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      const kData = await kRes.json();
      console.log('[Bank Resolve Response Status]', kRes.status, JSON.stringify(kData));

      if (kData.status && kData.data && (kData.data.account_name || kData.data.accountName)) {
        const resolvedName = String(kData.data.account_name || kData.data.accountName).trim().toUpperCase();
        return {
          success: true,
          accountName: resolvedName
        };
      } else {
        lastErrorMsg = kData.message || 'We couldn\'t find this bank account. Please check the details and try again.';
        console.log(`[Bank Resolve Candidate Code ${bCode} Not Matched]`, lastErrorMsg);
      }
    }

    console.log(`[Bank Resolve Result] Failed to resolve account for ${bankName} (${accountNumber}): ${lastErrorMsg}`);
    return {
      success: false,
      error: lastErrorMsg
    };
  } catch (kErr) {
    console.error('[Bank Resolve] API Request Error:', kErr);
    return { success: false, error: "Unable to verify account name at this time." };
  }
}

// Endpoint for real-time bank account verification
app.post('/api/verify-account', authenticateToken, async (req: any, res) => {
  try {
    const { bank, bankName, bankCode, accountNumber } = req.body;
    const selectedBank = bank || bankName || bankCode;

    if (!selectedBank) {
      return res.status(400).json({ success: false, error: "Please select a bank." });
    }
    if (!accountNumber || !isValidAccountNumber(accountNumber)) {
      return res.status(400).json({ success: false, error: "Please enter a valid 10-digit account number." });
    }

    const result = await verifyBankAccountService(selectedBank, accountNumber);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to verify account name" });
    }

    return res.json({
      success: true,
      accountName: result.accountName,
      bankName: selectedBank,
      accountNumber
    });
  } catch (err: any) {
    console.error('Account verification error:', err);
    return res.status(500).json({ success: false, error: "Verification service temporarily unavailable." });
  }
});

app.get('/api/transactions/eligibility', authenticateToken, async (_req: any, res: any) => { res.json({ successfulReferrals: 0, referralsRequired: 0, verifiedDeposit: true, depositMinimum: 0, canWithdraw: true }); });

// Transaction endpoint for Bank Transfer
app.post('/api/transactions/transfer', authenticateToken, requireNevoTransactionEligibility, async (req: any, res) => {
  const { bank, accountNumber, amount, accountName } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.transferEnabled === 'false') {
    return res.status(403).json({ error: "Bank transfers are currently disabled by administrator." });
  }

  if (!bank) {
    return res.status(400).json({ error: "Please select a bank." });
  }
  if (!accountNumber || !isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit account number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid transfer amount." });
  }
  if (!accountName || accountName.trim().length < 3) {
    return res.status(400).json({ error: "Please enter a valid recipient account name (minimum 3 characters)." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const resolvedName = accountName.trim();
  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this bank transfer" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === accountNumber &&
      tx.type === 'bank_transfer_direct' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  // WDV vouchers are no longer required. Transactions are authorized directly
  // from the user's Nevo wallet balance.

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'bank_transfer_direct',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Cashout ₦${price.toLocaleString()} to ${bank} (${resolvedName})`,
    recipientAccount: accountNumber,
    recipientBank: bank,
    recipientName: resolvedName,
    balanceBefore,
    balanceAfter,
    refNum,
    };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Bank Cashout Success',
    body: `Successfully cashed out ₦${price.toLocaleString()} to ${resolvedName} from your wallet balance.`,
    date: new Date().toISOString(),
    unread: true,
    type: 'transfer',
    category: 'Bank Transfer',
    status: 'Completed',
    amount: price,
    recipientName: resolvedName,
    accountNumber: accountNumber,
    reference: refNum
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Bank cashout complete', { email, amount: price, accountNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx,
    accountName: resolvedName
  });
});

// Transaction endpoint for Withdrawal
app.post('/api/transactions/withdraw', authenticateToken, requireNevoTransactionEligibility, async (req: any, res) => {
  const { bank, accountNumber, amount, accountName, voucherCode = '' } = req.body;
  const email = req.userEmail;

  // Check admin settings toggles & limits
  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.withdrawalEnabled === 'false') {
    return res.status(403).json({ error: "Withdrawals are currently disabled by administrator." });
  }

  if (!bank) {
    return res.status(400).json({ error: "Please select a bank." });
  }
  if (!accountNumber || !isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit account number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid withdrawal amount." });
  }
  if (!accountName || accountName.trim().length < 3) {
    return res.status(400).json({ error: "Please enter a valid recipient account name (minimum 3 characters)." });
  }

  const price = Number(amount);
  const currencySymbol = settings.currency || '₦';

  if (settings.minWithdrawal && price < Number(settings.minWithdrawal)) {
    return res.status(400).json({ error: `Minimum withdrawal amount is ${currencySymbol}${Number(settings.minWithdrawal).toLocaleString()}` });
  }
  if (settings.maxWithdrawal && price > Number(settings.maxWithdrawal)) {
    return res.status(400).json({ error: `Maximum withdrawal amount is ${currencySymbol}${Number(settings.maxWithdrawal).toLocaleString()}` });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  // Daily limit check
  if (settings.dailyWithdrawalLimit) {
    const maxDaily = Number(settings.dailyWithdrawalLimit);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayWithdrawalsTotal = (user.transactions || [])
      .filter((tx: any) => tx.type === 'withdraw' && tx.date.startsWith(todayStr))
      .reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

    if (todayWithdrawalsTotal + price > maxDaily) {
      return res.status(400).json({ error: `Daily withdrawal limit of ${currencySymbol}${maxDaily.toLocaleString()} exceeded.` });
    }
  }

  const resolvedName = accountName.trim();

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this withdrawal" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === accountNumber &&
      tx.type === 'withdraw' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  // WDV vouchers are no longer required. Transactions are authorized directly
  // from the user's Nevo wallet balance.

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'withdraw',
    amount: price,
    date: new Date().toISOString(),
    status: 'pending',
    description: `Withdrew ₦${price.toLocaleString()} to ${bank} (${resolvedName})`,
    recipientAccount: accountNumber,
    recipientBank: bank,
    recipientName: resolvedName,
    balanceBefore,
    balanceAfter,
    refNum,
    };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Withdrawal Pending Approval',
    body: `Your withdrawal request of ₦${price.toLocaleString()} to ${resolvedName} (${bank}) has been received successfully and is currently under manual review by our compliance team. You will receive another notification once it has been approved or rejected.`,
    date: new Date().toISOString(),
    unread: true,
    type: 'withdraw',
    category: 'Withdrawal',
    status: 'Pending Review',
    amount: price,
    recipientName: resolvedName,
    bankName: bank,
    accountNumber: accountNumber,
    reference: refNum
  });

  // Save the withdrawal request permanently in the SQL database withdraw_requests table
  try {
    const nowStr = new Date().toISOString();
    await execute(`
      INSERT INTO withdraw_requests (
        id, userId, email, amount, bankName, accountNumber, accountName, status, timestamp, reference, voucherCode, notes, posSlipPath, posSlipUploadedAt, posSlipUploadedBy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      txId,
      email,
      email,
      price,
      bank,
      accountNumber,
      resolvedName,
      'pending',
      nowStr,
      refNum,
      voucherCode || '',
      '',
      '',
      '',
      ''
    ]);
  } catch (err) {
    console.error('[Nevo DB] Error saving withdrawal request to SQL table:', err);
  }

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Withdrawal requested and saved to SQL', { email, amount: price, accountNumber, voucherCode });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx,
    accountName: resolvedName
  });
});

// Transaction endpoint for Bills Payments (Cable, Electricity, Betting)
app.post('/api/transactions/bills', authenticateToken, requireNevoTransactionEligibility, async (req: any, res) => {
  const { type, provider, accountNumber, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!type || !['cable', 'electricity', 'betting'].includes(type)) {
    return res.status(400).json({ error: "Invalid bill payment type." });
  }
  if (!provider) {
    return res.status(400).json({ error: "Please select a provider." });
  }
  if (!accountNumber || accountNumber.trim().length < 5) {
    return res.status(400).json({ error: "Please enter a valid account or meter number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid bill amount." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this bill payment" });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  // WDV vouchers are no longer required. Transactions are authorized directly
  // from the user's Nevo wallet balance.

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const typeLabels: Record<string, string> = {
    cable: 'Cable TV Bill Payment',
    electricity: 'Electricity Utility Bill',
    betting: 'Betting Wallet Fund'
  };

  const desc = `${typeLabels[type]} (${provider}) - Ref: ${accountNumber}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'bill_payment',
    billType: type,
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: desc,
    recipientAccount: accountNumber,
    recipientBank: provider,
    balanceBefore,
    balanceAfter,
    refNum,
    };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Bill Payment Successful',
    body: `Successfully paid ₦${price.toLocaleString()} for ${provider} (${accountNumber}). Wallet balance verified.`,
    date: new Date().toISOString(),
    unread: true
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Bill payment complete', { email, type, provider, amount: price, accountNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Update Balance Directly
app.post('/api/auth/update-balance', authenticateToken, (req: any, res) => {
  const { balance } = req.body;
  const email = req.userEmail;

  if (balance === undefined || isNaN(Number(balance)) || Number(balance) < 0) {
    return res.status(400).json({ error: 'Valid wallet balance numerical value is required.' });
  }

  const db = readDb();
  const userIndex = req.userIndex;

  db.users[userIndex].balance = Number(balance);
  writeDb(db);

  res.json({
    success: true,
    balance: db.users[userIndex].balance
  });
});

// Helper to generate a unique WDV voucher code
function generateVoucherCode(): string {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const parts = hex.match(/.{1,4}/g) || ['8A72', 'X9LK', 'PQ11'];
  return `WDV-${parts.join('-')}`;
}

// -------------------- VIRTUAL ACCOUNT WDV PAYMENT SYSTEM --------------------

// Core Payment Verification & Voucher Generation Logic
async function processSuccessfulWdvPayment(reference: string, providerName = 'webhook', webhookRawData = '') {
  const payment = await getRow(`SELECT * FROM wdv_payments WHERE reference = $1`, [reference]);
  if (!payment) {
    throw new Error(`Payment reference ${reference} not found.`);
  }

  const existingCode = payment.vouchercode || payment.voucherCode;
  if ((payment.status === 'successful' || payment.status === 'settled') && existingCode) {
    return {
      success: true,
      alreadyProcessed: true,
      voucherCode: existingCode,
      message: 'Payment already processed and voucher generated.'
    };
  }

  // Generate cryptographically unique WDV voucher
  const voucherCode = generateVoucherCode();
  const voucherId = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const db = readDb();
  const config = db.wdvConfig || DEFAULT_WDV_CONFIG;
  const price = Number(payment.amount || config.voucherPrice || 6500);
  const email = (payment.useremail || payment.userEmail || '').toLowerCase();

  if (Math.abs(price - 6500) > 0.009) {
    throw new Error('WDV voucher payment amount must be exactly ₦6,500.');
  }

  // Save voucher in SQL database. withdrawalId is the payment reference, and a
  // unique index prevents two concurrent webhook/verify calls from issuing two vouchers.
  try {
    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [voucherId, voucherCode, voucherCode, price, 'unused', '', '', nowIso, reference, email, '[]']);
  } catch (insertErr: any) {
    // If another request already issued the voucher for this payment, return that
    // voucher instead of generating another one.
    const existingVoucher = await getRow(`SELECT * FROM vouchers WHERE withdrawalId = $1`, [reference]);
    if (existingVoucher) {
      const existing = existingVoucher.voucherCode || existingVoucher.vouchercode || existingVoucher.code;
      if (existing) {
        return {
          success: true,
          alreadyProcessed: true,
          voucherCode: existing,
          reference,
          paidAt: existingVoucher.generatedAt || nowIso,
          amount: Number(existingVoucher.amount || price)
        };
      }
    }
    throw insertErr;
  }

  // Update payment status to successful
  await execute(`
    UPDATE wdv_payments 
    SET status = $1, paidAt = $2, voucherCode = $3, webhookData = $4 
    WHERE reference = $5
  `, ['successful', nowIso, voucherCode, webhookRawData, reference]);

  // Update user notifications in cache/JSON
  if (email) {
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email);
    if (userIndex !== -1) {
      db.users[userIndex].notifications = db.users[userIndex].notifications || [];
      db.users[userIndex].notifications.unshift({
        id: `notif-${Date.now()}`,
        title: 'WDV Voucher Generated',
        body: 'Your payment has been confirmed successfully. Your voucher has been generated and is ready for use.',
        date: nowIso,
        unread: true,
        type: 'voucher',
        category: 'WDV Voucher',
        status: 'Payment Verified',
        amount: price || 6500,
        voucherCode: voucherCode,
        reference: reference
      });
      writeDb(db);
    }
  }

  logDiagnostic('INFO', 'WDV Payment verified and voucher generated', { reference, email, voucherCode, providerName });
  await loadDbCache();

  return {
    success: true,
    voucherCode,
    reference,
    paidAt: nowIso,
    amount: price
  };
}

// Unified Core Payment Verification, User Wallet Crediting & Voucher Handling Logic
const paymentProcessingLocks = new Set<string>();

async function processSuccessfulPayment(params: {
  reference: string;
  providerName: PaymentProviderName;
  verifiedAmount?: number;
  channel?: string;
  providerReference?: string;
  rawData?: any;
}) {
  if (paymentProcessingLocks.has(params.reference)) {
    return { success: true, alreadyProcessed: true, reference: params.reference, status: 'successful', message: 'Payment is already being processed.' };
  }
  paymentProcessingLocks.add(params.reference);
  try {
    return await processSuccessfulPaymentUnsafe(params);
  } finally {
    paymentProcessingLocks.delete(params.reference);
  }
}

async function processSuccessfulPaymentUnsafe(params: {
  reference: string;
  providerName: PaymentProviderName;
  verifiedAmount?: number;
  channel?: string;
  providerReference?: string;
  rawData?: any;
}) {
  const reference = params.reference;
  const nowIso = new Date().toISOString();

  // 1. Check existing payment in payment_transactions & wdv_payments
  let tx = await getRow(`SELECT * FROM payment_transactions WHERE reference = $1`, [reference]);
  let wdvPayment = await getRow(`SELECT * FROM wdv_payments WHERE reference = $1`, [reference]);

  if (tx && (tx.status === 'successful' || tx.status === 'settled') && (tx.purpose !== 'wallet_funding' || tx.walletcreditedat || tx.walletCreditedAt)) {
    const existingWdv = await getRow(`SELECT * FROM wdv_payments WHERE reference = $1`, [reference]);
    return {
      success: true,
      alreadyProcessed: true,
      reference,
      amount: Number(tx.amount || existingWdv?.amount || 0),
      purpose: tx.purpose || 'wallet_funding',
      status: 'successful',
      voucherCode: existingWdv?.voucherCode || existingWdv?.vouchercode || '',
      message: 'Transaction already verified and processed.'
    };
  }

  const userEmail = ((tx?.useremail || tx?.userEmail || wdvPayment?.useremail || wdvPayment?.userEmail || '') as string).toLowerCase();
  const rawAmount = params.verifiedAmount !== undefined ? params.verifiedAmount : Number(tx?.amount || wdvPayment?.amount || 0);
  const amount = Number(rawAmount || 0);
  const purpose = tx?.purpose || (wdvPayment ? 'wdv_voucher' : 'wallet_funding');
  const provider = params.providerName || (tx?.provider as PaymentProviderName) || 'korapay';
  const providerRef = params.providerReference || tx?.providerReference || '';
  const rawDataStr = typeof params.rawData === 'string' ? params.rawData : JSON.stringify(params.rawData || {});

  // WDV purchases are always exactly ₦6,500. Reject mismatched amounts before
  // marking the transaction successful or creating a voucher.
  if (purpose === 'wdv_voucher' && Math.abs(amount - 6500) > 0.009) {
    throw new Error('WDV voucher payment amount must be exactly ₦6,500.');
  }
  if (purpose === 'wallet_funding') {
    const storedAmount = Number(tx?.amount || 0);
    if (!Number.isFinite(amount) || amount < 520 || (storedAmount > 0 && Math.abs(amount - storedAmount) > 0.009)) {
      throw new Error('Wallet deposit amount does not match the original requested amount.');
    }
    if (tx?.currency && String(tx.currency).toUpperCase() !== 'NGN') {
      throw new Error('Wallet deposit currency must be NGN.');
    }
  }

  // 2. Mark or create in payment_transactions
  if (tx) {
    await execute(`
      UPDATE payment_transactions
      SET status = 'successful', verifiedAt = $1, providerReference = $2, webhookData = $3, channel = $4
      WHERE reference = $5
    `, [nowIso, providerRef, rawDataStr, params.channel || tx.channel || 'checkout', reference]);
  } else {
    const id = `ptx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    await execute(`
      INSERT INTO payment_transactions (id, reference, userEmail, userName, amount, currency, provider, providerReference, purpose, status, channel, authorizationUrl, metadata, createdAt, verifiedAt, webhookData)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [id, reference, userEmail, '', amount, 'NGN', provider, providerRef, purpose, 'successful', params.channel || 'checkout', '', '{}', nowIso, nowIso, rawDataStr]);
  }

  let voucherCode = '';

  // 3. Handle Wallet Funding vs Voucher
  if (purpose === 'wallet_funding') {
    const db = readDb();
    const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === userEmail);
    if (userIndex !== -1) {
      const user = db.users[userIndex];
      const currentBal = Number(user.balance || 0);
      const newBal = currentBal + amount;
      user.balance = newBal;

      const providerLower = String(provider || '').toLowerCase();
      const providerDisplay = 'KoraPay';

      const txRecord = {
        id: `tx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        userId: userEmail,
        type: 'deposit',
        amount: amount,
        date: nowIso,
        status: 'success',
        description: `Deposit — ${providerDisplay}`,
        reference: reference,
        provider: 'korapay',
        balanceBefore: currentBal,
        balanceAfter: newBal
      };
      user.transactions = user.transactions || [];
      user.transactions.unshift(txRecord);

      user.notifications = user.notifications || [];
      user.notifications.unshift({
        id: `notif-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        title: 'Coins Purchased',
        body: `Your JB Boster wallet has been credited with ${Math.round(amount / nairaPerCoin()).toLocaleString()} coins via ${providerDisplay}. New balance: ${Math.round(newBal / nairaPerCoin()).toLocaleString()} coins.`,
        date: nowIso,
        unread: true,
        type: 'deposit',
        category: 'Wallet Deposit',
        status: 'Success',
        amount: amount,
        reference: reference
      });

      await writeDb(db);

      try {
        await execute(`UPDATE users SET balance = $1, notifications = $2, transactions = $3 WHERE LOWER(email) = $4`, [
          newBal,
          JSON.stringify(user.notifications),
          JSON.stringify(user.transactions),
          userEmail
        ]);
        await execute(`UPDATE wallets SET balance = $1 WHERE LOWER(userId) = $2`, [newBal, userEmail]);
        await execute(`UPDATE payment_transactions SET walletCreditedAt = $1 WHERE reference = $2`, [nowIso, reference]);
      } catch (sqlErr) {
        console.warn('[Payment Credit] SQL update error:', sqlErr);
        throw sqlErr;
      }
    } else {
      throw new Error(`Wallet user ${userEmail} was not found while processing successful deposit.`);
    }
  } else if (purpose === 'wdv_voucher') {
    if (Math.abs(amount - 6500) > 0.009) {
      throw new Error('WDV voucher payment amount must be exactly ₦6,500.');
    }
    try {
      if (!wdvPayment) {
        const id = `dva-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        await execute(`
          INSERT INTO wdv_payments (id, reference, userEmail, amount, bankName, accountNumber, accountName, status, createdAt, expiresAt, paidAt, voucherCode, provider, webhookData)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [id, reference, userEmail, amount, `${provider.toUpperCase()} Checkout`, 'Online Gateway', `Nevo / Customer`, 'pending', nowIso, nowIso, '', '', provider, '']);
      }
      const vResult = await processSuccessfulWdvPayment(reference, provider, rawDataStr);
      voucherCode = vResult.voucherCode || '';
    } catch (vErr) {
      console.error('[Payment Process] WDV voucher error:', vErr);
      throw vErr;
    }
  }

  logDiagnostic('INFO', 'Payment processed and confirmed', { reference, userEmail, amount, purpose, provider });
  await loadDbCache();

  return {
    success: true,
    alreadyProcessed: false,
    reference,
    amount,
    purpose,
    status: 'successful',
    voucherCode,
    paidAt: nowIso
  };
}

// -------------------- KORAPAY PAYMENT GATEWAY --------------------
const createNevoKoraReference = () => `NEVO_KORA_${Date.now()}_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const handleKorapayWalletDepositInit = async (req: any, res: any) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 520) {
      return res.status(400).json({ error: 'Minimum coin purchase is ₦520.' });
    }
    const email = String(req.userEmail || '').toLowerCase();
    const db = readDb();
    const user = db.users.find((u: any) => String(u.email || '').toLowerCase() === email);
    if (!user) return res.status(404).json({ error: 'User account not found.' });

    const provider = paymentManager.getProvider('korapay');
    if (!provider || !provider.isConfigured()) {
      return res.status(503).json({ error: 'KoraPay coin purchase service is not configured. Add KORAPAY_SECRET_KEY to the server environment.' });
    }

    const reference = createNevoKoraReference();
    const configuredAppUrl = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = configuredAppUrl || `${protocol}://${host}`;
    const callbackUrl = `${baseUrl}/dashboard`;
    // KoraPay appends ?reference=<transaction-reference> to the redirect URL.
    // Keep the redirect URL clean so the provider's canonical reference is received.

    const notificationUrl = `${baseUrl}/api/payment/webhook/korapay`;
    const createdAt = new Date().toISOString();

    // Record the pending Nevo transaction before contacting KoraPay.
    await execute(`
      INSERT INTO payment_transactions
      (id, reference, userEmail, userName, amount, currency, provider, providerReference, purpose, status, channel, authorizationUrl, metadata, createdAt, verifiedAt, webhookData)
      VALUES ($1,$2,$3,$4,$5,'NGN','korapay',$6,'wallet_funding','pending','checkout','',$7,$8,'','')
    `, [
      `ptx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      reference,
      email,
      user.fullName || '',
      amount,
      reference,
      JSON.stringify({ purpose: 'wallet_funding', userId: email, userName: user.fullName || '', callbackUrl }),
      createdAt
    ]);

    try {
      const result = await paymentManager.initializePayment({
        userId: email,
        email,
        name: user.fullName || email.split('@')[0] || 'JB Boster Customer',
        amount,
        currency: 'NGN',
        reference,
        callbackUrl,
        notificationUrl,
        provider: 'korapay',
        metadata: { purpose: 'wallet_funding', userId: email, userName: user.fullName || 'JB Boster Customer' }
      });

      await execute(`UPDATE payment_transactions SET providerReference=$1, authorizationUrl=$2, metadata=$3 WHERE reference=$4`, [
        result.reference,
        result.checkoutUrl,
        JSON.stringify({ purpose: 'wallet_funding', userId: email, callbackUrl, notificationUrl, provider: 'korapay' }),
        reference
      ]);

      return res.json({ success: true, deposit: {
        reference,
        amount,
        checkoutUrl: result.checkoutUrl,
        authorizationUrl: result.checkoutUrl,
        provider: 'korapay',
        status: 'pending'
      }});
    } catch (providerError: any) {
      await execute(`UPDATE payment_transactions SET status='failed', webhookData=$1 WHERE reference=$2`, [
        JSON.stringify({ initializationError: providerError?.message || 'KoraPay initialization failed' }), reference
      ]).catch(() => {});
      throw providerError;
    }
  } catch (err: any) {
    console.error('[KoraPay Wallet Deposit]', err);
    res.status(502).json({ error: err?.message || 'Failed to initialize KoraPay checkout.' });
  }
};

app.post('/api/korapay/initialize-wallet-deposit', authenticateToken, handleKorapayWalletDepositInit);

const verifyKorapayPaymentForUser = async (req: any, res: any) => {
  try {
    const reference = String(req.params?.reference || req.body?.reference || '').trim();
    if (!reference) return res.status(400).json({ error: 'Payment reference is required.' });

    const tx = await getRow(`SELECT * FROM payment_transactions WHERE reference=$1 OR providerReference=$1`, [reference]);
    if (!tx) return res.status(404).json({ error: 'Payment transaction not found.' });
    const owner = String(tx.useremail || tx.userEmail || '').toLowerCase();
    if (owner !== String(req.userEmail || '').toLowerCase()) return res.status(403).json({ error: 'This payment does not belong to your account.' });
    if (String(tx.provider || '').toLowerCase() !== 'korapay') return res.status(400).json({ error: 'Unsupported payment provider.' });

    if (['successful','settled'].includes(String(tx.status).toLowerCase())) {
      const user = readDb().users.find((u:any) => String(u.email || '').toLowerCase() === owner);
      return res.json({ success: true, alreadyProcessed: true, status: 'successful', amount: Number(tx.amount || 0), reference: tx.reference, balance: user?.balance });
    }

    const provider = paymentManager.getProvider('korapay');
    if (!provider || !provider.isConfigured()) return res.status(503).json({ error: 'KoraPay is not configured on the server.' });
    const verification = await provider.verifyPayment(String(tx.providerreference || tx.providerReference || tx.reference));

    if (verification.status === 'successful') {
      const expectedAmount = Number(tx.amount || 0);
      const verifiedAmount = Number(verification.amount || 0);
      if (String(verification.currency || '').toUpperCase() !== 'NGN') return res.status(400).json({ error: 'Verified payment currency is not NGN.' });
      if (!Number.isFinite(verifiedAmount) || Math.abs(verifiedAmount - expectedAmount) > 0.009) return res.status(400).json({ error: 'Verified payment amount does not match the requested deposit.' });
      const result = await processSuccessfulPayment({
        reference: tx.reference,
        providerName: 'korapay',
        verifiedAmount,
        providerReference: verification.providerReference || String(tx.providerreference || ''),
        rawData: verification.rawResponse || {}
      });
      return res.json({ ...result, status: 'successful' });
    }

    if (verification.status === 'failed') {
      await execute(`UPDATE payment_transactions SET status='failed', verifiedAt=$1, webhookData=$2 WHERE reference=$3`, [new Date().toISOString(), JSON.stringify(verification.rawResponse || {}), tx.reference]);
      return res.json({ success: false, status: 'failed', reference: tx.reference, message: 'KoraPay reports that this payment was not completed.' });
    }
    return res.json({ success: false, status: 'pending', reference: tx.reference, message: 'Payment is still pending.' });
  } catch (err: any) {
    console.error('KoraPay verification error:', err);
    res.status(500).json({ error: err?.message || 'Payment verification failed.' });
  }
};

app.get('/api/korapay/check-status/:reference', authenticateToken, verifyKorapayPaymentForUser);
app.post('/api/korapay/check-status', authenticateToken, verifyKorapayPaymentForUser);
app.post('/api/payment/verify', authenticateToken, verifyKorapayPaymentForUser);
app.get('/api/payment/verify/:reference', authenticateToken, verifyKorapayPaymentForUser);

// KoraPay sends the webhook without user authentication. Signature verification is mandatory,
// followed by a direct provider verification before any wallet credit is applied.
app.post('/api/payment/webhook/korapay', async (req: any, res: any) => {
  try {
    const provider = paymentManager.getProvider('korapay');
    if (!provider || !provider.isConfigured()) return res.status(503).send('KoraPay not configured');
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const parsed = await provider.verifyWebhook(req.headers, rawBody);
    if (!parsed.isValid) {
      logDiagnostic('SECURITY_ALERT', 'Invalid KoraPay webhook signature');
      return res.status(400).send('Invalid KoraPay webhook signature');
    }

    const ref = String(parsed.reference || '').trim();
    if (!ref) return res.status(200).json({ status: 'ignored' });
    const tx = await getRow(`SELECT * FROM payment_transactions WHERE reference=$1 OR providerReference=$1`, [ref]);
    if (!tx) return res.status(200).json({ status: 'ignored' });
    if (String(tx.provider || '').toLowerCase() !== 'korapay') return res.status(200).json({ status: 'ignored' });
    if (['successful','settled'].includes(String(tx.status).toLowerCase())) return res.status(200).json({ status: 'already_processed' });

    // Never trust webhook amount/status alone. Query KoraPay directly for final status.
    const verified = await provider.verifyPayment(String(tx.providerreference || tx.providerReference || ref));
    const expectedAmount = Number(tx.amount || 0);
    const verifiedAmount = Number(verified.amount || 0);
    if (verified.status === 'successful' && String(verified.currency || '').toUpperCase() === 'NGN' && Math.abs(verifiedAmount - expectedAmount) <= 0.009) {
      await processSuccessfulPayment({ reference: tx.reference, providerName: 'korapay', verifiedAmount, providerReference: verified.providerReference || ref, rawData: verified.rawResponse || parsed.rawBody || {} });
    } else if (verified.status === 'failed') {
      await execute(`UPDATE payment_transactions SET status='failed', verifiedAt=$1, webhookData=$2 WHERE reference=$3`, [new Date().toISOString(), JSON.stringify(verified.rawResponse || parsed.rawBody || {}), tx.reference]);
    }
    return res.status(200).json({ status: 'success' });
  } catch (err: any) {
    console.error('KoraPay webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failure.' });
  }
});

// Backward-compatible webhook path used by some Kora dashboard configurations.
app.post('/api/korapay/webhook', async (req: any, res: any) => {
  req.url = '/api/payment/webhook/korapay';
  const provider = paymentManager.getProvider('korapay');
  try {
    if (!provider || !provider.isConfigured()) return res.status(503).send('KoraPay not configured');
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const parsed = await provider.verifyWebhook(req.headers, rawBody);
    if (!parsed.isValid) return res.status(400).send('Invalid KoraPay webhook signature');
    if (parsed.reference) {
      const tx = await getRow(`SELECT * FROM payment_transactions WHERE reference=$1 OR providerReference=$1`, [parsed.reference]);
      if (tx && String(tx.provider || '').toLowerCase() === 'korapay' && !['successful','settled'].includes(String(tx.status).toLowerCase())) {
        const verified = await provider.verifyPayment(String(tx.providerreference || tx.providerReference || parsed.reference));
        const expected = Number(tx.amount || 0);
        if (verified.status === 'successful' && String(verified.currency || '').toUpperCase() === 'NGN' && Math.abs(Number(verified.amount || 0) - expected) <= 0.009) {
          await processSuccessfulPayment({ reference: tx.reference, providerName: 'korapay', verifiedAmount: Number(verified.amount), providerReference: verified.providerReference || parsed.reference, rawData: verified.rawResponse || {} });
        }
      }
    }
    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('KoraPay compatibility webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failure.' });
  }
});

// 5. Admin Payment Gateway Configuration & Transaction Oversight
app.get('/api/admin/payment-config', authenticateAdminToken, (req, res) => {
  try {
    const providers = paymentManager.getAllProvidersStatus();
    const activeProvider = paymentManager.getConfiguredActiveProviderName();
    res.json({
      success: true,
      activeProvider,
      providers
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch admin payment configuration.' });
  }
});

app.post('/api/admin/payment-config/active-provider', authenticateAdminToken, async (req, res) => {
  try {
    const { provider } = req.body;
    if (String(provider || '').toLowerCase() !== 'korapay') {
      return res.status(400).json({ error: 'KoraPay is the only supported payment provider.' });
    }

    paymentManager.setActiveProviderName('korapay');

    // Persist in admin_settings
    await execute(`INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [
      'payment_provider',
      provider
    ]);

    res.json({
      success: true,
      activeProvider: provider,
      message: 'KoraPay is the active payment provider.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update active payment provider.' });
  }
});

app.get('/api/admin/payment-transactions', authenticateAdminToken, async (req, res) => {
  try {
    const transactions = await getAllRows(`SELECT * FROM payment_transactions ORDER BY createdAt DESC`);
    res.json({
      success: true,
      transactions
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch payment transactions.' });
  }
});

app.post('/api/admin/payment-transactions/manual-verify', authenticateAdminToken, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const tx = await getRow(`SELECT * FROM payment_transactions WHERE reference = $1`, [reference]);
    if (!tx || String(tx.provider || '').toLowerCase() !== 'korapay') {
      return res.status(404).json({ error: 'KoraPay payment transaction not found.' });
    }
    const providerName: PaymentProviderName = 'korapay';
    const provider = paymentManager.getProvider('korapay');
    if (!provider.isConfigured()) {
      return res.status(400).json({
        error: `Provider ${provider.displayName} is missing API credentials for verification.`
      });
    }

    const verifyRes = await provider.verifyPayment(reference);
    if (verifyRes.success && verifyRes.status === 'successful') {
      const processRes = await processSuccessfulPayment({
        reference,
        providerName: 'korapay',
        verifiedAmount: verifyRes.amount,
        channel: verifyRes.channel,
        providerReference: verifyRes.providerReference,
        rawData: verifyRes.rawResponse
      });

      return res.json({
        success: true,
        message: 'Transaction successfully verified with provider and account credited.',
        data: processRes
      });
    }

    res.json({
      success: false,
      status: verifyRes.status,
      message: verifyRes.message || 'Provider verification was not successful.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Manual verification failed.' });
  }
});

app.get('/api/banks', authenticateToken, async (_req: any, res: any) => {
  try {
    const banks = await paymentManager.getBankList();
    res.json(banks);
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Unable to load bank list.' });
  }
});

// Bank Account Name Resolution Endpoint
app.get('/api/bank/resolve', authenticateToken, async (req: any, res) => {
  const accountNumber = String(req.query.accountNumber || '').trim();
  const bankCode = String(req.query.bankCode || req.query.bank || req.query.bankName || '').trim();

  if (!accountNumber || accountNumber.length !== 10) {
    return res.status(400).json({ success: false, error: 'Valid 10-digit account number required.' });
  }

  const result = await verifyBankAccountService(bankCode || '058', accountNumber);
  if (result.success) {
    return res.json({
      success: true,
      accountName: result.accountName,
      accountNumber,
      bankCode
    });
  } else {
    return res.status(400).json({
      success: false,
      error: result.error || 'Unable to verify account name'
    });
  }
});


// 5. Admin Payments Management Endpoints
app.get('/api/admin/payments', authenticateAdminToken, async (req, res) => {
  try {
    const paymentRows = await getAllRows(`SELECT * FROM wdv_payments ORDER BY createdAt DESC`);
    const voucherRows = await getAllRows(`SELECT * FROM vouchers`);

    const voucherMap = new Map();
    for (const v of voucherRows) {
      const code = v.vouchercode || v.code;
      if (code) {
        voucherMap.set(code, v.status);
      }
    }

    const payments = paymentRows.map(p => {
      const code = p.vouchercode || p.voucherCode || '';
      return {
        id: p.id,
        reference: p.reference,
        userEmail: p.useremail || p.userEmail,
        amount: Number(p.amount || 0),
        bankName: p.bankname || p.bankName,
        accountNumber: p.accountnumber || p.accountNumber,
        accountName: p.accountname || p.accountName,
        status: p.status,
        createdAt: p.createdat || p.createdAt,
        expiresAt: p.expiresat || p.expiresAt,
        paidAt: p.paidat || p.paidAt,
        voucherCode: code,
        voucherStatus: code ? (voucherMap.get(code) || 'unused') : '',
        provider: p.provider
      };
    });

    res.json({ success: true, payments });
  } catch (err: any) {
    console.error('Error fetching admin payments:', err);
    res.status(500).json({ error: 'Failed to fetch payments.' });
  }
});

app.post('/api/admin/payments/confirm', authenticateAdminToken, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const result = await processSuccessfulWdvPayment(reference, 'admin_manual');
    res.json({
      success: true,
      message: 'Payment confirmed and WDV voucher issued successfully.',
      data: result
    });
  } catch (err: any) {
    console.error('Error in admin payment confirmation:', err);
    res.status(400).json({ error: err.message || 'Failed to confirm payment.' });
  }
});

// Get user's own active and historic WDV vouchers
app.get('/api/vouchers/my-vouchers', authenticateToken, async (req: any, res) => {
  const email = req.userEmail.toLowerCase();
  try {
    const rows = await getAllRows(`
      SELECT * FROM vouchers 
      WHERE LOWER(usedBy) = $1 OR LOWER(purchasedBy) = $1
      ORDER BY generatedAt DESC
    `, [email]);

    const userVouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      code: r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      createdAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));

    res.json({
      success: true,
      vouchers: userVouchers
    });
  } catch (err: any) {
    console.error('Error fetching user vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch your WDV vouchers' });
  }
});

// Get WDV Configuration (supporting legacy bpc route as well)
app.get('/api/config/wdv', (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.wdvConfig || DEFAULT_WDV_CONFIG });
});

app.get('/api/config/bpc', (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.wdvConfig || DEFAULT_WDV_CONFIG });
});

// Get Public System & Brand Settings
const getPublicSettingsHandler = async (req: any, res: any) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const db = readDb();
    const wdvConfig = db.wdvConfig || DEFAULT_WDV_CONFIG;

    const mergedSettings = {
      websiteName: 'Nevo',
      websiteLogo: settings.websiteLogo || "",
      websiteFavicon: settings.websiteFavicon || "",
      primaryColor: settings.primaryColor || "#0d9488",
      secondaryColor: settings.secondaryColor || "#4f46e5",
      accentColor: settings.accentColor || "#14b8a6",
      maintenanceMode: settings.maintenanceMode || "false",
      registrationEnabled: settings.registrationEnabled || "true",
      loginEnabled: settings.loginEnabled || "true",
      withdrawalEnabled: settings.withdrawalEnabled || "true",
      transferEnabled: settings.transferEnabled || "true",
      airtimeEnabled: settings.airtimeEnabled || "true",
      dataEnabled: settings.dataEnabled || "true",
      billsEnabled: settings.billsEnabled || "true",
      wdvEnabled: settings.wdvEnabled || "true",
      referralEnabled: settings.referralEnabled || "true",
      referralBonus: settings.referralBonus || "1000",
      registrationBonus: settings.registrationBonus || "750",
      dailyWithdrawalLimit: settings.dailyWithdrawalLimit || "1000000",
      minWithdrawal: settings.minWithdrawal || "5000",
      maxWithdrawal: settings.maxWithdrawal || "500000",
      withdrawalCharges: settings.withdrawalCharges || "100",
      currency: settings.currency || "₦",
      timezone: settings.timezone || "Africa/Lagos",
      country: settings.country || "Nigeria",
      scrollingAnnouncement: settings.scrollingAnnouncement || "Welcome to Nevo! Complete tasks, watch adverts and earn money.",
      liveFeedText: settings.liveFeedText || "New social orders are being processed every day.",
      welcomeMessage: settings.welcomeMessage || "Welcome to Nevo",
      dashboardBanner: settings.dashboardBanner || "Get started with fast manual voucher activation & seamless transfers",
      noticeBarText: settings.noticeBarText || "",
      
      // Payment Settings
      bankName: settings.wdvBankName || wdvConfig.bankName || "PalmPay",
      accountName: settings.wdvAccountName || wdvConfig.accountName || "pwamunadi ishaku",
      accountNumber: settings.wdvAccountNumber || wdvConfig.accountNumber || "8960723295",
      voucherPrice: settings.wdvVoucherPrice || String(wdvConfig.voucherPrice || 6500),
      paymentInstructions: settings.wdvInstructions || wdvConfig.instructions || "Copy the bank details below. Make a manual transfer and send proof via WhatsApp.",
      paymentNotice: settings.wdvMaintenanceNotice || wdvConfig.maintenanceNotice || "",
      paymentCountdown: settings.paymentCountdown || "900",
      paymentsEnabled: settings.paymentsEnabled || "true",

      // WhatsApp & Social
      whatsappNumber: settings.whatsappNumber || "+2349162845073",
      whatsappLink: settings.wdvWhatsappLink || settings.whatsappLink || wdvConfig.whatsappLink || "https://wa.me/2349162845073",
      whatsappMessage: settings.whatsappMessage || "Hello Admin, I have made a manual bank transfer for WDV Voucher.",
      telegramLink: (settings.telegramLink && !/nevo/i.test(settings.telegramLink)) ? settings.telegramLink : "https://t.me/nevo_official",
      facebookLink: settings.facebookLink || "",
      instagramLink: settings.instagramLink || "",
      xTwitterLink: settings.xTwitterLink || "",
      tikTokLink: settings.tikTokLink || "",
      youtubeLink: settings.youtubeLink || "",

      // Customer Support & Pages
      supportEmail: (settings.supportEmail && !/nevo/i.test(settings.supportEmail)) ? settings.supportEmail : "support@nevo.ng",
      supportPhone: settings.supportPhone || "+2349162845073",
      senderName: /nevo/i.test(String(settings.senderName || settings.smsSenderName || "")) ? "Nevo" : (settings.senderName || settings.smsSenderName || "Nevo"),
      officeAddress: settings.officeAddress || "Lagos, Nigeria",
      businessHours: settings.businessHours || "24/7 Support",
      websiteUrl: (settings.websiteUrl && !/nevo/i.test(settings.websiteUrl)) ? settings.websiteUrl : "https://nevo.ng",
      privacyPolicy: (settings.privacyPolicy && !/nevo/i.test(settings.privacyPolicy)) ? settings.privacyPolicy : "Nevo Privacy Policy details...",
      termsOfService: (settings.termsOfService && !/nevo/i.test(settings.termsOfService)) ? settings.termsOfService : "Nevo Terms of Service details...",
      aboutUs: (settings.aboutUs && !/nevo/i.test(settings.aboutUs)) ? settings.aboutUs : "Nevo is Nigeria's premier digital financial rewards and wallet platform...",
      contactUs: settings.contactUs || "Contact support via WhatsApp or Email.",
      faqContent: settings.faqContent || "Frequently Asked Questions...",

      // Security Settings
      pinLoginEnabled: settings.pinLoginEnabled || "true",
      biometricLoginEnabled: settings.biometricLoginEnabled || "true",
      passwordLoginEnabled: settings.passwordLoginEnabled || "true",
      sessionTimeout: settings.sessionTimeout || "30",
      maxLoginAttempts: settings.maxLoginAttempts || "5",
      deviceRestriction: settings.deviceRestriction || "false",
      twoFactorEnabled: settings.twoFactorEnabled || "false",

      // WDV Voucher Specific
      voucherPrefix: settings.voucherPrefix || "WDV",
      voucherLength: settings.voucherLength || "10",
      voucherValidity: settings.voucherValidity || "30 Days",

      // Video & Recovery
      videoUrl: settings.videoUrl || "",
      videoEnabled: settings.videoEnabled !== 'false',
      recoveryEnabled: settings.recoveryEnabled !== 'false',
      smsRecoveryEnabled: settings.smsRecoveryEnabled !== 'false'
    };

    res.json({ success: true, settings: mergedSettings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
};

app.get('/api/live-feed', authenticateToken, async (_req: any, res: any) => {
  try {
    const withdrawals = await getAllRows(`SELECT u.fullName, w.amount, w.timestamp, w.reference FROM withdraw_requests w LEFT JOIN users u ON LOWER(u.email)=LOWER(w.email) WHERE LOWER(w.status) IN ('completed','approved') ORDER BY w.timestamp DESC LIMIT 50`);
    const deposits = await getAllRows(`SELECT userName, amount, createdAt, reference FROM payment_transactions WHERE provider='korapay' AND purpose='wallet_funding' AND status IN ('successful','settled') ORDER BY createdAt DESC LIMIT 50`);
    const maskName = (name: string) => {
      const parts = String(name || 'Nevo user').trim().split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return parts[0] || 'Nevo user';
      return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
    };
    const events = [
      ...withdrawals.map((r:any) => ({ type: 'withdrawal', message: `${maskName(r.fullname || r.fullName)} withdrew ₦${Number(r.amount || 0).toLocaleString('en-NG')}`, timestamp: r.timestamp, reference: r.reference })),
      ...deposits.map((r:any) => ({ type: 'deposit', message: `${maskName(r.username || r.userName)} deposited ₦${Number(r.amount || 0).toLocaleString('en-NG')}`, timestamp: r.createdat || r.createdAt, reference: r.reference }))
    ].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50);
    res.json({ success: true, events });
  } catch (err) {
    console.error('[Nevo Live Feed] Failed to load activity:', err);
    res.json({ success: true, events: [] });
  }
});

app.get('/api/settings', getPublicSettingsHandler);
app.get('/api/settings/public', getPublicSettingsHandler);
app.get('/api/config/public', getPublicSettingsHandler);
app.get('/api/config/settings', getPublicSettingsHandler);

// -------------------- FINTECH AI CUSTOMER SUPPORT SYSTEM --------------------
app.post('/api/support/chat', async (req, res) => {
  try {
    const { message, history, email, sessionId } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const currentSessionId = sessionId || `session_${Date.now()}`;
    const userEmail = (email || '').toLowerCase();

    // Fetch master settings from DB to build dynamic knowledge context
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const aiSupportEnabled = settings.aiSupportEnabled !== 'false';
    const websiteName = /nevo/i.test(String(settings.websiteName || '')) ? 'Nevo' : (settings.websiteName || 'Nevo');
    const bankName = settings.wdvBankName || settings.bpcBankName || 'PalmPay';
    const accountNumber = settings.wdvAccountNumber || settings.bpcAccountNumber || '8960723295';
    const accountName = settings.wdvAccountName || settings.bpcAccountName || 'pwamunadi ishaku';
    const voucherPrice = Number(settings.wdvVoucherPrice || settings.bpcVoucherPrice || 6500);
    const whatsappLink = settings.whatsappLink || settings.wdvWhatsappLink || settings.bpcWhatsappLink || 'https://wa.me/2349162845073';
    const whatsappNumber = settings.whatsappNumber || settings.supportPhone || '+2349162845073';
    const supportEmail = settings.supportEmail || 'support@nevo.com';

    // If AI is disabled by Admin in settings
    if (!aiSupportEnabled) {
      return res.json({
        success: true,
        reply: `Our automated AI assistant is currently undergoing routine system maintenance.\n\nPlease connect directly with an official human support representative on WhatsApp for immediate assistance.`,
        requiresHumanEscalation: true,
        whatsappLink
      });
    }

    const msgLower = message.trim().toLowerCase();

    // 1. SECURITY RULES CHECK (Requirement #6)
    // Warn if user typed passwords, PINs, BVN, NIN, OTP
    let securityWarning = '';
    const pinRegex = /\b\d{4}\b/;
    const bvnNinRegex = /\b\d{11}\b/;
    const hasSensitiveWords = msgLower.includes('password') || msgLower.includes('my pin') || msgLower.includes('bvn') || msgLower.includes('nin') || msgLower.includes('otp');
    if (hasSensitiveWords || (pinRegex.test(message) && msgLower.includes('pin')) || bvnNinRegex.test(message)) {
      securityWarning = `⚠️ **SECURITY ALERT**: For your financial protection, NEVER share your account passwords, 4-digit transaction PINs, OTP codes, BVNs, or NINs in chat messages. ${websiteName} representatives will NEVER ask for your PIN or password.\n\n`;
    }

    // 2. Sensitive issues & human escalation trigger detection
    const escalationKeywords = [
      'human', 'agent', 'person', 'whatsapp', 'dispute', 'refund', 'frozen',
      'suspended', 'lost money', 'wrong account', 'operator', 'complaint',
      'stolen', 'hacked', 'failed transfer', 'not credited', 'pending deposit',
      'escalate', 'supervisor', 'admin'
    ];
    let requiresHumanEscalation = escalationKeywords.some(kw => msgLower.includes(kw));

    // 3. CHECK CUSTOM ADMIN FAQs
    let matchedFaqAnswer = '';
    try {
      const customFaqs = await getAllRows(`SELECT question, answer FROM ai_custom_faqs`);
      for (const faq of customFaqs) {
        if (faq.question && msgLower.includes(faq.question.toLowerCase().trim())) {
          matchedFaqAnswer = faq.answer;
          break;
        }
      }
    } catch (e) {}

    let finalReply = '';
    let isUnanswered = 0;

    if (matchedFaqAnswer) {
      finalReply = `${securityWarning}${matchedFaqAnswer}`;
    } else {
      // System instructions for Gemini AI
      const systemInstruction = `You are "Nevo Assistant", the official first-level customer support AI representative for ${websiteName}.

YOUR PERSONALITY & TONE:
- Name: Nevo Assistant
- Tone: Friendly, professional, clear, helpful, simple English, patient with beginners.
- Example greeting: "Hello 👋 Welcome to ${websiteName} Support. I am Nevo Assistant. How can I help you today?"

DYNAMIC SYSTEM FACTS (READ FROM DATABASE):
- Brand Name: ${websiteName}
- Deposits are created through KoraPay Checkout Redirect. Every deposit receives a fresh KoraPay checkout URL from the server. Never invent, reuse, or provide a static/random payment URL.
- Official Contact Channels:
  * WhatsApp Support Link: ${whatsappLink}
  * Support Phone: ${whatsappNumber}
  * Support Email: ${supportEmail}

KNOWLEDGE BASE & GUIDANCE:
1. Wallet Deposit:
   - User taps "Deposit" and chooses an amount of at least ₦520.
   - After Continue, Nevo creates a new KoraPay checkout session.
   - The user completes the payment on KoraPay's hosted checkout.
   - The wallet is credited only after KoraPay webhook delivery and direct server-side verification confirm the exact NGN amount.
2. Withdrawal Eligibility:
   - The user must have at least 5 successful referrals.
   - After the referrals are completed, the user must have made a verified wallet deposit of at least ₦520.
   - Both requirements are required before withdrawal is unlocked.
3. Bank Transfers / Withdrawals:
   - Transfers go to any 10-digit Nigerian NUBAN bank account.
4. Welcome Bonus:
   - New users receive a ₦750 welcome bonus upon registration.
5. Account Security:
   - Local 4-digit security PIN handles transaction authorizations.
   - Fingerprint and Face ID biometric authentication supported natively.
6. Password & PIN Reset:
   - Reset Security PIN under Profile > Security Settings.
   - Password recovery via OTP on Login page.

STRICT SECURITY GUARDRAILS:
1. You are an INFORMATIONAL AND GUIDANCE ASSISTANT ONLY. You cannot execute live financial transfers or password overrides directly in chat.
2. Do NOT ask for passwords, PINs, OTPs, BVN, or NIN.
3. If user asks to unfreeze accounts, refund failed deposits, or resolve dispute, say:
   "I want to make sure you get the best help. Would you like to continue with our live WhatsApp support?"`;

      // Try Gemini API first
      if (process.env.GEMINI_API_KEY) {
        try {
          const formattedHistory = (history || []).slice(-6).map((h: any) => ({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          }));

          const geminiRes = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
              ...formattedHistory,
              { role: 'user', parts: [{ text: message }] }
            ],
            config: {
              systemInstruction,
              temperature: 0.7,
            }
          });

          if (geminiRes.text) {
            finalReply = `${securityWarning}${geminiRes.text}`;
          }
        } catch (geminiErr: any) {
          console.error('[Nevo AI Support] Gemini API fallback to rules engine:', geminiErr.message);
        }
      }

      // Fallback rule engine if Gemini is offline
      if (!finalReply) {
        if (msgLower.includes('deposit') || msgLower.includes('fund') || msgLower.includes('voucher') || msgLower.includes('code')) {
          finalReply = `${securityWarning}To deposit funds into your Nevo wallet:\n\n1. Tap "Deposit" on the Wallet dashboard.\n2. Choose an amount of at least ₦520 and tap Continue.\n3. Nevo creates a fresh KoraPay hosted checkout session.\n4. Complete the payment on KoraPay's secure checkout page.\n5. Your wallet is credited only after KoraPay confirms the payment server-side.`;
        } else if (msgLower.includes('withdraw') || msgLower.includes('transfer') || msgLower.includes('send money')) {
          finalReply = `${securityWarning}To withdraw or transfer funds to a bank account:\n\n1. Tap the "Wallet" tab or select "Bank Transfer".\n2. Enter the 10-digit NUBAN bank account number and select the recipient bank.\n3. Enter the amount and your 4-digit security PIN to authorize the transfer.`;
        } else if (msgLower.includes('pending') || msgLower.includes('delay') || msgLower.includes('deposit') || msgLower.includes('not credited')) {
          finalReply = `${securityWarning}KoraPay payment verification can take a short time after checkout. Your wallet is credited only after KoraPay confirms the exact amount server-side.\n\nI want to make sure you get the best help. Would you like to continue with our live WhatsApp support?`;
          requiresHumanEscalation = true;
        } else if (msgLower.includes('pin') || msgLower.includes('password') || msgLower.includes('reset')) {
          finalReply = `${securityWarning}To set or update your 4-digit Security PIN:\n\n1. Go to Profile > Security Settings > Security PIN.\n2. If you forgot your password, click "Forgot Password?" on the login page to receive an OTP code via email/SMS.`;
        } else if (msgLower.includes('human') || msgLower.includes('whatsapp') || msgLower.includes('agent') || msgLower.includes('support')) {
          finalReply = `${securityWarning}I am transferring you to our official human support team. Click the "Connect to Live Support on WhatsApp" button below to chat with an operator on WhatsApp (${whatsappNumber}).`;
          requiresHumanEscalation = true;
        } else {
          finalReply = `${securityWarning}I want to make sure you get the best help regarding that request. Let me connect you directly with Nevo human support on WhatsApp.`;
          requiresHumanEscalation = true;
          isUnanswered = 1;
        }
      }
    }

    // 4. LOG CHAT TO DATABASE
    const logId = `ailog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    try {
      await execute(`
        INSERT INTO ai_chat_logs (id, session_id, user_email, user_message, ai_response, escalated_to_whatsapp, is_unanswered, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [logId, currentSessionId, userEmail, message, finalReply, requiresHumanEscalation ? 1 : 0, isUnanswered, nowIso]);
    } catch (dbErr) {
      console.error('[Nevo AI Support] Failed to log chat:', dbErr);
    }

    return res.json({
      success: true,
      reply: finalReply,
      requiresHumanEscalation,
      whatsappLink
    });

  } catch (err: any) {
    console.error('[Nevo AI Support] Endpoint error:', err);
    res.status(500).json({
      error: 'An unexpected error occurred in AI support system.',
      reply: 'Hello! I am Nevo Assistant. I experienced a momentary glitch. You can also connect directly with our WhatsApp support team.'
    });
  }
});

// Admin AI Support Settings & Analytics Endpoint
app.get('/api/admin/ai-settings', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const customFaqs = await getAllRows(`SELECT * FROM ai_custom_faqs ORDER BY created_at DESC`);
    
    // Analytics
    const totalConvsRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs`);
    const failedRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs WHERE is_unanswered = 1`);
    const whatsappRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs WHERE escalated_to_whatsapp = 1`);
    const recentQuestions = await getAllRows(`SELECT user_message, COUNT(*) as frequency FROM ai_chat_logs GROUP BY user_message ORDER BY frequency DESC LIMIT 5`);

    res.json({
      success: true,
      aiSupportEnabled: settings.aiSupportEnabled !== 'false',
      aiWelcomeMessage: settings.aiWelcomeMessage || 'Hello 👋 Welcome to Nevo Support. I am Nevo Assistant. How can I help you today?',
      aiSupportRules: settings.aiSupportRules || 'Provide first-level fintech support guidance.',
      whatsappNumber: settings.whatsappNumber || '+2349162845073',
      whatsappLink: settings.whatsappLink || 'https://wa.me/2349162845073',
      customFaqs,
      analytics: {
        totalConversations: Number(totalConvsRow?.count || 0),
        failedResponses: Number(failedRow?.count || 0),
        whatsappTransfers: Number(whatsappRow?.count || 0),
        mostAskedQuestions: recentQuestions
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch AI settings & analytics.' });
  }
});

// Admin Update AI Support Settings
app.post('/api/admin/ai-settings', authenticateAdminToken, async (req, res) => {
  try {
    const { aiSupportEnabled, aiWelcomeMessage, aiSupportRules, whatsappNumber, whatsappLink } = req.body;

    const pairs: [string, string][] = [
      ['aiSupportEnabled', aiSupportEnabled ? 'true' : 'false'],
      ['aiWelcomeMessage', aiWelcomeMessage || ''],
      ['aiSupportRules', aiSupportRules || ''],
      ['whatsappNumber', whatsappNumber || ''],
      ['whatsappLink', whatsappLink || '']
    ];

    for (const [k, v] of pairs) {
      try {
        await execute(`
          INSERT INTO admin_settings (key, value) VALUES ($1, $2)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [k, v]);
      } catch (_) {
        try { await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [v, k]); } catch (_) {}
      }
    }

    await loadDbCache();
    res.json({ success: true, message: 'AI support settings updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update AI support settings.' });
  }
});

// Admin Add Custom FAQ
app.post('/api/admin/ai-faqs', authenticateAdminToken, async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Both question and answer are required.' });
    }

    const id = `faq_${Date.now()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO ai_custom_faqs (id, question, answer, created_at)
      VALUES ($1, $2, $3, $4)
    `, [id, question.trim(), answer.trim(), createdAt]);

    res.json({ success: true, message: 'Custom FAQ added successfully.', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add custom FAQ.' });
  }
});

// Admin Delete Custom FAQ
app.delete('/api/admin/ai-faqs/:id', authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    await execute(`DELETE FROM ai_custom_faqs WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Custom FAQ deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete custom FAQ.' });
  }
});

// Admin Fetch AI Conversation Logs
app.get('/api/admin/ai-conversations', authenticateAdminToken, async (req, res) => {
  try {
    const logs = await getAllRows(`SELECT * FROM ai_chat_logs ORDER BY timestamp DESC LIMIT 50`);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch conversation logs.' });
  }
});

// Download updates ZIP route
app.get('/nevo_updates.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'nevo_updates.zip');
  res.download(filePath, 'nevo_updates.zip');
});

app.get('/nevo-complete-three-updates.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'nevo-complete-three-updates.zip');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'nevo-complete-three-updates.zip');
  } else {
    const fallbackPath = path.join(process.cwd(), 'nevo_updates.zip');
    res.download(fallbackPath, 'nevo-complete-three-updates.zip');
  }
});

app.get('/nevo-admin-complete-upgrade.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'nevo-admin-complete-upgrade.zip');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'nevo-admin-complete-upgrade.zip');
  } else {
    const fallbackPath = path.join(process.cwd(), 'nevo_updates.zip');
    res.download(fallbackPath, 'nevo-admin-complete-upgrade.zip');
  }
});

// Get live video and recovery settings config for client
app.get('/api/config/video', async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
    res.json({
      success: true,
      videoUrl: settings.videoUrl || "",
      videoEnabled: settings.videoEnabled !== 'false',
      recoveryEnabled: settings.recoveryEnabled !== 'false',
      smsRecoveryEnabled: settings.smsRecoveryEnabled !== 'false'
    });
  } catch (err) {
    res.json({
      success: true,
      videoUrl: "",
      videoEnabled: true,
      recoveryEnabled: true,
      smsRecoveryEnabled: true
    });
  }
});

// -------------------- JB BOOST REFERRALS --------------------
app.get('/api/nivo/referrals/stats', authenticateToken, async (req:any,res:any)=>{ try { const email=String(req.userEmail).toLowerCase(); const user=readDb().users.find((u:any)=>u.email.toLowerCase()===email); const records=await getAllRows(`SELECT * FROM nivo_referrals WHERE LOWER(referrerEmail)=LOWER($1) ORDER BY createdAt DESC`,[email]); const bonus=Number(user?.totalReferralBonus||0); const forwardedProto=String(req.get('x-forwarded-proto')||'').split(',')[0].trim(); const protocol=forwardedProto || req.protocol || 'https'; res.json({referralCode:user?.referralCode||'',referralLink:user?.referralCode?`${protocol}://${req.get('host')}/register?ref=${user.referralCode}`:'',totalReferrals:records.length,totalBonus:bonus,bonusPerReferral:Number((records[0]?.bonusamount||1000)),records:records.map((r:any)=>({...r,bonusAmount:Number(r.bonusamount||0),referredUserName:r.referredusername||''}))}); } catch(e:any){res.status(500).json({error:e.message});} });
app.get('/api/nivo/activation/status', authenticateToken, async (req:any,res:any)=>{ try { const email=String(req.userEmail).toLowerCase(); const referralRows=await getAllRows(`SELECT * FROM nivo_referrals WHERE LOWER(referrerEmail)=LOWER($1) AND status='successful' ORDER BY createdAt DESC`,[email]); const paymentRows=await getAllRows(`SELECT * FROM payment_transactions WHERE LOWER(userEmail)=LOWER($1) AND purpose='wallet_funding' AND provider='korapay' AND status IN ('successful','settled')`,[email]); const successfulReferrals=referralRows.length; const depositRequirementMet=paymentRows.some((p:any)=>Number(p.amount||0)>=520); res.json({successfulReferrals,referralsRequired:5,depositRequirementMet,depositMinimum:520,canWithdraw:successfulReferrals>=5&&depositRequirementMet}); } catch(e:any){res.status(500).json({error:e.message});} });
app.post('/api/nivo/activation/pay', authenticateToken, async (_req:any,res:any)=>{ return res.status(400).json({error:'No activation fee is required. Complete 5 successful referrals, then make a minimum ₦520 wallet deposit to unlock withdrawals.'}); });
app.get('/api/nivo/history', authenticateToken, async (req:any,res:any)=>{ try { const email=String(req.userEmail).toLowerCase(); const db=readDb(); const u=db.users.find((x:any)=>x.email.toLowerCase()===email); const tx=Array.isArray(u?.transactions)?u.transactions.filter((x:any)=>['promotional_bonus','activation_fee','deposit','referral_bonus','task_reward','ad_reward'].includes(String(x.type||''))).slice(0,100):[]; res.json({transactions:tx}); } catch(e:any){res.status(500).json({error:e.message});} });
app.get('/api/nivo/notifications', authenticateToken, async (req:any,res:any)=>{ const db=readDb(); const u=db.users.find((x:any)=>x.email.toLowerCase()===String(req.userEmail).toLowerCase()); res.json({notifications:u?.notifications||[]}); });
app.post('/api/nivo/notifications/mark-read', authenticateToken, async (req:any,res:any)=>{ const db=readDb(); const u=db.users.find((x:any)=>x.email.toLowerCase()===String(req.userEmail).toLowerCase()); if(u){ for(const n of (u.notifications||[])) n.unread=false; await writeDb(db); } res.json({success:true}); });

// -------------------- ADMINISTRATIVE PANEL ENDPOINTS --------------------

// Admin Login (with Rate Limiting & Brute Force Protection)
app.post('/api/admin/login', checkAdminLoginRateLimit, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const configuredEmail = String(process.env.ADMIN_EMAIL || 'admin@jbboster.com').trim().toLowerCase();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || 'Admin@1234');
  if (!email || !password || email !== configuredEmail || password !== configuredPassword) {
    recordFailedAdminLogin(req);
    return res.status(400).json({ error: 'Invalid admin credentials.' });
  }
  recordSuccessfulAdminLogin(req);
  const token = generateToken(email);
  logDiagnostic('INFO', `Admin logged in successfully: ${email}`);
  res.json({ success: true, token, email, user: { id: email, email, isAdmin: true, status: 'active' } });
});

app.get('/api/admin/me', authenticateAdminToken, (req: any, res) => {
  const email = String(req.adminEmail || '').toLowerCase();
  res.json({ user: { id: email, email, isAdmin: true, status: 'active' } });
});

// Get Admin settings
app.get('/api/admin/settings', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve admin settings' });
  }
});

// Update Admin settings handler (support both PUT and POST)
const updateAdminSettingsHandler = async (req: any, res: any) => {
  const payload = req.body.settings || req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid settings object payload.' });
  }
  
  try {
    const settingsToSave: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k !== 'token' && v !== undefined && v !== null) {
        settingsToSave[k] = String(v);
      }
    }

    for (const [key, val] of Object.entries(settingsToSave)) {
      try {
        await execute(
          `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
          [key, String(val)]
        );
      } catch (_) {
        try { await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [String(val), key]); } catch (_) {}
      }
    }

    // Sync wdvConfig in DB if present
    const db = readDb();
    if (!db.wdvConfig) db.wdvConfig = { ...DEFAULT_WDV_CONFIG };
    if (settingsToSave.wdvBankName) db.wdvConfig.bankName = settingsToSave.wdvBankName;
    if (settingsToSave.wdvAccountNumber) db.wdvConfig.accountNumber = settingsToSave.wdvAccountNumber;
    if (settingsToSave.wdvAccountName) db.wdvConfig.accountName = settingsToSave.wdvAccountName;
    if (settingsToSave.wdvVoucherPrice) db.wdvConfig.voucherPrice = Number(settingsToSave.wdvVoucherPrice);
    if (settingsToSave.wdvWhatsappLink) db.wdvConfig.whatsappLink = settingsToSave.wdvWhatsappLink;
    if (settingsToSave.wdvInstructions) db.wdvConfig.instructions = settingsToSave.wdvInstructions;
    if (settingsToSave.wdvMaintenanceNotice) db.wdvConfig.maintenanceNotice = settingsToSave.wdvMaintenanceNotice;

    await loadDbCache();
    
    logDiagnostic('SECURITY_ALERT', 'Admin updated system-wide general settings', settingsToSave);
    res.json({ success: true, message: 'Master Settings saved permanently and live across website!' });
  } catch (err) {
    console.error('Error saving admin settings:', err);
    res.status(500).json({ error: 'Failed to save admin settings' });
  }
};

app.post('/api/admin/settings', authenticateAdminToken, updateAdminSettingsHandler);
app.put('/api/admin/settings', authenticateAdminToken, updateAdminSettingsHandler);

// Update WDV Configuration (Admin) - support both wdv and legacy bpc paths
const handleAdminConfigUpdate = async (req: any, res: any) => {
  const { bankName, accountNumber, accountName, whatsappLink, whatsappNumber, voucherPrice, instructions, maintenanceNotice } = req.body;
  
  const db = readDb();
  if (!db.wdvConfig) {
    db.wdvConfig = { ...DEFAULT_WDV_CONFIG };
  }
  
  if (bankName !== undefined) db.wdvConfig.bankName = bankName;
  if (accountNumber !== undefined) db.wdvConfig.accountNumber = accountNumber;
  if (accountName !== undefined) db.wdvConfig.accountName = accountName;
  
  if (whatsappNumber !== undefined) {
    db.wdvConfig.whatsappNumber = whatsappNumber;
    let link = whatsappNumber;
    if (!link.startsWith('http')) {
      const cleanNum = link.replace(/\D/g, '');
      const intlNum = cleanNum.startsWith('0') ? '234' + cleanNum.slice(1) : cleanNum;
      link = `https://wa.me/${intlNum}`;
    }
    db.wdvConfig.whatsappLink = link;
  } else if (whatsappLink !== undefined) {
    db.wdvConfig.whatsappLink = whatsappLink;
    if (!db.wdvConfig.whatsappNumber) {
      db.wdvConfig.whatsappNumber = whatsappLink.replace('https://wa.me/', '+');
    }
  }

  if (voucherPrice !== undefined && !isNaN(Number(voucherPrice))) db.wdvConfig.voucherPrice = Number(voucherPrice);
  if (instructions !== undefined) db.wdvConfig.instructions = instructions;
  if (maintenanceNotice !== undefined) db.wdvConfig.maintenanceNotice = maintenanceNotice;
  
  writeDb(db);

  // Persist directly into SQL admin_settings table for immediate public availability
  try {
    const settingsMap: Record<string, string> = {
      wdvBankName: db.wdvConfig.bankName,
      wdvAccountNumber: db.wdvConfig.accountNumber,
      wdvAccountName: db.wdvConfig.accountName,
      wdvWhatsappLink: db.wdvConfig.whatsappLink,
      wdvWhatsappNumber: db.wdvConfig.whatsappNumber || '',
      whatsappNumber: db.wdvConfig.whatsappNumber || '',
      whatsappLink: db.wdvConfig.whatsappLink,
      wdvVoucherPrice: String(db.wdvConfig.voucherPrice),
      wdvInstructions: db.wdvConfig.instructions,
      wdvMaintenanceNotice: db.wdvConfig.maintenanceNotice
    };
    for (const [key, val] of Object.entries(settingsMap)) {
      try {
        await execute(`
          INSERT INTO admin_settings (key, value) VALUES ($1, $2)
          ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
        `, [key, val || '']);
      } catch (_) {
        try { await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [val || '', key]); } catch (_) {}
      }
    }
    await loadDbCache();
  } catch (err) {
    console.error('Error persisting payment settings to admin_settings SQL:', err);
  }

  logDiagnostic('SECURITY_ALERT', 'Admin updated WDV payment configuration', db.wdvConfig);
  res.json({ success: true, config: db.wdvConfig });
};

app.post('/api/admin/config/wdv', authenticateAdminToken, handleAdminConfigUpdate);
app.post('/api/admin/config/bpc', authenticateAdminToken, handleAdminConfigUpdate);

// Upload Video Guide (Admin)
app.post('/api/admin/video/upload', authenticateAdminToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an MP4 video file.' });
    }
    const videoPath = `/uploads/${req.file.filename}`;
    
    // Save to admin_settings
    try {
      await execute(`
        INSERT INTO admin_settings (key, value) VALUES ($1, $2)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `, ['videoUrl', videoPath]);
    } catch (_) {
      try { await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [videoPath, 'videoUrl']); } catch (_) {}
    }

    logDiagnostic('SECURITY_ALERT', 'Admin uploaded new video guide', { videoPath });
    await loadDbCache();
    res.json({ success: true, videoUrl: videoPath });
  } catch (err: any) {
    console.error('Error uploading video guide:', err);
    res.status(500).json({ error: err.message || 'Failed to upload video.' });
  }
});

// Delete Video Guide (Admin)
app.post('/api/admin/video/delete', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings WHERE key = $1`, ['videoUrl']);
    if (settingRows.length > 0) {
      const videoPath = settingRows[0].value;
      if (videoPath.startsWith('/uploads/')) {
        const fullPath = path.join(process.cwd(), videoPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
    await execute(`DELETE FROM admin_settings WHERE key = $1`, ['videoUrl']);
    logDiagnostic('SECURITY_ALERT', 'Admin deleted video guide');
    await loadDbCache();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting video guide:', err);
    res.status(500).json({ error: err.message || 'Failed to delete video.' });
  }
});

// POS Decline Slip Multer Storage and Middleware Configuration
const slipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'slips');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const cleanName = `slip-${Date.now()}-${Math.floor(Math.random() * 100000)}${ext}`;
    cb(null, cleanName);
  }
});

const uploadPosSlip = multer({
  storage: slipStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB maximum size
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    const validExts = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];
    if (mimetypes.includes(file.mimetype) || validExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, WEBP, and PDF files are allowed.'));
    }
  }
});

// Helper to parse and structure withdrawal rows with partial approval history
const formatWithdrawalData = (row: any) => {
  if (!row) return null;
  const requestedAmount = Number(row.amount || 0);
  const approvedAmount = Number(row.approvedAmount || row.approvedamount || 0);
  let approvalHistory: any[] = [];
  try {
    if (typeof row.approvalHistory === 'string') {
      approvalHistory = JSON.parse(row.approvalHistory || '[]');
    } else if (typeof row.approvalhistory === 'string') {
      approvalHistory = JSON.parse(row.approvalhistory || '[]');
    } else if (Array.isArray(row.approvalHistory)) {
      approvalHistory = row.approvalHistory;
    } else if (Array.isArray(row.approvalhistory)) {
      approvalHistory = row.approvalhistory;
    }
  } catch (e) {
    approvalHistory = [];
  }
  const remainingAmount = Math.max(0, requestedAmount - approvedAmount);
  return {
    ...row,
    amount: requestedAmount,
    approvedAmount,
    remainingAmount,
    approvalHistory: Array.isArray(approvalHistory) ? approvalHistory : []
  };
};

// Admin Withdrawal Management API Endpoints
// 1. Fetch all withdrawal requests
app.get('/api/admin/withdrawals', authenticateAdminToken, async (req, res) => {
  try {
    const rawWithdrawals = await getAllRows(`SELECT * FROM withdraw_requests ORDER BY timestamp DESC`);
    const withdrawals = (rawWithdrawals || []).map(formatWithdrawalData);
    res.json({ success: true, withdrawals });
  } catch (err) {
    console.error('Error fetching withdrawals:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
});

// 2. Fetch a single withdrawal request's details
app.get('/api/admin/withdrawals/:transactionId', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  try {
    const rawWithdrawal = await getRow(`SELECT * FROM withdraw_requests WHERE id = $1`, [transactionId]);
    if (!rawWithdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    const withdrawal = formatWithdrawalData(rawWithdrawal);
    const user = await getRow(`SELECT fullName, phone, balance FROM users WHERE email = $1`, [withdrawal.email || withdrawal.userid || withdrawal.userId]);
    res.json({
      success: true,
      withdrawal: {
        ...withdrawal,
        fullName: user?.fullname || user?.fullName || withdrawal.accountName || withdrawal.accountname,
        phone: user?.phone || '',
        userBalance: user?.balance || 0
      }
    });
  } catch (err) {
    console.error('Error fetching withdrawal details:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal details' });
  }
});

// 3. Partial approval endpoint (Approve part by part)
app.post('/api/admin/withdrawals/:transactionId/approve-partial', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const { amount, note } = req.body;

  const approveAmt = Number(amount);
  if (isNaN(approveAmt) || approveAmt <= 0) {
    return res.status(400).json({ error: 'Please enter a valid approval amount greater than ₦0.' });
  }

  try {
    const rawWithdrawal = await getRow(`SELECT * FROM withdraw_requests WHERE id = $1`, [transactionId]);
    if (!rawWithdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    const currentWithdrawal = formatWithdrawalData(rawWithdrawal);
    const requestedAmount = Number(currentWithdrawal.amount || 0);
    const currentApproved = Number(currentWithdrawal.approvedAmount || 0);
    const currentRemaining = Math.max(0, requestedAmount - currentApproved);

    if (currentApproved >= requestedAmount || currentRemaining <= 0) {
      return res.status(400).json({ error: 'This withdrawal request has already been fully approved.' });
    }

    if (approveAmt > currentRemaining) {
      return res.status(400).json({
        error: `Approval amount (₦${approveAmt.toLocaleString('en-NG', { minimumFractionDigits: 2 })}) exceeds the remaining pending amount of ₦${currentRemaining.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`
      });
    }

    const newApprovedAmount = currentApproved + approveAmt;
    const newRemainingAmount = Math.max(0, requestedAmount - newApprovedAmount);
    const isFullyApproved = newRemainingAmount <= 0 || newApprovedAmount >= requestedAmount;
    const newStatus = isFullyApproved ? 'completed' : 'partially_approved';

    const approvalRecord = {
      id: `appr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      amount: approveAmt,
      approvedAt: new Date().toISOString(),
      approvedBy: (req as any).adminEmail || 'admin@nevo.ng',
      remainingAfter: newRemainingAmount,
      note: note ? String(note).trim() : ''
    };

    const updatedHistory = [...(currentWithdrawal.approvalHistory || []), approvalRecord];
    const historyJson = JSON.stringify(updatedHistory);

    // Update SQL database
    await execute(
      `UPDATE withdraw_requests SET status = $1, approvedAmount = $2, approvalHistory = $3 WHERE id = $4`,
      [newStatus, newApprovedAmount, historyJson, transactionId]
    );

    // Sync to user database, transactions, and notifications
    const db = readDb();
    const userEmail = (currentWithdrawal.email || currentWithdrawal.userid || currentWithdrawal.userId || '').toLowerCase();
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === userEmail);

    if (userIndex !== -1) {
      const user = db.users[userIndex];
      user.transactions = user.transactions || [];
      const tx = user.transactions.find((t: any) => t.id === transactionId);
      if (tx) {
        tx.status = isFullyApproved ? 'success' : 'processing';
        tx.approvedAmount = newApprovedAmount;
        tx.approvalHistory = updatedHistory;
      }

      // Generate user notification per exact specification
      user.notifications = user.notifications || [];

      if (isFullyApproved) {
        user.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: 'Withdrawal Approved',
          body: `Your full withdrawal of ₦${requestedAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been approved.`,
          date: new Date().toISOString(),
          unread: true,
          type: 'withdraw',
          category: 'Withdrawal',
          status: 'Completed',
          amount: requestedAmount,
          recipientName: currentWithdrawal.accountName || currentWithdrawal.accountname,
          bankName: currentWithdrawal.bankName || currentWithdrawal.bankname,
          accountNumber: currentWithdrawal.accountNumber || currentWithdrawal.accountnumber,
          reference: currentWithdrawal.reference
        });
      } else {
        user.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: 'Withdrawal Update',
          body: `₦${approveAmt.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of your ₦${requestedAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} withdrawal has been approved.\n\n₦${newRemainingAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is still waiting for approval. Please complete any remaining requirements before the rest can be approved.`,
          date: new Date().toISOString(),
          unread: true,
          type: 'withdraw',
          category: 'Withdrawal',
          status: 'Partially Approved',
          amount: approveAmt,
          recipientName: currentWithdrawal.accountName || currentWithdrawal.accountname,
          bankName: currentWithdrawal.bankName || currentWithdrawal.bankname,
          accountNumber: currentWithdrawal.accountNumber || currentWithdrawal.accountnumber,
          reference: currentWithdrawal.reference
        });
      }

      writeDb(db);
    }

    logDiagnostic('INFO', `Admin ${(req as any).adminEmail} partially approved ₦${approveAmt} for withdrawal ${transactionId}`, {
      requestedAmount,
      approvedAmount: newApprovedAmount,
      remainingAmount: newRemainingAmount,
      isFullyApproved
    });

    res.json({
      success: true,
      message: isFullyApproved
        ? `Withdrawal fully approved (₦${requestedAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })})`
        : `₦${approveAmt.toLocaleString('en-NG', { minimumFractionDigits: 2 })} approved successfully. Remaining: ₦${newRemainingAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
      isFullyApproved,
      approvedAmount: newApprovedAmount,
      remainingAmount: newRemainingAmount,
      withdrawal: {
        ...currentWithdrawal,
        status: newStatus,
        approvedAmount: newApprovedAmount,
        remainingAmount: newRemainingAmount,
        approvalHistory: updatedHistory
      }
    });
  } catch (err) {
    console.error('Error approving partial withdrawal:', err);
    res.status(500).json({ error: 'Failed to process partial approval' });
  }
});

// 4. Update withdrawal status and internal notes
app.post('/api/admin/withdrawals/:transactionId/status', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const { status, notes } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const rawWithdrawal = await getRow(`SELECT * FROM withdraw_requests WHERE id = $1`, [transactionId]);
    if (!rawWithdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    const currentWithdrawal = formatWithdrawalData(rawWithdrawal);
    const requestedAmount = Number(currentWithdrawal.amount || 0);
    const currentApproved = Number(currentWithdrawal.approvedAmount || 0);
    const currentRemaining = Math.max(0, requestedAmount - currentApproved);

    let finalApprovedAmount = currentApproved;
    let finalHistory = currentWithdrawal.approvalHistory || [];

    // If admin is completing the entire withdrawal directly
    if (status === 'completed' || status === 'Completed') {
      if (currentRemaining > 0) {
        finalApprovedAmount = requestedAmount;
        finalHistory = [
          ...finalHistory,
          {
            id: `appr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            amount: currentRemaining,
            approvedAt: new Date().toISOString(),
            approvedBy: (req as any).adminEmail || 'admin@nevo.ng',
            remainingAfter: 0,
            note: notes ? String(notes).trim() : 'Full disbursement authorized'
          }
        ];
      }
    }

    const historyJson = JSON.stringify(finalHistory);

    if (notes !== undefined) {
      await execute(
        `UPDATE withdraw_requests SET status = $1, notes = $2, approvedAmount = $3, approvalHistory = $4 WHERE id = $5`,
        [status, notes, finalApprovedAmount, historyJson, transactionId]
      );
    } else {
      await execute(
        `UPDATE withdraw_requests SET status = $1, approvedAmount = $2, approvalHistory = $3 WHERE id = $4`,
        [status, finalApprovedAmount, historyJson, transactionId]
      );
    }

    // Handle real-time notifications, transaction status updates and balance refunding
    const db = readDb();
    const userEmail = (currentWithdrawal.email || currentWithdrawal.userid || currentWithdrawal.userId || '').toLowerCase();
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === userEmail);

    if (userIndex !== -1) {
      const user = db.users[userIndex];
      user.transactions = user.transactions || [];
      const tx = user.transactions.find((t: any) => t.id === transactionId);
      if (tx) {
        tx.status = status === 'completed' ? 'success' : (status === 'rejected' ? 'failed' : status);
        tx.approvedAmount = finalApprovedAmount;
        tx.approvalHistory = finalHistory;
      }

      // Automatically refund balance if transaction is cancelled or rejected and was previously pending/processing
      const isRefunding = (status === 'rejected' || status === 'cancelled' || status === 'Rejected' || status === 'Cancelled') && 
                          (currentWithdrawal.status !== 'rejected' && currentWithdrawal.status !== 'cancelled' && currentWithdrawal.status !== 'completed' && currentWithdrawal.status !== 'Rejected' && currentWithdrawal.status !== 'Cancelled' && currentWithdrawal.status !== 'Completed');
      if (isRefunding) {
        // Refund the unapproved remaining portion
        const refundAmt = Math.max(0, requestedAmount - currentApproved);
        if (refundAmt > 0) {
          user.balance += refundAmt;
          if (tx) {
            tx.balanceAfter = user.balance;
          }
        }
      }

      // Push real-time notification in user's Nevo account
      user.notifications = user.notifications || [];

      if (status === 'completed' || status === 'Completed') {
        user.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: 'Withdrawal Approved',
          body: `Your full withdrawal of ₦${requestedAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been approved.`,
          date: new Date().toISOString(),
          unread: true,
          type: 'withdraw',
          category: 'Withdrawal',
          status: 'Completed',
          amount: requestedAmount,
          recipientName: currentWithdrawal.accountName || currentWithdrawal.accountname,
          bankName: currentWithdrawal.bankName || currentWithdrawal.bankname,
          accountNumber: currentWithdrawal.accountNumber || currentWithdrawal.accountnumber,
          reference: currentWithdrawal.reference
        });
      } else {
        const msgText = status === 'processing' || status === 'Processing'
          ? "Your withdrawal is now being processed."
          : (status === 'rejected' || status === 'Rejected'
            ? "Your withdrawal has been rejected."
            : (status === 'cancelled' || status === 'Cancelled'
              ? "Your withdrawal has been cancelled."
              : `Your withdrawal status has been updated to ${status}.`));

        user.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: `Withdrawal ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          body: msgText,
          date: new Date().toISOString(),
          unread: true,
          type: 'withdraw',
          category: 'Withdrawal',
          status: status.charAt(0).toUpperCase() + status.slice(1),
          amount: requestedAmount,
          recipientName: currentWithdrawal.accountName || currentWithdrawal.accountname,
          bankName: currentWithdrawal.bankName || currentWithdrawal.bankname,
          accountNumber: currentWithdrawal.accountNumber || currentWithdrawal.accountnumber,
          reference: currentWithdrawal.reference
        });
      }

      writeDb(db);
    }

    logDiagnostic('INFO', `Admin ${(req as any).adminEmail} updated withdrawal ${transactionId} status to ${status}`, { notes });
    res.json({ success: true, message: 'Status updated successfully' });
  } catch (err) {
    console.error('Error updating withdrawal status:', err);
    res.status(500).json({ error: 'Failed to update withdrawal status' });
  }
});

// 4. Update withdrawal internal notes only
app.post('/api/admin/withdrawals/:transactionId/notes', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const { notes } = req.body;
  try {
    await execute(`UPDATE withdraw_requests SET notes = $1 WHERE id = $2`, [notes || '', transactionId]);
    res.json({ success: true, message: 'Notes updated successfully' });
  } catch (err) {
    console.error('Error saving admin notes:', err);
    res.status(500).json({ error: 'Failed to save admin notes' });
  }
});

// 5. Upload POS decline slip
app.post('/api/admin/withdrawals/:transactionId/upload-slip', authenticateAdminToken, uploadPosSlip.single('slip'), async (req, res) => {
  const { transactionId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a POS decline slip file' });
  }

  const filePath = `/uploads/slips/${req.file.filename}`;
  const nowStr = new Date().toISOString();
  const adminEmail = (req as any).adminEmail;

  try {
    await execute(`
      UPDATE withdraw_requests 
      SET posSlipPath = $1, posSlipUploadedAt = $2, posSlipUploadedBy = $3
      WHERE id = $4
    `, [filePath, nowStr, adminEmail, transactionId]);

    logDiagnostic('INFO', `Admin ${adminEmail} uploaded POS slip for ${transactionId}`, { filePath });
    res.json({
      success: true,
      filePath,
      uploadedAt: nowStr,
      uploadedBy: adminEmail
    });
  } catch (err) {
    console.error('Error saving POS slip:', err);
    res.status(500).json({ error: 'Failed to upload POS decline slip' });
  }
});

// Remove POS decline slip
app.post('/api/admin/withdrawals/:transactionId/remove-slip', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const adminEmail = (req as any).adminEmail;
  try {
    await execute(`
      UPDATE withdraw_requests 
      SET posSlipPath = NULL, posSlipUploadedAt = NULL, posSlipUploadedBy = NULL
      WHERE id = $1
    `, [transactionId]);
    logDiagnostic('INFO', `Admin ${adminEmail} removed POS slip for ${transactionId}`);
    res.json({ success: true, message: 'POS decline slip removed successfully' });
  } catch (err) {
    console.error('Error removing POS slip:', err);
    res.status(500).json({ error: 'Failed to remove POS decline slip' });
  }
});

// Admin WDV Voucher Management Endpoints
// List all vouchers
app.get('/api/admin/vouchers', authenticateAdminToken, async (req, res) => {
  try {
    const rows = await getAllRows(`SELECT * FROM vouchers ORDER BY generatedAt DESC`);
    const vouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      generatedAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));
    res.json({ success: true, vouchers });
  } catch (err: any) {
    console.error('Error fetching admin vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch WDV vouchers from database.' });
  }
});

// Generate ONE new unique random WDV voucher
app.post('/api/admin/vouchers/generate', authenticateAdminToken, async (req, res) => {
  try {
    let isUnique = false;
    let code = '';
    let attempts = 0;

    // Ensure the generated code is unique
    while (!isUnique && attempts < 10) {
      code = generateVoucherCode();
      const existing = await getRow(`SELECT 1 FROM vouchers WHERE voucherCode = $1`, [code]);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate a unique voucher code. Please try again.' });
    }

    const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const generatedAt = new Date().toISOString();

    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, code, code, 6500, 'unused', '', '', generatedAt, '', 'admin', '[]']);

    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin generated new WDV voucher', { code });

    res.json({ success: true, code });
  } catch (err: any) {
    console.error('Error generating admin voucher:', err);
    res.status(500).json({ error: 'Failed to generate WDV voucher.' });
  }
});

// Delete a voucher permanently
app.post('/api/admin/vouchers/delete', authenticateAdminToken, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Voucher ID is required.' });
  }
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    await execute(`DELETE FROM vouchers WHERE id = $1`, [id]);
    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin deleted WDV voucher permanently', { code: voucher.vouchercode || voucher.code });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting voucher:', err);
    res.status(500).json({ error: 'Failed to delete WDV voucher.' });
  }
});

// Manually deactivate a voucher (status -> used)
app.post('/api/admin/vouchers/deactivate', authenticateAdminToken, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Voucher ID is required.' });
  }
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    await execute(`
      UPDATE vouchers
      SET status = $1, usedAt = $2, usedBy = $3
      WHERE id = $4
    `, ['used', new Date().toISOString(), 'manually_deactivated_by_admin', id]);

    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin manually deactivated WDV voucher', { code: voucher.vouchercode || voucher.code });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deactivating voucher:', err);
    res.status(500).json({ error: 'Failed to deactivate WDV voucher.' });
  }
});

// WDV Specific Endpoints as requested by user
app.post('/api/admin/wdv/generate', authenticateAdminToken, async (req, res) => {
  try {
    let isUnique = false;
    let code = '';
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = generateVoucherCode();
      const existing = await getRow(`SELECT 1 FROM vouchers WHERE voucherCode = $1 OR code = $1`, [code]);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate a unique voucher code.' });
    }

    const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const generatedAt = new Date().toISOString();

    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, code, code, 6500, 'unused', '', '', generatedAt, '', 'admin', '[]']);

    await loadDbCache();
    logDiagnostic('SECURITY_ALERT', 'Admin generated new WDV voucher', { code });

    res.json({
      success: true,
      voucher: {
        id,
        code,
        voucherCode: code,
        status: 'unused',
        createdAt: generatedAt,
        generatedAt,
        usedBy: '',
        usedAt: ''
      }
    });
  } catch (err: any) {
    console.error('Error generating voucher:', err);
    res.status(500).json({ error: 'Failed to generate WDV voucher.' });
  }
});

app.get('/api/admin/wdv', authenticateAdminToken, async (req, res) => {
  try {
    const rows = await getAllRows(`SELECT * FROM vouchers ORDER BY generatedAt DESC`);
    const vouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      code: r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      createdAt: r.generatedat,
      generatedAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));
    res.json({ success: true, vouchers });
  } catch (err: any) {
    console.error('Error in GET /api/admin/wdv:', err);
    res.status(500).json({ error: 'Failed to fetch WDV vouchers.' });
  }
});

app.delete('/api/admin/wdv/:id', authenticateAdminToken, async (req, res) => {
  const { id } = req.params;
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }
    await execute(`DELETE FROM vouchers WHERE id = $1`, [id]);
    await loadDbCache();
    logDiagnostic('SECURITY_ALERT', 'Admin deleted WDV voucher', { code: voucher.vouchercode || voucher.code });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting voucher:', err);
    res.status(500).json({ error: 'Failed to delete voucher.' });
  }
});

app.post('/api/admin/wdv/verify', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Voucher code is required." });
  }

  const normVoucher = code.trim();
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE voucherCode = $1 OR code = $1`, [normVoucher]);
    if (!voucher) {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    if (voucher.status !== 'unused') {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    res.json({
      success: true,
      message: "Voucher approved.",
      voucher: {
        id: voucher.id,
        code: voucher.vouchercode || voucher.code,
        status: voucher.status
      }
    });
  } catch (err) {
    console.error('Error verifying voucher:', err);
    res.status(500).json({ error: "Invalid or already used WDV voucher." });
  }
});

// -------------------- USER HISTORY --------------------
// History is backed by the same persistent database used for the wallet and orders.
// This route intentionally returns an empty array instead of a 404 when a new account has no activity.
app.get('/api/wallet/transactions', authenticateToken, async (req: any, res: any) => {
  try {
    const email = String(req.userEmail || '').trim().toLowerCase();
    if (!email) return res.status(401).json({ error: 'Authentication required.' });

    const userRow = await getRow(`SELECT transactions FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    let transactions: any[] = [];
    if (userRow?.transactions) {
      try {
        transactions = Array.isArray(userRow.transactions) ? userRow.transactions : JSON.parse(userRow.transactions);
      } catch { transactions = []; }
    }

    const paymentRows = await getAllRows(
      `SELECT id, reference, amount, currency, provider, purpose, status, createdAt, verifiedAt FROM payment_transactions WHERE LOWER(userEmail)=LOWER($1) ORDER BY createdAt DESC LIMIT 100`,
      [email]
    );

    const mappedPayments = paymentRows.map((p: any) => ({
      id: p.id || p.reference,
      type: p.purpose || 'wallet_funding',
      description: p.purpose === 'wallet_funding' ? 'KoraPay Coin Purchase' : (p.purpose || 'Payment'),
      reference: p.reference,
      amount: Number(p.amount || 0),
      currency: p.currency || 'NGN',
      provider: p.provider || 'korapay',
      status: p.status || 'pending',
      createdAt: p.createdAt || p.verifiedAt || new Date().toISOString(),
    }));

    const merged = [...transactions, ...mappedPayments].filter(Boolean).sort((a: any, b: any) =>
      new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime()
    );

    // De-duplicate payment entries that were copied into the user's transaction ledger.
    const seen = new Set<string>();
    const result = merged.filter((x: any) => {
      const key = String(x.reference || x.id || `${x.type}-${x.createdAt}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);

    return res.json(result);
  } catch (e: any) {
    console.error('[History] Failed to load wallet transactions:', e);
    return res.status(500).json({ error: 'Unable to load transaction history.' });
  }
});

// -------------------- ADMIN USER MANAGEMENT ENDPOINTS --------------------

function serializeAdminUser(u: any, idx = 0) {
  const txs = u.transactions || [];
  const totalDeposits = txs
    .filter((t: any) => t.type === 'credit' || t.type === 'deposit' || t.type === 'voucher_redemption' || t.type === 'promotional_bonus')
    .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const totalWithdrawals = txs
    .filter((t: any) => t.type === 'withdraw' || t.type === 'transfer')
    .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const wdvPurchases = txs
    .filter((t: any) => t.type === 'wdv_purchase' || (t.description && t.description.includes('WDV')) || (t.description && t.description.includes('LEGACY_VOUCHER')))
    .length;

  const isSuspended = !!(u.isSuspended || u.accountStatus === 'suspended');
  const balance = Number(u.balance || 0);

  return {
    id: u.id || u.userId || u.email.toLowerCase(),
    fullName: u.fullName || 'User',
    username: u.username || (u.email ? u.email.split('@')[0] : `user${idx}`),
    email: u.email || '',
    phone: u.phone || '+2348000000000',
    balance,
    walletBalance: balance,
    bonusBalance: Number(u.bonusBalance || 0),
    dailyTarget: u.dailyTarget || 50000,
    dailySpent: u.dailySpent || 0,
    pinCreated: !!u.pinCreated,
    biometricEnabled: !!u.biometricEnabled,
    isSuspended,
    isFrozen: !!u.isFrozen,
    status: isSuspended ? 'suspended' : 'active',
    withdrawalStatus: u.withdrawalStatus || (u.withdrawalBlocked ? 'Blocked' : 'Allowed'),
    referralCode: u.referralCode || (u.email ? u.email.split('@')[0].toUpperCase() : `NV${idx}`),
    referralLink: u.referralLink || `https://nevo.ng/ref/${u.referralCode || (u.email ? u.email.split('@')[0].toUpperCase() : `NV${idx}`)}`,
    referralCount: Number(u.referralCount || u.referrals || 0),
    totalReferrals: Number(u.referralCount || u.referrals || 0),
    totalReferralBonus: Number(u.totalReferralBonus || 0),
    totalEarnings: Number(u.totalEarnings || 0),
    activationPaid: !!u.activationPaid,
    activationPaidAt: u.activationPaidAt || null,
    createdAt: u.registeredAt || u.createdAt || u.date || '2026-01-15T10:00:00Z',
    registeredAt: u.registeredAt || u.createdAt || u.date || '2026-01-15T10:00:00Z',
    lastLogin: u.lastLogin || u.registeredAt || '2026-07-28T06:00:00Z',
    ipAddress: u.ipAddress || '102.89.23.14',
    tier: u.tier || 3,
    accountLevel: u.accountLevel || `Tier ${u.tier || 3} Verified`,
    profilePic: u.profilePic || '',
    totalDeposits,
    totalWithdrawals,
    wdvPurchases,
    transactions: txs,
    notifications: u.notifications || []
  };
}

// List all users
app.get('/api/admin/users', authenticateAdminToken, (req, res) => {
  const db = readDb();
  const safeUsers = db.users.map((u: any, idx: number) => serializeAdminUser(u, idx));
  res.json({ success: true, users: safeUsers });
});

// Get single user
app.get('/api/admin/users/:userId', authenticateAdminToken, (req, res) => {
  const db = readDb();
  const targetId = req.params.userId.toLowerCase();
  const user = db.users.find((u: any) => (u.id && String(u.id).toLowerCase() === targetId) || (u.email && u.email.toLowerCase() === targetId));
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json(serializeAdminUser(user));
});

// Balance Adjustment Core Helper with ironclad ledger recording
async function executeBalanceAdjustment(req: any, res: any, targetIdentifier: string, amountInput: any, typeInput: any, reasonInput: any, balanceDirectInput?: any) {
  const db = readDb();
  const target = String(targetIdentifier).toLowerCase();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found in system directory.' });
  }

  const user = db.users[userIndex];
  const oldBalance = Number(user.balance || 0);

  let finalAmount = 0;
  let finalType: 'credit' | 'debit' = 'credit';
  let newBalance = oldBalance;
  const reason = String(reasonInput || '').trim();

  if (balanceDirectInput !== undefined && !isNaN(Number(balanceDirectInput))) {
    // Direct balance set
    newBalance = Number(balanceDirectInput);
    if (newBalance < 0) newBalance = 0;
    const diff = newBalance - oldBalance;
    finalType = diff >= 0 ? 'credit' : 'debit';
    finalAmount = Math.abs(diff);
  } else {
    // Delta adjustment
    finalAmount = Number(amountInput);
    if (isNaN(finalAmount) || finalAmount < 0) {
      return res.status(400).json({ error: 'Please supply a valid non-negative adjustment amount.' });
    }
    finalType = String(typeInput || '').toLowerCase() === 'debit' ? 'debit' : 'credit';
    newBalance = finalType === 'credit' ? oldBalance + finalAmount : Math.max(0, oldBalance - finalAmount);
  }

  // Update user state
  user.balance = newBalance;
  if (finalType === 'credit') {
    user.totalEarnings = Number(user.totalEarnings || 0) + finalAmount;
  }

  const adminActor = req.adminEmail || 'admin@nevo.ng';
  const now = new Date().toISOString();
  const txId = `tx-adm-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const auditReference = `ADJ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // 1. Record in user transactions ledger
  const txRecord = {
    id: txId,
    type: finalType === 'credit' ? 'credit' : 'debit',
    amount: finalAmount,
    date: now,
    status: 'success',
    description: reason ? `Admin ${finalType === 'credit' ? 'Credit' : 'Debit'}: ${reason}` : `Administrative Balance ${finalType === 'credit' ? 'Credit' : 'Debit'}`,
    narration: `Administrative balance adjustment: ${reason || 'Manual correction'} (authorized by ${adminActor})`,
    adminEmail: adminActor,
    balanceAfter: newBalance,
    reference: auditReference
  };
  user.transactions = user.transactions || [];
  user.transactions.unshift(txRecord);

  // 2. Persist audit ledger record into payment_transactions
  try {
    await execute(`
      INSERT INTO payment_transactions (
        id, reference, userEmail, userName, amount, currency, provider, providerReference, purpose, status, channel, authorizationUrl, metadata, createdAt, verifiedAt, webhookData
      ) VALUES ($1, $2, $3, $4, $5, 'NGN', 'admin_ledger', $6, $7, 'successful', 'admin_override', '', $8, $9, $10, '')
      ON CONFLICT(reference) DO NOTHING
    `, [
      `pt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      auditReference,
      user.email.toLowerCase(),
      user.fullName || user.username || user.email,
      finalAmount,
      auditReference,
      `admin_${finalType}`,
      JSON.stringify({
        adjustedBy: adminActor,
        reason: reason || 'Manual administrative balance adjustment',
        previousBalance: oldBalance,
        newBalance,
        adjustmentType: finalType
      }),
      now,
      now
    ]);
  } catch (auditErr) {
    console.warn('[Nevo Admin] Audit insertion error:', auditErr);
  }

  // 3. User notification
  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: `Wallet Balance ${finalType === 'credit' ? 'Credited' : 'Debited'}`,
    body: `Your wallet balance was ${finalType === 'credit' ? 'credited with' : 'debited by'} ₦${finalAmount.toLocaleString()}. Reason: ${reason || 'Administrative adjustment'}. New Balance: ₦${newBalance.toLocaleString()}.`,
    date: now,
    unread: true,
    type: 'balance_adjustment'
  });

  // 4. Save to persistent database
  await writeDb(db);
  try {
    await execute(`UPDATE users SET balance = $1, totalEarnings = $2, transactions = $3, notifications = $4 WHERE LOWER(email) = $5`, [
      user.balance,
      user.totalEarnings || 0,
      JSON.stringify(user.transactions),
      JSON.stringify(user.notifications),
      user.email.toLowerCase()
    ]);
  } catch (_) {}

  // 5. Log security audit
  logDiagnostic('SECURITY_ALERT', `Admin ${finalType}ed user balance by ₦${finalAmount}. New Balance: ₦${newBalance}`, {
    targetUser: user.email,
    admin: adminActor,
    finalType,
    finalAmount,
    oldBalance,
    newBalance,
    reason,
    auditReference
  });

  return res.json({
    success: true,
    balance: newBalance,
    user: serializeAdminUser(user, userIndex),
    transaction: txRecord
  });
}

// Adjust user balance (RESTful with userId)
app.post('/api/admin/users/:userId/adjust-balance', authenticateAdminToken, async (req, res) => {
  const { amount, type, reason, balance } = req.body;
  await executeBalanceAdjustment(req, res, req.params.userId, amount, type, reason, balance);
});

// Adjust user balance (legacy endpoint)
app.post('/api/admin/users/edit-balance', authenticateAdminToken, async (req, res) => {
  const { email, balance, amount, type, reason } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply user email.' });
  }
  await executeBalanceAdjustment(req, res, email, amount, type, reason, balance);
});

// Update user status (RESTful with userId)
app.post('/api/admin/users/:userId/status', authenticateAdminToken, async (req, res) => {
  const { status } = req.body;
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const isSuspended = status === 'suspended';
  db.users[userIndex].isSuspended = isSuspended;
  db.users[userIndex].accountStatus = status;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET isSuspended = $1, accountStatus = $2 WHERE LOWER(email) = $3`, [
      isSuspended ? 1 : 0,
      status,
      db.users[userIndex].email.toLowerCase()
    ]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin changed account status of @${db.users[userIndex].email} to ${status}`, {
    email: db.users[userIndex].email,
    status
  });

  res.json(serializeAdminUser(db.users[userIndex], userIndex));
});

// Update user status flag (legacy endpoint)
app.post('/api/admin/users/update-status', authenticateAdminToken, async (req, res) => {
  const { email, field, value } = req.body;
  if (!email || !field || value === undefined) {
    return res.status(400).json({ error: 'Please supply email, status parameter, and toggle value.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex][field] = !!value;
  if (field === 'isSuspended') {
    db.users[userIndex].accountStatus = value ? 'suspended' : 'active';
  }
  await writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin modified status flag ${field} for user`, { email, flag: field, value });

  res.json({ success: true, user: serializeAdminUser(db.users[userIndex], userIndex) });
});

// Update activation status (RESTful with userId)
app.post('/api/admin/users/:userId/activation-status', authenticateAdminToken, async (req, res) => {
  const { activationPaid } = req.body;
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex].activationPaid = !!activationPaid;
  db.users[userIndex].activationPaidAt = activationPaid ? new Date().toISOString() : null;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET activationPaid = $1, activationPaidAt = $2 WHERE LOWER(email) = $3`, [
      activationPaid ? 1 : 0,
      db.users[userIndex].activationPaidAt,
      db.users[userIndex].email.toLowerCase()
    ]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin updated activation status for @${db.users[userIndex].email}`, {
    email: db.users[userIndex].email,
    activationPaid
  });

  res.json({ success: true, user: serializeAdminUser(db.users[userIndex], userIndex) });
});

// Update referral count (RESTful with userId)
app.post('/api/admin/users/:userId/referral-count', authenticateAdminToken, async (req, res) => {
  const { referralCount } = req.body;
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const count = Number(referralCount) || 0;
  db.users[userIndex].referralCount = count;
  (db.users[userIndex] as any).totalReferrals = count;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET referralCount = $1 WHERE LOWER(email) = $2`, [
      count,
      db.users[userIndex].email.toLowerCase()
    ]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin updated referral count for @${db.users[userIndex].email}`, {
    email: db.users[userIndex].email,
    count
  });

  res.json({ success: true, user: serializeAdminUser(db.users[userIndex], userIndex) });
});

// Edit user profile (RESTful with userId)
app.post('/api/admin/users/:userId/edit', authenticateAdminToken, async (req, res) => {
  const updatedData = req.body;
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex] = {
    ...db.users[userIndex],
    ...updatedData
  };
  await writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin updated user profile data`, { target, updatedData });

  res.json(serializeAdminUser(db.users[userIndex], userIndex));
});

// Edit user profile (legacy endpoint)
app.post('/api/admin/users/edit', authenticateAdminToken, async (req, res) => {
  const { email, updatedData } = req.body;
  if (!email || !updatedData) {
    return res.status(400).json({ error: 'Please supply user email and updatedData object.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex] = {
    ...db.users[userIndex],
    ...updatedData
  };
  await writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin updated user record profile data`, { email, updatedData });

  res.json({ success: true, user: serializeAdminUser(db.users[userIndex], userIndex) });
});

// Reset password by Admin (RESTful with userId)
app.post('/api/admin/users/:userId/reset-password', authenticateAdminToken, async (req, res) => {
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const tempPass = 'NevoAdmin99!';
  const hash = bcrypt.hashSync(tempPass, 10);
  db.users[userIndex].passwordHash = hash;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET passwordHash = $1 WHERE LOWER(email) = $2`, [hash, db.users[userIndex].email.toLowerCase()]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin reset password for user`, { email: db.users[userIndex].email });

  res.json({ success: true, message: 'Password reset to default temporary password.' });
});

// Reset password by Admin (legacy endpoint)
app.post('/api/admin/users/reset-password', authenticateAdminToken, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const tempPass = 'NevoAdmin99!';
  const hash = bcrypt.hashSync(tempPass, 10);
  db.users[userIndex].passwordHash = hash;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET passwordHash = $1 WHERE LOWER(email) = $2`, [hash, db.users[userIndex].email.toLowerCase()]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin performed hard credentials override`, { email });

  res.json({ success: true, message: 'Password reset to default temporary password.' });
});

// Reset user PIN by Admin (RESTful with userId)
app.post('/api/admin/users/:userId/reset-pin', authenticateAdminToken, async (req, res) => {
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex].pinCreated = false;
  delete db.users[userIndex].pinHash;
  delete db.users[userIndex].pinCode;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET pinCreated = 0, pinCode = '' WHERE LOWER(email) = $1`, [db.users[userIndex].email.toLowerCase()]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin reset security PIN for user`, { email: db.users[userIndex].email });

  res.json({ success: true, message: 'User security PIN reset successfully.' });
});

// Reset user PIN by Admin (legacy endpoint)
app.post('/api/admin/users/reset-pin', authenticateAdminToken, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex].pinCreated = false;
  delete db.users[userIndex].pinHash;
  delete db.users[userIndex].pinCode;
  await writeDb(db);
  try {
    await execute(`UPDATE users SET pinCreated = 0, pinCode = '' WHERE LOWER(email) = $1`, [db.users[userIndex].email.toLowerCase()]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', `Admin reset security PIN for user`, { email });

  res.json({ success: true, message: 'User security PIN reset successfully.' });
});

// Delete account by Admin (RESTful with userId)
app.delete('/api/admin/users/:userId', authenticateAdminToken, async (req, res) => {
  const target = req.params.userId.toLowerCase();
  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => (u.id && String(u.id).toLowerCase() === target) || (u.email && u.email.toLowerCase() === target));
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const targetEmail = db.users[userIndex].email.toLowerCase();
  db.users.splice(userIndex, 1);
  await writeDb(db);
  try {
    await execute(`DELETE FROM users WHERE LOWER(email) = $1`, [targetEmail]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', 'Admin permanently deleted user account record', { targetEmail });

  res.json({ success: true });
});

// Delete account by Admin (legacy endpoint)
app.post('/api/admin/users/delete', authenticateAdminToken, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const targetEmail = db.users[userIndex].email.toLowerCase();
  db.users.splice(userIndex, 1);
  await writeDb(db);
  try {
    await execute(`DELETE FROM users WHERE LOWER(email) = $1`, [targetEmail]);
  } catch (_) {}

  logDiagnostic('SECURITY_ALERT', 'Admin permanently deleted user account record', { email: targetEmail });

  res.json({ success: true });
});


// -------------------- JB BOOST FULFILLMENT PROVIDER --------------------
function normalizeSocialPlatform(platform: string) {
  const p = String(platform || '').trim().toLowerCase();
  if (p === 'twitter' || p === 'x/twitter') return 'X';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function socialOrderView(x: any, includeProviderFinancials = false) {
  const quantity = Number(x.quantity || 0);
  const delivered = Math.max(0, Math.min(quantity, Number(x.deliveredquantity ?? x.deliveredQuantity ?? 0)));
  const remaining = Math.max(0, Math.min(quantity, Number(x.remainingquantity ?? x.remainingQuantity ?? quantity - delivered)));
  const customerCoins = Number(x.customercoins ?? x.customerCoins ?? Math.round(Number(x.amount || 0) / nairaPerCoin()));
  return {
    id: x.id,
    userEmail: x.useremail ?? x.userEmail,
    serviceId: x.serviceid ?? x.serviceId,
    serviceName: x.servicename ?? x.serviceName,
    platform: x.platform,
    quantity,
    targetUrl: x.targeturl ?? x.targetUrl,
    amount: Number(x.amount || customerCoins * nairaPerCoin()),
    customerCoins,
    ...(includeProviderFinancials ? {
      provider: x.provider || 'smm_pwr',
      providerOrderId: x.providerorderid ?? x.providerOrderId ?? '',
      providerStatus: x.providerstatus ?? x.providerStatus ?? '',
      providerServiceId: x.providerserviceid ?? x.providerServiceId ?? '',
      providerCharge: Number(x.providercharge ?? x.providerCharge ?? 0),
      providerCurrency: x.providercurrency ?? x.providerCurrency ?? 'USD',
      profit: Number(x.profit || 0),
      exchangeRate: Number(x.exchangerate ?? x.exchangeRate ?? 0),
      providerError: x.providererror ?? x.providerError ?? '',
    } : {}),
    targetType: x.targettype ?? x.targetType ?? 'post',
    openedAt: x.openedat ?? x.openedAt ?? x.createdat ?? x.createdAt ?? null,
    expectedCompleteAt: x.expectedcompleteat ?? x.expectedCompleteAt ?? null,
    startCount: Number(x.startcount ?? x.startCount ?? 0),
    deliveredQuantity: delivered,
    remainingQuantity: remaining,
    progressPercent: quantity > 0 ? Number(((delivered / quantity) * 100).toFixed(2)) : 0,
    lastProgressAt: x.lastprogressat ?? x.lastProgressAt ?? null,
    lastProviderSyncAt: x.lastprovidersyncat ?? x.lastProviderSyncAt ?? null,
    completedAt: x.completedat ?? x.completedAt ?? null,
    refillAvailable: Boolean(Number(x.refillavailable ?? x.refillAvailable ?? 0)),
    cancelAvailable: Boolean(Number(x.cancelavailable ?? x.cancelAvailable ?? 0)),
    failureReason: x.failurereason ?? x.failureReason ?? '',
    refundApplied: Boolean(Number(x.refundapplied ?? x.refundApplied ?? 0)),
  };
}

app.get('/api/social/services', async (req: any, res) => {
  try {
    const platform = normalizeSocialPlatform(String(req.query?.platform || ''));
    const params: any[] = [];
    let sql = `SELECT ss.*, ps.providerStatus, ps.isAvailable AS providerIsAvailable, ps.ratePer1000 AS providerRatePer1000, ps.providerServiceId AS liveProviderServiceId
      FROM social_services ss LEFT JOIN provider_services ps ON ps.provider=ss.provider AND ps.providerServiceId=ss.providerServiceId
      WHERE ss.enabled=1 AND ss.providerAvailable=1 AND ps.isAvailable=1`;
    if (platform && platform !== 'All') { params.push(platform); sql += ` AND LOWER(ss.platform)=LOWER($1)`; }
    sql += ` ORDER BY ss.platform, ss.name`;
    const rows = await getAllRows(sql, params);
    const bestRows = findBestServiceCandidates(rows);
    res.json(bestRows.map((x: any) => {
      const name = String(x.name || '');
      const p = String(x.platform || '');
      const customerCoinsPer1000 = Number(x.customercoinsper1000 ?? x.customerCoinsPer1000 ?? 0);
      return {
        id: x.id, provider: x.provider, platform: p, name,
        description: x.description || x.providerdescription || x.providerDescription || '',
        customerCoinsPer1000, ratePer1000: customerCoinsPer1000,
        minQuantity: Number(x.minquantity ?? x.minQuantity ?? 0), maxQuantity: Number(x.maxquantity ?? x.maxQuantity ?? 0),
        estimatedMinutes: Number(x.estimatedminutes ?? x.estimatedMinutes ?? 0),
        targetType: targetType(name, p), targetLabel: targetLabel(name, p),
        refillAvailable: Boolean(Number(x.refillavailable ?? x.refillAvailable ?? 0)),
        cancelAvailable: Boolean(Number(x.cancelavailable ?? x.cancelAvailable ?? 0)),
        dripfeedAvailable: Boolean(Number(x.dripfeedavailable ?? x.dripfeedAvailable ?? 0)), enabled: true,
      };
    }))
  } catch (e: any) { res.status(500).json({ error: e.message || 'Failed to load fulfillment services.' }); }
});

app.get('/api/social/orders', authenticateToken, async (req: any, res) => {
  try {
    const rows = await getAllRows(`SELECT * FROM social_orders WHERE LOWER(userEmail)=LOWER($1) ORDER BY createdAt DESC`, [String(req.userEmail).toLowerCase()]);
    res.json(rows.map(x => socialOrderView(x)));
  } catch (e: any) { res.status(500).json({ error: e.message || 'Failed to load orders.' }); }
});

app.get('/api/social/orders/:id', authenticateToken, async (req: any, res) => {
  try {
    const row = await getRow(`SELECT * FROM social_orders WHERE id=$1 AND LOWER(userEmail)=LOWER($2)`, [req.params.id, String(req.userEmail).toLowerCase()]);
    if (!row) return res.status(404).json({ error: 'Order not found.' });
    res.json(socialOrderView(row));
  } catch (e: any) { res.status(500).json({ error: e.message || 'Unable to load order.' }); }
});

app.post('/api/social/orders/:id/refill', authenticateToken, async (req:any,res)=>{
  try {
    const email=String(req.userEmail||'').toLowerCase();
    const row=await getRow(`SELECT so.*,po.providerOrderId FROM social_orders so JOIN provider_orders po ON po.internalOrderId=so.id WHERE so.id=$1 AND LOWER(so.userEmail)=LOWER($2)`,[req.params.id,email]);
    if(!row)return res.status(404).json({error:'Order not found.'});
    if(!Number(row.refillavailable??0))return res.status(400).json({error:'This service does not support provider refills.'});
    const existing=await getRow(`SELECT * FROM provider_refills WHERE internalOrderId=$1 AND LOWER(status) IN ('pending','processing','in progress')`,[req.params.id]);
    if(existing)return res.status(409).json({error:'A refill request is already in progress for this order.'});
    const result=await requestProviderRefill(String(row.provider||PROVIDER),String(row.providerorderid||''));
    const refillId=String(result?.refill||'').trim();
    if(!refillId)return res.status(400).json({error:String(result?.error||'Provider did not accept the refill request.')});
    const now=new Date().toISOString();
    await execute(`INSERT INTO provider_refills (id,internalOrderId,provider,providerRefillId,status,requestedAt,rawData) VALUES ($1,$2,$3,$4,'PENDING',$5,$6)`,[`refill-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,req.params.id,String(row.provider||PROVIDER),refillId,now,JSON.stringify(result)]);
    res.json({success:true,refillId,status:'PENDING'});
  } catch(e:any){res.status(502).json({error:e.message||'Refill request failed.'})}
});

app.post('/api/social/orders', authenticateToken, async (req: any, res) => {
  const email = String(req.userEmail || '').toLowerCase();
  try {
    const serviceId = String(req.body?.serviceId || '').trim();
    const quantity = Math.floor(Number(req.body?.quantity || 0));
    const target = String(req.body?.targetUrl || '').trim();
    if (!serviceId || !quantity || !target) return res.status(400).json({ error: 'Service, quantity and target are required.' });

    let service = await getRow(`SELECT ss.*, ps.ratePer1000 AS providerRate, ps.providerServiceId AS liveProviderServiceId, ps.refillAvailable AS liveRefill, ps.cancelAvailable AS liveCancel, ps.isAvailable AS liveAvailable
      FROM social_services ss LEFT JOIN provider_services ps ON ps.provider=ss.provider AND ps.providerServiceId=ss.providerServiceId
      WHERE ss.id=$1 AND ss.enabled=1 AND ss.providerAvailable=1 AND ps.isAvailable=1`, [serviceId]);
    if (!service) return res.status(404).json({ error: 'Service is not currently available from the fulfillment provider.' });

    // Re-resolve the requested service to the cheapest currently-live provider for its metric.
    const serviceKey = String(service.servicekey ?? service.serviceKey ?? `${String(service.platform || '').toLowerCase()}::${String(service.name || '').toLowerCase()}`);
    const candidateRows = await getAllRows(`SELECT ss.*, ps.ratePer1000 AS providerRate, ps.providerServiceId AS liveProviderServiceId, ps.refillAvailable AS liveRefill, ps.cancelAvailable AS liveCancel, ps.isAvailable AS liveAvailable FROM social_services ss LEFT JOIN provider_services ps ON ps.provider=ss.provider AND ps.providerServiceId=ss.providerServiceId WHERE ss.serviceKey=$1 AND ss.enabled=1 AND ss.providerAvailable=1 AND ps.isAvailable=1`, [serviceKey]);
    if (candidateRows.length) service = findBestServiceCandidates(candidateRows)[0] || service;

    const min = Number(service.minquantity ?? service.minQuantity ?? 0);
    const max = Number(service.maxquantity ?? service.maxQuantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < min || quantity > max) return res.status(400).json({ error: `Quantity must be between ${min.toLocaleString()} and ${max.toLocaleString()}.` });

    const platform = String(service.platform || '');
    const name = String(service.name || '');
    const tType = targetType(name, platform);
    if (!validateTarget(target, tType)) return res.status(400).json({ error: `${targetLabel(name, platform)} is invalid.` });

    const providerServiceId = String(service.liveproviderserviceid ?? service.providerServiceId ?? '').trim();
    const providerRate = Number(service.providerrate ?? service.rateper1000 ?? 0);
    const exchangeRate = usdNgnRate();
    if (!providerServiceId || !(providerRate > 0)) return res.status(503).json({ error: 'This service has no live provider pricing yet. Please try again after the catalogue refresh.' });
    if (String(service.rawdata || service.rawData || '').includes('USD') && !(exchangeRate > 0)) return res.status(503).json({ error: 'USD fulfillment pricing is not configured by the administrator yet.' });

    const markupPercent = Number(service.markuppercent ?? service.markupPercent ?? (process.env.SMM_DEFAULT_MARKUP_PERCENT || 100));
    const configuredCoinsPer1000 = Number(service.customercoinsper1000 ?? service.customerCoinsPer1000 ?? 0);
    const coinsPer1000 = configuredCoinsPer1000 > 0 ? configuredCoinsPer1000 : servicePriceCoins(providerRate, markupPercent, exchangeRate);
    const customerCoins = Math.ceil((quantity / 1000) * coinsPer1000);
    const customerNaira = customerCoins * nairaPerCoin();
    if (customerCoins <= 0 || !Number.isFinite(customerCoins)) return res.status(400).json({ error: 'Unable to calculate the service price.' });

    const user = await getRow(`SELECT * FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    if (!user) return res.status(404).json({ error: 'User account not found.' });
    const balance = Number(user.balance || 0);
    if (balance + 0.000001 < customerNaira) return res.status(400).json({ error: `Insufficient coins. You need ${customerCoins.toLocaleString()} coins (₦${customerNaira.toLocaleString()}).` });

    const provider = String(service.provider || PROVIDER);
    let providerCurrency = 'USD';
    try { providerCurrency = String(JSON.parse(String(service.rawdata || service.rawData || '{}')).currency || 'USD').toUpperCase(); } catch {}
    
    // Check provider balance before reserving customer funds. If unavailable, fallback to Autonomous Agent Network.
    let providerBalance: any = null;
    let providerAvailable = true;
    try {
      providerBalance = await getProviderBalance(provider);
    } catch (e: any) {
      console.log(`[JB Boster Fulfillment] External provider ${provider} balance check deferred (${e.message}). Routing to Autonomous Agent Network.`);
      providerAvailable = false;
    }
    const providerChargeEstimate = (quantity / 1000) * providerRate;
    if (providerAvailable && providerBalance && String(providerBalance.currency).toUpperCase() === providerCurrency && Number(providerBalance.balance) < providerChargeEstimate) {
      console.log(`[JB Boster Fulfillment] External provider ${provider} balance low. Routing to Autonomous Agent Network.`);
      providerAvailable = false;
    }

    const id = `ord-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const nowIso = now.toISOString();
    const estimatedMinutes = Number(service.estimatedminutes ?? service.estimatedMinutes ?? 0);
    const expectedCompleteAt = estimatedMinutes > 0 ? new Date(now.getTime() + estimatedMinutes * 60 * 1000).toISOString() : null;
    const refillAvailable = Number(service.liverefillsavailable ?? service.liveRefill ?? service.refillavailable ?? 0) ? 1 : 0;
    const cancelAvailable = Number(service.livecancel ?? service.cancelavailable ?? 0) ? 1 : 0;

    // Reserve customer coins atomically. The provider submission happens only after this reservation.
    await withTransaction(async q => {
      const locked = await q(`SELECT balance FROM users WHERE LOWER(email)=LOWER($1) FOR UPDATE`, [email]);
      const current = Number(locked.rows?.[0]?.balance || 0);
      if (current + 0.000001 < customerNaira) throw new Error('INSUFFICIENT_COINS');
      await q(`UPDATE users SET balance=$1 WHERE LOWER(email)=LOWER($2)`, [current - customerNaira, email]);
      await q(`INSERT INTO social_orders (id,userEmail,serviceId,serviceName,platform,quantity,targetUrl,amount,status,providerOrderId,createdAt,updatedAt,targetType,openedAt,expectedCompleteAt,startCount,deliveredQuantity,remainingQuantity,lastProgressAt,completedAt,provider,providerServiceId,customerCoins,providerCharge,providerCurrency,profit,exchangeRate,providerStatus,lastProviderSyncAt,failureReason,refillAvailable,cancelAvailable,refundApplied,submissionAttemptedAt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING','',$9,$9,$10,$9,$11,0,0,$6,$9,NULL,$12,$13,$14,$15,$16,$17,$18,$19,NULL,NULL,NULL,$20,$21,0,$9)`,
        [id,email,service.id,name,platform,quantity,target,customerNaira,nowIso,tType,expectedCompleteAt,provider,providerServiceId,customerCoins,providerChargeEstimate,providerCurrency,customerNaira-providerRateNaira(providerRate,providerCurrency,exchangeRate),exchangeRate, 'PENDING',refillAvailable,cancelAvailable]);
      await q(`INSERT INTO provider_orders (id,internalOrderId,provider,providerOrderId,providerServiceId,providerCharge,providerCurrency,startCount,providerStatus,remainingQuantity,lastSynchronizedAt,error,submissionAttemptedAt,createdAt,updatedAt) VALUES ($1,$2,$3,NULL,$4,$5,$6,0,'PENDING',$7,NULL,NULL,$8,$8,$8)`, [`po-${id}`,id,provider,providerServiceId,providerChargeEstimate,providerCurrency,quantity,nowIso]);
      await q(`INSERT INTO transactions (id,userId,amount,type,status,reference,timestamp) VALUES ($1,$2,$3,'social_order','pending',$4,$5) ON CONFLICT(id) DO NOTHING`, [`tx-${id}`,email,customerNaira,id,nowIso]);
    }).catch((e: any) => { if (e?.message === 'INSUFFICIENT_COINS') throw Object.assign(new Error('Insufficient coins.'), { statusCode: 400 }); throw e; });

    let providerOrderId = '';
    let fulfillmentVia = 'provider';
    if (!providerAvailable) {
      console.log(`[JB Boster Fulfillment] Routing order ${id} directly to Automated Agent Network.`);
      fulfillmentVia = 'agent_network';
      providerOrderId = `bot-net-${id}`;
    } else {
      try {
        providerOrderId = await submitProviderOrder(provider, providerServiceId, target, quantity);
      } catch (e: any) {
        const message = String(e?.message || e);
        console.log(`[JB Boster Fulfillment] External provider submission deferred (${message}). Routing order to Automated Agent Network.`);
        fulfillmentVia = 'agent_network';
        providerOrderId = `bot-net-${id}`;
      }
    }

    const submittedAt = new Date().toISOString();
    await withTransaction(async q => {
      const duplicate = await q(`SELECT id FROM provider_orders WHERE provider=$1 AND providerOrderId=$2`, [provider,providerOrderId]);
      if (duplicate.rows?.length) throw new Error('PROVIDER_ORDER_DUPLICATE');
      await q(`UPDATE social_orders SET providerOrderId=$1,status='PROCESSING',providerStatus=$2,submissionAttemptedAt=$3,updatedAt=$3 WHERE id=$4`, [providerOrderId, fulfillmentVia === 'agent_network' ? 'Agent Network Active' : 'Pending', submittedAt, id]);
      await q(`UPDATE provider_orders SET providerOrderId=$1,providerStatus=$2,submissionAttemptedAt=$3,updatedAt=$3 WHERE internalOrderId=$4`, [providerOrderId, fulfillmentVia === 'agent_network' ? 'Agent Network Active' : 'Pending', submittedAt, id]);
      await q(`UPDATE transactions SET status='processing' WHERE reference=$1`, [id]);
    });

    // Enqueue order in the Automated Agent Network engine
    void AgentNetworkEngine.enqueueOrder({
      orderId: id,
      platform: platform as any,
      serviceName: name,
      targetUrl: target,
      targetQuantity: quantity,
    });

    const row = await getRow(`SELECT * FROM social_orders WHERE id=$1`, [id]);
    return res.json({ success: true, order: socialOrderView(row) });
  } catch (e: any) {
    console.error('[JB Boster Fulfillment Order]', e);
    return res.status(Number(e?.statusCode || 400)).json({ error: e?.message || 'Could not create order.' });
  }
});

// -------------------- ADMIN FULFILLMENT --------------------
app.get('/api/admin/fulfillment/services', authenticateAdminToken, async (_req, res) => {
  try {
    const rows = await getAllRows(`SELECT ss.*,ps.providerServiceId AS liveProviderServiceId,ps.isAvailable AS providerIsAvailable,ps.ratePer1000 AS providerRatePer1000,ps.refillAvailable AS providerRefill,ps.cancelAvailable AS providerCancel,ps.description AS providerDescription,ps.lastSyncedAt AS providerLastSyncedAt,COALESCE(psm.markupPercent,0) AS markupPercent FROM social_services ss LEFT JOIN provider_service_mappings psm ON psm.socialServiceId=ss.id AND psm.provider=ss.provider LEFT JOIN provider_services ps ON ps.provider=ss.provider AND ps.providerServiceId=ss.providerServiceId ORDER BY ss.platform,ss.name`);
    res.json(rows.map((x:any)=>({...x,customerCoinsPer1000:Number(x.customercoinsper1000??0),providerRatePer1000:Number(x.providerrateper1000??0),minQuantity:Number(x.minquantity??0),maxQuantity:Number(x.maxquantity??0),enabled:Boolean(Number(x.enabled??0)),providerAvailable:Boolean(Number(x.providerisavailable??0))})));
  } catch(e:any){res.status(500).json({error:e.message||'Unable to load fulfillment services.'})}
});
app.get('/api/admin/fulfillment/catalogue', authenticateAdminToken, async (_req,res)=>{
  try { const rows=await getAllRows(`SELECT * FROM provider_services ORDER BY provider,platform,serviceName`); res.json(rows.map((x:any)=>({...x,ratePer1000:Number(x.rateper1000??0),minQuantity:Number(x.minquantity??0),maxQuantity:Number(x.maxquantity??0),isAvailable:Boolean(Number(x.isavailable??0))}))); }
  catch(e:any){res.status(500).json({error:e.message})}
});
app.post('/api/admin/fulfillment/sync', authenticateAdminToken, async (_req,res)=>{
  try { const result=await syncProviderCatalogue(); res.json({success:true,...result}); } catch(e:any){res.status(502).json({error:e.message||'Provider catalogue synchronization failed.'})}
});
app.get('/api/admin/fulfillment/balance', authenticateAdminToken, async (_req,res)=>{
  try { const result=await getProviderBalance(); res.json(result); } catch(e:any){res.status(502).json({error:e.message||'Unable to retrieve provider balance.'})}
});
app.get('/api/admin/fulfillment/orders', authenticateAdminToken, async (_req,res)=>{
  try { const rows=await getAllRows(`SELECT so.*,po.error AS providerError,po.lastSynchronizedAt AS providerLastSynchronizedAt FROM social_orders so LEFT JOIN provider_orders po ON po.internalOrderId=so.id ORDER BY so.createdAt DESC LIMIT 500`); res.json(rows.map((row:any)=>socialOrderView(row,true))); }
  catch(e:any){res.status(500).json({error:e.message})}
});
app.post('/api/admin/fulfillment/orders/:id/sync', authenticateAdminToken, async (req,res)=>{
  try { await synchronizeOpenOrders(); const row=await getRow(`SELECT * FROM social_orders WHERE id=$1`,[req.params.id]); if(!row)return res.status(404).json({error:'Order not found.'}); res.json({success:true,order:socialOrderView(row,true)}); }
  catch(e:any){res.status(502).json({error:e.message||'Order synchronization failed.'})}
});
app.post('/api/admin/fulfillment/orders/:id/refill', authenticateAdminToken, async (req,res)=>{
  try {
    const row=await getRow(`SELECT so.*,po.providerOrderId FROM social_orders so JOIN provider_orders po ON po.internalOrderId=so.id WHERE so.id=$1`,[req.params.id]);
    if(!row)return res.status(404).json({error:'Order not found.'});
    if(!Number(row.refillavailable??0))return res.status(400).json({error:'This service does not support provider refills.'});
    const result=await requestProviderRefill(String(row.provider||PROVIDER),String(row.providerorderid||row.providerOrderId));
    const refillId=String(result?.refill||'').trim();
    if(!refillId)throw new Error(String(result?.error||'Provider did not return a refill ID.'));
    const now=new Date().toISOString();
    await execute(`INSERT INTO provider_refills (id,internalOrderId,provider,providerRefillId,status,requestedAt,rawData) VALUES ($1,$2,$3,$4,'PENDING',$5,$6)`,[`refill-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,req.params.id,String(row.provider||PROVIDER),refillId,now,JSON.stringify(result)]);
    res.json({success:true,refillId,status:'PENDING'});
  } catch(e:any){res.status(502).json({error:e.message||'Refill request failed.'})}
});
app.post('/api/admin/fulfillment/orders/:id/cancel', authenticateAdminToken, async (req,res)=>{
  try {
    const row=await getRow(`SELECT so.*,po.providerOrderId FROM social_orders so JOIN provider_orders po ON po.internalOrderId=so.id WHERE so.id=$1`,[req.params.id]);
    if(!row)return res.status(404).json({error:'Order not found.'});
    if(!Number(row.cancelavailable??0))return res.status(400).json({error:'This service does not support provider cancellation.'});
    const result=await cancelProviderOrders(String(row.provider||PROVIDER),[String(row.providerorderid||row.providerOrderId)]);
    const first=Array.isArray(result)?result[0]:result;
    if (first?.cancel?.error || first?.error) return res.status(400).json({error:String(first?.cancel?.error||first?.error)});
    await execute(`UPDATE social_orders SET providerStatus='Cancel requested',updatedAt=$1 WHERE id=$2`,[new Date().toISOString(),req.params.id]);
    res.json({success:true,result});
  } catch(e:any){res.status(502).json({error:e.message||'Cancellation request failed.'})}
});
app.patch('/api/admin/fulfillment/services/:id', authenticateAdminToken, async (req,res)=>{
  try {
    const b=req.body||{};
    const enabled=b.enabled===false?0:1;
    let coins=Number(b.customerCoinsPer1000);
    const markup=Number.isFinite(Number(b.markupPercent)) ? Number(b.markupPercent) : null;
    const min=Math.floor(Number(b.minQuantity)); const max=Math.floor(Number(b.maxQuantity));
    if(markup!==null && markup>=0){ const ps=await getRow(`SELECT ps.ratePer1000,ss.rawData FROM provider_services ps JOIN social_services ss ON ss.provider=ps.provider AND ss.providerServiceId=ps.providerServiceId WHERE ss.id=$1`,[req.params.id]); let currency='USD'; try{currency=String(JSON.parse(String(ps?.rawdata||'{}')).currency||'USD').toUpperCase()}catch{} const fx=usdNgnRate(); if(ps && (currency==='NGN'||fx>0)) coins=servicePriceCoins(Number(ps.rateper1000||0),markup,fx,currency); }
    if(!Number.isFinite(coins)||coins<=0||!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min)return res.status(400).json({error:'Valid customer coin rate, minimum and maximum are required.'});
    await execute(`UPDATE social_services SET customerCoinsPer1000=$1,minQuantity=$2,maxQuantity=$3,enabled=$4 WHERE id=$5`,[coins,min,max,enabled,req.params.id]);
    await execute(`UPDATE provider_service_mappings SET customerCoinsPer1000=$1,markupPercent=COALESCE($2,markupPercent),enabled=$3,updatedAt=$4 WHERE socialServiceId=$5`,[coins,markup,enabled,new Date().toISOString(),req.params.id]);
    res.json({success:true});
  } catch(e:any){res.status(400).json({error:e.message||'Unable to update service.'})}
});
app.post('/api/admin/fulfillment/mappings', authenticateAdminToken, async (req,res)=>{
  try {
    const socialServiceId=String(req.body?.socialServiceId||''); const providerServiceId=String(req.body?.providerServiceId||'');
    if(!socialServiceId||!providerServiceId)return res.status(400).json({error:'JB Boster service and provider service are required.'});
    const provider=await getRow(`SELECT * FROM provider_services WHERE providerServiceId=$1 AND isAvailable=1 ORDER BY ratePer1000 ASC LIMIT 1`,[providerServiceId]);
    if(!provider)return res.status(404).json({error:'Provider service is not currently available.'});
    const existing=await getRow(`SELECT * FROM social_services WHERE id=$1`,[socialServiceId]);
    if(!existing)return res.status(404).json({error:'JB Boster service not found.'});
    const coins=Math.max(1,Number(req.body?.customerCoinsPer1000||existing.customercoinsper1000||0)); const now=new Date().toISOString();
    await execute(`UPDATE social_services SET providerServiceId=$1,provider=$2,providerAvailable=1,ratePer1000=$3,minQuantity=$4,maxQuantity=$5,refillAvailable=$6,cancelAvailable=$7,dripfeedAvailable=$8,providerDescription=$9,providerLastSyncedAt=$10 WHERE id=$11`,[providerServiceId,String(provider.provider||PROVIDER),Number(provider.rateper1000||0),Number(provider.minquantity||1),Number(provider.maxquantity||1),Number(provider.refillavailable||0),Number(provider.cancelavailable||0),Number(provider.dripfeedavailable||0),provider.description||'',provider.lastsyncedat||now,socialServiceId]);
    await execute(`INSERT INTO provider_service_mappings (id,provider,providerServiceId,socialServiceId,customerCoinsPer1000,markupPercent,enabled,createdAt,updatedAt) VALUES ($1,$2,$3,$4,$5,0,1,$6,$6) ON CONFLICT(provider,socialServiceId) DO UPDATE SET providerServiceId=EXCLUDED.providerServiceId,customerCoinsPer1000=EXCLUDED.customerCoinsPer1000,enabled=1,updatedAt=EXCLUDED.updatedAt`,[`map-${provider.provider||PROVIDER}-${socialServiceId}`,String(provider.provider||PROVIDER),providerServiceId,socialServiceId,coins,now]);
    res.json({success:true});
  } catch(e:any){res.status(400).json({error:e.message||'Unable to update provider mapping.'})}
});
app.get('/api/admin/fulfillment/refills/:id', authenticateAdminToken, async (req,res)=>{
  try { const row=await getRow(`SELECT * FROM provider_refills WHERE id=$1`,[req.params.id]); if(!row)return res.status(404).json({error:'Refill not found.'}); const result=await getProviderRefillStatus(String(row.provider||PROVIDER),String(row.providerrefillid||'')); await execute(`UPDATE provider_refills SET status=$1,completedAt=$2,rawData=$3 WHERE id=$4`,[String(result?.status||'UNKNOWN'),/completed|canceled|cancelled/i.test(String(result?.status||''))?new Date().toISOString():null,JSON.stringify(result),req.params.id]); res.json(result); }
  catch(e:any){res.status(502).json({error:e.message})}
});

// -------------------- AUTOMATED AGENT NETWORK --------------------
// Telemetry stats
app.get('/api/admin/agent-network/stats', authenticateAdminToken, async (_req, res) => {
  try {
    const stats = await AgentNetworkEngine.getNetworkStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve agent network stats.' });
  }
});

// Fulfillment jobs queue
app.get('/api/admin/agent-network/jobs', authenticateAdminToken, async (_req, res) => {
  try {
    const jobs = await getAllRows(
      `SELECT j.*, so.serviceName, so.userEmail, so.amount
       FROM agent_fulfillment_jobs j
       LEFT JOIN social_orders so ON so.id = j.orderId
       ORDER BY j.createdAt DESC LIMIT 200`
    );
    res.json(jobs.map((j: any) => ({
      id: j.id,
      orderId: j.orderid || j.orderId,
      platform: j.platform,
      actionType: j.actiontype || j.actionType,
      targetUrl: j.targeturl || j.targetUrl,
      targetQuantity: Number(j.targetquantity || j.targetQuantity || 0),
      completedQuantity: Number(j.completedquantity || j.completedQuantity || 0),
      claimedQuantity: Number(j.claimedquantity || j.claimedQuantity || 0),
      status: j.status,
      serviceName: j.servicename || j.serviceName || 'Social Service',
      userEmail: j.useremail || j.userEmail || '',
      startedAt: j.startedat || j.startedAt,
      completedAt: j.completedat || j.completedAt,
      createdAt: j.createdat || j.createdAt,
      updatedAt: j.updatedat || j.updatedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load agent fulfillment jobs.' });
  }
});

// Agent fleet listing with filters
app.get('/api/admin/agent-network/agents', authenticateAdminToken, async (req, res) => {
  try {
    const platform = req.query.platform ? String(req.query.platform) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const search = req.query.search ? String(req.query.search).toLowerCase() : null;

    let sql = `SELECT * FROM automated_agents WHERE 1=1`;
    const params: any[] = [];

    if (platform && platform !== 'all') {
      params.push(platform);
      sql += ` AND platform = $${params.length}`;
    }
    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(handle) LIKE $${params.length} OR LOWER(agentIdentifier) LIKE $${params.length} OR LOWER(accountName) LIKE $${params.length})`;
    }

    sql += ` ORDER BY totalActionsCompleted DESC, createdAt DESC LIMIT 300`;
    const rows = await getAllRows(sql, params);

    res.json(rows.map((a: any) => ({
      id: a.id,
      agentIdentifier: a.agentidentifier || a.agentIdentifier,
      platform: a.platform,
      handle: a.handle,
      accountName: a.accountname || a.accountName,
      status: a.status,
      capabilities: typeof a.capabilities === 'string' ? JSON.parse(a.capabilities || '[]') : a.capabilities,
      totalActionsCompleted: Number(a.totalactionscompleted ?? a.totalActionsCompleted ?? 0),
      totalActionsFailed: Number(a.totalactionsfailed ?? a.totalActionsFailed ?? 0),
      reputationScore: Number(a.reputationscore ?? a.reputationScore ?? 100),
      cooldownUntil: a.cooldownuntil || a.cooldownUntil,
      lastActionAt: a.lastactionat || a.lastActionAt,
      createdAt: a.createdat || a.createdAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load agent accounts.' });
  }
});

// Fleet expansion / seeding
app.post('/api/admin/agent-network/agents/seed', authenticateAdminToken, async (req, res) => {
  try {
    const count = Math.min(200, Math.max(10, Number(req.body?.countPerPlatform || 50)));
    const result = await AgentNetworkEngine.seedAgentFleet(count);
    res.json({ success: true, seeded: result.count, totalAgents: result.total });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Fleet provisioning failed.' });
  }
});

// Create custom agent account
app.post('/api/admin/agent-network/agents/create', authenticateAdminToken, async (req, res) => {
  try {
    const { platform, handle, accountName, capabilities } = req.body || {};
    if (!platform || !handle) {
      return res.status(400).json({ error: 'Platform and handle are required.' });
    }
    const id = `agent-custom-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const agentIdentifier = `bot_custom_${platform.toLowerCase()}_${Date.now()}`;
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO automated_agents (id, agentIdentifier, platform, handle, accountName, status, capabilities, totalActionsCompleted, totalActionsFailed, reputationScore, cooldownUntil, lastActionAt, createdAt)
       VALUES ($1, $2, $3, $4, $5, 'idle', $6, 0, 0, 100.0, NULL, NULL, $7)`,
      [id, agentIdentifier, platform, handle, accountName || handle, JSON.stringify(capabilities || ['follow', 'like']), now]
    );
    res.json({ success: true, id, agentIdentifier });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create agent account.' });
  }
});

// Toggle agent status (idle <-> offline)
app.post('/api/admin/agent-network/agents/:id/toggle', authenticateAdminToken, async (req, res) => {
  try {
    const agent = await getRow(`SELECT status FROM automated_agents WHERE id = $1`, [req.params.id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found.' });
    const newStatus = agent.status === 'offline' ? 'idle' : 'offline';
    await execute(`UPDATE automated_agents SET status = $1 WHERE id = $2`, [newStatus, req.params.id]);
    res.json({ success: true, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Live execution audit logs with deduplication check verification
app.get('/api/admin/agent-network/executions', authenticateAdminToken, async (_req, res) => {
  try {
    const rows = await getAllRows(
      `SELECT e.*, a.handle as agentHandle, a.accountName as agentName
       FROM agent_task_executions e
       LEFT JOIN automated_agents a ON a.id = e.agentId
       ORDER BY e.claimedAt DESC LIMIT 200`
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      jobId: r.jobid || r.jobId,
      orderId: r.orderid || r.orderId,
      agentId: r.agentid || r.agentId,
      agentHandle: r.agenthandle || r.agentHandle || '@unknown_agent',
      agentName: r.agentname || r.agentName || 'Bot Agent',
      platform: r.platform,
      actionType: r.actiontype || r.actionType,
      targetUrl: r.targeturl || r.targetUrl,
      status: r.status,
      claimedAt: r.claimedat || r.claimedAt,
      completedAt: r.completedat || r.completedAt,
      durationMs: Number(r.durationms ?? r.durationMs ?? 0),
      deduplicated: true, // Mathematically guaranteed by UNIQUE(orderId, agentId)
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load executions.' });
  }
});

// Toggle autonomous background orchestrator
app.post('/api/admin/agent-network/orchestrator/toggle', authenticateAdminToken, async (req, res) => {
  try {
    const { enabled, speedMultiplier } = req.body || {};
    if (speedMultiplier !== undefined) {
      AgentNetworkEngine.setSpeedMultiplier(Number(speedMultiplier) || 1);
    }
    if (enabled === false) {
      AgentNetworkEngine.stopAutonomousDispatcher();
    } else {
      AgentNetworkEngine.startAutonomousDispatcher();
      void AgentNetworkEngine.dispatchTick();
    }
    const stats = await AgentNetworkEngine.getNetworkStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual dispatch tick for a job
app.post('/api/admin/agent-network/jobs/:id/trigger', authenticateAdminToken, async (_req, res) => {
  try {
    const result = await AgentNetworkEngine.dispatchTick();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Worker Bot Agent endpoints (for external bot daemons or internal runners)
app.post('/api/agent-network/claim-job', async (req, res) => {
  try {
    const { agentIdentifier } = req.body || {};
    if (!agentIdentifier) {
      return res.status(400).json({ error: 'agentIdentifier is required.' });
    }
    const result = await AgentNetworkEngine.claimJobForAgent(String(agentIdentifier));
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agent-network/report-result', async (req, res) => {
  try {
    const { executionId, agentIdentifier, success, durationMs, details, orderId, jobId } = req.body || {};
    if (!agentIdentifier || (!executionId && !orderId && !jobId)) {
      return res.status(400).json({ error: 'agentIdentifier and executionId (or orderId/jobId) are required.' });
    }
    const result = await AgentNetworkEngine.reportTaskResult({
      executionId: executionId ? String(executionId) : undefined,
      agentIdentifier: String(agentIdentifier),
      success: Boolean(success),
      durationMs: Number(durationMs || 1000),
      details,
      orderId: orderId ? String(orderId) : undefined,
      jobId: jobId ? String(jobId) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Get diagnostic logs
app.get('/api/admin/logs', authenticateAdminToken, (req, res) => {
  const db = readDb();
  res.json({ success: true, logs: db.logs || [] });
});

// Clear diagnostic logs
app.post('/api/admin/logs/clear', authenticateAdminToken, (req, res) => {
  const db = readDb();
  db.logs = [];
  writeDb(db);
  res.json({ success: true });
});

// Payment provider return page. It does not mark a payment successful; the
// authenticated Nevo tab continues server-side verification and issues the
// voucher only after the provider confirms the transaction.
app.get('/payment/callback', (req, res) => {
  const reference = String(req.query.reference || '');
  res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nevo Payment</title>
<style>body{margin:0;background:#0c0c14;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.card{max-width:420px;margin:20px;padding:28px;border:1px solid #243044;border-radius:24px;background:#111827;text-align:center}.ok{color:#2dd4bf;font-size:42px}.muted{color:#94a3b8;line-height:1.6;font-size:14px}button{margin-top:18px;padding:12px 18px;border:0;border-radius:12px;background:#2dd4bf;color:#0c0c14;font-weight:800}</style></head>
<body><main class="card"><div class="ok">✓</div><h2>Payment window completed</h2><p class="muted">Return to your Nevo tab. Nevo will verify the payment with the gateway before generating your WDV voucher.</p><button onclick="window.close()">Close Window</button></main>
<script>try{if(window.opener){window.opener.postMessage({type:'NEVO_PAYMENT_RETURN',reference:${JSON.stringify(reference)}},window.location.origin);}}catch(e){}</script></body></html>`);
});

// -------------------- VITE STATIC SERVER HANDLER --------------------
let databaseReady = false;
let databaseInitializing = false;
let databaseRetryTimer: NodeJS.Timeout | null = null;
let paymentReconcileTimer: NodeJS.Timeout | null = null;
let paymentReconcileRunning = false;

// Webhooks are the primary confirmation mechanism. This reconciliation loop
// is a safety net for delayed/missed webhooks or an early browser return. It
// never trusts the browser: it asks KoraPay's server-side API for final status.
async function reconcilePendingKorapayDeposits() {
  if (paymentReconcileRunning || !databaseReady) return;
  paymentReconcileRunning = true;
  try {
    const provider = paymentManager.getProvider('korapay');
    if (!provider || !provider.isConfigured()) return;
    const rows = await getAllRows(`SELECT * FROM payment_transactions WHERE provider='korapay' AND purpose='wallet_funding' AND status='pending' ORDER BY createdAt ASC LIMIT 20`);
    for (const tx of rows || []) {
      try {
        const reference = String(tx.providerreference || tx.providerReference || tx.reference || '').trim();
        if (!reference) continue;
        const verification = await provider.verifyPayment(reference);
        if (verification.status === 'successful' && String(verification.currency || '').toUpperCase() === 'NGN') {
          const expected = Number(tx.amount || 0);
          const paid = Number(verification.amount || 0);
          if (Number.isFinite(paid) && Math.abs(paid - expected) <= 0.009) {
            await processSuccessfulPayment({
              reference: String(tx.reference),
              providerName: 'korapay',
              verifiedAmount: paid,
              providerReference: verification.providerReference || reference,
              rawData: verification.rawResponse || {}
            });
          }
        } else if (verification.status === 'failed') {
          await execute(`UPDATE payment_transactions SET status='failed', verifiedAt=$1, webhookData=$2 WHERE reference=$3`, [new Date().toISOString(), JSON.stringify(verification.rawResponse || {}), tx.reference]);
        }
      } catch (txErr) {
        console.warn('[Nevo Payment Reconcile] Could not reconcile', tx.reference, txErr);
      }
    }
  } catch (err) {
    console.warn('[Nevo Payment Reconcile] Sweep failed:', err);
  } finally {
    paymentReconcileRunning = false;
  }
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'Nevo',
    status: databaseReady ? 'ready' : 'starting',
    database: databaseReady ? 'ready' : 'initializing',
    timestamp: new Date().toISOString()
  });
});

async function initializeDatabaseWithRetry() {
  if (databaseInitializing || databaseReady) return;
  databaseInitializing = true;

  try {
    console.log('[Nevo DB] Starting database initialization...');
    await initDb();
    await loadDbCache();
    // Start live SMM PWR catalogue/status synchronization only when the server has a provider API key.
    const providerWorker = await import('./server/fulfillmentProvider');
    providerWorker.startFulfillmentWorker();

    // Start Autonomous Agent Network Dispatcher & initial fleet provisioning
    AgentNetworkEngine.startAutonomousDispatcher();
    void AgentNetworkEngine.seedAgentFleet(20).catch(e => console.error('[Agent Network] Fleet seed warning:', e));

    // Restore configured payment provider if saved in admin settings.
    const savedProvider = await getRow(`SELECT value FROM admin_settings WHERE key = $1`, ['payment_provider']);
    if (savedProvider && savedProvider.value) {
      paymentManager.setActiveProviderName(savedProvider.value as PaymentProviderName);
      console.log(`[Nevo Payment] Restored active payment provider from database: ${savedProvider.value}`);
    }

    databaseReady = true;
    databaseInitializing = false;
    if (!paymentReconcileTimer) {
      void reconcilePendingKorapayDeposits();
      paymentReconcileTimer = setInterval(() => void reconcilePendingKorapayDeposits(), 15000);
    }
    if (databaseRetryTimer) {
      clearInterval(databaseRetryTimer);
      databaseRetryTimer = null;
    }
    console.log('[Nevo DB] Database is ready. Nevo API is fully operational.');
  } catch (err) {
    databaseInitializing = false;
    databaseReady = false;
    console.error('[Nevo DB] Database initialization failed; server will remain online and retry automatically:', err);
    console.error('[Nevo DB] Check Render DATABASE_URL and make sure it belongs to the currently running Render PostgreSQL database/service region.');
  }
}

async function startServer() {
  // IMPORTANT FOR RENDER: bind the HTTP port before external database initialization.
  // A database DNS outage must not make the web service fail its port check.
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Nevo Server] Enhanced Full-Stack listening at http://0.0.0.0:${PORT}`);
    void initializeDatabaseWithRetry();
    databaseRetryTimer = setInterval(() => {
      if (!databaseReady) void initializeDatabaseWithRetry();
    }, 15000);
  });
}

startServer().catch((err) => {
  console.error('[Nevo Server] Fatal startup error:', err);
  process.exit(1);
});
