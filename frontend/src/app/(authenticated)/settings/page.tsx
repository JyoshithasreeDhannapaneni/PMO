'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Palette,
  Database,
  Link as LinkIcon,
  Shield,
  Workflow,
  LayoutDashboard,
  FolderKanban,
  Mail,
  Clock,
  Download,
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
  Info
} from 'lucide-react';
import { exportToPDF, exportToWord } from '@/utils/exportCaseStudy';
import { authApi, templatesApi, projectsApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { formatDistanceToNow } from 'date-fns';

// Types
interface TemplateSection {
  id: string;
  title: string;
  description: string;
  placeholder: string;
  required: boolean;
}

interface CaseStudyTemplate {
  name: string;
  sections: TemplateSection[];
}

interface PlanType {
  id: string;
  name: string;
  color: string;
  amount :number;
}

interface ProjectPhase {
  id: string;
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

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

interface MigrationType {
  id: string;
  name: string;
  code: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
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
const defaultTemplate: CaseStudyTemplate = {
  name: 'Closed Project — Migration Case Study',
  sections: [
    // Section 1: Project Identification
    { id: '1', title: '1. Project Identification', description: 'Basic project information and stakeholders', placeholder: 'Project Name:\nCustomer Name:\nProject Manager:\nAccount Manager:\nProject Start Date:\nProject End Date:\nMigration Type:\nProject Status:', required: true },
    
    // Section 2: Migration Overview & Scope
    { id: '2', title: '2. Migration Overview & Scope', description: 'Source and target environment details', placeholder: 'Source Environment:\n- Platform/System:\n- Data Volume:\n- User Count:\n- Mailbox Count:\n\nTarget Environment:\n- Platform/System:\n- Region/Tenant:\n\nScope Summary:\n- In Scope Items:\n- Out of Scope Items:', required: true },
    
    // Section 3: Pre-Migration Assessment
    { id: '3', title: '3. Pre-Migration Assessment', description: 'Infrastructure and data inventory assessment', placeholder: 'Infrastructure Assessment:\n- Source system health check results\n- Network bandwidth assessment\n- Security compliance review\n\nData Inventory:\n- Total data size (GB/TB)\n- Number of users/mailboxes\n- Special data types identified\n- Data cleanup requirements:', required: true },
    
    // Section 4: Migration Strategy & Execution
    { id: '4', title: '4. Migration Strategy & Execution', description: 'Methodology, phases, and tools used', placeholder: 'Migration Methodology:\n- Approach (Big Bang/Phased/Hybrid)\n- Cutover strategy\n\nPhase Breakdown:\n- Phase 1: Planning & Assessment\n- Phase 2: Pilot Migration\n- Phase 3: Production Migration\n- Phase 4: Validation & Closure\n\nTools & Technologies Used:\n- Migration tool(s)\n- Monitoring tools\n- Communication tools:', required: true },
    
    // Section 5: Success Metrics & KPIs
    { id: '5', title: '5. Success Metrics & KPIs', description: 'Performance metrics with targets and actuals', placeholder: 'Key Performance Indicators:\n\n| Metric | Target | Actual | Status |\n|--------|--------|--------|--------|\n| Data Migration Success Rate | 99.5% | | |\n| User Migration Success Rate | 100% | | |\n| Downtime (hours) | <4 | | |\n| Post-Migration Issues | <5 | | |\n| Customer Satisfaction | >4.5/5 | | |\n| On-Time Delivery | Yes | | |', required: true },
    
    // Section 6: Risks, Challenges & Mitigations
    { id: '6', title: '6. Risks, Challenges & Mitigations', description: 'Risk tracking with status and mitigation steps', placeholder: 'Risk Register:\n\n| Risk ID | Risk Description | Impact | Probability | Mitigation Strategy | Status |\n|---------|------------------|--------|-------------|---------------------|--------|\n| R001 | | High/Med/Low | High/Med/Low | | Open/Closed |\n| R002 | | | | | |\n\nChallenges Encountered:\n1. Challenge:\n   - Impact:\n   - Resolution:', required: true },
    
    // Section 7: Key Issues & Resolution Log
    { id: '7', title: '7. Key Issues & Resolution Log', description: 'Issue tracking and resolution details', placeholder: 'Issue Log:\n\n| Issue ID | Date Reported | Description | Root Cause | Resolution | Date Resolved | Owner |\n|----------|---------------|-------------|------------|------------|---------------|-------|\n| ISS001 | | | | | | |\n| ISS002 | | | | | | |\n\nEscalations:\n- Any escalations to management\n- Resolution timeline', required: false },
    
    // Section 8: Validation, UAT & Communication
    { id: '8', title: '8. Validation, UAT & Communication', description: 'Testing results and stakeholder communication', placeholder: 'Validation Results:\n- Pre-migration validation: Pass/Fail\n- Post-migration validation: Pass/Fail\n- Data integrity check: Pass/Fail\n\nUAT Summary:\n- UAT Start Date:\n- UAT End Date:\n- Test Cases Executed:\n- Pass Rate:\n- Sign-off obtained: Yes/No\n\nStakeholder Communication:\n- Kick-off meeting date:\n- Status update frequency:\n- Final closure meeting date:', required: true },
    
    // Section 9: Knowledge Transfer & Documentation
    { id: '9', title: '9. Knowledge Transfer & Documentation', description: 'Training and handover details', placeholder: 'Knowledge Transfer:\n- Training sessions conducted:\n- Training materials provided:\n- Admin handover completed: Yes/No\n\nDocumentation Delivered:\n- [ ] Migration runbook\n- [ ] Configuration documentation\n- [ ] User guides\n- [ ] Admin guides\n- [ ] Troubleshooting guide\n- [ ] Rollback procedures', required: false },
    
    // Section 10: Valuable Insights & Final Deliverables
    { id: '10', title: '10. Valuable Insights & Final Deliverables', description: 'Lessons learned and recommendations', placeholder: 'Lessons Learned:\n1. What went well:\n   - \n2. What could be improved:\n   - \n3. Recommendations for future projects:\n   - \n\nFinal Deliverables:\n- [ ] Migration completion report\n- [ ] Data validation report\n- [ ] UAT sign-off document\n- [ ] Knowledge transfer completion\n- [ ] Project closure document', required: true },
    
    // Section 11: Final Assessment & Project Sign-off
    { id: '11', title: '11. Final Assessment & Project Sign-off', description: 'Project closure and approval details', placeholder: 'Overall Project Assessment:\n- Project delivered on time: Yes/No\n- Project delivered within budget: Yes/No\n- All success criteria met: Yes/No\n- Customer satisfaction rating: /5\n\nSign-off Details:\n- Customer Sign-off Date:\n- Customer Representative:\n- Internal Sign-off Date:\n- Project Manager:\n\nAdditional Comments:\n\nProject Closure Status: CLOSED', required: true },
    
    // Section 12: Client Testimonial
    { id: '12', title: '12. Client Testimonial', description: 'Quote or feedback from the client', placeholder: 'Client Feedback:\n"[Insert client testimonial or feedback quote here]"\n\n- Client Name:\n- Title:\n- Company:\n- Date:', required: false },
  ],
};

const defaultPlanTypes: PlanType[] = [
  { id: '1', name: 'Bronze', color: '#CD7F32', slaHours: 72 },
  { id: '2', name: 'Silver', color: '#C0C0C0', slaHours: 48 },
  { id: '3', name: 'Gold', color: '#FFD700', slaHours: 24 },
  { id: '4', name: 'Platinum', color: '#E5E4E2', slaHours: 8 },
];

const defaultPhases: ProjectPhase[] = [
  { id: '1', name: 'Kickoff', order: 1, color: '#3B82F6' },
  { id: '2', name: 'Migration', order: 2, color: '#F59E0B' },
  { id: '3', name: 'Validation', order: 3, color: '#8B5CF6' },
  { id: '4', name: 'Closure', order: 4, color: '#10B981' },
  { id: '5', name: 'Completed', order: 5, color: '#6B7280' },
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

const defaultAutomationRules: AutomationRule[] = [
  { id: '1', name: 'Auto Delay Detection', trigger: 'Daily at 6:00 AM', action: 'Update delay status for all active projects', enabled: true },
  { id: '2', name: 'Case Study Reminder', trigger: 'Weekly on Monday', action: 'Send reminder for completed projects without case study', enabled: true },
  { id: '3', name: 'Phase Completion Alert', trigger: 'On phase completion', action: 'Notify project manager and stakeholders', enabled: false },
];

const defaultMigrationTypes: MigrationType[] = [
  { id: '1', name: 'Content Migration', code: 'CONTENT', description: 'File shares, SharePoint, document libraries', icon: '📁', color: '#3B82F6', enabled: true },
  { id: '2', name: 'Email Migration', code: 'EMAIL', description: 'Exchange, Gmail, mailbox migration', icon: '📧', color: '#10B981', enabled: true },
  { id: '3', name: 'Messaging Migration', code: 'MESSAGING', description: 'Teams, Slack, chat platforms', icon: '💬', color: '#8B5CF6', enabled: true },
  { id: '4', name: 'Identity Migration', code: 'IDENTITY', description: 'Active Directory, Azure AD, user accounts', icon: '👤', color: '#F59E0B', enabled: false },
  { id: '5', name: 'Application Migration', code: 'APPLICATION', description: 'Legacy apps, cloud apps, SaaS', icon: '🖥️', color: '#EF4444', enabled: false },
  { id: '6', name: 'Database Migration', code: 'DATABASE', description: 'SQL, NoSQL, data warehouse', icon: '🗄️', color: '#6366F1', enabled: false },
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
  { id: 'templates', name: 'Project Templates', icon: Workflow },
  { id: 'migration', name: 'Migration Types', icon: Database },
  { id: 'case-study', name: 'Case Study Template', icon: FileText },
  { id: 'project', name: 'Project Configuration', icon: FolderKanban },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'team', name: 'Team Management', icon: Users },
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'automation', name: 'Automation', icon: Workflow },
  { id: 'integrations', name: 'Integrations', icon: LinkIcon },
  { id: 'data', name: 'Data & Export', icon: Database },
  { id: 'branding', name: 'Branding', icon: Palette },
  { id: 'audit', name: 'Audit & Compliance', icon: Shield },
];

export default function SettingsPage() {
  const { settings: ctxSettings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState('templates');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // State for all settings — initialised from context (which already read localStorage)
  const [template, setTemplate] = useState<CaseStudyTemplate>(defaultTemplate);
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
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(defaultAutomationRules);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['1']));

  // SMTP Settings
  const [smtpSettings, setSmtpSettings] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    user: '',
    password: '',
    fromEmail: 'noreply@company.com',
  });

  // Audit Settings
  const [auditSettings, setAuditSettings] = useState({
    enableLogging: true,
    logRetentionDays: 90,
    trackProjectChanges: true,
    trackUserActions: true,
    trackExports: true,
  });

  // Integration Settings
  const [integrationSettings, setIntegrationSettings] = useState({
    microsoftEnabled: false,
    jiraEnabled: false,
    slackEnabled: false,
    teamsEnabled: false,
    calendarSync: false,
  });

  // Branding logo
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Notification test email state
  const [testEmailStatus, setTestEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testEmailRecipient, setTestEmailRecipient] = useState('');

  // Data export state
  const [exportStatus, setExportStatus] = useState<{ projects: string; reports: string }>({ projects: '', reports: '' });

  // Load all settings from localStorage once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.migrationTypes?.length) setMigrationTypes(parsed.migrationTypes);
        if (parsed.planTypes?.length) setPlanTypes(parsed.planTypes);
        if (parsed.phases?.length) setPhases(parsed.phases);
        if (parsed.sourcePlatforms?.length) setSourcePlatforms(parsed.sourcePlatforms);
        if (parsed.targetPlatforms?.length) setTargetPlatforms(parsed.targetPlatforms);
        if (parsed.notificationSettings) setNotificationSettings((p) => ({ ...p, ...parsed.notificationSettings }));
        if (parsed.alertThresholds) setAlertThresholds((p) => ({ ...p, ...parsed.alertThresholds }));
        if (parsed.dashboardSettings) setDashboardSettings((p) => ({ ...p, ...parsed.dashboardSettings }));
        if (parsed.brandingSettings) setBrandingSettings((p) => ({ ...p, ...parsed.brandingSettings }));
        if (parsed.template) setTemplate(parsed.template);
        if (parsed.teamMembers) setTeamMembers(parsed.teamMembers);
        if (parsed.automationRules) setAutomationRules(parsed.automationRules);
        if (parsed.smtpSettings) setSmtpSettings(parsed.smtpSettings);
        if (parsed.auditSettings) setAuditSettings(parsed.auditSettings);
        if (parsed.integrationSettings) setIntegrationSettings(parsed.integrationSettings);
        if (parsed.templateUploads) setTemplateUploads(parsed.templateUploads);
        if (parsed.combinationDocs) setCombinationDocs(parsed.combinationDocs);
        if (parsed.companyLogo) setCompanyLogo(parsed.companyLogo);
        if (parsed.testEmailRecipient) setTestEmailRecipient(parsed.testEmailRecipient);
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
        template,
        teamMembers,
        automationRules,
        smtpSettings,
        auditSettings,
        integrationSettings,
        templateUploads,
        combinationDocs,
        companyLogo,
        testEmailRecipient,
      };
      localStorage.setItem('pmoSettings', JSON.stringify(fullData));

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

  // Template section handlers
  const addTemplateSection = () => {
    const newSection: TemplateSection = {
      id: Date.now().toString(),
      title: 'New Section',
      description: '',
      placeholder: '',
      required: false,
    };
    setTemplate({ ...template, sections: [...template.sections, newSection] });
  };

  const removeTemplateSection = (id: string) => {
    setTemplate({ ...template, sections: template.sections.filter((s) => s.id !== id) });
  };

  const updateTemplateSection = (id: string, field: keyof TemplateSection, value: string | boolean) => {
    setTemplate({
      ...template,
      sections: template.sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    });
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
    setPhases(phases.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
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

  // Automation rule handlers
  const toggleAutomationRule = (id: string) => {
    setAutomationRules(automationRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  // Case Study Template Import/Export handlers
  const [isExportingTemplate, setIsExportingTemplate] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const handleExportTemplate = (format: 'json' | 'pdf' | 'word') => {
    setIsExportingTemplate(true);
    try {
      if (format === 'json') {
        const dataStr = JSON.stringify(template, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `case-study-template-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSaveMessage('Template exported as JSON successfully!');
      } else if (format === 'pdf') {
        const sampleContent: { [key: string]: string } = {};
        template.sections.forEach(s => {
          sampleContent[s.id] = s.placeholder || `[${s.title} content goes here]`;
        });
        exportToPDF({
          title: template.name,
          projectName: 'Template Preview',
          customerName: 'Sample Customer',
          projectManager: 'Project Manager',
          sections: template.sections,
          sectionContent: sampleContent,
        });
        setSaveMessage('Template exported as PDF successfully!');
      } else if (format === 'word') {
        const sampleContent: { [key: string]: string } = {};
        template.sections.forEach(s => {
          sampleContent[s.id] = s.placeholder || `[${s.title} content goes here]`;
        });
        exportToWord({
          title: template.name,
          projectName: 'Template Preview',
          customerName: 'Sample Customer',
          projectManager: 'Project Manager',
          sections: template.sections,
          sectionContent: sampleContent,
        });
        setSaveMessage('Template exported as Word successfully!');
      }
    } catch (error) {
      console.error('Export failed:', error);
      setSaveMessage('Failed to export template');
    } finally {
      setIsExportingTemplate(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleImportTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop() || '';

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        
        if (fileExtension === 'json') {
          const imported = JSON.parse(content as string);
          if (imported.name && imported.sections && Array.isArray(imported.sections)) {
            setTemplate(imported);
            setSaveMessage('Template imported from JSON successfully!');
          } else {
            setSaveMessage('Invalid JSON template format');
          }
        } else if (fileExtension === 'txt') {
          const lines = (content as string).split('\n').filter(line => line.trim());
          const sections = lines.map((line, index) => ({
            id: (index + 1).toString(),
            title: line.trim(),
            description: '',
            placeholder: `Enter ${line.trim().toLowerCase()} content here...`,
            required: index < 3,
          }));
          setTemplate({
            name: `Imported Template - ${new Date().toLocaleDateString()}`,
            sections,
          });
          setSaveMessage('Template imported from text file successfully!');
        } else if (fileExtension === 'csv') {
          const lines = (content as string).split('\n').filter(line => line.trim());
          const sections = lines.slice(1).map((line, index) => {
            const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
            return {
              id: (index + 1).toString(),
              title: parts[0] || `Section ${index + 1}`,
              description: parts[1] || '',
              placeholder: parts[2] || '',
              required: parts[3]?.toLowerCase() === 'true' || parts[3] === '1',
            };
          });
          setTemplate({
            name: `Imported Template - ${new Date().toLocaleDateString()}`,
            sections,
          });
          setSaveMessage('Template imported from CSV successfully!');
        } else if (['pdf', 'doc', 'docx'].includes(fileExtension)) {
          setSaveMessage(`File "${file.name}" uploaded. Note: PDF/Word content extraction requires manual review. The file has been stored for reference.`);
        } else {
          const textContent = content as string;
          if (textContent && textContent.length > 0) {
            const lines = textContent.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              const sections = lines.slice(0, 10).map((line, index) => ({
                id: (index + 1).toString(),
                title: line.trim().substring(0, 100),
                description: '',
                placeholder: '',
                required: false,
              }));
              setTemplate({
                name: `Imported from ${file.name}`,
                sections,
              });
              setSaveMessage(`Template created from ${fileExtension.toUpperCase()} file successfully!`);
            }
          } else {
            setSaveMessage('Could not extract content from file');
          }
        }
      } catch (error) {
        console.error('Import failed:', error);
        setSaveMessage(`Failed to import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      setTimeout(() => setSaveMessage(null), 5000);
    };

    reader.onerror = () => {
      setSaveMessage('Failed to read file');
      setTimeout(() => setSaveMessage(null), 3000);
    };

    if (['pdf', 'doc', 'docx'].includes(fileExtension)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    
    event.target.value = '';
  };

  // Render functions for each tab
  const renderCaseStudyTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Case Study Template</h3>
          <p className="text-sm text-gray-500">Customize the structure for case studies</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTemplate(defaultTemplate)}>
          <RotateCcw size={16} className="mr-1" /> Reset
        </Button>
      </div>

      {/* Import/Export Section */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Import / Export Template</h4>
        <div className="flex flex-wrap gap-3">
          {/* Import */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".json,.txt,.csv,.pdf,.doc,.docx,.xml"
              onChange={handleImportTemplate}
              className="hidden"
              id="template-import"
            />
            <label
              htmlFor="template-import"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <FileUp size={16} />
              Import File
            </label>
            <span className="text-xs text-gray-400">(JSON, TXT, CSV, PDF, Word)</span>
          </div>

          {/* Export Options */}
          <div className="flex items-center gap-2 border-l border-gray-300 pl-3">
            <span className="text-sm text-gray-500">Export as:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportTemplate('json')}
              disabled={isExportingTemplate}
            >
              {isExportingTemplate ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileDown size={14} className="mr-1" />}
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportTemplate('pdf')}
              disabled={isExportingTemplate}
            >
              {isExportingTemplate ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileDown size={14} className="mr-1" />}
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportTemplate('word')}
              disabled={isExportingTemplate}
            >
              {isExportingTemplate ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileDown size={14} className="mr-1" />}
              Word
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Import templates from various formats (JSON, TXT, CSV, PDF, Word) or export the current template for backup or sharing.
        </p>
      </div>

      <Input
        label="Template Name"
        value={template.name}
        onChange={(e) => setTemplate({ ...template, name: e.target.value })}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">Sections ({template.sections.length})</h4>
        </div>

        {template.sections.map((section) => (
          <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
              onClick={() => toggleSection(section.id)}
            >
              <GripVertical className="text-gray-400" size={16} />
              <div className="flex-1">
                <span className="font-medium text-gray-900">{section.title}</span>
                {section.required && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">Required</span>
                )}
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeTemplateSection(section.id); }} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 size={16} />
              </button>
              {expandedSections.has(section.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {expandedSections.has(section.id) && (
              <div className="p-4 space-y-4 border-t border-gray-200">
                <Input label="Title" value={section.title} onChange={(e) => updateTemplateSection(section.id, 'title', e.target.value)} />
                <Input label="Description" value={section.description} onChange={(e) => updateTemplateSection(section.id, 'description', e.target.value)} />
                <Textarea label="Placeholder" value={section.placeholder} onChange={(e) => updateTemplateSection(section.id, 'placeholder', e.target.value)} rows={2} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={section.required} onChange={(e) => updateTemplateSection(section.id, 'required', e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
                  <span className="text-sm text-gray-700">Required field</span>
                </label>
              </div>
            )}
          </div>
        ))}

        <button onClick={addTemplateSection} className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600 flex items-center justify-center gap-2">
          <Plus size={18} /> Add Section
        </button>
      </div>
    </div>
  );

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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Types</h3>
          <div className="space-y-3">
            {[
              { key: 'delayAlerts', label: 'Delay Alerts', desc: 'Notify when projects become delayed or at-risk', icon: '⚠️' },
              { key: 'phaseCompletion', label: 'Phase Completion', desc: 'Notify when a project phase is marked complete', icon: '✅' },
              { key: 'projectCompletion', label: 'Project Completion', desc: 'Notify when a project is fully completed', icon: '🏁' },
              { key: 'caseStudyReminders', label: 'Case Study Reminders', desc: 'Remind team to create case studies for completed projects', icon: '📋' },
            ].map((item) => (
              <label
                key={item.key}
                className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${
                  notificationSettings[item.key as keyof NotificationSettings]
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={notificationSettings[item.key as keyof NotificationSettings] as boolean}
                    onChange={(e) => setNotificationSettings({ ...notificationSettings, [item.key]: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </label>
            ))}
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
      case 'MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return Shield;
      case 'MANAGER': return Users;
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
                { value: 'MANAGER', label: 'Manager — Can create/edit projects and manage teams' },
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
          {['ALL', 'ADMIN', 'MANAGER', 'VIEWER'].map((role) => (
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
                  : u.role === 'MANAGER' ? 'bg-blue-100 text-blue-700'
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
                      <option value="MANAGER">Manager</option>
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

  const renderAutomationTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Automation Rules</h3>
        <p className="text-sm text-gray-500 mb-4">Configure automated tasks and workflows</p>
      </div>

      <div className="space-y-3">
        {automationRules.map((rule) => (
          <div key={rule.id} className={`p-4 border rounded-lg ${rule.enabled ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${rule.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Workflow className={rule.enabled ? 'text-green-600' : 'text-gray-400'} size={20} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{rule.name}</p>
                  <p className="text-sm text-gray-500">
                    <Clock size={12} className="inline mr-1" />
                    {rule.trigger}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleAutomationRule(rule.id)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
            <p className="mt-2 text-sm text-gray-600 ml-13">{rule.action}</p>
          </div>
        ))}
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
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">API Key</p>
              <p className="text-sm text-gray-500">Use this key to access the PMO Tracker API</p>
            </div>
            <Button variant="outline" size="sm">Generate New Key</Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-white border border-gray-200 rounded text-sm font-mono">pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
            <Button variant="outline" size="sm">Copy</Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDataTab = () => {
    const handleExportProjects = async () => {
      setExportStatus((p) => ({ ...p, projects: 'loading' }));
      try {
        const res = await projectsApi.getAll({ limit: 1000 });
        const projects = res.data || [];
        const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const fmtStatus = (s: string) => {
          if (!s) return '';
          if (s === 'ACTIVE') return 'Active';
          if (s === 'INACTIVE' || s === 'COMPLETED' || s === 'ON_HOLD' || s === 'CANCELLED') return 'Inactive';
          return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
        };
        const headers = [
          'Project Name',
          'Project Manager',
          'Account Manager',
          'SOW Start Date',
          'SOW End Date',
          'Project Type (Migration)',
          'Plan Type',
          'Active / Inactive',
          'Overages (Estimated Cost)',
          'Actual Cost',
          'Status',
          'Phase',
          'Delay Status',
          'Source Platform',
          'Target Platform',
        ];
        const rows = projects.map((p: any) => [
          p.name || '',
          p.projectManager || '',
          p.accountManager || '',
          fmtDate(p.plannedStart),
          fmtDate(p.plannedEnd),
          p.migrationTypes || '',
          p.planType || '',
          fmtStatus(p.status),
          p.estimatedCost || '',
          p.actualCost || '',
          p.status || '',
          p.phase || '',
          p.delayStatus || '',
          p.sourcePlatform || '',
          p.targetPlatform || '',
        ]);
        const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        // BOM so Excel opens UTF-8 correctly
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `projects-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setExportStatus((p) => ({ ...p, projects: 'done' }));
        setTimeout(() => setExportStatus((p) => ({ ...p, projects: '' })), 3000);
      } catch {
        setExportStatus((p) => ({ ...p, projects: 'error' }));
        setTimeout(() => setExportStatus((p) => ({ ...p, projects: '' })), 3000);
      }
    };

    const handleExportSettings = () => {
      try {
        const data = localStorage.getItem('pmoSettings') || '{}';
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pmo-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportStatus((p) => ({ ...p, reports: 'done' }));
        setTimeout(() => setExportStatus((p) => ({ ...p, reports: '' })), 3000);
      } catch {
        setExportStatus((p) => ({ ...p, reports: 'error' }));
      }
    };

    return (
      <div className="space-y-6">
        {/* Export Data */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Export Data</h3>
          <p className="text-sm text-gray-500 mb-4">Download your data for backup or external reporting.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Export Projects */}
            <button
              onClick={handleExportProjects}
              disabled={exportStatus.projects === 'loading'}
              className="p-5 border-2 border-gray-200 rounded-xl text-center hover:border-primary-400 hover:bg-primary-50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exportStatus.projects === 'loading'
                ? <Loader2 className="mx-auto text-primary-600 mb-3 animate-spin" size={32} />
                : exportStatus.projects === 'done'
                  ? <CheckCircle className="mx-auto text-green-500 mb-3" size={32} />
                  : exportStatus.projects === 'error'
                    ? <AlertCircle className="mx-auto text-red-500 mb-3" size={32} />
                    : <Download className="mx-auto text-primary-600 mb-3 group-hover:scale-110 transition-transform" size={32} />
              }
              <p className="font-semibold text-gray-900">Export Projects</p>
              <p className="text-xs text-gray-500 mt-1">All projects as CSV</p>
              {exportStatus.projects === 'done' && <p className="text-xs text-green-600 mt-1 font-medium">Downloaded!</p>}
              {exportStatus.projects === 'error' && <p className="text-xs text-red-600 mt-1">Export failed</p>}
            </button>

            {/* Export Settings/Config */}
            <button
              onClick={handleExportSettings}
              className="p-5 border-2 border-gray-200 rounded-xl text-center hover:border-primary-400 hover:bg-primary-50 transition-all group"
            >
              {exportStatus.reports === 'done'
                ? <CheckCircle className="mx-auto text-green-500 mb-3" size={32} />
                : <FileDown className="mx-auto text-primary-600 mb-3 group-hover:scale-110 transition-transform" size={32} />
              }
              <p className="font-semibold text-gray-900">Export Configuration</p>
              <p className="text-xs text-gray-500 mt-1">All settings as JSON</p>
              {exportStatus.reports === 'done' && <p className="text-xs text-green-600 mt-1 font-medium">Downloaded!</p>}
            </button>

            {/* Export Migration Types */}
            <button
              onClick={() => {
                const data = JSON.stringify({ migrationTypes, sourcePlatforms, targetPlatforms }, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `migration-config-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-5 border-2 border-gray-200 rounded-xl text-center hover:border-primary-400 hover:bg-primary-50 transition-all group"
            >
              <FileText className="mx-auto text-primary-600 mb-3 group-hover:scale-110 transition-transform" size={32} />
              <p className="font-semibold text-gray-900">Export Migration Config</p>
              <p className="text-xs text-gray-500 mt-1">Migration types & platforms</p>
            </button>
          </div>
        </div>

        {/* Import Data */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Import Data</h3>
          <p className="text-sm text-gray-500 mb-4">Restore settings or import configuration from a JSON file.</p>
          <div className="p-6 border-2 border-dashed border-gray-300 rounded-xl text-center hover:border-primary-400 transition-colors">
            <Upload className="mx-auto text-gray-400 mb-3" size={36} />
            <p className="font-semibold text-gray-900 mb-1">Import Configuration</p>
            <p className="text-sm text-gray-500 mb-4">Upload a previously exported settings JSON file</p>
            <input
              type="file"
              accept=".json"
              id="settings-import"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const parsed = JSON.parse(ev.target?.result as string);
                    const existing = JSON.parse(localStorage.getItem('pmoSettings') || '{}');
                    localStorage.setItem('pmoSettings', JSON.stringify({ ...existing, ...parsed }));
                    alert('Configuration imported successfully! Refresh the page to apply all settings.');
                  } catch {
                    alert('Invalid JSON file. Please upload a valid configuration export.');
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
            <label htmlFor="settings-import">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                <FileUp size={16} /> Select JSON File
              </span>
            </label>
          </div>
        </div>

        {/* Data Retention */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Retention</h3>
          <div className="space-y-4">
            <Select
              label="Archive completed projects after"
              value="365"
              onChange={() => {}}
              options={[
                { value: '90', label: '90 days' },
                { value: '180', label: '180 days' },
                { value: '365', label: '1 year' },
                { value: 'never', label: 'Never' },
              ]}
            />
            <Select
              label="Delete archived data after"
              value="never"
              onChange={() => {}}
              options={[
                { value: '365', label: '1 year' },
                { value: '730', label: '2 years' },
                { value: '1825', label: '5 years' },
                { value: 'never', label: 'Never' },
              ]}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderBrandingTab = () => (
    <div className="space-y-6">
      {/* Company Identity */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input
              label="Company Name"
              value={brandingSettings.companyName}
              onChange={(e) => setBrandingSettings({ ...brandingSettings, companyName: e.target.value })}
              placeholder="e.g. CloudFuze"
            />
            <p className="text-xs text-gray-400">This name appears in the sidebar and page titles.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-gray-200">
                {companyLogo
                  ? <img src={companyLogo} alt="Logo" className="w-full h-full object-contain" />
                  : <FolderKanban className="text-gray-400" size={36} />
                }
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/*"
                  id="logo-upload"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const dataUrl = ev.target?.result as string;
                      setCompanyLogo(dataUrl);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <label htmlFor="logo-upload">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                    <Upload size={14} /> Upload Logo
                  </span>
                </label>
                {companyLogo && (
                  <button
                    onClick={() => setCompanyLogo(null)}
                    className="text-xs text-red-500 hover:text-red-700 text-left"
                  >
                    Remove logo
                  </button>
                )}
                <p className="text-xs text-gray-400">PNG, JPG, SVG up to 2MB</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Colors */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Theme Colors</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandingSettings.primaryColor}
                onChange={(e) => {
                  const color = e.target.value;
                  setBrandingSettings((prev) => ({ ...prev, primaryColor: color }));
                  document.documentElement.style.setProperty('--color-primary', color);
                }}
                className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
              />
              <Input
                value={brandingSettings.primaryColor}
                onChange={(e) => {
                  const color = e.target.value;
                  setBrandingSettings((prev) => ({ ...prev, primaryColor: color }));
                  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    document.documentElement.style.setProperty('--color-primary', color);
                  }
                }}
                className="flex-1 font-mono"
                placeholder="#4F46E5"
              />
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              {['#4F46E5','#2563EB','#7C3AED','#DC2626','#059669','#D97706','#0891B2','#374151'].map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => {
                    setBrandingSettings((prev) => ({ ...prev, primaryColor: c }));
                    document.documentElement.style.setProperty('--color-primary', c);
                  }}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: brandingSettings.primaryColor === c ? '#111' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandingSettings.secondaryColor}
                onChange={(e) => setBrandingSettings((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
              />
              <Input
                value={brandingSettings.secondaryColor}
                onChange={(e) => setBrandingSettings((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                className="flex-1 font-mono"
                placeholder="#10B981"
              />
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              {['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#84CC16','#6B7280'].map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => setBrandingSettings((prev) => ({ ...prev, secondaryColor: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: brandingSettings.secondaryColor === c ? '#111' : 'transparent' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
        <div className="p-4 border border-gray-200 rounded-xl bg-gray-50 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandingSettings.primaryColor }}>
              {companyLogo
                ? <img src={companyLogo} alt="Logo" className="w-8 h-8 object-contain rounded" />
                : <FolderKanban className="text-white" size={20} />
              }
            </div>
            <span className="text-lg font-bold text-gray-900">{brandingSettings.companyName || 'PMO Tracker'}</span>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 rounded-full text-white text-sm font-medium" style={{ backgroundColor: brandingSettings.primaryColor }}>Primary Button</span>
            <span className="px-3 py-1 rounded-full text-white text-sm font-medium" style={{ backgroundColor: brandingSettings.secondaryColor }}>Secondary</span>
          </div>
        </div>
      </div>

      {/* Theme Mode */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Theme Mode</h3>
        <div className="flex gap-4">
          {([['light', 'Light Mode'], ['dark', 'Dark Mode']] as const).map(([val, label]) => (
            <label
              key={val}
              className={`flex-1 p-4 border-2 rounded-xl cursor-pointer text-center transition-all ${
                brandingSettings.theme === val ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={val}
                checked={brandingSettings.theme === val}
                onChange={() => setBrandingSettings((prev) => ({ ...prev, theme: val }))}
                className="sr-only"
              />
              <div className="mb-2">
                {val === 'light' && <Eye className="mx-auto text-yellow-500" size={28} />}
                {val === 'dark' && <EyeOff className="mx-auto text-gray-700" size={28} />}
              </div>
              <p className="font-medium text-gray-900">{label}</p>
              {brandingSettings.theme === val && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-primary-600 font-medium">
                  <Check size={12} /> Active
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">Theme is applied immediately when you click. Save to persist.</p>
      </div>
    </div>
  );

  const renderAuditTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Audit Logging</h3>
        <div className="space-y-3">
          {[
            { key: 'enableLogging', label: 'Enable Activity Logging', desc: 'Track all user actions and system events' },
            { key: 'trackProjectChanges', label: 'Track Project Changes', desc: 'Log all modifications to projects' },
            { key: 'trackUserActions', label: 'Track User Actions', desc: 'Log login, logout, and user activities' },
            { key: 'trackExports', label: 'Track Data Exports', desc: 'Log all data export operations' },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={auditSettings[item.key as keyof typeof auditSettings] as boolean}
                onChange={(e) => setAuditSettings({ ...auditSettings, [item.key]: e.target.checked })}
                className="w-5 h-5 text-primary-600 rounded"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Log Retention</h3>
        <Select
          label="Keep audit logs for"
          value={String(auditSettings.logRetentionDays)}
          onChange={(e) => setAuditSettings({ ...auditSettings, logRetentionDays: parseInt(e.target.value) })}
          options={[
            { value: '30', label: '30 days' },
            { value: '60', label: '60 days' },
            { value: '90', label: '90 days' },
            { value: '180', label: '180 days' },
            { value: '365', label: '1 year' },
          ]}
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance</h3>
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="text-green-600" size={24} />
            <div>
              <p className="font-medium text-gray-900">GDPR Compliance Mode</p>
              <p className="text-sm text-gray-500">Enable data protection features for EU compliance</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• Data export on user request</p>
            <p>• Right to be forgotten (data deletion)</p>
            <p>• Consent management</p>
            <p>• Data processing records</p>
          </div>
          <Button variant="outline" className="mt-4">Enable GDPR Mode</Button>
        </div>
      </div>
    </div>
  );

  const renderMigrationTab = () => (
    <div className="space-y-8">
      {/* Migration Types */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Migration Types</h3>
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

  // ── Template Editor State ───────────────────────────────────────
  const [dbTemplates, setDbTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateActionMsg, setTemplateActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState({ name: '', code: '', description: '' });
  const [newPhaseForm, setNewPhaseForm] = useState<{ [templateId: string]: boolean }>({});
  const [newTaskForm, setNewTaskForm] = useState<{ [phaseId: string]: boolean }>({});
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateUploads, setTemplateUploads] = useState<Record<string, { id: string; name: string; size: string; type: string; uploadedAt: string }[]>>({});
  const [templateSubTab, setTemplateSubTab] = useState<'content' | 'messaging' | 'email'>('content');
  const [selectedCombination, setSelectedCombination] = useState<string | null>(null);
  const [combinationDocs, setCombinationDocs] = useState<Record<string, { id: string; name: string; size: string; ext: string; docType: string; uploadedAt: string }[]>>({});

  const TEMPLATE_COLORS: Record<string, { border: string; bg: string; icon: string; text: string }> = {
    CONTENT: { border: 'border-blue-200', bg: 'bg-blue-50', icon: '📁', text: 'text-blue-700' },
    EMAIL: { border: 'border-green-200', bg: 'bg-green-50', icon: '📧', text: 'text-green-700' },
    MESSAGING: { border: 'border-purple-200', bg: 'bg-purple-50', icon: '💬', text: 'text-purple-700' },
    IDENTITY: { border: 'border-yellow-200', bg: 'bg-yellow-50', icon: '👤', text: 'text-yellow-700' },
    APPLICATION: { border: 'border-red-200', bg: 'bg-red-50', icon: '🖥️', text: 'text-red-700' },
    DATABASE: { border: 'border-indigo-200', bg: 'bg-indigo-50', icon: '🗄️', text: 'text-indigo-700' },
  };
  const getTemplateColor = (code: string) => TEMPLATE_COLORS[code] || { border: 'border-gray-200', bg: 'bg-gray-50', icon: '📋', text: 'text-gray-700' };

  const [allProjects, setAllProjects] = useState<any[]>([]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await templatesApi.getAll();
      if (res.success) setDbTemplates(res.data);
    } catch (err: any) {
      setTemplatesError(err?.response?.data?.error?.message || 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') {
      fetchTemplates();
      projectsApi.getAll({ limit: 1000 }).then((r: any) => setAllProjects(r.data || [])).catch(() => {});
    }
  }, [activeTab, fetchTemplates]);

  const showTplMsg = (type: 'success' | 'error', text: string) => {
    setTemplateActionMsg({ type, text });
    setTimeout(() => setTemplateActionMsg(null), 3000);
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.name || !newTemplateForm.code) {
      showTplMsg('error', 'Name and code are required'); return;
    }
    setTemplateSaving(true);
    try {
      await templatesApi.create({
        name: newTemplateForm.name,
        code: newTemplateForm.code.toUpperCase(),
        description: newTemplateForm.description,
        phases: [],
      });
      showTplMsg('success', 'Template created');
      setNewTemplateForm({ name: '', code: '', description: '' });
      setShowNewTemplate(false);
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed to create template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this template and all its phases/tasks?')) return;
    try {
      await templatesApi.delete(id);
      showTplMsg('success', 'Template deleted');
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed to delete');
    }
  };

  const handleAddPhase = async (templateId: string, name: string, duration: number) => {
    const template = dbTemplates.find(t => t.id === templateId);
    const nextOrder = template?.phases?.length || 0;
    try {
      await templatesApi.addPhase(templateId, { name, orderIndex: nextOrder, defaultDuration: duration });
      showTplMsg('success', 'Phase added');
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed to add phase');
    }
  };

  const handleUpdatePhase = async (phaseId: string, updates: any) => {
    try {
      await templatesApi.updatePhase(phaseId, updates);
      showTplMsg('success', 'Phase updated');
      setEditingPhase(null);
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed to update phase');
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!window.confirm('Delete this phase and all its tasks?')) return;
    try {
      await templatesApi.deletePhase(phaseId);
      showTplMsg('success', 'Phase deleted');
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed');
    }
  };

  const handleAddTask = async (phaseId: string, name: string, duration: number, isMilestone: boolean) => {
    const phase = dbTemplates.flatMap((t: any) => t.phases).find((p: any) => p.id === phaseId);
    const nextOrder = phase?.tasks?.length || 0;
    try {
      await templatesApi.addTask(phaseId, { name, orderIndex: nextOrder, defaultDuration: duration, isMilestone });
      showTplMsg('success', 'Task added');
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed to add task');
    }
  };

  const handleUpdateTask = async (taskId: string, updates: any) => {
    try {
      await templatesApi.updateTask(taskId, updates);
      showTplMsg('success', 'Task updated');
      setEditingTask(null);
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await templatesApi.deleteTask(taskId);
      showTplMsg('success', 'Task removed');
      fetchTemplates();
    } catch (err: any) {
      showTplMsg('error', err?.response?.data?.error?.message || 'Failed');
    }
  };

  const togglePhaseExpand = (phaseId: string) => {
    const next = new Set(expandedPhases);
    next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
    setExpandedPhases(next);
  };

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Project Templates</h3>
          <p className="text-sm text-gray-500">
            Define phases and tasks for each migration type. Projects auto-generate from these templates.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNewTemplate(true)}>
          <Plus size={16} className="mr-1.5" /> New Template
        </Button>
      </div>

      {/* Status */}
      {templateActionMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          templateActionMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {templateActionMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {templateActionMsg.text}
        </div>
      )}

      {/* Create Template Form */}
      {showNewTemplate && (
        <div className="border-2 border-primary-200 bg-primary-50/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">Create New Template</h4>
            <button onClick={() => setShowNewTemplate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Template Name *" placeholder="e.g. Database Migration" value={newTemplateForm.name} onChange={(e) => setNewTemplateForm({ ...newTemplateForm, name: e.target.value })} />
            <Input label="Code *" placeholder="e.g. DATABASE" value={newTemplateForm.code} onChange={(e) => setNewTemplateForm({ ...newTemplateForm, code: e.target.value.toUpperCase() })} />
            <Input label="Description" placeholder="Brief description" value={newTemplateForm.description} onChange={(e) => setNewTemplateForm({ ...newTemplateForm, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleCreateTemplate} disabled={templateSaving}>
              {templateSaving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Plus size={16} className="mr-1" />} Create
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {templatesLoading && dbTemplates.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600 mr-2" />
          <span className="text-sm text-gray-500">Loading templates...</span>
        </div>
      )}

      {/* Error */}
      {templatesError && (
        <div className="text-center py-8">
          <p className="text-red-600 text-sm">{templatesError}</p>
          <button onClick={fetchTemplates} className="mt-2 text-primary-600 text-sm hover:underline">Retry</button>
        </div>
      )}

      {/* Template Cards */}
      {dbTemplates.map((tpl) => {
        const color = getTemplateColor(tpl.code);
        const totalTasks = tpl.phases?.reduce((sum: number, p: any) => sum + (p.tasks?.length || 0), 0) || 0;
        const totalMilestones = tpl.phases?.reduce((sum: number, p: any) => sum + (p.tasks?.filter((t: any) => t.isMilestone).length || 0), 0) || 0;
        const isExpanded = expandedTemplate === tpl.id;

        return (
          <div key={tpl.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-primary-300 shadow-md' : 'border-gray-200'}`}>
            {/* Template Header */}
            <div
              className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50 border-b border-gray-200' : ''}`}
              onClick={() => setExpandedTemplate(isExpanded ? null : tpl.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${color.bg} border ${color.border}`}>
                  {color.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{tpl.name}</h4>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${color.bg} ${color.text} border ${color.border}`}>{tpl.code}</span>
                    <span className="text-xs text-gray-500">{tpl.phases?.length || 0} phases</span>
                    <span className="text-xs text-gray-500">{totalTasks} tasks</span>
                    {totalMilestones > 0 && <span className="text-xs text-yellow-600">{totalMilestones} milestones</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete template"
                >
                  <Trash2 size={16} />
                </button>
                {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
              </div>
            </div>

            {/* Expanded: Phases & Tasks */}
            {isExpanded && (
              <div className="p-4 space-y-3">
                {tpl.description && <p className="text-sm text-gray-500 mb-3">{tpl.description}</p>}

                {/* Projects using this template */}
                {(() => {
                  const matchedProjects = allProjects.filter((p: any) => {
                    // Primary: project was explicitly assigned this template
                    if (p.templateId === tpl.id) return true;
                    // Secondary: migration type code matches
                    const types = (p.migrationTypes || '').toUpperCase().split(',').map((s: string) => s.trim()).filter(Boolean);
                    return types.includes(tpl.code.toUpperCase());
                  });
                  if (matchedProjects.length === 0) return null;
                  return (
                    <div className="mb-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        {matchedProjects.length} project{matchedProjects.length !== 1 ? 's' : ''} using this template
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {matchedProjects.map((p: any) => (
                          <a
                            key={p.id}
                            href={`/projects/${p.id}/tasks`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg text-xs font-medium text-blue-800 transition-colors shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            {p.name}
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Phases */}
                {tpl.phases?.map((phase: any, pi: number) => {
                  const phaseExpanded = expandedPhases.has(phase.id);
                  const isEditingPhase = editingPhase === phase.id;

                  return (
                    <div key={phase.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Phase Header */}
                      <div
                        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => togglePhaseExpand(phase.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full text-xs font-bold flex items-center justify-center">{pi + 1}</span>
                          {isEditingPhase ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                className="text-sm font-medium border border-gray-300 rounded px-2 py-1 w-48 focus:ring-2 focus:ring-primary-500 outline-none"
                                defaultValue={phase.name}
                                onBlur={(e) => handleUpdatePhase(phase.id, { name: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                autoFocus
                              />
                              <input
                                className="text-sm border border-gray-300 rounded px-2 py-1 w-20 focus:ring-2 focus:ring-primary-500 outline-none"
                                type="number"
                                defaultValue={phase.defaultDuration}
                                onBlur={(e) => handleUpdatePhase(phase.id, { defaultDuration: parseInt(e.target.value) || 7 })}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                              <span className="text-xs text-gray-400">days</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-medium text-gray-900">{phase.name}</span>
                              <span className="text-xs text-gray-400 ml-1">({phase.defaultDuration}d)</span>
                              <span className="text-xs text-gray-400">· {phase.tasks?.length || 0} tasks</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setEditingPhase(isEditingPhase ? null : phase.id)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Edit phase">
                            <Settings size={14} />
                          </button>
                          <button onClick={() => handleDeletePhase(phase.id)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete phase">
                            <Trash2 size={14} />
                          </button>
                          {phaseExpanded ? <ChevronUp size={16} className="text-gray-400 ml-1" /> : <ChevronDown size={16} className="text-gray-400 ml-1" />}
                        </div>
                      </div>

                      {/* Tasks */}
                      {phaseExpanded && (
                        <div className="p-3 space-y-1.5 bg-white">
                          {phase.tasks?.length === 0 && (
                            <p className="text-xs text-gray-400 italic py-2 text-center">No tasks yet. Add one below.</p>
                          )}
                          {phase.tasks?.map((task: any, ti: number) => {
                            const isEditingThisTask = editingTask === task.id;
                            return (
                              <div key={task.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${task.isMilestone ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-100'}`}>
                                <span className="w-5 h-5 bg-gray-200 text-gray-600 rounded text-xs font-medium flex items-center justify-center flex-shrink-0">
                                  {ti + 1}
                                </span>
                                {isEditingThisTask ? (
                                  <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:ring-2 focus:ring-primary-500 outline-none"
                                      defaultValue={task.name}
                                      onBlur={(e) => handleUpdateTask(task.id, { name: e.target.value })}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                      autoFocus
                                    />
                                    <input
                                      className="text-sm border border-gray-300 rounded px-2 py-1 w-16 focus:ring-2 focus:ring-primary-500 outline-none"
                                      type="number"
                                      defaultValue={task.defaultDuration}
                                      onBlur={(e) => handleUpdateTask(task.id, { defaultDuration: parseInt(e.target.value) || 1 })}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                    <label className="flex items-center gap-1 text-xs text-gray-500">
                                      <input
                                        type="checkbox"
                                        defaultChecked={!!task.isMilestone}
                                        onChange={(e) => handleUpdateTask(task.id, { isMilestone: e.target.checked })}
                                        className="rounded"
                                      />
                                      Milestone
                                    </label>
                                  </div>
                                ) : (
                                  <>
                                    <span className="flex-1 text-gray-700">{task.name}</span>
                                    <span className="text-xs text-gray-400">{task.defaultDuration}d</span>
                                    {task.isMilestone ? (
                                      <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">Milestone</span>
                                    ) : null}
                                  </>
                                )}
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <button onClick={() => setEditingTask(isEditingThisTask ? null : task.id)} className="p-1 text-gray-400 hover:text-primary-600 rounded">
                                    <Settings size={12} />
                                  </button>
                                  <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Add Task inline */}
                          {newTaskForm[phase.id] ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg">
                              <input id={`new-task-name-${phase.id}`} className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Task name" autoFocus />
                              <input id={`new-task-dur-${phase.id}`} className="text-sm border border-gray-300 rounded px-2 py-1 w-16 focus:ring-2 focus:ring-primary-500 outline-none" type="number" defaultValue="2" placeholder="Days" />
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                <input id={`new-task-ms-${phase.id}`} type="checkbox" className="rounded" />MS
                              </label>
                              <button
                                onClick={() => {
                                  const nameEl = document.getElementById(`new-task-name-${phase.id}`) as HTMLInputElement;
                                  const durEl = document.getElementById(`new-task-dur-${phase.id}`) as HTMLInputElement;
                                  const msEl = document.getElementById(`new-task-ms-${phase.id}`) as HTMLInputElement;
                                  if (nameEl?.value) {
                                    handleAddTask(phase.id, nameEl.value, parseInt(durEl?.value) || 2, msEl?.checked || false);
                                    setNewTaskForm({ ...newTaskForm, [phase.id]: false });
                                  }
                                }}
                                className="px-2 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700"
                              >
                                Add
                              </button>
                              <button onClick={() => setNewTaskForm({ ...newTaskForm, [phase.id]: false })} className="text-gray-400 hover:text-gray-600">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setNewTaskForm({ ...newTaskForm, [phase.id]: true })}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors w-full"
                            >
                              <Plus size={14} /> Add Task
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Uploaded Documents */}
                <div className="border border-gray-200 rounded-lg overflow-hidden mt-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Upload size={15} className="text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Uploaded Documents</span>
                      {(templateUploads[tpl.id]?.length || 0) > 0 && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">{templateUploads[tpl.id].length}</span>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer transition-colors">
                      <Plus size={13} /> Upload File
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const newDocs = files.map((f) => ({
                            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            name: f.name,
                            size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
                            type: f.name.split('.').pop()?.toUpperCase() || 'FILE',
                            uploadedAt: new Date().toISOString(),
                          }));
                          setTemplateUploads((prev) => ({
                            ...prev,
                            [tpl.id]: [...(prev[tpl.id] || []), ...newDocs],
                          }));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <div className="p-3">
                    {(!templateUploads[tpl.id] || templateUploads[tpl.id].length === 0) ? (
                      <p className="text-xs text-gray-400 italic text-center py-3">No documents uploaded. Upload kickoff decks, runbooks, or template files.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {templateUploads[tpl.id].map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm">
                            <FileText size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="flex-1 text-gray-700 truncate">{doc.name}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{doc.type}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{doc.size}</span>
                            <button
                              onClick={() => setTemplateUploads((prev) => ({
                                ...prev,
                                [tpl.id]: prev[tpl.id].filter((d) => d.id !== doc.id),
                              }))}
                              className="p-0.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
                              title="Remove"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Phase */}
                {newPhaseForm[tpl.id] ? (
                  <div className="flex items-center gap-2 p-3 bg-primary-50 border-2 border-dashed border-primary-200 rounded-lg">
                    <input id={`new-phase-name-${tpl.id}`} className="text-sm border border-gray-300 rounded px-2 py-1.5 flex-1 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Phase name (e.g. Phase 6: Post-Migration)" autoFocus />
                    <input id={`new-phase-dur-${tpl.id}`} className="text-sm border border-gray-300 rounded px-2 py-1.5 w-20 focus:ring-2 focus:ring-primary-500 outline-none" type="number" defaultValue="7" placeholder="Days" />
                    <button
                      onClick={() => {
                        const nameEl = document.getElementById(`new-phase-name-${tpl.id}`) as HTMLInputElement;
                        const durEl = document.getElementById(`new-phase-dur-${tpl.id}`) as HTMLInputElement;
                        if (nameEl?.value) {
                          handleAddPhase(tpl.id, nameEl.value, parseInt(durEl?.value) || 7);
                          setNewPhaseForm({ ...newPhaseForm, [tpl.id]: false });
                        }
                      }}
                      className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                    >
                      Add Phase
                    </button>
                    <button onClick={() => setNewPhaseForm({ ...newPhaseForm, [tpl.id]: false })} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setNewPhaseForm({ ...newPhaseForm, [tpl.id]: true })}
                    className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/30 transition-colors"
                  >
                    <Plus size={16} /> Add New Phase
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* How it works */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900">How Templates Work</h4>
            <p className="text-sm text-blue-700 mt-0.5">
              When you create a new project and select a migration type, the system automatically generates all phases and tasks from the matching template.
              You can then track progress on each task. Click a template above to expand and edit its phases and tasks inline.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    try {
      switch (activeTab) {
        case 'templates': return renderTemplatesTab();
        case 'migration': return renderMigrationTab();
        case 'case-study': return renderCaseStudyTab();
        case 'project': return renderProjectConfigTab();
        case 'notifications': return renderNotificationsTab();
        case 'team': return renderTeamTab();
        case 'dashboard': return renderDashboardTab();
        case 'automation': return renderAutomationTab();
        case 'integrations': return renderIntegrationsTab();
        case 'data': return renderDataTab();
        case 'branding': return renderBrandingTab();
        case 'audit': return renderAuditTab();
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
            onClick={() => setActiveTab('templates')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            Go to Project Templates
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
        <Button onClick={handleSaveAll} isLoading={isSaving}>
          <Save size={16} className="mr-2" />
          Save All Settings
        </Button>
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
