import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Coins,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Service, Order } from '../types/index.ts';
import { apiRequest } from '../lib/api.ts';

interface DashboardProps {
  setCurrentTab: (tab: string) => void;
  preselectedServiceId?: number | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ setCurrentTab, preselectedServiceId }) => {
  const { user, refreshUser } = useAuth();

  const [services, setServices] = useState<Service[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram');
  const [selectedServiceId, setSelectedServiceId] = useState<number | ''>('');
  const [linkOrUsername, setLinkOrUsername] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1000);

  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(true);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null);

  // Load services and recent orders
  const loadData = async () => {
    try {
      setLoadingServices(true);
      const [svcData, ordData] = await Promise.all([
        apiRequest<{ services: Service[] }>('/api/services'),
        apiRequest<{ orders: Order[] }>('/api/orders?limit=5'),
      ]);

      setServices(svcData.services);
      setRecentOrders(ordData.orders);

      if (preselectedServiceId) {
        const found = svcData.services.find((s) => s.id === preselectedServiceId);
        if (found) {
          setSelectedPlatform(found.platform);
          setSelectedServiceId(found.id);
          setQuantity(found.min_quantity);
          return;
        }
      }

      // Default to first service on current platform
      const firstOnPlat = svcData.services.find((s) => s.platform === 'instagram');
      if (firstOnPlat) {
        setSelectedServiceId(firstOnPlat.id);
        setQuantity(firstOnPlat.min_quantity);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [preselectedServiceId]);

  // When platform changes, auto-select first service of that platform
  const handlePlatformSelect = (plat: string) => {
    setSelectedPlatform(plat);
    const first = services.find((s) => s.platform === plat);
    if (first) {
      setSelectedServiceId(first.id);
      setQuantity(Math.max(first.min_quantity, 500));
    }
    setOrderError(null);
    setOrderSuccess(null);
  };

  const selectedService = services.find((s) => s.id === Number(selectedServiceId));

  // Calculations
  const coinCost = selectedService
    ? Math.ceil((quantity / 1000) * selectedService.coin_price_per_1000)
    : 0;
  const nairaEquivalent = ((coinCost / 10000) * 500).toFixed(2);
  const currentBalance = user?.coin_balance || 0;
  const remainingBalance = currentBalance - coinCost;
  const hasSufficientCoins = remainingBalance >= 0;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    setOrderSuccess(null);

    if (!selectedService) {
      setOrderError('Please select a service.');
      return;
    }

    if (!linkOrUsername.trim()) {
      setOrderError('Please provide a valid account username or public post URL.');
      return;
    }

    if (quantity < selectedService.min_quantity || quantity > selectedService.max_quantity) {
      setOrderError(
        `Quantity must be between ${selectedService.min_quantity.toLocaleString()} and ${selectedService.max_quantity.toLocaleString()}.`
      );
      return;
    }

    if (!hasSufficientCoins) {
      setOrderError(
        `Insufficient coin balance! You need ${coinCost.toLocaleString()} coins, but only have ${currentBalance.toLocaleString()} coins.`
      );
      return;
    }

    setSubmittingOrder(true);
    try {
      const response = await apiRequest<{ message: string; order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: selectedService.id,
          linkOrUsername: linkOrUsername.trim(),
          quantity,
        }),
      });

      setOrderSuccess(response.order);
      setLinkOrUsername('');
      await refreshUser();
      const updatedOrders = await apiRequest<{ orders: Order[] }>('/api/orders?limit=5');
      setRecentOrders(updatedOrders.orders);
    } catch (err: any) {
      setOrderError(err.message || 'Failed to place order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner: Coin Balance & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Available Coin Balance</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-amber-300">
                {(user?.coin_balance || 0).toLocaleString()}
              </span>
              <span className="text-xs text-amber-500 font-bold">COINS</span>
            </div>
            <p className="text-xs text-emerald-400 font-medium mt-1">
              ≈ ₦{(((user?.coin_balance || 0) / 10000) * 500).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button
            onClick={() => setCurrentTab('buy-coins')}
            className="p-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex flex-col items-center gap-1 transition-all"
          >
            <PlusCircle className="w-5 h-5" />
            <span className="text-[10px] font-bold">Top Up</span>
          </button>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Exchange Rate Standard</span>
            <div className="text-2xl font-black text-white mt-1">₦500 = 10,000</div>
            <p className="text-xs text-slate-400 mt-1">₦0.05 per coin • Instant auto-credit</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Coins className="w-6 h-6" />
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Active Campaign Orders</span>
            <div className="text-2xl font-black text-cyan-400 mt-1">
              {recentOrders.filter((o) => o.status === 'processing' || o.status === 'pending').length} In Progress
            </div>
            <button
              onClick={() => setCurrentTab('orders')}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 mt-1"
            >
              View order tracking <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Order Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Order Form */}
        <div className="lg:col-span-8">
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
                  Place New Boost Order
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select service, enter handle or link, and order automatically
                </p>
              </div>
              <button
                onClick={loadData}
                title="Refresh services and balance"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Error Notification */}
            {orderError && (
              <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <p className="font-semibold">{orderError}</p>
                  {!hasSufficientCoins && (
                    <button
                      onClick={() => setCurrentTab('buy-coins')}
                      className="mt-2 px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors"
                    >
                      Top Up Coins Now via KoraPay
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Success Notification */}
            {orderSuccess && (
              <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <p className="font-bold text-sm">Order #{orderSuccess.id} Placed Successfully!</p>
                  <p className="mt-1">
                    Your request for {orderSuccess.quantity.toLocaleString()} units has been queued for automated delivery.
                  </p>
                  <button
                    onClick={() => setCurrentTab('orders')}
                    className="mt-2 text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    Track in Order History <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleOrderSubmit} className="space-y-6">
              {/* Step 1: Platform Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  1. Choose Platform
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                      onClick={() => handlePlatformSelect(p.id)}
                      className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all border flex flex-col items-center justify-center gap-1 ${
                        selectedPlatform === p.id
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-md shadow-emerald-500/10'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Service Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  2. Select Service
                </label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => {
                    setSelectedServiceId(Number(e.target.value));
                    const s = services.find((srv) => srv.id === Number(e.target.value));
                    if (s && quantity < s.min_quantity) {
                      setQuantity(s.min_quantity);
                    }
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white text-xs font-medium focus:outline-none focus:border-emerald-500"
                >
                  {services
                    .filter((s) => s.platform === selectedPlatform)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.coin_price_per_1000.toLocaleString()} coins / 1k (Min: {s.min_quantity})
                      </option>
                    ))}
                </select>

                {/* Selected Service Details Box */}
                {selectedService && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-slate-400">Delivery Speed:</span>{' '}
                      <span className="font-semibold text-cyan-300">{selectedService.delivery_speed}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400">Limits:</span>{' '}
                      <span className="font-semibold text-white">
                        {selectedService.min_quantity.toLocaleString()} - {selectedService.max_quantity.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400">Guaranteed:</span>{' '}
                      <span className="font-semibold text-emerald-400">Non-Drop / Algorithm Safe</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Target Link or Username */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  3. Link or Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={linkOrUsername}
                    onChange={(e) => setLinkOrUsername(e.target.value)}
                    placeholder={
                      selectedService?.service_type.includes('follower') || selectedService?.service_type.includes('sub')
                        ? 'e.g. @davido or https://instagram.com/davido'
                        : 'e.g. https://www.instagram.com/p/DFh123xyz/'
                    }
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-600 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  Ensure your account profile or post is public during boost delivery.
                </p>
              </div>

              {/* Step 4: Quantity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    4. Quantity
                  </label>
                  <span className="text-xs font-bold text-slate-400">
                    Min: {selectedService?.min_quantity.toLocaleString() || 100} • Max:{' '}
                    {selectedService?.max_quantity.toLocaleString() || 50000}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={selectedService?.min_quantity || 50}
                    max={selectedService?.max_quantity || 100000}
                    step={50}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-48 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                  />
                  {/* Multiplier buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {[500, 1000, 2500, 5000, 10000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuantity(val)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                          quantity === val
                            ? 'bg-slate-800 text-white border-slate-700'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        +{val.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order Submit Button */}
              <button
                type="submit"
                disabled={submittingOrder || !hasSufficientCoins}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 hover:from-emerald-400 hover:to-teal-200 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-emerald-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {submittingOrder ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Placing Order with SMM Engine...
                  </>
                ) : (
                  <>
                    Confirm & Submit Order ({coinCost.toLocaleString()} Coins)
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Dynamic Live Ledger / Summary Box */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Order Ledger Preview
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Target Service:</span>
                <span className="font-bold text-white max-w-[160px] truncate text-right">
                  {selectedService?.name || 'Select Service'}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Quantity:</span>
                <span className="font-bold text-white">{quantity.toLocaleString()} units</span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Rate per 1,000:</span>
                <span className="font-semibold text-amber-300">
                  {selectedService?.coin_price_per_1000.toLocaleString()} coins
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Total Coin Charge:</span>
                <span className="font-extrabold text-amber-300 text-sm">
                  {coinCost.toLocaleString()} coins
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Naira Equivalent:</span>
                <span className="font-extrabold text-emerald-400 text-sm">
                  ₦{Number(nairaEquivalent).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Balance math */}
              <div className="pt-2">
                <div className="flex justify-between text-slate-400">
                  <span>Current Balance:</span>
                  <span>{currentBalance.toLocaleString()} coins</span>
                </div>
                <div className="flex justify-between font-bold mt-1">
                  <span>Balance After Order:</span>
                  <span className={remainingBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {remainingBalance.toLocaleString()} coins
                  </span>
                </div>
              </div>

              {!hasSufficientCoins && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs mt-4">
                  <p className="font-bold">Insufficient Balance</p>
                  <p className="text-[11px] mt-0.5">
                    You need {(coinCost - currentBalance).toLocaleString()} more coins to complete this order.
                  </p>
                  <button
                    onClick={() => setCurrentTab('buy-coins')}
                    className="w-full mt-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
                  >
                    Buy Coins with KoraPay (₦)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Reseller API Promo */}
          <div className="p-5 rounded-3xl bg-slate-900/60 border border-slate-800/80 text-xs">
            <h4 className="font-bold text-white mb-1">Building an Agency or Bot?</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
              Automate your order placements with our high-speed RESTful SMM Reseller API.
            </p>
            <button
              onClick={() => setCurrentTab('api-docs')}
              className="text-cyan-400 hover:underline font-semibold flex items-center gap-1 text-[11px]"
            >
              View API Documentation <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Your Recent Orders</h3>
          <button
            onClick={() => setCurrentTab('orders')}
            className="text-xs text-emerald-400 hover:underline font-semibold"
          >
            View All Orders
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No orders placed yet. Place your first boost above!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Quantity</th>
                  <th className="py-2.5 px-3">Coins</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-white">#{o.id}</td>
                    <td className="py-2.5 px-3 font-medium">{o.service_name || `Service #${o.service_id}`}</td>
                    <td className="py-2.5 px-3 max-w-[150px] truncate text-slate-400">{o.link_or_username}</td>
                    <td className="py-2.5 px-3 font-semibold">{o.quantity.toLocaleString()}</td>
                    <td className="py-2.5 px-3 font-bold text-amber-300">{o.coin_cost.toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          o.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : o.status === 'processing'
                            ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                            : o.status === 'cancelled'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
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
