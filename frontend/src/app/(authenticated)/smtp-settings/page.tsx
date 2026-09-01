'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/context/ToastContext';
import {
  Mail, Server, Lock, Shield, CheckCircle, XCircle,
  Loader2, Save, Wifi, Eye, EyeOff, AlertCircle, Send,
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
  const [form, setForm] = useState<SmtpForm>({ host: '', port: '587', email: '', password: '', security: 'TLS' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // The GET itself returns SMTP host/config — don't fire it for a role that
    // the page is about to show "Access Restricted" to anyway.
    if (user?.role !== 'ADMIN') { setIsLoading(false); return; }
    api.get('/smtp')
      .then((r) => {
        const d = r.data.data;
        setForm({ host: d.host || '', port: String(d.port || 587), email: d.email || '', password: '', security: d.security || 'TLS' });
        setTestRecipient(d.email || '');
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user?.role]);

  const handleChange = (field: keyof SmtpForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!form.host || !form.email) { showToast('error', 'SMTP host and email are required'); return; }
    setIsSaving(true);
    try {
      await api.post('/smtp/save', { ...form, port: parseInt(form.port, 10) });
      showToast('success', 'SMTP settings saved!', 'Email notifications will now use these settings.');
    } catch {
      showToast('error', 'Failed to save SMTP settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!form.host || !form.email) { showToast('warning', 'Enter host and email before testing'); return; }
    setIsTesting(true);
    setTestResult(null);
    try {
      const r = await api.post('/smtp/test', { ...form, port: parseInt(form.port, 10) });
      const result = { success: r.data.success, message: r.data.message };
      setTestResult(result);
      showToast(result.success ? 'success' : 'error', result.success ? 'Connection verified!' : 'Connection failed', result.message);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Connection test failed';
      setTestResult({ success: false, message: msg });
      showToast('error', 'Connection failed', msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!form.host || !form.email) { showToast('warning', 'Save SMTP settings first'); return; }
    if (!testRecipient) { showToast('warning', 'Enter a recipient email address'); return; }
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const r = await api.post('/smtp/send-test', { ...form, port: parseInt(form.port, 10), recipientEmail: testRecipient });
      const result = { success: r.data.success, message: r.data.message };
      setTestResult(result);
      showToast(result.success ? 'success' : 'error', result.success ? 'Test email sent!' : 'Failed to send', result.message);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send test email';
      setTestResult({ success: false, message: msg });
      showToast('error', 'Send failed', msg);
    } finally {
      setIsSendingTest(false);
    }
  };

  const securityDefaults: Record<string, string> = { TLS: '587', SSL: '465', NONE: '25' };

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Access Restricted</h2>
          <p className="text-sm text-slate-500 mt-1">Only administrators can configure SMTP settings.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SMTP Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure outbound email for notifications, alerts, and password resets</p>
      </div>

      {/* Server form */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <Mail size={18} className="text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900">Email Server Configuration</h2>
        </div>

        <div className="space-y-4">
          {/* Host */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
              <Server size={13} /> SMTP Host *
            </label>
            <input type="text" value={form.host} onChange={(e) => handleChange('host', e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Port + Security */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Port *</label>
              <input type="number" value={form.port} onChange={(e) => handleChange('port', e.target.value)}
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Shield size={13} /> Security
              </label>
              <select value={form.security}
                onChange={(e) => { const sec = e.target.value as SmtpForm['security']; setForm((p) => ({ ...p, security: sec, port: securityDefaults[sec] })); }}
                className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="TLS">TLS (STARTTLS) — recommended</option>
                <option value="SSL">SSL</option>
                <option value="NONE">None</option>
              </select>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
              <Mail size={13} /> Sender Email Address *
            </label>
            <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)}
              placeholder="notifications@yourdomain.com"
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
              <Lock size={13} /> Password / App Password
            </label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="Leave blank to keep existing password"
                className="w-full border border-blue-200 rounded-lg px-3 py-2 pr-10 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Test result badge */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${testResult.success ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {testResult.success ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="flex-shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Gmail tip */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>For Gmail, create an <strong>App Password</strong> (Google Account → Security → App Passwords) instead of using your account password.</span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleTestConnection} disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 border border-blue-200 text-slate-700 rounded-lg text-sm hover:bg-blue-50 transition-colors disabled:opacity-50">
              {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              Verify Connection
            </button>
            <button onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Settings
            </button>
          </div>
        </div>
      </Card>

      {/* Send test email */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Send size={16} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Send Test Email</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">Send a real test email to verify end-to-end delivery with the current settings above.</p>
        <div className="flex gap-3">
          <input type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <button onClick={handleSendTestEmail} disabled={isSendingTest}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap">
            {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Test
          </button>
        </div>
      </Card>

      {/* Quick presets */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Presets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Gmail', host: 'smtp.gmail.com', port: '587', security: 'TLS' as const },
            { name: 'Outlook / Office 365', host: 'smtp.office365.com', port: '587', security: 'TLS' as const },
            { name: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', security: 'TLS' as const },
          ].map((preset) => (
            <button key={preset.name}
              onClick={() => setForm((p) => ({ ...p, host: preset.host, port: preset.port, security: preset.security }))}
              className="p-3 text-left rounded-lg border border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <p className="text-sm font-medium text-slate-800">{preset.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{preset.host}:{preset.port}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
