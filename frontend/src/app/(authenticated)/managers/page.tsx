'use client';

import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Users, TrendingUp, TrendingDown, Plus, X, Loader2,
  Target, AlertCircle, Trash2, FolderKanban,
  CheckCircle, PauseCircle, PlayCircle, Pencil, BarChart2, Save, Eye,
  Clock, Calendar, ChevronRight, Search,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';

interface ManagerGoal {
  id: string;
  managerName: string;
  goalPct: number;
}

interface ManagerStat {
  manager: string;
  total: number;
  active: number;
  inactive: number;
  completed: number;
  delayed: number;
  achievedPct: number;
  goalPct: number;
  variance: number;
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Target size={18} className="text-primary-600" /> Add / Update Manager Goal
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={17} className="text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
            <select
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select a manager...</option>
              {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">+ Enter custom name</option>
            </select>
          </div>
          {managerName === '__custom__' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
              <input
                type="text"
                value={customManager}
                onChange={(e) => setCustomManager(e.target.value)}
                placeholder="Enter manager name..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Goal Percentage: <span className="text-primary-600 font-bold">{goalPct}%</span>
            </label>
            <input
              type="range" min={0} max={100} step={5} value={goalPct}
              onChange={(e) => setGoalPct(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
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

function InlineGoalEditor({ manager, currentGoal, onSave }: { manager: string; currentGoal: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentGoal));
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(String(currentGoal));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0 && n <= 100 && n !== currentGoal) {
      onSave(n);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min={0} max={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-16 text-center text-sm border border-primary-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center justify-center gap-1 text-gray-700 hover:text-primary-600 transition-colors"
      title="Click to edit goal"
    >
      <span className="font-semibold">{currentGoal}%</span>
      <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-primary-400 transition-opacity" />
    </button>
  );
}

export default function ManagersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'PROJECT_MANAGER';
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedManager, setSelectedManager] = useState<ManagerStat | null>(null);

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
      showToast('success', 'Goal updated!');
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
  const managerNames = (statsData?.data || []).map((s: ManagerStat) => s.manager);

  const allStats: ManagerStat[] = statsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Managers & Goals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track manager performance and set completion goals</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> Add Manager Goal
          </button>
        )}
      </div>

      {isManager && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span><strong>Manager View</strong> — Showing your project tracker (<strong>{user?.name}</strong>).</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Managers', value: allStats.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'On Target', value: allStats.filter((s) => s.achievedPct >= s.goalPct).length, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Below Target', value: allStats.filter((s) => s.achievedPct < s.goalPct).length, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Goals Set', value: goals.length, icon: Target, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((item) => (
          <Card key={item.label} className="text-center py-4">
            <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}>
              <item.icon size={20} className={item.color} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{item.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
          </Card>
        ))}
      </div>

      {/* Manager Tracker Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FolderKanban size={16} className="text-primary-600" /> Manager Project Tracker
          </h2>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              <Plus size={12} /> Add Goal
            </button>
          )}
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
              <thead className="bg-blue-50/60">
                <tr>
                  {[
                    { label: 'Manager', align: 'text-left' },
                    { label: 'Total', align: 'text-center' },
                    { label: 'Active', align: 'text-center' },
                    { label: 'On Hold', align: 'text-center' },
                    { label: 'Completed', align: 'text-center' },
                    { label: 'Delayed', align: 'text-center' },
                    { label: 'Goal (%)', align: 'text-center' },
                    { label: 'Achieved (%)', align: 'text-center' },
                    { label: 'Variance (%)', align: 'text-center' },
                    { label: 'Metrics', align: 'text-center' },
                    { label: 'View', align: 'text-center' },
                  ].map((h) => (
                    <th key={h.label} className={`py-2.5 px-3 font-medium text-gray-500 text-xs ${h.align}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((m) => {
                  const variance = m.achievedPct - m.goalPct;
                  const inactivePct = m.total > 0 ? Math.round(((m.inactive || 0) / m.total) * 100) : 0;
                  const allocationOk = m.total >= 15;
                  const inactiveOk = inactivePct <= 5;
                  const achievementOk = m.achievedPct >= 25;
                  return (
                    <tr key={m.manager} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                            {m.manager.charAt(0).toUpperCase()}
                          </div>
                          <Link href={`/projects?projectManager=${encodeURIComponent(m.manager)}`} className="font-medium text-gray-800 hover:text-primary-600 hover:underline">
                            {m.manager}
                          </Link>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <Link href={`/projects?projectManager=${encodeURIComponent(m.manager)}`} className="font-semibold text-gray-700 hover:text-primary-600">
                          {m.total}
                        </Link>
                      </td>
                      <td className="text-center py-3 px-3">
                        <Link href={`/projects?projectManager=${encodeURIComponent(m.manager)}&status=ACTIVE`}>
                          <span className="inline-flex items-center gap-1 min-w-[28px] h-5 px-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold hover:bg-green-200 cursor-pointer">
                            <PlayCircle size={10} />{m.active}
                          </span>
                        </Link>
                      </td>
                      <td className="text-center py-3 px-3">
                        <Link href={`/projects?projectManager=${encodeURIComponent(m.manager)}&status=ON_HOLD`}>
                          <span className="inline-flex items-center gap-1 min-w-[28px] h-5 px-1.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold hover:bg-yellow-200 cursor-pointer">
                            <PauseCircle size={10} />{m.inactive || 0}
                          </span>
                        </Link>
                      </td>
                      <td className="text-center py-3 px-3">
                        <Link href={`/projects?projectManager=${encodeURIComponent(m.manager)}&status=COMPLETED`}>
                          <span className="inline-flex items-center gap-1 min-w-[28px] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 cursor-pointer">
                            <CheckCircle size={10} />{m.completed}
                          </span>
                        </Link>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold ${m.delayed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                          {m.delayed}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        {isAdmin ? (
                          <InlineGoalEditor
                            manager={m.manager}
                            currentGoal={m.goalPct}
                            onSave={(v) => upsertMutation.mutate({ managerName: m.manager, goalPct: v })}
                          />
                        ) : (
                          <span className="font-semibold text-gray-700">{m.goalPct}%</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${m.achievedPct >= m.goalPct ? 'bg-green-500' : 'bg-primary-500'}`}
                              style={{ width: `${Math.min(m.achievedPct, 100)}%` }}
                            />
                          </div>
                          <span className="font-semibold text-gray-900 text-xs">{m.achievedPct}%</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`inline-flex items-center gap-0.5 font-semibold text-xs px-2 py-0.5 rounded-full ${variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {variance >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {variance >= 0 ? '+' : ''}{variance}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <div className="flex flex-col gap-1 items-center">
                          <span title={`Allocation: ${m.total}/15 projects`} className={`text-xs px-1.5 py-0.5 rounded font-medium ${allocationOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {allocationOk ? '✓' : '✗'} {m.total}/15
                          </span>
                          <span title={`Inactive rate: ${inactivePct}% (target ≤5%)`} className={`text-xs px-1.5 py-0.5 rounded font-medium ${inactiveOk ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {inactiveOk ? '✓' : '✗'} {inactivePct}% on hold
                          </span>
                          <span title={`Achievement: ${m.achievedPct}% (target ≥25%)`} className={`text-xs px-1.5 py-0.5 rounded font-medium ${achievementOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {achievementOk ? '✓' : '✗'} {m.achievedPct}% achvd
                          </span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <button
                          onClick={() => setSelectedManager(m)}
                          title="Full view"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Custom Goals List — admin only */}
      {isAdmin && goals.length > 0 && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target size={16} className="text-primary-600" /> Custom Goal Settings
          </h2>
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700">
                    {g.managerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-800">{g.managerName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary-600">{g.goalPct}% goal</span>
                  <button
                    onClick={() => deleteMutation.mutate(g.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 text-gray-400 transition-colors"
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

      {/* Manager Full View slide-over */}
      {selectedManager && (
        <ManagerFullView stat={selectedManager} onClose={() => setSelectedManager(null)} />
      )}

      {/* Gartner Review Analytics */}
      <GartnerSection isAdmin={isAdmin} />

      {showAddModal && isAdmin && (
        <AddGoalModal
          managers={managerNames}
          onClose={() => setShowAddModal(false)}
          onSave={(managerName, goalPct) => upsertMutation.mutate({ managerName, goalPct })}
        />
      )}
    </div>
  );
}

// ─── Manager Full View ───────────────────────────────────────────────────────

function ManagerFullView({ stat, onClose }: { stat: ManagerStat; onClose: () => void }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['managerProjects', stat.manager],
    queryFn: () => api.get(`/projects?projectManager=${encodeURIComponent(stat.manager)}&limit=200`).then((r) => r.data),
  });

  const projects: any[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (q && !p.name?.toLowerCase().includes(q) && !p.customerName?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, statusFilter, search]);

  const variance = stat.achievedPct - stat.goalPct;

  const statusGroups = useMemo(() => ({
    ACTIVE: projects.filter((p) => p.status === 'ACTIVE').length,
    ON_HOLD: projects.filter((p) => p.status === 'ON_HOLD').length,
    COMPLETED: projects.filter((p) => p.status === 'COMPLETED').length,
    DELAYED: projects.filter((p) => p.delayStatus === 'DELAYED').length,
    ESCALATED: projects.filter((p) => p.isEscalated).length,
    OVERAGED: projects.filter((p) => p.isOveraged).length,
  }), [projects]);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />
      {/* Panel */}
      <div
        className="w-full max-w-3xl bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold">
              {stat.manager.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{stat.manager}</h2>
              <p className="text-xs text-primary-200">Project Manager · {stat.total} total projects</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active', value: statusGroups.ACTIVE, color: 'text-green-700', bg: 'bg-green-50', icon: PlayCircle },
              { label: 'On Hold', value: statusGroups.ON_HOLD, color: 'text-yellow-700', bg: 'bg-yellow-50', icon: PauseCircle },
              { label: 'Completed', value: statusGroups.COMPLETED, color: 'text-blue-700', bg: 'bg-blue-50', icon: CheckCircle },
              { label: 'Delayed', value: statusGroups.DELAYED, color: 'text-red-700', bg: 'bg-red-50', icon: Clock },
              { label: 'Escalated', value: statusGroups.ESCALATED, color: 'text-purple-700', bg: 'bg-purple-50', icon: AlertCircle },
              { label: 'Overaged', value: statusGroups.OVERAGED, color: 'text-orange-700', bg: 'bg-orange-50', icon: Calendar },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} rounded-xl p-3 flex items-center gap-3`}>
                <c.icon size={18} className={c.color} />
                <div>
                  <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-xs text-gray-500">{c.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Goal / Achieved / Variance row */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-1">Goal</p>
              <p className="text-xl font-bold text-primary-600">{stat.goalPct}%</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-1">Achieved</p>
              <div className="flex flex-col items-center gap-1">
                <p className={`text-xl font-bold ${stat.achievedPct >= stat.goalPct ? 'text-green-600' : 'text-red-600'}`}>{stat.achievedPct}%</p>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${stat.achievedPct >= stat.goalPct ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${Math.min(stat.achievedPct, 100)}%` }} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-1">Variance</p>
              <span className={`inline-flex items-center gap-1 text-xl font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {variance >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {variance >= 0 ? '+' : ''}{variance}%
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none"
          >
            <option value="">All Status</option>
            {['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'CLOSED'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <Link
            href={`/projects?projectManager=${encodeURIComponent(stat.manager)}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
            onClick={onClose}
          >
            All Projects <ChevronRight size={12} />
          </Link>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No projects found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p: any) => {
                const statusColors: Record<string, string> = {
                  ACTIVE: 'bg-green-100 text-green-700',
                  ON_HOLD: 'bg-yellow-100 text-yellow-700',
                  COMPLETED: 'bg-blue-100 text-blue-700',
                  CANCELLED: 'bg-gray-100 text-gray-500',
                  CLOSED: 'bg-gray-100 text-gray-500',
                };
                return (
                  <div key={p.id} className="flex items-start justify-between p-3 rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium text-sm text-gray-900 hover:text-primary-600 hover:underline truncate"
                          onClick={onClose}
                        >
                          {p.name}
                        </Link>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-500'}`}>
                          {p.status?.replace('_', ' ')}
                        </span>
                        {p.isEscalated && <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Escalated</span>}
                        {p.isOveraged && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Overaged</span>}
                        {p.delayStatus === 'DELAYED' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Delayed</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        {p.customerName && <span>{p.customerName}</span>}
                        {p.phase && <span className="capitalize">{p.phase?.toLowerCase()}</span>}
                        {p.migrationTypes && <span>{p.migrationTypes}</span>}
                        {p.plannedEnd && (
                          <span>End: {new Date(p.plannedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/projects/${p.id}`}
                      onClick={onClose}
                      className="ml-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 bg-primary-50 text-primary-600 hover:bg-primary-100 transition-all flex-shrink-0"
                    >
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-400">
          <span>Showing {filtered.length} of {projects.length} projects</span>
          <Link
            href={`/projects?projectManager=${encodeURIComponent(stat.manager)}`}
            onClick={onClose}
            className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            View in Projects Table <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Gartner Review Analytics ────────────────────────────────────────────────

interface GartnerStat {
  managerName: string;
  projectsClosed: number;
  gartnerReviews: number;
  reviewRate: number;
}

function rateColor(rate: number) {
  if (rate >= 15) return '#1D9E75';
  if (rate >= 5) return '#BA7517';
  return '#E24B4A';
}

function rateBadgeCls(rate: number) {
  if (rate >= 15) return 'bg-green-100 text-green-700';
  if (rate >= 5) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function GartnerSection({ isAdmin }: { isAdmin: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: GartnerStat[] }>({
    queryKey: ['gartnerStats'],
    queryFn: () => api.get('/manager-goals/gartner-stats').then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ managerName, projectsClosed, gartnerReviews }: { managerName: string; projectsClosed: number; gartnerReviews: number }) =>
      api.put(`/manager-goals/gartner-stats/${encodeURIComponent(managerName)}`, { projects_closed: projectsClosed, gartner_reviews: gartnerReviews }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gartnerStats'] });
      showToast('success', 'Stats updated');
      setEditingRow(null);
    },
    onError: () => showToast('error', 'Failed to update stats'),
  });

  const stats: GartnerStat[] = data?.data || [];

  // Inline edit state
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editClosed, setEditClosed] = useState(0);
  const [editReviews, setEditReviews] = useState(0);

  function startEdit(s: GartnerStat) {
    setEditingRow(s.managerName);
    setEditClosed(s.projectsClosed);
    setEditReviews(s.gartnerReviews);
  }

  function cancelEdit() { setEditingRow(null); }

  function saveEdit(managerName: string) {
    updateMutation.mutate({ managerName, projectsClosed: editClosed, gartnerReviews: editReviews });
  }

  // Summary totals
  const totalClosed = useMemo(() => stats.reduce((s, r) => s + r.projectsClosed, 0), [stats]);
  const totalReviews = useMemo(() => stats.reduce((s, r) => s + r.gartnerReviews, 0), [stats]);
  const overallRate = totalClosed > 0 ? parseFloat(((totalReviews / totalClosed) * 100).toFixed(1)) : 0;

  // Chart data — inline editable preview
  const chartData = useMemo(() => stats.map((s) => ({
    name: s.managerName.split(' ')[0], // first name for brevity
    fullName: s.managerName,
    closed: editingRow === s.managerName ? editClosed : s.projectsClosed,
    reviews: editingRow === s.managerName ? editReviews : s.gartnerReviews,
    rate: editingRow === s.managerName
      ? (editClosed > 0 ? parseFloat(((editReviews / editClosed) * 100).toFixed(1)) : 0)
      : s.reviewRate,
  })), [stats, editingRow, editClosed, editReviews]);

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <BarChart2 size={16} className="text-primary-600" /> Gartner Review Analytics
        </h2>
        <span className="text-xs text-gray-400">Period: Oct 2024 onwards</span>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Projects Closed (Since Oct)', value: totalClosed, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Gartner Reviews', value: totalReviews, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Overall Review Rate', value: `${overallRate}%`, color: rateColor(overallRate), bg: 'bg-gray-50', raw: true },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl p-4 ${c.bg} flex flex-col items-center`}>
            <p className={`text-2xl font-bold ${c.raw ? '' : c.color}`} style={c.raw ? { color: c.color } : {}}>
              {c.value}
            </p>
            <p className="text-xs text-gray-500 mt-1 text-center">{c.label}</p>
          </div>
        ))}
      </div>

      {stats.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">No manager data yet.</div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Grouped bar: Closed vs Reviews */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Projects Closed vs Gartner Reviews</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [value, name === 'closed' ? 'Projects Closed' : 'Gartner Reviews']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend formatter={(v) => v === 'closed' ? 'Projects Closed' : 'Gartner Reviews'} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="closed" fill="#378ADD" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="reviews" fill="#1D9E75" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Rate bar chart */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Review Rate % by Manager</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Review Rate']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={rateColor(entry.rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center">
                {[{ color: '#1D9E75', label: '≥15% (Good)' }, { color: '#BA7517', label: '5–14% (Amber)' }, { color: '#E24B4A', label: '<5% (Low)' }].map((l) => (
                  <span key={l.label} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: l.color }} />{l.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Editable table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/60">
                <tr>
                  {['Manager', 'Projects Closed (Since Oct)', 'Gartner Reviews', 'Review Rate %', 'Rate Bar', ...(isAdmin ? ['Action'] : [])].map((h) => (
                    <th key={h} className={`py-2.5 px-4 text-xs font-semibold text-gray-500 ${h === 'Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const isEditing = editingRow === s.managerName;
                  const liveRate = isEditing
                    ? (editClosed > 0 ? parseFloat(((editReviews / editClosed) * 100).toFixed(1)) : 0)
                    : s.reviewRate;
                  return (
                    <tr key={s.managerName} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                            {s.managerName.charAt(0).toUpperCase()}
                          </div>
                          {s.managerName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isEditing ? (
                          <input
                            type="number" min={0} value={editClosed}
                            onChange={(e) => setEditClosed(parseInt(e.target.value) || 0)}
                            className="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                        ) : (
                          <span className="font-semibold text-blue-700">{s.projectsClosed}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isEditing ? (
                          <input
                            type="number" min={0} value={editReviews}
                            onChange={(e) => setEditReviews(parseInt(e.target.value) || 0)}
                            className="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                          />
                        ) : (
                          <span className="font-semibold text-green-700">{s.gartnerReviews}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${rateBadgeCls(liveRate)}`}>
                          {liveRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(liveRate, 100)}%`, background: rateColor(liveRate) }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-9 text-right">{liveRate}%</span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => saveEdit(s.managerName)}
                                disabled={updateMutation.isPending}
                                title="Save"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                              >
                                {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              </button>
                              <button
                                onClick={cancelEdit}
                                title="Cancel"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(s)}
                              title="Edit stats"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-blue-500 hover:bg-blue-100 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
