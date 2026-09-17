import React, { useState, useEffect } from 'react';
import {
  Coins,
  CreditCard,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { CoinPackage, Transaction } from '../types/index.ts';
import { apiRequest } from '../lib/api.ts';

export const BuyCoinsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [customNaira, setCustomNaira] = useState<number>(2000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment checkout modal state
  const [activePayment, setActivePayment] = useState<any | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pkgData, summaryData] = await Promise.all([
        apiRequest<{ packages: CoinPackage[] }>('/api/wallet/packages'),
        apiRequest<{ transactions: Transaction[] }>('/api/wallet/summary'),
      ]);
      setPackages(pkgData.packages);
      setTransactions(summaryData.transactions || []);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInitPackage = async (pkgId?: number) => {
    setPayError(null);
    setPaySuccess(null);
    try {
      const payload: any = {};
      if (pkgId) {
        payload.packageId = pkgId;
      } else {
        payload.customNaira = customNaira;
      }

      const res = await apiRequest<any>('/api/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res?.checkoutUrl) throw new Error('KoraPay did not return a checkout URL.');
      window.location.assign(res.checkoutUrl);
    } catch (err: any) {
      setPayError(err.message || 'Failed to initialize payment.');
    }
  };

  // Verify the KoraPay transaction after returning from hosted checkout.
  const handleVerifyPayment = async () => {
    if (!activePayment) return;
    setVerifying(true);
    setPayError(null);
    try {
      const res = await apiRequest<{ message: string; newBalance: number }>(
        `/api/wallet/verify/${activePayment.reference}`,
        { method: 'POST' }
      );

      setPaySuccess(res.message);
      setActivePayment(null);
      await refreshUser();
      await loadData();
    } catch (err: any) {
      setPayError(err.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const calculatedCustomCoins = Math.floor(customNaira * 20);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* 1. Wallet Balance Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
            <Coins className="w-8 h-8 fill-slate-950" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Your Coin Wallet Balance
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl sm:text-4xl font-black text-amber-300">
                {(user?.coin_balance || 0).toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-400">coins</span>
            </div>
            <p className="text-xs text-emerald-400 font-semibold mt-0.5">
              ≈ ₦{(((user?.coin_balance || 0) / 10000) * 500).toLocaleString('en-NG', { minimumFractionDigits: 2 })} Value
            </p>
          </div>
        </div>

        {/* Info pills */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold">Standard Rate</div>
            <div className="font-extrabold text-white text-sm">₦500 = 10,000 Coins</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold">Gateway Security</div>
            <div className="font-extrabold text-emerald-400 text-sm flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> KoraPay Secured
            </div>
          </div>
        </div>
      </div>

      {paySuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold">{paySuccess}</span>
        </div>
      )}

      {payError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{payError}</span>
        </div>
      )}

      {/* 2. Preset Coin Packages */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Select a Discounted Coin Package
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Larger packages include extra bonus coins credited instantly
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => {
            const totalCoins = pkg.coins + (pkg.bonus_coins || 0);
            const isPopular = pkg.badge === 'POPULAR' || pkg.badge === 'BEST VALUE';

            return (
              <div
                key={pkg.id}
                className={`relative rounded-3xl p-6 transition-all border flex flex-col justify-between ${
                  isPopular
                    ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-emerald-500/60 shadow-xl shadow-emerald-500/10 scale-[1.02]'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {pkg.badge && (
                  <span
                    className={`absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      pkg.badge === 'POPULAR'
                        ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                        : pkg.badge === 'BEST VALUE'
                        ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/20'
                        : 'bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {pkg.badge}
                  </span>
                )}

                <div>
                  <h3 className="text-base font-bold text-white">{pkg.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">
                      ₦{pkg.naira_price.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400">NGN</span>
                  </div>

                  <div className="mt-4 p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Base Coins:</span>
                      <span className="font-bold text-white">{pkg.coins.toLocaleString()}</span>
                    </div>
                    {pkg.bonus_coins > 0 && (
                      <div className="flex items-center justify-between text-xs mt-1.5 text-emerald-400 font-semibold">
                        <span>Bonus Extra:</span>
                        <span>+{pkg.bonus_coins.toLocaleString()} Free</span>
                      </div>
                    )}
                    <div className="pt-2 mt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">Total Coins:</span>
                      <span className="font-extrabold text-amber-300 text-sm">
                        {totalCoins.toLocaleString()} coins
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleInitPackage(pkg.id)}
                  className={`w-full mt-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    isPopular
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-md shadow-emerald-400/20'
                      : 'bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-white'
                  }`}
                >
                  Pay with KoraPay
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Custom Naira Top-Up Box */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <h3 className="text-lg font-black text-white mb-2">Custom Amount Top-Up</h3>
        <p className="text-xs text-slate-400 mb-6">
          Enter any amount from ₦100 to ₦1,000,000 to purchase exact coin amounts (1 Naira = 20 Coins)
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-6">
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Amount in Naira (₦)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-slate-500 font-bold">₦</span>
              <input
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={customNaira}
                onChange={(e) => setCustomNaira(Number(e.target.value))}
                className="w-full pl-9 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[500, 1500, 3000, 5000, 10000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCustomNaira(val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    customNaira === val
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  ₦{val.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-6 p-5 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400">Coins to be Credited:</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-amber-300">
                  {calculatedCustomCoins.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-bold">COINS</span>
              </div>
            </div>

            <button
              onClick={() => handleInitPackage()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
            >
              Top Up ₦{customNaira.toLocaleString()}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Transactions History Table */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <h3 className="text-base font-bold text-white mb-4">Coin Wallet Transaction History</h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Naira</th>
                  <th className="py-2.5 px-3">Coins Delta</th>
                  <th className="py-2.5 px-3">Balance After</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-mono font-medium text-slate-300">{t.reference}</td>
                    <td className="py-3 px-3">
                      <span className="capitalize font-semibold text-white">{t.type}</span>
                    </td>
                    <td className="py-3 px-3">
                      {t.amount_naira > 0 ? `₦${t.amount_naira.toLocaleString()}` : '—'}
                    </td>
                    <td className={`py-3 px-3 font-bold ${t.amount_coins >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {t.amount_coins >= 0 ? `+${t.amount_coins.toLocaleString()}` : t.amount_coins.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-300">
                      {t.balance_after.toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          t.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : t.status === 'pending'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{t.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
