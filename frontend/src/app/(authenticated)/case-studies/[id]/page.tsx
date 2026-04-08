'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Eye,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown
} from 'lucide-react';
import { exportToPDF, exportToWord } from '@/utils/exportCaseStudy';

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

interface CaseStudy {
  id: string;
  projectId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';
  title: string | null;
  content: string | null;
  publishedAt: string | null;
  project?: {
    id: string;
    name: string;
    customerName: string;
    projectManager: string;
    accountManager: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string;
    actualEnd: string;
    sourcePlatform: string;
    targetPlatform: string;
  };
}

interface SectionContent {
  [sectionId: string]: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const defaultTemplate: CaseStudyTemplate = {
  name: 'Closed Project — Migration Case Study',
  sections: [
    { id: '1', title: '1. Project Identification', description: 'Basic project information and stakeholders', placeholder: 'Project Name:\nCustomer Name:\nProject Manager:\nAccount Manager:\nProject Start Date:\nProject End Date:\nMigration Type:\nProject Status:', required: true },
    { id: '2', title: '2. Migration Overview & Scope', description: 'Source and target environment details', placeholder: 'Source Environment:\n- Platform/System:\n- Data Volume:\n- User Count:\n- Mailbox Count:\n\nTarget Environment:\n- Platform/System:\n- Region/Tenant:\n\nScope Summary:\n- In Scope Items:\n- Out of Scope Items:', required: true },
    { id: '3', title: '3. Pre-Migration Assessment', description: 'Infrastructure and data inventory assessment', placeholder: 'Infrastructure Assessment:\n- Source system health check results\n- Network bandwidth assessment\n- Security compliance review\n\nData Inventory:\n- Total data size (GB/TB)\n- Number of users/mailboxes\n- Special data types identified\n- Data cleanup requirements:', required: true },
    { id: '4', title: '4. Migration Strategy & Execution', description: 'Methodology, phases, and tools used', placeholder: 'Migration Methodology:\n- Approach (Big Bang/Phased/Hybrid)\n- Cutover strategy\n\nPhase Breakdown:\n- Phase 1: Planning & Assessment\n- Phase 2: Pilot Migration\n- Phase 3: Production Migration\n- Phase 4: Validation & Closure\n\nTools & Technologies Used:\n- Migration tool(s)\n- Monitoring tools\n- Communication tools:', required: true },
    { id: '5', title: '5. Success Metrics & KPIs', description: 'Performance metrics with targets and actuals', placeholder: 'Key Performance Indicators:\n\n| Metric | Target | Actual | Status |\n|--------|--------|--------|--------|\n| Data Migration Success Rate | 99.5% | | |\n| User Migration Success Rate | 100% | | |\n| Downtime (hours) | <4 | | |\n| Post-Migration Issues | <5 | | |\n| Customer Satisfaction | >4.5/5 | | |\n| On-Time Delivery | Yes | | |', required: true },
    { id: '6', title: '6. Risks, Challenges & Mitigations', description: 'Risk tracking with status and mitigation steps', placeholder: 'Risk Register:\n\n| Risk ID | Risk Description | Impact | Probability | Mitigation Strategy | Status |\n|---------|------------------|--------|-------------|---------------------|--------|\n| R001 | | High/Med/Low | High/Med/Low | | Open/Closed |\n\nChallenges Encountered:\n1. Challenge:\n   - Impact:\n   - Resolution:', required: true },
    { id: '7', title: '7. Key Issues & Resolution Log', description: 'Issue tracking and resolution details', placeholder: 'Issue Log:\n\n| Issue ID | Date Reported | Description | Root Cause | Resolution | Date Resolved | Owner |\n|----------|---------------|-------------|------------|------------|---------------|-------|\n| ISS001 | | | | | | |\n\nEscalations:\n- Any escalations to management\n- Resolution timeline', required: false },
    { id: '8', title: '8. Validation, UAT & Communication', description: 'Testing results and stakeholder communication', placeholder: 'Validation Results:\n- Pre-migration validation: Pass/Fail\n- Post-migration validation: Pass/Fail\n- Data integrity check: Pass/Fail\n\nUAT Summary:\n- UAT Start Date:\n- UAT End Date:\n- Test Cases Executed:\n- Pass Rate:\n- Sign-off obtained: Yes/No\n\nStakeholder Communication:\n- Kick-off meeting date:\n- Status update frequency:\n- Final closure meeting date:', required: true },
    { id: '9', title: '9. Knowledge Transfer & Documentation', description: 'Training and handover details', placeholder: 'Knowledge Transfer:\n- Training sessions conducted:\n- Training materials provided:\n- Admin handover completed: Yes/No\n\nDocumentation Delivered:\n- [ ] Migration runbook\n- [ ] Configuration documentation\n- [ ] User guides\n- [ ] Admin guides\n- [ ] Troubleshooting guide\n- [ ] Rollback procedures', required: false },
    { id: '10', title: '10. Valuable Insights & Final Deliverables', description: 'Lessons learned and recommendations', placeholder: 'Lessons Learned:\n1. What went well:\n2. What could be improved:\n3. Recommendations for future projects:\n\nFinal Deliverables:\n- [ ] Migration completion report\n- [ ] Data validation report\n- [ ] UAT sign-off document\n- [ ] Knowledge transfer completion\n- [ ] Project closure document', required: true },
    { id: '11', title: '11. Final Assessment & Project Sign-off', description: 'Project closure and approval details', placeholder: 'Overall Project Assessment:\n- Project delivered on time: Yes/No\n- Project delivered within budget: Yes/No\n- All success criteria met: Yes/No\n- Customer satisfaction rating: /5\n\nSign-off Details:\n- Customer Sign-off Date:\n- Customer Representative:\n- Internal Sign-off Date:\n- Project Manager:\n\nProject Closure Status: CLOSED', required: true },
    { id: '12', title: '12. Client Testimonial', description: 'Quote or feedback from the client', placeholder: 'Client Feedback:\n"[Insert client testimonial or feedback quote here]"\n\n- Client Name:\n- Title:\n- Company:\n- Date:', required: false },
  ],
};

export default function CaseStudyEditorPage() {
  const params = useParams();
  const router = useRouter();
  const caseStudyId = params.id as string;
  
  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [template, setTemplate] = useState<CaseStudyTemplate>(defaultTemplate);
  const [title, setTitle] = useState('');
  const [sectionContent, setSectionContent] = useState<SectionContent>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['1']));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadTemplate();
    fetchCaseStudy();
  }, [caseStudyId]);

  const loadTemplate = () => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.template && parsed.template.sections) {
          setTemplate(parsed.template);
        }
      }
    } catch (e) {
      console.error('Failed to load template from settings');
    }
  };

  const fetchCaseStudy = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/case-studies/${caseStudyId}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        setCaseStudy(data.data);
        setTitle(data.data.title || data.data.project?.name || '');
        
        // Parse existing content into sections
        if (data.data.content) {
          try {
            const parsed = JSON.parse(data.data.content);
            setSectionContent(parsed);
          } catch {
            // If content is not JSON, put it in the first section
            setSectionContent({ '1': data.data.content });
          }
        }
        
        // Expand all sections that have content
        const sectionsWithContent = new Set(
          Object.keys(sectionContent).filter((k) => sectionContent[k])
        );
        sectionsWithContent.add('1');
        setExpandedSections(sectionsWithContent);
      }
    } catch (error) {
      console.error('Failed to fetch case study:', error);
      setMessage({ type: 'error', text: 'Failed to load case study' });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const updateSectionContent = (sectionId: string, content: string) => {
    setSectionContent((prev) => ({
      ...prev,
      [sectionId]: content,
    }));
  };

  const getCompletionPercentage = () => {
    const requiredSections = template.sections.filter((s) => s.required);
    const completedRequired = requiredSections.filter(
      (s) => sectionContent[s.id] && sectionContent[s.id].trim().length > 0
    );
    return Math.round((completedRequired.length / requiredSections.length) * 100);
  };

  const handleSave = async (newStatus?: string) => {
    try {
      setIsSaving(true);
      
      const content = JSON.stringify(sectionContent);
      const status = newStatus || caseStudy?.status || 'IN_PROGRESS';
      
      const response = await fetch(`${API_URL}/api/case-studies/${caseStudyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          status,
          publishedAt: status === 'PUBLISHED' ? new Date().toISOString() : null,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setCaseStudy(data.data);
        setMessage({ type: 'success', text: `Case study ${newStatus === 'PUBLISHED' ? 'published' : 'saved'} successfully` });
      } else {
        setMessage({ type: 'error', text: 'Failed to save case study' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save case study' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'word') => {
    if (!caseStudy) return;
    
    setIsExporting(true);
    try {
      const exportData = {
        title,
        projectName: caseStudy.project?.name || '',
        customerName: caseStudy.project?.customerName || '',
        projectManager: caseStudy.project?.projectManager || '',
        accountManager: caseStudy.project?.accountManager,
        sourcePlatform: caseStudy.project?.sourcePlatform,
        targetPlatform: caseStudy.project?.targetPlatform,
        plannedStart: caseStudy.project?.plannedStart ? new Date(caseStudy.project.plannedStart).toLocaleDateString() : undefined,
        plannedEnd: caseStudy.project?.plannedEnd ? new Date(caseStudy.project.plannedEnd).toLocaleDateString() : undefined,
        actualStart: caseStudy.project?.actualStart ? new Date(caseStudy.project.actualStart).toLocaleDateString() : undefined,
        actualEnd: caseStudy.project?.actualEnd ? new Date(caseStudy.project.actualEnd).toLocaleDateString() : undefined,
        sections: template.sections,
        sectionContent,
      };

      if (format === 'pdf') {
        exportToPDF(exportData);
        setMessage({ type: 'success', text: 'PDF exported successfully' });
      } else {
        await exportToWord(exportData);
        setMessage({ type: 'success', text: 'Word document exported successfully' });
      }
    } catch (error) {
      console.error('Export failed:', error);
      setMessage({ type: 'error', text: `Failed to export ${format.toUpperCase()}` });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!caseStudy) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Case study not found</p>
        <Link href="/case-studies">
          <Button className="mt-4">Back to Case Studies</Button>
        </Link>
      </div>
    );
  }

  const completion = getCompletionPercentage();

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/case-studies"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Case Studies
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {caseStudy.status === 'PUBLISHED' ? 'View' : 'Edit'} Case Study
            </h1>
            <p className="text-gray-500">
              {caseStudy.project?.name} · {caseStudy.project?.customerName}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Export Buttons */}
            <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <FileDown size={14} className="mr-2" />
                )}
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('word')}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <Download size={14} className="mr-2" />
                )}
                Word
              </Button>
            </div>
            
            {caseStudy.status !== 'PUBLISHED' && (
              <>
                <Button variant="outline" onClick={() => handleSave()} isLoading={isSaving}>
                  <Save size={16} className="mr-2" />
                  Save Draft
                </Button>
                {completion === 100 && (
                  <Button onClick={() => handleSave('PUBLISHED')} isLoading={isSaving}>
                    <Eye size={16} className="mr-2" />
                    Publish
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Progress & Project Info */}
        <div className="lg:col-span-1 space-y-4">
          {/* Progress Card */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Completion</h3>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    completion === 100 ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">{completion}%</span>
            </div>
            <p className="text-xs text-gray-500">
              {completion === 100 
                ? 'All required sections completed!' 
                : 'Complete all required sections to publish'}
            </p>
          </Card>

          {/* Project Info Card */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Project Details</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">Customer:</span>
                <p className="font-medium">{caseStudy.project?.customerName}</p>
              </div>
              <div>
                <span className="text-gray-500">Project Manager:</span>
                <p className="font-medium">{caseStudy.project?.projectManager}</p>
              </div>
              <div>
                <span className="text-gray-500">Source:</span>
                <p className="font-medium">{caseStudy.project?.sourcePlatform || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500">Target:</span>
                <p className="font-medium">{caseStudy.project?.targetPlatform || 'N/A'}</p>
              </div>
            </div>
          </Card>

          {/* Section Navigation */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Sections</h3>
            <div className="space-y-1">
              {template.sections.map((section) => {
                const hasContent = sectionContent[section.id]?.trim().length > 0;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      setExpandedSections((prev) => new Set([...prev, section.id]));
                      document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                      hasContent ? 'bg-green-50 text-green-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    {hasContent ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : section.required ? (
                      <AlertCircle size={14} className="text-orange-400" />
                    ) : (
                      <FileText size={14} className="text-gray-400" />
                    )}
                    <span className="truncate">{section.title}</span>
                    {section.required && !hasContent && (
                      <span className="text-xs text-orange-500">*</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Main Content - Editor */}
        <div className="lg:col-span-3 space-y-4">
          {/* Title */}
          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Case Study Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a compelling title for this case study"
              disabled={caseStudy.status === 'PUBLISHED'}
            />
          </Card>

          {/* Template Sections */}
          {template.sections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const hasContent = sectionContent[section.id]?.trim().length > 0;

            return (
              <Card key={section.id} id={`section-${section.id}`}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {hasContent ? (
                      <CheckCircle size={20} className="text-green-500" />
                    ) : (
                      <FileText size={20} className="text-gray-400" />
                    )}
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">
                        {section.title}
                        {section.required && <span className="text-red-500 ml-1">*</span>}
                      </h3>
                      <p className="text-sm text-gray-500">{section.description}</p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-4">
                    <Textarea
                      value={sectionContent[section.id] || ''}
                      onChange={(e) => updateSectionContent(section.id, e.target.value)}
                      placeholder={section.placeholder}
                      rows={6}
                      disabled={caseStudy.status === 'PUBLISHED'}
                      className="w-full"
                    />
                    {section.required && !hasContent && (
                      <p className="mt-2 text-sm text-orange-500 flex items-center gap-1">
                        <AlertCircle size={14} />
                        This section is required
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Action Buttons */}
          {caseStudy.status !== 'PUBLISHED' && (
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => handleSave()} isLoading={isSaving}>
                <Save size={16} className="mr-2" />
                Save Draft
              </Button>
              <Button 
                onClick={() => handleSave('COMPLETED')} 
                isLoading={isSaving}
                disabled={completion < 100}
              >
                <CheckCircle size={16} className="mr-2" />
                Mark Complete
              </Button>
              {completion === 100 && (
                <Button 
                  onClick={() => handleSave('PUBLISHED')} 
                  isLoading={isSaving}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Eye size={16} className="mr-2" />
                  Publish
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
