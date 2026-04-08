'use client';

import { useRouter } from 'next/navigation';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { Button } from '@/components/ui/Button';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { CreateProjectInput } from '@/types';

interface EditProjectPageProps {
  params: { id: string };
}

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const router = useRouter();
  const { data, isLoading, error } = useProject(params.id);
  const updateProject = useUpdateProject();

  const handleSubmit = async (formData: CreateProjectInput) => {
    try {
      await updateProject.mutateAsync({ id: params.id, data: formData });
      router.push(`/projects/${params.id}`);
    } catch (error) {
      console.error('Failed to update project:', error);
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
        <p className="text-sm text-gray-500 mt-2">The project may not exist or there was an error</p>
        <Link href="/projects" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft size={16} className="mr-2" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {/* Back button */}
      <Link 
        href={`/projects/${params.id}`} 
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back to Project
      </Link>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Project</h1>
        <p className="text-gray-500 mt-1">Update the project details</p>
      </div>

      {/* Form */}
      <ProjectForm 
        project={data.data}
        onSubmit={handleSubmit} 
        isLoading={updateProject.isPending}
      />
    </div>
  );
}
