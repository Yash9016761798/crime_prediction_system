import { useState, useEffect, useCallback } from 'react';
import {
  Building, Shield, Bell, Save, Loader2, AlertCircle, Plug,
  CheckCircle, XCircle, RefreshCw, Eye, EyeOff, Clock, Lock,
  Server, Database, Cpu, MemoryStick, Users, Activity, Zap,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useUpdateNotificationSettingsMutation,
  useUpdateSecuritySettingsMutation,
  useUpdateIntegrationSettingsMutation,
  useTestIntegrationMutation,
  useGetSystemInfoQuery,
} from '../../store/api';
import type { SettingsResponse } from '../../types/api';

type TabId = 'general' | 'security' | 'notifications';

const TABS: { id: TabId; label: string; icon: typeof Building }[] = [
  { id: 'general', label: 'General Profile', icon: Building },
  { id: 'security', label: 'Security & Access', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemSettings() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const { data: settings, isLoading: settingsLoading, isError: settingsError, refetch: refetchSettings } = useGetSettingsQuery();
  const { data: sysInfo, isLoading: sysLoading, isError: sysError, refetch: refetchSysInfo } = useGetSystemInfoQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation();
  const [updateNotifications] = useUpdateNotificationSettingsMutation();
  const [updateSecurity] = useUpdateSecuritySettingsMutation();
  const [updateIntegrations] = useUpdateIntegrationSettingsMutation();
  const [testIntegration] = useTestIntegrationMutation();

  const systemError = settingsError || sysError;

  // General state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [defaultPageSize, setDefaultPageSize] = useState(25);

  // Security state
  const [security, setSecurity] = useState<SettingsResponse['security']>({
    passwordMinLength: 8, requireUppercase: true, requireNumbers: true, requireSpecialChars: true,
    twoFactorEnabled: false, sessionTimeout: 30, maxLoginAttempts: 5, lockoutDuration: 15,
    ipWhitelisting: false, allowedIPs: [],
  });
  const [showPassword, setShowPassword] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});

  // Integration state
  const [integrations, setIntegrations] = useState<Record<string, { name: string; status: string; apiKey?: string; endpoint?: string; provider?: string }>>({});

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the local form state once the server settings arrive */
  useEffect(() => {
    if (settings) {
      setTheme(settings.theme ?? 'light');
      setRefreshInterval(settings.refreshInterval ?? 30);
      setDefaultPageSize(settings.defaultPageSize ?? 25);
      setSecurity(settings.security ?? security);
      setNotifications(settings.notifications ?? {});
      setIntegrations(settings.integrations ?? {});
    }
  }, [settings]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('settings-theme', theme);
  }, [theme]);

  // Apply refresh interval to localStorage for other components
  useEffect(() => {
    localStorage.setItem('settings-refresh-interval', String(refreshInterval));
  }, [refreshInterval]);

  // Apply default page size to localStorage for other components
  useEffect(() => {
    localStorage.setItem('settings-page-size', String(defaultPageSize));
  }, [defaultPageSize]);

  const handleSaveGeneral = useCallback(async () => {
    try {
      await updateSettings({ theme, refreshInterval, defaultPageSize }).unwrap();
      addToast('General settings saved', 'success');
    } catch {
      addToast('Failed to save settings', 'error');
    }
  }, [theme, refreshInterval, defaultPageSize, updateSettings, addToast]);

  const handleSaveSecurity = useCallback(async () => {
    try {
      await updateSecurity(security).unwrap();
      addToast('Security settings saved', 'success');
    } catch {
      addToast('Failed to save security settings', 'error');
    }
  }, [security, updateSecurity, addToast]);

  const handleSaveNotifications = useCallback(async () => {
    try {
      await updateNotifications(notifications).unwrap();
      addToast('Notification settings saved', 'success');
    } catch {
      addToast('Failed to save notification settings', 'error');
    }
  }, [notifications, updateNotifications, addToast]);

  const handleSaveIntegrations = useCallback(async () => {
    try {
      await updateIntegrations(integrations).unwrap();
      addToast('Integration settings saved', 'success');
    } catch {
      addToast('Failed to save integration settings', 'error');
    }
  }, [integrations, updateIntegrations, addToast]);

  const handleTestConnection = useCallback(async (key: string) => {
    try {
      const result = await testIntegration(key).unwrap();
      setIntegrations(prev => ({ ...prev, [key]: { ...prev[key], status: result.status } }));
      addToast(`Connection ${result.success ? 'successful' : 'failed'}: ${integrations[key]?.name}`, result.success ? 'success' : 'error');
    } catch {
      addToast('Connection test failed', 'error');
    }
  }, [testIntegration, integrations, addToast]);

  const handleSave = useCallback(async () => {
    if (activeTab === 'general') return handleSaveGeneral();
    if (activeTab === 'security') return handleSaveSecurity();
    if (activeTab === 'notifications') return handleSaveNotifications();
    if (activeTab === 'integrations') return handleSaveIntegrations();
  }, [activeTab, handleSaveGeneral, handleSaveSecurity, handleSaveNotifications, handleSaveIntegrations]);

  const isLoading = settingsLoading || sysLoading;

  return (
    <div className="space-y-6 pb-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">System Settings</h2>
          <p className="text-sm text-slate-500">Configure global platform preferences and integrations</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white shadow-sm rounded-md px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" /> Save Changes
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : systemError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-600">Failed to load settings</p>
          <p className="text-xs text-slate-500 mb-4">Could not load settings or system information</p>
          <button onClick={() => { refetchSettings(); refetchSysInfo(); }} className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-red-100 transition-colors">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Left sidebar: tabs + system info */}
          <div className="md:col-span-1 space-y-4">
            <div className="space-y-1">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("w-full text-left px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2", activeTab === tab.id ? 'text-blue-700 bg-blue-50 font-bold' : 'text-slate-600 hover:bg-slate-50')}>
                  <tab.icon className="w-4 h-4" /> {tab.label}
                </button>
              ))}
            </div>

            {/* System Info Panel */}
            {sysInfo && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Health</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Server className="w-3 h-3" /> Version</span>
                    <span className="font-medium text-slate-700">{sysInfo.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Database className="w-3 h-3" /> Database</span>
                    <span className={cn("font-medium flex items-center gap-1", sysInfo.database?.status === 'connected' ? 'text-green-600' : 'text-red-600')}>
                      {sysInfo.database?.status === 'connected' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {sysInfo.database?.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Uptime</span>
                    <span className="font-medium text-slate-700">{formatUptime(sysInfo.performance?.uptime ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Users className="w-3 h-3" /> Active Users</span>
                    <span className="font-medium text-slate-700">{sysInfo.performance?.activeUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Cpu className="w-3 h-3" /> CPU</span>
                    <span className="font-medium text-slate-700">{sysInfo.performance?.cpuUsage}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><MemoryStick className="w-3 h-3" /> Memory</span>
                    <span className="font-medium text-slate-700">{sysInfo.performance?.usedMemory}MB / {sysInfo.performance?.totalMemory}MB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5"><Database className="w-3 h-3" /> Records</span>
                    <span className="font-medium text-slate-700">{sysInfo.database?.liveRecords?.toLocaleString()} live</span>
                  </div>
                  {sysInfo.apiStatus && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5"><Plug className="w-3 h-3" /> APIs</span>
                      <span className="font-medium text-slate-700">{sysInfo.apiStatus.connected}/{sysInfo.apiStatus.total}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right content: tab panels */}
          <div className="md:col-span-3 space-y-6">
            {/* General Profile */}
            {activeTab === 'general' && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <Building className="w-5 h-5 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800">General Settings</h3>
                </div>
                <div className="p-6 space-y-4">
                  <SettingRow label="Theme" description="Choose light or dark mode">
                    <select value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')} className="border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Refresh Interval" description="Dashboard auto-refresh frequency">
                    <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Default Page Size" description="Default rows per page in tables">
                    <select value={defaultPageSize} onChange={e => setDefaultPageSize(Number(e.target.value))} className="border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} per page</option>)}
                    </select>
                  </SettingRow>
                </div>
              </div>
            )}

            {/* Security & Access */}
            {activeTab === 'security' && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800">Security & Access Control</h3>
                </div>
                <div className="p-6 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Password Policy</h4>
                  <SettingRow label="Minimum Password Length" description="Minimum characters required">
                    <input type="number" min={6} max={32} value={security.passwordMinLength} onChange={e => setSecurity(p => ({ ...p, passwordMinLength: Number(e.target.value) }))} className="w-20 border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </SettingRow>
                  <SettingRow label="Require Uppercase Letters" description="Enforce A-Z in passwords">
                    <Toggle checked={security.requireUppercase} onChange={v => setSecurity(p => ({ ...p, requireUppercase: v }))} />
                  </SettingRow>
                  <SettingRow label="Require Numbers" description="Enforce 0-9 in passwords">
                    <Toggle checked={security.requireNumbers} onChange={v => setSecurity(p => ({ ...p, requireNumbers: v }))} />
                  </SettingRow>
                  <SettingRow label="Require Special Characters" description="Enforce !@#$ in passwords">
                    <Toggle checked={security.requireSpecialChars} onChange={v => setSecurity(p => ({ ...p, requireSpecialChars: v }))} />
                  </SettingRow>

                  <div className="h-px bg-slate-200 my-2" />
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session & Authentication</h4>
                  <SettingRow label="Two-Factor Authentication" description="Require 2FA for all admin accounts">
                    <Toggle checked={security.twoFactorEnabled} onChange={v => setSecurity(p => ({ ...p, twoFactorEnabled: v }))} />
                  </SettingRow>
                  <SettingRow label="Session Timeout (minutes)" description="Auto-logout after inactivity">
                    <select value={security.sessionTimeout} onChange={e => setSecurity(p => ({ ...p, sessionTimeout: Number(e.target.value) }))} className="border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {[5, 15, 30, 60, 120].map(s => <option key={s} value={s}>{s} min</option>)}
                    </select>
                  </SettingRow>
                  <SettingRow label="Max Login Attempts" description="Lock account after failed attempts">
                    <input type="number" min={3} max={10} value={security.maxLoginAttempts} onChange={e => setSecurity(p => ({ ...p, maxLoginAttempts: Number(e.target.value) }))} className="w-20 border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </SettingRow>
                  <SettingRow label="Lockout Duration (minutes)" description="Account lock duration">
                    <select value={security.lockoutDuration} onChange={e => setSecurity(p => ({ ...p, lockoutDuration: Number(e.target.value) }))} className="border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {[5, 15, 30, 60].map(s => <option key={s} value={s}>{s} min</option>)}
                    </select>
                  </SettingRow>

                  <div className="h-px bg-slate-200 my-2" />
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Network Security</h4>
                  <SettingRow label="IP Whitelisting" description="Restrict access to specific IP addresses">
                    <Toggle checked={security.ipWhitelisting} onChange={v => setSecurity(p => ({ ...p, ipWhitelisting: v }))} />
                  </SettingRow>
                  {security.ipWhitelisting && (
                    <SettingRow label="Allowed IPs" description="Comma-separated IP addresses">
                      <input type="text" value={security.allowedIPs?.join(', ') ?? ''} onChange={e => setSecurity(p => ({ ...p, allowedIPs: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="192.168.1.0, 10.0.0.1" className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </SettingRow>
                  )}
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeTab === 'notifications' && (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800">Notification Preferences</h3>
                </div>
                <div className="p-6 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alert Types</h4>
                  {[
                    { key: 'sos', label: 'SOS Emergency Alerts', desc: 'Critical officer safety notifications' },
                    { key: 'crime_report', label: 'Crime Reports', desc: 'New citizen-submitted crime reports' },
                    { key: 'prediction', label: 'Prediction Alerts', desc: 'High-risk crime predictions' },
                    { key: 'system', label: 'System Notifications', desc: 'System updates and maintenance' },
                    { key: 'assignment', label: 'Assignment Notifications', desc: 'Case and FIR assignments' },
                  ].map(item => (
                    <SettingRow key={item.key} label={item.label} description={item.desc}>
                      <Toggle checked={notifications[item.key] ?? true} onChange={v => setNotifications(p => ({ ...p, [item.key]: v }))} />
                    </SettingRow>
                  ))}
                  <div className="h-px bg-slate-200 my-2" />
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Delivery</h4>
                  {[
                    { key: 'daily_summary', label: 'Daily Summary Email', desc: 'Receive daily crime and activity summary' },
                    { key: 'emergency_broadcast', label: 'Emergency Broadcasts', desc: 'Critical emergency broadcast messages' },
                  ].map(item => (
                    <SettingRow key={item.key} label={item.label} description={item.desc}>
                      <Toggle checked={notifications[item.key] ?? true} onChange={v => setNotifications(p => ({ ...p, [item.key]: v }))} />
                    </SettingRow>
                  ))}
                </div>
              </div>
            )}


          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared components
// ============================================================================

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
    </label>
  );
}
