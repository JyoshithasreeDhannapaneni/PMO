'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle, FolderKanban, Plus, ArrowRight } from 'lucide-react';
import type { CreateProjectInput } from '@/types';

function SuccessModal({ projectName, onViewProjects, onCreateAnother }: {
  projectName: string;
  onViewProjects: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
        <div className="flex flex-col items-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-4">
            <CheckCircle size={42} className="text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Project Created!</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-1">
            <span className="font-semibold text-gray-700 dark:text-gray-200">"{projectName}"</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            has been added successfully to your portfolio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={onCreateAnother}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Plus size={16} /> Create Another
            </button>
            <button
              onClick={onViewProjects}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <FolderKanban size={16} /> View Projects <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const createProject = useCreateProject();
  const { showToast } = useToast();
  const [createdProjectName, setCreatedProjectName] = useState<string | null>(null);

  const defaultManagerName = user?.role === 'MANAGER' ? user.name : undefined;

  const handleSubmit = async (data: CreateProjectInput) => {
    try {
      const submitData = defaultManagerName
        ? { ...data, projectManager: defaultManagerName }
        : data;
      await createProject.mutateAsync(submitData);
      setCreatedProjectName(data.name);
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
          onViewProjects={() => router.push('/projects')}
          onCreateAnother={() => {
            setCreatedProjectName(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
        <p className="text-gray-500 mt-1">Fill in the details to create a new migration project</p>
      </div>

      <ProjectForm
        onSubmit={handleSubmit}
        isLoading={createProject.isPending}
        defaultManagerName={defaultManagerName}
      />
    </div>
  );
}
