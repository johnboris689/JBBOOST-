import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  Server, Plus, RefreshCw, CheckCircle2, AlertTriangle, 
  Trash2, Edit3, ExternalLink, Activity, ArrowDownRight,
  DollarSign, Check, X, Search, ShieldCheck, ArrowRight
} from 'lucide-react';

export const AdminProvidersPage: React.FC = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Importer state
  const [selectedProviderForImport, setSelectedProviderForImport] = useState<any | null>(null);
  const [providerServices, setProviderServices] = useState<any[]>([]);
  const [localServices, setLocalServices] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [profitMargin, setProfitMargin] = useState(60); // 60% default profit margin
  const [usdToNgnRate, setUsdToNgnRate] = useState(1500); // 1 USD = 1500 NGN

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    status: 'active' as 'active' | 'inactive'
  });

  const loadProviders = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminProviders();
      setProviders(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch SMM providers');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalServices = async () => {
    try {
      const data = await api.getAdminSocialServices();
      setLocalServices(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadProviders();
    loadLocalServices();
  }, []);

  const handleTestConnection = async (id: string) => {
    setActionLoading(`test-${id}`);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.testAdminProvider(id);
      if (res.success) {
        setSuccessMsg(`Connection successful! Balance: ${res.currency || 'USD'} ${Number(res.balance || 0).toFixed(2)} (${res.latencyMs}ms)`);
        loadProviders();
      } else {
        setErrorMsg(`Test failed: ${res.error || 'Could not connect to provider.'}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to test provider connection.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenAdd = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      apiUrl: '',
      apiKey: '',
      status: 'active'
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingProvider(p);
    setFormData({
      name: p.name,
      apiUrl: p.apiUrl,
      apiKey: '', // Keep blank unless updating
      status: p.status || 'active'
    });
    setShowAddModal(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingProvider) {
        await api.updateAdminProvider(editingProvider.id, formData);
        setSuccessMsg(`Provider '${formData.name}' updated successfully.`);
      } else {
        await api.createAdminProvider(formData);
        setSuccessMsg(`Provider '${formData.name}' added and connected.`);
      }
      setShowAddModal(false);
      loadProviders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save provider.');
    }
  };

  const handleDeleteProvider = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete '${name}'? This cannot be undone.`)) return;
    try {
      await api.deleteAdminProvider(id);
      setSuccessMsg(`Provider '${name}' deleted.`);
      loadProviders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete provider.');
    }
  };

  // Service Importer
  const handleOpenImporter = async (provider: any) => {
    setSelectedProviderForImport(provider);
    setImportLoading(true);
    setErrorMsg('');
    try {
      const svcs = await api.getAdminProviderServices(provider.id);
      setProviderServices(svcs);
    } catch (err: any) {
      setErrorMsg(`Could not fetch service catalog: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportService = async (item: any, targetLocalId?: string) => {
    if (!selectedProviderForImport) return;
    setActionLoading(`import-${item.service}`);
    setErrorMsg('');

    try {
      // Calculate local NGN price and coin price
      // Rate is USD cost per 1000.
      // e.g. Rate = $0.50 per 1k -> in NGN = 0.50 * usdToNgnRate = 750 NGN
      // Apply margin: 750 * (1 + profitMargin/100) = 1,200 NGN
      // In coins: 1 NGN = 2 coins -> 2,400 coins per 1k
      const costPer1kUsd = Number(item.rate || 0);
      const costPer1kNgn = costPer1kUsd * usdToNgnRate;
      const retailNgn = Math.round(costPer1kNgn * (1 + profitMargin / 100));

      await api.importAdminProviderService(selectedProviderForImport.id, {
        serviceId: String(item.service),
        name: item.name,
        platform: inferPlatform(item.category || item.name),
        description: `${item.name} (${item.type || 'Standard'})`,
        ratePer1000: retailNgn,
        minQuantity: Number(item.min || 10),
        maxQuantity: Number(item.max || 10000),
        providerRate: costPer1kUsd,
        profitMargin,
        targetLocalServiceId: targetLocalId
      });

      setSuccessMsg(`Service '${item.name}' imported/mapped successfully!`);
      loadLocalServices();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to import service.');
    } finally {
      setActionLoading(null);
    }
  };

  const inferPlatform = (text: string): string => {
    const t = text.toLowerCase();
    if (t.includes('instagram') || t.includes('ig ')) return 'Instagram';
    if (t.includes('tiktok') || t.includes('tt ')) return 'TikTok';
    if (t.includes('youtube') || t.includes('yt ')) return 'YouTube';
    if (t.includes('facebook') || t.includes('fb ')) return 'Facebook';
    if (t.includes('telegram') || t.includes('tg ')) return 'Telegram';
    if (t.includes('twitter') || t.includes('x ') || t.includes(' x')) return 'X';
    return 'Instagram';
  };

  const handleOpenLogs = async (providerId?: string) => {
    setShowLogsModal(true);
    setLogsLoading(true);
    try {
      const data = await api.getAdminProviderLogs({ providerId, limit: 150 });
      setLogs(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Filter importer categories
  const categories = Array.from(new Set(providerServices.map((s) => s.category).filter(Boolean)));
  const filteredServices = providerServices.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(s.service).includes(searchTerm);
    const matchCat = categoryFilter === 'all' || s.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Server className="w-6 h-6 text-[#df6f8e]" />
            External SMM Providers
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect standard SMM Panel API v2 providers (JustAnotherPanel, SMMFollows, BulkFollows, Peakerr) for automated order fulfillment and live status syncing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenLogs()}
            className="px-3 py-2 rounded-xl bg-white/[.04] border border-white/10 hover:border-[#df6f8e]/50 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition"
          >
            <Activity className="w-3.5 h-3.5 text-[#df6f8e]" /> API Logs
          </button>
          <button
            onClick={handleOpenAdd}
            className="jb-primary text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Provider
          </button>
        </div>
      </div>

      {/* Status Notifications */}
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

      {/* Providers Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500">Loading providers...</div>
      ) : providers.length === 0 ? (
        <div className="jb-card p-10 text-center space-y-3">
          <Server className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="font-bold text-white">No external providers connected yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Add your external SMM panel (API URL & API key). Orders will automatically be forwarded to the provider upon placement.
          </p>
          <button onClick={handleOpenAdd} className="jb-primary text-xs mx-auto">
            <Plus className="w-4 h-4" /> Add First Provider
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => {
            const isTesting = actionLoading === `test-${p.id}`;
            const mappedCount = localServices.filter((s) => s.providerId === p.id).length;

            return (
              <div key={p.id} className="jb-card p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-white text-base">{p.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            p.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 font-mono truncate max-w-[220px]" title={p.apiUrl}>
                        {p.apiUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition"
                        title="Edit provider"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(p.id, p.name)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition"
                        title="Delete provider"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Provider stats */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="p-3 rounded-xl bg-white/[.02] border border-white/5">
                      <span className="text-[10px] text-slate-500 block">Balance</span>
                      <span className="font-black text-sm text-white flex items-center gap-1 mt-0.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        {Number(p.balance || 0).toFixed(2)} {p.currency || 'USD'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[.02] border border-white/5">
                      <span className="text-[10px] text-slate-500 block">Mapped Services</span>
                      <span className="font-black text-sm text-[#df6f8e] mt-0.5 block">
                        {mappedCount} active
                      </span>
                    </div>
                  </div>

                  {/* Key preview */}
                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5 font-mono">
                    <span>Key: {p.apiKey}</span>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleTestConnection(p.id)}
                    disabled={isTesting}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/[.03] border border-white/10 hover:border-emerald-500/40 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
                    {isTesting ? 'Testing...' : 'Test Balance'}
                  </button>
                  <button
                    onClick={() => handleOpenImporter(p)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#7d1738]/40 border border-[#c2476e]/30 hover:border-[#c2476e] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Services
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-md bg-[#12070b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">
                {editingProvider ? 'Edit SMM Provider' : 'Add SMM Provider'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Provider Name</label>
                <input
                  required
                  placeholder="e.g. JustAnotherPanel, SMMFollows"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="jb-input w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">API URL (Endpoint)</label>
                <input
                  required
                  type="url"
                  placeholder="https://justanotherpanel.com/api/v2"
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                  className="jb-input w-full font-mono text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Must support Standard SMM Panel API v2 specification (POST with action=add, status, etc.).
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  API Key {editingProvider && <span className="text-slate-500 font-normal">(Leave blank to keep unchanged)</span>}
                </label>
                <input
                  required={!editingProvider}
                  type="password"
                  placeholder="Paste provider secret API token"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="jb-input w-full font-mono text-xs"
                />
                <span className="text-[10px] text-emerald-400/80 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Encrypted with AES-256 server-side before storage.
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="jb-input w-full"
                >
                  <option value="active">Active (Eligible for automated order dispatch)</option>
                  <option value="inactive">Inactive (Paused)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/[.04] text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button type="submit" className="jb-primary text-xs">
                  {editingProvider ? 'Update Provider' : 'Connect Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Services Importer Modal */}
      {selectedProviderForImport && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-2 sm:p-4">
          <div className="w-full max-w-5xl h-[92vh] flex flex-col bg-[#12070b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Importer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#16080e]">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-[#df6f8e]" />
                  Import Services from {selectedProviderForImport.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Browse live services from provider, set your markup margin, and map to local JB Boster catalogue with 1 click.
                </p>
              </div>
              <button
                onClick={() => setSelectedProviderForImport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Importer Toolbar */}
            <div className="p-4 border-b border-white/5 bg-white/[.01] grid sm:grid-cols-4 gap-3 text-xs">
              <div className="relative sm:col-span-2">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  placeholder="Search by name or Service ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="jb-input w-full pl-9"
                />
              </div>

              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="jb-input w-full"
                >
                  <option value="all">All Categories ({providerServices.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-xl border border-white/5">
                <span className="text-[10px] text-slate-400 shrink-0">Markup:</span>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={profitMargin}
                  onChange={(e) => setProfitMargin(Number(e.target.value))}
                  className="w-14 bg-transparent font-bold text-white text-right outline-none"
                />
                <span className="text-[10px] text-[#df6f8e] font-bold">%</span>
              </div>
            </div>

            {/* Services List Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {importLoading ? (
                <div className="py-20 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#df6f8e]" />
                  <span>Loading services catalog from {selectedProviderForImport.name}...</span>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-500">
                  No services matching criteria.
                </div>
              ) : (
                filteredServices.map((item) => {
                  const costUsd = Number(item.rate || 0);
                  const costNgn = costUsd * usdToNgnRate;
                  const retailNgn = Math.round(costNgn * (1 + profitMargin / 100));
                  const retailCoins = retailNgn * 2;
                  const isImporting = actionLoading === `import-${item.service}`;

                  // Check if already mapped locally
                  const existingLocal = localServices.find(
                    (s) => s.providerId === selectedProviderForImport.id && String(s.providerServiceId) === String(item.service)
                  );

                  return (
                    <div
                      key={item.service}
                      className={`p-3.5 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        existingLocal
                          ? 'bg-emerald-500/[.03] border-emerald-500/20'
                          : 'bg-white/[.02] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-black bg-white/5 text-slate-400">
                            ID #{item.service}
                          </span>
                          <span className="text-[10px] font-bold text-[#df6f8e] uppercase tracking-wider">
                            {item.category || 'General'}
                          </span>
                          {existingLocal && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Already Mapped
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-sm text-white mt-1 truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Cost: ${costUsd.toFixed(3)} / 1k</span>
                          <span>Min: {Number(item.min).toLocaleString()}</span>
                          <span>Max: {Number(item.max).toLocaleString()}</span>
                          {item.refill && <span className="text-emerald-400">Refill available</span>}
                        </div>
                      </div>

                      {/* Pricing & Import Button */}
                      <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-white/5">
                        <div className="text-right">
                          <div className="text-xs font-black text-white">
                            {retailCoins.toLocaleString()} coins <span className="text-[10px] text-slate-500 font-normal">/ 1k</span>
                          </div>
                          <div className="text-[9px] text-slate-500">
                            Retail: ₦{retailNgn.toLocaleString()} (+{profitMargin}%)
                          </div>
                        </div>

                        <button
                          onClick={() => handleImportService(item)}
                          disabled={isImporting}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                            existingLocal
                              ? 'bg-white/[.05] text-slate-300 hover:bg-white/10'
                              : 'jb-primary'
                          }`}
                        >
                          {isImporting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {existingLocal ? 'Re-sync' : 'Import'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-2 sm:p-4">
          <div className="w-full max-w-4xl h-[90vh] flex flex-col bg-[#12070b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#16080e]">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#df6f8e]" />
                  External Provider API Audit Logs
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Detailed timeline of order dispatch requests, status checks, and errors.
                </p>
              </div>
              <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {logsLoading ? (
                <div className="py-20 text-center text-xs text-slate-500">Loading audit logs...</div>
              ) : logs.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-500">No logs recorded yet.</div>
              ) : (
                logs.map((log) => {
                  const isErr = Boolean(log.error) || (log.httpStatus && log.httpStatus >= 400);

                  return (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border text-xs ${
                        isErr
                          ? 'bg-red-500/[.03] border-red-500/20'
                          : 'bg-white/[.02] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono ${
                              log.action === 'add'
                                ? 'bg-purple-500/20 text-purple-300'
                                : log.action === 'status'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-slate-500/20 text-slate-300'
                            }`}
                          >
                            {log.action}
                          </span>
                          <span className="font-bold text-white">{log.providerName || 'Provider'}</span>
                          {log.orderId && (
                            <span className="text-[10px] text-slate-500 font-mono">Order: {log.orderId}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span>{log.durationMs}ms</span>
                          <span>•</span>
                          <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {log.error && (
                        <div className="mt-2 text-red-300 font-mono text-[11px] bg-red-950/30 p-2 rounded border border-red-500/20">
                          {log.error}
                        </div>
                      )}

                      {log.responsePayload && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-white">
                            View Payload Response
                          </summary>
                          <pre className="mt-1 p-2 rounded bg-black/40 border border-white/5 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-32">
                            {log.responsePayload}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
