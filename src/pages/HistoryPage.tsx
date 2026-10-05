import React from 'react';
import { History, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Coins, ShoppingBag } from 'lucide-react';
import { api } from '../lib/api';
import { nairaToCoins } from '../lib/coins';

export const HistoryPage: React.FC = () => {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    Promise.all([api.getTransactions(), api.getSocialOrders()])
      .then(([transactions, orders]) => {
        if (!alive) return;
        const txItems = (Array.isArray(transactions) ? transactions : []).map((x:any) => ({
          ...x,
          kind: 'transaction',
          timestamp: x.createdAt || x.date || Date.now(),
        }));
        const orderItems = (Array.isArray(orders) ? orders : []).map((x:any) => ({
          id: `order-${x.id}`,
          type: 'social_order',
          description: `${x.platform} • ${x.serviceName}`,
          reference: x.id,
          amount: Number(x.amount || 0),
          status: x.status || 'pending',
          timestamp: x.createdAt || Date.now(),
          kind: 'order',
          quantity: Number(x.quantity || 0),
        }));
        setItems([...txItems, ...orderItems].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      })
      .catch((e:any) => {
        if (alive) setError(e?.message || 'Unable to load your history.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-black flex gap-2 items-center"><History className="w-6 h-6 text-[#df6f8e]"/> History</h1>
      <p className="text-xs text-slate-400 mt-1">Your coin purchases and social-media order activity.</p>
    </div>
    {error && <div className="jb-card p-4 border-[#a72b50]/40 text-xs text-[#f09ab1]">{error}</div>}
    <div className="jb-card p-4">
      {loading ? <div className="py-12 text-center text-xs text-slate-500">Loading your history…</div> : items.length === 0 ? <div className="py-12 text-center"><History className="w-8 h-8 mx-auto text-slate-700"/><p className="text-sm font-bold text-slate-400 mt-3">No history yet</p><p className="text-xs text-slate-600 mt-1">Your KoraPay coin purchases and social-media orders will appear here.</p></div> : <div className="space-y-2">
        {items.map((x:any) => {
          const isOrder = x.kind === 'order';
          const credit = !isOrder && /deposit|credit|fund|bonus|purchase/i.test(String(x.type || x.description || ''));
          return <div key={`${x.kind}-${x.id}`} className="p-4 rounded-2xl border border-white/10 bg-white/[.025] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#7d1738]/15 grid place-items-center shrink-0">{isOrder ? <ShoppingBag className="w-5 h-5 text-[#df6f8e]"/> : credit ? <ArrowDownLeft className="w-5 h-5 text-[#df6f8e]"/> : <ArrowUpRight className="w-5 h-5 text-[#df6f8e]"/>}</div>
              <div className="min-w-0"><div className="text-xs font-black truncate">{x.description || x.type || 'Activity'}</div><div className="text-[10px] text-slate-500 mt-1 truncate">{x.reference || '—'} • {new Date(x.timestamp).toLocaleString()}</div>{isOrder && <div className="text-[10px] text-slate-600 mt-1">{x.quantity.toLocaleString()} units</div>}</div>
            </div>
            <div className="text-right shrink-0"><div className="text-sm font-black flex items-center gap-1">{isOrder ? '-' : credit ? '+' : '-'}{nairaToCoins(Number(x.amount || 0)).toLocaleString()} <Coins className="w-3.5 h-3.5 text-[#df6f8e]"/></div><div className="text-[9px] text-[#df6f8e] uppercase font-black flex justify-end gap-1 mt-1">{x.status === 'pending' ? <Clock3 className="w-3 h-3"/> : <CheckCircle2 className="w-3 h-3"/>}{x.status || 'completed'}</div></div>
          </div>;
        })}
      </div>}
    </div>
  </div>;
};
