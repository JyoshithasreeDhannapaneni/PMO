'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import {
  LayoutDashboard, FolderKanban, AlertTriangle, FileText,
  Settings, Layers, Users, BarChart2, ChevronDown,
  ChevronRight, LogOut, DollarSign, Siren, Menu, X, Archive,
  FlaskConical, Building2, HeartHandshake, BookOpen, Briefcase, Bell,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const allNavigation = [
  { name: 'Dashboard',          href: '/',                       icon: LayoutDashboard, adminOnly: false },
  { name: 'All Projects',        href: '/projects',               icon: FolderKanban,    adminOnly: false },
  { name: 'Professional Services', href: '/professional-services', icon: Briefcase,       adminOnly: false },
  { name: 'Migration Validation', href: '/migration-runbooks',     icon: BookOpen,        adminOnly: false },
  { name: 'Overage Projects',   href: '/overage-projects',       icon: DollarSign,      adminOnly: false },
  { name: 'Escalated Projects', href: '/escalation-projects',    icon: Siren,           adminOnly: false },
  { name: 'Managers & Goals',   href: '/managers',               icon: Users,   badge: 'goals', adminOnly: false },
  { name: 'Manager Dashboard',  href: '/manager-dashboard',      icon: LayoutGrid,               adminOnly: true },
  { name: 'Pre-sales',          href: '/poc-projects',           icon: FlaskConical,    adminOnly: false },
  { name: 'Account Manager View', href: '/account-manager',     icon: Building2,       adminOnly: false },
  { name: 'Customer Success',   href: '/customer-success',       icon: HeartHandshake,  adminOnly: false },
  { name: 'History Archive',    href: '/archive',                icon: Archive,         adminOnly: false },
  { name: 'Server Notifications', href: '/server-alerts',         icon: Bell,            adminOnly: false },
  { name: 'Templates',          href: '/templates',              icon: Layers,          adminOnly: false },
  { name: 'Case Studies',       href: '/case-studies',           icon: FileText,        adminOnly: false },
  {
    name: 'Reports', href: '#', icon: BarChart2, adminOnly: false,
    children: [
      { name: 'Weekly Reports',  href: '/reports/weekly' },
      { name: 'Monthly Reports', href: '/reports/monthly' },
      { name: 'Audit Dashboard', href: '/reports/audit' },
    ],
  },
];

const badgeColors: Record<string, string> = {
  goals:      'bg-orange-100 text-orange-600 border border-orange-200',
  chat:       'bg-emerald-100 text-emerald-600 border border-emerald-200',
};

export function Sidebar() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const companyName = settings.brandingSettings?.companyName || 'PMO Tracker';
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const navigation = allNavigation.filter((item) => !item.adminOnly || isAdmin);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center h-16 px-3 gap-2 border-b border-blue-100">
        <button
          onClick={() => { setCollapsed((c) => !c); setMobileOpen(false); }}
          className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex-shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-gradient flex items-center justify-center shadow-glow-sm flex-shrink-0">
              <FolderKanban className="text-white" size={18} />
            </div>
            <span className="text-sm font-bold text-slate-800 truncate">{companyName}</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="w-8 h-8 rounded-lg bg-indigo-gradient flex items-center justify-center shadow-glow-sm mx-auto">
            <FolderKanban className="text-white" size={18} />
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {navigation.map((item, idx) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && item.href !== '#' && pathname.startsWith(item.href.split('?')[0]));
          const isOpen = openGroups.includes(item.name);

          if (item.children) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => { if (!collapsed) toggleGroup(item.name); }}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'nav-item w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all',
                    'text-slate-500 hover:text-blue-600 hover:bg-blue-50',
                    collapsed && 'justify-center'
                  )}
                >
                  <item.icon size={17} className="flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-8 mt-0.5 space-y-0.5 animate-fadeInUp">
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          pathname === child.href
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                'nav-item flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all',
                isActive ? 'active text-blue-600' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50',
                collapsed && 'justify-center'
              )}
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <item.icon size={17} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.name}</span>
                  {item.badge && badgeColors[item.badge] && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', badgeColors[item.badge])}>
                      {item.badge === 'goals' ? 'Goals' : item.badge === 'chat' ? 'AI' : 'New'}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-blue-100 space-y-0.5">
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'nav-item flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all',
            collapsed && 'justify-center'
          )}
        >
          <Settings size={17} className="flex-shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'nav-item w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={17} className="flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className={cn(
        'hidden md:flex md:flex-col sidebar-3d transition-all duration-300 relative z-20',
        collapsed ? 'md:w-16' : 'md:w-60'
      )}>
        {sidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-white border border-blue-100 text-slate-600 shadow-sm"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <aside className="w-60 flex flex-col sidebar-3d animate-fadeInLeft">
            {sidebarContent}
          </aside>
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
