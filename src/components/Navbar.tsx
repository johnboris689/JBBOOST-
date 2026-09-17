import React, { useState } from 'react';
import {
  Coins,
  Shield,
  User as UserIcon,
  LogOut,
  ShoppingBag,
  History,
  PlusCircle,
  Menu,
  X,
  Zap,
  Code,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout, openAuthModal } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: string) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  };

  const nairaValue = user ? (((user.coin_balance || 0) / 10000) * 500).toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }) : '₦0';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            id="brand-logo-btn"
            onClick={() => handleNavClick('landing')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-amber-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  SMM<span className="text-emerald-400">BOOST</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  ₦ / Coins
                </span>
              </div>
              <p className="text-[10px] text-slate-400 -mt-1 hidden sm:block">Nigeria's #1 Growth Engine</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
            <button
              id="nav-home-btn"
              onClick={() => handleNavClick('landing')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                currentTab === 'landing' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
              }`}
            >
              Home
            </button>
            <button
              id="nav-services-btn"
              onClick={() => handleNavClick('services')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                currentTab === 'services' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
              }`}
            >
              Services Rate
            </button>
            {user && (
              <>
                <button
                  id="nav-order-btn"
                  onClick={() => handleNavClick('order')}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                    currentTab === 'order' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  New Order
                </button>
                <button
                  id="nav-history-btn"
                  onClick={() => handleNavClick('orders')}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                    currentTab === 'orders' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <History className="w-4 h-4 text-slate-400" />
                  Orders
                </button>
              </>
            )}
            <button
              id="nav-buy-coins-btn"
              onClick={() => handleNavClick('buy-coins')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                currentTab === 'buy-coins' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
              }`}
            >
              <Coins className="w-4 h-4 text-amber-400" />
              Buy Coins
            </button>
            <button
              id="nav-api-docs-btn"
              onClick={() => handleNavClick('api-docs')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                currentTab === 'api-docs' ? 'text-white bg-slate-800/80 font-semibold' : 'hover:text-white hover:bg-slate-900'
              }`}
            >
              <Code className="w-4 h-4 text-cyan-400" />
              API
            </button>

            {user?.role === 'admin' && (
              <button
                id="nav-admin-btn"
                onClick={() => handleNavClick('admin')}
                className={`ml-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  currentTab === 'admin'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30'
                    : 'bg-purple-950/60 text-purple-300 border-purple-800 hover:bg-purple-900/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Panel
              </button>
            )}
          </nav>

          {/* Right Action: Wallet Pill & User Menu */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                {/* Coin Balance Pill */}
                <div
                  id="wallet-quick-badge"
                  onClick={() => handleNavClick('buy-coins')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-colors cursor-pointer group"
                  title="Click to top up coins with KoraPay"
                >
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                    <Coins className="w-3 h-3" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-300">
                      <span>{(user.coin_balance || 0).toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 font-normal">coins</span>
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium -mt-0.5">
                      ≈ {nairaValue}
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-full px-1.5 py-0.5 ml-1 group-hover:bg-amber-500/20">
                    <PlusCircle className="w-2.5 h-2.5" /> Top up
                  </span>
                </div>

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    id="user-profile-menu-btn"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-semibold text-emerald-400 border border-slate-700">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium max-w-[90px] truncate hidden sm:inline">
                      {user.name}
                    </span>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 text-sm animate-in fade-in slide-in-from-top-2">
                      <div className="px-4 py-2 border-b border-slate-800/80">
                        <p className="text-xs font-bold text-white truncate">{user.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                        {user.role === 'admin' && (
                          <span className="mt-1 inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            Administrator
                          </span>
                        )}
                      </div>

                      <div className="py-1">
                        <button
                          id="menu-item-new-order"
                          onClick={() => handleNavClick('order')}
                          className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2.5"
                        >
                          <ShoppingBag className="w-4 h-4 text-emerald-400" />
                          New Order
                        </button>
                        <button
                          id="menu-item-history"
                          onClick={() => handleNavClick('orders')}
                          className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2.5"
                        >
                          <History className="w-4 h-4 text-slate-400" />
                          Order History
                        </button>
                        <button
                          id="menu-item-wallet"
                          onClick={() => handleNavClick('buy-coins')}
                          className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2.5"
                        >
                          <Coins className="w-4 h-4 text-amber-400" />
                          Buy Coins (₦ Wallet)
                        </button>
                        <button
                          id="menu-item-profile"
                          onClick={() => handleNavClick('profile')}
                          className="w-full text-left px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2.5"
                        >
                          <UserIcon className="w-4 h-4 text-cyan-400" />
                          Profile & Settings
                        </button>

                        {user.role === 'admin' && (
                          <button
                            id="menu-item-admin"
                            onClick={() => handleNavClick('admin')}
                            className="w-full text-left px-4 py-2 text-purple-300 hover:text-purple-200 hover:bg-purple-950/60 flex items-center gap-2.5 font-medium border-t border-slate-800/80"
                          >
                            <Shield className="w-4 h-4 text-purple-400" />
                            Admin Portal
                          </button>
                        )}
                      </div>

                      <div className="border-t border-slate-800/80 pt-1">
                        <button
                          id="menu-item-logout"
                          onClick={() => {
                            logout();
                            setDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-rose-400 hover:bg-rose-950/30 flex items-center gap-2.5"
                        >
                          <LogOut className="w-4 h-4" />
                          Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  id="navbar-login-btn"
                  onClick={() => openAuthModal('login')}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all"
                >
                  Log in
                </button>
                <button
                  id="navbar-signup-btn"
                  onClick={() => openAuthModal('register')}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 shadow-md shadow-emerald-500/20 transition-all"
                >
                  Create Account
                </button>
              </div>
            )}

            {/* Mobile menu hamburger */}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-4 space-y-2">
          <button
            onClick={() => handleNavClick('landing')}
            className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900"
          >
            Home
          </button>
          <button
            onClick={() => handleNavClick('services')}
            className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900"
          >
            Services Catalog
          </button>
          {user && (
            <>
              <button
                onClick={() => handleNavClick('order')}
                className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 flex items-center gap-2"
              >
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                New Order
              </button>
              <button
                onClick={() => handleNavClick('orders')}
                className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 flex items-center gap-2"
              >
                <History className="w-4 h-4 text-slate-400" />
                Order History
              </button>
            </>
          )}
          <button
            onClick={() => handleNavClick('buy-coins')}
            className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 flex items-center gap-2"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            Buy Coins (₦ Wallet)
          </button>
          <button
            onClick={() => handleNavClick('api-docs')}
            className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-900 flex items-center gap-2"
          >
            <Code className="w-4 h-4 text-cyan-400" />
            Reseller API
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => handleNavClick('admin')}
              className="w-full text-left px-3 py-2 rounded-lg text-purple-300 bg-purple-950/40 border border-purple-800 flex items-center gap-2 font-medium"
            >
              <Shield className="w-4 h-4 text-purple-400" />
              Admin Portal
            </button>
          )}
        </div>
      )}
    </header>
  );
};
