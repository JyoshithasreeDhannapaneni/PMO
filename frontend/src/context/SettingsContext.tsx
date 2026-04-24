'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface MigrationType {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
}

export interface Platform {
  id: string;
  name: string;
  category: string;
}

export interface PlanType {
  id: string;
  name: string;
  code: string;
  color: string;
  features: string[];
}

export interface ProjectPhase {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string;
  order: number;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  delayAlerts: boolean;
  phaseCompletion: boolean;
  projectCompletion: boolean;
  caseStudyReminders: boolean;
  reminderFrequency: string;
}

export interface AlertThresholds {
  atRiskDays: number;
  delayedDays: number;
  caseStudyReminderDays: number;
}

export interface BrandingSettings {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  theme: 'light' | 'dark';
}

export interface DashboardSettings {
  defaultDateRange: string;
  itemsPerPage: number;
  showDelayedProjects: boolean;
  showUpcomingDeadlines: boolean;
  showRecentActivity: boolean;
  showCharts: boolean;
}

export interface PMOSettings {
  migrationTypes: MigrationType[];
  sourcePlatforms: Platform[];
  targetPlatforms: Platform[];
  planTypes: PlanType[];
  phases: ProjectPhase[];
  notificationSettings: NotificationSettings;
  alertThresholds: AlertThresholds;
  brandingSettings: BrandingSettings;
  dashboardSettings: DashboardSettings;
}

const defaultSettings: PMOSettings = {
  migrationTypes: [
    { id: 'content', code: 'CONTENT', name: 'Content Migration', icon: '📁', color: '#3B82F6', enabled: true },
    { id: 'email', code: 'EMAIL', name: 'Email Migration', icon: '📧', color: '#10B981', enabled: true },
    { id: 'messaging', code: 'MESSAGING', name: 'Messaging Migration', icon: '💬', color: '#8B5CF6', enabled: true },
  ],
  sourcePlatforms: [
    { id: '1', name: 'On-Premise Exchange', category: 'Email' },
    { id: '2', name: 'Google Workspace', category: 'Email' },
    { id: '3', name: 'Lotus Notes', category: 'Email' },
    { id: '4', name: 'On-Premise SharePoint', category: 'Content' },
    { id: '5', name: 'File Servers', category: 'Content' },
    { id: '6', name: 'Box', category: 'Content' },
    { id: '7', name: 'Dropbox', category: 'Content' },
    { id: '8', name: 'Google Drive', category: 'Content' },
    { id: '9', name: 'Slack', category: 'Messaging' },
    { id: '10', name: 'Skype for Business', category: 'Messaging' },
    { id: '11', name: 'Cisco Webex', category: 'Messaging' },
    { id: '12', name: 'Zoom', category: 'Messaging' },
  ],
  targetPlatforms: [
    { id: '1', name: 'Microsoft 365', category: 'Suite' },
    { id: '2', name: 'Exchange Online', category: 'Email' },
    { id: '3', name: 'SharePoint Online', category: 'Content' },
    { id: '4', name: 'OneDrive for Business', category: 'Content' },
    { id: '5', name: 'Microsoft Teams', category: 'Messaging' },
    { id: '6', name: 'Azure', category: 'Cloud' },
    { id: '7', name: 'AWS', category: 'Cloud' },
    { id: '8', name: 'Google Cloud', category: 'Cloud' },
  ],
  planTypes: [
    { id: '1', name: 'Bronze', code: 'BRONZE', color: '#CD7F32', features: [] },
    { id: '2', name: 'Silver', code: 'SILVER', color: '#C0C0C0', features: [] },
    { id: '3', name: 'Gold', code: 'GOLD', color: '#FFD700', features: [] },
    { id: '4', name: 'Platinum', code: 'PLATINUM', color: '#E5E4E2', features: [] },
  ],
  phases: [
    { id: '1', name: 'Kickoff', code: 'KICKOFF', color: '#8B5CF6', description: '', order: 1 },
    { id: '2', name: 'Migration', code: 'MIGRATION', color: '#3B82F6', description: '', order: 2 },
    { id: '3', name: 'Validation', code: 'VALIDATION', color: '#EAB308', description: '', order: 3 },
    { id: '4', name: 'Closure', code: 'CLOSURE', color: '#10B981', description: '', order: 4 },
    { id: '5', name: 'Completed', code: 'COMPLETED', color: '#6B7280', description: '', order: 5 },
  ],
  notificationSettings: {
    emailEnabled: false,
    delayAlerts: true,
    phaseCompletion: true,
    projectCompletion: true,
    caseStudyReminders: true,
    reminderFrequency: 'weekly',
  },
  alertThresholds: {
    atRiskDays: 3,
    delayedDays: 0,
    caseStudyReminderDays: 7,
  },
  brandingSettings: {
    companyName: 'PMO Tracker',
    primaryColor: '#4F46E5',
    secondaryColor: '#10B981',
    theme: 'light',
  },
  dashboardSettings: {
    defaultDateRange: '30',
    itemsPerPage: 20,
    showDelayedProjects: true,
    showUpcomingDeadlines: true,
    showRecentActivity: true,
    showCharts: true,
  },
};

interface SettingsContextType {
  settings: PMOSettings;
  updateSettings: (partial: Partial<PMOSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'pmoSettings';

function mergeWithDefaults(saved: any): PMOSettings {
  return {
    ...defaultSettings,
    ...saved,
    migrationTypes: saved?.migrationTypes?.length ? saved.migrationTypes : defaultSettings.migrationTypes,
    sourcePlatforms: saved?.sourcePlatforms?.length ? saved.sourcePlatforms : defaultSettings.sourcePlatforms,
    targetPlatforms: saved?.targetPlatforms?.length ? saved.targetPlatforms : defaultSettings.targetPlatforms,
    planTypes: saved?.planTypes?.length ? saved.planTypes : defaultSettings.planTypes,
    phases: saved?.phases?.length ? saved.phases : defaultSettings.phases,
    notificationSettings: { ...defaultSettings.notificationSettings, ...saved?.notificationSettings },
    alertThresholds: { ...defaultSettings.alertThresholds, ...saved?.alertThresholds },
    brandingSettings: { ...defaultSettings.brandingSettings, ...saved?.brandingSettings },
    dashboardSettings: { ...defaultSettings.dashboardSettings, ...saved?.dashboardSettings },
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PMOSettings>(defaultSettings);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSettings(mergeWithDefaults(JSON.parse(saved)));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Listen for changes made in other tabs or by the settings page writing directly to localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setSettings(mergeWithDefaults(JSON.parse(e.newValue)));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateSettings = useCallback((partial: Partial<PMOSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      // Preserve any extra keys (template, teamMembers, etc.) already in localStorage
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...next }));
      } catch {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings));
    setSettings(defaultSettings);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
