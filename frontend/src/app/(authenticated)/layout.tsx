'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ToastProvider } from '@/context/ToastContext';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors">
              {children}
            </main>
          </div>
        </div>
      </ToastProvider>
    </ProtectedRoute>
  );
}
