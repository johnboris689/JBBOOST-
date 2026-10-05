import React from 'react';
import { MessageSquare, Phone, RefreshCw, ShieldCheck, Sparkles, Copy, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

export const VirtualNumbersPage: React.FC = () => {
  const [numbers, setNumbers] = React.useState<any[]>([]);
  const [countries, setCountries] = React.useState<any[]>([]);
  const [country, setCountry] = React.useState('NG');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [catalogue, mine] = await Promise.all([api.getVirtualNumberCountries(), api.getVirtualNumbers()]);
      setCountries(catalogue);
      setNumbers(mine);
    } catch (e: any) {
      setNotice(e.message || 'Unable to load the number service.');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const buyDemo = async () => {
    setBusy(true); setNotice('');
    try {
      await api.allocateVirtualNumber({ country });
      await load();
      setNotice('Demo number allocated. This free version is simulation-only and does not receive real carrier SMS.');
    } catch (e: any) { setNotice(e.message || 'Unable to allocate demo number.'); }
    finally { setBusy(false); }
  };

  const simulate = async (id: string) => {
    try { await api.simulateVirtualSms(id); await load(); setNotice('Test SMS added to the inbox.'); }
    catch (e: any) { setNotice(e.message || 'Unable to create test SMS.'); }
  };

  const copyNumber = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(value); window.setTimeout(() => setCopied(null), 1500);
  };

  return <div className="space-y-5">
    <section className="jb-hero rounded-[24px] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div><div className="text-[10px] text-[#f0a2b8] font-black tracking-[.18em]">JB BOSTER • NUMBER LAB</div>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">Virtual Numbers</h1>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl">Try the number platform free in simulation mode while JB Boster prepares a legitimate telecom connection for real inventory.</p>
        </div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs"><div className="flex items-center gap-2 text-emerald-300 font-black"><ShieldCheck className="w-4 h-4"/> FREE DEMO MODE</div><div className="text-slate-400 mt-1">No real SMS is received.</div></div>
      </div>
    </section>

    {notice && <div className="jb-card p-4 text-xs text-slate-300">{notice}</div>}

    <section className="jb-card p-5 space-y-4">
      <div><h2 className="font-black">Get a demo number</h2><p className="text-xs text-slate-400 mt-1">Choose a country and allocate a test number at no charge.</p></div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <select value={country} onChange={e => setCountry(e.target.value)} className="w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none">
          {countries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.dialCode})</option>)}
        </select>
        <button onClick={buyDemo} disabled={busy} className="jb-primary justify-center">{busy ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} {busy ? 'Allocating…' : 'Get Free Demo Number'}</button>
      </div>
    </section>

    <section className="space-y-3">
      <div className="flex items-center justify-between"><div><h2 className="font-black">My Numbers</h2><p className="text-xs text-slate-500">Numbers shown here are test inventory until a real telecom provider is connected.</p></div><button onClick={load} className="p-2 rounded-xl border border-white/10"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/></button></div>
      {!loading && numbers.length === 0 && <div className="jb-card p-8 text-center text-sm text-slate-500">No demo numbers yet.</div>}
      {numbers.map(n => <div key={n.id} className="jb-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-widest text-[#df6f8e] font-black">{n.countryName}</div><div className="text-2xl font-black mt-1">{n.number}</div></div><button onClick={() => copyNumber(n.number)} className="p-2 rounded-xl border border-white/10">{copied === n.number ? <CheckCircle2 className="w-4 h-4 text-emerald-300"/> : <Copy className="w-4 h-4"/>}</button></div>
        <div className="flex flex-wrap gap-2"><span className="px-2.5 py-1 rounded-lg bg-white/[.04] text-[10px] text-slate-400">{n.type}</span><span className="px-2.5 py-1 rounded-lg bg-emerald-400/10 text-[10px] text-emerald-300">{n.status}</span></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 font-bold text-sm"><MessageSquare className="w-4 h-4 text-[#df6f8e]"/> SMS Inbox</div><button onClick={() => simulate(n.id)} className="text-[10px] font-black text-[#df6f8e]">Simulate test SMS</button></div>
          {n.messages?.length ? n.messages.map((m:any) => <div key={m.id} className="border-t border-white/10 pt-3 mt-3"><div className="text-xs font-bold">{m.sender}</div><div className="text-sm text-slate-300 mt-1">{m.body}</div><div className="text-[10px] text-slate-600 mt-1">{new Date(m.createdAt).toLocaleString()}</div></div>) : <div className="text-xs text-slate-600">No messages yet.</div>}
        </div>
      </div>)}
    </section>
  </div>;
};
