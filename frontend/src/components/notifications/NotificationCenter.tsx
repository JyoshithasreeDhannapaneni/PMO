'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, AlertTriangle, Info, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  projectId?: string;
  createdAt: string;
  project?: { id: string; name: string };
}

const notificationIcons: Record<string, any> = {
  DELAY_DETECTED: AlertTriangle,
  PROJECT_COMPLETED: CheckCircle,
  CASE_STUDY_REMINDER: Info,
  PHASE_COMPLETED: Check,
  GENERAL: Bell,
};

const notificationColors: Record<string, string> = {
  DELAY_DETECTED:      'text-red-500 bg-red-50',
  PROJECT_COMPLETED:   'text-green-600 bg-green-50',
  CASE_STUDY_REMINDER: 'text-blue-600 bg-blue-50',
  PHASE_COMPLETED:     'text-violet-600 bg-violet-50',
  GENERAL:             'text-slate-500 bg-slate-100',
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications?limit=20`);
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data);
        setUnreadCount(json.data.filter((n: Notification) => n.status === 'PENDING').length);
      }
    } catch {}
  };

  const markAsRead = async (id: string) => {
    try { await fetch(`${API_URL}/api/notifications/${id}/read`, { method: 'PUT' }); fetchNotifications(); } catch {}
  };
  const markAllAsRead = async () => {
    try { await fetch(`${API_URL}/api/notifications/mark-all-read`, { method: 'PUT' }); fetchNotifications(); } catch {}
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-blue-100 z-50 overflow-hidden"
          style={{ boxShadow: '0 20px 60px rgba(37,99,235,0.12)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-blue-50 bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="font-semibold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 mx-auto mb-3 text-blue-200" />
                <p className="text-slate-500 text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-blue-50">
                {notifications.map((notification) => {
                  const Icon = notificationIcons[notification.type] || Bell;
                  const colorClass = notificationColors[notification.type] || notificationColors.GENERAL;
                  const isUnread = notification.status === 'PENDING';
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-blue-50/50 transition-colors ${isUnread ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${colorClass}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm text-slate-800 ${isUnread ? 'font-semibold' : ''}`}>
                              {notification.title}
                            </p>
                            {isUnread && (
                              <button onClick={() => markAsRead(notification.id)} className="text-slate-400 hover:text-blue-500 flex-shrink-0" title="Mark as read">
                                <Check size={14} />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock size={10} />
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </span>
                            {notification.project && (
                              <Link href={`/projects/${notification.project.id}`} className="text-xs text-blue-600 hover:underline" onClick={() => setIsOpen(false)}>
                                View Project
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-blue-50 bg-blue-50/40">
            <Link href="/notifications" className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline" onClick={() => setIsOpen(false)}>
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
