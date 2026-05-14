'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await login(data.username, data.password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

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

        <div className="px-8 py-8">

          {/* Logo + heading */}
          <div className="flex flex-col items-center mb-8">
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  {...register('username')}
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username"
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-slate-800 bg-slate-50 border outline-none transition-all
                    placeholder:text-slate-400
                    ${errors.username
                      ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                      : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white'
                    }`}
                />
              </div>
              {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className={`w-full pl-9 pr-10 py-2.5 rounded-xl text-sm text-slate-800 bg-slate-50 border outline-none transition-all
                    placeholder:text-slate-400
                    ${errors.password
                      ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                      : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {/* Remember / Forgot */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20" />
                <span className="text-xs text-slate-500">Remember me</span>
              </label>
              <a href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Forgot password?
              </a>
            </div>

            {/* Sign In */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 4px 14px rgba(37,99,235,0.30)' }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Shield size={15} />
                  Sign In Securely
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-400">OR</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* Microsoft */}
            <button
              type="button"
              onClick={handleMicrosoftLogin}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex items-center justify-center gap-2.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 21 21">
                <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
                <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
                <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={11} />
            Protected by enterprise-grade security
          </p>
        </div>
      </div>
    </div>
  );
}
