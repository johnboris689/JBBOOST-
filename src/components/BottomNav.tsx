import React from 'react';
import { Home, ShoppingBag, Coins, History, UserRound } from 'lucide-react';
export default function BottomNav({activeTab,onTabChange}:{activeTab:string;onTabChange:(tab:string)=>void}){
 const tabs=[['home','Home',Home],['coins','Buy Coins',Coins],['orders','Orders',ShoppingBag],['history','History',History],['profile','Profile',UserRound]] as const;
 return <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe"><div className="max-w-6xl mx-auto h-[68px] bg-[#0d0508]/95 backdrop-blur-2xl border-t border-white/10 px-2 flex items-center justify-around shadow-2xl">{tabs.map(([id,label,Icon])=><button key={id} onClick={()=>onTabChange(id)} className={`w-16 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 ${activeTab===id?'text-[#e47b99] bg-[#7d1738]/15':'text-slate-500'}`}><Icon className="w-5 h-5"/><span className="text-[9px] font-black">{label}</span></button>)}</div></div>
}
