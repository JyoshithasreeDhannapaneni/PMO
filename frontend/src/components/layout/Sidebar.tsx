'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import {
  Home, Folder, ShieldCheck, Gauge, Bell, Star,
  BarChart3, ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
  Archive, CircleUserRound, Handshake, Briefcase, Users, Target, Megaphone, FileText,
  HandCoins, BookMarked, BookOpen, Settings,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

// Each item gets its own icon color so the sidebar reads as a set of distinct
// destinations at a glance, not a uniform gray list. Colors are deliberately
// varied (not one hue family) since this is a long list of unrelated sections.
const allNavigation = [
  { name: 'Dashboard',            href: '/',                       icon: Home,            color: '#2563eb', adminOnly: false },
  { name: 'All Projects',         href: '/projects',               icon: Folder,          color: '#d97706', adminOnly: false },
  { name: 'Professional Services', href: '/professional-services', icon: Briefcase,       color: '#7c3aed', adminOnly: false },
  { name: 'Migration Validation', href: '/migration-runbooks',     icon: ShieldCheck,     color: '#059669', adminOnly: false },
  { name: 'Overage Projects',     href: '/overage-projects',       icon: Gauge,           color: '#dc2626', adminOnly: false },
  { name: 'Escalated Projects',   href: '/escalation-projects',    icon: Bell,            color: '#ea580c', adminOnly: false },
  { name: 'Escalation Mails',     href: '/escalation-mails',       icon: Megaphone,       color: '#c2410c', adminOnly: false },
  { name: 'Reviews',              href: '/reviews',                icon: Star,            color: '#eab308', adminOnly: false },
  {
    name: 'Manager Dashboard', href: '/manager-dashboard', icon: Users, color: '#0891b2', adminOnly: true,
    children: [
      { name: 'Overview', href: '/manager-dashboard' },
      { name: 'Metrics',  href: '/manager-dashboard/metrics' },
    ],
  },
  { name: 'Pre-sales',            href: '/poc-projects',           icon: Target,          color: '#db2777', adminOnly: false },
  { name: 'Account Manager View', href: '/account-manager',        icon: CircleUserRound, color: '#4f46e5', adminOnly: false },
  { name: 'Customer Success',     href: '/customer-success',       icon: Handshake,       color: '#16a34a', adminOnly: false },
  { name: 'History Archive',      href: '/archive',                icon: Archive,         color: '#78716c', adminOnly: false },
  { name: 'Server Notifications', href: '/server-alerts',          icon: Megaphone,       color: '#f59e0b', adminOnly: false },
  { name: 'Templates',            href: '/templates',              icon: FileText,        color: '#0d9488', adminOnly: true },
  { name: 'Deal Desk',            href: '/deal-desk',              icon: HandCoins,       color: '#65a30d', adminOnly: true },
  { name: 'Case Studies',         href: '/case-studies',           icon: BookMarked,      color: '#9333ea', adminOnly: false },
  { name: 'KB Articles',          href: '/kb-articles',            icon: BookOpen,        color: '#0284c7', adminOnly: false },
  {
    name: 'Reports', href: '#', icon: BarChart3, color: '#e11d48', adminOnly: false,
    children: [
      { name: 'Weekly Reports',   href: '/reports/weekly' },
      { name: 'Monthly Reports',  href: '/reports/monthly' },
      { name: 'Audit Report',     href: '/reports/audit' },
      { name: 'Audit Dashboard',  href: '/reports/audit-dashboard' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const companyName = settings.brandingSettings?.companyName || 'Neutara PMO Tracker';
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
      <div className={cn(
        'flex items-center h-20 pl-3 pr-3 gap-2 border-b border-blue-100',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {collapsed ? (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex-shrink-0"
            title="Expand"
          >
            <PanelLeftOpen size={20} />
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
              <Image src="/cloudfuze-logo.png" alt="CloudFuze" width={52} height={52} priority className="object-contain flex-shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">{companyName}</span>
            </Link>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex-shrink-0"
              title="Collapse"
            >
              <PanelLeftClose size={20} />
            </button>
          </>
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
                  <item.icon size={17} className="flex-shrink-0" style={{ color: item.color }} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-8 mt-0.5 space-y-0.5 animate-fadeInUp">
                    {item.children.filter((child: any) => !child.adminOnly || isAdmin).map((child) => (
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
              <item.icon size={17} className="flex-shrink-0" style={{ color: isActive ? undefined : item.color }} />
              {!collapsed && <span className="flex-1">{item.name}</span>}
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
          <aside className={cn(
            'flex flex-col sidebar-3d animate-fadeInLeft transition-all duration-300',
            collapsed ? 'w-16' : 'w-60'
          )}>
            {sidebarContent}
          </aside>
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
