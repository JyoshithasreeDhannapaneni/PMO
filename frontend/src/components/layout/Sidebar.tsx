'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  AlertTriangle,
  FileText,
  Bell,
  Settings,
  Briefcase,
  Layers,
  Users,
  UserCheck,
  Shuffle,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const allNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
  { name: 'Portfolio', href: '/portfolio', icon: Briefcase, adminOnly: false },
  { name: 'All Projects', href: '/projects', icon: FolderKanban, adminOnly: false },
  { name: 'New Project', href: '/projects/new', icon: Plus, adminOnly: false },
  { name: 'Managers & Goals', href: '/managers', icon: Users, badge: 'goals', adminOnly: true },
  { name: 'Account Managers', href: '/managers', icon: UserCheck, badge: 'managers', adminOnly: true },
  { name: 'Migration Types', href: '/settings?tab=migration', icon: Shuffle, badge: 'types', adminOnly: true },
  { name: 'Templates', href: '/templates', icon: Layers, adminOnly: false },
  { name: 'Case Studies', href: '/case-studies', icon: FileText, adminOnly: false },
  { name: 'CS Template', href: '/case-studies/template', icon: Layers, badge: 'cstemplate', adminOnly: true },
  {
    name: 'Reports',
    href: '#',
    icon: BarChart2,
    adminOnly: false,
    children: [
      { name: 'Weekly Reports', href: '/?report=weekly' },
      { name: 'Monthly Reports', href: '/?report=monthly' },
    ],
  },
  { name: 'SMTP Settings', href: '/smtp-settings', icon: Mail, badge: 'smtp', adminOnly: true },
  { name: 'Chat Bot', href: '/?chatbot=open', icon: MessageSquare, badge: 'chat', adminOnly: false },
  { name: 'Notifications', href: '/notifications', icon: Bell, adminOnly: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { user, logout } = useAuth();
  const companyName = settings.brandingSettings?.companyName || 'PMO Tracker';
  const [openGroups, setOpenGroups] = useState<string[]>([]);
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

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-colors">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <FolderKanban className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white">{companyName}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && item.href !== '#' && pathname.startsWith(item.href.split('?')[0]));
          const isOpen = openGroups.includes(item.name);

          if (item.children) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => toggleGroup(item.name)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <item.icon size={18} />
                  <span className="flex-1 text-left">{item.name}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
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
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <item.icon size={18} />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded-full', badgeColors[item.badge])}>
                  {item.badge === 'goals' ? '1' : item.badge === 'managers' ? '2' : item.badge === 'types' ? '3' : item.badge === 'smtp' ? '8' : '7'}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Settings size={18} />
          Settings
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
