import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null): string {
  if (!date) return 'N/A';
  // Dates from the API are date-only values serialized as UTC-midnight ISO
  // strings (e.g. "2026-08-13T00:00:00.000Z"). Reading them back with local
  // Date getters/toLocaleDateString shifts the calendar day for any timezone
  // behind UTC (PST/EST), showing "yesterday" instead of the selected date.
  // Pull the Y/M/D straight off the string (or the UTC parts of a Date) and
  // rebuild a local Date from those exact numbers so no timezone shift occurs.
  let year: number, month: number, day: number;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return 'N/A';
    year = Number(match[1]);
    month = Number(match[2]) - 1;
    day = Number(match[3]);
  } else {
    year = date.getUTCFullYear();
    month = date.getUTCMonth();
    day = date.getUTCDate();
  }
  return new Date(year, month, day).toLocaleDateString('en-US', {
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
