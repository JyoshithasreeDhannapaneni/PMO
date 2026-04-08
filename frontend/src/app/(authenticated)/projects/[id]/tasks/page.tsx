'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Clock,
  CheckCircle,
  Circle,
  AlertTriangle,
  Play,
  Pause,
  Calendar,
  BarChart3,
  List,
  GanttChart
} from 'lucide-react';

interface ProjectTask {
  id: string;
  name: string;
  orderIndex: number;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'SKIPPED';
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  duration: number;
  progress: number;
  assignee?: string;
  isMilestone: boolean;
  notes?: string;
}

interface ProjectPhase {
  id: string;
  phaseName: string;
  orderIndex: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  progress: number;
  tasks: ProjectTask[];
}

interface Project {
  id: string;
  name: string;
  customerName: string;
  plannedStart: string;
  plannedEnd: string;
}

interface GanttData {
  project: Project;
  phases: ProjectPhase[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusConfig = {
  TODO: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100', label: 'To Do' },
  IN_PROGRESS: { icon: Play, color: 'text-blue-500', bg: 'bg-blue-100', label: 'In Progress' },
  DONE: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Done' },
  BLOCKED: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100', label: 'Blocked' },
  SKIPPED: { icon: Pause, color: 'text-gray-400', bg: 'bg-gray-100', label: 'Skipped' },
  PENDING: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100', label: 'Pending' },
  COMPLETED: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Completed' },
};

export default function ProjectTasksPage() {
  const params = useParams();
  const projectId = params.id as string;
  
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  useEffect(() => {
    fetchGanttData();
  }, [projectId]);

  const fetchGanttData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/tasks/project/${projectId}/gantt`);
      const data = await response.json();
      if (data.success) {
        setGanttData(data.data);
        setExpandedPhases(new Set(data.data.phases.map((p: ProjectPhase) => p.id)));
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      setUpdatingTask(taskId);
      await fetch(`${API_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchGanttData();
    } catch (error) {
      console.error('Failed to update task:', error);
    } finally {
      setUpdatingTask(null);
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getOverallProgress = () => {
    if (!ganttData) return 0;
    const totalTasks = ganttData.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = ganttData.phases.reduce(
      (sum, p) => sum + p.tasks.filter((t) => t.status === 'DONE').length,
      0
    );
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  };

  const calculateGanttPosition = (startDate: string, endDate: string) => {
    if (!ganttData) return { left: 0, width: 0 };
    
    const projectStart = new Date(ganttData.project.plannedStart).getTime();
    const projectEnd = new Date(ganttData.project.plannedEnd).getTime();
    const totalDuration = projectEnd - projectStart;
    
    const taskStart = new Date(startDate).getTime();
    const taskEnd = new Date(endDate).getTime();
    
    const left = ((taskStart - projectStart) / totalDuration) * 100;
    const width = ((taskEnd - taskStart) / totalDuration) * 100;
    
    return { left: Math.max(0, left), width: Math.max(2, Math.min(100 - left, width)) };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!ganttData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No task data available for this project.</p>
        <p className="text-sm text-gray-400 mt-2">
          Tasks are auto-generated when you create a project with a migration type.
        </p>
        <Link href={`/projects/${projectId}`}>
          <Button className="mt-4">Back to Project</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href={`/projects/${projectId}`}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Project
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ganttData.project.name}</h1>
            <p className="text-gray-500">{ganttData.project.customerName} · Task Tracking</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${
                  viewMode === 'list' ? 'bg-white shadow-sm' : ''
                }`}
              >
                <List size={16} />
                List
              </button>
              <button
                onClick={() => setViewMode('gantt')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${
                  viewMode === 'gantt' ? 'bg-white shadow-sm' : ''
                }`}
              >
                <BarChart3 size={16} />
                Gantt
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Overall Progress</h3>
            <p className="text-sm text-gray-500">
              {ganttData.phases.reduce((sum, p) => sum + p.tasks.filter((t) => t.status === 'DONE').length, 0)} of{' '}
              {ganttData.phases.reduce((sum, p) => sum + p.tasks.length, 0)} tasks completed
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-48 bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all"
                style={{ width: `${getOverallProgress()}%` }}
              />
            </div>
            <span className="text-lg font-bold text-gray-900">{getOverallProgress()}%</span>
          </div>
        </div>
        
        {/* Phase Progress Bars */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-2">
          {ganttData.phases.map((phase) => {
            const config = statusConfig[phase.status];
            return (
              <div key={phase.id} className="text-center">
                <div className="text-xs text-gray-500 mb-1 truncate">{phase.phaseName}</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      phase.status === 'COMPLETED' ? 'bg-green-500' : 
                      phase.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                    style={{ width: `${phase.progress}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600 mt-1">{phase.progress}%</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {ganttData.phases
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((phase) => {
              const phaseConfig = statusConfig[phase.status];
              const PhaseIcon = phaseConfig.icon;
              
              return (
                <Card key={phase.id}>
                  {/* Phase Header */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => togglePhase(phase.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedPhases.has(phase.id) ? (
                        <ChevronDown size={20} className="text-gray-500" />
                      ) : (
                        <ChevronRight size={20} className="text-gray-500" />
                      )}
                      <div className={`p-2 rounded-lg ${phaseConfig.bg}`}>
                        <PhaseIcon size={20} className={phaseConfig.color} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{phase.phaseName}</h3>
                        <p className="text-sm text-gray-500">
                          {formatDate(phase.plannedStart)} - {formatDate(phase.plannedEnd)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">{phase.progress}%</div>
                        <div className="text-xs text-gray-500">
                          {phase.tasks.filter((t) => t.status === 'DONE').length}/{phase.tasks.length} tasks
                        </div>
                      </div>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            phase.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${phase.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tasks */}
                  {expandedPhases.has(phase.id) && (
                    <div className="mt-4 space-y-2">
                      {phase.tasks
                        .sort((a, b) => a.orderIndex - b.orderIndex)
                        .map((task) => {
                          const taskConfig = statusConfig[task.status];
                          const TaskIcon = taskConfig.icon;
                          
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                task.isMilestone ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <TaskIcon size={18} className={taskConfig.color} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${task.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                      {task.name}
                                    </span>
                                    {task.isMilestone && (
                                      <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                                        Milestone
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 flex items-center gap-2">
                                    <Calendar size={12} />
                                    {formatDate(task.plannedStart)} - {formatDate(task.plannedEnd)}
                                    <span>·</span>
                                    <Clock size={12} />
                                    {task.duration} days
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {/* Status Dropdown */}
                                <select
                                  value={task.status}
                                  onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                  disabled={updatingTask === task.id}
                                  className={`text-sm border rounded-lg px-2 py-1 ${taskConfig.bg} ${taskConfig.color}`}
                                >
                                  <option value="TODO">To Do</option>
                                  <option value="IN_PROGRESS">In Progress</option>
                                  <option value="DONE">Done</option>
                                  <option value="BLOCKED">Blocked</option>
                                  <option value="SKIPPED">Skipped</option>
                                </select>
                                {updatingTask === task.id && (
                                  <Loader2 size={16} className="animate-spin text-gray-400" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
      )}

      {/* Gantt View */}
      {viewMode === 'gantt' && (
        <Card>
          <div className="overflow-x-auto">
            {/* Timeline Header */}
            <div className="flex border-b border-gray-200 pb-2 mb-4">
              <div className="w-64 flex-shrink-0 font-semibold text-gray-700">Task</div>
              <div className="flex-1 relative">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatDate(ganttData.project.plannedStart)}</span>
                  <span>{formatDate(ganttData.project.plannedEnd)}</span>
                </div>
              </div>
            </div>

            {/* Phases and Tasks */}
            {ganttData.phases
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((phase) => (
                <div key={phase.id} className="mb-4">
                  {/* Phase Row */}
                  <div className="flex items-center py-2 bg-gray-100 rounded-lg mb-2">
                    <div className="w-64 flex-shrink-0 px-3 font-semibold text-gray-900">
                      {phase.phaseName}
                    </div>
                    <div className="flex-1 relative h-6 mx-2">
                      {(() => {
                        const pos = calculateGanttPosition(phase.plannedStart, phase.plannedEnd);
                        return (
                          <div
                            className="absolute h-full bg-blue-200 rounded"
                            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          >
                            <div
                              className="h-full bg-blue-500 rounded"
                              style={{ width: `${phase.progress}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Task Rows */}
                  {phase.tasks
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((task) => {
                      const pos = calculateGanttPosition(task.plannedStart, task.plannedEnd);
                      const taskConfig = statusConfig[task.status];
                      
                      return (
                        <div key={task.id} className="flex items-center py-1.5">
                          <div className="w-64 flex-shrink-0 px-3 pl-8 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              task.status === 'DONE' ? 'bg-green-500' :
                              task.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                              task.status === 'BLOCKED' ? 'bg-red-500' : 'bg-gray-300'
                            }`} />
                            <span className={`text-sm truncate ${task.status === 'DONE' ? 'line-through text-gray-400' : ''}`}>
                              {task.name}
                            </span>
                            {task.isMilestone && (
                              <span className="text-yellow-500">◆</span>
                            )}
                          </div>
                          <div className="flex-1 relative h-5 mx-2">
                            <div
                              className={`absolute h-full rounded ${
                                task.status === 'DONE' ? 'bg-green-400' :
                                task.status === 'IN_PROGRESS' ? 'bg-blue-400' :
                                task.status === 'BLOCKED' ? 'bg-red-400' : 'bg-gray-300'
                              }`}
                              style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                              title={`${task.name}: ${formatDate(task.plannedStart)} - ${formatDate(task.plannedEnd)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
