import React, { useState, useEffect } from 'react';
import {
  Zap,
  TrendingUp,
  ShieldCheck,
  CheckCircle,
  Coins,
  ArrowRight,
  Sparkles,
  Calculator,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Service } from '../types/index.ts';
import { apiRequest } from '../lib/api.ts';

interface LandingPageProps {
  setCurrentTab: (tab: string) => void;
  onSelectServiceForOrder?: (serviceId: number) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ setCurrentTab, onSelectServiceForOrder }) => {
  const { user, openAuthModal } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [calcPlatform, setCalcPlatform] = useState<string>('instagram');
  const [calcServiceId, setCalcServiceId] = useState<number | null>(null);
  const [calcQuantity, setCalcQuantity] = useState<number>(1000);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<{ services: Service[] }>('/api/services')
      .then((data) => {
        setServices(data.services);
        const firstInsta = data.services.find((s) => s.platform === 'instagram');
        if (firstInsta) {
          setCalcServiceId(firstInsta.id);
        }
      })
      .catch((err) => console.error('Failed to load services on landing:', err));
  }, []);

  const filteredServices = selectedPlatform === 'all'
    ? services
    : services.filter((s) => s.platform === selectedPlatform);

  // Calculator service
  const activeCalcService = services.find((s) => s.id === calcServiceId) || services[0];
  const calcCoinCost = activeCalcService
    ? Math.ceil((calcQuantity / 1000) * activeCalcService.coin_price_per_1000)
    : 0;
  const calcNairaEquivalent = ((calcCoinCost / 10000) * 500).toFixed(2);

  const handleStartOrder = (serviceId?: number) => {
    if (serviceId && onSelectServiceForOrder) {
      onSelectServiceForOrder(serviceId);
    }
    if (user) {
      setCurrentTab('order');
    } else {
      openAuthModal('register');
    }
  };

  const faqs = [
    {
      q: 'How does the Coin Economy work with Nigerian Naira (₦)?',
      a: 'We use a virtual coins wallet system. The base exchange rate is ₦500 = 10,000 Coins (just ₦0.05 per coin). You fund your wallet once via KoraPay or Nigerian debit card / bank transfer, and then spend coins instantly on any service without waiting for payment processing on every order.',
    },
    {
      q: 'Are these followers and likes real and safe for my account?',
      a: 'Yes! We provide high retention, non-drop, influencer-grade engagement tailored for social media algorithms. Your account password is NEVER required; you only provide your public username or post link.',
    },
    {
      q: 'How fast will my order start delivering?',
      a: 'Most services (like Instagram Likes, TikTok Views, Reel Impressions) start delivering automatically within 5 to 15 minutes of ordering. High-volume followers are delivered naturally over a few hours to protect account safety.',
    },
    {
      q: 'Can I connect this to my own website or external reseller bot?',
      a: 'Yes! We provide a fully documented SMM Reseller API compatible with standard protocols. You can generate an API key in your profile and automate orders, check status, and check balance.',
    },
  ];

  return (
    <div className="space-y-20 pb-20">
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 md:pt-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-6 animate-in fade-in">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Nigeria's Premier SMM Growth Panel & Coin Economy</span>
          <span className="bg-emerald-500 text-slate-950 font-bold px-1.5 py-0.2 rounded text-[10px]">
            ₦500 = 10k Coins
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
          Explode Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">Social Reach</span> With Virtual Coins.
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Order genuine Instagram followers, TikTok viral views, YouTube subscribers, and Twitter engagement at wholesale rates. Fund your wallet with Naira via KoraPay, spend coins instantly.
        </p>

        {/* Live rate ticker */}
        <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-4 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 shadow-xl">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>10,000 Coins = ₦500</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>KoraPay Webhook Verified</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5 text-cyan-300 font-medium">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Instant Automated Delivery</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            id="hero-get-started-btn"
            onClick={() => handleStartOrder()}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 hover:from-emerald-400 hover:to-teal-200 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
          >
            {user ? 'Go to Order Dashboard' : 'Create Free Account & Boost Now'}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            id="hero-view-pricing-btn"
            onClick={() => {
              const el = document.getElementById('services-rate-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-sm transition-all"
          >
            View Live Price Sheet
          </button>
        </div>

        {/* Stats Row */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <p className="text-2xl sm:text-3xl font-black text-white">1.2M+</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Orders Delivered</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <p className="text-2xl sm:text-3xl font-black text-emerald-400">99.8%</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Delivery Success Rate</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <p className="text-2xl sm:text-3xl font-black text-amber-300">₦500</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Min Coin Top-up</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <p className="text-2xl sm:text-3xl font-black text-cyan-400">&lt; 15 mins</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Average Start Time</p>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE COIN & GROWTH CALCULATOR */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2.5 mb-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Interactive Naira & Coin Calculator
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mb-8 max-w-2xl">
            See exactly how many virtual coins your target social boost will cost, and its exact equivalent in Nigerian Naira (₦).
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Input column */}
            <div className="lg:col-span-7 space-y-5">
              {/* Platform selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">1. Select Social Platform</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: 'instagram', label: 'Instagram' },
                    { id: 'tiktok', label: 'TikTok' },
                    { id: 'youtube', label: 'YouTube' },
                    { id: 'twitter', label: 'X (Twitter)' },
                    { id: 'facebook', label: 'Facebook' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setCalcPlatform(p.id);
                        const match = services.find((s) => s.platform === p.id);
                        if (match) setCalcServiceId(match.id);
                      }}
                      className={`py-2 px-1 rounded-xl text-center text-xs font-semibold transition-all border ${
                        calcPlatform === p.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">2. Select Service Type</label>
                <select
                  value={calcServiceId || ''}
                  onChange={(e) => setCalcServiceId(Number(e.target.value))}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  {services
                    .filter((s) => s.platform === calcPlatform)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.coin_price_per_1000.toLocaleString()} coins / 1k)
                      </option>
                    ))}
                </select>
              </div>

              {/* Quantity slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-300">3. Target Quantity</label>
                  <span className="text-sm font-black text-emerald-400">{calcQuantity.toLocaleString()} units</span>
                </div>
                <input
                  type="range"
                  min={activeCalcService?.min_quantity || 100}
                  max={Math.min(activeCalcService?.max_quantity || 50000, 20000)}
                  step={100}
                  value={calcQuantity}
                  onChange={(e) => setCalcQuantity(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex gap-2 mt-2">
                  {[500, 1000, 2500, 5000, 10000].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setCalcQuantity(q)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                        calcQuantity === q
                          ? 'bg-slate-800 text-white border-slate-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      +{q.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live conversion summary card */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-950 border border-emerald-500/30 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Calculation Summary</p>
                <div className="mt-4 space-y-3">
                  <div>
                    <span className="text-xs text-slate-400">Total Coins Required:</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-black text-amber-300">{calcCoinCost.toLocaleString()}</span>
                      <span className="text-xs text-slate-400">coins</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-400">Exact Naira Value (₦):</span>
                    <div className="text-2xl font-black text-emerald-400 mt-0.5">
                      ₦{Number(calcNairaEquivalent).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">At standard rate: ₦500 = 10,000 coins</p>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-300">
                    <span>Speed:</span>
                    <span className="font-semibold text-cyan-300">{activeCalcService?.delivery_speed || 'Instant - 1 hour'}</span>
                  </div>
                </div>
              </div>

              <button
                id="calc-place-order-btn"
                onClick={() => handleStartOrder(activeCalcService?.id)}
                className="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                Order This Package Now
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. WHY THE COIN ECONOMY? (Features) */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Designed for Nigerian Creators & SMM Resellers
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Why thousands of digital marketers choose our virtual coin ecosystem over slow direct card debits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
              <Coins className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Zero Checkout Friction</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Never get stuck on bank OTPs or card decline errors in the middle of a client campaign. Fund your coins once via KoraPay, and fire off orders in 1-click.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Tiered Value Pricing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              High-value influencer followers are priced accurately for durability, while video views and likes cost as low as ₦40 per thousand.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Automated Refund Guarantee</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              If an order is cancelled or a link is invalid, coins are instantly refunded straight back into your account balance without bank disputes.
            </p>
          </div>
        </div>
      </section>

      {/* 4. LIVE SERVICES PRICE SHEET */}
      <section id="services-rate-section" className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Live Services Catalog & Rates
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Transparent coin pricing per 1,000 units. Admin-updated in real time.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
            {['all', 'instagram', 'tiktok', 'youtube', 'twitter', 'facebook'].map((plat) => (
              <button
                key={plat}
                type="button"
                onClick={() => setSelectedPlatform(plat)}
                className={`px-3 py-1.5 rounded-xl capitalize font-semibold transition-all ${
                  selectedPlatform === plat
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {plat === 'twitter' ? 'X (Twitter)' : plat}
              </button>
            ))}
          </div>
        </div>

        {/* Services Table */}
        <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Service</th>
                <th className="py-3.5 px-4">Platform</th>
                <th className="py-3.5 px-4">Coin Cost / 1k</th>
                <th className="py-3.5 px-4">Naira Eq. / 1k</th>
                <th className="py-3.5 px-4">Min / Max</th>
                <th className="py-3.5 px-4">Est. Speed</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredServices.map((s) => {
                const nairaRate = ((s.coin_price_per_1000 / 10000) * 500).toFixed(2);
                return (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div>{s.name}</div>
                      {s.description && (
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">{s.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-semibold">
                        {s.platform}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-amber-300">
                      {s.coin_price_per_1000.toLocaleString()} coins
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-400">
                      ₦{Number(nairaRate).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {s.min_quantity.toLocaleString()} - {s.max_quantity.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-cyan-300 font-medium">
                      {s.delivery_speed}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleStartOrder(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-semibold transition-all"
                      >
                        Order
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. FREQUENTLY ASKED QUESTIONS */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white">Frequently Asked Questions</h2>
          <p className="text-xs text-slate-400 mt-1">Everything you need to know about coins, delivery, and payments</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden transition-colors"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full py-4 px-6 text-left flex items-center justify-between text-sm font-bold text-white hover:text-emerald-400 transition-colors"
              >
                <span>{faq.q}</span>
                {openFaq === idx ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-4 text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 6. CALL TO ACTION FOOTER BANNER */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 border border-emerald-500/30 p-8 sm:p-12 text-center relative overflow-hidden">
          <h2 className="text-2xl sm:text-4xl font-black text-white">Ready to Boost Your Profiles?</h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Fund your wallet with as low as ₦500, get 10,000 coins instantly, and launch your first viral social media campaign in minutes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => handleStartOrder()}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-all"
            >
              Get Started Now
            </button>
            <button
              onClick={() => setCurrentTab('buy-coins')}
              className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all"
            >
              Buy Coins With KoraPay
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
