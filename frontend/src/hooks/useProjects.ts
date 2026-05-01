'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, dashboardApi, statusReportsApi, managerGoalsApi, migrationTypeApi } from '@/services/api';
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
  projectManager?: string;
}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getAll(params),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useWeeklyReport(manager?: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['weeklyReport', manager, startDate, endDate],
    queryFn: () => dashboardApi.getWeeklyReport(manager, startDate, endDate),
  });
}

export function useManagerStats(manager?: string) {
  return useQuery({
    queryKey: ['managerStats', manager],
    queryFn: () => dashboardApi.getManagerStats(manager),
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

export function useManagerGoals() {
  return useQuery({
    queryKey: ['managerGoals'],
    queryFn: () => managerGoalsApi.getAll(),
  });
}

export function useManagerGoalsWithStats(manager?: string) {
  return useQuery({
    queryKey: ['managerGoalsWithStats', manager],
    queryFn: () => managerGoalsApi.getWithStats(manager),
  });
}

export function useUpsertManagerGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ managerName, goalPct }: { managerName: string; goalPct: number }) =>
      managerGoalsApi.upsert(managerName, goalPct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerGoals'] });
      queryClient.invalidateQueries({ queryKey: ['managerGoalsWithStats'] });
      queryClient.invalidateQueries({ queryKey: ['managerStats'] });
    },
  });
}

export function useProjectsByMigrationType(type: string | null) {
  return useQuery({
    queryKey: ['projectsByMigrationType', type],
    queryFn: () => migrationTypeApi.getProjectsByType(type!),
    enabled: !!type,
  });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const authFetch = (url: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json());
};

export function useOveragedProjects(manager?: string) {
  return useQuery({
    queryKey: ['overagedProjects', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/overaged-projects${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useEscalatedProjects(manager?: string) {
  return useQuery({
    queryKey: ['escalatedProjects', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/escalated-projects${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}
