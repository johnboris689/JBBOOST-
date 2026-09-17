import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Layers,
  ShoppingBag,
  Coins,
  FileText,
  Search,
  CheckCircle,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Download,
  Ban,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { AdminStats, Service, Order, Transaction, CoinPackage } from '../types/index.ts';
import { apiRequest } from '../lib/api.ts';

export const AdminPanel: React.FC = () => {
  const [activeAdminTab, setActiveAdminTab] = useState<
    'stats' | 'users' | 'services' | 'orders' | 'packages' | 'transactions'
  >('stats');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [userSearch, setUserSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // Modals
  const [adjustCoinsModal, setAdjustCoinsModal] = useState<{ userId: number; email: string } | null>(null);
  const [coinAmount, setCoinAmount] = useState<number>(10000);
  const [adjustReason, setAdjustReason] = useState<string>('Bonus promotional credit');

  const [serviceModal, setServiceModal] = useState<any | null>(null); // null = closed, {} = new or edit
  const [isEditingService, setIsEditingService] = useState(false);

  const [orderModal, setOrderModal] = useState<Order | null>(null);
  const [newOrderStatus, setNewOrderStatus] = useState<string>('completed');

  const loadStats = async () => {
    try {
      const data = await apiRequest<AdminStats>('/api/admin/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await apiRequest<{ users: any[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadServices = async () => {
    try {
      const data = await apiRequest<{ services: Service[] }>('/api/admin/services');
      setServices(data.services);
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await apiRequest<{ orders: Order[] }>('/api/admin/orders');
      setOrders(data.orders);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  };

  const loadPackages = async () => {
    try {
      const data = await apiRequest<{ packages: CoinPackage[] }>('/api/admin/packages');
      setPackages(data.packages);
    } catch (err) {
      console.error('Failed to load packages:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      const data = await apiRequest<{ transactions: Transaction[] }>('/api/admin/transactions');
      setTransactions(data.transactions);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadUsers(), loadServices(), loadOrders(), loadPackages(), loadTransactions()]).finally(
      () => setLoading(false)
    );
  }, []);

  // Handlers for User actions
  const handleToggleBan = async (userId: number) => {
    try {
      await apiRequest(`/api/admin/users/${userId}/toggle-ban`, { method: 'POST' });
      await loadUsers();
      await loadStats();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleAdjustCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustCoinsModal) return;
    try {
      await apiRequest(`/api/admin/users/${adjustCoinsModal.userId}/adjust-coins`, {
        method: 'POST',
        body: JSON.stringify({ amountCoins: coinAmount, reason: adjustReason }),
      });
      alert('Coins adjusted successfully!');
      setAdjustCoinsModal(null);
      await loadUsers();
      await loadStats();
    } catch (err: any) {
      alert(err.message || 'Coin adjustment failed');
    }
  };

  // Handlers for Service actions
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditingService) {
        await apiRequest(`/api/admin/services/${serviceModal.id}`, {
          method: 'PUT',
          body: JSON.stringify(serviceModal),
        });
      } else {
        await apiRequest('/api/admin/services', {
          method: 'POST',
          body: JSON.stringify(serviceModal),
        });
      }
      setServiceModal(null);
      await loadServices();
    } catch (err: any) {
      alert(err.message || 'Service save failed');
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!window.confirm('Are you sure you want to deactivate this service?')) return;
    try {
      await apiRequest(`/api/admin/services/${id}`, { method: 'DELETE' });
      await loadServices();
    } catch (err: any) {
      alert(err.message || 'Deactivation failed');
    }
  };

  // Handlers for Order actions
  const handleUpdateOrderStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderModal) return;
    try {
      await apiRequest(`/api/admin/orders/${orderModal.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: newOrderStatus }),
      });
      alert(`Order #${orderModal.id} updated to ${newOrderStatus}`);
      setOrderModal(null);
      await loadOrders();
      await loadStats();
    } catch (err: any) {
      alert(err.message || 'Order update failed');
    }
  };

  const handleExportTransactions = () => {
    window.open('/api/admin/reports/transactions/export', '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white">System Admin Portal</h1>
            <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-xs font-bold uppercase">
              Super Admin
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete platform management: users, service pricing, automated fulfillment, and ledgers
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
          {[
            { id: 'stats', label: 'Overview', icon: TrendingUp },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'services', label: 'Services', icon: Layers },
            { id: 'orders', label: 'Orders', icon: ShoppingBag },
            { id: 'packages', label: 'Packages', icon: Coins },
            { id: 'transactions', label: 'Ledger', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveAdminTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all ${
                  activeAdminTab === tab.id
                    ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. OVERVIEW & METRICS TAB */}
      {activeAdminTab === 'stats' && stats && (
        <div className="space-y-8">
          {/* Stat counters grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Naira Revenue (Deposits)</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                ₦{stats.totalNairaRevenue.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">KoraPay confirmed</p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Coins In Circulation</span>
              <div className="text-2xl font-black text-amber-300 mt-1">
                {stats.coinsInCirculation.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Held across user wallets</p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Total Orders Placed</span>
              <div className="text-2xl font-black text-white mt-1">
                {stats.totalOrders.toLocaleString()}
              </div>
              <p className="text-[11px] text-cyan-400 mt-1">{stats.pendingOrders} pending fulfillment</p>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Registered Users</span>
              <div className="text-2xl font-black text-white mt-1">
                {stats.totalUsers.toLocaleString()}
              </div>
              <p className="text-[11px] text-rose-400 mt-1">{stats.bannedUsers} banned</p>
            </div>
          </div>

          {/* Daily Activity Chart */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
            <h3 className="text-base font-bold text-white mb-4">Daily Orders Volume (Last 7 Days)</h3>
            <div className="h-44 flex items-end gap-4 pt-8">
              {stats.dailyData.length === 0 ? (
                <div className="w-full text-center text-xs text-slate-500">No recent daily activity yet</div>
              ) : (
                stats.dailyData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">{d.order_count}</span>
                    <div
                      style={{ height: `${Math.max(16, Math.min(120, d.order_count * 20))}px` }}
                      className="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-emerald-600 to-teal-400 shadow-md shadow-emerald-500/20"
                    />
                    <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. USERS MANAGEMENT TAB */}
      {activeAdminTab === 'users' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <h3 className="text-base font-bold text-white">Registered Users ({users.length})</h3>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user name or email..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 uppercase text-[10px] font-bold text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">User ID</th>
                  <th className="py-2.5 px-3">Name & Email</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Coin Balance</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users
                  .filter((u) => !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase()) || u.name.toLowerCase().includes(userSearch.toLowerCase()))
                  .map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-mono font-bold text-white">#{u.id}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{u.phone || '—'}</td>
                      <td className="py-3 px-3 font-bold text-amber-300">
                        {u.coin_balance.toLocaleString()} coins
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-950 text-purple-300' : 'bg-slate-800 text-slate-300'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.is_banned ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'}`}>
                          {u.is_banned ? 'Banned' : 'Active'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <button
                          onClick={() => setAdjustCoinsModal({ userId: u.id, email: u.email })}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px] font-semibold"
                        >
                          Adjust Coins
                        </button>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleToggleBan(u.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${u.is_banned ? 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900' : 'bg-rose-950 text-rose-300 hover:bg-rose-900'}`}
                          >
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. SERVICES MANAGEMENT TAB */}
      {activeAdminTab === 'services' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-white">SMM Services Catalog ({services.length})</h3>
            <button
              onClick={() => {
                setIsEditingService(false);
                setServiceModal({
                  platform: 'instagram',
                  service_type: 'followers',
                  name: '',
                  description: '',
                  coin_price_per_1000: 5000,
                  min_quantity: 100,
                  max_quantity: 25000,
                  delivery_speed: '1-6 hours',
                  is_active: 1,
                });
              }}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add New Service
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 uppercase text-[10px] font-bold text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Service Name</th>
                  <th className="py-2.5 px-3">Rate / 1k Coins</th>
                  <th className="py-2.5 px-3">Naira Eq</th>
                  <th className="py-2.5 px-3">Min / Max</th>
                  <th className="py-2.5 px-3">Speed</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold">
                        {s.platform}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-white">{s.name}</td>
                    <td className="py-3 px-3 font-bold text-amber-300">
                      {s.coin_price_per_1000.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-emerald-400">
                      ₦{(((s.coin_price_per_1000) / 10000) * 500).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {s.min_quantity} - {s.max_quantity}
                    </td>
                    <td className="py-3 px-3 text-cyan-300">{s.delivery_speed}</td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          setIsEditingService(true);
                          setServiceModal({ ...s });
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteService(s.id)}
                        className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. ORDERS MANAGEMENT TAB */}
      {activeAdminTab === 'orders' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-white">All Platform Orders ({orders.length})</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 uppercase text-[10px] font-bold text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3">Target Link</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Coins</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Update Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-mono font-bold text-white">#{o.id}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{o.user_name}</div>
                      <div className="text-[10px] text-slate-400">{o.user_email}</div>
                    </td>
                    <td className="py-3 px-3 max-w-[160px] truncate">{o.service_name}</td>
                    <td className="py-3 px-3 max-w-[140px] truncate text-slate-400">{o.link_or_username}</td>
                    <td className="py-3 px-3 font-semibold">{o.quantity.toLocaleString()}</td>
                    <td className="py-3 px-3 font-bold text-amber-300">{o.coin_cost.toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${o.status === 'completed' ? 'bg-emerald-950 text-emerald-400' : o.status === 'cancelled' ? 'bg-rose-950 text-rose-400' : 'bg-cyan-950 text-cyan-400'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          setOrderModal(o);
                          setNewOrderStatus(o.status);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-950 text-purple-300 hover:bg-purple-900 text-[11px] font-semibold"
                      >
                        Change Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. TRANSACTIONS & EXPORT TAB */}
      {activeAdminTab === 'transactions' && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-white">Financial Audit Ledger</h3>
            <button
              onClick={handleExportTransactions}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Export Ledger as CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 uppercase text-[10px] font-bold text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Ref</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Naira</th>
                  <th className="py-2.5 px-3">Coins Delta</th>
                  <th className="py-2.5 px-3">Balance After</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-mono text-slate-300">{t.reference}</td>
                    <td className="py-3 px-3">{t.user_email}</td>
                    <td className="py-3 px-3 capitalize font-semibold">{t.type}</td>
                    <td className="py-3 px-3">₦{t.amount_naira.toLocaleString()}</td>
                    <td className={`py-3 px-3 font-bold ${t.amount_coins >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {t.amount_coins >= 0 ? `+${t.amount_coins.toLocaleString()}` : t.amount_coins.toLocaleString()}
                    </td>
                    <td className="py-3 px-3">{t.balance_after.toLocaleString()}</td>
                    <td className="py-3 px-3 text-slate-400">{t.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Coins Modal */}
      {adjustCoinsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Adjust User Coin Balance</h3>
            <p className="text-xs text-slate-400 mb-4">Target User: {adjustCoinsModal.email}</p>

            <form onSubmit={handleAdjustCoins} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Coins Amount (+ or -)</label>
                <input
                  type="number"
                  required
                  value={coinAmount}
                  onChange={(e) => setCoinAmount(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Reason for Audit Log</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Save Coin Adjustment
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustCoinsModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Status Modal */}
      {orderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Update Order #{orderModal.id}</h3>
            <p className="text-xs text-slate-400 mb-4">
              Note: Setting to "cancelled" automatically refunds {orderModal.coin_cost.toLocaleString()} coins back to the user.
            </p>

            <form onSubmit={handleUpdateOrderStatus} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Select Status</label>
                <select
                  value={newOrderStatus}
                  onChange={(e) => setNewOrderStatus(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled (Auto-Refund)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  Confirm Status Change
                </button>
                <button
                  type="button"
                  onClick={() => setOrderModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service Modal (Add/Edit) */}
      {serviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              {isEditingService ? 'Edit SMM Service' : 'Add New SMM Service'}
            </h3>

            <form onSubmit={handleSaveService} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Platform</label>
                  <select
                    value={serviceModal.platform}
                    onChange={(e) => setServiceModal({ ...serviceModal, platform: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="twitter">X (Twitter)</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Service Type</label>
                  <input
                    type="text"
                    required
                    value={serviceModal.service_type}
                    onChange={(e) => setServiceModal({ ...serviceModal, service_type: e.target.value })}
                    placeholder="followers, likes, views"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  value={serviceModal.name}
                  onChange={(e) => setServiceModal({ ...serviceModal, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Coins / 1k</label>
                  <input
                    type="number"
                    required
                    value={serviceModal.coin_price_per_1000}
                    onChange={(e) => setServiceModal({ ...serviceModal, coin_price_per_1000: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-amber-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Min Qty</label>
                  <input
                    type="number"
                    required
                    value={serviceModal.min_quantity}
                    onChange={(e) => setServiceModal({ ...serviceModal, min_quantity: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Max Qty</label>
                  <input
                    type="number"
                    required
                    value={serviceModal.max_quantity}
                    onChange={(e) => setServiceModal({ ...serviceModal, max_quantity: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Delivery Speed Description</label>
                <input
                  type="text"
                  required
                  value={serviceModal.delivery_speed}
                  onChange={(e) => setServiceModal({ ...serviceModal, delivery_speed: e.target.value })}
                  placeholder="e.g. 10-30 mins"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  Save Service
                </button>
                <button
                  type="button"
                  onClick={() => setServiceModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
