import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Link as LinkIcon, ShoppingBag, Coins, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { nairaToCoins, coinsToNaira } from '../lib/coins';
import { PlatformIcon } from '../components/PlatformIcon';

const PLATFORMS = ['Facebook','Instagram','TikTok','YouTube','X','Telegram'];

export const SocialServicesPage: React.FC = () => {
  const [params] = useSearchParams();
  const requestedPlatform = params.get('platform') || '';
  const [services,setServices]=React.useState<any[]>([]);
  const [platform,setPlatform]=React.useState(requestedPlatform || 'All');
  const [selected,setSelected]=React.useState<any>(null);
  const [qty,setQty]=React.useState('');
  const [target,setTarget]=React.useState('');
  const [msg,setMsg]=React.useState('');
  const [loading,setLoading]=React.useState(true);
  const {refreshUser}=useAuth();

  React.useEffect(()=>{setPlatform(requestedPlatform || 'All');},[requestedPlatform]);
  React.useEffect(()=>{
    setLoading(true); setMsg('');
    api.getSocialServices(platform==='All'?undefined:platform).then(rows=>{
      setServices(rows);
      const serviceId=params.get('service');
      if(serviceId){const found=rows.find((x:any)=>String(x.id)===serviceId); if(found)setSelected(found);}
    }).catch(e=>setMsg(e.message||'Unable to load services.')).finally(()=>setLoading(false));
  },[platform, params]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!selected)return;
    try{
      await api.createSocialOrder({serviceId:selected.id,quantity:Number(qty),targetUrl:target.trim()});
      setMsg('Order created successfully.'); setSelected(null); setQty(''); setTarget(''); await refreshUser();
    }catch(e:any){setMsg(e.message||'Unable to create order.')}
  };
  const costNaira = selected && qty ? (Number(qty)/1000)*Number(selected.ratePer1000) : 0;
  const costCoins = nairaToCoins(costNaira);

  return <div className="space-y-5">
    <div><div className="flex items-center gap-2"><div className="w-10 h-10 rounded-xl bg-[#7d1738]/20 border border-[#a72b50]/30 grid place-items-center text-[#df6f8e]"><ShoppingBag className="w-5 h-5"/></div><div><h1 className="text-2xl font-black">{platform==='All'?'Social Services':`${platform} Services`}</h1><p className="text-xs text-slate-400 mt-1">{platform==='All'?'Choose a platform to view the services available for it.':`Choose a ${platform} service and set your quantity.`}</p></div></div></div>
    {platform==='All' && <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">{PLATFORMS.map(p=><button key={p} onClick={()=>setPlatform(p)} className="jb-card p-3 flex flex-col items-center justify-center gap-2 text-center hover:border-[#a72b50]/60"><PlatformIcon platform={p} className="w-7 h-7 text-[#df6f8e]"/><span className="text-xs font-black">{p}</span></button>)}</div>}
    {platform!=='All' && <button onClick={()=>setPlatform('All')} className="text-xs font-black text-[#df6f8e] hover:underline">← All platforms</button>}
    {msg && !selected && <div className="p-3 rounded-xl border border-[#a72b50]/30 bg-[#7d1738]/10 text-[#f09ab1] text-xs font-bold">{msg}</div>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {loading ? <div className="text-xs text-slate-500">Loading services…</div> : services.length===0 ? <div className="jb-card p-6 text-sm text-slate-400">No services are currently available for {platform}. Check the admin service catalogue.</div> : services.map(s=>{
        const coinRate=nairaToCoins(Number(s.ratePer1000));
        return <button key={s.id} onClick={()=>{setSelected(s);setMsg('')}} className="jb-card p-4 text-left hover:border-[#a72b50]/60 transition group">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[#7d1738]/20 border border-[#a72b50]/20 grid place-items-center text-[#df6f8e]"><PlatformIcon platform={s.platform} className="w-6 h-6"/></div><div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-wider text-[#df6f8e] font-black">{s.platform}</div><h3 className="font-black text-sm truncate mt-0.5">{s.name}</h3></div><ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#df6f8e]"/></div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">{s.description}</p>
          <div className="flex justify-between gap-2 mt-4 text-[10px] font-bold"><span className="text-slate-500">Min {s.minQuantity.toLocaleString()}</span><span className="text-[#df6f8e]">{coinRate.toLocaleString()} coins / 1k</span></div>
        </button>
      })}
    </div>

    {selected&&<div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4">
      <form onSubmit={submit} className="w-full sm:max-w-lg bg-[#12070b] border border-white/10 rounded-t-[28px] sm:rounded-[28px] p-5 shadow-2xl">
        <div className="flex justify-between items-start"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-[#7d1738]/20 grid place-items-center text-[#df6f8e]"><PlatformIcon platform={selected.platform} className="w-7 h-7"/></div><div><div className="text-[10px] uppercase text-[#df6f8e] font-black">{selected.platform}</div><h2 className="text-xl font-black mt-1">{selected.name}</h2></div></div><button type="button" onClick={()=>setSelected(null)} className="text-slate-500 text-xl">×</button></div>
        <div className="mt-5 space-y-3">
          <label className="block text-xs font-bold">Quantity<input required type="number" min={selected.minQuantity} max={selected.maxQuantity} value={qty} onChange={e=>setQty(e.target.value)} className="jb-input mt-1 text-base font-black" placeholder={`${selected.minQuantity} - ${selected.maxQuantity}`}/></label>
          <label className="block text-xs font-bold">Target profile / post URL<div className="relative"><LinkIcon className="absolute left-3 top-3.5 w-4 h-4 text-slate-500"/><input required value={target} onChange={e=>setTarget(e.target.value)} className="jb-input pl-10 mt-1" placeholder="https://... or @username"/></div></label>
          <div className="p-4 rounded-2xl bg-[#7d1738]/10 border border-[#a72b50]/20"><div className="flex justify-between text-xs"><span className="text-slate-400">Your cost</span><b className="text-white flex items-center gap-1"><Coins className="w-4 h-4 text-[#df6f8e]"/>{costCoins.toLocaleString()} coins</b></div><div className="text-[10px] text-slate-500 mt-2">Equivalent payment value: ₦{coinsToNaira(costCoins).toLocaleString()} • 1,000 coins = ₦500</div></div>
          {msg&&<div className="p-3 rounded-xl bg-[#7d1738]/10 border border-[#a72b50]/20 text-xs text-[#f09ab1]">{msg}</div>}
          <button className="jb-primary w-full justify-center">Place Order <ArrowRight className="w-4 h-4"/></button>
        </div>
      </form>
    </div>}
  </div>;
};
