'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/context/ToastContext';
import {
  Mail, Server, Lock, Shield, CheckCircle, XCircle,
  Loader2, Save, Wifi, Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

interface SmtpForm {
  host: string;
  port: string;
  email: string;
  password: string;
  security: 'TLS' | 'SSL' | 'NONE';
}

export default function SmtpSettingsPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState<SmtpForm>({
    host: '',
    port: '587',
    email: '',
    password: '',
    security: 'TLS',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    api.get('/smtp')
      .then((r) => {
        const d = r.data.data;
        setForm({
          host: d.host || '',
          port: String(d.port || 587),
          email: d.email || '',
          password: '',
          security: d.security || 'TLS',
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleChange = (field: keyof SmtpForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!form.host || !form.email) {
      showToast('error', 'SMTP host and email are required');
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/smtp/save', { ...form, port: parseInt(form.port, 10) });
      showToast('success', 'SMTP settings saved!', 'Your email settings have been updated.');
    } catch {
      showToast('error', 'Failed to save SMTP settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.host || !form.email) {
      showToast('warning', 'Enter host and email before testing');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/smtp/test', { ...form, port: parseInt(form.port, 10) });
      const result = { success: r.data.success, message: r.data.message };
      setTestResult(result);
      if (result.success) {
        showToast('success', 'Connection successful!', result.message);
      } else {
        showToast('error', 'Connection failed', result.message);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Connection test failed';
      setTestResult({ success: false, message: msg });
      showToast('error', 'Connection failed', msg);
    } finally {
      setIsTesting(false);
    }
  };

  const securityDefaults: Record<string, string> = {
    TLS: '587',
    SSL: '465',
    NONE: '25',
  };

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Access Restricted</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Only administrators can configure SMTP settings.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SMTP Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure email delivery for notifications and reports</p>
      </div>

      {/* Form */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <Mail size={18} className="text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Email Server Configuration</h2>
        </div>

        <div className="space-y-4">
          {/* Host */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-1.5"><Server size={13} /> SMTP Host *</span>
            </label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Port + Security */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port *</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => handleChange('port', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <span className="flex items-center gap-1.5"><Shield size={13} /> Security Type</span>
              </label>
              <select
                value={form.security}
                onChange={(e) => {
                  const sec = e.target.value as SmtpForm['security'];
                  setForm((prev) => ({ ...prev, security: sec, port: securityDefaults[sec] }));
                }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="TLS">TLS (STARTTLS)</option>
                <option value="SSL">SSL</option>
                <option value="NONE">None</option>
              </select>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-1.5"><Mail size={13} /> Email Address *</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="notifications@company.com"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-1.5"><Lock size={13} /> Password / App Password</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="Leave blank to keep existing password"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 pr-10 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${testResult.success ? 'border-green-300 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              {testResult.success ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="flex-shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>For Gmail, use an App Password instead of your account password. Go to Google Account → Security → App Passwords.</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              Test Connection
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Settings
            </button>
          </div>
        </div>
      </Card>

      {/* Common presets */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Presets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Gmail', host: 'smtp.gmail.com', port: '587', security: 'TLS' as const },
            { name: 'Outlook / Office 365', host: 'smtp.office365.com', port: '587', security: 'TLS' as const },
            { name: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', security: 'TLS' as const },
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => setForm((prev) => ({ ...prev, host: preset.host, port: preset.port, security: preset.security }))}
              className="p-3 text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{preset.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{preset.host}:{preset.port}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
