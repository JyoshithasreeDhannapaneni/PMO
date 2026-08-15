'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { projectsApi, dashboardApi, statusReportsApi, managerGoalsApi, migrationTypeApi, pocProjectsApi, accountManagerApi, customerSuccessApi, hubspotApi, psEngagementsApi, kbArticlesApi, emailHygieneApi, callHygieneApi, callTranscriptsApi, escalationMailsApi } from '@/services/api';
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
  accountManager?: string;
  excludeStatus?: string;
  clientName?: string;
}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getAll(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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

// ── POC / Account Manager / Customer Success Hooks ───────────────────────────

export function usePocProjects(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['poc-projects', params],
    queryFn: () => pocProjectsApi.getAll(params),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => pocProjectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
    },
  });
}

export function useUpdatePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      pocProjectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
    },
  });
}

export function useDeletePocProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poc-projects'] });
      queryClient.invalidateQueries({ queryKey: ['account-manager-view'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAccountManagerView() {
  return useQuery({
    queryKey: ['account-manager-view'],
    queryFn: () => accountManagerApi.getView(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCustomerSuccess() {
  return useQuery({
    queryKey: ['customer-success'],
    queryFn: () => customerSuccessApi.getView(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useHubspotSignals() {
  return useQuery({
    queryKey: ['hubspot-signals'],
    queryFn: () => hubspotApi.getSignals(),
    staleTime: 14 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useHubspotInsights() {
  return useQuery({
    queryKey: ['hubspot-insights'],
    queryFn: () => hubspotApi.getInsights(),
    staleTime: 14 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateCustomerSuccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Record<string, any> }) =>
      customerSuccessApi.updateEntry(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-success'] }),
  });
}

export function usePsEngagements() {
  return useQuery({
    queryKey: ['ps-engagements'],
    queryFn: () => psEngagementsApi.getAll(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreatePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (engagement: any) => psEngagementsApi.create(engagement),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
  });
}

export function useUpdatePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => psEngagementsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
  });
}

export function useDeletePsEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => psEngagementsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ps-engagements'] }),
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
const authFetch = (url: string, opts?: RequestInit) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(url, { ...opts, headers: { ...authHeader, ...(opts?.headers ?? {}) } }).then(r => r.json());
};

export function useAllUsers() {
  return useQuery({
    queryKey: ['all-users'],
    queryFn: () => authFetch(`${API_BASE}/api/auth/users`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraStatus() {
  return useQuery({
    queryKey: ['jira-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/status`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraOAuthStatus() {
  return useQuery({
    queryKey: ['jira-oauth-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/oauth/status`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useJiraSla(managerName: string | null) {
  return useQuery({
    queryKey: ['jira-sla', managerName],
    queryFn: () => authFetch(`${API_BASE}/api/jira/sla?manager=${encodeURIComponent(managerName!)}`),
    enabled: !!managerName,
    staleTime: 0,
  });
}

export function useJiraEngineers() {
  return useQuery({
    queryKey: ['jira-engineers'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/engineers`),
    staleTime: 5 * 60_000,
  });
}

export function useJiraExcelStatus() {
  return useQuery({
    queryKey: ['jira-excel-status'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/excel/status`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useEngineersByManager() {
  return useQuery({
    queryKey: ['jira-engineers-by-manager'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/engineers-by-manager`),
    staleTime: 30_000,
  });
}


export function useJiraBoardTickets() {
  return useQuery({
    queryKey: ['jira-board'],
    queryFn: () => authFetch(`${API_BASE}/api/jira/board`),
    staleTime: 5 * 60_000,
  });
}

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

export function useMarkOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overageAmount, notes, extendedStartDate, extendedEndDate }: { id: string; overageAmount?: number; notes?: string; extendedStartDate?: string; extendedEndDate?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/mark-overage/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ overageAmount, notes, extendedStartDate, extendedEndDate }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overageAmount, notes, extendedStartDate, extendedEndDate }: { id: string; overageAmount?: number; notes?: string; extendedStartDate?: string; extendedEndDate?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/update-overage/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ overageAmount, notes, extendedStartDate, extendedEndDate }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUnmarkOverageProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/unmark-overage/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteOverageHistoryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (historyId: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/overage-history/${historyId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overagedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useEscalateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority, notes }: { id: string; priority: 'LOW' | 'MEDIUM' | 'HIGH'; notes?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalate/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ priority, notes }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeescalateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/deescalate/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAtRiskProjects(manager?: string) {
  return useQuery({
    queryKey: ['atRiskProjects', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/at-risk-projects${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useMarkAtRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/mark-at-risk/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ notes }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atRiskProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUnmarkAtRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/unmark-at-risk/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atRiskProjects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useArchivedEscalations(manager?: string) {
  return useQuery({
    queryKey: ['archivedEscalations', manager],
    queryFn: () => authFetch(`${API_BASE}/api/dashboard/archived-escalations${manager ? `?manager=${encodeURIComponent(manager)}` : ''}`),
    staleTime: 0,
  });
}

export function useArchiveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/archive-escalation/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['archivedEscalations'] });
    },
  });
}

export function useUnarchiveEscalation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/unarchive-escalation/${id}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalatedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['archivedEscalations'] });
    },
  });
}

export function useEscalationDailyNotes(projectId: string | null, columnName?: string) {
  return useQuery({
    queryKey: ['escalationDailyNotes', projectId, columnName],
    queryFn: () => {
      const params = columnName ? `?columnName=${encodeURIComponent(columnName)}` : '';
      return authFetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}${params}`);
    },
    enabled: !!projectId,
    staleTime: 0,
  });
}

export function useAddEscalationDailyNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, note, author, noteDate, columnName }: { projectId: string; note: string; author?: string; noteDate?: string; columnName?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ note, author, noteDate, columnName }),
      }).then(r => r.json());
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escalationDailyNotes', vars.projectId] });
    },
  });
}

export function useDeleteEscalationDailyNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, noteId }: { projectId: string; noteId: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/dashboard/escalation-daily-notes/${projectId}/${noteId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['escalationDailyNotes', vars.projectId] });
    },
  });
}

export function useDealDeskDeals(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  matchType?: string;
}) {
  const search = params?.search || '';
  const status = params?.status || '';
  const matchType = params?.matchType || '';
  const page = params?.page || 1;
  const limit = params?.limit || 25;
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    ...(matchType ? { matchType } : {}),
  }).toString();
  return useQuery({
    queryKey: ['dealDeskDeals', page, limit, status, search, matchType],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk?${qs}`),
    staleTime: 60_000,
  });
}

export function useDealDeskStats() {
  return useQuery({
    queryKey: ['dealDeskStats'],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk/stats`),
    staleTime: 60_000,
  });
}

export function useDealDeskConfig() {
  return useQuery({
    queryKey: ['dealDeskConfig'],
    queryFn: () => authFetch(`${API_BASE}/api/deal-desk/config`),
    staleTime: 5 * 60_000,
  });
}

export function useTriggerDealDeskPoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/deal-desk/poll`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealDeskDeals'] });
      queryClient.invalidateQueries({ queryKey: ['dealDeskStats'] });
    },
  });
}

export function useImportSendGridHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (daysBack: number) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/deal-desk/import-history?daysBack=${daysBack}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealDeskDeals'] });
      queryClient.invalidateQueries({ queryKey: ['dealDeskStats'] });
    },
  });
}

export function useUpdateDealMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, matchedPsId, matchedProjectId }: { id: string; matchedPsId?: string; matchedProjectId?: string }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      return fetch(`${API_BASE}/api/deal-desk/${id}/match`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ matchedPsId, matchedProjectId }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealDeskDeals'] });
    },
  });
}

// ─── NTA Ticketing ───────────────────────────────────────────────────────────

let _ntaOfflineUntil = 0;
const NTA_FRONTEND_COOLDOWN = 60_000;

function ntaFetch(path: string) {
  if (Date.now() < _ntaOfflineUntil) {
    return Promise.reject(new Error('NTA service offline'));
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(`${API_BASE}/api/ticketing${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async r => {
    if (r.status === 503) {
      _ntaOfflineUntil = Date.now() + NTA_FRONTEND_COOLDOWN;
    }
    return r.json();
  });
}

const NTA_QUERY_OPTS = { retry: 0, refetchOnWindowFocus: false, refetchOnMount: false } as const;

export function useNtaSyncStatus() {
  return useQuery({
    queryKey: ['ntaSyncStatus'],
    queryFn: () => ntaFetch('/sync'),
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...NTA_QUERY_OPTS,
  });
}

export function triggerNtaSync(): Promise<any> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(`${API_BASE}/api/ticketing/sync`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => r.json());
}

export function useNtaCustomerTickets(customerNames: string[]) {
  const key = customerNames.slice().sort().join(',');
  return useQuery({
    queryKey: ['ntaCustomerTickets', key],
    queryFn: () => ntaFetch(`/by-customers?customers=${encodeURIComponent(key)}`),
    enabled: customerNames.length > 0,
    staleTime: 120_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaStats() {
  return useQuery({
    queryKey: ['ntaStats'],
    queryFn: () => ntaFetch('/stats'),
    staleTime: 60_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaEnabled() {
  return useQuery({
    queryKey: ['ntaConfig'],
    queryFn: () => ntaFetch('/config'),
    staleTime: 5 * 60_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_BASE}/api/ticketing/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      return body;
    },
    onSuccess: (_data, enabled) => {
      queryClient.setQueryData(['ntaConfig'], (old: any) => {
        if (!old) return old;
        return { ...old, data: { ...old.data, enabled } };
      });
      queryClient.invalidateQueries({ queryKey: ['ntaConfig'] });
    },
    onError: (err: Error) => {
      console.error('NTA toggle failed:', err.message);
    },
  });
}

export function useNtaSpaces() {
  return useQuery({
    queryKey: ['ntaSpaces'],
    queryFn: () => ntaFetch('/spaces'),
    staleTime: 300_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaAssignees() {
  return useQuery({
    queryKey: ['ntaAssignees'],
    queryFn: () => ntaFetch('/assignees'),
    staleTime: 300_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaReporters() {
  return useQuery({
    queryKey: ['ntaReporters'],
    queryFn: () => ntaFetch('/reporters'),
    staleTime: 300_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaProjectManagers() {
  return useQuery({
    queryKey: ['ntaProjectManagers'],
    queryFn: () => ntaFetch('/project-managers'),
    staleTime: 300_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaDepartments() {
  return useQuery({
    queryKey: ['ntaDepartments'],
    queryFn: () => ntaFetch('/departments'),
    staleTime: 300_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaByManagers(managers: string[]) {
  const pm = managers.join(',');
  return useQuery({
    queryKey: ['ntaByManagers', pm],
    queryFn: () => ntaFetch(`/search?projectManager=${encodeURIComponent(pm)}`),
    enabled: managers.length > 0,
    staleTime: 60_000,
    ...NTA_QUERY_OPTS,
  });
}

export function useNtaIssues(params: { page?: number; limit?: number; spaces?: string }) {
  return useQuery({
    queryKey: ['ntaIssues', params],
    queryFn: () => {
      const qs = new URLSearchParams({
        page: String(params.page || 1),
        limit: String(params.limit || 50),
        ...(params.spaces ? { spaces: params.spaces } : {}),
      });
      return ntaFetch(`/issues?${qs}`);
    },
    staleTime: 30_000,
    ...NTA_QUERY_OPTS,
  });
}

export interface NtaSearchFilters {
  key?: string;
  summary?: string;
  status?: string;
  priority?: string;
  customer?: string;
  assignee?: string;
  reporter?: string;
  projectManager?: string;
  department?: string;
  spaces?: string;
  createdFrom?: string;
  createdTo?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useNtaSearch(filters: NtaSearchFilters) {
  const debounced = useDebounce(filters, 350);
  const hasFilter = Object.values(debounced).some((v) => v && v.trim() !== '');
  return useQuery({
    queryKey: ['ntaSearch', debounced],
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(debounced).forEach(([k, v]) => { if (v) qs.set(k, v); });
      return ntaFetch(`/search?${qs}`);
    },
    enabled: hasFilter,
    staleTime: 60_000,
  });
}

export interface NtaTrendBucket {
  key: string;
  label: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
}

export function useNtaTrends(params: NtaSearchFilters & { groupBy: 'week' | 'month'; enabled?: boolean }) {
  const { groupBy, enabled, ...filters } = params;
  return useQuery({
    queryKey: ['ntaTrends', groupBy, filters],
    queryFn: () => {
      const qs = new URLSearchParams({ groupBy });
      Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
      return ntaFetch(`/trends?${qs}`);
    },
    enabled: enabled ?? true,
    staleTime: 60_000,
  });
}

export function useKbArticles(params?: { search?: string; category?: string; caseStudyId?: string }) {
  return useQuery({
    queryKey: ['kb-articles', params],
    queryFn: () => kbArticlesApi.getAll(params),
    staleTime: 30_000,
  });
}

export function useExtractKbArticles() {
  return useMutation({
    mutationFn: (caseStudyId: string) => kbArticlesApi.extract(caseStudyId),
  });
}

export function useBulkSaveKbArticles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseStudyId, articles }: { caseStudyId: string; articles: any[] }) =>
      kbArticlesApi.bulkSave(caseStudyId, articles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });
}

export function useUpdateKbArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => kbArticlesApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });
}

export function useDeleteKbArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbArticlesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientName: string) => projectsApi.deleteClient(clientName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
}

export function useClientSummary(clientName: string) {
  return useQuery({
    queryKey: ['client-summary', clientName],
    queryFn: () => projectsApi.getClientSummary(clientName),
    enabled: !!clientName,
    staleTime: 30_000,
  });
}

export function useEmailHygiene(enabled = true) {
  return useQuery({
    queryKey: ['email-hygiene'],
    queryFn: () => emailHygieneApi.getMetrics(false),
    enabled,
    staleTime: Infinity,        // always serve DB cache — cron refreshes at 7 AM IST
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
  });
}

export function useCallHygiene(enabled = true) {
  return useQuery({
    queryKey: ['call-hygiene'],
    queryFn: () => callHygieneApi.getMetrics(false),
    enabled,
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 0, // First fetch can take 2-4 min — don't retry on timeout
  });
}

export function useCallTranscriptRating(eventId: string | null, userEmail: string | null) {
  return useQuery({
    queryKey: ['call-transcript-rating', eventId, userEmail],
    queryFn: () => callTranscriptsApi.getRating(eventId!, userEmail!),
    enabled: !!eventId && !!userEmail,
    staleTime: Infinity, // a graded call's rating doesn't change until re-graded
    retry: 0,
  });
}

export function useRateCallTranscript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      eventId: string;
      subject: string;
      meetingStart: string | null;
      organizerEmail: string;
      joinUrl: string;
      internalUserEmail: string;
      internalUserName: string;
      customerAttendees: Array<{ name: string; email: string }>;
    }) => callTranscriptsApi.rate(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['call-transcript-rating', variables.eventId, variables.internalUserEmail] });
    },
  });
}

// ─── Zenop Docs ───────────────────────────────────────────────────────────────

export function useDocsDocuments() {
  return useQuery({
    queryKey: ['docs-documents'],
    queryFn: () => authFetch('/api/docs/documents'),
    staleTime: 60_000,
  });
}

export function useDocsDocument(id: string | null) {
  return useQuery({
    queryKey: ['docs-document', id],
    queryFn: () => authFetch(`/api/docs/documents/${id}`),
    enabled: !!id,
    staleTime: 300_000,
  });
}

export function useDocsQuotes() {
  return useQuery({
    queryKey: ['docs-quotes'],
    queryFn: () => authFetch('/api/docs/quotes'),
    staleTime: 60_000,
  });
}

export function useProcessDocsDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, projectManagerName }: { docId: string; projectManagerName: string }) =>
      authFetch(`/api/docs/documents/${docId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectManagerName }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['docs-documents'] }); },
  });
}

// ── Escalation Mails ──────────────────────────────────────────────────────────
export function useEscalationMails(params?: { owner?: string; issueType?: string; status?: string }) {
  return useQuery({
    queryKey: ['escalation-mails', params],
    queryFn: () => escalationMailsApi.getAll(params),
    staleTime: 30_000,
  });
}

export function useEscalationStats() {
  return useQuery({
    queryKey: ['escalation-mails', 'stats'],
    queryFn: () => escalationMailsApi.getStats(),
    staleTime: 30_000,
  });
}

export function useEscalationConfig() {
  return useQuery({
    queryKey: ['escalation-mails', 'config'],
    queryFn: () => escalationMailsApi.getConfig(),
    staleTime: 60_000,
  });
}

export function useParseEscalationMail() {
  return useMutation({
    mutationFn: (input: { file?: File; rawMail?: string }) =>
      input.file ? escalationMailsApi.parseFile(input.file) : escalationMailsApi.parseText(input.rawMail || ''),
  });
}

export function useCreateEscalationMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => escalationMailsApi.create(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

export function useUpdateEscalationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => escalationMailsApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

export function useUpdateEscalationReceivedAt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, receivedAt }: { id: string; receivedAt: string }) => escalationMailsApi.updateReceivedAt(id, receivedAt),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

type RcaDoc = { url: string; name: string };

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolvedAt, rca, rcaDocs }: { id: string; resolvedAt: string; rca: string; rcaDocs?: RcaDoc[] }) => escalationMailsApi.resolve(id, { resolvedAt, rca, rcaDocs }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

export function useUpdateEscalationResolution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolvedAt, rca, rcaDocs }: { id: string; resolvedAt?: string; rca?: string; rcaDocs?: RcaDoc[] }) => escalationMailsApi.updateResolution(id, { resolvedAt, rca, rcaDocs }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

export function useUploadRcaDocs() {
  return useMutation({
    mutationFn: (files: File[]) => escalationMailsApi.uploadRcaDocs(files),
  });
}

export function useUploadEscalationMedia() {
  return useMutation({
    mutationFn: (files: File[]) => escalationMailsApi.uploadMedia(files),
  });
}

export function useUpdateEscalationOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, escalationOwner }: { id: string; escalationOwner: string }) => escalationMailsApi.updateOwner(id, escalationOwner),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}

export function useDeleteEscalationMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => escalationMailsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-mails'] }); },
  });
}
