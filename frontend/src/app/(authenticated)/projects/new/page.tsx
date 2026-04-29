'use client';

import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import type { CreateProjectInput } from '@/types';

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const createProject = useCreateProject();
  const { showToast } = useToast();

  // Pre-fill and lock projectManager for MANAGER role
  const defaultManagerName = user?.role === 'MANAGER' ? user.name : undefined;

  const handleSubmit = async (data: CreateProjectInput) => {
    try {
      // Ensure manager's name is always set even if form is bypassed
      const submitData = defaultManagerName
        ? { ...data, projectManager: defaultManagerName }
        : data;
      await createProject.mutateAsync(submitData);
      showToast('success', 'Project created!', `"${data.name}" has been added successfully.`);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to create project:', error);
      showToast('error', 'Failed to create project', 'Please check all required fields and try again.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
        <p className="text-gray-500 mt-1">Fill in the details to create a new migration project</p>
      </div>

      {/* Form */}
      <ProjectForm
        onSubmit={handleSubmit}
        isLoading={createProject.isPending}
        defaultManagerName={defaultManagerName}
      />
    </div>
  );
}
