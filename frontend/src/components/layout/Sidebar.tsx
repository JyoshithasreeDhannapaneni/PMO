'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import {
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  FileText,
  Bell,
  Settings,
  Layers,
  Users,
  Shuffle,
  BarChart2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  LogOut,
  DollarSign,
  Siren,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const allNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
  { name: 'All Projects', href: '/projects', icon: FolderKanban, adminOnly: false },
  { name: 'Overage Projects', href: '/overage-projects', icon: DollarSign, adminOnly: false },
  { name: 'Escalated Projects', href: '/escalation-projects', icon: Siren, adminOnly: false },
  { name: 'Managers & Goals', href: '/managers', icon: Users, badge: 'goals', adminOnly: false },
  { name: 'Migration Types', href: '/migration-types', icon: Shuffle, adminOnly: true },
  { name: 'Templates', href: '/templates', icon: Layers, adminOnly: false },
  { name: 'Case Studies', href: '/case-studies', icon: FileText, adminOnly: false },
  { name: 'CS Template', href: '/case-studies/template', icon: Layers, badge: 'cstemplate', adminOnly: true },
  {
    name: 'Reports',
    href: '#',
    icon: BarChart2,
    adminOnly: false,
    children: [
      { name: 'Weekly Reports', href: '/reports/weekly' },
      { name: 'Monthly Reports', href: '/reports/monthly' },
    ],
  },
  { name: 'Chat Bot', href: '/?chatbot=open', icon: MessageSquare, badge: 'chat', adminOnly: false },
  { name: 'Notifications', href: '/notifications', icon: Bell, adminOnly: false },
];

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
    setOpenGroups((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const badgeColors: Record<string, string> = {
    goals: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    managers: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    types: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    smtp: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    chat: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cstemplate: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  };

  const sidebarContent = (
    <>
      {/* Logo + Hamburger */}
      <div className="flex items-center h-16 px-3 border-b border-gray-200 dark:border-gray-700 gap-2">
        <button
          onClick={() => { setCollapsed((c) => !c); setMobileOpen(false); }}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <FolderKanban className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white truncate">{companyName}</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg flex-shrink-0 mx-auto">
            <FolderKanban className="text-white" size={20} />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && item.href !== '#' && pathname.startsWith(item.href.split('?')[0]));
          const isOpen = openGroups.includes(item.name);

          if (item.children) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => { if (!collapsed) toggleGroup(item.name); }}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white',
                    collapsed && 'justify-center'
                  )}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className="ml-8 mt-0.5 space-y-0.5">
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-500" />
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
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white',
                collapsed && 'justify-center'
              )}
            >
              <item.icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="flex-1">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 space-y-0.5">
        <Link
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!collapsed && 'Settings'}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200',
          collapsed ? 'md:w-16' : 'md:w-64'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile hamburger button (top-left, only on small screens) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <aside className="w-64 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
            {sidebarContent}
          </aside>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
