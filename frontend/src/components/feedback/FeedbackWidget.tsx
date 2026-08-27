'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedbackItems, useCreateFeedbackItem, useUpdateFeedbackStatus } from '@/hooks/useProjects';
import { MessageSquare, X, Send, Clock, CheckCircle, AlertCircle, Camera } from 'lucide-react';

type FeedbackType = 'ISSUE' | 'SUGGESTION';
type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
type FeedbackImage = { url: string; name: string };

const TYPE_BADGE: Record<FeedbackType, string> = {
  ISSUE: 'bg-red-100 text-red-700',
  SUGGESTION: 'bg-blue-100 text-blue-700',
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; badge: string; icon: any }> = {
  OPEN: { label: 'Open', badge: 'bg-gray-100 text-gray-600', icon: AlertCircle },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-amber-100 text-amber-700', icon: Clock },
  DONE: { label: 'Done', badge: 'bg-green-100 text-green-700', icon: CheckCircle },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const MAX_IMAGES = 3;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FeedbackWidget() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('ISSUE');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Always enabled (not gated to `open`) so the unread-open-count badge on the closed
  // floating button is accurate without requiring the panel to be opened first — this is
  // a light JSON poll, not an expensive Graph sync, so running it globally is cheap.
  const { data, isLoading } = useFeedbackItems();
  const items: Array<{
    id: string; type: FeedbackType; message: string; status: FeedbackStatus; images: FeedbackImage[];
    createdById: string | null; createdByName: string | null; createdAt: string;
  }> = data?.data ?? [];

  const createMutation = useCreateFeedbackItem();
  const updateStatusMutation = useUpdateFeedbackStatus();

  const openCount = items.filter(i => i.status === 'OPEN').length;

  useEffect(() => {
    if (open) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, items.length]);

  // Preview URLs for attached-but-not-yet-sent images — revoked on cleanup/change so we
  // don't leak object URLs as attachments get added/removed/sent.
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = attachments.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [attachments]);

  function handlePickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setAttachments((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
    e.target.value = ''; // allow picking the same file again later
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate({ type, message: trimmed, images: attachments }, {
      onSuccess: () => { setMessage(''); setAttachments([]); },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2.5">
      {open && (
        <div
          className="flex flex-col bg-white rounded-xl shadow-xl border border-gray-200/80 overflow-hidden"
          style={{ width: '340px', height: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0 bg-gradient-to-r from-amber-500 to-orange-600">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <MessageSquare size={14} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-none">Suggestions &amp; Issues</p>
                <p className="text-[10px] text-white/70 mt-0.5 leading-none">Visible to everyone</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X size={13} className="text-white" />
            </button>
          </div>

          {/* Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/60">
            {isLoading ? (
              <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
                <MessageSquare size={24} className="text-gray-300" />
                <p className="text-xs font-medium text-gray-500">No suggestions or issues yet</p>
                <p className="text-[10px] text-gray-400">Be the first to raise one below</p>
              </div>
            ) : (
              items.map((item) => {
                const isOwn = item.createdById === user?.id;
                const status = STATUS_CONFIG[item.status];
                const StatusIcon = status.icon;
                return (
                  <div key={item.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-xl px-2.5 py-2 text-[11px] leading-relaxed border ${isOwn ? 'bg-orange-50 border-orange-100 rounded-br-sm' : 'bg-white border-gray-200 rounded-bl-sm shadow-sm'}`}>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${TYPE_BADGE[item.type]}`}>
                          {item.type === 'ISSUE' ? 'Issue' : 'Suggestion'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-0.5 ${status.badge}`}>
                          <StatusIcon size={9} /> {status.label}
                        </span>
                      </div>
                      <p className="text-gray-800 whitespace-pre-wrap break-words">{item.message}</p>
                      {item.images?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.images.map((img, i) => (
                            <a key={i} href={`${API_URL}${img.url}`} target="_blank" rel="noopener noreferrer">
                              <img
                                src={`${API_URL}${img.url}`}
                                alt={img.name}
                                className="w-14 h-14 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[9px] text-gray-400 truncate">
                          {isOwn ? 'You' : item.createdByName || 'Someone'} · {timeAgo(item.createdAt)}
                        </span>
                        {isAdmin && (
                          <select
                            value={item.status}
                            onChange={(e) => updateStatusMutation.mutate({ id: item.id, status: e.target.value as FeedbackStatus })}
                            disabled={updateStatusMutation.isPending}
                            className="text-[9px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 disabled:opacity-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="OPEN">Open</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="DONE">Done</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="px-2.5 py-2 border-t border-gray-100 bg-white shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {(['ISSUE', 'SUGGESTION'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                      type === t ? TYPE_BADGE[t] : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {t === 'ISSUE' ? 'Issue' : 'Suggestion'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_IMAGES}
                title={attachments.length >= MAX_IMAGES ? `Up to ${MAX_IMAGES} images` : 'Attach a screenshot'}
                className="text-gray-400 hover:text-orange-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Camera size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePickImages}
                className="hidden"
              />
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {previewUrls.map((url, idx) => (
                  <div key={idx} className="relative w-10 h-10 shrink-0">
                    <img src={url} alt={attachments[idx]?.name} className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-1.5">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={type === 'ISSUE' ? "Describe the issue you're facing…" : 'Share your suggestion…'}
                rows={1}
                disabled={createMutation.isPending}
                className="flex-1 resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:opacity-50"
                style={{ maxHeight: '60px', minHeight: '30px' }}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || createMutation.isPending}
                className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-gradient-to-r from-amber-500 to-orange-600 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-85 active:scale-95 transition-all"
              >
                <Send size={13} className="text-white" />
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-[9px] text-red-500">Could not submit — please try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Floating toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Suggestions & Issues' : 'Open Suggestions & Issues'}
        className="relative w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-xl bg-gradient-to-r from-amber-500 to-orange-600"
      >
        {open ? <X size={16} className="text-white" /> : <MessageSquare size={16} className="text-white" />}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {openCount}
          </span>
        )}
      </button>
    </div>
  );
}
