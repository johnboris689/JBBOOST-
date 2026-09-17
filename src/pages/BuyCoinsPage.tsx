import React from 'react';
import { Coins, ShieldCheck, ArrowRight, CreditCard, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { coinsToNaira, MIN_COIN_PURCHASE, nairaToCoins } from '../lib/coins';

export const BuyCoinsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [coins, setCoins] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [ref, setRef] = React.useState('');
  const [check, setCheck] = React.useState(false);
  const presets = [400, 1000, 2000, 5000, 10000, 20000];
  const requestedCoins = Number(coins || 0);
  const nairaAmount = coinsToNaira(requestedCoins);

  const buy = async () => {
    if (!Number.isFinite(requestedCoins) || requestedCoins < MIN_COIN_PURCHASE) {
      setMsg(`Minimum purchase is ${MIN_COIN_PURCHASE.toLocaleString()} coins (₦${coinsToNaira(MIN_COIN_PURCHASE).toLocaleString()}).`); return;
    }
    setLoading(true); setMsg('');
    try {
      const r = await api.initializeKoraPayDeposit(nairaAmount);
      setRef(r.deposit.reference);
      window.location.href = r.deposit.checkoutUrl;
    } catch (e: any) { setMsg(e.message || 'Could not start KoraPay checkout.'); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    if (!ref) return;
    setCheck(true);
    try {
      const r = await api.checkKoraPayDepositStatus(ref);
      setMsg(r.status === 'successful' ? 'Payment confirmed. Your coins have been credited.' : `Payment status: ${r.status}`);
      if (r.status === 'successful') await refreshUser();
    } catch (e: any) { setMsg(e.message || 'Unable to check payment status.'); }
    finally { setCheck(false); }
  };

  return <div className="max-w-xl mx-auto space-y-4">
    <div><h1 className="text-2xl font-black flex items-center gap-2"><Coins className="w-6 h-6 text-[#df6f8e]"/> Buy Coins</h1><p className="text-xs text-slate-400 mt-1">Use coins to order social-media growth services on JB Boster.</p></div>
    <div className="jb-card p-5 relative overflow-hidden"><div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-[#a72b50]/10 blur-3xl"/><div className="text-xs text-slate-400">Available coins</div><div className="text-3xl font-black mt-1 flex items-center gap-2"><Coins className="w-7 h-7 text-[#df6f8e]"/>{nairaToCoins(Number(user?.walletBalance || 0)).toLocaleString()}</div><p className="text-[11px] text-slate-500 mt-2">1 coin = ₦1.50 (100 coins = ₦150)</p></div>
    <div className="jb-card p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Choose coin amount</h2><p className="text-xs text-slate-400 mt-1">KoraPay will charge the Naira equivalent.</p></div><CreditCard className="w-5 h-5 text-[#df6f8e]"/></div>
      <label className="block text-xs font-bold mt-5">Coins<input className="jb-input mt-2 text-lg font-black" type="number" min={MIN_COIN_PURCHASE} step="1" value={coins} onChange={e=>setCoins(e.target.value)} placeholder="Enter coins"/></label>
      <div className="grid grid-cols-3 gap-2 mt-3">{presets.map(a=><button type="button" key={a} onClick={()=>setCoins(String(a))} className="rounded-xl border border-white/10 bg-white/[.03] py-2.5 text-xs font-black hover:border-[#a72b50]/60">{a.toLocaleString()} coins</button>)}</div>
      <div className="mt-4 p-4 rounded-2xl bg-[#7d1738]/10 border border-[#a72b50]/20"><div className="flex justify-between text-xs"><span className="text-slate-400">You receive</span><b>{requestedCoins > 0 ? requestedCoins.toLocaleString() : '0'} coins</b></div><div className="flex justify-between text-xs mt-2"><span className="text-slate-400">KoraPay payment</span><b>₦{Number.isFinite(nairaAmount) ? nairaAmount.toLocaleString() : '0'}</b></div></div>
      <button disabled={loading} onClick={buy} className="jb-primary w-full justify-center mt-4">{loading?'Opening KoraPay…':'Continue to KoraPay'}<ArrowRight className="w-4 h-4"/></button>
      <div className="flex items-start gap-2 text-[10px] text-slate-500 mt-3"><ShieldCheck className="w-4 h-4 text-[#df6f8e] shrink-0"/><span>Coins are added only after server-side KoraPay verification or a valid webhook confirmation.</span></div>
      {ref && <button onClick={verify} disabled={check} className="w-full mt-3 rounded-xl border border-white/10 py-2.5 text-xs font-black">{check?'Checking…':'Check payment status'}</button>}
      {msg && <div className="mt-3 p-3 rounded-xl bg-white/[.03] border border-white/10 text-xs text-slate-300 flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#df6f8e] shrink-0"/><span>{msg}</span></div>}
    </div>
  </div>;
};
