'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, dashboardApi, statusReportsApi } from '@/services/api';
import type { CreateProjectInput, UpdateProjectInput } from '@/types';

export function useProjects(params?: {
  page?: number;
  limit?: number;
  status?: string;
  phase?: string;
  delayStatus?: string;
  planType?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getAll(params),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (project: CreateProjectInput) => {
      const result = await projectsApi.create(project);
      // Auto-generate the first weekly report for the new project
      if (result?.data?.id) {
        try {
          await statusReportsApi.generateWeekly(result.data.id, 'system');
        } catch {
          // Non-blocking — project is created even if report generation fails
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      projectsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['statusReports', variables.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDashboard(manager?: string) {
  return useQuery({
    queryKey: ['dashboard', manager],
    queryFn: () => dashboardApi.getOverview(manager),
  });
}

export function useDelayedProjects() {
  return useQuery({
    queryKey: ['projects', 'delayed'],
    queryFn: () => projectsApi.getDelayed(),
  });
}

// ── Weekly Report Hooks ───────────────────────────────────────────────────────

export function useStatusReports(projectId: string) {
  return useQuery({
    queryKey: ['statusReports', projectId],
    queryFn: () => statusReportsApi.getByProject(projectId),
    enabled: !!projectId,
  });
}

export function useLatestStatusReport(projectId: string) {
  return useQuery({
    queryKey: ['statusReports', projectId, 'latest'],
    queryFn: () => statusReportsApi.getLatest(projectId),
    enabled: !!projectId,
  });
}

export function useGenerateWeeklyReport(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (createdBy: string) =>
      statusReportsApi.generateWeekly(projectId, createdBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statusReports', projectId] });
    },
  });
}
