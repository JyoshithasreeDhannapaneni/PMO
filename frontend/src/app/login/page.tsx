'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { Shield, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Login session expired. Please try signing in again.',
  missing_params: 'Incomplete response from Microsoft. Please try again.',
  access_denied: 'Access was denied. Please try again or contact your administrator.',
};

function LoginContent() {
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const searchParams = useSearchParams();
  const rawError = searchParams.get('error');
  const errorMessage = rawError
    ? (ERROR_MESSAGES[rawError] ?? `Sign-in failed: ${rawError}`)
    : null;

  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [7, -7]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-7, 7]), { stiffness: 150, damping: 20 });

  useEffect(() => {
    setMounted(true);
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_URL}/api/auth/microsoft`;
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center bg-gray-50 px-4"
      style={{ perspective: 1400 }}
    >

      {/* Card — tilts toward the cursor in 3D; the logo sits on its own
          translateZ layer so it visibly lifts off the card surface as it tilts */}
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: 'preserve-3d',
        }}
        className={`relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top accent bar — exact brand blue fading to a lighter tint */}
        <div className="h-1 w-full rounded-t-2xl" style={{ background: 'linear-gradient(to right, #0028b0, #3b5bd9, #7c93e8)' }} />

        <div className="px-8 py-10">

          {/* Logo + heading */}
          <div className="flex flex-col items-center mb-10">
            <motion.div style={{ transform: 'translateZ(40px)' }}>
              <Image
                src="/cloudfuze-logo.png"
                alt="CloudFuze"
                width={130}
                height={56}
                style={{ height: 'auto' }}
                className="object-contain mb-5 drop-shadow-md"
                priority
              />
            </motion.div>
            <h1 className="text-xl font-bold text-slate-800">Welcome Back</h1>
            <p className="text-sm text-slate-400 mt-1">Sign in to your Neutara PMO Tracker account</p>
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
            className="w-full py-3 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2.5 bg-white border border-slate-200 hover:border-[#0028b0]/30 hover:bg-[#0028b0]/5 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 21 21">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={11} />
            Protected by enterprise-grade security
          </p>
        </div>
      </motion.div>
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
