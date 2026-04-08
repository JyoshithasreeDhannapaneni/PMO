'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Send, Edit2, Trash2, Reply, MoreVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Comment {
  id: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  replies?: Comment[];
}

interface CommentSectionProps {
  entityType: string;
  entityId: string;
}

export function CommentSection({ entityType, entityId }: CommentSectionProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    fetchComments();
  }, [entityType, entityId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`${API_URL}/api/comments/entity/${entityType}/${entityId}`);
      const json = await res.json();
      if (json.success) {
        setComments(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
    setLoading(false);
  };

  const handleSubmit = async (parentId?: string) => {
    const content = parentId ? newComment : newComment;
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          entityType,
          entityId,
          content: content.trim(),
          parentId,
        }),
      });

      if (res.ok) {
        setNewComment('');
        setReplyingTo(null);
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
    setSubmitting(false);
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (res.ok) {
        setEditingId(null);
        setEditContent('');
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to edit comment:', err);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const isOwner = user?.id === comment.user.id;
    const isAdmin = user?.role === 'ADMIN';
    const canModify = isOwner || isAdmin;

    return (
      <div className={`${isReply ? 'ml-10 mt-3' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 text-sm font-medium">
            {comment.user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">{comment.user.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {comment.isEdited && (
                <span className="text-xs text-gray-400 dark:text-gray-500">(edited)</span>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="mt-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => handleEdit(comment.id)}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditContent(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                {comment.content}
              </p>
            )}

            {!editingId && (
              <div className="flex items-center gap-3 mt-2">
                {!isReply && (
                  <button
                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center gap-1"
                  >
                    <Reply size={12} />
                    Reply
                  </button>
                )}
                {canModify && (
                  <>
                    <button
                      onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center gap-1"
                    >
                      <Edit2 size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Reply Form */}
            {replyingTo === comment.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit(comment.id)}
                />
                <Button size="sm" onClick={() => handleSubmit(comment.id)} disabled={submitting}>
                  <Send size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-3">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        Loading comments...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <MessageSquare size={18} />
        Comments ({comments.length})
      </h3>

      {/* New Comment Form */}
      <div className="flex gap-3">
        <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 text-sm font-medium">
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-gray-100"
            rows={2}
          />
          <div className="flex justify-end mt-2">
            <Button onClick={() => handleSubmit()} disabled={submitting || !newComment.trim()}>
              <Send size={14} className="mr-2" />
              Post Comment
            </Button>
          </div>
        </div>
      </div>

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>No comments yet</p>
          <p className="text-sm">Be the first to comment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
}
