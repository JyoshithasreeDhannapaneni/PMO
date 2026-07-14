'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ToastProvider } from '@/context/ToastContext';
import { ChatWidget } from '@/components/chat/ChatWidget';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <div className="flex h-screen bg-slate-100 overflow-hidden">
          {/* Ambient background orbs */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />
            <div className="grid-lines absolute inset-0 opacity-40" />
          </div>

          <Sidebar />

          <div className="flex-1 flex flex-col overflow-hidden relative z-10">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              <div className="animate-fadeInUp">
                {children}
              </div>
            </main>
          </div>

          <ChatWidget />
        </div>
      </ToastProvider>
    </ProtectedRoute>
  );
}
