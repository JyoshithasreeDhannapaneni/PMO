'use client';

import { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useProjects } from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import { Shuffle, FolderKanban, Activity, CheckCircle, Clock, AlertTriangle, Settings } from 'lucide-react';
import Link from 'next/link';

export default function MigrationTypesPage() {
  const { settings } = useSettings();
  const { data: projectsData } = useProjects({ limit: 500 });
  const projects: any[] = projectsData?.data || [];
  const [selected, setSelected] = useState<string | null>(null);

  const migrationTypes = settings.migrationTypes.filter((t) => t.enabled);

  const getProjectsForType = (type: any) => {
    return projects.filter((p) => {
      const mt = (p.migrationTypes || '').toUpperCase();
      return mt.includes(type.code.toUpperCase()) || mt.includes(type.name.toUpperCase());
    });
  };

  const selectedType = selected ? migrationTypes.find((t) => t.id === selected) : null;
  const selectedProjects = selectedType ? getProjectsForType(selectedType) : [];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shuffle size={22} className="text-primary-600" /> Migration Types
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Overview of all configured migration types and their projects
          </p>
        </div>
        <Link
          href="/settings?tab=migration"
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Settings size={14} /> Manage Types
        </Link>
      </div>

      {migrationTypes.length === 0 ? (
        <Card className="text-center py-16">
          <Shuffle size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No migration types configured yet.</p>
          <Link href="/settings?tab=migration" className="mt-3 inline-block text-primary-600 hover:underline text-sm">
            Configure migration types →
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {migrationTypes.map((type) => {
            const typeProjects = getProjectsForType(type);
            const active = typeProjects.filter((p) => p.status === 'ACTIVE').length;
            const completed = typeProjects.filter((p) => p.status === 'COMPLETED').length;
            const overaged = typeProjects.filter((p) => p.status === 'ACTIVE' && new Date(p.plannedEnd) < new Date()).length;
            const delayed = typeProjects.filter((p) => p.delayStatus === 'DELAYED').length;
            const isSelected = selected === type.id;

            return (
              <button
                key={type.id}
                onClick={() => setSelected(isSelected ? null : type.id)}
                className={`text-left w-full rounded-xl border-2 p-5 transition-all hover:shadow-md ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{type.icon}</span>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">{type.name} Migration</h3>
                    <p className="text-xs text-gray-400">{typeProjects.length} projects total</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Activity size={12} className="text-green-500" />
                    <span className="text-gray-600 dark:text-gray-300">{active} Active</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <CheckCircle size={12} className="text-blue-500" />
                    <span className="text-gray-600 dark:text-gray-300">{completed} Done</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock size={12} className="text-orange-500" />
                    <span className="text-gray-600 dark:text-gray-300">{overaged} Overaged</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <AlertTriangle size={12} className="text-red-500" />
                    <span className="text-gray-600 dark:text-gray-300">{delayed} Delayed</span>
                  </div>
                </div>
                <div className="mt-3 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: typeProjects.length > 0 ? `${Math.round((completed / typeProjects.length) * 100)}%` : '0%' }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {typeProjects.length > 0 ? Math.round((completed / typeProjects.length) * 100) : 0}% completion rate
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Projects for selected migration type */}
      {selectedType && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{selectedType.icon}</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {selectedType.name} Migration — Projects ({selectedProjects.length})
            </h2>
          </div>
          {selectedProjects.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FolderKanban size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No projects found for this migration type</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {['Project Name', 'Customer', 'Manager', 'Status', 'Phase', 'SOW End', 'Delay'].map((h) => (
                      <th
                        key={h}
                        className={`py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase ${h === 'Project Name' ? 'text-left' : 'text-center'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedProjects.map((p: any) => (
                    <tr
                      key={p.id}
                      className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                      onClick={() => (window.location.href = `/projects/${p.id}`)}
                    >
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{p.name}</td>
                      <td className="text-center py-2.5 px-3 text-gray-500 text-xs">{p.customerName}</td>
                      <td className="text-center py-2.5 px-3 text-gray-500 text-xs">{p.projectManager}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                          p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                          p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{p.status}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-xs text-gray-500">{p.phase}</td>
                      <td className="text-center py-2.5 px-3 text-xs text-gray-500">
                        {p.plannedEnd ? new Date(p.plannedEnd).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-center py-2.5 px-3">
                        {p.delayDays > 0
                          ? <span className="text-xs font-semibold text-red-600">+{p.delayDays}d</span>
                          : <span className="text-xs text-green-600">On Track</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
