'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface MigrationType {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  category?: string;
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
    { id: '1', code: 'BOX_ONEDRIVE', name: 'Box - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '2', code: 'BOX_SHAREPOINT', name: 'Box - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '3', code: 'BOX_MYDRIVE', name: 'Box - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '4', code: 'BOX_SHAREDDRIVE', name: 'Box - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '5', code: 'BOX_DROPBOX', name: 'Box - Dropbox', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '6', code: 'BOX_BOX', name: 'Box - Box', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '7', code: 'BOX_CITRIX', name: 'Box - Citrix', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '8', code: 'BOX_AMAZONS3', name: 'Box - Amazon S3', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '9', code: 'BOX_MICROSOFT', name: 'Box - Microsoft', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '10', code: 'DROPBOX_ONEDRIVE', name: 'Dropbox - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '11', code: 'DROPBOX_SHAREPOINT', name: 'Dropbox - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '12', code: 'DROPBOX_MYDRIVE', name: 'Dropbox - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '13', code: 'DROPBOX_SHAREDDRIVE', name: 'Dropbox - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '14', code: 'DROPBOX_BOX', name: 'Dropbox - Box', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '15', code: 'DROPBOX_AZURE', name: 'Dropbox - Azure', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '16', code: 'DROPBOX_EGNYTE', name: 'Dropbox - Egnyte', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '17', code: 'MYDRIVE_ONEDRIVE', name: 'MyDrive - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '18', code: 'MYDRIVE_SHAREPOINT', name: 'MyDrive - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '19', code: 'MYDRIVE_DROPBOX', name: 'MyDrive - Dropbox', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '20', code: 'MYDRIVE_EGNYTE', name: 'MyDrive - Egnyte', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '21', code: 'MYDRIVE_BOX', name: 'MyDrive - Box', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '22', code: 'MYDRIVE_MYDRIVE', name: 'MyDrive - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '23', code: 'SHAREDDRIVE_SHAREDDRIVE', name: 'Shared Drive - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '24', code: 'SHAREDDRIVE_SHAREPOINT', name: 'Shared Drive - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '25', code: 'SHAREDDRIVE_EGNYTE', name: 'Shared Drive - Egnyte', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '26', code: 'SHAREDDRIVE_ONEDRIVE', name: 'Shared Drive - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '27', code: 'SHAREDDRIVE_AMAZONS3', name: 'Shared Drive - Amazon S3', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '28', code: 'SHAREDDRIVE_AZURE', name: 'Shared Drive - Azure', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '29', code: 'SHAREPOINT_SHAREDDRIVE', name: 'SharePoint - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '30', code: 'SHAREPOINT_MYDRIVE', name: 'SharePoint - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '31', code: 'SHAREPOINT_SHAREPOINT', name: 'SharePoint - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '32', code: 'SHAREPOINT_EGNYTE', name: 'SharePoint - Egnyte', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '33', code: 'SHAREPOINT_AZURE', name: 'SharePoint - Azure', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '34', code: 'SHAREPOINT_AMAZONS3', name: 'SharePoint - Amazon S3', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '35', code: 'SHAREFILE_SHAREPOINT', name: 'ShareFile - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '36', code: 'SHAREFILE_SHAREDDRIVE', name: 'ShareFile - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '37', code: 'SHAREFILE_AMAZONS3', name: 'ShareFile - Amazon S3', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '38', code: 'SHAREFILE_AZURE', name: 'ShareFile - Azure', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '39', code: 'CITRIX_ONEDRIVE', name: 'Citrix - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '40', code: 'CITRIX_SHAREPOINT', name: 'Citrix - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '41', code: 'CITRIX_MYDRIVE', name: 'Citrix - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '42', code: 'CITRIX_SHAREDDRIVE', name: 'Citrix - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '43', code: 'CITRIX_CITRIX', name: 'Citrix - Citrix', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '44', code: 'EGNYTE_ONEDRIVE', name: 'Egnyte - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '45', code: 'EGNYTE_SHAREPOINT', name: 'Egnyte - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '46', code: 'EGNYTE_MYDRIVE', name: 'Egnyte - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '47', code: 'EGNYTE_SHAREDDRIVE', name: 'Egnyte - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '48', code: 'EGNYTE_AZURE', name: 'Egnyte - Azure', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '49', code: 'NFS_ONEDRIVE', name: 'NFS - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '50', code: 'NFS_SHAREPOINT', name: 'NFS - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '51', code: 'NFS_MYDRIVE', name: 'NFS - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '52', code: 'NFS_SHAREDDRIVE', name: 'NFS - Shared Drive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '53', code: 'ONEDRIVE_AMAZONS3', name: 'OneDrive - Amazon S3', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '54', code: 'ONEDRIVE_ONEDRIVE', name: 'OneDrive - OneDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '55', code: 'ONEDRIVE_MYDRIVE', name: 'OneDrive - MyDrive', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '56', code: 'AMAZONS3_SHAREPOINT', name: 'Amazon S3 - SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '57', code: 'AMAZONWORKDOCS_NFS', name: 'Amazon WorkDocs - NFS', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '58', code: 'AMAZONWORKDOCS_ONEDRIVE_SHAREPOINT', name: 'Amazon WorkDocs - OneDrive/SharePoint', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '59', code: 'DRIVE_CHANGE', name: 'Drive Change', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
    { id: '60', code: 'SLACK_SLACK', name: 'Slack - Slack', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '61', code: 'CHAT_CHAT', name: 'Chat - Chat', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '62', code: 'TEAMS_TEAMS', name: 'Teams - Teams', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '63', code: 'META_CHAT', name: 'Meta - Chat', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '64', code: 'META_VIVA', name: 'Meta - Viva', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '65', code: 'META_TEAMS', name: 'Meta - Teams', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '66', code: 'SLACK_TEAMS', name: 'Slack - Teams', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '67', code: 'SLACK_CHAT', name: 'Slack - Chat', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '68', code: 'TEAMS_CHAT', name: 'Teams - Chat', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '69', code: 'CHAT_TEAMS', name: 'Chat - Teams', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '70', code: 'CHAT_TEAM', name: 'Chat - Team', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '71', code: 'TEAMS_SLACK', name: 'Teams - Slack', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '72', code: 'CHAT_SLACK', name: 'Chat - Slack', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
    { id: '73', code: 'GMAIL_GMAIL', name: 'Gmail - Gmail', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
    { id: '74', code: 'GMAIL_OUTLOOK', name: 'Gmail - Outlook', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
    { id: '75', code: 'OUTLOOK_OUTLOOK', name: 'Outlook - Outlook', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
    { id: '76', code: 'OUTLOOK_GMAIL', name: 'Outlook - Gmail', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
    { id: '77', code: 'OTHER', name: 'Other', icon: '⚙️', color: '#6B7280', enabled: true, category: 'Other' },
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

const toCode = (name: string) =>
  name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

function mergeWithDefaults(saved: any): PMOSettings {
  const savedPlanTypes = saved?.planTypes?.length
    ? saved.planTypes.map((p: any) => ({ ...p, code: p.code || toCode(p.name) }))
    : defaultSettings.planTypes;
  const savedPhases = saved?.phases?.length
    ? saved.phases.map((p: any) => ({ ...p, code: p.code || toCode(p.name) }))
    : defaultSettings.phases;
  return {
    ...defaultSettings,
    ...saved,
    migrationTypes: saved?.migrationTypes?.length ? saved.migrationTypes : defaultSettings.migrationTypes,
    sourcePlatforms: saved?.sourcePlatforms?.length ? saved.sourcePlatforms : defaultSettings.sourcePlatforms,
    targetPlatforms: saved?.targetPlatforms?.length ? saved.targetPlatforms : defaultSettings.targetPlatforms,
    planTypes: savedPlanTypes,
    phases: savedPhases,
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
