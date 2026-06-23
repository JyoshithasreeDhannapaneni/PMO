import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDelayColor(delayStatus: string): string {
  switch (delayStatus) {
    case 'DELAYED':
      return 'text-red-600 bg-red-50';
    case 'AT_RISK':
      return 'text-yellow-600 bg-yellow-50';
    case 'NOT_DELAYED':
      return 'text-green-600 bg-green-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'text-blue-600 bg-blue-50';
    case 'COMPLETED':
      return 'text-green-600 bg-green-50';
    case 'ON_HOLD':
      return 'text-yellow-600 bg-yellow-50';
    case 'CANCELLED':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getPhaseColor(phase: string): string {
  switch (phase) {
    case 'KICKOFF':           return 'text-purple-600 bg-purple-50';
    case 'CLOUD_ADDING':      return 'text-blue-600 bg-blue-50';
    case 'PILOT_MIGRATION':   return 'text-amber-600 bg-amber-50';
    case 'ONETIME_MIGRATION': return 'text-emerald-600 bg-emerald-50';
    case 'DELTA':             return 'text-red-600 bg-red-50';
    case 'FINAL_VALIDATION':  return 'text-indigo-600 bg-indigo-50';
    case 'COMPLETED':         return 'text-green-600 bg-green-50';
    default:                  return 'text-gray-600 bg-gray-50';
  }
}

export function getPlanColor(plan: string): string {
  switch (plan) {
    case 'PLATINUM':
      return 'text-purple-600 bg-purple-50';
    case 'GOLD':
      return 'text-yellow-600 bg-yellow-50';
    case 'SILVER':
      return 'text-gray-600 bg-gray-50';
    case 'BRONZE':
      return 'text-orange-600 bg-orange-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}
