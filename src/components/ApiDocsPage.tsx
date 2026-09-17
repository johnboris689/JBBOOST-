import React, { useState } from 'react';
import { Code, Key, Copy, Check, ExternalLink, Terminal, Shield, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export const ApiDocsPage: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeLang, setActiveLang] = useState<'curl' | 'python' | 'node'>('curl');

  const apiKey = user?.api_key || 'YOUR_API_KEY_HERE';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://smmboost.ng';

  const copyKey = () => {
    if (user?.api_key) {
      navigator.clipboard.writeText(user.api_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold mb-3">
          <Terminal className="w-3.5 h-3.5" />
          <span>SMM Reseller API v1 Specification</span>
        </div>
        <h1 className="text-3xl font-black text-white">Developer & Reseller API</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
          Integrate our high-speed Nigerian SMM delivery engine directly into your own website, WordPress store, or Telegram bot. Standard SMM protocol compliant.
        </p>
      </div>

      {/* API Key Box */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your API Endpoint & Authentication</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs text-white bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              POST {baseUrl}/api/v1/smm
            </span>
          </div>
        </div>

        {user ? (
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs text-cyan-300 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 max-w-[200px] truncate select-all">
              {user.api_key}
            </div>
            <button
              onClick={copyKey}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => openAuthModal('login')}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
          >
            Log in to view your API Key
          </button>
        )}
      </div>

      {/* Protocol actions */}
      <div className="space-y-6">
        <h2 className="text-xl font-black text-white">Supported API Actions</h2>

        {/* 1. Add Order */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-xs font-bold">
              action: "add"
            </span>
            <h3 className="text-base font-bold text-white">Place a New Boost Order</h3>
          </div>
          <p className="text-xs text-slate-400">
            Deducts coins from your balance and immediately queues the social media order.
          </p>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`// Request Body (JSON)
{
  "key": "${apiKey}",
  "action": "add",
  "service": 1,
  "link": "https://instagram.com/p/DFh...",
  "quantity": 1000
}

// Successful Response
{
  "order": 104,
  "status": "pending",
  "cost_coins": 10000,
  "balance": 32750
}`}</pre>
          </div>
        </div>

        {/* 2. Order Status */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono text-xs font-bold">
              action: "status"
            </span>
            <h3 className="text-base font-bold text-white">Check Order Delivery Status</h3>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`// Request Body (JSON)
{
  "key": "${apiKey}",
  "action": "status",
  "order": 104
}

// Response
{
  "order": 104,
  "status": "completed", // "pending" | "processing" | "completed" | "cancelled"
  "charge": 10000,
  "remains": 0,
  "currency": "COINS"
}`}</pre>
          </div>
        </div>

        {/* 3. Service Catalog */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 font-mono text-xs font-bold">
              action: "services"
            </span>
            <h3 className="text-base font-bold text-white">Get Live Services & Rates</h3>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`// Request
POST ${baseUrl}/api/v1/smm
{
  "key": "${apiKey}",
  "action": "services"
}

// Response
[
  {
    "service": 1,
    "name": "Instagram Followers (Influencer High Quality, Non-Drop)",
    "platform": "instagram",
    "category": "followers",
    "rate": 10000, // coin rate per 1,000
    "min": 100,
    "max": 50000
  },
  ...
]`}</pre>
          </div>
        </div>

        {/* 4. Balance */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-mono text-xs font-bold">
              action: "balance"
            </span>
            <h3 className="text-base font-bold text-white">Check Account Coin Balance</h3>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`// Response
{
  "balance": 42750,
  "currency": "COINS",
  "naira_equivalent": 2137.50
}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
