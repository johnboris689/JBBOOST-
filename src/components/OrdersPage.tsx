import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Coins,
  CheckCircle,
  Clock,
  Ban,
} from 'lucide-react';
import { Order } from '../types/index.ts';
import { apiRequest } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';

export const OrdersPage: React.FC = () => {
  const { refreshUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (platformFilter !== 'all') params.append('platform', platformFilter);

      const data = await apiRequest<{ orders: Order[] }>(`/api/orders?${params.toString()}`);
      setOrders(data.orders);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, platformFilter]);

  const handleCancelOrder = async (orderId: number) => {
    if (!window.confirm(`Are you sure you want to cancel Order #${orderId}? Your coins will be immediately refunded.`)) {
      return;
    }

    setCancellingId(orderId);
    setActionMessage(null);
    try {
      const data = await apiRequest<{ message: string; refundedCoins: number }>(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
      });
      setActionMessage(data.message);
      await refreshUser();
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.id.toString().includes(term) ||
      o.link_or_username.toLowerCase().includes(term) ||
      (o.service_name && o.service_name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-emerald-400" />
            Order History & Tracking
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time delivery status, execution logs, and automated refunds
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Orders
        </button>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800 text-xs w-full md:w-auto">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'pending', label: 'Pending' },
            { id: 'processing', label: 'Processing' },
            { id: 'completed', label: 'Completed' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                statusFilter === tab.id
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Platform Dropdown & Search */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="twitter">X (Twitter)</option>
            <option value="facebook">Facebook</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ID or link..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/60 shadow-2xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Service</th>
              <th className="py-3 px-4">Target Link</th>
              <th className="py-3 px-4">Quantity</th>
              <th className="py-3 px-4">Charge (Coins)</th>
              <th className="py-3 px-4">Naira Value</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                  Loading order history...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  No orders found matching this filter.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    #{order.id}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                    {order.created_at.split(' ')[0]}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white">{order.service_name}</div>
                    <span className="capitalize text-[10px] text-slate-400">
                      {order.platform} • {order.delivery_speed || 'Instant'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 max-w-[180px]">
                    <div className="flex items-center gap-1.5 truncate text-slate-300">
                      <span className="truncate">{order.link_or_username}</span>
                      {order.link_or_username.startsWith('http') && (
                        <a
                          href={order.link_or_username}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-emerald-400"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-white">
                    {order.quantity.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-amber-300">
                    {order.coin_cost.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-emerald-400">
                    ₦{Number(order.naira_equivalent).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'completed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : order.status === 'processing'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          : order.status === 'cancelled'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {order.status === 'completed' && <CheckCircle className="w-2.5 h-2.5" />}
                      {order.status === 'processing' && <Clock className="w-2.5 h-2.5 animate-spin" />}
                      {order.status === 'cancelled' && <Ban className="w-2.5 h-2.5" />}
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {order.status === 'pending' ? (
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancellingId === order.id}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        {cancellingId === order.id ? 'Refunding...' : 'Cancel & Refund'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
