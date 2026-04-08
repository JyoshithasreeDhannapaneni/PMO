'use client';

import { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import { exportToPDF, exportToWord } from '@/utils/exportCaseStudy';

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
  slaHours: number;
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
  theme: string;
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
  const [activeTab, setActiveTab] = useState('templates');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // State for all settings
  const [template, setTemplate] = useState<CaseStudyTemplate>(defaultTemplate);
  const [planTypes, setPlanTypes] = useState<PlanType[]>(defaultPlanTypes);
  const [phases, setPhases] = useState<ProjectPhase[]>(defaultPhases);
  const [migrationTypes, setMigrationTypes] = useState<MigrationType[]>(defaultMigrationTypes);
  const [sourcePlatforms, setSourcePlatforms] = useState<SourcePlatform[]>(defaultSourcePlatforms);
  const [targetPlatforms, setTargetPlatforms] = useState<TargetPlatform[]>(defaultTargetPlatforms);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>(defaultAlertThresholds);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(defaultDashboardSettings);
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>(defaultBrandingSettings);
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

  // Load settings from localStorage
  useEffect(() => {
    const loadSettings = () => {
      try {
        const saved = localStorage.getItem('pmoSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.template) setTemplate(parsed.template);
          if (parsed.planTypes) setPlanTypes(parsed.planTypes);
          if (parsed.phases) setPhases(parsed.phases);
          if (parsed.notificationSettings) setNotificationSettings(parsed.notificationSettings);
          if (parsed.alertThresholds) setAlertThresholds(parsed.alertThresholds);
          if (parsed.dashboardSettings) setDashboardSettings(parsed.dashboardSettings);
          if (parsed.brandingSettings) setBrandingSettings(parsed.brandingSettings);
          if (parsed.teamMembers) setTeamMembers(parsed.teamMembers);
          if (parsed.automationRules) setAutomationRules(parsed.automationRules);
          if (parsed.smtpSettings) setSmtpSettings(parsed.smtpSettings);
          if (parsed.auditSettings) setAuditSettings(parsed.auditSettings);
          if (parsed.integrationSettings) setIntegrationSettings(parsed.integrationSettings);
          if (parsed.migrationTypes) setMigrationTypes(parsed.migrationTypes);
          if (parsed.sourcePlatforms) setSourcePlatforms(parsed.sourcePlatforms);
          if (parsed.targetPlatforms) setTargetPlatforms(parsed.targetPlatforms);
        }
      } catch (e) {
        console.error('Failed to load settings');
      }
    };
    loadSettings();
  }, []);

  // Save all settings
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const allSettings = {
        template,
        planTypes,
        phases,
        notificationSettings,
        alertThresholds,
        dashboardSettings,
        brandingSettings,
        teamMembers,
        automationRules,
        smtpSettings,
        auditSettings,
        integrationSettings,
        migrationTypes,
        sourcePlatforms,
        targetPlatforms,
      };
      localStorage.setItem('pmoSettings', JSON.stringify(allSettings));
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
                <span className="text-sm text-gray-500">hrs SLA</span>
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

  const renderNotificationsTab = () => (
    <div className="space-y-8">
      {/* Email Settings */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="SMTP Host" value={smtpSettings.host} onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })} />
          <Input label="SMTP Port" value={smtpSettings.port} onChange={(e) => setSmtpSettings({ ...smtpSettings, port: e.target.value })} />
          <Input label="SMTP User" value={smtpSettings.user} onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })} />
          <Input label="SMTP Password" type="password" value={smtpSettings.password} onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })} />
          <Input label="From Email" value={smtpSettings.fromEmail} onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })} className="md:col-span-2" />
        </div>
      </div>

      {/* Notification Toggles */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Types</h3>
        <div className="space-y-3">
          {[
            { key: 'emailEnabled', label: 'Enable Email Notifications', desc: 'Master toggle for all email notifications' },
            { key: 'delayAlerts', label: 'Delay Alerts', desc: 'Notify when projects become delayed' },
            { key: 'phaseCompletion', label: 'Phase Completion', desc: 'Notify when a project phase is completed' },
            { key: 'projectCompletion', label: 'Project Completion', desc: 'Notify when a project is marked as completed' },
            { key: 'caseStudyReminders', label: 'Case Study Reminders', desc: 'Remind about pending case studies' },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={notificationSettings[item.key as keyof NotificationSettings] as boolean}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, [item.key]: e.target.checked })}
                className="w-5 h-5 text-primary-600 rounded"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Alert Thresholds */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Thresholds</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">At Risk Threshold (days before deadline)</label>
            <Input type="number" value={alertThresholds.atRiskDays} onChange={(e) => setAlertThresholds({ ...alertThresholds, atRiskDays: parseInt(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delayed Threshold (days past deadline)</label>
            <Input type="number" value={alertThresholds.delayedDays} onChange={(e) => setAlertThresholds({ ...alertThresholds, delayedDays: parseInt(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Case Study Reminder (days after completion)</label>
            <Input type="number" value={alertThresholds.caseStudyReminderDays} onChange={(e) => setAlertThresholds({ ...alertThresholds, caseStudyReminderDays: parseInt(e.target.value) })} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeamTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
          <p className="text-sm text-gray-500">Manage project managers and account managers</p>
        </div>
        <Button variant="outline" size="sm" onClick={addTeamMember}>
          <Plus size={16} className="mr-1" /> Add Member
        </Button>
      </div>

      <div className="space-y-3">
        {teamMembers.map((member) => (
          <div key={member.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <Users className="text-primary-600" size={20} />
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="Name" value={member.name} onChange={(e) => updateTeamMember(member.id, 'name', e.target.value)} />
              <Input placeholder="Email" value={member.email} onChange={(e) => updateTeamMember(member.id, 'email', e.target.value)} />
              <Select
                value={member.role}
                onChange={(e) => updateTeamMember(member.id, 'role', e.target.value)}
                options={[
                  { value: 'Project Manager', label: 'Project Manager' },
                  { value: 'Account Manager', label: 'Account Manager' },
                  { value: 'Team Lead', label: 'Team Lead' },
                  { value: 'Developer', label: 'Developer' },
                ]}
              />
            </div>
            <button onClick={() => removeTeamMember(member.id)} className="p-2 text-red-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* User Roles */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Role Permissions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Permission</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Admin</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Manager</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700">Viewer</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'View Projects', admin: true, manager: true, viewer: true },
                { name: 'Create Projects', admin: true, manager: true, viewer: false },
                { name: 'Edit Projects', admin: true, manager: true, viewer: false },
                { name: 'Delete Projects', admin: true, manager: false, viewer: false },
                { name: 'Manage Users', admin: true, manager: false, viewer: false },
                { name: 'View Reports', admin: true, manager: true, viewer: true },
                { name: 'Export Data', admin: true, manager: true, viewer: false },
                { name: 'System Settings', admin: true, manager: false, viewer: false },
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

  const renderDataTab = () => (
    <div className="space-y-6">
      {/* Export Settings */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg text-center hover:border-primary-400 cursor-pointer">
            <Download className="mx-auto text-primary-600 mb-2" size={32} />
            <p className="font-medium text-gray-900">Export Projects</p>
            <p className="text-sm text-gray-500">CSV or Excel format</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg text-center hover:border-primary-400 cursor-pointer">
            <Download className="mx-auto text-primary-600 mb-2" size={32} />
            <p className="font-medium text-gray-900">Export Case Studies</p>
            <p className="text-sm text-gray-500">PDF or Word format</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg text-center hover:border-primary-400 cursor-pointer">
            <Download className="mx-auto text-primary-600 mb-2" size={32} />
            <p className="font-medium text-gray-900">Export Reports</p>
            <p className="text-sm text-gray-500">Full analytics report</p>
          </div>
        </div>
      </div>

      {/* Import Settings */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Data</h3>
        <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
          <Upload className="mx-auto text-gray-400 mb-2" size={32} />
          <p className="font-medium text-gray-900">Drop files here or click to upload</p>
          <p className="text-sm text-gray-500">Supports CSV, Excel (.xlsx), and JSON formats</p>
          <Button variant="outline" className="mt-4">Select Files</Button>
        </div>
      </div>

      {/* Data Retention */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Retention</h3>
        <div className="space-y-4">
          <Select
            label="Archive completed projects after"
            value="365"
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

  const renderBrandingTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Company Name"
            value={brandingSettings.companyName}
            onChange={(e) => setBrandingSettings({ ...brandingSettings, companyName: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                <FolderKanban className="text-gray-400" size={32} />
              </div>
              <Button variant="outline" size="sm">Upload Logo</Button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Theme Colors</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandingSettings.primaryColor}
                onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
                className="w-12 h-12 rounded cursor-pointer"
              />
              <Input
                value={brandingSettings.primaryColor}
                onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandingSettings.secondaryColor}
                onChange={(e) => setBrandingSettings({ ...brandingSettings, secondaryColor: e.target.value })}
                className="w-12 h-12 rounded cursor-pointer"
              />
              <Input
                value={brandingSettings.secondaryColor}
                onChange={(e) => setBrandingSettings({ ...brandingSettings, secondaryColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Theme Mode</h3>
        <div className="flex gap-4">
          {['light', 'dark', 'system'].map((theme) => (
            <label
              key={theme}
              className={`flex-1 p-4 border rounded-lg cursor-pointer text-center ${
                brandingSettings.theme === theme ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={brandingSettings.theme === theme}
                onChange={(e) => setBrandingSettings({ ...brandingSettings, theme: e.target.value })}
                className="sr-only"
              />
              <div className="mb-2">
                {theme === 'light' && <Eye className="mx-auto text-yellow-500" size={24} />}
                {theme === 'dark' && <EyeOff className="mx-auto text-gray-700" size={24} />}
                {theme === 'system' && <Settings className="mx-auto text-gray-500" size={24} />}
              </div>
              <p className="font-medium text-gray-900 capitalize">{theme}</p>
            </label>
          ))}
        </div>
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
              className={`p-4 border-2 rounded-lg transition-all ${
                type.enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                    style={{ backgroundColor: type.color + '20' }}
                  >
                    {type.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{type.name}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{type.code}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={type.enabled}
                    onChange={() => {
                      setMigrationTypes(migrationTypes.map((t) =>
                        t.id === type.id ? { ...t, enabled: !t.enabled } : t
                      ));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
              <p className="mt-3 text-sm text-gray-600">{type.description}</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="color"
                  value={type.color}
                  onChange={(e) => {
                    setMigrationTypes(migrationTypes.map((t) =>
                      t.id === type.id ? { ...t, color: e.target.value } : t
                    ));
                  }}
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <span className="text-xs text-gray-500">Badge color</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            const newType: MigrationType = {
              id: Date.now().toString(),
              name: 'New Migration Type',
              code: 'NEW',
              description: 'Description of the migration type',
              icon: '📦',
              color: '#6B7280',
              enabled: true,
            };
            setMigrationTypes([...migrationTypes, newType]);
          }}
          className="mt-4 w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600 flex items-center justify-center gap-2"
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

        <div className="space-y-2">
          {['Email', 'Content', 'Messaging', 'Other'].map((category) => {
            const platformsInCategory = sourcePlatforms.filter((p) => p.category === category);
            if (platformsInCategory.length === 0 && category !== 'Other') return null;
            return (
              <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 font-medium text-gray-700 text-sm">
                  {category} Platforms ({platformsInCategory.length})
                </div>
                <div className="p-2 flex flex-wrap gap-2">
                  {platformsInCategory.map((platform) => (
                    <div
                      key={platform.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm group"
                    >
                      <span>{platform.name}</span>
                      <button
                        onClick={() => setSourcePlatforms(sourcePlatforms.filter((p) => p.id !== platform.id))}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {platformsInCategory.length === 0 && (
                    <span className="text-sm text-gray-400 italic">No platforms configured</span>
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
            <p className="text-sm text-gray-500">Platforms you migrate data to</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {targetPlatforms.map((platform) => (
            <div
              key={platform.id}
              className="p-3 border border-gray-200 rounded-lg bg-white hover:border-primary-300 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{platform.name}</p>
                  <p className="text-xs text-gray-500">{platform.category}</p>
                </div>
                <button
                  onClick={() => setTargetPlatforms(targetPlatforms.filter((p) => p.id !== platform.id))}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Project Templates</h3>
            <p className="text-sm text-gray-500">
              Define phase and task templates for each migration type. When you create a project, tasks will be auto-generated from the template.
            </p>
          </div>
          <a 
            href="/settings/templates" 
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Open Template Editor
          </a>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📁</span>
              <span className="font-semibold text-gray-900">Content Migration</span>
            </div>
            <p className="text-sm text-gray-600 mb-2">5 phases, 15 tasks</p>
            <p className="text-xs text-gray-500">SharePoint, File Servers, OneDrive</p>
          </div>
          
          <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📧</span>
              <span className="font-semibold text-gray-900">Email Migration</span>
            </div>
            <p className="text-sm text-gray-600 mb-2">5 phases, 17 tasks</p>
            <p className="text-xs text-gray-500">Exchange, Gmail, Mailbox</p>
          </div>
          
          <div className="p-4 border border-purple-200 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💬</span>
              <span className="font-semibold text-gray-900">Messaging Migration</span>
            </div>
            <p className="text-sm text-gray-600 mb-2">5 phases, 14 tasks</p>
            <p className="text-xs text-gray-500">Slack, Teams, Chat</p>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>How it works:</strong> When you create a new project and select a migration type, 
            the system automatically generates all phases and tasks based on the template. 
            You can then track progress on each task with the Gantt view.
          </p>
        </div>
      </Card>
    </div>
  );

  const renderTabContent = () => {
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
