'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  GripVertical, 
  ChevronDown, 
  ChevronRight,
  Save,
  Loader2,
  Clock,
  CheckCircle,
  FolderOpen,
  Mail,
  MessageSquare
} from 'lucide-react';
import Link from 'next/link';

interface TemplateTask {
  id: string;
  name: string;
  orderIndex: number;
  defaultDuration: number;
  description?: string;
  isMilestone: boolean;
}

interface TemplatePhase {
  id: string;
  name: string;
  orderIndex: number;
  defaultDuration: number;
  description?: string;
  tasks: TemplateTask[];
}

interface MigrationTemplate {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  phases: TemplatePhase[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const templateIcons: Record<string, React.ReactNode> = {
  CONTENT: <FolderOpen className="text-blue-600" size={24} />,
  EMAIL: <Mail className="text-green-600" size={24} />,
  MESSAGING: <MessageSquare className="text-purple-600" size={24} />,
};

const templateColors: Record<string, string> = {
  CONTENT: 'border-blue-200 bg-blue-50',
  EMAIL: 'border-green-200 bg-green-50',
  MESSAGING: 'border-purple-200 bg-purple-50',
};

export default function TemplateEditorPage() {
  const [templates, setTemplates] = useState<MigrationTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MigrationTemplate | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/templates`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
        if (data.data.length > 0 && !selectedTemplate) {
          setSelectedTemplate(data.data[0]);
          setExpandedPhases(new Set(data.data[0].phases.map((p: TemplatePhase) => p.id)));
        }
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setIsLoading(false);
    }
  };

  const seedTemplates = async () => {
    try {
      setIsLoading(true);
      await fetch(`${API_URL}/api/templates/seed`, { method: 'POST' });
      await fetchTemplates();
      setMessage({ type: 'success', text: 'Default templates created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to seed templates' });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const updatePhase = async (phaseId: string, data: Partial<TemplatePhase>) => {
    try {
      const response = await fetch(`${API_URL}/api/templates/phases/${phaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        await fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to update phase:', error);
    }
  };

  const updateTask = async (taskId: string, data: Partial<TemplateTask>) => {
    try {
      const response = await fetch(`${API_URL}/api/templates/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        await fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const addPhase = async (templateId: string) => {
    if (!selectedTemplate) return;
    try {
      const newOrderIndex = selectedTemplate.phases.length;
      const response = await fetch(`${API_URL}/api/templates/${templateId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Phase ${newOrderIndex + 1}: New Phase`,
          orderIndex: newOrderIndex,
          defaultDuration: 7,
        }),
      });
      if (response.ok) {
        await fetchTemplates();
        setMessage({ type: 'success', text: 'Phase added' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add phase' });
    }
  };

  const deletePhase = async (phaseId: string) => {
    if (!confirm('Delete this phase and all its tasks?')) return;
    try {
      await fetch(`${API_URL}/api/templates/phases/${phaseId}`, { method: 'DELETE' });
      await fetchTemplates();
      setMessage({ type: 'success', text: 'Phase deleted' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete phase' });
    }
  };

  const addTask = async (phaseId: string) => {
    const phase = selectedTemplate?.phases.find((p) => p.id === phaseId);
    if (!phase) return;
    try {
      const newOrderIndex = phase.tasks.length;
      const response = await fetch(`${API_URL}/api/templates/phases/${phaseId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Task',
          orderIndex: newOrderIndex,
          defaultDuration: 1,
          isMilestone: false,
        }),
      });
      if (response.ok) {
        await fetchTemplates();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add task' });
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`${API_URL}/api/templates/tasks/${taskId}`, { method: 'DELETE' });
      await fetchTemplates();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete task' });
    }
  };

  const getTotalDuration = (template: MigrationTemplate) => {
    return template.phases.reduce((sum, phase) => sum + phase.defaultDuration, 0);
  };

  const getTotalTasks = (template: MigrationTemplate) => {
    return template.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/settings" 
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Project Templates</h1>
        <p className="text-gray-500">
          Configure phase and task templates for each migration type
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {templates.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No templates found. Create default templates to get started.</p>
            <Button onClick={seedTemplates} isLoading={isLoading}>
              Create Default Templates
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Template List */}
          <div className="lg:col-span-1">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Templates</h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setExpandedPhases(new Set(template.phases.map((p) => p.id)));
                    }}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      selectedTemplate?.id === template.id
                        ? `${templateColors[template.code]} border-2`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {templateIcons[template.code]}
                      <div>
                        <p className="font-medium text-gray-900">{template.name.replace(' Template', '')}</p>
                        <p className="text-xs text-gray-500">
                          {template.phases.length} phases · {getTotalTasks(template)} tasks
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Template Editor */}
          <div className="lg:col-span-3">
            {selectedTemplate && (
              <Card>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    {templateIcons[selectedTemplate.code]}
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedTemplate.name}</h2>
                      <p className="text-sm text-gray-500">{selectedTemplate.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock size={16} />
                      {getTotalDuration(selectedTemplate)} days total
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle size={16} />
                      {getTotalTasks(selectedTemplate)} tasks
                    </span>
                  </div>
                </div>

                {/* Phases */}
                <div className="space-y-4">
                  {selectedTemplate.phases
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((phase) => (
                      <div key={phase.id} className="border border-gray-200 rounded-lg">
                        {/* Phase Header */}
                        <div 
                          className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
                          onClick={() => togglePhase(phase.id)}
                        >
                          <div className="flex items-center gap-3">
                            <GripVertical size={16} className="text-gray-400" />
                            {expandedPhases.has(phase.id) ? (
                              <ChevronDown size={16} className="text-gray-500" />
                            ) : (
                              <ChevronRight size={16} className="text-gray-500" />
                            )}
                            <input
                              type="text"
                              value={phase.name}
                              onChange={(e) => updatePhase(phase.id, { name: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-1"
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Clock size={14} />
                              <input
                                type="number"
                                value={phase.defaultDuration}
                                onChange={(e) => updatePhase(phase.id, { defaultDuration: parseInt(e.target.value) || 1 })}
                                onClick={(e) => e.stopPropagation()}
                                className="w-12 text-center bg-white border border-gray-200 rounded px-1 py-0.5"
                                min="1"
                              />
                              <span>days</span>
                            </div>
                            <span className="text-sm text-gray-500">{phase.tasks.length} tasks</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePhase(phase.id);
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Tasks */}
                        {expandedPhases.has(phase.id) && (
                          <div className="p-4 space-y-2">
                            {phase.tasks
                              .sort((a, b) => a.orderIndex - b.orderIndex)
                              .map((task) => (
                                <div
                                  key={task.id}
                                  className={`flex items-center justify-between p-3 rounded-lg ${
                                    task.isMilestone ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <GripVertical size={14} className="text-gray-400" />
                                    <input
                                      type="text"
                                      value={task.name}
                                      onChange={(e) => updateTask(task.id, { name: e.target.value })}
                                      className="flex-1 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-1"
                                    />
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-1 text-xs text-gray-500">
                                      <input
                                        type="checkbox"
                                        checked={task.isMilestone}
                                        onChange={(e) => updateTask(task.id, { isMilestone: e.target.checked })}
                                        className="rounded"
                                      />
                                      Milestone
                                    </label>
                                    <div className="flex items-center gap-1 text-sm text-gray-500">
                                      <input
                                        type="number"
                                        value={task.defaultDuration}
                                        onChange={(e) => updateTask(task.id, { defaultDuration: parseInt(e.target.value) || 1 })}
                                        className="w-12 text-center bg-white border border-gray-200 rounded px-1 py-0.5"
                                        min="1"
                                      />
                                      <span>days</span>
                                    </div>
                                    <button
                                      onClick={() => deleteTask(task.id)}
                                      className="text-red-500 hover:text-red-700 p-1"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            <button
                              onClick={() => addTask(phase.id)}
                              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 p-2"
                            >
                              <Plus size={14} />
                              Add Task
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                {/* Add Phase Button */}
                <button
                  onClick={() => addPhase(selectedTemplate.id)}
                  className="mt-4 flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                >
                  <Plus size={16} />
                  Add Phase
                </button>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
