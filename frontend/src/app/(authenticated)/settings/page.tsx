'use client';

import { useState, useEffect, useCallback } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import {
  Settings,
  FileText,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Bell,
  Users,
  Database,
  Link as LinkIcon,
  Shield,
  LayoutDashboard,
  FolderKanban,
  Mail,
  Clock,
  Upload,
  Eye,
  EyeOff,
  Check,
  X,
  FileDown,
  FileUp,
  Loader2,
  UserPlus,
  UserX,
  UserCheck,
  Search,
  AlertCircle,
  CheckCircle,
  Copy,
  Info,
  Activity,
  AlertTriangle,
  Shuffle
} from 'lucide-react';
import { authApi, projectsApi, apiKeyApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { formatDistanceToNow } from 'date-fns';

// Types
interface PlanType {
  id: string;
  name: string;
  color: string;
  amount?: number;
  slaHours?: number;
}

interface ProjectPhase {
  id: string;
  code?: string;
  name: string;
  order: number;
  color: string;
}

interface NotificationSettings {
  emailEnabled: boolean;
  delayAlerts: boolean;
  phaseCompletion: boolean;
  projectCompletion: boolean;
  caseStudyReminders: boolean;
  reminderFrequency: string;
}

interface AlertThresholds {
  atRiskDays: number;
  delayedDays: number;
  caseStudyReminderDays: number;
}

interface DashboardSettings {
  defaultDateRange: string;
  itemsPerPage: number;
  showDelayedProjects: boolean;
  showUpcomingDeadlines: boolean;
  showRecentActivity: boolean;
  showCharts: boolean;
}

interface BrandingSettings {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  theme: 'light' | 'dark';
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface MigrationType {
  id: string;
  name: string;
  code: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
  category?: string;
}

interface SourcePlatform {
  id: string;
  name: string;
  category: string;
}

interface TargetPlatform {
  id: string;
  name: string;
  category: string;
}

// Default values - Migration Case Study Template
const defaultPlanTypes: PlanType[] = [
  { id: '1', name: 'Bronze', color: '#CD7F32', slaHours: 72 },
  { id: '2', name: 'Silver', color: '#C0C0C0', slaHours: 48 },
  { id: '3', name: 'Gold', color: '#FFD700', slaHours: 24 },
  { id: '4', name: 'Platinum', color: '#E5E4E2', slaHours: 8 },
];

const defaultPhases: ProjectPhase[] = [
  { id: '1', code: 'KICKOFF',    name: 'Kickoff',    order: 1, color: '#3B82F6' },
  { id: '2', code: 'MIGRATION',  name: 'Migration',  order: 2, color: '#F59E0B' },
  { id: '3', code: 'VALIDATION', name: 'Validation', order: 3, color: '#8B5CF6' },
  { id: '4', code: 'CLOSURE',    name: 'Closure',    order: 4, color: '#10B981' },
  { id: '5', code: 'COMPLETED',  name: 'Completed',  order: 5, color: '#6B7280' },
];

const defaultNotificationSettings: NotificationSettings = {
  emailEnabled: true,
  delayAlerts: true,
  phaseCompletion: true,
  projectCompletion: true,
  caseStudyReminders: true,
  reminderFrequency: 'weekly',
};

const defaultAlertThresholds: AlertThresholds = {
  atRiskDays: 3,
  delayedDays: 0,
  caseStudyReminderDays: 7,
};

const defaultDashboardSettings: DashboardSettings = {
  defaultDateRange: '30',
  itemsPerPage: 20,
  showDelayedProjects: true,
  showUpcomingDeadlines: true,
  showRecentActivity: true,
  showCharts: true,
};

const defaultBrandingSettings: BrandingSettings = {
  companyName: 'PMO Tracker',
  primaryColor: '#4F46E5',
  secondaryColor: '#10B981',
  theme: 'light',
};

const defaultTeamMembers: TeamMember[] = [
  { id: '1', name: 'John Smith', email: 'john.smith@company.com', role: 'Project Manager' },
  { id: '2', name: 'Sarah Johnson', email: 'sarah.j@company.com', role: 'Account Manager' },
];

const defaultMigrationTypes: MigrationType[] = [
  { id: '1', code: 'BOX_ONEDRIVE', name: 'Box - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '2', code: 'BOX_SHAREPOINT', name: 'Box - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '3', code: 'BOX_MYDRIVE', name: 'Box - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '4', code: 'BOX_SHAREDDRIVE', name: 'Box - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '5', code: 'BOX_DROPBOX', name: 'Box - Dropbox', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '6', code: 'BOX_BOX', name: 'Box - Box', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '7', code: 'BOX_CITRIX', name: 'Box - Citrix', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '8', code: 'BOX_AMAZONS3', name: 'Box - Amazon S3', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '9', code: 'BOX_MICROSOFT', name: 'Box - Microsoft', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '10', code: 'DROPBOX_ONEDRIVE', name: 'Dropbox - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '11', code: 'DROPBOX_SHAREPOINT', name: 'Dropbox - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '12', code: 'DROPBOX_MYDRIVE', name: 'Dropbox - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '13', code: 'DROPBOX_SHAREDDRIVE', name: 'Dropbox - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '14', code: 'DROPBOX_BOX', name: 'Dropbox - Box', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '15', code: 'DROPBOX_AZURE', name: 'Dropbox - Azure', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '16', code: 'DROPBOX_EGNYTE', name: 'Dropbox - Egnyte', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '17', code: 'MYDRIVE_ONEDRIVE', name: 'MyDrive - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '18', code: 'MYDRIVE_SHAREPOINT', name: 'MyDrive - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '19', code: 'MYDRIVE_DROPBOX', name: 'MyDrive - Dropbox', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '20', code: 'MYDRIVE_EGNYTE', name: 'MyDrive - Egnyte', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '21', code: 'MYDRIVE_BOX', name: 'MyDrive - Box', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '22', code: 'MYDRIVE_MYDRIVE', name: 'MyDrive - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '23', code: 'SHAREDDRIVE_SHAREDDRIVE', name: 'Shared Drive - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '24', code: 'SHAREDDRIVE_SHAREPOINT', name: 'Shared Drive - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '25', code: 'SHAREDDRIVE_EGNYTE', name: 'Shared Drive - Egnyte', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '26', code: 'SHAREDDRIVE_ONEDRIVE', name: 'Shared Drive - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '27', code: 'SHAREDDRIVE_AMAZONS3', name: 'Shared Drive - Amazon S3', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '28', code: 'SHAREDDRIVE_AZURE', name: 'Shared Drive - Azure', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '29', code: 'SHAREPOINT_SHAREDDRIVE', name: 'SharePoint - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '30', code: 'SHAREPOINT_MYDRIVE', name: 'SharePoint - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '31', code: 'SHAREPOINT_SHAREPOINT', name: 'SharePoint - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '32', code: 'SHAREPOINT_EGNYTE', name: 'SharePoint - Egnyte', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '33', code: 'SHAREPOINT_AZURE', name: 'SharePoint - Azure', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '34', code: 'SHAREPOINT_AMAZONS3', name: 'SharePoint - Amazon S3', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '35', code: 'SHAREFILE_SHAREPOINT', name: 'ShareFile - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '36', code: 'SHAREFILE_SHAREDDRIVE', name: 'ShareFile - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '37', code: 'SHAREFILE_AMAZONS3', name: 'ShareFile - Amazon S3', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '38', code: 'SHAREFILE_AZURE', name: 'ShareFile - Azure', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '39', code: 'CITRIX_ONEDRIVE', name: 'Citrix - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '40', code: 'CITRIX_SHAREPOINT', name: 'Citrix - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '41', code: 'CITRIX_MYDRIVE', name: 'Citrix - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '42', code: 'CITRIX_SHAREDDRIVE', name: 'Citrix - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '43', code: 'CITRIX_CITRIX', name: 'Citrix - Citrix', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '44', code: 'EGNYTE_ONEDRIVE', name: 'Egnyte - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '45', code: 'EGNYTE_SHAREPOINT', name: 'Egnyte - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '46', code: 'EGNYTE_MYDRIVE', name: 'Egnyte - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '47', code: 'EGNYTE_SHAREDDRIVE', name: 'Egnyte - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '48', code: 'EGNYTE_AZURE', name: 'Egnyte - Azure', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '49', code: 'NFS_ONEDRIVE', name: 'NFS - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '50', code: 'NFS_SHAREPOINT', name: 'NFS - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '51', code: 'NFS_MYDRIVE', name: 'NFS - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '52', code: 'NFS_SHAREDDRIVE', name: 'NFS - Shared Drive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '53', code: 'ONEDRIVE_AMAZONS3', name: 'OneDrive - Amazon S3', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '54', code: 'ONEDRIVE_ONEDRIVE', name: 'OneDrive - OneDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '55', code: 'ONEDRIVE_MYDRIVE', name: 'OneDrive - MyDrive', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '56', code: 'AMAZONS3_SHAREPOINT', name: 'Amazon S3 - SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '57', code: 'AMAZONWORKDOCS_NFS', name: 'Amazon WorkDocs - NFS', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '58', code: 'AMAZONWORKDOCS_ONEDRIVE_SHAREPOINT', name: 'Amazon WorkDocs - OneDrive/SharePoint', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '59', code: 'DRIVE_CHANGE', name: 'Drive Change', description: '', icon: '📁', color: '#3B82F6', enabled: true, category: 'Content Migration' },
  { id: '60', code: 'SLACK_SLACK', name: 'Slack - Slack', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '61', code: 'CHAT_CHAT', name: 'Chat - Chat', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '62', code: 'TEAMS_TEAMS', name: 'Teams - Teams', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '63', code: 'META_CHAT', name: 'Meta - Chat', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '64', code: 'META_VIVA', name: 'Meta - Viva', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '65', code: 'META_TEAMS', name: 'Meta - Teams', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '66', code: 'SLACK_TEAMS', name: 'Slack - Teams', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '67', code: 'SLACK_CHAT', name: 'Slack - Chat', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '68', code: 'TEAMS_CHAT', name: 'Teams - Chat', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '69', code: 'CHAT_TEAMS', name: 'Chat - Teams', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '70', code: 'CHAT_TEAM', name: 'Chat - Team', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '71', code: 'TEAMS_SLACK', name: 'Teams - Slack', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '72', code: 'CHAT_SLACK', name: 'Chat - Slack', description: '', icon: '💬', color: '#8B5CF6', enabled: true, category: 'Messaging' },
  { id: '73', code: 'GMAIL_GMAIL', name: 'Gmail - Gmail', description: '', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
  { id: '74', code: 'GMAIL_OUTLOOK', name: 'Gmail - Outlook', description: '', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
  { id: '75', code: 'OUTLOOK_OUTLOOK', name: 'Outlook - Outlook', description: '', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
  { id: '76', code: 'OUTLOOK_GMAIL', name: 'Outlook - Gmail', description: '', icon: '📧', color: '#10B981', enabled: true, category: 'Email' },
  { id: '77', code: 'OTHER', name: 'Other', description: '', icon: '⚙️', color: '#6B7280', enabled: true, category: 'Other' },
];

const defaultSourcePlatforms: SourcePlatform[] = [
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
];

const defaultTargetPlatforms: TargetPlatform[] = [
  { id: '1', name: 'Microsoft 365', category: 'Suite' },
  { id: '2', name: 'Exchange Online', category: 'Email' },
  { id: '3', name: 'SharePoint Online', category: 'Content' },
  { id: '4', name: 'OneDrive for Business', category: 'Content' },
  { id: '5', name: 'Microsoft Teams', category: 'Messaging' },
  { id: '6', name: 'Azure', category: 'Cloud' },
  { id: '7', name: 'AWS', category: 'Cloud' },
  { id: '8', name: 'Google Cloud', category: 'Cloud' },
];

// Tab configuration
const tabs = [
  { id: 'migration', name: 'Migration Types', icon: Database },
  { id: 'project', name: 'Project Configuration', icon: FolderKanban },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'team', name: 'Team Management', icon: Users },
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'integrations', name: 'Integrations', icon: LinkIcon },
];

export default function SettingsPage() {
  const { settings: ctxSettings, updateSettings } = useSettings();
  const { user: settingsUser } = useAuth();
  const isViewer = settingsUser?.role === 'VIEWER';
  const [activeTab, setActiveTab] = useState('migration');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const API_KEY_SCOPES = [
    { scope: 'all', label: 'All Data', description: 'Full data export — use this key to access /api/external/all-data' },
    { scope: 'migrationManager', label: 'Migration Manager', description: 'Migration Manager report data — use this key to access /api/external/migration-manager' },
    { scope: 'mbr', label: 'MBR (Monthly Business Review)', description: 'MBR analytics data — use this key to access /api/external/mbr' },
  ] as const;

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({});
  const [regeneratingScope, setRegeneratingScope] = useState<string | null>(null);

  useEffect(() => {
    API_KEY_SCOPES.forEach(({ scope }) => {
      apiKeyApi.get(scope).then((res) => {
        if (res.success) setApiKeys((prev) => ({ ...prev, [scope]: res.data.apiKey }));
      }).catch(() => {});
    });
  }, []);

  const handleRegenerateApiKey = async (scope: string) => {
    if (!window.confirm('Generate a new API key? The old key will stop working immediately for any application using it.')) return;
    setRegeneratingScope(scope);
    try {
      const res = await apiKeyApi.regenerate(scope);
      if (res.success) {
        setApiKeys((prev) => ({ ...prev, [scope]: res.data.apiKey }));
        setApiKeyVisible((prev) => ({ ...prev, [scope]: true }));
        setSaveMessage('New API key generated');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch {
      setSaveMessage('Failed to generate new API key');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setRegeneratingScope(null);
    }
  };

  const handleCopyApiKey = async (scope: string) => {
    const key = apiKeys[scope];
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setSaveMessage('API key copied to clipboard');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // State for all settings — initialised from context (which already read localStorage)
  const [planTypes, setPlanTypes] = useState<PlanType[]>(ctxSettings.planTypes.length ? ctxSettings.planTypes as any : defaultPlanTypes);
  const [phases, setPhases] = useState<ProjectPhase[]>(ctxSettings.phases.length ? ctxSettings.phases as any : defaultPhases);
  const [migrationTypes, setMigrationTypes] = useState<MigrationType[]>(ctxSettings.migrationTypes.length ? ctxSettings.migrationTypes as any : defaultMigrationTypes);
  const [sourcePlatforms, setSourcePlatforms] = useState<SourcePlatform[]>(ctxSettings.sourcePlatforms.length ? ctxSettings.sourcePlatforms as any : defaultSourcePlatforms);
  const [targetPlatforms, setTargetPlatforms] = useState<TargetPlatform[]>(ctxSettings.targetPlatforms.length ? ctxSettings.targetPlatforms as any : defaultTargetPlatforms);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ ...defaultNotificationSettings, ...ctxSettings.notificationSettings });
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>({ ...defaultAlertThresholds, ...ctxSettings.alertThresholds });
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({ ...defaultDashboardSettings, ...ctxSettings.dashboardSettings });
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({ ...defaultBrandingSettings, ...ctxSettings.brandingSettings });
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(defaultTeamMembers);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['1']));
  const [selectedMigType, setSelectedMigType] = useState<string | null>(null);
  const { data: allProjectsData } = useProjects({ limit: 500 });

  // SMTP Settings
  const [smtpSettings, setSmtpSettings] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    user: '',
    password: '',
    fromEmail: 'noreply@company.com',
  });

  // Integration Settings
  const [integrationSettings, setIntegrationSettings] = useState({
    microsoftEnabled: false,
    jiraEnabled: false,
    slackEnabled: false,
    teamsEnabled: false,
    calendarSync: false,
  });

  // Notification test email state
  const [testEmailStatus, setTestEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testEmailRecipient, setTestEmailRecipient] = useState('');

  // Per-notification-type SMTP customization
  const defaultNotifTypeConfigs: Record<string, { recipients: string; subject: string; body: string }> = {
    delayAlerts: { recipients: '', subject: '[PMO] Project Delay Alert: {{projectName}}', body: 'Project {{projectName}} ({{customerName}}) is delayed by {{delayDays}} days.\n\nProject Manager: {{projectManager}}\nPlanned End: {{plannedEnd}}\n\nPlease review and take action.' },
    phaseCompletion: { recipients: '', subject: '[PMO] Phase Completed: {{projectName}} — {{phase}}', body: 'Project {{projectName}} has completed phase: {{phase}}.\n\nProject Manager: {{projectManager}}\nCustomer: {{customerName}}' },
    projectCompletion: { recipients: '', subject: '[PMO] Project Completed: {{projectName}}', body: 'Project {{projectName}} ({{customerName}}) has been marked as completed.\n\nProject Manager: {{projectManager}}\nActual End: {{actualEnd}}\n\nPlease create a case study for this project.' },
    caseStudyReminders: { recipients: '', subject: '[PMO] Case Study Reminder: {{projectName}}', body: 'Reminder: The case study for project {{projectName}} ({{customerName}}) is pending completion.\n\nProject Manager: {{projectManager}}\nPlease complete the case study at your earliest convenience.' },
  };
  const [notifTypeConfigs, setNotifTypeConfigs] = useState<Record<string, { recipients: string; subject: string; body: string }>>(defaultNotifTypeConfigs);
  const [expandedNotifType, setExpandedNotifType] = useState<string | null>(null);

  // Custom notification types (user-created, app-wide triggers)
  interface CustomNotifType {
    id: string;
    key: string;
    label: string;
    desc: string;
    icon: string;
    trigger: string; // event key that fires this notification
    enabled: boolean;
  }
  const TRIGGER_OPTIONS = [
    { value: 'project.status.changed', label: 'Project status changes' },
    { value: 'project.created', label: 'New project created' },
    { value: 'project.completed', label: 'Project completed/cancelled' },
    { value: 'project.delayed', label: 'Project becomes delayed' },
    { value: 'project.escalated', label: 'Project escalated' },
    { value: 'project.overage', label: 'Project marked as overage' },
    { value: 'phase.changed', label: 'Project phase changes' },
    { value: 'case_study.pending', label: 'Case study pending' },
    { value: 'manager.goal.missed', label: 'Manager goal missed' },
    { value: 'weekly', label: 'Weekly (scheduled)' },
    { value: 'monthly', label: 'Monthly (scheduled)' },
  ];
  const [customNotifTypes, setCustomNotifTypes] = useState<CustomNotifType[]>([]);
  const [showAddNotifModal, setShowAddNotifModal] = useState(false);
  const [newNotif, setNewNotif] = useState({ label: '', desc: '', icon: '🔔', trigger: 'project.status.changed' });

  // Load all settings from localStorage once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const OLD_CODES = new Set(['CONTENT', 'EMAIL', 'MESSAGING', 'IDENTITY', 'APPLICATION', 'DATABASE']);
        const isOld = parsed.migrationTypes?.some((t: any) => OLD_CODES.has(t.code));
        const isMissingCategories = parsed.migrationTypes?.some((t: any) => !t.category);
        if (parsed.migrationTypes?.length && !isOld && !isMissingCategories) setMigrationTypes(parsed.migrationTypes);
        if (parsed.planTypes?.length) setPlanTypes(parsed.planTypes);
        if (parsed.phases?.length) setPhases(parsed.phases);
        if (parsed.sourcePlatforms?.length) setSourcePlatforms(parsed.sourcePlatforms);
        if (parsed.targetPlatforms?.length) setTargetPlatforms(parsed.targetPlatforms);
        if (parsed.notificationSettings) setNotificationSettings((p) => ({ ...p, ...parsed.notificationSettings }));
        if (parsed.alertThresholds) setAlertThresholds((p) => ({ ...p, ...parsed.alertThresholds }));
        if (parsed.dashboardSettings) setDashboardSettings((p) => ({ ...p, ...parsed.dashboardSettings }));
        if (parsed.brandingSettings) setBrandingSettings((p) => ({ ...p, ...parsed.brandingSettings }));
        if (parsed.teamMembers) setTeamMembers(parsed.teamMembers);
        if (parsed.smtpSettings) setSmtpSettings(parsed.smtpSettings);
        if (parsed.integrationSettings) setIntegrationSettings(parsed.integrationSettings);
        if (parsed.testEmailRecipient) setTestEmailRecipient(parsed.testEmailRecipient);
        if (parsed.notifTypeConfigs) setNotifTypeConfigs((p) => ({ ...p, ...parsed.notifTypeConfigs }));
        if (parsed.customNotifTypes) setCustomNotifTypes(parsed.customNotifTypes);
      }
    } catch (e) {
      console.error('Failed to load settings');
    }
  }, []);

  // Convert a display name to an uppercase code, e.g. "Gold Plan" → "GOLD_PLAN"
  const toCode = (name: string) =>
    name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

  // Live-sync ALL configurable options to context so ProjectForm dropdowns update instantly
  useEffect(() => {
    updateSettings({
      sourcePlatforms: sourcePlatforms as any,
      targetPlatforms: targetPlatforms as any,
      migrationTypes: migrationTypes as any,
      planTypes: planTypes.map((p: any) => ({ ...p, code: p.code || toCode(p.name) })) as any,
      phases: phases.map((p: any) => ({ ...p, code: p.code || toCode(p.name) })) as any,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePlatforms, targetPlatforms, migrationTypes, planTypes, phases]);

  // Save all settings — single atomic write so no race between context and extras
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // Enrich plan types and phases with auto-generated codes before saving
      const enrichedPlanTypes = planTypes.map((p: any) => ({ ...p, code: p.code || toCode(p.name) }));
      const enrichedPhases = phases.map((p: any) => ({ ...p, code: p.code || toCode(p.name) }));

      // Write EVERYTHING to localStorage in one go (PMOSettings + extras)
      const fullData = {
        migrationTypes,
        sourcePlatforms,
        targetPlatforms,
        planTypes: enrichedPlanTypes,
        phases: enrichedPhases,
        notificationSettings,
        alertThresholds,
        dashboardSettings,
        brandingSettings,
        // extras (not tracked by context)
        teamMembers,
        smtpSettings,
        integrationSettings,
        testEmailRecipient,
        notifTypeConfigs,
        customNotifTypes,
      };
      localStorage.setItem('pmoSettings', JSON.stringify(fullData));
      // Save to API so all users see the changes
      try {
        const apiToken = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        if (apiToken) {
          await fetch(`${apiUrl}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify(fullData),
          });
        }
      } catch (e) { console.error('Failed to save settings to API', e); }

      // Update in-memory context so all consumers (ProjectForm, Header, Sidebar, Dashboard) reflect changes instantly
      updateSettings({
        migrationTypes: migrationTypes as any,
        sourcePlatforms: sourcePlatforms as any,
        targetPlatforms: targetPlatforms as any,
        planTypes: enrichedPlanTypes as any,
        phases: enrichedPhases as any,
        notificationSettings,
        alertThresholds,
        dashboardSettings,
        brandingSettings,
      });

      setSaveMessage('All settings saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle section expansion
  const toggleSection = (id: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSections(newExpanded);
  };

  // Plan type handlers
  const addPlanType = () => {
    const newPlan: PlanType = { id: Date.now().toString(), name: 'New Plan', color: '#6B7280', slaHours: 48 };
    setPlanTypes([...planTypes, newPlan]);
  };

  const removePlanType = (id: string) => {
    setPlanTypes(planTypes.filter((p) => p.id !== id));
  };

  const updatePlanType = (id: string, field: keyof PlanType, value: string | number) => {
    setPlanTypes(planTypes.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  // Phase handlers
  const addPhase = () => {
    const newPhase: ProjectPhase = { id: Date.now().toString(), name: 'New Phase', order: phases.length + 1, color: '#6B7280' };
    setPhases([...phases, newPhase]);
  };

  const removePhase = (id: string) => {
    setPhases(phases.filter((p) => p.id !== id));
  };

  const updatePhase = (id: string, field: keyof ProjectPhase, value: string | number) => {
    setPhases(phases.map((p) => {
      if (p.id !== id) return p;
      const updated: any = { ...p, [field]: value };
      // When name changes, regenerate the code from the new name.
      // Without this, renaming "Completed" → "Delta" keeps code='COMPLETED',
      // causing the dropdown to send value='COMPLETED' and accidentally triggering completion.
      if (field === 'name' && typeof value === 'string') {
        updated.code = toCode(value);
      }
      return updated;
    }));
  };

  // Team member handlers
  const addTeamMember = () => {
    const newMember: TeamMember = { id: Date.now().toString(), name: '', email: '', role: 'Project Manager' };
    setTeamMembers([...teamMembers, newMember]);
  };

  const removeTeamMember = (id: string) => {
    setTeamMembers(teamMembers.filter((m) => m.id !== id));
  };

  const updateTeamMember = (id: string, field: keyof TeamMember, value: string) => {
    setTeamMembers(teamMembers.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };



  const renderProjectConfigTab = () => (
    <div className="space-y-8">
      {/* Plan Types */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Plan Types</h3>
            <p className="text-sm text-gray-500">Configure service tiers and SLA expectations</p>
          </div>
          <Button variant="outline" size="sm" onClick={addPlanType}>
            <Plus size={16} className="mr-1" /> Add Plan
          </Button>
        </div>

        <div className="space-y-3">
          {planTypes.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
              <input type="color" value={plan.color} onChange={(e) => updatePlanType(plan.id, 'color', e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
              <Input className="flex-1" value={plan.name} onChange={(e) => updatePlanType(plan.id, 'name', e.target.value)} placeholder="Plan name" />
              <div className="flex items-center gap-2">
                <Input type="number" className="w-24" value={plan.slaHours} onChange={(e) => updatePlanType(plan.id, 'slaHours', parseInt(e.target.value))} />
                <span className="text-sm text-gray-500">Amount ($)</span>
              </div>
              <button onClick={() => removePlanType(plan.id)} className="p-2 text-red-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Project Phases */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Project Phases</h3>
            <p className="text-sm text-gray-500">Define the lifecycle stages of projects</p>
          </div>
          <Button variant="outline" size="sm" onClick={addPhase}>
            <Plus size={16} className="mr-1" /> Add Phase
          </Button>
        </div>

        <div className="space-y-3">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
              <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-sm font-medium">{index + 1}</span>
              <input type="color" value={phase.color} onChange={(e) => updatePhase(phase.id, 'color', e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
              <Input className="flex-1" value={phase.name} onChange={(e) => updatePhase(phase.id, 'name', e.target.value)} placeholder="Phase name" />
              <button onClick={() => removePhase(phase.id)} className="p-2 text-red-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderNotificationsTab = () => {
    const handleTestEmail = async () => {
      if (!testEmailRecipient) {
        alert('Please enter a recipient email address first.');
        return;
      }
      setTestEmailStatus('sending');
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/notifications/test-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({ to: testEmailRecipient, smtpSettings }),
        });
        setTestEmailStatus('sent');
        setTimeout(() => setTestEmailStatus('idle'), 4000);
      } catch {
        setTestEmailStatus('error');
        setTimeout(() => setTestEmailStatus('idle'), 4000);
      }
    };

    return (
      <div className="space-y-8">
        {/* Master Toggle Banner */}
        <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${
          notificationSettings.emailEnabled ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${notificationSettings.emailEnabled ? 'bg-green-100' : 'bg-gray-200'}`}>
              <Mail className={notificationSettings.emailEnabled ? 'text-green-600' : 'text-gray-400'} size={20} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Email Notifications</p>
              <p className="text-sm text-gray-500">Master toggle — disabling this stops all notification emails</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationSettings.emailEnabled}
              onChange={(e) => setNotificationSettings({ ...notificationSettings, emailEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>

        {/* SMTP Configuration */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">SMTP Configuration</h3>
          <p className="text-sm text-gray-500 mb-4">Configure your email server to send notifications.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="SMTP Host" value={smtpSettings.host} onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })} placeholder="smtp.gmail.com" />
            <Input label="SMTP Port" value={smtpSettings.port} onChange={(e) => setSmtpSettings({ ...smtpSettings, port: e.target.value })} placeholder="587" />
            <Input label="SMTP Username" value={smtpSettings.user} onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })} placeholder="your@email.com" />
            <Input label="SMTP Password" type="password" value={smtpSettings.password} onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })} placeholder="••••••••" />
            <Input label="From Email Address" value={smtpSettings.fromEmail} onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })} className="md:col-span-2" placeholder="noreply@company.com" />
          </div>

          {/* Test Email */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h4 className="text-sm font-semibold text-blue-900 mb-3">Test Email Connection</h4>
            <div className="flex gap-3">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="Recipient email address"
                className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
              <button
                onClick={handleTestEmail}
                disabled={testEmailStatus === 'sending'}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  testEmailStatus === 'sent' ? 'bg-green-500 text-white' :
                  testEmailStatus === 'error' ? 'bg-red-500 text-white' :
                  'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
                }`}
              >
                {testEmailStatus === 'sending' && <Loader2 size={14} className="animate-spin" />}
                {testEmailStatus === 'sent' && <Check size={14} />}
                {testEmailStatus === 'error' && <X size={14} />}
                {testEmailStatus === 'idle' && <Mail size={14} />}
                {testEmailStatus === 'sending' ? 'Sending…' : testEmailStatus === 'sent' ? 'Sent!' : testEmailStatus === 'error' ? 'Failed' : 'Send Test'}
              </button>
            </div>
            {testEmailStatus === 'error' && (
              <p className="mt-2 text-xs text-red-600">Test email failed. Please check your SMTP settings and ensure the backend email service is configured.</p>
            )}
          </div>
        </div>

        {/* Notification Types */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Notification Types</h3>
          <p className="text-sm text-gray-500 mb-4">Enable each type and customize the recipient list, subject line, and email body. Uses the SMTP configuration above.</p>
          <div className="space-y-3">
            {[
              { key: 'delayAlerts', label: 'Delay Alerts', desc: 'Notify when projects become delayed or at-risk', icon: '⚠️' },
              { key: 'phaseCompletion', label: 'Phase Completion', desc: 'Notify when a project phase is marked complete', icon: '✅' },
              { key: 'projectCompletion', label: 'Project Completion', desc: 'Notify when a project is fully completed', icon: '🏁' },
              { key: 'caseStudyReminders', label: 'Case Study Reminders', desc: 'Remind team to create case studies for completed projects', icon: '📋' },
            ].map((item) => {
              const isEnabled = notificationSettings[item.key as keyof NotificationSettings] as boolean;
              const isExpanded = expandedNotifType === item.key;
              const cfg = notifTypeConfigs[item.key] || defaultNotifTypeConfigs[item.key];
              return (
                <div key={item.key} className={`border rounded-xl transition-all ${isEnabled ? 'border-primary-300' : 'border-gray-200'}`}>
                  <div
                    className={`flex items-center justify-between p-4 cursor-pointer ${isEnabled ? 'bg-primary-50' : 'hover:bg-gray-50'} rounded-xl`}
                    onClick={() => setExpandedNotifType(isExpanded ? null : item.key)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {cfg.recipients && <span className="text-xs text-gray-400 hidden sm:block">{cfg.recipients.split(',')[0].trim()}{cfg.recipients.includes(',') ? ' +more' : ''}</span>}
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => setNotificationSettings({ ...notificationSettings, [item.key]: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-4 bg-white rounded-b-xl">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Recipients (comma-separated emails)</label>
                        <input
                          type="text"
                          value={cfg.recipients}
                          onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [item.key]: { ...cfg, recipients: e.target.value } })}
                          placeholder="manager@company.com, admin@company.com"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">Leave blank to use the From email. Overrides per-notification send targets.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Email Subject</label>
                        <input
                          type="text"
                          value={cfg.subject}
                          onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [item.key]: { ...cfg, subject: e.target.value } })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Email Body</label>
                        <textarea
                          rows={5}
                          value={cfg.body}
                          onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [item.key]: { ...cfg, body: e.target.value } })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">
                          Available variables: <code className="bg-gray-100 px-1 rounded">{'{{projectName}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{customerName}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{projectManager}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{delayDays}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{phase}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{plannedEnd}}'}</code>
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (!testEmailRecipient && !cfg.recipients) { alert('Enter a recipient email first.'); return; }
                          setTestEmailStatus('sending');
                          try {
                            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/notifications/test-email`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
                              body: JSON.stringify({
                                to: cfg.recipients || testEmailRecipient,
                                smtpSettings,
                                subject: cfg.subject,
                                body: cfg.body,
                                notificationType: item.key,
                              }),
                            });
                            setTestEmailStatus('sent');
                          } catch { setTestEmailStatus('error'); }
                          setTimeout(() => setTestEmailStatus('idle'), 3000);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Mail size={12} /> Send Test for This Type
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reminder Frequency */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Reminder Frequency</h3>
          <div className="flex gap-3 flex-wrap">
            {[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Bi-weekly' },
              { value: 'monthly', label: 'Monthly' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNotificationSettings({ ...notificationSettings, reminderFrequency: opt.value })}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  notificationSettings.reminderFrequency === opt.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {opt.label}
                {notificationSettings.reminderFrequency === opt.value && <span className="ml-1.5">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Alert Thresholds */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-xl">
              <label className="block text-sm font-medium text-gray-700 mb-2">⚠️ At Risk — days before deadline</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={alertThresholds.atRiskDays}
                  onChange={(e) => setAlertThresholds({ ...alertThresholds, atRiskDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">days</span>
              </div>
            </div>
            <div className="p-4 border border-gray-200 rounded-xl">
              <label className="block text-sm font-medium text-gray-700 mb-2">🔴 Delayed — days past deadline</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={alertThresholds.delayedDays}
                  onChange={(e) => setAlertThresholds({ ...alertThresholds, delayedDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">days</span>
              </div>
            </div>
            <div className="p-4 border border-gray-200 rounded-xl">
              <label className="block text-sm font-medium text-gray-700 mb-2">📋 Case Study — days after completion</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={alertThresholds.caseStudyReminderDays}
                  onChange={(e) => setAlertThresholds({ ...alertThresholds, caseStudyReminderDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Notification Types */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Custom Notification Types</h3>
              <p className="text-sm text-gray-500">Create new notification triggers that fire across the entire application automatically.</p>
            </div>
            <button
              onClick={() => setShowAddNotifModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <Plus size={14} /> New Notification
            </button>
          </div>
          {customNotifTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              <Bell size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No custom notification types yet. Click "New Notification" to add one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customNotifTypes.map((cn) => {
                const cfg = notifTypeConfigs[cn.key];
                const isExpanded = expandedNotifType === `custom_${cn.id}`;
                const triggerLabel = TRIGGER_OPTIONS.find((t) => t.value === cn.trigger)?.label || cn.trigger;
                return (
                  <div key={cn.id} className={`border rounded-xl transition-all ${cn.enabled ? 'border-green-300' : 'border-gray-200'}`}>
                    <div
                      className={`flex items-center justify-between p-4 cursor-pointer rounded-xl ${cn.enabled ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setExpandedNotifType(isExpanded ? null : `custom_${cn.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{cn.icon}</span>
                        <div>
                          <p className="font-medium text-gray-900">{cn.label}</p>
                          <p className="text-xs text-gray-500">Triggers on: <span className="font-medium text-primary-600">{triggerLabel}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={cn.enabled} onChange={() => setCustomNotifTypes(customNotifTypes.map((t) => t.id === cn.id ? { ...t, enabled: !t.enabled } : t))} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                        <button onClick={(e) => { e.stopPropagation(); setCustomNotifTypes(customNotifTypes.filter((t) => t.id !== cn.id)); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><X size={14} /></button>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {isExpanded && cfg && (
                      <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-4 bg-white rounded-b-xl">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Recipients</label>
                          <input type="text" value={cfg.recipients} onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [cn.key]: { ...cfg, recipients: e.target.value } })} placeholder="email1@company.com, email2@company.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                          <input type="text" value={cfg.subject} onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [cn.key]: { ...cfg, subject: e.target.value } })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Body</label>
                          <textarea rows={4} value={cfg.body} onChange={(e) => setNotifTypeConfigs({ ...notifTypeConfigs, [cn.key]: { ...cfg, body: e.target.value } })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Add custom notification modal */}
          {showAddNotifModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddNotifModal(false)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <h2 className="text-base font-bold text-gray-900">New Custom Notification</h2>
                  <button onClick={() => setShowAddNotifModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} className="text-gray-500" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" value={newNotif.label} onChange={(e) => setNewNotif({ ...newNotif, label: e.target.value })} placeholder="e.g. Manager Weekly Summary" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input type="text" value={newNotif.desc} onChange={(e) => setNewNotif({ ...newNotif, desc: e.target.value })} placeholder="Short description of when/why this fires" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event</label>
                    <select value={newNotif.trigger} onChange={(e) => setNewNotif({ ...newNotif, trigger: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                      {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Icon (emoji)</label>
                    <input type="text" value={newNotif.icon} onChange={(e) => setNewNotif({ ...newNotif, icon: e.target.value })} maxLength={4} className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowAddNotifModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button
                      disabled={!newNotif.label.trim()}
                      onClick={() => {
                        const id = `custom_${Date.now()}`;
                        const key = `custom_${newNotif.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
                        const newType: CustomNotifType = { id, key, label: newNotif.label, desc: newNotif.desc, icon: newNotif.icon, trigger: newNotif.trigger, enabled: true };
                        setCustomNotifTypes([...customNotifTypes, newType]);
                        setNotifTypeConfigs({ ...notifTypeConfigs, [key]: { recipients: '', subject: `[PMO] ${newNotif.label}`, body: `Notification: ${newNotif.label}\n\nProject: {{projectName}}\nManager: {{projectManager}}` } });
                        setNewNotif({ label: '', desc: '', icon: '🔔', trigger: 'project.status.changed' });
                        setShowAddNotifModal(false);
                      }}
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                    >
                      Add Notification
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── User Management State ───────────────────────────────────────
  const { user: currentUser } = useAuth();
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'VIEWER', department: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await authApi.getUsers();
      if (res.success) setDbUsers(res.data);
    } catch (err: any) {
      setUsersError(err?.response?.data?.error?.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'team') fetchUsers();
  }, [activeTab, fetchUsers]);

  const handleInviteUser = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setUserActionMsg({ type: 'error', text: 'Name and email are required' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) {
      setUserActionMsg({ type: 'error', text: 'Please enter a valid email address' });
      return;
    }
    setInviteLoading(true);
    try {
      const res = await authApi.createUser({
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
        department: inviteForm.department || undefined,
      });
      if (res.success) {
        const pw = res.message?.match(/Temporary password: (.+)/)?.[1] || inviteForm.email.split('@')[0] + '@2026';
        setTempPassword(pw);
        setUserActionMsg({ type: 'success', text: `User "${inviteForm.name}" created successfully!` });
        setInviteForm({ name: '', email: '', role: 'VIEWER', department: '' });
        fetchUsers();
      }
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: err?.response?.data?.error?.message || 'Failed to create user' });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await authApi.updateUserRole(userId, newRole);
      setDbUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setUserActionMsg({ type: 'success', text: 'Role updated successfully' });
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: err?.response?.data?.error?.message || 'Failed to update role' });
    }
    setTimeout(() => setUserActionMsg(null), 3000);
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    try {
      await authApi.toggleUserActive(userId, !currentlyActive);
      setDbUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: !currentlyActive ? 1 : 0 } : u)));
      setUserActionMsg({ type: 'success', text: currentlyActive ? 'User deactivated' : 'User activated' });
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: err?.response?.data?.error?.message || 'Failed to update user' });
    }
    setTimeout(() => setUserActionMsg(null), 3000);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await authApi.deleteUser(userId);
      setDbUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDelete(null);
      setUserActionMsg({ type: 'success', text: 'User removed' });
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: err?.response?.data?.error?.message || 'Failed to delete user' });
    }
    setTimeout(() => setUserActionMsg(null), 3000);
  };

  const filteredUsers = dbUsers.filter((u) => {
    if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
    if (userSearchQuery) {
      const q = userSearchQuery.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-700 border-red-200';
      case 'PROJECT_MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'PRE_SALES': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'ACCOUNT_MANAGER': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return Shield;
      case 'PROJECT_MANAGER': return Users;
      default: return Eye;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setUserActionMsg({ type: 'success', text: 'Copied to clipboard!' });
    setTimeout(() => setUserActionMsg(null), 2000);
  };

  const renderTeamTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Team Management</h3>
          <p className="text-sm text-gray-500">
            Add users by email to give them access. Assign roles to control permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{dbUsers.length} user{dbUsers.length !== 1 ? 's' : ''}</span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setShowInviteForm(true); setTempPassword(null); setUserActionMsg(null); }}
          >
            <UserPlus size={16} className="mr-1.5" /> Add User
          </Button>
        </div>
      </div>

      {/* Status Message */}
      {userActionMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          userActionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {userActionMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {userActionMsg.text}
        </div>
      )}

      {/* ── Add User Form ─────────────────────────────────────────── */}
      {showInviteForm && (
        <div className="border-2 border-primary-200 bg-primary-50/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus size={18} className="text-primary-600" />
              Add New User
            </h4>
            <button
              onClick={() => { setShowInviteForm(false); setTempPassword(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name *"
              placeholder="e.g. John Smith"
              value={inviteForm.name}
              onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            />
            <Input
              label="Email Address *"
              placeholder="e.g. john.smith@company.com"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            />
            <Select
              label="Role"
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              options={[
                { value: 'VIEWER', label: 'Viewer — Can view projects and reports' },
                { value: 'PROJECT_MANAGER', label: 'Project Manager — Can create/edit migration projects' },
                { value: 'PRE_SALES', label: 'Pre-Sales — Can create/edit POC projects' },
                { value: 'ACCOUNT_MANAGER', label: 'Account Manager — Can edit Account Manager view' },
                { value: 'ADMIN', label: 'Admin — Full access to all features and settings' },
              ]}
            />
            <Input
              label="Department (optional)"
              placeholder="e.g. IT, Engineering, PMO"
              value={inviteForm.department}
              onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
            />
          </div>

          {/* Temp password display */}
          {tempPassword && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-yellow-800 mb-1">Temporary Password Created</p>
              <p className="text-xs text-yellow-700 mb-2">
                Share this password with the user. They should change it after first login.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-yellow-300 rounded-md text-sm font-mono text-yellow-900">
                  {tempPassword}
                </code>
                <button
                  onClick={() => copyToClipboard(tempPassword)}
                  className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-md text-sm font-medium flex items-center gap-1 transition-colors"
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleInviteUser}
              disabled={inviteLoading}
            >
              {inviteLoading ? <Loader2 size={16} className="animate-spin mr-1.5" /> : <Mail size={16} className="mr-1.5" />}
              Create User
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowInviteForm(false); setTempPassword(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {['ALL', 'ADMIN', 'PROJECT_MANAGER', 'PRE_SALES', 'ACCOUNT_MANAGER', 'VIEWER'].map((role) => (
            <button
              key={role}
              onClick={() => setUserRoleFilter(role)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                userRoleFilter === role
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {role === 'ALL' ? 'All' : role.charAt(0) + role.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── User List ─────────────────────────────────────────────── */}
      {usersLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          <span className="ml-2 text-sm text-gray-500">Loading users...</span>
        </div>
      ) : usersError ? (
        <div className="text-center py-8">
          <p className="text-red-600 text-sm">{usersError}</p>
          <button onClick={fetchUsers} className="mt-2 text-primary-600 text-sm hover:underline">Retry</button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No users found</p>
          <p className="text-sm">{userSearchQuery ? 'Try a different search' : 'Click "Add User" to get started'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((u) => {
            const RoleIcon = getRoleIcon(u.role);
            const isActive = u.is_active === 1 || u.is_active === true;
            const isCurrentUser = u.id === currentUser?.id;

            return (
              <div
                key={u.id}
                className={`flex items-center gap-4 p-4 border rounded-xl transition-all ${
                  !isActive ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                  u.role === 'ADMIN' ? 'bg-red-100 text-red-700'
                  : u.role === 'PROJECT_MANAGER' ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700'
                }`}>
                  {u.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{u.name}</span>
                    {isCurrentUser && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full font-medium">You</span>
                    )}
                    {!isActive && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Mail size={11} /> {u.email}
                    </span>
                    {u.department && (
                      <span className="text-xs text-gray-400">
                        {u.department}
                      </span>
                    )}
                    {u.created_at && (
                      <span className="text-xs text-gray-400">
                        Joined {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${getRoleBadgeClass(u.role)}`}>
                  <RoleIcon size={12} />
                  {u.role}
                </span>

                {/* Actions */}
                {currentUser?.role === 'ADMIN' && !isCurrentUser && (
                  <div className="flex items-center gap-1">
                    {/* Role selector */}
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="PROJECT_MANAGER">Project Manager</option>
                      <option value="PRE_SALES">Pre-Sales</option>
                      <option value="ACCOUNT_MANAGER">Account Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>

                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(u.id, isActive)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'text-yellow-600 hover:bg-yellow-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={isActive ? 'Deactivate user' : 'Activate user'}
                    >
                      {isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>

                    {/* Delete */}
                    {confirmDelete === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-md hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove user"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Role Permissions Reference ────────────────────────────── */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Role Permissions</h3>
        <p className="text-sm text-gray-500 mb-3">
          Assign roles to control what each team member can do in the application.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Permission</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">
                  <span className="inline-flex items-center gap-1"><Shield size={14} className="text-red-500" /> Admin</span>
                </th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">
                  <span className="inline-flex items-center gap-1"><Users size={14} className="text-blue-500" /> Manager</span>
                </th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">
                  <span className="inline-flex items-center gap-1"><Eye size={14} className="text-gray-500" /> Viewer</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'View Projects & Reports', admin: true, manager: true, viewer: true },
                { name: 'Create & Edit Projects', admin: true, manager: true, viewer: false },
                { name: 'Delete Projects', admin: true, manager: false, viewer: false },
                { name: 'Manage Team Members', admin: true, manager: false, viewer: false },
                { name: 'Add / Remove Users', admin: true, manager: false, viewer: false },
                { name: 'Change User Roles', admin: true, manager: false, viewer: false },
                { name: 'Export Data (PDF / Excel)', admin: true, manager: true, viewer: false },
                { name: 'System Settings', admin: true, manager: false, viewer: false },
                { name: 'View Notifications', admin: true, manager: true, viewer: true },
                { name: 'View Case Studies', admin: true, manager: true, viewer: true },
              ].map((perm) => (
                <tr key={perm.name} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-gray-900">{perm.name}</td>
                  <td className="text-center py-3 px-4">{perm.admin ? <Check className="inline text-green-500" size={18} /> : <X className="inline text-red-400" size={18} />}</td>
                  <td className="text-center py-3 px-4">{perm.manager ? <Check className="inline text-green-500" size={18} /> : <X className="inline text-red-400" size={18} />}</td>
                  <td className="text-center py-3 px-4">{perm.viewer ? <Check className="inline text-green-500" size={18} /> : <X className="inline text-red-400" size={18} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDashboardTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Default Date Range"
            value={dashboardSettings.defaultDateRange}
            onChange={(e) => setDashboardSettings({ ...dashboardSettings, defaultDateRange: e.target.value })}
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '14', label: 'Last 14 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
          />
          <Select
            label="Items Per Page"
            value={String(dashboardSettings.itemsPerPage)}
            onChange={(e) => setDashboardSettings({ ...dashboardSettings, itemsPerPage: parseInt(e.target.value) })}
            options={[
              { value: '10', label: '10 items' },
              { value: '20', label: '20 items' },
              { value: '50', label: '50 items' },
              { value: '100', label: '100 items' },
            ]}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Widgets</h3>
        <div className="space-y-3">
          {[
            { key: 'showDelayedProjects', label: 'Delayed Projects Widget', desc: 'Show list of delayed projects' },
            { key: 'showUpcomingDeadlines', label: 'Upcoming Deadlines Widget', desc: 'Show projects with approaching deadlines' },
            { key: 'showRecentActivity', label: 'Recent Activity Widget', desc: 'Show recent project updates' },
            { key: 'showCharts', label: 'Charts & Analytics', desc: 'Show visual charts and graphs' },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={dashboardSettings[item.key as keyof DashboardSettings] as boolean}
                onChange={(e) => setDashboardSettings({ ...dashboardSettings, [item.key]: e.target.checked })}
                className="w-5 h-5 text-primary-600 rounded"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );


  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">External Integrations</h3>
        <p className="text-sm text-gray-500 mb-4">Connect with third-party services</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { key: 'microsoftEnabled', name: 'Microsoft 365', desc: 'SSO and calendar integration', icon: '🪟' },
          { key: 'jiraEnabled', name: 'Jira / Azure DevOps', desc: 'Project tracking sync', icon: '📋' },
          { key: 'slackEnabled', name: 'Slack', desc: 'Notifications and alerts', icon: '💬' },
          { key: 'teamsEnabled', name: 'Microsoft Teams', desc: 'Notifications and alerts', icon: '👥' },
          { key: 'calendarSync', name: 'Calendar Sync', desc: 'Sync deadlines to calendar', icon: '📅' },
        ].map((integration) => (
          <div key={integration.key} className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <p className="font-medium text-gray-900">{integration.name}</p>
                  <p className="text-sm text-gray-500">{integration.desc}</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={integrationSettings[integration.key as keyof typeof integrationSettings]}
                  onChange={(e) => setIntegrationSettings({ ...integrationSettings, [integration.key]: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
            {integrationSettings[integration.key as keyof typeof integrationSettings] && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <Button variant="outline" size="sm">Configure</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* API Settings */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">API Configuration</h3>
        <div className="space-y-4">
          {API_KEY_SCOPES.map(({ scope, label, description }) => {
            const key = apiKeys[scope];
            const visible = !!apiKeyVisible[scope];
            const regenerating = regeneratingScope === scope;
            return (
              <div key={scope} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{label} API Key</p>
                    <p className="text-sm text-gray-500">{description} (send it as the x-api-key header)</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleRegenerateApiKey(scope)} disabled={regenerating}>
                    {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate New Key'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white border border-gray-200 rounded text-sm font-mono truncate">
                    {key ? (visible ? key : '•'.repeat(40)) : 'Loading...'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApiKeyVisible((prev) => ({ ...prev, [scope]: !prev[scope] }))}
                    disabled={!key}
                  >
                    {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleCopyApiKey(scope)} disabled={!key}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );


  const renderMigrationTab = () => {
    const allProjects: any[] = allProjectsData?.data || [];
    const enabledTypes = migrationTypes.filter((t) => t.enabled);
    const getProjectsForType = (type: any) =>
      allProjects.filter((p) => {
        const mt = (p.migrationTypes || '').toUpperCase();
        return mt.includes(type.code.toUpperCase()) || mt.includes(type.name.toUpperCase());
      });
    const selectedMigTypeObj = selectedMigType ? enabledTypes.find((t) => t.id === selectedMigType) : null;
    const selectedMigProjects = selectedMigTypeObj ? getProjectsForType(selectedMigTypeObj) : [];

    return (
    <div className="space-y-8">
      {/* Overview: clickable type cards */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shuffle size={18} className="text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Migration Types Overview</h3>
          <span className="text-sm text-gray-400 ml-1">— click a type to see its projects</span>
        </div>
        {enabledTypes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No enabled migration types yet. Add one below.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enabledTypes.map((type) => {
              const typeProjects = getProjectsForType(type);
              const active    = typeProjects.filter((p) => p.status === 'ACTIVE').length;
              const completed = typeProjects.filter((p) => p.status === 'COMPLETED').length;
              const overaged  = typeProjects.filter((p) => p.status === 'ACTIVE' && new Date(p.plannedEnd) < new Date()).length;
              const delayed   = typeProjects.filter((p) => p.delayStatus === 'DELAYED').length;
              const isSelected = selectedMigType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedMigType(isSelected ? null : type.id)}
                  className={`text-left w-full rounded-xl border-2 p-5 transition-all hover:shadow-md ${
                    isSelected ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-200 bg-white hover:border-primary-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{type.icon}</span>
                    <div>
                      <h4 className="font-bold text-gray-900 text-base">{type.name} Migration</h4>
                      <p className="text-xs text-gray-400">{typeProjects.length} projects total</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 text-xs"><Activity size={12} className="text-green-500" /><span className="text-gray-600">{active} Active</span></div>
                    <div className="flex items-center gap-1.5 text-xs"><CheckCircle size={12} className="text-blue-500" /><span className="text-gray-600">{completed} Done</span></div>
                    <div className="flex items-center gap-1.5 text-xs"><Clock size={12} className="text-orange-500" /><span className="text-gray-600">{overaged} Overaged</span></div>
                    <div className="flex items-center gap-1.5 text-xs"><AlertTriangle size={12} className="text-red-500" /><span className="text-gray-600">{delayed} Delayed</span></div>
                  </div>
                  <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: typeProjects.length > 0 ? `${Math.round((completed / typeProjects.length) * 100)}%` : '0%' }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {typeProjects.length > 0 ? Math.round((completed / typeProjects.length) * 100) : 0}% completion rate
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {selectedMigTypeObj && (
          <Card className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">{selectedMigTypeObj.icon}</span>
              <h4 className="text-lg font-bold text-gray-900">{selectedMigTypeObj.name} Migration — Projects ({selectedMigProjects.length})</h4>
            </div>
            {selectedMigProjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No projects found for this migration type.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50/60">
                    <tr>{['Project Name', 'Customer', 'Manager', 'Status', 'Phase', 'SOW End', 'Delay'].map((h) => (
                      <th key={h} className={`py-2.5 px-3 font-medium text-gray-500 text-xs uppercase ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {selectedMigProjects.map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => (window.location.href = `/projects/${p.id}`)}>
                        <td className="py-2.5 px-3 font-medium text-gray-900">{p.name}</td>
                        <td className="text-center py-2.5 px-3 text-gray-500 text-xs">{p.customerName}</td>
                        <td className="text-center py-2.5 px-3 text-gray-500 text-xs">{p.projectManager}</td>
                        <td className="text-center py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                        </td>
                        <td className="text-center py-2.5 px-3 text-xs text-gray-500">{p.phase}</td>
                        <td className="text-center py-2.5 px-3 text-xs text-gray-500">{p.plannedEnd ? new Date(p.plannedEnd).toLocaleDateString() : '—'}</td>
                        <td className="text-center py-2.5 px-3">{p.delayDays > 0 ? <span className="text-xs font-semibold text-red-600">+{p.delayDays}d</span> : <span className="text-xs text-green-600">On Track</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Manage Migration Types</h3>
            <p className="text-sm text-gray-500">Configure the types of migrations your organization handles</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {migrationTypes.map((type) => (
            <div
              key={type.id}
              className={`p-4 border-2 rounded-xl transition-all ${
                type.enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-gray-50 opacity-70'
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Emoji icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ backgroundColor: (type.color || '#6B7280') + '25' }}
                  >
                    {type.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={type.name || ''}
                      onChange={(e) => setMigrationTypes(migrationTypes.map((t) =>
                        t.id === type.id ? { ...t, name: e.target.value } : t
                      ))}
                      className="font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none w-full text-sm"
                      placeholder="Migration type name"
                    />
                    <input
                      type="text"
                      value={type.code || ''}
                      onChange={(e) => setMigrationTypes(migrationTypes.map((t) =>
                        t.id === type.id ? { ...t, code: e.target.value.toUpperCase() } : t
                      ))}
                      className="text-xs text-gray-400 uppercase tracking-wide bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none w-full mt-0.5"
                      placeholder="CODE"
                    />
                  </div>
                </div>
                {/* Toggle + Delete */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => setMigrationTypes(migrationTypes.map((t) =>
                      t.id === type.id ? { ...t, enabled: !t.enabled } : t
                    ))}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                      type.enabled
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                  >
                    {type.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMigrationTypes(migrationTypes.filter((t) => t.id !== type.id))}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Description */}
              <textarea
                value={type.description || ''}
                onChange={(e) => setMigrationTypes(migrationTypes.map((t) =>
                  t.id === type.id ? { ...t, description: e.target.value } : t
                ))}
                className="w-full text-sm text-gray-600 bg-white border border-gray-200 hover:border-gray-300 focus:border-primary-500 focus:outline-none rounded-lg p-2 resize-none"
                rows={2}
                placeholder="Description of this migration type…"
              />

              {/* Icon + Color row */}
              <div className="mt-3 flex items-center gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Emoji icon</label>
                  <input
                    type="text"
                    value={type.icon || ''}
                    onChange={(e) => setMigrationTypes(migrationTypes.map((t) =>
                      t.id === type.id ? { ...t, icon: e.target.value } : t
                    ))}
                    className="w-14 text-center text-xl border border-gray-200 rounded-lg p-1 focus:outline-none focus:border-primary-500"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Badge color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={type.color || '#6B7280'}
                      onChange={(e) => setMigrationTypes(migrationTypes.map((t) =>
                        t.id === type.id ? { ...t, color: e.target.value } : t
                      ))}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200"
                    />
                    <span className="text-xs text-gray-500 font-mono">{type.color || '#6B7280'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const newType: MigrationType = {
              id: Date.now().toString(),
              name: 'New Migration Type',
              code: 'NEW',
              description: '',
              icon: '📦',
              color: '#6B7280',
              enabled: true,
            };
            setMigrationTypes([...migrationTypes, newType]);
          }}
          className="mt-4 w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={18} /> Add Migration Type
        </button>
      </div>

      {/* Migration Combinations Info */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Migration Combinations</h4>
        <p className="text-sm text-blue-700 mb-3">
          Projects can include multiple migration types. Common combinations include:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <span>📧 + 📁</span>
            <span>Email + Content Migration</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <span>📧 + 💬</span>
            <span>Email + Messaging Migration</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <span>📁 + 💬</span>
            <span>Content + Messaging Migration</span>
          </div>
          <div className="flex items-center gap-2 text-blue-800">
            <span>📧 + 📁 + 💬</span>
            <span>Full Suite Migration</span>
          </div>
        </div>
      </div>

      {/* Source Platforms */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Source Platforms</h3>
            <p className="text-sm text-gray-500">Platforms you migrate data from</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newPlatform: SourcePlatform = {
                id: Date.now().toString(),
                name: 'New Platform',
                category: 'Other',
              };
              setSourcePlatforms([...sourcePlatforms, newPlatform]);
            }}
          >
            <Plus size={16} className="mr-1" /> Add Platform
          </Button>
        </div>

        <div className="space-y-3">
          {['Email', 'Content', 'Messaging', 'Other'].map((category) => {
            const platformsInCategory = sourcePlatforms.filter((p) => p.category === category);
            if (platformsInCategory.length === 0 && category !== 'Other') return null;
            return (
              <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 font-medium text-gray-700 text-sm">
                  {category} Platforms ({platformsInCategory.length})
                </div>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {platformsInCategory.map((platform) => (
                    <div
                      key={platform.id}
                      className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg text-sm group hover:border-primary-300 transition-colors"
                    >
                      <input
                        type="text"
                        value={platform.name}
                        onChange={(e) => {
                          setSourcePlatforms(sourcePlatforms.map((p) =>
                            p.id === platform.id ? { ...p, name: e.target.value } : p
                          ));
                        }}
                        className="flex-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none text-gray-900"
                      />
                      <select
                        value={platform.category}
                        onChange={(e) => {
                          setSourcePlatforms(sourcePlatforms.map((p) =>
                            p.id === platform.id ? { ...p, category: e.target.value } : p
                          ));
                        }}
                        className="text-xs text-gray-500 bg-gray-100 border-0 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="Email">Email</option>
                        <option value="Content">Content</option>
                        <option value="Messaging">Messaging</option>
                        <option value="Other">Other</option>
                      </select>
                      <button
                        onClick={() => setSourcePlatforms(sourcePlatforms.filter((p) => p.id !== platform.id))}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {platformsInCategory.length === 0 && (
                    <span className="text-sm text-gray-400 italic col-span-full">No platforms configured</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Target Platforms */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Target Platforms</h3>
            <p className="text-sm text-gray-500">Platforms you migrate data to (destination)</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newPlatform: TargetPlatform = {
                id: Date.now().toString(),
                name: 'New Platform',
                category: 'Other',
              };
              setTargetPlatforms([...targetPlatforms, newPlatform]);
            }}
          >
            <Plus size={16} className="mr-1" /> Add Platform
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {targetPlatforms.map((platform) => (
            <div
              key={platform.id}
              className="p-3 border border-gray-200 rounded-lg bg-white hover:border-primary-300 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={platform.name}
                    onChange={(e) => {
                      setTargetPlatforms(targetPlatforms.map((p) =>
                        p.id === platform.id ? { ...p, name: e.target.value } : p
                      ));
                    }}
                    className="w-full font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none"
                  />
                  <select
                    value={platform.category}
                    onChange={(e) => {
                      setTargetPlatforms(targetPlatforms.map((p) =>
                        p.id === platform.id ? { ...p, category: e.target.value } : p
                      ));
                    }}
                    className="mt-1 text-xs text-gray-500 bg-gray-100 border-0 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="Suite">Suite</option>
                    <option value="Email">Email</option>
                    <option value="Content">Content</option>
                    <option value="Messaging">Messaging</option>
                    <option value="Cloud">Cloud</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <button
                  onClick={() => setTargetPlatforms(targetPlatforms.filter((p) => p.id !== platform.id))}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Migration Scope Templates */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Scope Templates</h3>
        <p className="text-sm text-gray-500 mb-4">Pre-defined migration scope combinations for quick project setup</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📧</span>
              <h4 className="font-semibold text-gray-900">Email Only</h4>
            </div>
            <p className="text-sm text-gray-600">Mailbox migration including calendar, contacts, and mail data</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Email</span>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📁</span>
              <h4 className="font-semibold text-gray-900">Content Only</h4>
            </div>
            <p className="text-sm text-gray-600">File shares and document libraries migration</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Content</span>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">💬</span>
              <h4 className="font-semibold text-gray-900">Messaging Only</h4>
            </div>
            <p className="text-sm text-gray-600">Chat history and channels migration</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Messaging</span>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📧📁</span>
              <h4 className="font-semibold text-gray-900">Email + Content</h4>
            </div>
            <p className="text-sm text-gray-600">Combined mailbox and file migration</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Email</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Content</span>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📧💬</span>
              <h4 className="font-semibold text-gray-900">Email + Messaging</h4>
            </div>
            <p className="text-sm text-gray-600">Communication platform migration</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Email</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Messaging</span>
            </div>
          </div>

          <div className="p-4 border border-primary-300 bg-primary-50 rounded-lg cursor-pointer transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📧📁💬</span>
              <h4 className="font-semibold text-gray-900">Full Suite</h4>
            </div>
            <p className="text-sm text-gray-600">Complete migration of all workloads</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Email</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Content</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Messaging</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  };

  const renderTabContent = () => {
    try {
      switch (activeTab) {
        case 'migration': return renderMigrationTab();
        case 'project': return renderProjectConfigTab();
        case 'notifications': return renderNotificationsTab();
        case 'team': return renderTeamTab();
        case 'dashboard': return renderDashboardTab();
        case 'integrations': return renderIntegrationsTab();
        default: return null;
      }
    } catch (err) {
      console.error('Tab render error:', err);
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={40} className="text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Tab failed to load</h3>
          <p className="text-sm text-gray-500 mb-4">There was an error rendering this tab. Check the browser console for details.</p>
          <button
            onClick={() => setActiveTab('migration')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            Go to Migration Types
          </button>
        </div>
      );
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Settings className="text-primary-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500">Configure system preferences and templates</p>
          </div>
        </div>
        {!isViewer && (
          <Button onClick={handleSaveAll} isLoading={isSaving}>
            <Save size={16} className="mr-2" />
            Save All Settings
          </Button>
        )}
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`mb-4 p-3 rounded-lg ${
          saveMessage.includes('success') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage}
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <tab.icon size={18} />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <Card className="p-6">
            {renderTabContent()}
          </Card>
        </div>
      </div>
    </div>
  );
}
