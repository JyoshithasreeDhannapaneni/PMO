'use client';

import { useRef } from 'react';
import type { DashboardStats } from '@/types';
import {
  FolderKanban, PlayCircle, CheckCircle, PauseCircle,
  AlertTriangle, AlertCircle, FileText, Clock
} from 'lucide-react';

interface StatsCardsProps { stats: DashboardStats; }

const CARDS = [
  { key: 'totalProjects',       title: 'Total Projects',       icon: FolderKanban, gradient: 'from-blue-500 to-blue-700',      glow: 'rgba(37,99,235,0.30)',   delay: 'delay-100' },
  { key: 'activeProjects',      title: 'Active Projects',      icon: PlayCircle,   gradient: 'from-emerald-500 to-teal-500',   glow: 'rgba(16,185,129,0.30)',  delay: 'delay-150' },
  { key: 'completedProjects',   title: 'Completed',            icon: CheckCircle,  gradient: 'from-cyan-500 to-blue-400',      glow: 'rgba(6,182,212,0.30)',   delay: 'delay-200' },
  { key: 'onHoldProjects',      title: 'On Hold',              icon: PauseCircle,  gradient: 'from-amber-500 to-orange-400',   glow: 'rgba(245,158,11,0.30)',  delay: 'delay-300' },
  { key: 'delayedProjects',     title: 'Delayed',              icon: AlertCircle,  gradient: 'from-red-500 to-rose-500',       glow: 'rgba(239,68,68,0.30)',   delay: 'delay-400' },
  { key: 'atRiskProjects',      title: 'At Risk',              icon: AlertTriangle,gradient: 'from-orange-500 to-amber-400',   glow: 'rgba(249,115,22,0.30)',  delay: 'delay-500' },
  { key: 'pendingCaseStudies',  title: 'Pending Case Studies', icon: FileText,     gradient: 'from-violet-500 to-purple-500',  glow: 'rgba(139,92,246,0.30)',  delay: 'delay-600' },
  { key: 'avgDelayDays',        title: 'Avg Delay (days)',     icon: Clock,        gradient: 'from-slate-400 to-slate-500',    glow: 'rgba(100,116,139,0.30)', delay: 'delay-700' },
] as const;

function StatCard({ title, value, icon: Icon, gradient, glow, delay }: {
  title: string; value: number; icon: React.ElementType;
  gradient: string; glow: string; delay: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    card.style.transform = `perspective(600px) rotateY(${dx * 8}deg) rotateX(${-dy * 8}deg) translateZ(12px)`;
  };
  const handleMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = 'perspective(600px) rotateY(0) rotateX(0) translateZ(0)';
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`animate-fadeInUp ${delay} card-3d shimmer-border p-4 sm:p-5 cursor-default`}
      style={{ transition: 'transform 0.12s ease-out, box-shadow 0.25s ease' }}
    >
      {/* Top shine */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p
            className="text-3xl font-bold text-slate-800 mt-2 tabular-nums"
            style={{ textShadow: `0 0 20px ${glow}` }}
          >
            {value ?? 0}
          </p>
        </div>

        {/* Icon */}
        <div
          className={`relative p-2.5 rounded-xl bg-gradient-to-br ${gradient} flex-shrink-0`}
          style={{ boxShadow: `0 4px 15px ${glow}` }}
        >
          <Icon className="text-white" size={22} />
          {/* Icon glow bloom */}
          <div
            className={`absolute inset-0 rounded-xl bg-gradient-to-br ${gradient} blur-md opacity-50`}
            style={{ zIndex: -1 }}
          />
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className={`mt-4 h-0.5 rounded-full bg-gradient-to-r ${gradient} opacity-50`} />
    </div>
  );
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CARDS.map(({ key, title, icon, gradient, glow, delay }) => (
        <StatCard
          key={key}
          title={title}
          value={(stats as any)[key] ?? 0}
          icon={icon}
          gradient={gradient}
          glow={glow}
          delay={delay}
        />
      ))}
    </div>
  );
}
