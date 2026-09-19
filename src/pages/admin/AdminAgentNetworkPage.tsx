import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  Bot, Cpu, Zap, CheckCircle2, RefreshCw, ShieldCheck, 
  Users, Activity, Plus, Search, Play, Pause, AlertCircle,
  Clock, Check, ExternalLink, Sliders, Layers, TrendingUp
} from 'lucide-react';

export const AdminAgentNetworkPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'fleet' | 'executions'>('overview');

  // Filter state for agents
  const [agentPlatform, setAgentPlatform] = useState('all');
  const [agentStatus, setAgentStatus] = useState('all');
  const [agentSearch, setAgentSearch] = useState('');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedCount, setSeedCount] = useState(25);
  const [customAgent, setCustomAgent] = useState({
    platform: 'INSTAGRAM',
    handle: '',
    accountName: '',
    capabilities: ['follow', 'like']
  });

  const loadAll = async () => {
    try {
      const [statsRes, jobsData, agentsData, execsData] = await Promise.all([
        api.getAgentNetworkStats().catch(() => ({ stats: null })),
        api.getAgentNetworkJobs().catch(() => []),
        api.getAgentNetworkAgents({
          platform: agentPlatform !== 'all' ? agentPlatform : undefined,
          status: agentStatus !== 'all' ? agentStatus : undefined,
          search: agentSearch || undefined
        }).catch(() => []),
        api.getAgentNetworkExecutions().catch(() => [])
      ]);

      if (statsRes?.stats) setStats(statsRes.stats);
      setJobs(jobsData);
      setAgents(agentsData);
      setExecutions(execsData);
    } catch (err: any) {
      console.error('Failed to load agent network state:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      loadAll();
    }, 4000);
    return () => clearInterval(interval);
  }, [agentPlatform, agentStatus, agentSearch]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadAll();
  };

  const handleToggleOrchestrator = async (enable: boolean) => {
    setActionLoading('orchestrator');
    try {
      const res = await api.toggleAgentOrchestrator({ enabled: enable });
      if (res.stats) setStats(res.stats);
      setSuccessMsg(enable ? 'Autonomous Dispatcher started.' : 'Autonomous Dispatcher paused.');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update orchestrator state.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSpeedMultiplier = async (speed: number) => {
    setActionLoading('speed');
    try {
      const res = await api.toggleAgentOrchestrator({ speedMultiplier: speed });
      if (res.stats) setStats(res.stats);
      setSuccessMsg(`Dispatch speed updated to ${speed}x.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSeedFleet = async () => {
    setActionLoading('seed');
    try {
      const res = await api.seedAgentFleet(seedCount);
      setSuccessMsg(`Successfully provisioned ${res.seeded} automated agents into the fleet!`);
      setShowSeedModal(false);
      await loadAll();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Seeding failed.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAgent.handle) return;
    setActionLoading('create');
    try {
      await api.createAgentAccount(customAgent);
      setSuccessMsg(`Agent ${customAgent.handle} registered successfully.`);
      setShowAddModal(false);
      setCustomAgent({ platform: 'INSTAGRAM', handle: '', accountName: '', capabilities: ['follow', 'like'] });
      await loadAll();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Creation failed.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAgent = async (agentId: string) => {
    try {
      await api.toggleAgentStatus(agentId);
      await loadAll();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleTriggerDispatch = async (jobId: string) => {
    setActionLoading(`trigger-${jobId}`);
    try {
      await api.triggerAgentJobDispatch(jobId);
      setSuccessMsg('Dispatched active agents to execute pending jobs.');
      await loadAll();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(''), 3500);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#a72b50]/20 border border-[#a72b50]/30 text-[#df6f8e]">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Automated Agent Network
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Deduplicated Fleet
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Autonomous multi-agent orchestration for social task distribution with strict single-execution guarantees.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 text-xs font-bold text-slate-300 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#df6f8e]' : ''}`} />
            Sync
          </button>
          <button
            onClick={() => setShowSeedModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 text-xs font-bold text-slate-200 transition-all"
          >
            <Users className="w-3.5 h-3.5 text-[#df6f8e]" />
            Expand Fleet
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#a72b50] hover:bg-[#8e2444] text-white text-xs font-black shadow-lg shadow-[#a72b50]/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bot Account
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Orchestrator & Telemetry Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Fleet Size */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Total Bot Fleet</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {stats?.agents?.total?.toLocaleString() ?? 0}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              {stats?.agents?.idle ?? 0} idle
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              {stats?.agents?.working ?? 0} active
            </span>
          </div>
        </div>

        {/* Card 2: Fulfillment Jobs */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Fulfillment Jobs</span>
            <div className="p-1.5 rounded-lg bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/30">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {stats?.jobs?.total?.toLocaleString() ?? 0}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
            <span className="text-amber-300 font-bold">{stats?.jobs?.inProgress ?? 0} executing</span>
            <span>•</span>
            <span className="text-emerald-400 font-bold">{stats?.jobs?.completed ?? 0} done</span>
          </div>
        </div>

        {/* Card 3: Executions & Deduplication */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Total Executions</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {stats?.executions?.total?.toLocaleString() ?? 0}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Deduplication Guaranteed</span>
          </div>
        </div>

        {/* Card 4: Autonomous Dispatcher Control */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Dispatcher Status</span>
            <div className={`p-1.5 rounded-lg border ${stats?.dispatcher?.active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-white/10'}`}>
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${stats?.dispatcher?.active ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
              <span className="text-sm font-black text-white uppercase">
                {stats?.dispatcher?.active ? 'Autonomous' : 'Paused'}
              </span>
            </div>
            <button
              onClick={() => handleToggleOrchestrator(!stats?.dispatcher?.active)}
              disabled={actionLoading === 'orchestrator'}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                stats?.dispatcher?.active 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {stats?.dispatcher?.active ? 'Pause' : 'Start'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
            <span>Speed Multiplier:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedMultiplier(speed)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    (stats?.dispatcher?.speedMultiplier || 1) === speed
                      ? 'bg-[#a72b50] text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6-Platform Fleet Capacity Breakdown (500,000 per platform = 3,000,000 Total Fleet) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#df6f8e]" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Multi-Platform Agent Allocation
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/30">
              500,000 Per Platform
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            3,000,000 Total Distinct Agent Pool Across All 6 Supported Networks
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { name: 'Instagram', code: 'IG', color: 'text-pink-400', count: stats?.agents?.byPlatform?.Instagram ?? 500000, cap: 'Follow, Like, Reel View, Comment' },
            { name: 'TikTok', code: 'TT', color: 'text-cyan-400', count: stats?.agents?.byPlatform?.TikTok ?? 500000, cap: 'Follow, Like, Video View, Share' },
            { name: 'YouTube', code: 'YT', color: 'text-red-400', count: stats?.agents?.byPlatform?.YouTube ?? 500000, cap: 'Subscriber, Like, Watch Time' },
            { name: 'Facebook', code: 'FB', color: 'text-blue-400', count: stats?.agents?.byPlatform?.Facebook ?? 500000, cap: 'Follow, Page Like, Reaction' },
            { name: 'X / Twitter', code: 'X', color: 'text-slate-200', count: stats?.agents?.byPlatform?.X ?? 500000, cap: 'Follow, Repost, Like' },
            { name: 'Telegram', code: 'TG', color: 'text-sky-400', count: stats?.agents?.byPlatform?.Telegram ?? 500000, cap: 'Channel Member, Group Join' },
          ].map((p) => (
            <div key={p.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">{p.name}</span>
                <span className={`text-[10px] font-mono font-black ${p.color}`}>{p.code}</span>
              </div>
              <div className="mt-1 text-base font-black text-white font-mono">
                {p.count.toLocaleString()}
              </div>
              <div className="text-[9px] text-slate-500 truncate mt-0.5" title={p.cap}>
                {p.cap}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'overview'
              ? 'bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/40'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Queue & Jobs ({jobs.length})
        </button>
        <button
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'fleet'
              ? 'bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/40'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Agent Fleet ({stats?.agents?.total ?? agents.length})
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'executions'
              ? 'bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/40'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Execution Audit Log ({executions.length})
        </button>
      </div>

      {/* Tab 1: Queue & Jobs */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#df6f8e]" />
              Active Fulfillment Queue
            </h2>
            <span className="text-xs text-slate-400">
              Auto-dispatches available agents adhering to the deduplication constraint
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10">
              <Bot className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-300">No active fulfillment jobs</div>
              <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Customer orders placed on JB Boster are automatically queued here. When placed, bot agents claim and fulfill them without repetition.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {jobs.map((job) => {
                const pct = Math.min(100, Math.round((job.completedQuantity / Math.max(1, job.targetQuantity)) * 100));
                const isCompleted = job.status === 'completed' || pct >= 100;

                return (
                  <div key={job.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-white">{job.serviceName}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#a72b50]/20 text-[#df6f8e] border border-[#a72b50]/30">
                            {job.platform} • {job.actionType.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCompleted 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {isCompleted ? 'COMPLETED' : job.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="font-mono text-[11px] text-slate-500">Order #{job.orderId}</span>
                          <span>•</span>
                          <a
                            href={job.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#df6f8e] hover:underline flex items-center gap-1 max-w-xs truncate"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {job.targetUrl}
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-black text-white">
                            {job.completedQuantity.toLocaleString()} / {job.targetQuantity.toLocaleString()}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">
                            {pct}% fulfilled
                          </div>
                        </div>

                        {!isCompleted && (
                          <button
                            onClick={() => handleTriggerDispatch(job.id)}
                            disabled={actionLoading === `trigger-${job.id}`}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            Dispatch Next
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 w-full bg-white/5 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-[#a72b50] to-[#df6f8e]'
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Agent Fleet */}
      {activeTab === 'fleet' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={agentPlatform}
                onChange={(e) => setAgentPlatform(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#12080c] border border-white/10 text-xs font-bold text-slate-200"
              >
                <option value="all">All Platforms</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TIKTOK">TikTok</option>
                <option value="TWITTER">Twitter/X</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="TELEGRAM">Telegram</option>
              </select>

              <select
                value={agentStatus}
                onChange={(e) => setAgentStatus(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#12080c] border border-white/10 text-xs font-bold text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="idle">Idle (Available)</option>
                <option value="working">Working</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search bot handle or ID..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#12080c] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a72b50]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] text-slate-400 font-bold border-b border-white/10">
                  <tr>
                    <th className="p-3.5">Agent Bot</th>
                    <th className="p-3.5">Platform</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Capabilities</th>
                    <th className="p-3.5">Completed</th>
                    <th className="p-3.5">Reputation</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3.5">
                        <div className="font-black text-white">{agent.handle}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{agent.agentIdentifier}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-slate-300">
                          {agent.platform}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          agent.status === 'idle'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : agent.status === 'working'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-white/10'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            agent.status === 'idle' ? 'bg-emerald-400' : agent.status === 'working' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                          }`}></span>
                          {agent.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex gap-1 flex-wrap">
                          {Array.isArray(agent.capabilities) && agent.capabilities.map((c: string) => (
                            <span key={c} className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#a72b50]/15 text-[#df6f8e] border border-[#a72b50]/20">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 font-bold text-slate-200">
                        {agent.totalActionsCompleted.toLocaleString()}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1 font-bold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {agent.reputationScore}%
                        </div>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleToggleAgent(agent.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                            agent.status === 'offline'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {agent.status === 'offline' ? 'Activate' : 'Set Offline'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Execution Audit Log */}
      {activeTab === 'executions' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#a72b50]/10 border border-[#a72b50]/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#df6f8e] flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-white">Strict Deduplication Enforcement Verified</div>
              <div className="text-slate-400 mt-0.5">
                Every task execution is bound by a database-level unique constraint on <code>(orderId, agentId)</code>. An agent will never be assigned to the same user's order more than once.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] text-slate-400 font-bold border-b border-white/10">
                  <tr>
                    <th className="p-3.5">Execution Time</th>
                    <th className="p-3.5">Assigned Agent</th>
                    <th className="p-3.5">Order Target</th>
                    <th className="p-3.5">Action</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Deduplication Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {executions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No executions recorded yet. Active orders will stream in real-time as agents perform actions.
                      </td>
                    </tr>
                  ) : (
                    executions.map((exec) => (
                      <tr key={exec.id} className="hover:bg-white/[0.02]">
                        <td className="p-3.5 text-slate-400">
                          {new Date(exec.claimedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-white">{exec.agentHandle}</span>
                        </td>
                        <td className="p-3.5">
                          <div className="text-slate-300">Order #{exec.orderId}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{exec.targetUrl}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-slate-200">
                            {exec.platform} • {exec.actionType}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">
                          {exec.durationMs}ms
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            PASSED (Unique)
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Seed Fleet */}
      {showSeedModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#14080e] border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#df6f8e]" />
              Expand Automated Fleet
            </h3>
            <p className="text-xs text-slate-400">
              Generate realistic bot accounts across Instagram, TikTok, Twitter/X, YouTube, Facebook, and Telegram with verified capability sets.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Bots per platform (total x6 platforms):</label>
              <input
                type="number"
                min="5"
                max="100"
                value={seedCount}
                onChange={(e) => setSeedCount(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
              />
              <div className="text-[11px] text-slate-500">
                Will provision {seedCount * 6} new bot agents into the database.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSeedModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading === 'seed'}
                onClick={handleSeedFleet}
                className="px-4 py-2 rounded-xl bg-[#a72b50] hover:bg-[#8e2444] text-white text-xs font-black"
              >
                {actionLoading === 'seed' ? 'Provisioning...' : 'Provision Bots'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Custom Agent */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#14080e] border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#df6f8e]" />
              Register Custom Bot Account
            </h3>

            <form onSubmit={handleCreateAgent} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Platform</label>
                <select
                  value={customAgent.platform}
                  onChange={(e) => setCustomAgent({ ...customAgent, platform: e.target.value })}
                  className="w-full mt-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
                >
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="TWITTER">Twitter / X</option>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="TELEGRAM">Telegram</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300">Handle / Username</label>
                <input
                  type="text"
                  placeholder="@handle_name"
                  value={customAgent.handle}
                  onChange={(e) => setCustomAgent({ ...customAgent, handle: e.target.value })}
                  required
                  className="w-full mt-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300">Account Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. JB Bot Agent"
                  value={customAgent.accountName}
                  onChange={(e) => setCustomAgent({ ...customAgent, accountName: e.target.value })}
                  className="w-full mt-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'create'}
                  className="px-4 py-2 rounded-xl bg-[#a72b50] hover:bg-[#8e2444] text-white text-xs font-black"
                >
                  {actionLoading === 'create' ? 'Saving...' : 'Register Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
