'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import Link from 'next/link';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

export function Header() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const color = settings.brandingSettings?.primaryColor;
    if (color) document.documentElement.style.setProperty('--color-primary', color);
  }, [settings.brandingSettings?.primaryColor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <header className="header-3d h-16 flex items-center justify-between px-6 relative z-10 flex-shrink-0">
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />

      {/* Search */}
      <div className="flex-1 max-w-sm">
        <GlobalSearch />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationCenter />

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 bg-white rounded-xl px-3 py-1.5 hover:bg-blue-50 transition-all border border-blue-100 hover:border-blue-300 shadow-sm"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg bg-indigo-gradient flex items-center justify-center text-white text-xs font-bold shadow-glow-sm flex-shrink-0">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-700 leading-tight">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{user?.role || 'Viewer'}</p>
            </div>
            <ChevronDown size={14} className={`text-slate-400 hidden sm:block transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-blue-100 py-1 z-50 animate-scaleIn origin-top-right">
              {/* User info */}
              <div className="px-4 py-3 border-b border-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-gradient flex items-center justify-center text-white text-sm font-bold shadow-glow-sm">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-600 border border-blue-200 rounded-full">
                      {user?.role || 'User'}
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                <Settings size={15} className="text-slate-400" />
                Settings
              </Link>

              <button
                onClick={() => { setIsDropdownOpen(false); logout(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-all"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
