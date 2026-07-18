'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle, FolderKanban, Plus, ArrowRight, AlertTriangle } from 'lucide-react';
import type { CreateProjectInput } from '@/types';

function SuccessModal({ projectName, onViewProjects, onCreateAnother, viewLabel = 'View Projects' }: {
  projectName: string;
  onViewProjects: () => void;
  onCreateAnother: () => void;
  viewLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
        <div className="flex flex-col items-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle size={42} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Created!</h2>
          <p className="text-gray-500 mb-1">
            <span className="font-semibold text-gray-700">"{projectName}"</span>
          </p>
          <p className="text-sm text-gray-500 mb-8">
            has been added successfully to your portfolio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={onCreateAnother}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Plus size={16} /> Create Another
            </button>
            <button
              onClick={onViewProjects}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <FolderKanban size={16} /> {viewLabel} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const createProject = useCreateProject();
  const { showToast } = useToast();
  const [createdProjectName, setCreatedProjectName] = useState<string | null>(null);

  // /projects/new?atRisk=1 — arrived here via "Add At Risk → Create New
  // Project" on the Escalation page; the project gets flagged at-risk the
  // moment it's created instead of needing a separate step afterward.
  const markAtRisk = searchParams.get('atRisk') === '1';
  const [atRiskNotes, setAtRiskNotes] = useState('');

  useEffect(() => {
    if (user && user.role === 'VIEWER') router.replace('/projects');
  }, [user, router]);

  const defaultManagerName = user?.role === 'PROJECT_MANAGER' ? user.name : undefined;

  const handleSubmit = async (dataArray: CreateProjectInput[]) => {
    try {
      for (const data of dataArray) {
        const submitData = {
          ...data,
          ...(defaultManagerName ? { projectManager: defaultManagerName } : {}),
          ...(markAtRisk ? { isAtRisk: true, atRiskNotes: atRiskNotes || undefined } : {}),
        };
        await createProject.mutateAsync(submitData);
      }
      const names = dataArray.map(d => d.name).filter(Boolean).join(', ');
      setCreatedProjectName(names || 'Project');
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || 'Please check all required fields and try again.';
      showToast('error', 'Failed to create project', msg);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {createdProjectName && (
        <SuccessModal
          projectName={createdProjectName}
          onViewProjects={() => router.push(markAtRisk ? '/escalation-projects' : '/projects')}
          onCreateAnother={() => {
            setCreatedProjectName(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          viewLabel={markAtRisk ? 'View At Risk' : 'View Projects'}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Create New Project</h1>
        <p className="text-slate-500 mt-1">Fill in the details to create a new migration project</p>
      </div>

      {markAtRisk && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-2">
            <AlertTriangle size={16} /> This project will be marked At Risk as soon as it's created
          </div>
          <label className="block text-sm font-medium text-amber-700 mb-1">Why is it at risk? (optional)</label>
          <textarea
            value={atRiskNotes}
            onChange={(e) => setAtRiskNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Customer raised concerns before kickoff even started"
            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white text-gray-900 resize-none"
          />
        </div>
      )}

      <ProjectForm
        onSubmit={handleSubmit}
        isLoading={createProject.isPending}
        defaultManagerName={defaultManagerName}
      />
    </div>
  );
}
