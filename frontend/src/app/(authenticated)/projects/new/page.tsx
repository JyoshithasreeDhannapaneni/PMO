'use client';

import { useRouter } from 'next/navigation';
import { useCreateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import type { CreateProjectInput } from '@/types';

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

  const handleSubmit = async (data: CreateProjectInput) => {
    try {
      await createProject.mutateAsync(data);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to create project:', error);
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
      />
    </div>
  );
}
