import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec, query, queryOne, run } from './db.ts';

export async function initDatabaseAndSeed(): Promise<void> {
  console.log('[DB] Initializing database schema...');
  
  // Read schema.sql file
  const schemaPath = path.join(process.cwd(), 'server', 'migrations', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await exec(schemaSql);
  }

  // 1. Seed Admin User
  const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@smmboost.ng';
  const existingAdmin = await queryOne('SELECT * FROM users WHERE email = ?', [adminEmail]);

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin123!';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const apiKey = 'smm_' + crypto.randomBytes(24).toString('hex');
    
    await run(
      `INSERT INTO users (email, password_hash, name, phone, role, coin_balance, is_verified, is_banned, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, datetime('now'), datetime('now'))`,
      [adminEmail, passwordHash, 'SMM Super Administrator', '+2348012345678', 'admin', 500000, apiKey]
    );
    console.log(`[Seed] Created default admin user: ${adminEmail} (Password: ${adminPassword})`);
  }

  // 2. Seed Standard Demo User
  const demoEmail = 'demo@smmboost.ng';
  const existingDemo = await queryOne('SELECT * FROM users WHERE email = ?', [demoEmail]);
  let demoUserId = existingDemo?.id;

  if (!existingDemo) {
    const userPasswordHash = await bcrypt.hash('User123!', 10);
    const apiKey = 'smm_' + crypto.randomBytes(24).toString('hex');

    const result = await run(
      `INSERT INTO users (email, password_hash, name, phone, role, coin_balance, is_verified, is_banned, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, datetime('now'), datetime('now'))`,
      [demoEmail, userPasswordHash, 'Tunde Adebayo', '+2348098765432', 'user', 35000, apiKey]
    );
    demoUserId = result.lastInsertRowid;
    console.log(`[Seed] Created demo user: ${demoEmail} (Password: User123!)`);
  }

  // 3. Seed Coin Packages
  const packagesCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM coin_packages');
  if (!packagesCount || packagesCount.count === 0) {
    const defaultPackages = [
      { name: 'Starter Pack', naira_price: 500, coins: 10000, bonus_coins: 0, badge: 'Beginner' },
      { name: 'Popular Boost', naira_price: 1000, coins: 20000, bonus_coins: 2000, badge: 'Popular' },
      { name: 'Creator Pro', naira_price: 2500, coins: 50000, bonus_coins: 8000, badge: 'Recommended' },
      { name: 'Influencer Growth', naira_price: 5000, coins: 100000, bonus_coins: 25000, badge: 'Best Value' },
      { name: 'Agency Reseller', naira_price: 10000, coins: 200000, bonus_coins: 70000, badge: 'VIP Agency' },
      { name: 'Mega Brand Pack', naira_price: 25000, coins: 500000, bonus_coins: 200000, badge: 'Maximum ROI' },
    ];

    for (const pkg of defaultPackages) {
      await run(
        `INSERT INTO coin_packages (name, naira_price, coins, bonus_coins, badge, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
        [pkg.name, pkg.naira_price, pkg.coins, pkg.bonus_coins, pkg.badge]
      );
    }
    console.log('[Seed] Seeded default Coin Packages.');
  }

  // 4. Seed Services Catalog
  const servicesCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM services');
  if (!servicesCount || servicesCount.count === 0) {
    const defaultServices = [
      // Instagram Services
      {
        platform: 'instagram',
        service_type: 'followers',
        name: 'Instagram Followers (Influencer High Quality, Non-Drop)',
        description: 'Real-looking active followers with avatars and posts. High retention rate, 30 days refill guarantee.',
        coin_price_per_1000: 10000,
        min_quantity: 100,
        max_quantity: 50000,
        delivery_speed: '1-6 hours',
      },
      {
        platform: 'instagram',
        service_type: 'followers',
        name: 'Instagram Followers (Fast Standard)',
        description: 'Instant delivery followers for fast profile boost. Stable quality.',
        coin_price_per_1000: 6500,
        min_quantity: 100,
        max_quantity: 30000,
        delivery_speed: '10-30 mins',
      },
      {
        platform: 'instagram',
        service_type: 'likes',
        name: 'Instagram Likes (Instant & High Engagement)',
        description: 'Instant likes from real worldwide profiles. Safe for explore feed.',
        coin_price_per_1000: 2500,
        min_quantity: 50,
        max_quantity: 25000,
        delivery_speed: 'Instant - 15 mins',
      },
      {
        platform: 'instagram',
        service_type: 'reels',
        name: 'Instagram Reel Views + Impressions',
        description: 'Supercharges reel algorithm and explore page reach.',
        coin_price_per_1000: 1200,
        min_quantity: 500,
        max_quantity: 100000,
        delivery_speed: 'Instant',
      },
      {
        platform: 'instagram',
        service_type: 'comments',
        name: 'Instagram Custom / Positive Comments',
        description: 'Organic relevant comments & emojis to spark conversations under posts.',
        coin_price_per_1000: 7500,
        min_quantity: 10,
        max_quantity: 1000,
        delivery_speed: '30-60 mins',
      },
      {
        platform: 'instagram',
        service_type: 'shares',
        name: 'Instagram Post Shares & Bookmarks',
        description: 'Increases viral ranking score for business and creator profiles.',
        coin_price_per_1000: 3000,
        min_quantity: 100,
        max_quantity: 15000,
        delivery_speed: '15-30 mins',
      },

      // TikTok Services
      {
        platform: 'tiktok',
        service_type: 'followers',
        name: 'TikTok Followers (Organic Live Stream Enabled)',
        description: 'Reach the 1,000 follower threshold to unlock TikTok LIVE broadcasting & shop links.',
        coin_price_per_1000: 12000,
        min_quantity: 100,
        max_quantity: 25000,
        delivery_speed: '2-8 hours',
      },
      {
        platform: 'tiktok',
        service_type: 'likes',
        name: 'TikTok Video Likes (High Retention)',
        description: 'Boost FYP (For You Page) recommendation algorithm.',
        coin_price_per_1000: 3200,
        min_quantity: 100,
        max_quantity: 50000,
        delivery_speed: '5-20 mins',
      },
      {
        platform: 'tiktok',
        service_type: 'views',
        name: 'TikTok Viral Video Views',
        description: 'Ultra fast view distribution for viral push & trend challenges.',
        coin_price_per_1000: 800,
        min_quantity: 1000,
        max_quantity: 500000,
        delivery_speed: 'Instant',
      },
      {
        platform: 'tiktok',
        service_type: 'shares',
        name: 'TikTok Video Shares & Saves',
        description: 'Essential engagement metric for the 2025 algorithm ranking.',
        coin_price_per_1000: 3500,
        min_quantity: 100,
        max_quantity: 20000,
        delivery_speed: '15-45 mins',
      },
      {
        platform: 'tiktok',
        service_type: 'comments',
        name: 'TikTok Custom Engaged Comments',
        description: 'Custom relevant comments to boost discussion and audience trust.',
        coin_price_per_1000: 8500,
        min_quantity: 10,
        max_quantity: 1000,
        delivery_speed: '30-90 mins',
      },

      // YouTube Services
      {
        platform: 'youtube',
        service_type: 'subscribers',
        name: 'YouTube Subscribers (Channel Monetization Quality)',
        description: 'Steady gradual delivery to safely grow towards the 1,000 subscriber YPP milestone.',
        coin_price_per_1000: 16000,
        min_quantity: 50,
        max_quantity: 5000,
        delivery_speed: '24-72 hours',
      },
      {
        platform: 'youtube',
        service_type: 'views',
        name: 'YouTube High Retention Video Views',
        description: 'High watch time views safe for monetization and search indexing.',
        coin_price_per_1000: 4500,
        min_quantity: 1000,
        max_quantity: 100000,
        delivery_speed: '2-12 hours',
      },
      {
        platform: 'youtube',
        service_type: 'likes',
        name: 'YouTube Video Likes',
        description: 'Organic-style thumbs up for video ranking and social proof.',
        coin_price_per_1000: 3500,
        min_quantity: 50,
        max_quantity: 10000,
        delivery_speed: '30-60 mins',
      },

      // X (Twitter) Services
      {
        platform: 'twitter',
        service_type: 'followers',
        name: 'X / Twitter Followers (Profile Boost)',
        description: 'Quality profile followers with bios, headers, and post history.',
        coin_price_per_1000: 11000,
        min_quantity: 100,
        max_quantity: 20000,
        delivery_speed: '2-12 hours',
      },
      {
        platform: 'twitter',
        service_type: 'retweets',
        name: 'X / Twitter Reposts & Quotes',
        description: 'Retweets to amplify tweets to new timeline feeds.',
        coin_price_per_1000: 3800,
        min_quantity: 50,
        max_quantity: 5000,
        delivery_speed: '10-30 mins',
      },
      {
        platform: 'twitter',
        service_type: 'likes',
        name: 'X / Twitter Tweet Likes',
        description: 'Fast delivery likes to improve visibility and trending potential.',
        coin_price_per_1000: 2600,
        min_quantity: 50,
        max_quantity: 10000,
        delivery_speed: '10-20 mins',
      },
      {
        platform: 'twitter',
        service_type: 'views',
        name: 'X / Twitter Tweet Impressions & Views',
        description: 'High volume view count to satisfy ad revenue sharing view requirements.',
        coin_price_per_1000: 700,
        min_quantity: 1000,
        max_quantity: 250000,
        delivery_speed: 'Instant',
      },

      // Facebook Services
      {
        platform: 'facebook',
        service_type: 'followers',
        name: 'Facebook Page Likes & Followers',
        description: 'Grow your official business or creator Facebook page followers.',
        coin_price_per_1000: 9500,
        min_quantity: 100,
        max_quantity: 25000,
        delivery_speed: '6-24 hours',
      },
      {
        platform: 'facebook',
        service_type: 'likes',
        name: 'Facebook Post Likes & Reactions (Love/Care/Wow)',
        description: 'Emotion-rich post engagement for high algorithm reach.',
        coin_price_per_1000: 2900,
        min_quantity: 50,
        max_quantity: 15000,
        delivery_speed: '15-45 mins',
      },
    ];

    for (const s of defaultServices) {
      await run(
        `INSERT INTO services (platform, service_type, name, description, coin_price_per_1000, min_quantity, max_quantity, delivery_speed, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [s.platform, s.service_type, s.name, s.description, s.coin_price_per_1000, s.min_quantity, s.max_quantity, s.delivery_speed]
      );
    }
    console.log('[Seed] Seeded services catalog for Instagram, TikTok, YouTube, X, and Facebook.');
  }

  // 5. Seed sample orders and transactions for demo user if none exist
  if (demoUserId) {
    const ordersCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM orders WHERE user_id = ?', [demoUserId]);
    if (!ordersCount || ordersCount.count === 0) {
      // Add a top-up transaction
      await run(
        `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
         VALUES (?, 'deposit', 2500, 58000, 58000, ?, 'korapay', 'completed', 'Purchased Creator Pro (50,000 + 8,000 bonus coins)', datetime('now', '-2 days'))`,
        [demoUserId, 'PAY_DEMO_' + Date.now()]
      );

      // Order 1: Instagram Followers (Completed)
      await run(
        `INSERT INTO orders (user_id, service_id, link_or_username, quantity, coin_cost, naira_equivalent, status, external_order_id, notes, created_at, updated_at)
         VALUES (?, 1, 'https://instagram.com/tundevibes', 1000, 10000, 500.00, 'completed', 'EXT-98213', 'Delivered 1,000 high quality followers', datetime('now', '-1 days'), datetime('now', '-22 hours'))`,
        [demoUserId]
      );

      // Deduct order 1
      await run(
        `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
         VALUES (?, 'order', 0, -10000, 48000, ?, 'system', 'completed', 'Order #1 - 1,000 Instagram Followers', datetime('now', '-1 days'))`,
        [demoUserId, 'ORD_REF_' + (Date.now() - 10000)]
      );

      // Order 2: TikTok Views (Processing)
      await run(
        `INSERT INTO orders (user_id, service_id, link_or_username, quantity, coin_cost, naira_equivalent, status, external_order_id, notes, created_at, updated_at)
         VALUES (?, 9, 'https://tiktok.com/@tundevibes/video/7418291029', 5000, 4000, 200.00, 'processing', 'EXT-98342', 'Viral push in progress', datetime('now', '-4 hours'), datetime('now', '-3 hours'))`,
        [demoUserId]
      );

      // Deduct order 2
      await run(
        `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
         VALUES (?, 'order', 0, -4000, 44000, ?, 'system', 'completed', 'Order #2 - 5,000 TikTok Video Views', datetime('now', '-4 hours'))`,
        [demoUserId, 'ORD_REF_' + (Date.now() - 5000)]
      );

      // Order 3: Instagram Likes (Pending)
      await run(
        `INSERT INTO orders (user_id, service_id, link_or_username, quantity, coin_cost, naira_equivalent, status, external_order_id, notes, created_at, updated_at)
         VALUES (?, 3, 'https://instagram.com/p/DF93kLqA', 500, 1250, 62.50, 'pending', 'EXT-98401', 'Queued for delivery', datetime('now', '-20 mins'), datetime('now', '-20 mins'))`,
        [demoUserId]
      );

      // Deduct order 3
      await run(
        `INSERT INTO transactions (user_id, type, amount_naira, amount_coins, balance_after, reference, payment_gateway, status, description, created_at)
         VALUES (?, 'order', 0, -1250, 42750, ?, 'system', 'completed', 'Order #3 - 500 Instagram Likes', datetime('now', '-20 mins'))`,
        [demoUserId, 'ORD_REF_' + Date.now()]
      );

      // Update demo user's actual balance to 42750
      await run('UPDATE users SET coin_balance = 42750 WHERE id = ?', [demoUserId]);
      console.log('[Seed] Seeded initial orders and ledger transactions for demo user.');
    }
  }

  console.log('[DB] Database initialization & seeding completed successfully.');
}
