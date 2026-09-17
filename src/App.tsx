import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LandingPage } from './pages/LandingPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminDepositsPage } from './pages/admin/AdminDepositsPage';
import { AdminWithdrawalsPage } from './pages/admin/AdminWithdrawalsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminServicesPage } from './pages/admin/AdminServicesPage';
import { SocialServicesPage } from './pages/SocialServicesPage';
import { BuyCoinsPage } from './pages/BuyCoinsPage';
import BottomNav from './components/BottomNav';
import { api } from './lib/api';
import { LogOut, WalletCards, ShoppingBag, History, UserRound, Coins, Home, UsersRound } from 'lucide-react';

function RequireUser({children}:{children:React.ReactNode}) {
  const {user,loading}=useAuth();
  if(loading) return <div className="min-h-screen bg-[#090305] text-white grid place-items-center"><div className="jb-spinner"/></div>;
  return user ? <>{children}</> : <Navigate to="/login" replace/>;
}

function RequireAdmin({children}:{children:React.ReactNode}) {
  const {adminUser,loading}=useAuth();
  if(loading) return <div className="min-h-screen bg-[#090305] text-white grid place-items-center"><div className="jb-spinner"/></div>;
  return adminUser?.isAdmin ? <>{children}</> : <Navigate to="/boris" replace/>;
}

function AppShell({children}:{children:React.ReactNode}) {
  const {user,logout}=useAuth();
  const location=useLocation();
  const active = location.pathname.includes('buy-coins') ? 'coins' : location.pathname.includes('orders') ? 'orders' : location.pathname.includes('history') ? 'history' : location.pathname.includes('profile') ? 'profile' : 'home';
  return <div className="min-h-screen bg-[#090305] text-white">
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0d0508]/85 backdrop-blur-xl pt-safe">
      <div className="max-w-6xl mx-auto h-16 px-4 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2.5"><div className="jb-logo"><span>JB</span></div><div><div className="font-black tracking-tight">JB BOOST</div><div className="text-[9px] uppercase tracking-[.2em] text-[#d26a88]">Social Growth</div></div></Link>
        <div className="flex items-center gap-2"><Link to="/buy-coins" className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-[#7d1738] border border-[#c2476e]/30 text-xs font-black"><Coins className="w-4 h-4"/> Buy Coins</Link><button onClick={logout} className="p-2.5 rounded-xl border border-white/10 bg-white/[.04] text-slate-300 hover:text-white"><LogOut className="w-4 h-4"/></button></div>
      </div>
    </header>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-28">{children}</main>
    <BottomNav activeTab={active} onTabChange={(tab)=>{ const map:any={home:'/dashboard',coins:'/buy-coins',orders:'/orders',history:'/history',profile:'/profile'}; window.history.pushState({},'',map[tab]||'/dashboard'); window.dispatchEvent(new PopStateEvent('popstate')); }}/>
  </div>
}

function Dashboard(){
 const {user,refreshUser}=useAuth();
 const [services,setServices]=React.useState<any[]>([]);
 const [loading,setLoading]=React.useState(true);
 React.useEffect(()=>{api.getSocialServices().then(setServices).catch(console.error).finally(()=>setLoading(false));},[]);
 const platforms=['Facebook','Instagram','TikTok','YouTube','X','Telegram'];
 return <div className="space-y-5">
   <section className="jb-hero rounded-[28px] p-5 sm:p-7 overflow-hidden"><div className="relative z-10"><div className="text-xs text-[#f0a2b8] font-bold">WELCOME BACK</div><h1 className="text-3xl sm:text-4xl font-black mt-1">Grow your social presence.</h1><p className="text-sm text-slate-300 mt-2 max-w-xl">Order social media growth services, fund your account securely, and track every order from one clean dashboard.</p><div className="flex flex-wrap gap-2 mt-5"><Link to="/services" className="jb-primary"><ShoppingBag className="w-4 h-4"/> Browse Services</Link><Link to="/buy-coins" className="jb-secondary"><Coins className="w-4 h-4"/> Buy Coins</Link></div></div></section>
   <section className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="jb-card p-5"><div className="text-xs text-slate-400">Available Balance</div><div className="text-2xl font-black mt-1">₦{Number(user?.walletBalance||0).toLocaleString()}</div></div><div className="jb-card p-5"><div className="text-xs text-slate-400">Account</div><div className="text-lg font-black mt-1 truncate">@{user?.username}</div></div><div className="jb-card p-5"><div className="text-xs text-slate-400">Orders</div><div className="text-2xl font-black mt-1">{user?.totalEarnings!==undefined ? 'Ready' : '—'}</div></div></section>
   <section className="jb-card p-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-black">Social Platforms</h2><p className="text-xs text-slate-400 mt-1">Choose a platform to find available services.</p></div><ShoppingBag className="w-5 h-5 text-[#d45b7d]"/></div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">{platforms.map((p,i)=><Link key={p} to={`/services?platform=${encodeURIComponent(p)}`} className="rounded-2xl bg-white/[.035] border border-white/10 p-4 hover:border-[#a72b50]/60 transition"><div className="w-9 h-9 rounded-xl bg-[#7d1738]/20 grid place-items-center text-[#e47b99] font-black">{p[0]}</div><div className="text-xs font-black mt-2">{p}</div></Link>)}</div></section>
   <section className="jb-card p-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-black">Popular Services</h2><p className="text-xs text-slate-400 mt-1">Prices are controlled from the admin panel.</p></div><Link to="/services" className="text-xs font-black text-[#df6f8e]">View all</Link></div>{loading?<div className="py-8 text-center text-xs text-slate-500">Loading services…</div>:<div className="grid md:grid-cols-3 gap-3">{services.slice(0,6).map(s=><Link key={s.id} to={`/services?service=${s.id}`} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 hover:border-[#a72b50]/60"><div className="flex justify-between gap-3"><span className="text-[10px] uppercase tracking-wider text-[#df6f8e] font-black">{s.platform}</span><span className="text-xs font-black">₦{Number(s.ratePer1000).toLocaleString()}/1k</span></div><div className="font-bold text-sm mt-2">{s.name}</div><div className="text-[10px] text-slate-500 mt-2">Min {s.minQuantity.toLocaleString()} • Max {s.maxQuantity.toLocaleString()}</div></Link>)}</div>}</section>
 </div>
}

function Services(){return <SocialServicesPage/>}
function Orders(){return <OrdersPage/>}
function OrdersPage(){const [orders,setOrders]=React.useState<any[]>([]); const [loading,setLoading]=React.useState(true); React.useEffect(()=>{api.getSocialOrders().then(setOrders).catch(console.error).finally(()=>setLoading(false));},[]); return <div className="space-y-4"><div><h1 className="text-2xl font-black">My Orders</h1><p className="text-xs text-slate-400 mt-1">Track your social-media service orders.</p></div><div className="jb-card p-4">{loading?<div className="py-10 text-center text-xs text-slate-500">Loading orders…</div>:orders.length===0?<div className="py-10 text-center text-sm text-slate-500">No orders yet. <Link className="text-[#df6f8e] font-bold" to="/services">Browse services</Link>.</div>:<div className="space-y-2">{orders.map(o=><div key={o.id} className="p-4 rounded-2xl bg-white/[.025] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="text-[10px] uppercase text-[#df6f8e] font-black">{o.platform} • {o.status}</div><div className="font-bold text-sm mt-1">{o.serviceName}</div><div className="text-[10px] text-slate-500 mt-1">{o.targetUrl} • {Number(o.quantity).toLocaleString()} units</div></div><div className="text-sm font-black">₦{Number(o.amount).toLocaleString()}</div></div>)}</div>}</div></div>}

function BuyCoins(){return <BuyCoinsPage/>}

function AdminShell(){const {adminLogout}=useAuth(); return <div className="min-h-screen bg-[#090305] text-white"><header className="border-b border-white/10 bg-[#0d0508]/90 sticky top-0 z-40"><div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"><Link to="/boris/dashboard" className="font-black">JB BOOST <span className="text-[#df6f8e]">ADMIN</span></Link><button onClick={adminLogout} className="text-xs font-bold text-slate-300">Logout</button></div></header><main className="max-w-7xl mx-auto p-4 sm:p-6 pb-12"><nav className="flex flex-wrap gap-2 mb-5">{[['/boris/dashboard','Overview'],['/boris/services','Services'],['/boris/users','Users'],['/boris/deposits','Payments'],['/boris/withdrawals','Withdrawals'],['/boris/settings','Settings']].map(([p,l])=><Link key={p} to={p} className="px-3 py-2 rounded-xl bg-white/[.04] border border-white/10 text-xs font-bold hover:border-[#a72b50]/60">{l}</Link>)}</nav><Routes><Route path="/dashboard" element={<AdminDashboardPage/>}/><Route path="/services" element={<AdminServicesPage/>}/><Route path="/users" element={<AdminUsersPage/>}/><Route path="/deposits" element={<AdminDepositsPage/>}/><Route path="/withdrawals" element={<AdminWithdrawalsPage/>}/><Route path="/settings" element={<AdminSettingsPage/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></main></div>}

function RouterApp(){return <Routes><Route path="/" element={<LandingPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/boris" element={<AdminLoginPage/>}/><Route path="/boris/*" element={<RequireAdmin><AdminShell/></RequireAdmin>}/><Route path="/dashboard" element={<RequireUser><AppShell><Dashboard/></AppShell></RequireUser>}/><Route path="/services" element={<RequireUser><AppShell><Services/></AppShell></RequireUser>}/><Route path="/buy-coins" element={<RequireUser><AppShell><BuyCoins/></AppShell></RequireUser>}/><Route path="/orders" element={<RequireUser><AppShell><Orders/></AppShell></RequireUser>}/><Route path="/history" element={<RequireUser><AppShell><HistoryPage/></AppShell></RequireUser>}/><Route path="/profile" element={<RequireUser><AppShell><ProfilePage/></AppShell></RequireUser>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}

export default function App(){return <BrowserRouter><AuthProvider><RouterApp/></AuthProvider></BrowserRouter>}
