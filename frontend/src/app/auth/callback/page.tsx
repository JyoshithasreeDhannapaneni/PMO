'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import Image from 'next/image';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuthData } = useAuth();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = searchParams.get('token');
    const name  = searchParams.get('name');
    const email = searchParams.get('email');
    const role  = searchParams.get('role');
    const id    = searchParams.get('id');
    const err   = searchParams.get('error');
    if (err) {
      const messages: Record<string, string> = {
        missing_params: 'Authentication failed: missing parameters.',
        invalid_state: 'Authentication failed: invalid or expired session.',
        access_denied: 'Access was denied. Please try again.',
      };
      setError(messages[err] || 'Microsoft sign-in failed. Please try again.');
      return;
    }
    if (!token || !name || !email || !role || !id) {
      setError('Authentication failed: incomplete data received.');
      return;
    }
    setAuthData(token, {
      id,
      name: decodeURIComponent(name),
      email: decodeURIComponent(email),
      role: role as 'ADMIN' | 'PROJECT_MANAGER' | 'VIEWER',
    });
    // Fetch settings from API after Microsoft SSO login
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${API_URL}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data && Object.keys(json.data).length > 0) {
          localStorage.setItem('pmo-settings', JSON.stringify(json.data));
        }
      })
      .catch(() => {})
      .finally(() => router.replace('/'));
  }, [searchParams]);
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <AlertCircle size={24} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Sign-in Failed</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button onClick={() => router.push('/login')} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600">
            Back to Login
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Image src="/cloudfuze-logo.png" alt="CloudFuze" width={120} height={52} style={{ height: 'auto' }} className="object-contain" />
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={18} className="animate-spin text-blue-500" />
          Completing sign-in…
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 size={18} className="animate-spin text-blue-500" /></div>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
