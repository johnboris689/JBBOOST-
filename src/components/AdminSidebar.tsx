import React from 'react';
import { 
  LayoutDashboard, ShoppingBag, Server, Users, CreditCard, 
  Settings, LogOut, X, RefreshCw
} from 'lucide-react';

export type AdminTab = 'overview' | 'orders' | 'providers' | 'services' | 'users' | 'deposits' | 'withdrawals' | 'settings' | 'reports' | 'logs' | 'security' | string;

export interface AdminSidebarProps {
  activeTab: AdminTab | string;
  onNavigateTab: (tab: any) => void;
  usersCount?: number;
  pendingPaymentsCount?: number;
  pendingWithdrawalsCount?: number;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (open: boolean) => void;
  onExit?: () => void;
  isCyberStyle?: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onNavigateTab,
  usersCount,
  pendingPaymentsCount,
  pendingWithdrawalsCount,
  mobileMenuOpen,
  setMobileMenuOpen,
  onExit,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'providers', label: 'Providers', icon: Server },
    { id: 'services', label: 'Services', icon: RefreshCw },
    { id: 'users', label: 'Users', icon: Users, badge: usersCount },
    { id: 'deposits', label: 'Payments', icon: CreditCard, badge: pendingPaymentsCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-[#0d0508] border-r border-white/10 p-4 flex flex-col justify-between transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="font-black text-sm text-white tracking-wider">
              JB BOOST <span className="text-[#df6f8e]">ADMIN</span>
            </div>
            {setMobileMenuOpen && (
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigateTab(item.id);
                    if (setMobileMenuOpen) setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? 'bg-[#7d1738] text-white'
                      : 'text-slate-400 hover:bg-white/[.04] hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {onExit && (
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 hover:text-red-400 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit Admin</span>
          </button>
        )}
      </aside>

      {mobileMenuOpen && setMobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}
    </>
  );
};

export default AdminSidebar;
