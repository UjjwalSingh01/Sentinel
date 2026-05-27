import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, LogOut, Shield, Activity, Terminal } from 'lucide-react';
import { logout, getUser } from '@/lib/auth';

export function Sidebar() {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
    { to: '/logs', label: 'Logs', icon: Terminal },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 glass-strong border-r border-zinc-800 flex flex-col z-40">
      {/* Logo */}
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <Shield size={22} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sentinel</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Infrastructure Monitor</p>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">Live Monitoring</span>
          <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-zinc-800'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-emerald-400">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email || ''}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
