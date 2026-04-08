'use client';

import { useState, useEffect } from 'react';
import { useProject } from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Loader2, ArrowLeft, AlertTriangle, Users, FileText, 
  BarChart3, GitPullRequest, Plus, Edit2, Trash2, Check,
  X, Clock, Shield, ChevronDown, ChevronRight
} from 'lucide-react';
import Link from 'next/link';

interface ProjectManagePageProps {
  params: { id: string };
}

type TabType = 'risks' | 'team' | 'documents' | 'reports' | 'changes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProjectManagePage({ params }: ProjectManagePageProps) {
  const { data, isLoading, error } = useProject(params.id);
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
      
      const res = await fetch(`${API_URL}${endpoint}`);
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
      await fetch(`${API_URL}${endpoint}`, { method: 'DELETE' });
      loadTabData(tab);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const generateWeeklyReport = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reports/project/${params.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: 'System' }),
      });
      if (res.ok) {
        loadTabData('reports');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
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

// Team Tab Component
function TeamTab({ team, projectId, onRefresh, onDelete }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', role: 'TEAM_MEMBER', department: '', allocation: 100
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${API_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, projectId }),
      });
      setShowForm(false);
      setFormData({ name: '', email: '', role: 'TEAM_MEMBER', department: '', allocation: 100 });
      onRefresh();
    } catch (err) {
      console.error('Failed to add team member:', err);
    }
  };

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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Project Team</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" />
          Add Member
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocation %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.allocation}
                  onChange={(e) => setFormData({ ...formData, allocation: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
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
        <Card className="p-8 text-center text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No team members assigned</p>
          <p className="text-sm">Add team members to this project</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((member: any) => (
            <Card key={member.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{member.name}</h4>
                  <p className="text-sm text-gray-500">{member.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded">
                      {roleLabels[member.role] || member.role}
                    </span>
                    {member.department && (
                      <span className="px-2 py-1 bg-gray-100 rounded">{member.department}</span>
                    )}
                    <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
                      {member.allocation}% allocated
                    </span>
                  </div>
                </div>
                <button onClick={() => onDelete(member.id)} className="text-red-500 hover:text-red-700 p-1">
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
