'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
  Eye,
  ArrowUpRight,
  Search,
  X,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi } from '@/services/api';
import type { Notification } from '@/types';

// ── Type & icon mappings ──────────────────────────────────────────────
type NotificationType = 'DELAY_DETECTED' | 'PROJECT_COMPLETED' | 'CASE_STUDY_REMINDER' | 'PHASE_COMPLETED' | 'GENERAL';

const NOTIFICATION_META: Record<NotificationType, { icon: any; color: string; bg: string; label: string }> = {
  DELAY_DETECTED: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    label: 'Delay Detected',
  },
  PROJECT_COMPLETED: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    label: 'Project Completed',
  },
  CASE_STUDY_REMINDER: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    label: 'Case Study Reminder',
  },
  PHASE_COMPLETED: {
    icon: Check,
    color: 'text-purple-600',
    bg: 'bg-purple-50 border-purple-200',
    label: 'Phase Completed',
  },
  GENERAL: {
    icon: Bell,
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
    label: 'General',
  },
};

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'DELAY_DETECTED', label: 'Delay Detected' },
  { value: 'PROJECT_COMPLETED', label: 'Project Completed' },
  { value: 'CASE_STUDY_REMINDER', label: 'Case Study Reminder' },
  { value: 'PHASE_COMPLETED', label: 'Phase Completed' },
  { value: 'GENERAL', label: 'General' },
];

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'PENDING', label: 'Unread' },
  { value: 'SENT', label: 'Read' },
];

const ITEMS_PER_PAGE = 15;

// ── Main Page Component ───────────────────────────────────────────────
export default function NotificationsPage() {
  const { user } = useAuth();

  // Data state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & pagination state
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // ── Fetch notifications ──────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.getAll({ page, limit: ITEMS_PER_PAGE });
      if (res.success) {
        setNotifications(res.data);
        setTotalCount(res.pagination.total);
        setUnreadCount(res.data.filter((n) => n.status === 'PENDING').length);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load notifications. Please check if the backend server is running.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Poll for new notifications every 30s
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // ── Actions ──────────────────────────────────────────────────────
  const handleMarkAsRead = async (id: string) => {
    setActionLoading(id);
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'SENT' } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setActionLoading('all');
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'SENT' })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Client-side filtering ────────────────────────────────────────
  const filteredNotifications = notifications.filter((n) => {
    if (typeFilter !== 'ALL' && n.type !== typeFilter) return false;
    if (statusFilter !== 'ALL' && n.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.project?.name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Role-based helper text ───────────────────────────────────────
  const getRoleDescription = () => {
    switch (user?.role) {
      case 'ADMIN':
        return 'Viewing all project notifications across the organization';
      case 'MANAGER':
        return 'Notifications for your managed projects and team updates';
      default:
        return 'Notifications for projects you are assigned to';
    }
  };

  // ── Loading state ────────────────────────────────────────────────
  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchNotifications}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">{getRoleDescription()}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {unreadCount} unread
            </span>
          )}

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={actionLoading === 'all'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {actionLoading === 'all' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCheck size={16} />
              )}
              Mark all as read
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={fetchNotifications}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Filters Bar ───────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-gray-500">
            <Filter size={16} />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
          >
            {TYPE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Active filter count */}
          {(typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setTypeFilter('ALL');
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* ── Summary Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {TYPE_FILTERS.filter((f) => f.value !== 'ALL').map((f) => {
          const meta = NOTIFICATION_META[f.value as NotificationType];
          const count = notifications.filter((n) => n.type === f.value).length;
          const Icon = meta.icon;
          return (
            <button
              key={f.value}
              onClick={() => setTypeFilter(typeFilter === f.value ? 'ALL' : f.value)}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                typeFilter === f.value
                  ? `${meta.bg} ring-2 ring-offset-1 ring-primary-400`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`p-2 rounded-lg ${meta.bg}`}>
                <Icon size={18} className={meta.color} />
              </div>
              <div className="text-left">
                <p className="text-xs text-gray-500">{meta.label}</p>
                <p className="text-lg font-semibold text-gray-900">{count}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Notification List ─────────────────────────────────────── */}
      <Card padding="none">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Inbox size={48} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No notifications found</p>
            <p className="text-sm text-gray-400 mt-1">
              {typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery
                ? 'Try adjusting your filters'
                : 'You\'re all caught up!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredNotifications.map((notification) => {
              const meta = NOTIFICATION_META[(notification.type as NotificationType)] || NOTIFICATION_META.GENERAL;
              const Icon = meta.icon;
              const isUnread = notification.status === 'PENDING';
              const isMarking = actionLoading === notification.id;

              return (
                <div
                  key={notification.id}
                  className={`group flex items-start gap-4 p-4 sm:p-5 transition-colors hover:bg-gray-50 ${
                    isUnread ? 'bg-blue-50/40 border-l-4 border-l-primary-500' : 'border-l-4 border-l-transparent'
                  }`}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 p-2.5 rounded-xl border ${meta.bg}`}>
                    <Icon size={20} className={meta.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {notification.title}
                          </h3>
                          {isUnread && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                              New
                            </span>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </span>
                        </div>

                        <p className="text-sm text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">
                          {notification.message.trim()}
                        </p>

                        {/* Meta row */}
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={12} />
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                          {notification.sentAt && (
                            <span className="text-xs text-gray-400">
                              Sent: {format(new Date(notification.sentAt), 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                          {notification.project && (
                            <Link
                              href={`/projects/${notification.project.id}`}
                              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline"
                            >
                              <ArrowUpRight size={12} />
                              {notification.project.name}
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {isUnread && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            disabled={isMarking}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
                            title="Mark as read"
                          >
                            {isMarking ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Eye size={12} />
                            )}
                            Read
                          </button>
                        )}
                        {notification.project && (
                          <Link
                            href={`/projects/${notification.project.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                            <ArrowUpRight size={12} />
                            View
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

        {/* ── Pagination ─────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/50">
            <p className="text-sm text-gray-500">
              Showing <span className="font-medium">{(page - 1) * ITEMS_PER_PAGE + 1}</span>
              {' '}-{' '}
              <span className="font-medium">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span>
              {' '}of <span className="font-medium">{totalCount}</span> notifications
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Role-based Tip ────────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900">
              {user?.role === 'ADMIN'
                ? 'Admin View'
                : user?.role === 'MANAGER'
                ? 'Manager View'
                : 'Team Member View'}
            </h4>
            <p className="text-sm text-blue-700 mt-0.5">
              {user?.role === 'ADMIN'
                ? 'You are seeing all notifications across every project. Use filters to focus on delays, completions, or specific types. Delay alerts require immediate PM escalation.'
                : user?.role === 'MANAGER'
                ? 'You are seeing notifications for projects you manage. Delay alerts should be addressed within 24 hours. Phase completions indicate milestone progress.'
                : 'You are seeing notifications for projects you contribute to. Check delay alerts for potential impact on your tasks and timelines.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
