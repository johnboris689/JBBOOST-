import React from 'react';
import { api } from '../../lib/api';
export const AdminDepositsPage: React.FC = () => {
  const [rows,setRows]=React.useState<any[]>([]); const [loading,setLoading]=React.useState(true);
  const load=()=>{setLoading(true);api.getAdminDeposits().then(setRows).catch(console.error).finally(()=>setLoading(false));}; React.useEffect(load,[]);
  return <div className="space-y-5"><div><h1 className="text-2xl font-black">KoraPay Coin Purchases</h1><p className="text-xs text-slate-400 mt-1">Verified wallet funding transactions from the KoraPay checkout.</p></div><div className="jb-card p-4">{loading?<div className="py-10 text-center text-xs text-slate-500">Loading payments…</div>:rows.length===0?<div className="py-10 text-center text-xs text-slate-500">No coin purchase records yet.</div>:<div className="space-y-2">{rows.map(r=><div key={r.id||r.reference} className="p-4 rounded-2xl bg-white/[.03] border border-white/10 flex flex-col sm:flex-row justify-between gap-2"><div><div className="text-xs font-black">{r.userName||r.userEmail}</div><div className="text-[10px] text-slate-500 mt-1">{r.reference} • {r.provider||'korapay'}</div></div><div className="text-sm font-black">₦{Number(r.amount||0).toLocaleString()} <span className="text-[10px] text-[#df6f8e] uppercase">{r.status}</span></div></div>)}</div>}</div></div>;
};
