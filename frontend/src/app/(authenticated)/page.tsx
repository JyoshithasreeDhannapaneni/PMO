'use client';

import { useState, useRef, useEffect } from 'react';
import { useDashboard, useWeeklyReport, useManagerStats, useProjectsByMigrationType, useUpsertManagerGoal, useOveragedProjects, useEscalatedProjects } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Loader2, FolderKanban, PlayCircle, CheckCircle, PauseCircle,
  AlertTriangle, AlertCircle, Clock, Activity, BarChart3, FileText,
  RefreshCw, ChevronRight, Plus, User, Users, Calendar, Target,
  Zap, TrendingUp, X, Download, CalendarDays, UserCheck, MinusCircle,
  MessageSquare, Send, TrendingDown, Bell, Mail, Settings, Filter,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

type ViewMode = 'my' | 'overall';

/* ── AI Chat ─────────────────────────────────────────────────────── */
const QUICK_REPLIES = [
  'How many projects are there?',
  'Show delayed projects',
  'Show cancelled projects',
  'Which projects were added this week?',
  'Project combinations',
  'Help',
];

interface ChatDashboardData {
  stats: any;
  projectsByStatus: any[];
  delaySummary: any;
  migrationTypeStats: any;
  recentActivity: any[];
  upcomingDeadlines: any[];
}

function buildBotReply(text: string, data?: ChatDashboardData): string {
  if (!data) return "Loading project data… please try again in a moment.";
  const lower = text.toLowerCase();
  const { stats, delaySummary, migrationTypeStats } = data;

  if (lower.includes('help')) {
    return `I can answer questions about:\n• Total / active / completed projects\n• Delayed or at-risk projects\n• Cancelled / decommissioned projects\n• Newly added projects this week\n• Migration type combinations (Email, Content, Messaging)\n• Portfolio health\n\nJust ask!`;
  }
  if (lower.includes('how many') || (lower.includes('total') && lower.includes('project'))) {
    return `There are currently **${stats.totalProjects}** projects in total:\n• ${stats.activeProjects} Active\n• ${stats.completedProjects} Completed\n• ${stats.onHoldProjects} On Hold\n• ${stats.delayedProjects} Delayed`;
  }
  if (lower.includes('delay') || lower.includes('overdue')) {
    const top = delaySummary?.topDelayed?.slice(0, 5) || [];
    if (top.length === 0) return `No delayed projects right now — all ${stats.activeProjects} active projects are on track!`;
    const list = top.map((p: any) => `• ${p.name} (+${p.delayDays}d) — ${p.customerName}`).join('\n');
    return `**${stats.delayedProjects} delayed project${stats.delayedProjects !== 1 ? 's' : ''}** found:\n${list}`;
  }
  if (lower.includes('cancel')) {
    return `There are currently projects with CANCELLED status. Check the Projects page filtered by status=CANCELLED for the full list. Total cancelled: included in ${stats.totalProjects} total.`;
  }
  if (lower.includes('decommission')) {
    return `Decommissioned projects appear as CANCELLED or COMPLETED in the system. Go to Projects → filter by Status to see the full breakdown.`;
  }
  if (lower.includes('added') || lower.includes('new') || lower.includes('this week')) {
    return `To see projects added this week, open the **Weekly Report** (button in the header) → "Newly Added" tab. It shows projects created in the last 7 days with manager and migration type details.`;
  }
  if (lower.includes('combination') || lower.includes('combo')) {
    const types = migrationTypeStats?.byType?.filter((s: any) => s.total > 0) || [];
    if (types.length === 0) return `No migration type data available yet.`;
    const list = types.map((t: any) => `• ${t.type}: ${t.total} projects (${t.active} active, ${t.completed} done)`).join('\n');
    return `**Migration type breakdown:**\n${list}\n\nClick any type on the dashboard to see individual projects.`;
  }
  if (lower.includes('health') || lower.includes('portfolio')) {
    const health = stats.totalProjects > 0 ? Math.round(((stats.totalProjects - stats.delayedProjects - stats.atRiskProjects) / stats.totalProjects) * 100) : 100;
    return `**Portfolio Health: ${health}%**\n• ${stats.atRiskProjects} at risk\n• ${stats.delayedProjects} delayed\n• ${stats.activeProjects} on track\n\nCompletion rate: ${stats.totalProjects > 0 ? Math.round((stats.completedProjects / stats.totalProjects) * 100) : 0}%`;
  }
  if (lower.includes('manager') || lower.includes('who')) {
    return `Go to the **Manager Goals & Variance** table on the dashboard to see per-manager stats. The dashboard shows completion rates and variance for each manager.`;
  }
  if (lower.includes('email') || lower.includes('content') || lower.includes('messaging')) {
    const type = lower.includes('email') ? 'EMAIL' : lower.includes('content') ? 'CONTENT' : 'MESSAGING';
    const stat = migrationTypeStats?.byType?.find((s: any) => s.type === type);
    if (!stat) return `No ${type.toLowerCase()} migration projects found.`;
    return `**${type} migrations:** ${stat.total} projects\n• ${stat.active} Active\n• ${stat.completed} Completed\n• ${stat.delayed} Delayed\n• ${stat.overaged} Overaged\n\nClick the ${type.toLowerCase()} card on the dashboard to see individual projects.`;
  }
  return `I found **${stats.totalProjects} projects** in your portfolio. Try asking:\n• "Show delayed projects"\n• "How many projects are active?"\n• "Project combinations"\n• "Portfolio health"`;
}

function AiChatPanel({ onClose, userName, dashData }: { onClose: () => void; userName: string; dashData?: ChatDashboardData }) {
  const [messages, setMessages] = useState([
    { from: 'bot', text: `Hi ${userName}! I have live access to your project data. Ask me anything about your projects, delays, migrations, or weekly activity.` },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const reply = buildBotReply(text, dashData);
    setMessages((p) => [...p, { from: 'user', text }, { from: 'bot', text: reply }]);
    setInput('');
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden" style={{ maxHeight: 500 }}>
      <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} />
          <span className="text-sm font-semibold">AI Chat Assistant</span>
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">Live Data</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-primary-700 transition-colors"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs whitespace-pre-line ${m.from === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
              {m.text.replace(/\*\*(.*?)\*\*/g, '$1')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {QUICK_REPLIES.map((q) => (
          <button key={q} onClick={() => sendMessage(q)} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-700 transition-colors">
            {q}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
          placeholder="Ask about your projects..."
          className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button onClick={() => sendMessage(input)} className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

/* ── Portfolio Status Donut ─────────────────────────────────────── */
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const R = 40, cx = 50, cy = 50, stroke = 14;
  const circumference = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const rot = -90 + (offset / total) * 360;
          offset += seg.value;
          return (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={seg.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={(-circumference * (-90 - rot + 90)) / 360}
              style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px' }} />
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-xs font-bold fill-gray-700 dark:fill-gray-200" fontSize={12}>
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-gray-600 dark:text-gray-400 flex-1">{seg.label}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">{seg.value}</span>
            <span className="text-gray-400">({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bar Chart ──────────────────────────────────────────────────── */
function BarChart({ bars }: { bars: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-3 h-28">
      {bars.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{b.value}</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: `${(b.value / max) * 80}px`, background: b.color, minHeight: b.value > 0 ? 8 : 0 }} />
          <span className="text-xs text-gray-500 dark:text-gray-400 text-center leading-tight">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Escalate Control (inline priority picker + button) ─────────── */
function EscalateControl({ projectId, isEscalated, defaultPriority, busy, onEscalate, onDeescalate }: {
  projectId: string; isEscalated: boolean; defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  busy: boolean; onEscalate: (p: 'LOW'|'MEDIUM'|'HIGH') => Promise<void>; onDeescalate: () => Promise<void>;
}) {
  const [priority, setPriority] = useState<'LOW'|'MEDIUM'|'HIGH'>(defaultPriority);
  if (isEscalated) return null; // already escalated rows handled differently
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <select
        value={priority}
        onChange={e => setPriority(e.target.value as any)}
        disabled={busy}
        onClick={e => e.stopPropagation()}
        className="text-xs px-1.5 py-1 border border-gray-200 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer"
      >
        <option value="LOW">🟢 Low</option>
        <option value="MEDIUM">🟡 Medium</option>
        <option value="HIGH">🔴 High</option>
      </select>
      <button
        disabled={busy}
        onClick={e => { e.stopPropagation(); onEscalate(priority); }}
        className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
      >
        {busy ? <Loader2 size={11} className="animate-spin"/> : <AlertTriangle size={11}/>} Escalate
      </button>
    </div>
  );
}

/* ── Migration Type Projects Modal ──────────────────────────────── */
function MigrationTypeModal({ type, onClose }: { type: string; onClose: () => void }) {
  const { data, isLoading } = useProjectsByMigrationType(type);
  const { settings } = useSettings();
  const projects: any[] = data?.data || [];
  const settingType = settings.migrationTypes.find(t => t.code.toUpperCase() === type.toUpperCase());
  const bgPalette = ['bg-blue-600','bg-green-600','bg-purple-600','bg-orange-500','bg-pink-600'];
  const idx = settings.migrationTypes.findIndex(t => t.code.toUpperCase() === type.toUpperCase());
  const bg = bgPalette[idx >= 0 ? idx % bgPalette.length : 0];
  const emoji = settingType?.icon || '📦';
  const label = settingType?.name || (type.charAt(0) + type.slice(1).toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between p-5 ${bg} text-white`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <div>
              <h2 className="text-lg font-bold">{label} Projects</h2>
              <p className="text-xs opacity-80">{projects.length} project{projects.length !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 transition-colors"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {type.toLowerCase()} projects found</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {['Project Name', 'Manager', 'Status', 'Phase', 'Delay'].map((h) => (
                      <th key={h} className={`py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p: any) => (
                    <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => { window.location.href = `/projects/${p.id}`; onClose(); }}>
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{p.name}</td>
                      <td className="text-center py-2.5 px-3 text-gray-600 dark:text-gray-400 text-xs">{p.projectManager}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400">{p.phase}</td>
                      <td className="text-center py-2.5 px-3">
                        {p.delayDays > 0 ? (
                          <span className="text-xs font-semibold text-red-600">+{p.delayDays}d</span>
                        ) : (
                          <span className="text-xs text-green-600">On Track</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <Link href={`/projects?planType=${type}`} onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
            <Filter size={13} /> View in Projects Page <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Add Manager Goal Modal ─────────────────────────────────────── */
function AddManagerGoalModal({ managers, onClose }: { managers: string[]; onClose: () => void }) {
  const { showToast } = useToast();
  const upsertGoal = useUpsertManagerGoal();
  const [managerName, setManagerName] = useState('');
  const [customManager, setCustomManager] = useState('');
  const [goalPct, setGoalPct] = useState(80);

  const finalManager = managerName === '__custom__' ? customManager : managerName;

  const handleSave = async () => {
    if (!finalManager) return;
    try {
      await upsertGoal.mutateAsync({ managerName: finalManager, goalPct });
      showToast('success', 'Manager goal saved!', `Goal set to ${goalPct}% for ${finalManager}`);
      onClose();
    } catch {
      showToast('error', 'Failed to save manager goal');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Target size={18} className="text-primary-600" /> Add Manager Goal
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={17} className="text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manager</label>
            <select value={managerName} onChange={(e) => setManagerName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Select a manager...</option>
              {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">+ Enter custom name</option>
            </select>
          </div>
          {managerName === '__custom__' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manager Name</label>
              <input type="text" value={customManager} onChange={(e) => setCustomManager(e.target.value)}
                placeholder="Enter manager name..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Goal Percentage: <span className="text-primary-600 font-bold">{goalPct}%</span>
            </label>
            <input type="range" min={0} max={100} step={5} value={goalPct} onChange={(e) => setGoalPct(Number(e.target.value))} className="w-full accent-primary-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0%</span><span>50%</span><span>100%</span></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!finalManager || upsertGoal.isPending}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50">
              {upsertGoal.isPending ? 'Saving...' : 'Save Goal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ─────────────────────────────────────────────── */
function downloadProjectsCSV(projects: any[], filename: string) {
  const headers = [
    'Project Name', 'Customer', 'Project Manager', 'Account Manager', 'Status', 'Phase',
    'Plan Type', 'Migration Types', 'Source Platform', 'Target Platform',
    'SOW Start Date', 'SOW End Date', 'Kickoff Start Date', 'Project End Date',
    'Delay Status', 'Delay Days', 'Days Overdue',
    'Budget ($)', 'Actual Cost ($)', 'Overage Amount ($)',
    'Number of Servers', 'Project Memory', 'Is Overaged', 'Is Escalated',
    'Escalation Priority', 'Description', 'Notes', 'Created At',
  ];
  const rows = projects.map((p) => [
    p.name, p.customerName, p.projectManager, p.accountManager || '',
    p.status, p.phase, p.planType || '', p.migrationTypes || '',
    p.sourcePlatform || '', p.targetPlatform || '',
    p.plannedStart ? new Date(p.plannedStart).toLocaleDateString() : '',
    p.plannedEnd ? new Date(p.plannedEnd).toLocaleDateString() : '',
    p.actualStart ? new Date(p.actualStart).toLocaleDateString() : '',
    p.actualEnd ? new Date(p.actualEnd).toLocaleDateString() : '',
    p.delayStatus || '', p.delayDays ?? '', p.daysOverdue ?? '',
    p.estimatedCost ?? '', p.actualCost ?? '', p.overageAmount ?? '',
    p.numberOfServers ?? '', p.projectMemory || '',
    p.isOveraged ? 'Yes' : 'No', p.isEscalated ? 'Yes' : 'No',
    p.escalationPriority || '', p.description || '', p.notes || '',
    p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const dash = settings.dashboardSettings;
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  // ADMIN defaults to overall; MANAGER/others default to my
  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? 'overall' : 'my');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [weeklyTab, setWeeklyTab] = useState<'summary' | 'added' | 'closed' | 'changes'>('summary');
  const [showChat, setShowChat] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedMigrationType, setSelectedMigrationType] = useState<string | null>(null);
  const [showOveragedPanel, setShowOveragedPanel] = useState(false);
  const [showEscalatedPanel, setShowEscalatedPanel] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [showManagerGoalModal, setShowManagerGoalModal] = useState(false);
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const { showToast } = useToast();

  // MANAGER 'my': filter to their own projects
  // MANAGER 'overall': no filter — show full portfolio health across all managers
  // ADMIN 'my': filter to their own; ADMIN 'overall': no filter
  const managerFilter = viewMode === 'my' ? (user?.name ?? '') : undefined;
  const { data, isLoading, error, refetch } = useDashboard(managerFilter);
  const { data: weeklyData, isLoading: weeklyLoading, error: weeklyError } = useWeeklyReport(
    managerFilter,
    reportStartDate || undefined,
    reportEndDate || undefined,
  );
  const { data: managerData } = useManagerStats(managerFilter);
  const { data: overagedData, refetch: refetchOveraged } = useOveragedProjects(managerFilter);
  const { data: escalatedData, refetch: refetchEscalated } = useEscalatedProjects(managerFilter);
  const overagedProjects: any[] = overagedData?.data || [];
  const escalatedProjects: any[] = escalatedData?.data || [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchOveraged(), refetchEscalated()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Check URL params for auto-open
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('chatbot') === 'open') setShowChat(true);
      if (params.get('report') === 'weekly') setShowWeeklyReport(true);
    }
  }, []);

  if (isLoading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard…</p>
      </div>
    </div>
  );

  if (error || !data?.data) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Failed to load dashboard</h2>
        <p className="mt-2 text-gray-500">Please check if the backend server is running</p>
        <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Try Again</button>
      </div>
    </div>
  );

  const { stats, projectsByStatus, projectsByPhase, recentActivity, delaySummary, upcomingDeadlines, migrationTypeStats } = data.data;
  const healthScore = stats.totalProjects > 0 ? Math.round(((stats.totalProjects - stats.delayedProjects - stats.atRiskProjects) / stats.totalProjects) * 100) : 100;
  const completionRate = stats.totalProjects > 0 ? Math.round((stats.completedProjects / stats.totalProjects) * 100) : 0;
  const healthLabel = healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Needs Attention';
  const managers: any[] = managerData?.data || [];

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PMO Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Welcome back, {user?.name || 'Administrator'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle — all roles */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 gap-1">
            <button onClick={() => setViewMode('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'my' ? 'bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
              <User size={13} />
              My View
            </button>
            <button onClick={() => setViewMode('overall')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'overall' ? 'bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
              <Users size={13} />
              {isManager ? 'Overview' : 'Overall View'}
            </button>
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            viewMode === 'my'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : isManager
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          }`}>
            {viewMode === 'my' ? <User size={10} /> : <Users size={10} />}
            {viewMode === 'my'
              ? 'My projects only'
              : isManager
                ? 'My overview'
                : 'All managers'}
          </span>
          <span className="text-xs text-gray-400 hidden md:block">Updated {format(new Date(), 'MMM d · h:mm a')}</span>
          <button onClick={handleRefresh} className={`p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
            <RefreshCw size={15} className="text-gray-500" />
          </button>
          <button onClick={() => { setShowWeeklyReport(true); setWeeklyTab('summary'); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
            <FileText size={14} className="text-primary-600" /> Weekly Report
          </button>
          <Link href="/projects/new" className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors">
            <Plus size={14} /> New Project
          </Link>
        </div>
      </div>

      {/* Context banner */}
      {isManager ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <User size={14} className="flex-shrink-0" />
          <span>
            {viewMode === 'my'
              ? <><strong>My View</strong> — Showing projects assigned to <strong>{user?.name}</strong>.</>
              : <><strong>Overview</strong> — Showing full portfolio health across all managers.</>
            }
            {' '}Projects you create are automatically assigned to you.
          </span>
        </div>
      ) : viewMode === 'my' ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <User size={14} className="flex-shrink-0" />
          <span><strong>My View</strong> — Showing projects assigned to <strong>{user?.name}</strong>.
            <button onClick={() => setViewMode('overall')} className="ml-2 underline hover:no-underline">Switch to Overall View →</button>
          </span>
        </div>
      ) : null}

      {/* ── KPI Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/projects" className="col-span-2 lg:col-span-1 block group">
          <Card className="bg-gradient-to-br from-primary-600 to-primary-700 text-white border-0 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-primary-100 text-sm font-medium">Portfolio Health</p>
                <p className="text-4xl font-bold mt-1">{healthScore}%</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${healthScore >= 70 ? 'bg-yellow-400/30 text-yellow-100' : 'bg-red-400/30 text-red-100'}`}>{healthLabel}</span>
              </div>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <Activity size={28} className="text-white" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/projects" className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Projects</p>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalProjects}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-green-600 text-xs font-medium">{stats.activeProjects} active</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-blue-600 text-xs font-medium">{stats.completedProjects} done</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center">
                <FolderKanban size={22} className="text-blue-600" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/projects?status=COMPLETED" className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-500 text-sm font-medium">Completion Rate</p>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">{completionRate}%</p>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mt-2">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/40 flex items-center justify-center ml-3">
                <Target size={22} className="text-green-600" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/projects?delayStatus=DELAYED" className="block group">
          <Card className={`h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/20' : 'border-green-200 bg-green-50 dark:bg-green-900/20'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'}`}>Risk Status</p>
                <p className={`text-4xl font-bold mt-1 ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{stats.delayedProjects + stats.atRiskProjects}</p>
                <p className="text-xs mt-1 text-red-500">{stats.atRiskProjects} at risk • {stats.delayedProjects} delayed</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'}`}>
                <AlertTriangle size={22} className={stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'} />
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* ── Quick Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link href="/projects?sortBy=createdAt&sortOrder=desc" className="block group">
          <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mx-auto mb-2">
              <Plus size={18} className="text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{migrationTypeStats?.totals?.newProjects ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">New (30d)</p>
          </Card>
        </Link>

        <button type="button" onClick={() => setShowOveragedPanel(true)}
          className="block w-full text-left group focus:outline-none">
          <Card className="text-center py-3 h-full group-hover:shadow-lg group-hover:border-orange-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center mx-auto mb-2">
              <Clock size={18} className="text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-orange-600">{overagedProjects.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Overaged</p>
            <p className="text-[10px] text-orange-500 font-medium mt-1">View Overaged →</p>
          </Card>
        </button>

        <button type="button" onClick={() => setShowEscalatedPanel(true)}
          className="block w-full text-left group focus:outline-none">
          <Card className="text-center py-3 h-full group-hover:shadow-lg group-hover:border-red-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">{escalatedProjects.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Escalated</p>
            <p className="text-[10px] text-red-500 font-medium mt-1">View Escalated →</p>
          </Card>
        </button>

        <Link href="/case-studies" className="block group">
          <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mx-auto mb-2">
              <FileText size={18} className="text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingCaseStudies}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pending Cases</p>
          </Card>
        </Link>

        <Link href="/projects?delayStatus=DELAYED" className="block group">
          <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-2">
              <TrendingUp size={18} className="text-gray-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.avgDelayDays}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Avg Delay (d)</p>
          </Card>
        </Link>
      </div>

      {/* ── Overaged Projects Panel ──────────────────────────────────── */}
      {showOveragedPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowOveragedPanel(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-orange-500 text-white">
              <div className="flex items-center gap-2">
                <Clock size={20} />
                <div>
                  <h2 className="text-base font-bold">Overaged Projects</h2>
                  <p className="text-xs opacity-80">{overagedProjects.length} projects past their due date — click a row to open, or escalate directly</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadProjectsCSV(overagedProjects, 'overaged-projects.csv')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                  <Download size={13}/> Download All
                </button>
                <button onClick={() => setShowOveragedPanel(false)} className="p-1.5 rounded-lg hover:bg-white/20"><X size={16}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {overagedProjects.length === 0 ? (
                <div className="text-center py-16 text-gray-400"><CheckCircle size={40} className="mx-auto mb-3 text-green-400"/><p className="font-medium">No overaged projects 🎉</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      {['Project Name','Manager','Due Date','Days Overdue','Status','Escalate','Download'].map(h => (
                        <th key={h} className={`py-2.5 px-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide ${h==='Project Name'?'text-left':'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overagedProjects.map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/10 group">
                        {/* Project name — click to navigate */}
                        <td className="py-3 px-3">
                          <Link href={`/projects/${p.id}`} onClick={() => setShowOveragedPanel(false)}
                            className="font-semibold text-gray-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 flex items-center gap-1.5 group-hover:underline">
                            {p.name}
                            <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-orange-500 transition-opacity"/>
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5">{p.customerName}</p>
                        </td>
                        <td className="text-center py-3 px-3 text-gray-600 dark:text-gray-400 text-xs">{p.projectManager}</td>
                        <td className="text-center py-3 px-3 text-gray-500 text-xs">{new Date(p.plannedEnd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                        <td className="text-center py-3 px-3">
                          <span className={`font-bold text-sm ${p.daysOverdue >= 14 ? 'text-red-600' : 'text-orange-600'}`}>{p.daysOverdue}d</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Overaged</span>
                        </td>
                        {/* Escalate action with inline priority selector */}
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          <EscalateControl
                            projectId={p.id}
                            isEscalated={false}
                            defaultPriority={p.daysOverdue >= 14 ? 'HIGH' : p.daysOverdue >= 7 ? 'MEDIUM' : 'LOW'}
                            busy={escalatingId === p.id}
                            onEscalate={async (priority) => {
                              setEscalatingId(p.id);
                              const token = localStorage.getItem('token');
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ priority }),
                              });
                              setEscalatingId(null);
                              await Promise.all([refetchOveraged(), refetchEscalated()]);
                            }}
                            onDeescalate={async () => {}}
                          />
                        </td>
                        <td className="text-center py-3 px-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadProjectsCSV([p], `${p.name.replace(/[^a-z0-9]/gi,'_')}.csv`); }}
                            className="text-xs text-orange-600 hover:text-orange-800 border border-orange-200 hover:border-orange-400 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 mx-auto"
                            title="Download project data"
                          >
                            <Download size={11}/> CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-400">Click project name to open · Set priority and escalate in one click</p>
              <Link href="/projects" onClick={() => setShowOveragedPanel(false)} className="text-xs text-orange-600 font-semibold hover:underline">View All Projects →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Escalated Projects Panel ─────────────────────────────────── */}
      {showEscalatedPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowEscalatedPanel(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-red-600 text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} />
                <div>
                  <h2 className="text-base font-bold">Escalated Projects</h2>
                  <p className="text-xs opacity-80">{escalatedProjects.length} projects requiring immediate attention — change priority or remove escalation inline</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadProjectsCSV(escalatedProjects, 'escalated-projects.csv')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                  <Download size={13}/> Download All
                </button>
                <button onClick={() => setShowEscalatedPanel(false)} className="p-1.5 rounded-lg hover:bg-white/20"><X size={16}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {escalatedProjects.length === 0 ? (
                <div className="text-center py-16 text-gray-400"><CheckCircle size={40} className="mx-auto mb-3 text-green-400"/><p className="font-medium">No escalated projects 🎉</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      {['Project Name','Manager','Days Delayed','Change Priority','Status','Action','Download'].map(h => (
                        <th key={h} className={`py-2.5 px-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide ${h==='Project Name'?'text-left':'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {escalatedProjects.map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/10 group">
                        {/* Project name — click to navigate */}
                        <td className="py-3 px-3">
                          <Link href={`/projects/${p.id}`} onClick={() => setShowEscalatedPanel(false)}
                            className="font-semibold text-gray-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 group-hover:underline">
                            {p.name}
                            <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"/>
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5">{p.customerName}</p>
                        </td>
                        <td className="text-center py-3 px-3 text-gray-600 dark:text-gray-400 text-xs">{p.projectManager}</td>
                        <td className="text-center py-3 px-3">
                          <span className={`font-bold text-sm ${p.delayDays >= 14 ? 'text-red-600' : 'text-orange-500'}`}>{p.delayDays}d</span>
                        </td>
                        {/* Inline priority change */}
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          <select
                            defaultValue={p.escalationPriority || 'MEDIUM'}
                            disabled={escalatingId === p.id}
                            onChange={async (e) => {
                              const priority = e.target.value as 'LOW' | 'MEDIUM' | 'HIGH';
                              setEscalatingId(p.id);
                              const token = localStorage.getItem('token');
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ priority }),
                              });
                              setEscalatingId(null);
                              refetchEscalated();
                            }}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-300 ${
                              p.escalationPriority==='HIGH' ? 'bg-red-50 border-red-200 text-red-700' :
                              p.escalationPriority==='MEDIUM' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                              'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                          >
                            <option value="LOW">🟢 Low</option>
                            <option value="MEDIUM">🟡 Medium</option>
                            <option value="HIGH">🔴 High</option>
                          </select>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.isEscalated ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {p.isEscalated ? 'Escalated' : 'Delayed'}
                          </span>
                        </td>
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          {p.isEscalated ? (
                            <button
                              disabled={escalatingId === p.id}
                              onClick={async () => {
                                setEscalatingId(p.id);
                                const token = localStorage.getItem('token');
                                await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/deescalate/${p.id}`, {
                                  method: 'POST', headers: { Authorization: `Bearer ${token}` },
                                });
                                setEscalatingId(null);
                                refetchEscalated();
                              }}
                              className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 hover:border-gray-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 mx-auto"
                            >
                              {escalatingId === p.id ? <Loader2 size={11} className="animate-spin"/> : <X size={11}/>} Remove
                            </button>
                          ) : (
                            <button
                              disabled={escalatingId === p.id}
                              onClick={async () => {
                                setEscalatingId(p.id);
                                const token = localStorage.getItem('token');
                                const priority = p.delayDays >= 14 ? 'HIGH' : p.delayDays >= 7 ? 'MEDIUM' : 'LOW';
                                await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ priority }),
                                });
                                setEscalatingId(null);
                                refetchEscalated();
                              }}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 mx-auto"
                            >
                              {escalatingId === p.id ? <Loader2 size={11} className="animate-spin"/> : <AlertTriangle size={11}/>} Escalate
                            </button>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadProjectsCSV([p], `${p.name.replace(/[^a-z0-9]/gi,'_')}.csv`); }}
                            className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 mx-auto"
                            title="Download project data"
                          >
                            <Download size={11}/> CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-400">Click project name to open · Change priority inline · Escalate or remove directly</p>
              <Link href="/projects?delayStatus=DELAYED" onClick={() => setShowEscalatedPanel(false)} className="text-xs text-red-600 font-semibold hover:underline">View All Delayed Projects →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Main 3-column grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT: Migration + Charts */}
        <div className="lg:col-span-2 space-y-5">

          {/* Migration Type Overview */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Migration Type Overview</h2>
              <Link href="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">View All <ChevronRight size={14} /></Link>
            </div>
            {migrationTypeStats?.byType?.filter((s: any) => s.total > 0).length ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {migrationTypeStats.byType.filter((s: any) => s.total > 0).map((stat: any, idx: number) => {
                    // Resolve icon + color from settings migration types; fall back by position
                    const settingType = settings.migrationTypes.find(
                      (t) => t.code.toUpperCase() === stat.type || t.name.toUpperCase().includes(stat.type)
                    );
                    const palettes = [
                      { cardCls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', textCls: 'text-blue-700 dark:text-blue-300' },
                      { cardCls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', textCls: 'text-green-700 dark:text-green-300' },
                      { cardCls: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800', textCls: 'text-purple-700 dark:text-purple-300' },
                      { cardCls: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', textCls: 'text-orange-700 dark:text-orange-300' },
                      { cardCls: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800', textCls: 'text-pink-700 dark:text-pink-300' },
                    ];
                    const palette = palettes[idx % palettes.length];
                    const emoji = settingType?.icon || '📦';
                    const label = settingType?.name || stat.name || stat.type.charAt(0) + stat.type.slice(1).toLowerCase();
                    return (
                      <button key={stat.type} onClick={() => setSelectedMigrationType(stat.type)} className={`p-4 rounded-xl border ${palette.cardCls} block hover:opacity-90 transition-opacity text-left w-full cursor-pointer`}>
                        <div className="flex items-center gap-2 mb-2"><span className="text-xl">{emoji}</span><span className={`text-sm font-semibold ${palette.textCls}`}>{label}</span></div>
                        <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.total}</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{stat.active} Active</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />{stat.completed} Done</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />{stat.overaged} Overaged</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{stat.delayed} Delayed</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        {['Type', 'Total', 'Active', 'Completed', 'On Hold', 'At Risk'].map((h) => (
                          <th key={h} className={`py-2 px-3 font-medium text-gray-500 dark:text-gray-400 ${h === 'Type' ? 'text-left' : 'text-center'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {migrationTypeStats.byType.filter((s: any) => s.total > 0).map((stat: any) => {
                        const st = settings.migrationTypes.find(t => t.code.toUpperCase() === stat.type);
                        const displayName = st?.name || stat.name || stat.type;
                        return (
                        <tr key={stat.type} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelectedMigrationType(stat.type)}>
                          <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">{st?.icon || '📦'} {displayName}</td>
                          <td className="text-center py-2 px-3 font-bold">{stat.total}</td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">{stat.active}</span></td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">{stat.completed}</span></td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">{stat.inactive}</span></td>
                          <td className="text-center py-2 px-3"><span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full text-xs font-semibold ${stat.atRisk > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>{stat.atRisk}</span></td>
                        </tr>
                        );
                      })}
                      <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 font-semibold">
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">TOTAL</td>
                        <td className="text-center py-2 px-3">{migrationTypeStats.totals.total}</td>
                        <td className="text-center py-2 px-3 text-green-700">{migrationTypeStats.totals.active}</td>
                        <td className="text-center py-2 px-3 text-blue-700">{migrationTypeStats.totals.completed}</td>
                        <td className="text-center py-2 px-3 text-yellow-700">{migrationTypeStats.totals.inactive}</td>
                        <td className="text-center py-2 px-3 text-red-700">{migrationTypeStats.totals.atRisk}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">{viewMode === 'my' ? 'No projects assigned to you yet.' : 'No migration data available.'}</p>
              </div>
            )}
          </Card>

          {/* Portfolio Status + Projects by Phase */}
          {dash.showCharts && (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Portfolio Status</h3>
                  <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">View Details <ChevronRight size={12} /></Link>
                </div>
                <DonutChart segments={[
                  { label: 'On Track', value: stats.activeProjects - stats.atRiskProjects, color: '#22c55e' },
                  { label: 'At Risk', value: stats.atRiskProjects, color: '#f97316' },
                  { label: 'Delayed', value: stats.delayedProjects, color: '#ef4444' },
                ].filter((s) => s.value > 0)} />
              </Card>
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Projects by Phase</h3>
                  <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">View Details <ChevronRight size={12} /></Link>
                </div>
                <BarChart bars={(projectsByPhase as any[] || []).filter((p) => p.count > 0).map((p: any) => {
                  const colors: Record<string, string> = { KICKOFF: '#a855f7', MIGRATION: '#3b82f6', VALIDATION: '#eab308', CLOSURE: '#22c55e', COMPLETED: '#10b981', PLANNING: '#6366f1', 'IN PROGRESS': '#3b82f6', TESTING: '#f97316' };
                  return { label: p.phase?.charAt(0) + p.phase?.slice(1).toLowerCase(), value: p.count, color: colors[p.phase] || '#6b7280' };
                })} />
              </Card>
            </div>
          )}

          {/* Projects by Status */}
          {dash.showCharts && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Projects by Status</h3>
              <div className="space-y-3">
                {[
                  { label: 'Active', value: stats.activeProjects, iconColor: 'text-green-600', barColor: 'bg-green-500', icon: PlayCircle },
                  { label: 'Completed', value: stats.completedProjects, iconColor: 'text-blue-600', barColor: 'bg-blue-500', icon: CheckCircle },
                  { label: 'On Hold', value: stats.onHoldProjects, iconColor: 'text-yellow-600', barColor: 'bg-yellow-500', icon: PauseCircle },
                  { label: 'Delayed', value: stats.delayedProjects, iconColor: 'text-red-600', barColor: 'bg-red-500', icon: AlertCircle },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 w-24">
                      <item.icon size={14} className={item.iconColor} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div className={`${item.barColor} h-2 rounded-full transition-all`} style={{ width: `${stats.totalProjects > 0 ? (item.value / stats.totalProjects) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white w-6 text-right">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Manager Goals & Variance */}
          {managers.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Users size={16} className="text-primary-600" /> Manager Goals &amp; Variance
                </h3>
                {isAdmin && (
                  <button onClick={() => setShowManagerGoalModal(true)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">+ Add Manager Goal <ChevronRight size={12} /></button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      {['Project Manager', 'Gantt Review Progress', 'Closed Projects'].map((h) => (
                        <th key={h} className={`py-2 px-3 font-medium text-gray-500 dark:text-gray-400 ${h === 'Project Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m: any) => (
                      <tr key={m.manager} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 flex-shrink-0">
                              {m.manager.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-800 dark:text-gray-200">{m.manager}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="flex-1 max-w-[120px] bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                              <div className="bg-primary-500 h-2.5 rounded-full transition-all" style={{ width: `${m.achievedPct}%` }} />
                            </div>
                            <span className="font-semibold text-gray-900 dark:text-white text-xs w-10 text-right">{m.achievedPct}%</span>
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-3">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                            {m.completed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: Sidebar widgets */}
        <div className="space-y-4">

          {/* Weekly Report Widget */}
          <Card className="border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Weekly Report</h3>
              <button onClick={() => { setShowWeeklyReport(true); setWeeklyTab('summary'); }} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
                View All <ChevronRight size={12} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1">
              <CalendarDays size={11} />
              {weeklyData?.data ? `${format(new Date(weeklyData.data.weekRange.start), 'MMM d')} – ${format(new Date(weeklyData.data.weekRange.end), 'MMM d, yyyy')}` : 'Last 7 days'}
            </p>
            <div className="space-y-2">
              {[
                { label: 'Newly Added', value: weeklyData?.data?.summary.newlyAdded ?? '—', icon: Plus, color: 'text-green-600' },
                { label: 'Closed / Decommissioned', value: weeklyData?.data?.summary.closedDecommissioned ?? '—', icon: MinusCircle, color: 'text-red-500' },
                { label: 'Changes by Managers', value: weeklyData?.data?.summary.changesByManagers ?? '—', icon: UserCheck, color: 'text-blue-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <item.icon size={13} className={item.color} /> {item.label}
                  </div>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowWeeklyReport(true); setWeeklyTab('summary'); }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors">
              <FileText size={12} /> View Report
            </button>
          </Card>

          {/* Upcoming Deadlines */}
          {dash.showUpcomingDeadlines && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Deadlines</h3>
                <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">View All <ChevronRight size={12} /></Link>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {upcomingDeadlines?.length > 0 ? upcomingDeadlines.slice(0, 5).map((project: any) => (
                  <Link key={project.id} href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate flex-1 pr-2">{project.name}</p>
                    <span className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded ${new Date(project.deadline) < new Date(Date.now() + 3 * 86400000) ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {format(new Date(project.deadline), 'MMM d')}
                    </span>
                  </Link>
                )) : (
                  <div className="text-center py-5 text-gray-400">
                    <Calendar size={24} className="mx-auto mb-1 opacity-40" />
                    <p className="text-xs">No upcoming deadlines</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Delayed Projects */}
          {dash.showDelayedProjects && (
            <Card className={delaySummary?.topDelayed?.length > 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : ''}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delayed Projects</h3>
                {delaySummary?.topDelayed?.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Action Required</span>
                )}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {delaySummary?.topDelayed?.length > 0 ? delaySummary.topDelayed.map((project: any) => (
                  <Link key={project.id} href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 hover:border-red-400 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{project.name}</p>
                      <p className="text-xs text-gray-500 truncate">{project.customerName}</p>
                    </div>
                    <span className="text-sm font-bold text-red-600 ml-2">+{project.delayDays}d</span>
                  </Link>
                )) : (
                  <div className="text-center py-4 text-green-600">
                    <CheckCircle size={24} className="mx-auto mb-1" />
                    <p className="text-xs font-medium">All projects on track!</p>
                  </div>
                )}
              </div>
              {delaySummary?.topDelayed?.length > 0 && (
                <Link href="/projects?delayStatus=DELAYED" className="mt-2 text-xs text-red-600 font-medium flex items-center justify-end gap-0.5 hover:underline">
                  View All Delayed <ChevronRight size={12} />
                </Link>
              )}
            </Card>
          )}

          {/* Notifications widget */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Bell size={14} className="text-primary-600" /> Notifications
              </h3>
              <Link href="/notifications" className="text-xs text-primary-600 hover:text-primary-700 font-medium">Mark all as read</Link>
            </div>
            <div className="space-y-2">
              {recentActivity?.length > 0 ? recentActivity.slice(0, 4).map((activity: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${i === 0 ? 'bg-green-100 dark:bg-green-900/40' : i === 1 ? 'bg-orange-100 dark:bg-orange-900/40' : i === 2 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                    {i === 0 ? <Plus size={10} className="text-green-600" /> : i === 1 ? <AlertTriangle size={10} className="text-orange-500" /> : i === 2 ? <Mail size={10} className="text-red-500" /> : <Zap size={10} className="text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{activity.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-4 text-gray-400">
                  <Bell size={24} className="mx-auto mb-1 opacity-30" />
                  <p className="text-xs">No recent notifications</p>
                </div>
              )}
            </div>
            <Link href="/notifications" className="mt-3 text-xs text-primary-600 font-medium flex items-center justify-center gap-0.5 hover:underline">
              View all notifications <ChevronRight size={12} />
            </Link>
          </Card>

          {/* Quick Actions */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/projects/new" className="flex items-center gap-2 p-2.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-100 transition-colors">
                <Plus size={14} /><span className="text-xs font-medium">New Project</span>
              </Link>
              <Link href="/projects" className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <FolderKanban size={14} /><span className="text-xs font-medium">All Projects</span>
              </Link>
              <Link href="/case-studies" className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <FileText size={14} /><span className="text-xs font-medium">Case Studies</span>
              </Link>
              <Link href="/settings?tab=notifications" className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <Mail size={14} /><span className="text-xs font-medium">SMTP Settings</span>
              </Link>
              <button onClick={() => setShowChat(true)} className="col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 transition-colors">
                <MessageSquare size={14} /><span className="text-xs font-medium">Open AI Chat Assistant</span>
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Weekly Report Modal ────────────────────────────────────── */}
      {showWeeklyReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowWeeklyReport(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Weekly Report</h2>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <CalendarDays size={11} />
                  {weeklyData?.data ? `${format(new Date(weeklyData.data.weekRange.start), 'MMM d, yyyy')} – ${format(new Date(weeklyData.data.weekRange.end), 'MMM d, yyyy')}` : 'Last 7 days'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1">
                  <Calendar size={12} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="text-xs bg-transparent text-gray-700 dark:text-gray-300 outline-none w-28"
                    title="Start date"
                  />
                  <span className="text-gray-300 text-xs">–</span>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="text-xs bg-transparent text-gray-700 dark:text-gray-300 outline-none w-28"
                    title="End date"
                  />
                  {(reportStartDate || reportEndDate) && (
                    <button onClick={() => { setReportStartDate(''); setReportEndDate(''); }} className="text-gray-400 hover:text-gray-600 ml-1" title="Reset to last 7 days">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <button onClick={() => setShowWeeklyReport(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={17} className="text-gray-500" /></button>
              </div>
            </div>

            {weeklyLoading && (
              <div className="flex-1 flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            )}
            {!weeklyLoading && (weeklyError || !weeklyData?.data) && (
              <div className="flex-1 flex items-center justify-center py-16 text-center px-6">
                <div>
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Could not load weekly report</p>
                  <p className="mt-1 text-xs text-gray-400">Make sure the backend is running and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/api/dashboard/weekly-report</code> is available.</p>
                </div>
              </div>
            )}
            {!weeklyLoading && weeklyData?.data && (() => {
              const wr = weeklyData.data;
              return (
                <>
                  <div className="flex border-b border-gray-200 dark:border-gray-700 px-5 gap-1 overflow-x-auto">
                    {[
                      { id: 'summary', label: 'Summary' },
                      { id: 'added', label: `Newly Added (${wr.summary.newlyAdded})` },
                      { id: 'closed', label: `Closed / Decommissioned (${wr.summary.closedDecommissioned})` },
                      { id: 'changes', label: `Changes by Managers (${wr.summary.changesByManagers})` },
                    ].map((tab) => (
                      <button key={tab.id} onClick={() => setWeeklyTab(tab.id as any)}
                        className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${weeklyTab === tab.id ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    {weeklyTab === 'summary' && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Newly Added', value: wr.summary.newlyAdded, vs: wr.summary.newlyAddedVsLastWeek, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200', icon: Plus },
                            { label: 'Closed / Decommissioned', value: wr.summary.closedDecommissioned, vs: wr.summary.closedVsLastWeek, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200', icon: MinusCircle },
                            { label: 'Changes by Managers', value: wr.summary.changesByManagers, vs: wr.summary.changesVsLastWeek, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200', icon: UserCheck },
                          ].map((item) => (
                            <div key={item.label} className={`p-4 rounded-xl border ${item.border} ${item.bg}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{item.label}</span>
                                <item.icon size={14} className={item.color} />
                              </div>
                              <p className={`text-3xl font-bold ${item.color}`}>{item.value}</p>
                              <p className="text-xs text-gray-500 mt-1">{item.vs >= 0 ? `+${item.vs}` : item.vs} vs last week</p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Details Overview</h4>
                            <div className="space-y-2.5">
                              {[
                                { icon: FolderKanban, label: 'Total Projects Impacted', value: wr.summary.totalProjectsImpacted },
                                { icon: Users, label: 'Managers Involved', value: wr.summary.managersInvolved },
                                { icon: Activity, label: 'Applications Modified', value: wr.summary.applicationsModified },
                              ].map((item) => (
                                <div key={item.label} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"><item.icon size={13} className="text-gray-400" />{item.label}</div>
                                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Change Types</h4>
                            {wr.changeTypes.length > 0 ? (
                              <div className="space-y-2">
                                {wr.changeTypes.map((ct: any, i: number) => {
                                  const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500'];
                                  const total = wr.changeTypes.reduce((s: number, c: any) => s + c.count, 0);
                                  return (
                                    <div key={ct.label} className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[i % colors.length]}`} />
                                      <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{ct.label}</span>
                                      <span className="text-xs font-semibold">{ct.count}</span>
                                      <div className="w-14 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                        <div className={`${colors[i % colors.length]} h-1.5 rounded-full`} style={{ width: `${total > 0 ? (ct.count / total) * 100 : 0}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : <p className="text-xs text-gray-400 text-center py-4">No changes this week</p>}
                          </div>
                        </div>
                      </div>
                    )}
                    {weeklyTab === 'added' && (
                      <div className="space-y-2">
                        {wr.newlyAddedProjects.length > 0 ? wr.newlyAddedProjects.map((p: any) => (
                          <Link key={p.id} href={`/projects/${p.id}`} onClick={() => setShowWeeklyReport(false)}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all">
                            <div><p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p><p className="text-xs text-gray-500">{p.customerName} · {p.projectManager}</p></div>
                            <span className="text-xs text-gray-400">{format(new Date(p.createdAt), 'MMM d')}</span>
                          </Link>
                        )) : <div className="text-center py-10 text-gray-400"><Plus size={30} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No projects added this week</p></div>}
                      </div>
                    )}
                    {weeklyTab === 'closed' && (
                      <div className="space-y-2">
                        {wr.closedProjects.length > 0 ? wr.closedProjects.map((p: any) => (
                          <Link key={p.id} href={`/projects/${p.id}`} onClick={() => setShowWeeklyReport(false)}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                            <div><p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p><p className="text-xs text-gray-500">{p.customerName} · {p.projectManager}</p></div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{p.status === 'COMPLETED' ? 'Closed' : 'Decommissioned'}</span>
                          </Link>
                        )) : <div className="text-center py-10 text-gray-400"><CheckCircle size={30} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No projects closed this week</p></div>}
                      </div>
                    )}
                    {weeklyTab === 'changes' && (
                      <div className="space-y-4">
                        {wr.changesByManager.length > 0 && (
                          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Changes by Manager</h4>
                            <div className="space-y-2">
                              {wr.changesByManager.map((cm: any) => (
                                <div key={cm.manager} className="flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">{cm.manager.charAt(0).toUpperCase()}</div>
                                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{cm.manager}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-20 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                      <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${wr.summary.changesByManagers > 0 ? (cm.count / wr.summary.changesByManagers) * 100 : 0}%` }} />
                                    </div>
                                    <span className="text-xs font-semibold w-4 text-right">{cm.count}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {wr.changedProjects.length > 0 ? wr.changedProjects.map((p: any) => (
                            <Link key={p.id} href={`/projects/${p.id}`} onClick={() => setShowWeeklyReport(false)}
                              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                              <div><p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p><p className="text-xs text-gray-500">{p.customerName} · {p.projectManager}</p></div>
                              <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</span>
                            </Link>
                          )) : <div className="text-center py-10 text-gray-400"><Activity size={30} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No manager changes this week</p></div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <div className="relative">
                      <button
                        onClick={() => setShowDownloadMenu((v) => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
                        <Download size={13} /> Download Report <ChevronRight size={12} className={`transition-transform ${showDownloadMenu ? 'rotate-90' : ''}`} />
                      </button>
                      {showDownloadMenu && (
                        <div className="absolute bottom-full right-0 mb-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10">
                          {[
                            { label: 'Download PDF', fmt: 'pdf' },
                            { label: 'Download Excel', fmt: 'excel' },
                            { label: 'Download PPT', fmt: 'ppt' },
                            { label: 'Download CSV', fmt: 'csv' },
                          ].map(({ label, fmt }) => (
                            <button key={fmt} onClick={async () => {
                              setShowDownloadMenu(false);
                              if (!weeklyData?.data) return;
                              const wr = weeklyData.data;
                              const dateRange = `${format(new Date(wr.weekRange.start), 'MMM d')} – ${format(new Date(wr.weekRange.end), 'MMM d, yyyy')}`;
                              const rows = [
                                ['Section', 'Project Name', 'Customer', 'Manager', 'Migration Type', 'Status', 'Date'],
                                ...wr.newlyAddedProjects.map((p: any) => ['Newly Added', p.name, p.customerName || '', p.projectManager, p.migrationTypes || '', 'ACTIVE', p.createdAt?.split('T')[0] || '']),
                                ...wr.closedProjects.map((p: any) => ['Closed/Decommissioned', p.name, p.customerName || '', p.projectManager, p.migrationTypes || '', p.status, p.updatedAt?.split('T')[0] || '']),
                                ...wr.changedProjects.map((p: any) => ['Changed by Manager', p.name, p.customerName || '', p.projectManager, p.migrationTypes || '', 'ACTIVE', p.updatedAt?.split('T')[0] || '']),
                              ];
                              const filename = `weekly-report-${new Date().toISOString().split('T')[0]}`;

                              if (fmt === 'csv') {
                                const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url);
                                showToast('success', 'CSV downloaded!');
                              } else if (fmt === 'excel') {
                                const tableHtml = `<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;font-size:12px}th{background:#1e40af;color:white}</style></head><body><h2 style="font-family:Arial">Weekly Report — ${dateRange}</h2><table><thead><tr>${rows[0].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
                                const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a'); a.href = url; a.download = `${filename}.xls`; a.click(); URL.revokeObjectURL(url);
                                showToast('success', 'Excel downloaded!');
                              } else if (fmt === 'pdf') {
                                const { jsPDF } = await import('jspdf');
                                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                                doc.setFontSize(16); doc.setTextColor(30, 64, 175);
                                doc.text('Weekly Report', 14, 15);
                                doc.setFontSize(10); doc.setTextColor(100);
                                doc.text(dateRange, 14, 22);
                                doc.setFontSize(9); doc.setTextColor(50);
                                const summary = [
                                  `Newly Added: ${wr.summary.newlyAdded}   Closed/Decommissioned: ${wr.summary.closedDecommissioned}   Changes by Managers: ${wr.summary.changesByManagers}`,
                                  `Total Projects Impacted: ${wr.summary.totalProjectsImpacted}   Managers Involved: ${wr.summary.managersInvolved}`,
                                ];
                                doc.text(summary, 14, 30);
                                let y = 42;
                                const colWidths = [40, 50, 30, 30, 30, 25, 28];
                                const headers = rows[0];
                                doc.setFillColor(30, 64, 175); doc.setTextColor(255);
                                doc.rect(14, y, 263, 7, 'F');
                                headers.forEach((h, i) => doc.text(h, 15 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 5));
                                y += 9;
                                doc.setTextColor(50); doc.setFontSize(8);
                                rows.slice(1).forEach((row, ri) => {
                                  if (y > 190) { doc.addPage(); y = 15; }
                                  if (ri % 2 === 0) { doc.setFillColor(240, 245, 255); doc.rect(14, y - 1, 263, 7, 'F'); }
                                  row.forEach((cell, i) => {
                                    const x = 15 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                                    doc.text(String(cell).substring(0, 22), x, y + 4.5);
                                  });
                                  y += 7;
                                });
                                doc.save(`${filename}.pdf`);
                                showToast('success', 'PDF downloaded!');
                              } else if (fmt === 'ppt') {
                                // Browser-native PPT: HTML presentation saved as .ppt (opens in PowerPoint)
                                const makeSlide = (title: string, body: string) => `
                                  <div style="page-break-after:always;width:960px;height:540px;background:#fff;padding:40px 56px;box-sizing:border-box;font-family:Arial,sans-serif;border:1px solid #e5e7eb;margin-bottom:20px">
                                    <h2 style="color:#1e40af;font-size:26px;margin:0 0 20px">${title}</h2>
                                    <div style="font-size:13px;color:#374151">${body}</div>
                                  </div>`;
                                const summaryBody = `
                                  <table style="border-collapse:collapse;width:100%">
                                    <tr style="background:#1e40af;color:#fff"><th style="padding:8px 12px;text-align:left">Metric</th><th style="padding:8px 12px;text-align:center">Count</th></tr>
                                    ${[
                                      ['Newly Added', wr.summary.newlyAdded],
                                      ['Closed / Decommissioned', wr.summary.closedDecommissioned],
                                      ['Changes by Managers', wr.summary.changesByManagers],
                                      ['Total Projects Impacted', wr.summary.totalProjectsImpacted],
                                      ['Managers Involved', wr.summary.managersInvolved],
                                    ].map(([k, v], i) => `<tr style="background:${i % 2 === 0 ? '#f0f5ff' : '#fff'}"><td style="padding:7px 12px;border-bottom:1px solid #e5e7eb">${k}</td><td style="padding:7px 12px;text-align:center;font-weight:bold;border-bottom:1px solid #e5e7eb">${v}</td></tr>`).join('')}
                                  </table>`;
                                const detailsBody = rows.length > 1 ? `
                                  <table style="border-collapse:collapse;width:100%;font-size:11px">
                                    ${rows.map((row, ri) => `<tr style="background:${ri === 0 ? '#1e40af' : ri % 2 === 0 ? '#f0f5ff' : '#fff'}">${row.map(cell => `<td style="padding:5px 8px;border:1px solid #e5e7eb;color:${ri === 0 ? '#fff' : '#374151'};font-weight:${ri === 0 ? 'bold' : 'normal'}">${cell}</td>`).join('')}</tr>`).join('')}
                                  </table>` : '<p style="color:#9ca3af">No project data</p>';
                                const html = `<html><head><meta charset="UTF-8"><style>body{margin:20px;background:#f9fafb}@media print{body{margin:0}}</style></head><body>
                                  ${makeSlide('Weekly Report — ' + dateRange, `<p style="font-size:16px;color:#6b7280">PMO Weekly Summary Report</p><p style="font-size:14px;margin-top:12px">Period: <strong>${dateRange}</strong></p>`)}
                                  ${makeSlide('Summary', summaryBody)}
                                  ${makeSlide('Project Details', detailsBody)}
                                </body></html>`;
                                const blob = new Blob([html], { type: 'application/vnd.ms-powerpoint' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a'); a.href = url; a.download = `${filename}.ppt`; a.click(); URL.revokeObjectURL(url);
                                showToast('success', 'PPT downloaded!', 'Open in PowerPoint or Google Slides');
                              }
                            }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                              <Download size={13} className="text-primary-600" /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Migration Type Modal ───────────────────────────────────── */}
      {selectedMigrationType && (
        <MigrationTypeModal type={selectedMigrationType} onClose={() => setSelectedMigrationType(null)} />
      )}

      {/* ── Add Manager Goal Modal (admin only) ───────────────────── */}
      {showManagerGoalModal && isAdmin && (
        <AddManagerGoalModal
          managers={managers.map((m: any) => m.manager)}
          onClose={() => setShowManagerGoalModal(false)}
        />
      )}

      {/* ── AI Chat Assistant ───────────────────────────────────────── */}
      {showChat && (
        <AiChatPanel
          onClose={() => setShowChat(false)}
          userName={user?.name || 'Administrator'}
          dashData={data?.data ? {
            stats: data.data.stats,
            projectsByStatus: data.data.projectsByStatus as any[],
            delaySummary: data.data.delaySummary,
            migrationTypeStats: data.data.migrationTypeStats,
            recentActivity: data.data.recentActivity as any[],
            upcomingDeadlines: data.data.upcomingDeadlines as any[],
          } : undefined}
        />
      )}

      {/* Floating Chat Button (when chat closed) */}
      {!showChat && (
        <button onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-all hover:scale-110 flex items-center justify-center"
          title="Open AI Chat Assistant">
          <MessageSquare size={20} />
        </button>
      )}
    </div>
  );
}
