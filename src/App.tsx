import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { OrdersPage } from './components/OrdersPage.tsx';
import { BuyCoinsPage } from './components/BuyCoinsPage.tsx';
import { ProfilePage } from './components/ProfilePage.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { ApiDocsPage } from './components/ApiDocsPage.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { Zap, ShieldCheck, Coins, Lock } from 'lucide-react';

function MainContent() {
  const { user, openAuthModal } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('landing');
  const [preselectedServiceId, setPreselectedServiceId] = useState<number | null>(null);

  const handleSelectServiceForOrder = (serviceId: number) => {
    setPreselectedServiceId(serviceId);
    setCurrentTab('order');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950 font-sans">
      {/* Top sticky navigation bar */}
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main content body */}
      <main className="flex-1">
        {currentTab === 'landing' && (
          <LandingPage
            setCurrentTab={setCurrentTab}
            onSelectServiceForOrder={handleSelectServiceForOrder}
          />
        )}

        {currentTab === 'services' && (
          <LandingPage
            setCurrentTab={setCurrentTab}
            onSelectServiceForOrder={handleSelectServiceForOrder}
          />
        )}

        {currentTab === 'order' && (
          user ? (
            <Dashboard
              setCurrentTab={setCurrentTab}
              preselectedServiceId={preselectedServiceId}
            />
          ) : (
            <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Account Login Required</h2>
              <p className="text-xs text-slate-400 mb-6">
                Please sign in or create an account to configure boost parameters and deduct coins from your wallet.
              </p>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
              >
                Sign In to Place Order
              </button>
            </div>
          )
        )}

        {currentTab === 'orders' && (
          user ? (
            <OrdersPage />
          ) : (
            <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Sign In to Track Orders</h2>
              <p className="text-xs text-slate-400 mb-6">
                Log in to inspect live progress, execution links, and transaction logs.
              </p>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
              >
                Sign In
              </button>
            </div>
          )
        )}

        {currentTab === 'buy-coins' && (
          user ? (
            <BuyCoinsPage />
          ) : (
            <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Coins className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Sign In to Fund Coin Wallet</h2>
              <p className="text-xs text-slate-400 mb-6">
                Purchase coins with Naira (₦) via KoraPay and receive coins after verified payment confirmation.
              </p>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
              >
                Sign In or Register
              </button>
            </div>
          )
        )}

        {currentTab === 'profile' && (
          user ? (
            <ProfilePage />
          ) : (
            <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full mt-4 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
              >
                Sign In
              </button>
            </div>
          )
        )}

        {currentTab === 'admin' && (
          user?.role === 'admin' ? (
            <AdminPanel />
          ) : (
            <div className="max-w-md mx-auto my-20 p-8 rounded-3xl bg-slate-900 border border-rose-900/60 text-center">
              <h2 className="text-lg font-bold text-rose-400 mb-2">Access Restricted</h2>
              <p className="text-xs text-slate-400">
                This administration dashboard requires Super Admin privileges.
              </p>
            </div>
          )
        )}

        {currentTab === 'api-docs' && <ApiDocsPage />}
      </main>

      {/* Global Authentication Modal */}
      <AuthModal />

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/80 text-xs text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black">
                <Zap className="w-4 h-4 fill-slate-950" />
              </div>
              <span className="font-extrabold text-base text-white tracking-tight">
                SMM<span className="text-emerald-400">BOOST</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Nigeria's most dependable SMM boost infrastructure. Real-time Naira-to-Coin conversion with automated order queuing.
            </p>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>KoraPay Secured & Webhook Automated</span>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-white mb-3">Platform Services</h4>
            <ul className="space-y-1.5 text-[11px]">
              <li>Instagram Followers (Non-Drop)</li>
              <li>TikTok Viral Views & Likes</li>
              <li>YouTube Subscribers & Watchtime</li>
              <li>X (Twitter) Impressions & Retweets</li>
              <li>Facebook Page Engagement</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-3">Coin Economy</h4>
            <ul className="space-y-1.5 text-[11px]">
              <li>Base Rate: ₦500 = 10,000 Coins</li>
              <li>Instant 1-click order checkout</li>
              <li>Automated cancellation refunds</li>
              <li>Tiered bulk purchase bonuses</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-3">Developers & Resellers</h4>
            <p className="text-[11px] text-slate-500 mb-3">
              Connect external SMM reseller panels and custom scripts via our REST API.
            </p>
            <button
              onClick={() => setCurrentTab('api-docs')}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-300 text-[11px] font-semibold transition-colors"
            >
              View API Documentation
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-600 gap-2">
          <p>© {new Date().getFullYear()} SMM Boost Panel Nigeria. All rights reserved.</p>
          <p>Standard exchange: 1 Coin = ₦0.05 • Auto fulfillment engine</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
