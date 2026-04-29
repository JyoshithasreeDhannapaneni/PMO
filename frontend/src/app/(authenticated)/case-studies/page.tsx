'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  FileText,
  Plus,
  Loader2,
  Search,
  Filter,
  Eye,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Settings,
} from 'lucide-react';

interface CaseStudy {
  id: string;
  projectId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';
  title: string | null;
  content: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
    customerName: string;
    projectManager: string;
  };
}

interface Project {
  id: string;
  name: string;
  customerName: string;
  status: string;
  caseStudy: CaseStudy | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusConfig = {
  PENDING: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Pending' },
  IN_PROGRESS: { icon: Edit, color: 'text-blue-500', bg: 'bg-blue-50', label: 'In Progress' },
  COMPLETED: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Completed' },
  PUBLISHED: { icon: Eye, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Published' },
};

export default function CaseStudiesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [completedProjects, setCompletedProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      setIsLoading(true);

      // Fetch case studies
      const csResponse = await fetch(`${API_URL}/api/case-studies`, { headers });
      const csData = await csResponse.json();
      if (csData.success) {
        const all: CaseStudy[] = csData.data || [];
        // Manager: show only case studies for their projects
        setCaseStudies(isManager && user?.name
          ? all.filter((cs) => cs.project?.projectManager === user.name)
          : all);
      }

      // Fetch completed projects without case studies
      const projParams = new URLSearchParams({ status: 'COMPLETED' });
      if (isManager && user?.name) projParams.set('projectManager', user.name);
      const projResponse = await fetch(`${API_URL}/api/projects?${projParams}`, { headers });
      const projData = await projResponse.json();
      if (projData.success) {
        const projectsWithoutCS = (projData.data || []).filter(
          (p: Project) => !p.caseStudy
        );
        setCompletedProjects(projectsWithoutCS);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCaseStudies = caseStudies.filter((cs) => {
    const matchesSearch = 
      cs.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cs.project?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cs.project?.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'pending') {
      return matchesSearch && (cs.status === 'PENDING' || cs.status === 'IN_PROGRESS');
    }
    if (activeTab === 'completed') {
      return matchesSearch && (cs.status === 'COMPLETED' || cs.status === 'PUBLISHED');
    }
    return matchesSearch;
  });

  const stats = {
    total: caseStudies.length,
    pending: caseStudies.filter((cs) => cs.status === 'PENDING').length,
    inProgress: caseStudies.filter((cs) => cs.status === 'IN_PROGRESS').length,
    completed: caseStudies.filter((cs) => cs.status === 'COMPLETED').length,
    published: caseStudies.filter((cs) => cs.status === 'PUBLISHED').length,
    needsCaseStudy: completedProjects.length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Case Studies</h1>
          <p className="text-gray-500">Document and showcase successful project migrations</p>
        </div>
        {isAdmin && (
          <Link
            href="/case-studies/template"
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Settings size={14} />
            Manage Template
          </Link>
        )}
      </div>

      {/* Manager scope banner */}
      {isManager && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span><strong>Manager View</strong> — Showing case studies for your projects (<strong>{user?.name}</strong>).</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <FileText className="text-gray-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="text-yellow-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
              <p className="text-sm text-gray-500">Pending</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Edit className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.inProgress}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.completed + stats.published}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertCircle className="text-orange-600" size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.needsCaseStudy}</p>
              <p className="text-sm text-gray-500">Need Case Study</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Pending Case Studies - Auto-created from completed projects */}
      {stats.pending > 0 && (
        <Card className="border-2 border-yellow-300 bg-yellow-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-200 rounded-lg">
                <Clock className="text-yellow-700" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Pending Case Studies</h3>
                <p className="text-sm text-gray-600">
                  These case studies were auto-created when projects were completed. Click to start documenting!
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {caseStudies
              .filter((cs) => cs.status === 'PENDING')
              .slice(0, 6)
              .map((cs) => (
                <div
                  key={cs.id}
                  className="p-4 border border-yellow-300 bg-white rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="text-yellow-600" size={18} />
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                      Pending
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{cs.project?.name || 'Untitled'}</p>
                  <p className="text-sm text-gray-600">{cs.project?.customerName}</p>
                  <Link href={`/case-studies/${cs.id}`}>
                    <Button size="sm" className="mt-3 w-full">
                      <Edit size={14} className="mr-1" />
                      Start Writing
                    </Button>
                  </Link>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Projects Needing Case Studies (manual creation) */}
      {completedProjects.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Projects Needing Case Studies</h3>
              <p className="text-sm text-gray-500">Completed projects without documentation</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {completedProjects.slice(0, 6).map((project) => (
              <div
                key={project.id}
                className="p-4 border border-orange-200 bg-orange-50 rounded-lg"
              >
                <p className="font-medium text-gray-900">{project.name}</p>
                <p className="text-sm text-gray-600">{project.customerName}</p>
                <Link href={`/case-studies/new?projectId=${project.id}`}>
                  <Button size="sm" className="mt-3">
                    <Plus size={14} className="mr-1" />
                    Create Case Study
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search case studies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Case Studies List */}
      <Card>
        {filteredCaseStudies.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto text-gray-300" size={48} />
            <p className="text-gray-500 mt-4">No case studies found</p>
            <p className="text-sm text-gray-400">
              {caseStudies.length === 0
                ? 'Complete a project to create your first case study'
                : 'Try adjusting your search or filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredCaseStudies.map((cs) => {
              const config = statusConfig[cs.status];
              const StatusIcon = config.icon;

              return (
                <div
                  key={cs.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <StatusIcon className={config.color} size={20} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {cs.title || cs.project?.name || 'Untitled Case Study'}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {cs.project?.customerName} · {cs.project?.projectManager}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <Link href={`/case-studies/${cs.id}`}>
                        <Button variant="outline" size="sm">
                          {cs.status === 'PENDING' || cs.status === 'IN_PROGRESS' ? 'Edit' : 'View'}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
