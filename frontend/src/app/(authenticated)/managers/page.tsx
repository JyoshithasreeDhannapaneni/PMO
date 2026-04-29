'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Users, TrendingUp, TrendingDown, Plus, X, Loader2,
  Target, AlertCircle, UserCheck, Trash2, ChevronRight, ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/services/api';

interface ManagerGoal {
  id: string;
  managerName: string;
  goalPct: number;
}

interface ManagerStat {
  manager: string;
  total: number;
  active: number;
  completed: number;
  delayed: number;
  achievedPct: number;
  goalPct: number;
}

function AddGoalModal({
  managers,
  onClose,
  onSave,
}: {
  managers: string[];
  onClose: () => void;
  onSave: (managerName: string, goalPct: number) => void;
}) {
  const [managerName, setManagerName] = useState('');
  const [customManager, setCustomManager] = useState('');
  const [goalPct, setGoalPct] = useState(80);

  const finalManager = managerName === '__custom__' ? customManager : managerName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Target size={18} className="text-primary-600" /> Add / Update Manager Goal
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={17} className="text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manager</label>
            <select
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select a manager...</option>
              {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">+ Enter custom name</option>
            </select>
          </div>
          {managerName === '__custom__' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manager Name</label>
              <input
                type="text"
                value={customManager}
                onChange={(e) => setCustomManager(e.target.value)}
                placeholder="Enter manager name..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Goal Percentage: <span className="text-primary-600 font-bold">{goalPct}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={goalPct}
              onChange={(e) => setGoalPct(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (finalManager) onSave(finalManager, goalPct); }}
              disabled={!finalManager}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Restricted</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Only administrators can view this page.</p>
        </div>
      </div>
    );
  }

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['managerGoalsWithStats'],
    queryFn: () => api.get('/manager-goals/with-stats').then((r) => r.data),
  });

  const { data: goalsData } = useQuery({
    queryKey: ['managerGoals'],
    queryFn: () => api.get('/manager-goals').then((r) => r.data),
  });

  const upsertMutation = useMutation({
    mutationFn: (body: { managerName: string; goalPct: number }) =>
      api.post('/manager-goals', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerGoalsWithStats'] });
      queryClient.invalidateQueries({ queryKey: ['managerGoals'] });
      queryClient.invalidateQueries({ queryKey: ['managerStats'] });
      showToast('success', 'Manager goal saved!');
      setShowAddModal(false);
    },
    onError: () => showToast('error', 'Failed to save goal'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/manager-goals/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerGoalsWithStats'] });
      queryClient.invalidateQueries({ queryKey: ['managerGoals'] });
      showToast('success', 'Manager goal removed');
    },
    onError: () => showToast('error', 'Failed to delete goal'),
  });

  const stats: ManagerStat[] = statsData?.data || [];
  const goals: ManagerGoal[] = goalsData?.data || [];
  const managerNames = stats.map((s) => s.manager);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Managers & Goals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track manager performance and set completion goals</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Add Manager Goal
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Managers', value: stats.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/40' },
          { label: 'On Target', value: stats.filter((s) => s.achievedPct >= s.goalPct).length, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/40' },
          { label: 'Below Target', value: stats.filter((s) => s.achievedPct < s.goalPct).length, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/40' },
          { label: 'Custom Goals Set', value: goals.length, icon: Target, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/40' },
        ].map((item) => (
          <Card key={item.label} className="text-center py-4">
            <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}>
              <item.icon size={20} className={item.color} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{item.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
          </Card>
        ))}
      </div>

      {/* Manager Goals Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={16} className="text-primary-600" /> Manager Goals &amp; Variance
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <Plus size={12} /> Add Goal
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No manager data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  {['Manager', 'Total', 'Active', 'Completed', 'Delayed', 'Goal (%)', 'Achieved (%)', 'Variance (%)'].map((h) => (
                    <th key={h} className={`py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 ${h === 'Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((m) => {
                  const variance = m.achievedPct - m.goalPct;
                  return (
                    <tr key={m.manager} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 flex-shrink-0">
                            {m.manager.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{m.manager}</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3 text-gray-700 dark:text-gray-300">{m.total}</td>
                      <td className="text-center py-3 px-3">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">{m.active}</span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">{m.completed}</span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full text-xs font-semibold ${m.delayed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>{m.delayed}</span>
                      </td>
                      <td className="text-center py-3 px-3 text-gray-700 dark:text-gray-300">{m.goalPct}%</td>
                      <td className="text-center py-3 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${m.achievedPct}%` }} />
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-white text-xs">{m.achievedPct}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`inline-flex items-center gap-0.5 font-semibold text-xs px-2 py-0.5 rounded-full ${variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {variance >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {variance >= 0 ? '+' : ''}{variance}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Custom Goals List */}
      {goals.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Target size={16} className="text-primary-600" /> Custom Goal Settings
          </h2>
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                    {g.managerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{g.managerName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary-600">{g.goalPct}% goal</span>
                  <button
                    onClick={() => deleteMutation.mutate(g.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 text-gray-400 transition-colors"
                    title="Remove custom goal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Account Managers Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <UserCheck size={16} className="text-primary-600" /> Account Managers Overview
          </h2>
          <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            View All Projects <ChevronRight size={12} />
          </Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Account managers are assigned per project. To see account manager assignments, view individual projects or filter projects by account manager in the All Projects view.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/projects"
            className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm hover:bg-primary-100 transition-colors"
          >
            <Users size={14} /> View All Projects
          </Link>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <Plus size={14} /> New Project
          </Link>
        </div>
      </Card>

      {showAddModal && (
        <AddGoalModal
          managers={managerNames}
          onClose={() => setShowAddModal(false)}
          onSave={(managerName, goalPct) => upsertMutation.mutate({ managerName, goalPct })}
        />
      )}
    </div>
  );
}
