import React, { useState } from 'react';
import {
  User as UserIcon,
  Key,
  Shield,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Code,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [copiedKey, setCopiedKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [apiSnippetTab, setApiSnippetTab] = useState<'curl' | 'node' | 'python'>('curl');

  const handleCopyApiKey = () => {
    if (user?.api_key) {
      navigator.clipboard.writeText(user.api_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleRegenerateKey = async () => {
    if (!window.confirm('Are you sure you want to regenerate your API Key? Any existing bot or integrations using the old key will stop working.')) {
      return;
    }

    setRegenerating(true);
    try {
      await apiRequest('/api/auth/regenerate-api-key', { method: 'POST' });
      await refreshUser();
      alert('API key regenerated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate API key.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileMsg(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, phone }),
      });
      setProfileMsg({ type: 'success', text: res.message });
      await refreshUser();
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMsg({ type: 'success', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const userKey = user?.api_key || 'smm_live_sample_key';

  const snippets = {
    curl: `curl -X POST "${window.location.origin}/api/v1/smm" \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "${userKey}",
    "action": "add",
    "service": 1,
    "link": "https://instagram.com/your_page",
    "quantity": 1000
  }'`,
    node: `const axios = require('axios');

const response = await axios.post('${window.location.origin}/api/v1/smm', {
  key: '${userKey}',
  action: 'add',
  service: 1,
  link: 'https://instagram.com/your_page',
  quantity: 1000
});

console.log('Order ID:', response.data.order);`,
    python: `import requests

url = "${window.location.origin}/api/v1/smm"
payload = {
    "key": "${userKey}",
    "action": "add",
    "service": 1,
    "link": "https://instagram.com/your_page",
    "quantity": 1000
}

r = requests.post(url, json=payload)
print(r.json())`,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-emerald-400" />
          Account Profile & API Credentials
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage personal contact info, security credentials, and external reseller API keys
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Personal info & Password */}
        <div className="lg:col-span-6 space-y-6">
          {/* Profile Details Form */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-4">Personal Details</h2>

            {profileMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                  profileMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Email Address (Read-only)</label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Phone Number (WhatsApp notifications)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={updatingProfile}
                className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold tracking-wide transition-all disabled:opacity-50"
              >
                {updatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              Change Password
            </h2>

            {passwordMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                  passwordMsg.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={updatingPassword}
                className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold tracking-wide transition-all disabled:opacity-50"
              >
                {updatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Reseller API Key & Code Generator */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                Reseller API Key
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                REST v1 Ready
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Use your secret API key to programmatically place boost orders from your own website, Telegram bot, or CRM software.
            </p>

            <div className="space-y-3">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Your Secret API Key
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 truncate select-all">
                  {user?.api_key || 'Generate key below'}
                </div>
                <button
                  onClick={handleCopyApiKey}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title="Copy API key"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleRegenerateKey}
                  disabled={regenerating}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400"
                  title="Regenerate key"
                >
                  <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Quick Interactive Code Snippets */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-emerald-400" /> Code Example (Create Order)
                </span>
                <div className="flex gap-1 p-0.5 rounded-lg bg-slate-950 text-[10px]">
                  {(['curl', 'node', 'python'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setApiSnippetTab(tab)}
                      className={`px-2 py-0.5 rounded uppercase font-bold ${
                        apiSnippetTab === tab ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto">
                <pre>{snippets[apiSnippetTab]}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
