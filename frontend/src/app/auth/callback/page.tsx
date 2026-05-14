'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import Image from 'next/image';

export default function AuthCallbackPage() {
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
        missing_params:  'Authentication failed: missing parameters.',
        invalid_state:   'Authentication failed: invalid or expired session.',
        access_denied:   'Access was denied. Please try again.',
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
      role: role as 'ADMIN' | 'MANAGER' | 'VIEWER',
    });

    router.replace('/');
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-blue-100 p-8 max-w-sm w-full text-center"
          style={{ boxShadow: '0 20px 60px rgba(37,99,235,0.10)' }}>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Sign-in Failed</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 4px 14px rgba(37,99,235,0.30)' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
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
