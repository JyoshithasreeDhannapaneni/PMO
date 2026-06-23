'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { CreateProjectInput } from '@/types';

interface EditProjectPageProps {
  params: { id: string };
}

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, error } = useProject(params.id);
  const updateProject = useUpdateProject();
  const { showToast } = useToast();

  useEffect(() => {
    if (user && user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER') {
      router.replace(`/projects/${params.id}`);
    }
  }, [user, params.id, router]);

  if (user && user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER') return null;

  const handleSubmit = async (formData: CreateProjectInput) => {
    try {
      await updateProject.mutateAsync({ id: params.id, data: formData });
      showToast('success', 'Project updated!');
      if (formData.status === 'COMPLETED' || formData.status === 'CANCELLED') {
        router.push(`/case-studies?projectId=${params.id}`);
      } else {
        router.push(`/projects/${params.id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to update project';
      showToast('error', 'Update failed', msg);
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
        className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back to Project
      </Link>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Project</h1>
        <p className="text-slate-500 mt-1">Update the project details</p>
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
