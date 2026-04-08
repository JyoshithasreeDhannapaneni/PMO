'use client';

import { useProject } from '@/hooks/useProjects';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { Button } from '@/components/ui/Button';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ProjectPageProps {
  params: { id: string };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { data, isLoading, error } = useProject(params.id);

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
    <div className="animate-fadeIn">
      {/* Back button */}
      <Link href="/projects" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} className="mr-1" />
        Back to Projects
      </Link>

      {/* Project Detail */}
      <ProjectDetail project={data.data} />
    </div>
  );
}
