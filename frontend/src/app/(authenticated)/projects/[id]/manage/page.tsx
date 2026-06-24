'use client';

import { useState, useEffect } from 'react';
import { useProject } from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import {
  Loader2, ArrowLeft, AlertTriangle, Users, FileText,
  BarChart3, GitPullRequest, Plus, Edit2, Trash2, Check,
  X, Clock, Shield, ChevronDown, ChevronRight, Pencil
} from 'lucide-react';
import Link from 'next/link';

interface ProjectManagePageProps {
  params: { id: string };
}

type TabType = 'risks' | 'team' | 'documents' | 'reports' | 'changes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProjectManagePage({ params }: ProjectManagePageProps) {
  const { data, isLoading, error } = useProject(params.id);
  const { showToast } = useToast();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const [activeTab, setActiveTab] = useState<TabType>('risks');
  
  // Data states
  const [risks, setRisks] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const tabs = [
    { id: 'risks', label: 'Risks', icon: AlertTriangle, count: risks.length },
    { id: 'team', label: 'Team', icon: Users, count: team.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { id: 'reports', label: 'Status Reports', icon: BarChart3, count: reports.length },
    { id: 'changes', label: 'Change Requests', icon: GitPullRequest, count: changeRequests.length },
  ];

  useEffect(() => {
    if (params.id) {
      loadTabData(activeTab);
    }
  }, [params.id, activeTab]);

  const loadTabData = async (tab: TabType) => {
    setLoadingData(true);
    try {
      let endpoint = '';
      switch (tab) {
        case 'risks':
          endpoint = `/api/risks/project/${params.id}`;
          break;
        case 'team':
          endpoint = `/api/team/project/${params.id}`;
          break;
        case 'documents':
          endpoint = `/api/documents/project/${params.id}`;
          break;
        case 'reports':
          endpoint = `/api/reports/project/${params.id}`;
          break;
        case 'changes':
          endpoint = `/api/change-requests/project/${params.id}`;
          break;
      }
      
      const res = await fetch(`${API_URL}${endpoint}`, { headers: authHeaders });
      const json = await res.json();

      if (json.success) {
        switch (tab) {
          case 'risks': setRisks(json.data); break;
          case 'team': setTeam(json.data); break;
          case 'documents': setDocuments(json.data); break;
          case 'reports': setReports(json.data); break;
          case 'changes': setChangeRequests(json.data); break;
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast('error', 'Failed to load data', 'Could not fetch tab data. Please try again.');
    }
    setLoadingData(false);
  };

  const handleDelete = async (tab: TabType, id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    let endpoint = '';
    switch (tab) {
      case 'risks': endpoint = `/api/risks/${id}`; break;
      case 'team': endpoint = `/api/team/${id}`; break;
      case 'documents': endpoint = `/api/documents/${id}`; break;
      case 'reports': endpoint = `/api/reports/${id}`; break;
      case 'changes': endpoint = `/api/change-requests/${id}`; break;
    }
    
    try {
      await fetch(`${API_URL}${endpoint}`, { method: 'DELETE', headers: authHeaders });
      loadTabData(tab);
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('error', 'Delete failed', 'Could not delete this item. Please try again.');
    }
  };

  const generateWeeklyReport = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reports/project/${params.id}/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ createdBy: 'System' }),
      });
      if (res.ok) {
        loadTabData('reports');
        showToast('success', 'Report generated');
      } else {
        showToast('error', 'Failed to generate report', 'Please try again.');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
      showToast('error', 'Failed to generate report', 'Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load project</p>
        <Link href="/projects">
          <Button variant="outline"><ArrowLeft size={16} className="mr-2" />Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const project = data.data;

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/projects/${params.id}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft size={16} className="mr-1" />
            Back to Project Details
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500">{project.customerName} - Project Management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={18} />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {loadingData ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            {activeTab === 'risks' && (
              <RisksTab 
                risks={risks} 
                projectId={params.id} 
                onRefresh={() => loadTabData('risks')}
                onDelete={(id) => handleDelete('risks', id)}
              />
            )}
            {activeTab === 'team' && (
              <TeamTab 
                team={team} 
                projectId={params.id}
                onRefresh={() => loadTabData('team')}
                onDelete={(id) => handleDelete('team', id)}
              />
            )}
            {activeTab === 'documents' && (
              <DocumentsTab 
                documents={documents} 
                projectId={params.id}
                onRefresh={() => loadTabData('documents')}
                onDelete={(id) => handleDelete('documents', id)}
              />
            )}
            {activeTab === 'reports' && (
              <ReportsTab 
                reports={reports}
                onGenerate={generateWeeklyReport}
                onDelete={(id) => handleDelete('reports', id)}
              />
            )}
            {activeTab === 'changes' && (
              <ChangeRequestsTab 
                changeRequests={changeRequests}
                projectId={params.id}
                onRefresh={() => loadTabData('changes')}
                onDelete={(id) => handleDelete('changes', id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Risks Tab Component
function RisksTab({ risks, projectId, onRefresh, onDelete }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', category: 'TECHNICAL', probability: 'MEDIUM', 
    impact: 'MEDIUM', mitigation: '', owner: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API_URL}/api/risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, projectId }),
      });
      setShowForm(false);
      setFormData({ title: '', description: '', category: 'TECHNICAL', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: '', owner: '' });
      onRefresh();
    } catch (err) {
      console.error('Failed to create risk:', err);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-red-100 text-red-800';
      case 'MITIGATING': return 'bg-yellow-100 text-yellow-800';
      case 'RESOLVED': return 'bg-green-100 text-green-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Risk Register</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Add Risk
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="TECHNICAL">Technical</option>
                  <option value="SCHEDULE">Schedule</option>
                  <option value="RESOURCE">Resource</option>
                  <option value="BUDGET">Budget</option>
                  <option value="SCOPE">Scope</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Probability</label>
                <select
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                <select
                  value={formData.impact}
                  onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mitigation Plan</label>
              <textarea
                value={formData.mitigation}
                onChange={(e) => setFormData({ ...formData, mitigation: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save Risk</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {risks.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No risks identified yet</p>
          <p className="text-sm">Add risks to track potential issues</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {risks.map((risk: any) => (
            <Card key={risk.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900">{risk.title}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(risk.status)}`}>
                      {risk.status}
                    </span>
                  </div>
                  {risk.description && <p className="text-sm text-gray-600 mb-2">{risk.description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-gray-100 rounded">{risk.category}</span>
                    <span className={`px-2 py-1 rounded ${getRiskColor(risk.probability)}`}>
                      Prob: {risk.probability}
                    </span>
                    <span className={`px-2 py-1 rounded ${getRiskColor(risk.impact)}`}>
                      Impact: {risk.impact}
                    </span>
                    {risk.owner && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Owner: {risk.owner}</span>}
                  </div>
                  {risk.mitigation && (
                    <p className="text-sm text-gray-500 mt-2">
                      <strong>Mitigation:</strong> {risk.mitigation}
                    </p>
                  )}
                </div>
                <button onClick={() => onDelete(risk.id)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Option B Preview ─────────────────────────────────────────────────────────
const SHIFTS = [
  { id: 'A', name: 'Shift A (EST)', time: '09:00 PM – 06:00 AM', tz: 'EST', color: 'bg-blue-100 text-blue-700' },
  { id: 'B', name: 'Shift B (IST)', time: '06:00 AM – 03:00 PM', tz: 'IST', color: 'bg-purple-100 text-purple-700' },
];
const WORK_PATTERNS = ['Mon – Fri', 'Mon – Sat', 'Tue – Sat'];
const MTYPE_COLORS: Record<string, string> = { C: 'bg-blue-500', M: 'bg-purple-500', E: 'bg-green-500', D: 'bg-orange-500' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function enrichMember(m: any, i: number, all: any[]) {
  // Resolve shift object from stored shift name, fallback to simulated
  const storedShift = SHIFTS.find(s => m.shift === s.name || m.shiftTimezone === s.tz);
  const shift = storedShift ?? SHIFTS[i % 2];
  return {
    ...m,
    shift,
    workingPattern: m.workingPattern || WORK_PATTERNS[i % 3],
    migrationTypes: m.migrationTypes
      ? m.migrationTypes.split(',').map((t: string) => t.trim()).filter(Boolean)
      : ['C', 'M', 'E'].slice(0, (i % 3) + 1),
    reportingTo: m.reportingTo || (i === 0 ? null : all[0]?.name || null),
    capacity: m.capacity ?? Math.round(70 + (i % 4) * 7),
    projects: Math.round(8 + (i % 5) * 2),
    calendar: DAYS.map((d, di) => {
      const pat = m.workingPattern || WORK_PATTERNS[i % 3];
      if (pat === 'Mon – Fri') return di >= 5 ? 'off' : 'work';
      if (pat === 'Mon – Sat') return di === 6 ? 'off' : di === 5 ? 'half' : 'work';
      if (pat === 'Tue – Sat') return di === 0 ? 'off' : di === 6 ? 'off' : 'work';
      return di >= 5 ? 'off' : 'work';
    }),
  };
}

type BSubTab = 'overview' | 'tree' | 'resources' | 'shift' | 'workload' | 'calendar' | 'reports';
const B_TABS: { id: BSubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tree', label: 'Tree View' },
  { id: 'resources', label: 'Resources' },
  { id: 'shift', label: 'Shift Planning' },
  { id: 'workload', label: 'Workload' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'reports', label: 'Reports' },
];

function OptionBPreview({ team }: { team: any[] }) {
  const [sub, setSub] = useState<BSubTab>('tree');
  const enriched = team.map((m, i) => enrichMember(m, i, team));
  const avgCap = enriched.length ? Math.round(enriched.reduce((s, m) => s + m.capacity, 0) / enriched.length) : 0;
  const shiftA = enriched.filter(m => m.shift.id === 'A');
  const shiftB = enriched.filter(m => m.shift.id === 'B');

  const avatarColors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-amber-500','bg-red-500','bg-indigo-500','bg-pink-500','bg-teal-500'];
  const getAV = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length];

  const ROLE_LABELS: Record<string, string> = {
    PROJECT_MANAGER: 'Project Manager', TECHNICAL_LEAD: 'Technical Lead',
    DEVELOPER: 'Developer', QA_ENGINEER: 'QA Engineer',
    BUSINESS_ANALYST: 'Business Analyst', ARCHITECT: 'Architect',
    TEAM_MEMBER: 'Team Member', STAKEHOLDER: 'Stakeholder',
  };

  return (
    <div className="space-y-0 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="bg-white px-5 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-gray-400">Team Management</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              <Users size={13} /> Team Dashboard
            </button>
            <button className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Export</button>
            <button className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-1.5">
              <Plus size={13} /> Add Member
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { icon: Users, label: 'Team Members', value: enriched.length, sub: 'Total', c: 'text-blue-600 bg-blue-50' },
            { icon: Clock, label: 'Shifts', value: SHIFTS.length, sub: 'Active', c: 'text-purple-600 bg-purple-50' },
            { icon: BarChart3, label: 'Working Days', value: '5.5', sub: 'Avg/Week', c: 'text-green-600 bg-green-50' },
            { icon: Shield, label: 'Avg. Capacity', value: `${avgCap}%`, sub: 'Overall', c: 'text-amber-600 bg-amber-50' },
          ].map(({ icon: Icon, label, value, sub: s, c }) => (
            <div key={label} className="border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 bg-white shadow-sm">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c}`}><Icon size={16} /></div>
              <div>
                <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-xs text-gray-400">{s}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
          {B_TABS.map(t => (
            <button key={t.id} onClick={() => setSub(t.id)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${sub === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab content */}
      <div className="bg-gray-50 p-4">

        {/* ── TREE VIEW ── */}
        {sub === 'tree' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Tree panel */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Team Structure (Tree View)</span>
              </div>
              <div className="p-3 overflow-y-auto max-h-[480px]">
                {/* Project root */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 mb-2">
                  <div className="w-5 h-5 rounded bg-primary-600 text-white flex items-center justify-center text-xs font-bold">P</div>
                  <span className="text-xs font-bold text-gray-800">Project</span>
                </div>
                {/* PM */}
                {enriched.filter(m => m.role === 'PROJECT_MANAGER').map(m => (
                  <div key={m.id} className="ml-3 border-l-2 border-gray-200 pl-3 mb-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-purple-50">
                      <div className={`w-6 h-6 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center`}>{m.name.charAt(0)}</div>
                      <span className="text-xs font-semibold text-purple-800">{m.name}</span>
                      <span className="ml-auto text-xs bg-purple-200 text-purple-700 px-1.5 rounded font-medium">PM</span>
                      <span className="text-xs text-green-600 font-bold">{m.allocation}%</span>
                    </div>
                  </div>
                ))}
                {/* Shifts */}
                {SHIFTS.map(shift => {
                  const shiftMembers = enriched.filter(m => m.shift.id === shift.id && m.role !== 'PROJECT_MANAGER');
                  if (!shiftMembers.length) return null;
                  // Group by department within shift
                  const depts = [...new Set(shiftMembers.map(m => m.department || 'General'))];
                  return (
                    <div key={shift.id} className="ml-3 border-l-2 border-gray-200 pl-3 mb-2">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${shift.color}`}>
                        <span className="text-xs font-bold">{shift.name}</span>
                        <span className="text-xs ml-1 opacity-70">{shift.time}</span>
                        <span className="ml-auto text-xs font-bold">{shiftMembers.length} Members</span>
                      </div>
                      {depts.map(dept => {
                        const dm = shiftMembers.filter(m => (m.department || 'General') === dept);
                        return (
                          <div key={dept} className="ml-4 border-l-2 border-gray-100 pl-3 mb-1">
                            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 font-medium">
                              <span className="w-2 h-2 rounded-sm bg-gray-400 inline-block" />
                              {dept || 'General'} Team
                              <span className="ml-auto text-gray-400">{dm.length}</span>
                            </div>
                            {dm.map(m => (
                              <div key={m.id} className="flex items-center gap-2 py-1 px-3 hover:bg-gray-50 rounded">
                                <div className={`w-5 h-5 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{m.name.charAt(0)}</div>
                                <span className="text-xs text-gray-700 flex-1 truncate">{m.name}</span>
                                <span className={`text-xs font-semibold ${m.allocation >= 90 ? 'text-green-600' : 'text-amber-600'}`}>{m.allocation}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Team members table */}
            <div className="lg:col-span-3 space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-sm font-semibold text-gray-700">Team Members</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Employee', 'Role', 'Shift', 'Working Days', 'Mig. Types', 'Allocation', 'Capacity', 'Status', 'Reporting To'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {enriched.slice(0, 8).map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{m.name.charAt(0)}</div>
                              <div><div className="font-medium text-gray-900">{m.name}</div></div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{ROLE_LABELS[m.role] || m.role}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${m.shift.color}`}>{m.shift.tz}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{m.workingPattern}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-0.5">
                              {m.migrationTypes.map((t: string) => (
                                <span key={t} className={`w-5 h-5 rounded-full ${MTYPE_COLORS[t] || 'bg-gray-400'} text-white text-xs font-bold flex items-center justify-center`}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-gray-700">{m.allocation}%</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 bg-gray-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${m.capacity}%` }} />
                              </div>
                              <span className="text-gray-600">{m.capacity}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium text-xs">Active</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{m.reportingTo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {enriched.length > 8 && <div className="px-4 py-2 text-xs text-gray-400 border-t bg-gray-50">1–8 of {enriched.length} · 10 / page</div>}
                </div>
              </div>

              {/* Shift Summary + Working Days */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3">Shift Summary</div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-400 border-b border-gray-100">
                      {['Shift', 'Members', 'Avg Cap', 'Status'].map(h => <th key={h} className="pb-1.5 text-left font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {SHIFTS.map(sh => {
                        const sm = enriched.filter(m => m.shift.id === sh.id);
                        const ac = sm.length ? Math.round(sm.reduce((s, m) => s + m.capacity, 0) / sm.length) : 0;
                        return (
                          <tr key={sh.id}>
                            <td className="py-2 font-medium text-gray-800">{sh.name}</td>
                            <td className="py-2 text-gray-600">{sm.length}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-1">
                                <div className="w-12 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-green-500" style={{ width: `${ac}%` }} /></div>
                                <span className="text-gray-600">{ac}%</span>
                              </div>
                            </td>
                            <td className="py-2"><span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Active</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3">Working Days Overview</div>
                  {WORK_PATTERNS.map(pat => {
                    const cnt = enriched.filter(m => m.workingPattern === pat).length;
                    const pct = enriched.length ? Math.round((cnt / enriched.length) * 100) : 0;
                    return (
                      <div key={pat} className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-600 w-20 shrink-0">{pat}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-gray-500 w-16 shrink-0">{cnt} ({pct}%)</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: Math.min(cnt, 3) }).map((_, i) => (
                            <div key={i} className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 text-xs flex items-center justify-center font-bold">{i + 1}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RESOURCE CALENDAR ── */}
        {sub === 'calendar' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Resource Calendar (This Week)</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Working Day</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-300 inline-block" /> Half Day</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Off Day</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 w-32">Employee</th>
                    {DAYS.map((d, i) => (
                      <th key={d} className={`px-3 py-3 text-center font-semibold ${i >= 5 ? 'text-red-400' : 'text-gray-600'}`}>
                        <div>{d}</div>
                        <div className="text-gray-400 font-normal">{19 + i}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {enriched.slice(0, 6).map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center`}>{m.name.charAt(0)}</div>
                          <span className="font-medium text-gray-800 truncate max-w-[80px]">{m.name}</span>
                        </div>
                      </td>
                      {m.calendar.map((day: string, di: number) => (
                        <td key={di} className="px-3 py-3 text-center">
                          {day === 'work' && <span className="inline-flex w-6 h-6 rounded-full bg-green-500 items-center justify-center text-white text-xs">✓</span>}
                          {day === 'half' && <span className="inline-flex w-6 h-6 rounded-full bg-blue-300 items-center justify-center text-white text-xs">½</span>}
                          {day === 'off' && <span className="inline-flex w-6 h-6 rounded-full bg-red-400 items-center justify-center text-white text-xs">✕</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SHIFT PLANNING ── */}
        {sub === 'shift' && (
          <div className="space-y-4">
            {SHIFTS.map(shift => {
              const sm = enriched.filter(m => m.shift.id === shift.id);
              return (
                <div key={shift.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className={`px-5 py-3 flex items-center gap-3 ${shift.color} border-b border-gray-100`}>
                    <span className="font-bold text-sm">{shift.name}</span>
                    <span className="text-xs opacity-70">{shift.time}</span>
                    <span className="ml-auto text-xs font-bold">{sm.length} Members</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {sm.map(m => (
                      <div key={m.id} className="flex items-center gap-2 p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                        <div className={`w-8 h-8 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{m.name.charAt(0)}</div>
                        <div>
                          <div className="text-xs font-semibold text-gray-800">{m.name}</div>
                          <div className="text-xs text-gray-400">{ROLE_LABELS[m.role] || m.role}</div>
                          <div className="text-xs text-green-600 font-medium">{m.allocation}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── WORKLOAD ── */}
        {sub === 'workload' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-sm font-semibold text-gray-700">Workload Distribution</div>
            <div className="p-4 space-y-3">
              {enriched.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 shrink-0">
                    <div className={`w-7 h-7 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center`}>{m.name.charAt(0)}</div>
                    <span className="text-xs font-medium text-gray-800 truncate">{m.name}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                    <div className="h-4 rounded-full transition-all" style={{ width: `${m.capacity}%`, backgroundColor: m.capacity >= 90 ? '#22c55e' : m.capacity >= 70 ? '#f59e0b' : '#ef4444' }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{m.capacity}%</span>
                  </div>
                  <span className="text-xs text-gray-500 w-24 shrink-0">{m.projects} projects</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-16 text-center ${m.capacity >= 90 ? 'bg-green-100 text-green-700' : m.capacity >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {m.capacity >= 90 ? 'Optimal' : m.capacity >= 70 ? 'Moderate' : 'Low'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {sub === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHIFTS.map(sh => {
              const sm = enriched.filter(m => m.shift.id === sh.id);
              const ac = sm.length ? Math.round(sm.reduce((s, m) => s + m.capacity, 0) / sm.length) : 0;
              return (
                <div key={sh.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold mb-3 ${sh.color}`}>{sh.name}</div>
                  <div className="space-y-2 text-sm">
                    {[
                      { l: 'Members', v: sm.length },
                      { l: 'Avg Capacity', v: `${ac}%` },
                      { l: 'Working Hours', v: sh.time },
                    ].map(({ l, v }) => (
                      <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span className="font-semibold text-gray-800">{v}</span></div>
                    ))}
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex flex-wrap gap-1">
                        {sm.slice(0, 5).map(m => (
                          <div key={m.id} title={m.name} className={`w-7 h-7 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center`}>{m.name.charAt(0)}</div>
                        ))}
                        {sm.length > 5 && <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">+{sm.length - 5}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="text-xs font-semibold text-gray-600 mb-3">Overall Team Health</div>
              <div className="space-y-2">
                {[
                  { l: 'Total Members', v: enriched.length },
                  { l: 'Avg Capacity', v: `${avgCap}%` },
                  { l: 'Active Shifts', v: SHIFTS.length },
                  { l: 'Work Patterns', v: WORK_PATTERNS.length },
                ].map(({ l, v }) => (
                  <div key={l} className="flex justify-between text-sm"><span className="text-gray-500">{l}</span><span className="font-semibold text-gray-800">{v}</span></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESOURCES tab (same as tree table) ── */}
        {sub === 'resources' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['#', 'Employee', 'Role', 'Shift', 'Working Days', 'Migration Types', 'Allocation', 'Capacity', 'Status', 'Reporting To'].map(h => (
                      <th key={h} className="px-3 py-3 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enriched.map((m, i) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full ${getAV(m.name)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>{m.name.charAt(0)}</div>
                          <div><div className="font-medium text-gray-900">{m.name}</div><div className="text-gray-400">{m.email}</div></div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{ROLE_LABELS[m.role] || m.role}</td>
                      <td className="px-3 py-3"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${m.shift.color}`}>{m.shift.tz}</span></td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{m.workingPattern}</td>
                      <td className="px-3 py-3"><div className="flex gap-0.5">{m.migrationTypes.map((t: string) => (<span key={t} className={`w-5 h-5 rounded-full ${MTYPE_COLORS[t]} text-white text-xs font-bold flex items-center justify-center`}>{t}</span>))}</div></td>
                      <td className="px-3 py-3 font-semibold text-gray-700">{m.allocation}%</td>
                      <td className="px-3 py-3"><div className="flex items-center gap-1"><div className="w-14 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-green-500" style={{ width: `${m.capacity}%` }} /></div><span>{m.capacity}%</span></div></td>
                      <td className="px-3 py-3"><span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span></td>
                      <td className="px-3 py-3 text-gray-500">{m.reportingTo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(sub === 'reports') && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
            Team reports will show capacity trends, shift utilization charts, and workload history over time.
          </div>
        )}
      </div>
    </div>
  );
}

// Team Tab Component
function TeamTab({ team, projectId, onRefresh, onDelete }: any) {
  const [showForm, setShowForm] = useState(false);
  const [showOptionB, setShowOptionB] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', role: 'TEAM_MEMBER', department: '', allocation: 100, shift: '', shiftTimezone: '', workingPattern: 'Mon – Fri', migrationTypes: '', capacity: 100, reportingTo: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  const roleLabels: Record<string, string> = {
    PROJECT_MANAGER: 'Project Manager',
    TECHNICAL_LEAD: 'Technical Lead',
    DEVELOPER: 'Developer',
    QA_ENGINEER: 'QA Engineer',
    BUSINESS_ANALYST: 'Business Analyst',
    ARCHITECT: 'Architect',
    TEAM_MEMBER: 'Team Member',
    STAKEHOLDER: 'Stakeholder',
  };

  const roleColors: Record<string, string> = {
    PROJECT_MANAGER: 'bg-purple-100 text-purple-700',
    TECHNICAL_LEAD: 'bg-blue-100 text-blue-700',
    DEVELOPER: 'bg-indigo-100 text-indigo-700',
    QA_ENGINEER: 'bg-green-100 text-green-700',
    BUSINESS_ANALYST: 'bg-amber-100 text-amber-700',
    ARCHITECT: 'bg-cyan-100 text-cyan-700',
    TEAM_MEMBER: 'bg-gray-100 text-gray-700',
    STAKEHOLDER: 'bg-pink-100 text-pink-700',
  };

  const avatarColors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-red-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'];

  function getAvatarColor(name: string) {
    const idx = name.charCodeAt(0) % avatarColors.length;
    return avatarColors[idx];
  }

  const totalMembers = team.length;
  const avgAllocation = totalMembers > 0 ? Math.round(team.reduce((s: number, m: any) => s + (m.allocation ?? 100), 0) / totalMembers) : 0;
  const uniqueRoles = new Set(team.map((m: any) => m.role)).size;
  const uniqueDepts = new Set(team.map((m: any) => m.department).filter(Boolean)).size;

  const filteredTeam = team.filter((m: any) =>
    !searchQuery || m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by role for tree view
  const grouped = filteredTeam.reduce((acc: Record<string, any[]>, m: any) => {
    const key = m.role || 'TEAM_MEMBER';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, any[]>);

  const roleOrder = ['PROJECT_MANAGER', 'TECHNICAL_LEAD', 'ARCHITECT', 'BUSINESS_ANALYST', 'DEVELOPER', 'QA_ENGINEER', 'TEAM_MEMBER', 'STAKEHOLDER'];
  const sortedGroups = (Object.entries(grouped) as [string, any[]][]).sort(([a], [b]) => roleOrder.indexOf(a) - roleOrder.indexOf(b));

  // Role distribution for summary
  const roleDist = roleOrder.map(r => ({ role: r, label: roleLabels[r] || r, count: team.filter((m: any) => m.role === r).length })).filter(r => r.count > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, projectId }),
      });
      setShowForm(false);
      setFormData({ name: '', email: '', role: 'TEAM_MEMBER', department: '', allocation: 100, shift: '', shiftTimezone: '', workingPattern: 'Mon – Fri', migrationTypes: '', capacity: 100, reportingTo: '' });
      onRefresh();
    } catch (err) { console.error('Failed to add team member:', err); }
  };

  function startEdit(member: any) {
    setEditingId(member.id);
    setEditData({ name: member.name, email: member.email, role: member.role, department: member.department || '', allocation: member.allocation ?? 100, shift: member.shift || '', shiftTimezone: member.shiftTimezone || '', workingPattern: member.workingPattern || 'Mon – Fri', migrationTypes: member.migrationTypes || '', capacity: member.capacity ?? 100, reportingTo: member.reportingTo || '' });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    try {
      await fetch(`${API_URL}/api/team/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      setEditingId(null);
      onRefresh();
    } catch (err) { console.error('Failed to update team member:', err); }
    finally { setEditSaving(false); }
  }

  return (
    <div className="space-y-5">

      {/* ── View toggle: Option A / Option B Preview ── */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
          <button onClick={() => setShowOptionB(false)}
            className={`px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${!showOptionB ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Current View
          </button>
          <button onClick={() => setShowOptionB(true)}
            className={`px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${showOptionB ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Advanced View
          </button>
        </div>
      </div>

      {/* ── Option B Preview ── */}
      {showOptionB && <OptionBPreview team={team} />}

      {/* ── Current View (Option A) ── */}
      {!showOptionB && <>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Team Members', value: totalMembers, sub: 'Total', icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Avg. Capacity', value: `${avgAllocation}%`, sub: 'Overall', icon: BarChart3, color: 'text-green-600 bg-green-50' },
          { label: 'Roles', value: uniqueRoles, sub: 'Distinct', icon: Shield, color: 'text-purple-600 bg-purple-50' },
          { label: 'Departments', value: uniqueDepts || '—', sub: 'Teams', icon: GitPullRequest, color: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-xs text-gray-400">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {(['table', 'tree'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {v === 'table' ? 'Table View' : 'Tree View'}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search team member..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 w-48 bg-white"
            />
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-1.5" /> Add Member
        </Button>
      </div>

      {/* ── Add Member Form ── */}
      {showForm && (
        <Card className="p-5 border-primary-200 bg-primary-50/30">
          <h4 className="text-sm font-semibold text-gray-800 mb-4">Add New Team Member</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input type="text" required value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" required value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <input type="text" value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Allocation %</label>
                <input type="number" min="0" max="100" value={formData.allocation}
                  onChange={e => setFormData({ ...formData, allocation: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                <select value={formData.shift} onChange={e => {
                  const s = SHIFTS.find(sh => sh.name === e.target.value);
                  setFormData({ ...formData, shift: e.target.value, shiftTimezone: s?.tz || '' });
                }} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="">— Select Shift —</option>
                  {SHIFTS.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Working Pattern</label>
                <select value={formData.workingPattern} onChange={e => setFormData({ ...formData, workingPattern: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {WORK_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Capacity %</label>
                <input type="number" min="0" max="100" value={formData.capacity}
                  onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Migration Types <span className="text-gray-400">(e.g. C,M,E)</span></label>
                <input type="text" placeholder="C,M,E" value={formData.migrationTypes}
                  onChange={e => setFormData({ ...formData, migrationTypes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reporting To</label>
                <input type="text" placeholder="Manager name" value={formData.reportingTo}
                  onChange={e => setFormData({ ...formData, reportingTo: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Add Member</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {team.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No team members assigned</p>
          <p className="text-sm text-gray-400 mt-1">Add team members to get started</p>
        </Card>
      ) : (
        <>
          {/* ── TABLE VIEW ── */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Employee', 'Role', 'Department', 'Allocation', 'Capacity', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTeam.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No members match your search</td></tr>
                    ) : filteredTeam.map((member: any, idx: number) => (
                      <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                        {editingId === member.id ? (
                          <td colSpan={7} className="px-4 py-3">
                            <form onSubmit={handleEditSave} className="flex flex-wrap items-end gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                                <input type="text" required value={editData.name}
                                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-36" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Email</label>
                                <input type="email" required value={editData.email}
                                  onChange={e => setEditData({ ...editData, email: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-44" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Role</label>
                                <select value={editData.role} onChange={e => setEditData({ ...editData, role: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                                  {Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Department</label>
                                <input type="text" value={editData.department}
                                  onChange={e => setEditData({ ...editData, department: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-28" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Allocation %</label>
                                <input type="number" min="0" max="100" value={editData.allocation}
                                  onChange={e => setEditData({ ...editData, allocation: parseInt(e.target.value) || 0 })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-20" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Shift</label>
                                <select value={editData.shift} onChange={e => {
                                  const s = SHIFTS.find(sh => sh.name === e.target.value);
                                  setEditData({ ...editData, shift: e.target.value, shiftTimezone: s?.tz || '' });
                                }} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                                  <option value="">— None —</option>
                                  {SHIFTS.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Working Pattern</label>
                                <select value={editData.workingPattern} onChange={e => setEditData({ ...editData, workingPattern: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                                  {WORK_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Capacity %</label>
                                <input type="number" min="0" max="100" value={editData.capacity}
                                  onChange={e => setEditData({ ...editData, capacity: parseInt(e.target.value) || 0 })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-20" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Mig. Types</label>
                                <input type="text" placeholder="C,M,E" value={editData.migrationTypes}
                                  onChange={e => setEditData({ ...editData, migrationTypes: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-20" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Reporting To</label>
                                <input type="text" value={editData.reportingTo}
                                  onChange={e => setEditData({ ...editData, reportingTo: e.target.value })}
                                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 w-28" />
                              </div>
                              <div className="flex gap-2">
                                <button type="submit" disabled={editSaving}
                                  className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 font-medium flex items-center gap-1">
                                  <Check size={13} />{editSaving ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={() => setEditingId(null)}
                                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                  <X size={13} />Cancel
                                </button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            {/* Employee */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full ${getAvatarColor(member.name || '')} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                                  {(member.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900 text-sm">{member.name}</div>
                                  <div className="text-xs text-gray-400">{member.email}</div>
                                </div>
                              </div>
                            </td>
                            {/* Role */}
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[member.role] || 'bg-gray-100 text-gray-700'}`}>
                                {roleLabels[member.role] || member.role}
                              </span>
                            </td>
                            {/* Department */}
                            <td className="px-4 py-3 text-sm text-gray-600">{member.department || <span className="text-gray-300">—</span>}</td>
                            {/* Allocation */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full" style={{ width: `${member.allocation ?? 100}%`, backgroundColor: (member.allocation ?? 100) >= 90 ? '#22c55e' : (member.allocation ?? 100) >= 60 ? '#f59e0b' : '#ef4444' }} />
                                </div>
                                <span className="text-xs font-semibold text-gray-700">{member.allocation ?? 100}%</span>
                              </div>
                            </td>
                            {/* Capacity */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${member.allocation ?? 100}%` }} />
                                </div>
                                <span className="text-xs text-gray-600">{member.allocation ?? 100}%</span>
                              </div>
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(member.allocation ?? 100) > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {(member.allocation ?? 100) > 0 ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => startEdit(member)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => onDelete(member.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 bg-gray-50">
                {filteredTeam.length} of {totalMembers} member{totalMembers !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* ── TREE VIEW ── */}
          {viewMode === 'tree' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Tree panel */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Team Structure</span>
                  <span className="text-xs text-gray-400">{totalMembers} members</span>
                </div>
                <div className="p-3 space-y-1 overflow-y-auto max-h-[520px]">
                  {sortedGroups.map(([role, members]) => (
                    <div key={role} className="rounded-lg overflow-hidden">
                      {/* Role group header */}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${roleColors[role] || 'bg-gray-100 text-gray-700'}`}>
                        <Users size={13} />
                        <span className="text-xs font-semibold">{roleLabels[role] || role}</span>
                        <span className="ml-auto text-xs font-bold">{members.length}</span>
                      </div>
                      {/* Members under this role */}
                      <div className="ml-4 border-l-2 border-gray-100 pl-3 space-y-1 mb-2">
                        {members.map((member: any) => (
                          <div key={member.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 group">
                            <div className={`w-6 h-6 rounded-full ${getAvatarColor(member.name || '')} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                              {(member.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs text-gray-800 flex-1 truncate">{member.name}</span>
                            <span className={`text-xs font-semibold ${(member.allocation ?? 100) >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                              {member.allocation ?? 100}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right panel: member details table */}
              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Team Members</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Employee', 'Role', 'Department', 'Allocation', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTeam.map((member: any) => (
                        <tr key={member.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full ${getAvatarColor(member.name || '')} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                                {(member.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-xs font-medium text-gray-900">{member.name}</div>
                                <div className="text-xs text-gray-400 truncate max-w-[120px]">{member.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roleColors[member.role] || 'bg-gray-100 text-gray-700'}`}>
                              {roleLabels[member.role] || member.role}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{member.department || '—'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${member.allocation ?? 100}%` }} />
                              </div>
                              <span className="text-xs font-medium text-gray-700">{member.allocation ?? 100}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              <button onClick={() => startEdit(member)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil size={12} /></button>
                              <button onClick={() => onDelete(member.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Role Distribution Summary ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Role breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Role Distribution</h4>
              <div className="space-y-3">
                {roleDist.map(({ role, label, count }) => (
                  <div key={role} className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-36 text-center ${roleColors[role] || 'bg-gray-100 text-gray-700'}`}>{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-primary-500" style={{ width: `${Math.round((count / totalMembers) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Allocation summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Allocation Summary</h4>
              <div className="space-y-3">
                {[
                  { label: 'Full (90–100%)', members: team.filter((m: any) => (m.allocation ?? 100) >= 90), color: 'bg-green-500' },
                  { label: 'Partial (50–89%)', members: team.filter((m: any) => (m.allocation ?? 100) >= 50 && (m.allocation ?? 100) < 90), color: 'bg-amber-400' },
                  { label: 'Low (< 50%)', members: team.filter((m: any) => (m.allocation ?? 100) < 50), color: 'bg-red-400' },
                ].map(({ label, members, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: totalMembers ? `${Math.round((members.length / totalMembers) * 100)}%` : '0%' }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-6 text-right">{members.length}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Average Allocation</span>
                  <span className="font-bold text-primary-600">{avgAllocation}%</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      </> /* end Option A */}
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ documents, projectId, onRefresh, onDelete }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', description: '', category: 'OTHER', fileUrl: '', version: '1.0'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, projectId }),
      });
      setShowForm(false);
      setFormData({ name: '', description: '', category: 'OTHER', fileUrl: '', version: '1.0' });
      onRefresh();
    } catch (err) {
      console.error('Failed to add document:', err);
    }
  };

  const categoryLabels: Record<string, string> = {
    SOW: 'Statement of Work',
    CONTRACT: 'Contract',
    REQUIREMENTS: 'Requirements',
    DESIGN: 'Design',
    TECHNICAL: 'Technical',
    MEETING_NOTES: 'Meeting Notes',
    STATUS_REPORT: 'Status Report',
    SIGN_OFF: 'Sign-off',
    OTHER: 'Other',
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'SOW':
      case 'CONTRACT':
        return '📄';
      case 'REQUIREMENTS':
        return '📋';
      case 'DESIGN':
        return '🎨';
      case 'TECHNICAL':
        return '⚙️';
      case 'MEETING_NOTES':
        return '📝';
      case 'STATUS_REPORT':
        return '📊';
      case 'SIGN_OFF':
        return '✅';
      default:
        return '📁';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Project Documents</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Add Document
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File URL / Link</label>
                <input
                  type="url"
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Add Document</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {documents.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No documents uploaded</p>
          <p className="text-sm">Add project documents and attachments</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc: any) => (
            <Card key={doc.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getCategoryIcon(doc.category)}</span>
                  <div>
                    <h4 className="font-semibold text-gray-900">{doc.name}</h4>
                    {doc.description && <p className="text-sm text-gray-500">{doc.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 bg-gray-100 rounded">
                        {categoryLabels[doc.category] || doc.category}
                      </span>
                      {doc.version && (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">v{doc.version}</span>
                      )}
                    </div>
                    {doc.fileUrl && (
                      <a 
                        href={doc.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:underline mt-2 inline-block"
                      >
                        Open Document →
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={() => onDelete(doc.id)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Reports Tab Component
function ReportsTab({ reports, onGenerate, onDelete }: any) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'GREEN': return 'bg-green-500';
      case 'YELLOW': return 'bg-yellow-500';
      case 'RED': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Status Reports</h3>
        <Button onClick={onGenerate}>
          <BarChart3 size={16} className="mr-2" />
          Generate Weekly Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No status reports yet</p>
          <p className="text-sm">Generate a weekly report to track progress</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report: any) => (
            <Card key={report.id} className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">
                      {report.reportType} Report - {formatDate(report.reportDate)}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-500">
                    Progress: {report.completionPercentage}% ({report.tasksCompleted}/{report.tasksTotal} tasks)
                  </p>
                </div>
                <button onClick={() => onDelete(report.id)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* RAG Status */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1 ${getStatusColor(report.overallStatus)}`} />
                  <p className="text-xs text-gray-500">Overall</p>
                </div>
                <div className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1 ${getStatusColor(report.scheduleStatus)}`} />
                  <p className="text-xs text-gray-500">Schedule</p>
                </div>
                <div className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1 ${getStatusColor(report.budgetStatus)}`} />
                  <p className="text-xs text-gray-500">Budget</p>
                </div>
                <div className="text-center">
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1 ${getStatusColor(report.resourceStatus)}`} />
                  <p className="text-xs text-gray-500">Resources</p>
                </div>
              </div>

              {/* Report Sections */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {report.accomplishments && (
                  <div>
                    <h5 className="font-medium text-gray-700 mb-1">Accomplishments</h5>
                    <p className="text-gray-600 whitespace-pre-line">{report.accomplishments}</p>
                  </div>
                )}
                {report.plannedActivities && (
                  <div>
                    <h5 className="font-medium text-gray-700 mb-1">Planned Activities</h5>
                    <p className="text-gray-600 whitespace-pre-line">{report.plannedActivities}</p>
                  </div>
                )}
                {report.risks && (
                  <div>
                    <h5 className="font-medium text-gray-700 mb-1">Risks</h5>
                    <p className="text-gray-600 whitespace-pre-line">{report.risks}</p>
                  </div>
                )}
                {report.issues && (
                  <div>
                    <h5 className="font-medium text-gray-700 mb-1">Issues</h5>
                    <p className="text-gray-600 whitespace-pre-line">{report.issues}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Change Requests Tab Component
function ChangeRequestsTab({ changeRequests, projectId, onRefresh, onDelete }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', changeType: 'SCOPE', priority: 'MEDIUM',
    impact: '', justification: '', requestedBy: '', costImpact: '', scheduleImpact: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API_URL}/api/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          projectId,
          costImpact: formData.costImpact ? parseFloat(formData.costImpact) : undefined,
          scheduleImpact: formData.scheduleImpact ? parseInt(formData.scheduleImpact) : undefined,
        }),
      });
      setShowForm(false);
      setFormData({ title: '', description: '', changeType: 'SCOPE', priority: 'MEDIUM', impact: '', justification: '', requestedBy: '', costImpact: '', scheduleImpact: '' });
      onRefresh();
    } catch (err) {
      console.error('Failed to create change request:', err);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/change-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'Admin' }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/change-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'Admin' }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'UNDER_REVIEW': return 'bg-blue-100 text-blue-800';
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'IMPLEMENTED': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      case 'HIGH': return 'bg-orange-100 text-orange-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Change Requests</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          New Change Request
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requested By *</label>
                <input
                  type="text"
                  required
                  value={formData.requestedBy}
                  onChange={(e) => setFormData({ ...formData, requestedBy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Change Type</label>
                <select
                  value={formData.changeType}
                  onChange={(e) => setFormData({ ...formData, changeType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="SCOPE">Scope</option>
                  <option value="SCHEDULE">Schedule</option>
                  <option value="BUDGET">Budget</option>
                  <option value="RESOURCE">Resource</option>
                  <option value="TECHNICAL">Technical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost Impact ($)</label>
                <input
                  type="number"
                  value={formData.costImpact}
                  onChange={(e) => setFormData({ ...formData, costImpact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Impact (days)</label>
                <input
                  type="number"
                  value={formData.scheduleImpact}
                  onChange={(e) => setFormData({ ...formData, scheduleImpact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Justification</label>
              <textarea
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Submit Request</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {changeRequests.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <GitPullRequest className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No change requests</p>
          <p className="text-sm">Submit a change request for scope, schedule, or budget changes</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {changeRequests.map((cr: any) => (
            <Card key={cr.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900">{cr.title}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(cr.status)}`}>
                      {cr.status.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(cr.priority)}`}>
                      {cr.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{cr.description}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Type: {cr.changeType}</span>
                    <span>Requested by: {cr.requestedBy}</span>
                    {cr.costImpact && <span>Cost Impact: ${Number(cr.costImpact).toLocaleString()}</span>}
                    {cr.scheduleImpact && <span>Schedule Impact: {cr.scheduleImpact} days</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(cr.status === 'PENDING' || cr.status === 'UNDER_REVIEW') && (
                    <>
                      <button 
                        onClick={() => handleApprove(cr.id)}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Approve"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={() => handleReject(cr.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Reject"
                      >
                        <X size={18} />
                      </button>
                    </>
                  )}
                  <button onClick={() => onDelete(cr.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
