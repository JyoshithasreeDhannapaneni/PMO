'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  value: string; // comma-separated selected values — same shape the backend's excludeStatus filter already uses
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
}

export function MultiSelectDropdown({ label, value, options, onChange, placeholder, searchable }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = value ? value.split(',').filter(Boolean) : [];

  // The panel is portaled to document.body (see render below) so it isn't
  // clipped by the page's overflow-hidden ancestor — position is computed
  // from the trigger's real screen coordinates instead of CSS `absolute`.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleReposition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open]);

  const toggle = (optValue: string) => {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next.join(','));
  };

  const filteredOptions = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const summary = selected.length === 0
    ? (placeholder || `All ${label}`)
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label || selected[0]
      : `${selected.length} selected`;

  return (
    <div className="relative">
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 pr-2 text-sm font-medium rounded-lg border bg-white text-gray-900 hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all ${
          selected.length > 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-200'
        }`}
      >
        <span className="truncate">{summary}</span>
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
        >
          {searchable && (
            <div className="relative p-2 border-b border-gray-100">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-primary-400"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5">
              <button
                type="button"
                onClick={() => onChange('')}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
