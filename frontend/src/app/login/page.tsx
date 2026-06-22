'use client';

import { useState, useEffect, Suspense } from 'react';
import { Shield, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Login session expired. Please try signing in again.',
  missing_params: 'Incomplete response from Microsoft. Please try again.',
  access_denied: 'Access was denied. Please try again or contact your administrator.',
};

function LoginContent() {
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const rawError = searchParams.get('error');
  const errorMessage = rawError
    ? (ERROR_MESSAGES[rawError] ?? `Sign-in failed: ${rawError}`)
    : null;

  useEffect(() => { setMounted(true); }, []);

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_URL}/api/auth/microsoft`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">

      {/* Subtle dot grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(37,99,235,0.07) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl border border-blue-100 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{ boxShadow: '0 20px 60px rgba(37,99,235,0.10), 0 0 0 1px rgba(37,99,235,0.06)' }}
      >
        {/* Top blue accent bar */}
        <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400" />

        <div className="px-8 py-10">

          {/* Logo + heading */}
          <div className="flex flex-col items-center mb-10">
            <Image
              src="/cloudfuze-logo.png"
              alt="CloudFuze"
              width={130}
              height={56}
              style={{ height: 'auto' }}
              className="object-contain mb-5"
              priority
            />
            <h1 className="text-xl font-bold text-slate-800">Welcome Back</h1>
            <p className="text-sm text-slate-400 mt-1">Sign in to your PMO Tracker account</p>
          </div>

          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleMicrosoftLogin}
            className="w-full py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 21 21">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </button>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-8 flex items-center justify-center gap-1.5">
            <Shield size={11} />
            Protected by enterprise-grade security
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
