import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  ShoppingBag, RefreshCw, AlertTriangle, CheckCircle2, 
  Search, Filter, Send, Clock, AlertCircle, Coins, 
  ExternalLink, ChevronRight, X, ArrowUpRight
} from 'lucide-react';
import { PlatformIcon } from '../../components/PlatformIcon';

export const AdminOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  // Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [manualStatus, setManualStatus] = useState('');
  const [manualDelivered, setManualDelivered] = useState(0);
  const [refundUserOnCancel, setRefundUserOnCancel] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordData, provData] = await Promise.all([
        api.getAdminSocialOrders(),
        api.getAdminProviders()
      ]);
      setOrders(ordData);
      setProviders(provData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.syncAllAdminSocialOrders();
      if (res.success && res.stats) {
        setSuccessMsg(
          `Sync completed: ${res.stats.checked} checked, ${res.stats.updated} updated (${res.stats.completed} completed, ${res.stats.canceled} canceled, ${res.stats.partial} partial, ${res.stats.refunded} refunded).`
        );
      } else {
        setSuccessMsg('Status sync complete.');
      }
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to run full status sync.');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleResendOrder = async (orderId: string) => {
    setActionLoading(`resend-${orderId}`);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.resendAdminSocialOrder(orderId);
      if (res.success) {
        setSuccessMsg(`Order ${orderId} successfully forwarded to provider (Provider Order ID: ${res.order?.providerOrderId || res.result?.providerOrderId}).`);
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(res.order);
        }
        loadData();
      } else {
        setErrorMsg(`Failed to dispatch: ${res.result?.error || 'Provider rejected request.'}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to resend order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncSingle = async (orderId: string) => {
    setActionLoading(`sync-${orderId}`);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.syncAdminSocialOrder(orderId);
      if (res.success) {
        setSuccessMsg(`Order ${orderId} synced. Current Status: ${res.status || res.order?.status}`);
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(res.order);
        }
        loadData();
      } else {
        setErrorMsg(`Sync failed: ${res.error || 'Provider did not return status.'}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sync single order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setActionLoading('manual-update');
    setErrorMsg('');
    try {
      const res = await api.updateAdminSocialOrder(selectedOrder.id, {
        status: manualStatus,
        deliveredQuantity: manualDelivered,
        refundUser: refundUserOnCancel
      });
      setSuccessMsg(`Order ${selectedOrder.id} status updated to '${manualStatus}'.`);
      if (res.refundedAmount > 0) {
        setSuccessMsg((prev) => `${prev} Refunded ₦${res.refundedAmount} to customer wallet.`);
      }
      setSelectedOrder(res.order || { ...selectedOrder, status: manualStatus });
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update order status.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.userEmail.toLowerCase().includes(q) ||
      o.serviceName.toLowerCase().includes(q) ||
      (o.providerOrderId && String(o.providerOrderId).toLowerCase().includes(q));

    const matchStatus = statusFilter === 'all' || String(o.status).toLowerCase() === statusFilter.toLowerCase();
    const matchFulfillment =
      fulfillmentFilter === 'all' || String(o.fulfillmentStatus || 'manual').toLowerCase() === fulfillmentFilter.toLowerCase();
    const matchFlagged = !onlyFlagged || Boolean(o.flaggedForReview);

    return matchSearch && matchStatus && matchFulfillment && matchFlagged;
  });

  const getStatusBadge = (status: string) => {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'completed') {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Completed</span>;
    }
    if (s === 'in_progress' || s === 'processing') {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">In Progress</span>;
    }
    if (s === 'partial') {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">Partial</span>;
    }
    if (s === 'cancelled') {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/20">Canceled</span>;
    }
    if (s === 'failed') {
      return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/20">Failed</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-purple-500/10 text-[#df6f8e] border border-purple-500/20">Pending</span>;
  };

  const getFulfillmentBadge = (fStatus: string) => {
    const s = String(fStatus || 'manual').toLowerCase();
    if (s === 'automated') {
      return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-300 font-mono">Automated</span>;
    }
    if (s === 'failed') {
      return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/15 text-red-300 font-mono">Dispatch Failed</span>;
    }
    if (s === 'processing') {
      return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/15 text-amber-300 font-mono">Dispatching</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-white/10 text-slate-400 font-mono">Manual</span>;
  };

  const providerMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    providers.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [providers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-[#df6f8e]" />
            Order Fulfillment Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitor real-time customer social orders, automated provider dispatch, live status checks, and refunds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="jb-primary text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
            {syncingAll ? 'Syncing All Active...' : 'Sync Provider Statuses'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="jb-card p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            placeholder="Search email, order ID, provider ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="jb-input w-full pl-9"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="jb-input w-full"
          >
            <option value="all">All Order Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="partial">Partial</option>
            <option value="cancelled">Canceled</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <select
            value={fulfillmentFilter}
            onChange={(e) => setFulfillmentFilter(e.target.value)}
            className="jb-input w-full"
          >
            <option value="all">All Fulfillment Types</option>
            <option value="automated">Automated (Sent to SMM)</option>
            <option value="manual">Manual (No Provider)</option>
            <option value="failed">Dispatch Failed</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyFlagged(!onlyFlagged)}
            className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              onlyFlagged
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-white/[.03] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            48h Stale Review
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="jb-card overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-500">Loading orders catalog...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-20 text-center text-xs text-slate-500">No orders match filter criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[.02] border-b border-white/5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5">Order</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Service & Platform</th>
                  <th className="p-3.5">Quantity / Coins</th>
                  <th className="p-3.5">Provider Fulfillment</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOrders.map((order) => {
                  const isFlagged = Boolean(order.flaggedForReview);
                  const isResending = actionLoading === `resend-${order.id}`;
                  const isSyncing = actionLoading === `sync-${order.id}`;
                  const providerName = order.providerId ? providerMap[order.providerId] || 'External Provider' : null;

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-white/[.02] transition ${
                        isFlagged ? 'bg-amber-500/[.03]' : ''
                      }`}
                    >
                      {/* ID & Date */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-white text-xs">{order.id}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {isFlagged && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            <Clock className="w-2.5 h-2.5" /> &gt;48h Unfinished
                          </span>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="p-3.5">
                        <div className="font-medium text-slate-300 truncate max-w-[150px]">{order.userEmail}</div>
                      </td>

                      {/* Service */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon platform={order.platform} className="w-4 h-4 text-[#df6f8e] shrink-0" />
                          <span className="font-bold text-white truncate max-w-[180px]" title={order.serviceName}>
                            {order.serviceName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]" title={order.targetUrl}>
                          {order.targetUrl}
                        </div>
                      </td>

                      {/* Quantity & Amount */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-white">
                          {Number(order.quantity).toLocaleString()} units
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-[#df6f8e]" />
                          {Math.round(Number(order.amount) * 2).toLocaleString()} coins
                        </div>
                      </td>

                      {/* Provider Fulfillment */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          {getFulfillmentBadge(order.fulfillmentStatus)}
                        </div>
                        {order.providerOrderId ? (
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            Ext ID: #{order.providerOrderId}
                            {providerName && <span className="text-slate-500 block">({providerName})</span>}
                          </div>
                        ) : order.fulfillmentError ? (
                          <div className="text-[10px] text-red-400 mt-1 truncate max-w-[180px]" title={order.fulfillmentError}>
                            {order.fulfillmentError}
                          </div>
                        ) : null}
                      </td>

                      {/* Order Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                        {order.deliveredQuantity !== undefined && Number(order.quantity) > 0 && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            {Number(order.deliveredQuantity || 0).toLocaleString()} / {Number(order.quantity).toLocaleString()} delivered
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Sync single order if has providerOrderId */}
                          {order.providerOrderId && (
                            <button
                              onClick={() => handleSyncSingle(order.id)}
                              disabled={isSyncing}
                              title="Check status from provider"
                              className="p-1.5 rounded-lg bg-white/[.04] hover:bg-white/10 text-slate-300 transition"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#df6f8e]' : ''}`} />
                            </button>
                          )}

                          {/* Resend / dispatch button */}
                          <button
                            onClick={() => handleResendOrder(order.id)}
                            disabled={isResending}
                            title="Forward / Retry dispatch to external provider"
                            className="p-1.5 rounded-lg bg-[#7d1738]/30 hover:bg-[#7d1738] text-white transition"
                          >
                            <Send className={`w-3.5 h-3.5 ${isResending ? 'animate-pulse text-[#df6f8e]' : ''}`} />
                          </button>

                          {/* Open Details / Edit */}
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setManualStatus(order.status);
                              setManualDelivered(Number(order.deliveredQuantity || 0));
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/[.05] hover:bg-white/10 text-slate-300 text-[11px] font-bold transition flex items-center gap-1"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details & Manual Intervention Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-2 sm:p-4">
          <div className="w-full max-w-2xl bg-[#12070b] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">Order ID: {selectedOrder.id}</span>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <h3 className="text-xl font-black text-white mt-1">{selectedOrder.serviceName}</h3>
                <div className="text-xs text-slate-400">{selectedOrder.userEmail}</div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-white/[.02] border border-white/5">
                <span className="text-slate-500 block text-[10px]">Total Units</span>
                <span className="font-black text-white text-sm">{Number(selectedOrder.quantity).toLocaleString()}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[.02] border border-white/5">
                <span className="text-slate-500 block text-[10px]">Delivered</span>
                <span className="font-black text-emerald-400 text-sm">{Number(selectedOrder.deliveredQuantity || 0).toLocaleString()}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[.02] border border-white/5">
                <span className="text-slate-500 block text-[10px]">Remains</span>
                <span className="font-black text-amber-400 text-sm">{Number(selectedOrder.remains || Math.max(0, Number(selectedOrder.quantity) - Number(selectedOrder.deliveredQuantity || 0))).toLocaleString()}</span>
              </div>
            </div>

            {/* Target URL */}
            <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-xs">
              <span className="text-slate-500 text-[10px] block">Customer Target Link</span>
              <a
                href={selectedOrder.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#df6f8e] hover:underline font-mono break-all mt-0.5 flex items-center gap-1"
              >
                {selectedOrder.targetUrl} <ArrowUpRight className="w-3.5 h-3.5 inline" />
              </a>
            </div>

            {/* Provider Integration Status */}
            <div className="p-4 rounded-xl bg-white/[.02] border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  Provider Linkage & Sync
                </span>
                {getFulfillmentBadge(selectedOrder.fulfillmentStatus)}
              </div>

              <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block">External Provider Order ID:</span>
                  <span className="font-mono text-white font-bold">
                    {selectedOrder.providerOrderId || 'Not assigned'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Last Synced:</span>
                  <span className="text-slate-300">
                    {selectedOrder.lastSyncedAt ? new Date(selectedOrder.lastSyncedAt).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>

              {selectedOrder.fulfillmentError && (
                <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/20 text-red-300 text-[11px]">
                  <span className="font-bold block">Fulfillment Error:</span>
                  {selectedOrder.fulfillmentError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleResendOrder(selectedOrder.id)}
                  disabled={actionLoading === `resend-${selectedOrder.id}`}
                  className="px-3 py-2 rounded-xl bg-[#7d1738] hover:bg-[#a72b50] text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {actionLoading === `resend-${selectedOrder.id}` ? 'Dispatching...' : 'Resend / Forward to Provider'}
                </button>

                {selectedOrder.providerOrderId && (
                  <button
                    type="button"
                    onClick={() => handleSyncSingle(selectedOrder.id)}
                    disabled={actionLoading === `sync-${selectedOrder.id}`}
                    className="px-3 py-2 rounded-xl bg-white/[.05] hover:bg-white/10 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === `sync-${selectedOrder.id}` ? 'animate-spin' : ''}`} />
                    Query Status from Provider
                  </button>
                )}
              </div>
            </div>

            {/* Manual Status Intervention & Auto-Refund */}
            <form onSubmit={handleManualUpdate} className="p-4 rounded-xl bg-white/[.02] border border-white/5 space-y-3">
              <span className="text-xs font-bold text-white block">Manual Status Override</span>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Update Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="jb-input w-full"
                  >
                    <option value="pending">pending</option>
                    <option value="processing">processing</option>
                    <option value="in_progress">in_progress</option>
                    <option value="completed">completed</option>
                    <option value="partial">partial (eligible for pro-rata refund)</option>
                    <option value="cancelled">cancelled (eligible for full refund)</option>
                    <option value="failed">failed</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Delivered Quantity</label>
                  <input
                    type="number"
                    min="0"
                    max={selectedOrder.quantity}
                    value={manualDelivered}
                    onChange={(e) => setManualDelivered(Number(e.target.value))}
                    className="jb-input w-full"
                  />
                </div>
              </div>

              {(manualStatus === 'cancelled' || manualStatus === 'partial') && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="refundToggle"
                    checked={refundUserOnCancel}
                    onChange={(e) => setRefundUserOnCancel(e.target.checked)}
                    className="rounded border-amber-500 text-[#df6f8e] focus:ring-0"
                  />
                  <label htmlFor="refundToggle" className="cursor-pointer">
                    Automatically credit refund ({manualStatus === 'cancelled' ? 'Full 100%' : 'Proportional unfulfilled balance'}) to user wallet.
                  </label>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={actionLoading === 'manual-update'}
                  className="jb-primary text-xs"
                >
                  {actionLoading === 'manual-update' ? 'Saving...' : 'Apply Status Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
