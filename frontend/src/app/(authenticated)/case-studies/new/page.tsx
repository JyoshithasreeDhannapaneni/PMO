'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { useCaseStudyTemplate } from '@/hooks/useCaseStudyTemplate';

interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  accountManager: string;
  sourcePlatform: string;
  targetPlatform: string;
  status: string;
}

interface SectionContent {
  [sectionId: string]: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function NewCaseStudyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get('projectId');

  // Same source of truth as the editor/preview pages — keeps generated and
  // manually-created case studies using identical section ids.
  const { sections: templateSections } = useCaseStudyTemplate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectIdParam || '');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [title, setTitle] = useState('');
  const [sectionContent, setSectionContent] = useState<SectionContent>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (templateSections.length > 0) {
      setExpandedSections((prev) => (prev.size > 0 ? prev : new Set([templateSections[0].id])));
    }
  }, [templateSections]);

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      const project = projects.find((p) => p.id === selectedProjectId);
      setSelectedProject(project || null);
      if (project) {
        setTitle(`${project.customerName} - ${project.name} Case Study`);
      }
    }
  }, [selectedProjectId, projects]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/projects?status=COMPLETED`);
      const data = await response.json();
      
      if (data.success) {
        // Filter out projects that already have case studies
        const projectsWithoutCS = (data.data || []).filter(
          (p: any) => !p.caseStudy
        );
        setProjects(projectsWithoutCS);
        
        // If projectId was passed and exists, select it
        if (projectIdParam) {
          const project = projectsWithoutCS.find((p: Project) => p.id === projectIdParam);
          if (project) {
            setSelectedProject(project);
            setTitle(`${project.customerName} - ${project.name} Case Study`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
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
    const requiredSections = templateSections.filter((s) => s.required);
    if (requiredSections.length === 0) return 0;
    const completedRequired = requiredSections.filter(
      (s) => sectionContent[s.id] && sectionContent[s.id].trim().length > 0
    );
    return Math.round((completedRequired.length / requiredSections.length) * 100);
  };

  const handleGenerateContent = async () => {
    if (!selectedProjectId) {
      setMessage({ type: 'error', text: 'Please select a project first' });
      return;
    }

    try {
      setIsGenerating(true);
      const response = await fetch(`${API_URL}/api/case-studies/generate/${selectedProjectId}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success && data.data?.generatedContent) {
        // Map generated content onto the same semantic section ids the
        // editor/preview pages use, so this never renders under the wrong section.
        const generated = data.data.generatedContent;
        const newContent: SectionContent = {};
        if (generated.executiveSummary) newContent['executive_summary'] = generated.executiveSummary;
        if (generated.clientBackground) newContent['client_background'] = generated.clientBackground;
        if (generated.challenge) newContent['challenge'] = generated.challenge;
        if (generated.solution) newContent['solution'] = generated.solution;
        if (generated.implementation) newContent['implementation_process'] = generated.implementation;
        if (generated.results) newContent['results_benefits'] = generated.results;
        if (generated.lessonsLearned) newContent['lessons_learned'] = generated.lessonsLearned;

        setSectionContent(newContent);
        setExpandedSections(new Set(Object.keys(newContent)));
        setMessage({ type: 'success', text: 'Content generated! Review and edit as needed.' });
      } else if (selectedProject) {
        const placeholderContent: SectionContent = {
          executive_summary: `This case study documents the successful ${selectedProject.sourcePlatform || 'legacy system'} to ${selectedProject.targetPlatform || 'modern platform'} migration for ${selectedProject.customerName}.`,
          client_background: `${selectedProject.customerName} is an organization that required modernization of their IT infrastructure.`,
          challenge: `The client faced challenges with their existing ${selectedProject.sourcePlatform || 'system'} including...`,
          solution: `Our team implemented a comprehensive migration strategy to ${selectedProject.targetPlatform || 'the new platform'}...`,
        };
        setSectionContent(placeholderContent);
        setExpandedSections(new Set(Object.keys(placeholderContent)));
        setMessage({ type: 'success', text: 'Template content generated. Please customize for your project.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to generate content. Please fill in manually.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedProjectId) {
      setMessage({ type: 'error', text: 'Please select a project' });
      return;
    }

    try {
      setIsSaving(true);
      
      const content = JSON.stringify(sectionContent);
      
      const response = await fetch(`${API_URL}/api/case-studies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title,
          content,
          status: 'IN_PROGRESS',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Case study created successfully' });
        // Redirect to the editor
        setTimeout(() => {
          router.push(`/case-studies/${data.data.id}`);
        }, 1000);
      } else {
        setMessage({ type: 'error', text: data.error?.message || 'Failed to create case study' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create case study' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
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
            <h1 className="text-2xl font-bold text-gray-900">Create Case Study</h1>
            <p className="text-gray-500">Document a successful project migration</p>
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
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Project Selection */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Select Project</h3>
            {projects.length === 0 ? (
              <p className="text-sm text-gray-500">
                No completed projects available for case studies.
              </p>
            ) : (
              <Select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                options={[
                  { value: '', label: 'Select a project...' },
                  ...projects.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.customerName})`,
                  })),
                ]}
              />
            )}
            
            {selectedProject && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <p><strong>Customer:</strong> {selectedProject.customerName}</p>
                <p><strong>PM:</strong> {selectedProject.projectManager}</p>
                <p><strong>Source:</strong> {selectedProject.sourcePlatform || 'N/A'}</p>
                <p><strong>Target:</strong> {selectedProject.targetPlatform || 'N/A'}</p>
              </div>
            )}
          </Card>

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
          </Card>

          {/* Quick Actions */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleGenerateContent}
              isLoading={isGenerating}
              disabled={!selectedProjectId}
            >
              <Sparkles size={16} className="mr-2" />
              Generate Content
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Auto-generate initial content based on project details
            </p>
          </Card>

          {/* Section Navigation */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Sections</h3>
            <div className="space-y-1">
              {templateSections.map((section) => {
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
            />
          </Card>

          {/* Template Sections */}
          {templateSections.map((section) => {
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
          <div className="flex justify-end gap-3 pt-4">
            <Link href="/case-studies">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button 
              onClick={handleCreate} 
              isLoading={isSaving}
              disabled={!selectedProjectId || !title}
            >
              <Save size={16} className="mr-2" />
              Create Case Study
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
