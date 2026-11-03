import { MAP_TILE_URL } from '../../lib/mapTiles';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Siren, Navigation, Loader2, AlertCircle, MapPin, Clock, User, Phone, CheckCircle, XCircle, Volume2, Search, Filter, ChevronDown, Eye, Radio, Shield, Activity, TrendingUp, BarChart3, AlertTriangle, Wifi, Signal } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../../contexts/SocketContext';
import {
  useFetchSOSAlertsQuery,
  useFetchSOSStatsQuery,
  useFetchNearbyOfficersQuery,
  useAssignSOSOfficerMutation,
  useResolveSOSAlertMutation,
  useCancelSOSAlertMutation,
  usePlaySOSAlertSoundMutation,
  useContactSOSAlertCitizenMutation,
} from '../../store/api';
import type { SOSAlert } from '../../types/entities';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  pending: '#ef4444',
  assigned: '#f59e0b',
  'in-progress': '#3b82f6',
  resolved: '#22c55e',
  cancelled: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  emergency: 'Emergency',
  medical: 'Medical',
  fire: 'Fire',
  accident: 'Accident',
  harassment: 'Harassment',
  other: 'Other',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

const ACTIVE_STATUSES = ['pending', 'assigned', 'in-progress'];

function formatTime(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatResponseTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

export default function SOSMonitoring() {
  const { addToast } = useToast();
  const [activeOnly, setActiveOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<SOSAlert | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [dispatchAlertId, setDispatchAlertId] = useState<string | null>(null);
  const [resolveAlertId, setResolveAlertId] = useState<string | null>(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelAlertId, setCancelAlertId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6139, 77.2090]);
  const { socket, isConnected } = useSocket();

  // Locally tracked alerts: seeded from REST, updated in real-time via Socket.IO.
  const [trackedAlerts, setTrackedAlerts] = useState<SOSAlert[]>([]);

  const queryParams = useMemo(() => ({
    page: 1,
    pageSize: 50,
    ...(activeOnly ? { status: 'pending,assigned,in-progress' } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter ? { alertType: typeFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
  }), [activeOnly, searchQuery, statusFilter, typeFilter, priorityFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useFetchSOSAlertsQuery(queryParams);
  const { data: stats, isLoading: isStatsLoading } = useFetchSOSStatsQuery();
  const { data: nearbyOfficersData } = useFetchNearbyOfficersQuery(
    { latitude: mapCenter[0], longitude: mapCenter[1], maxDistance: 15 },
    { skip: !showDispatchModal }
  );

  const [assignOfficer, { isLoading: isAssigning }] = useAssignSOSOfficerMutation();
  const [resolveAlert, { isLoading: isResolving }] = useResolveSOSAlertMutation();
  const [cancelSOSAlert, { isLoading: isCancelling }] = useCancelSOSAlertMutation();
  const [playSound] = usePlaySOSAlertSoundMutation();
  const [contactCitizen] = useContactSOSAlertCitizenMutation();

  // Seed tracked alerts from the REST response once (deferred). Real-time
  // Socket.IO updates are merged on top and are not overwritten by refetches.
  useEffect(() => {
    if (!data?.data || trackedAlerts.length > 0) return;
    const id = setTimeout(() => setTrackedAlerts(data.data), 0);
    return () => clearTimeout(id);
  }, [data, trackedAlerts.length]);

  const alerts = trackedAlerts;
  const activeCount = alerts.filter((a: SOSAlert) => ACTIVE_STATUSES.includes(a.status)).length;
  const pendingAlerts = alerts.filter((a: SOSAlert) => a.status === 'pending');

  // Real-time SOS events via Socket.IO.
  useEffect(() => {
    if (!socket) return;
    socket.on('sos:new', (alert: SOSAlert) => {
      setTrackedAlerts(prev => [alert, ...prev]);
      addToast(`New SOS: ${alert.alertType} — ${alert.locationAddress || 'unknown location'}`, 'error');
    });
    socket.on('sos:updated', (payload: any) => {
      setTrackedAlerts(prev => prev.map(a => (String(a.id) === String(payload.alert.id) ? { ...a, ...payload.alert } : a)));
    });
    socket.on('sos:assigned', (payload: any) => {
      setTrackedAlerts(prev => prev.map(a => (String(a.id) === String(payload.alert.id) ? { ...a, ...payload.alert } : a)));
      addToast(`SOS ${payload.alert.id} assigned`, 'info');
    });
    socket.on('sos:resolved', (payload: any) => {
      setTrackedAlerts(prev => prev.map(a => (String(a.id) === String(payload.alert.id) ? { ...a, ...payload.alert } : a)));
      addToast(`SOS ${payload.alert.id} resolved`, 'success');
    });
    return () => {
      socket.off('sos:new');
      socket.off('sos:updated');
      socket.off('sos:assigned');
      socket.off('sos:resolved');
    };
  }, [socket, addToast]);

  useEffect(() => {
    if (pendingAlerts.length > 0) {
      const interval = setInterval(() => {
        addToast(`${pendingAlerts.length} pending SOS alert(s) require attention`, 'info');
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [pendingAlerts.length, addToast]);

  const handleDispatch = useCallback((id: string) => {
    setDispatchAlertId(id);
    setSelectedOfficerId('');
    setShowDispatchModal(true);
  }, []);

  const confirmDispatch = useCallback(async () => {
    if (!dispatchAlertId || !selectedOfficerId) {
      addToast('Please select an officer', 'error');
      return;
    }
    try {
      await assignOfficer({ id: dispatchAlertId, data: { officerId: selectedOfficerId } }).unwrap();
      addToast('Unit dispatched successfully', 'success');
      setShowDispatchModal(false);
      setDispatchAlertId(null);
      setSelectedOfficerId('');
    } catch {
      addToast('Failed to dispatch unit', 'error');
    }
  }, [dispatchAlertId, selectedOfficerId, assignOfficer, addToast]);

  const handleResolve = useCallback((id: string) => {
    setResolveAlertId(id);
    setResolveNotes('');
    setShowResolveModal(true);
  }, []);

  const confirmResolve = useCallback(async () => {
    if (!resolveAlertId) return;
    try {
      await resolveAlert({ id: resolveAlertId, data: { resolutionNotes: resolveNotes || 'Resolved by dispatcher' } }).unwrap();
      addToast('Alert resolved successfully', 'success');
      setShowResolveModal(false);
      setResolveAlertId(null);
      setResolveNotes('');
    } catch {
      addToast('Failed to resolve alert', 'error');
    }
  }, [resolveAlertId, resolveNotes, resolveAlert, addToast]);

  const handleCancel = useCallback((id: string) => {
    setCancelAlertId(id);
    setCancelReason('');
    setShowCancelModal(true);
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!cancelAlertId) return;
    try {
      await cancelSOSAlert({ id: cancelAlertId, reason: cancelReason || 'Cancelled by dispatcher' }).unwrap();
      addToast('Alert cancelled', 'success');
      setShowCancelModal(false);
      setCancelAlertId(null);
      setCancelReason('');
    } catch {
      addToast('Failed to cancel alert', 'error');
    }
  }, [cancelAlertId, cancelReason, cancelSOSAlert, addToast]);

  const handlePlaySound = useCallback(async (id: string) => {
    try {
      await playSound(id).unwrap();
      addToast('Sound alert triggered', 'success');
    } catch {
      addToast('Failed to trigger sound', 'error');
    }
  }, [playSound, addToast]);

  const handleContact = useCallback(async (id: string) => {
    try {
      await contactCitizen(id).unwrap();
      addToast('Contacting citizen...', 'info');
    } catch {
      addToast('Failed to contact citizen', 'error');
    }
  }, [contactCitizen, addToast]);

  const handleAlertClick = useCallback((alert: SOSAlert) => {
    setSelectedAlert(alert);
    setShowDetailModal(true);
    setMapCenter([alert.latitude, alert.longitude]);
  }, []);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-600" />
            SOS Monitoring Center
            {activeCount > 0 && (
              <span className="bg-red-100 text-red-700 border border-red-200 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full animate-pulse">{activeCount} Active</span>
            )}
          </h2>
          <p className="text-sm text-slate-500">Real-time SOS monitoring — alerts appear instantly via Socket.IO</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", isConnected ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200")}>
            {isConnected ? <><Wifi className="w-3 h-3 inline mr-1" /> Live</> : <><Signal className="w-3 h-3 inline mr-1" /> Disconnected</>}
          </span>
          <button onClick={() => setShowStatsPanel(!showStatsPanel)} className={cn("border text-xs font-medium px-3 py-1.5 rounded transition-colors", showStatsPanel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
            <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
            Statistics
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={() => setActiveOnly(!activeOnly)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Active only
          </label>
          <button onClick={() => refetch()} className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-medium hover:bg-slate-50 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Alerts', value: stats.total, icon: Siren, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pending', value: stats.pending, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Active (Assigned+In Progress)', value: stats.assigned + stats.inProgress, icon: Radio, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Avg Response', value: formatResponseTime(stats.avgResponseTime), icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className={cn("p-2 rounded-md", kpi.bg)}>
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">{kpi.label}</p>
                <p className="text-lg font-bold text-slate-800">{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistics Panel */}
      {showStatsPanel && stats && (
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By Type</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byType).sort(([,a],[,b]) => b-a).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-xs">
                    <span className="text-slate-600">{ALERT_TYPE_LABELS[type] || type}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By Priority</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byPriority).sort(([,a],[,b]) => b-a).map(([priority, count]) => (
                  <div key={priority} className="flex justify-between text-xs">
                    <span className="text-slate-600 capitalize">{priority}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By District</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byDistrict).sort(([,a],[,b]) => b-a).map(([district, count]) => (
                  <div key={district} className="flex justify-between text-xs">
                    <span className="text-slate-600">{district}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" placeholder="Search alerts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Types</option>
          {Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(searchQuery || statusFilter || typeFilter || priorityFilter) && (
          <button onClick={() => { setSearchQuery(''); setStatusFilter(''); setTypeFilter(''); setPriorityFilter(''); }} className="text-xs text-blue-600 hover:underline">Clear</button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Alerts list */}
        <div className="w-80 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col shrink-0 relative">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">
              {activeOnly ? 'Active Alerts' : 'All Alerts'}
              {!isLoading && <span className="text-xs font-normal text-slate-500 ml-2">({alerts.length})</span>}
            </h3>
          </div>
          {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : isError ? (
            <div className="flex-1 flex items-center justify-center text-red-500 text-xs p-4 flex-col gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>Failed to load</span>
              <button onClick={() => refetch()} className="text-blue-600 underline">Retry</button>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No alerts found</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {alerts.map((alert: SOSAlert) => (
                <div key={alert.id} className={cn("p-3 border-l-4 cursor-pointer hover:bg-slate-50 transition-colors", alert.status === 'pending' ? 'border-l-red-500 bg-red-50/30' : alert.status === 'assigned' ? 'border-l-amber-500' : alert.status === 'in-progress' ? 'border-l-blue-500' : 'border-l-slate-300')} onClick={() => handleAlertClick(alert)}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">{alert.user?.name ?? 'Anonymous'}</span>
                      {alert.priority === 'critical' && <span className="text-[8px] bg-red-500 text-white px-1 rounded">!</span>}
                    </div>
                    <span className="text-[10px] text-slate-400">{formatTime(alert.createdAt)}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 mb-1">{alert.description?.slice(0, 60)}{alert.description && alert.description.length > 60 ? '...' : ''}</p>
                  <div className="flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">{alert.locationAddress || 'Unknown location'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", alert.status === 'pending' ? 'bg-red-100 text-red-700' : alert.status === 'assigned' ? 'bg-amber-100 text-amber-700' : alert.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                        {STATUS_LABELS[alert.status] || alert.status}
                      </span>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", PRIORITY_COLORS[alert.priority])}>
                        {alert.priority}
                      </span>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {alert.status === 'pending' && (
                        <button onClick={() => handleDispatch(alert.id)} className="text-[9px] bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700 transition-colors">
                          Dispatch
                        </button>
                      )}
                      {(alert.status === 'assigned' || alert.status === 'in-progress') && (
                        <>
                          <button onClick={() => handleResolve(alert.id)} className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 transition-colors">
                            Resolve
                          </button>
                          <button onClick={() => handleCancel(alert.id)} className="text-[9px] bg-slate-500 text-white px-2 py-0.5 rounded hover:bg-slate-600 transition-colors">
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 bg-slate-900 rounded-md border border-slate-800 overflow-hidden relative shadow-sm">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : isError ? (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900 flex-col gap-2">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <span className="text-red-400 text-sm">Failed to load</span>
              <button onClick={() => refetch()} className="text-blue-400 underline text-xs">Retry</button>
            </div>
          ) : null}
          <MapContainer center={[28.6139, 77.2090]} zoom={11} scrollWheelZoom={true} className="h-full w-full absolute inset-0 z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={MAP_TILE_URL}
            />
            <MapRecenter center={mapCenter} />
            {alerts.filter((a: SOSAlert) => !activeOnly || ACTIVE_STATUSES.includes(a.status)).map((alert: SOSAlert) => (
              <CircleMarker
                key={alert.id}
                center={[alert.latitude, alert.longitude]}
                radius={alert.status === 'pending' ? 18 : 12}
                pathOptions={{
                  color: STATUS_COLORS[alert.status] || '#6b7280',
                  fillColor: STATUS_COLORS[alert.status] || '#6b7280',
                  fillOpacity: alert.status === 'pending' ? 0.35 : 0.2,
                  weight: 2,
                }}
                eventHandlers={{ click: () => handleAlertClick(alert) }}
              >
                <CircleMarker
                  center={[alert.latitude, alert.longitude]}
                  radius={alert.status === 'pending' ? 7 : 5}
                  pathOptions={{
                    color: 'white',
                    fillColor: STATUS_COLORS[alert.status] || '#6b7280',
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Popup className="custom-popup">
                    <div className="bg-slate-800 border-0 shadow-xl m-0 w-56 text-left rounded-md overflow-hidden">
                      <div className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-1">
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", alert.status === 'pending' ? 'text-red-400 bg-red-500/10' : 'text-slate-400 bg-slate-500/10')}>
                              {STATUS_LABELS[alert.status] || alert.status}
                            </span>
                            <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded uppercase", PRIORITY_COLORS[alert.priority])}>
                              {alert.priority}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{formatTime(alert.createdAt)}</span>
                        </div>
                        <p className="text-xs font-bold text-white mb-0.5">{alert.user?.name ?? 'Anonymous'}</p>
                        <p className="text-[10px] text-slate-400 mb-1">{ALERT_TYPE_LABELS[alert.alertType] || alert.alertType}</p>
                        {alert.description && <p className="text-[10px] text-slate-300 mb-1 leading-tight">{alert.description.slice(0, 80)}{alert.description.length > 80 ? '...' : ''}</p>}
                        <p className="text-[10px] text-slate-400 leading-tight">GPS: {alert.latitude.toFixed(4)}Â° N, {alert.longitude.toFixed(4)}Â° E</p>
                        {alert.locationAddress && <p className="text-[10px] text-slate-400 mt-1">{alert.locationAddress}</p>}
                        {alert.assignedOfficer && <p className="text-[10px] text-blue-400 mt-1">Assigned: {alert.assignedOfficer.name}</p>}
                        <div className="mt-3 flex gap-2">
                          {alert.status === 'pending' && (
                            <button onClick={(e) => { e.stopPropagation(); handleDispatch(alert.id); }} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold rounded transition-colors text-center">
                              Dispatch
                            </button>
                          )}
                          {(alert.status === 'assigned' || alert.status === 'in-progress') && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleResolve(alert.id); }} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-semibold rounded transition-colors text-center">
                                Resolve
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handlePlaySound(alert.id); }} className="py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold rounded transition-colors px-2">
                                <Volume2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleAlertClick(alert); }} className="py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-semibold rounded transition-colors px-2">
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Siren className={cn("w-5 h-5", selectedAlert.status === 'pending' ? 'text-red-600' : 'text-slate-600')} />
                <h3 className="text-lg font-bold text-slate-800">Alert Details</h3>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase", selectedAlert.status === 'pending' ? 'bg-red-100 text-red-700' : selectedAlert.status === 'assigned' ? 'bg-amber-100 text-amber-700' : selectedAlert.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                  {STATUS_LABELS[selectedAlert.status]}
                </span>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Citizen</label>
                  <p className="text-sm font-semibold text-slate-800">{selectedAlert.user?.name ?? 'Anonymous'}</p>
                  {selectedAlert.user?.phone && <p className="text-xs text-slate-600">{selectedAlert.user.phone}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Alert Type</label>
                  <p className="text-sm font-semibold text-slate-800">{ALERT_TYPE_LABELS[selectedAlert.alertType] || selectedAlert.alertType}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Priority</label>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase", PRIORITY_COLORS[selectedAlert.priority])}>{selectedAlert.priority}</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Time</label>
                  <p className="text-sm text-slate-800">{formatDateTime(selectedAlert.createdAt)}</p>
                </div>
              </div>
              {selectedAlert.description && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Description</label>
                  <p className="text-sm text-slate-700 mt-1">{selectedAlert.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Location</label>
                  <p className="text-sm text-slate-800">{selectedAlert.locationAddress || 'Unknown'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">GPS: {selectedAlert.latitude.toFixed(4)}Â° N, {selectedAlert.longitude.toFixed(4)}Â° E</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">District / Police Station</label>
                  <p className="text-sm text-slate-800">{selectedAlert.district || '--'} / {selectedAlert.policeStation || '--'}</p>
                </div>
              </div>
              {selectedAlert.assignedOfficer && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <label className="text-[10px] text-blue-600 uppercase font-bold">Assigned Officer</label>
                  <p className="text-sm font-semibold text-blue-800">{selectedAlert.assignedOfficer.name} ({selectedAlert.assignedOfficer.badgeNumber})</p>
                  <p className="text-[10px] text-blue-600">Since: {formatDateTime(selectedAlert.assignedAt)}</p>
                </div>
              )}
              {selectedAlert.responseTime && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <label className="text-[10px] text-green-600 uppercase font-bold">Response Time</label>
                  <p className="text-sm font-semibold text-green-800">{formatResponseTime(selectedAlert.responseTime)}</p>
                </div>
              )}
              {selectedAlert.resolutionNotes && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                  <label className="text-[10px] text-slate-500 uppercase font-bold">Resolution Notes</label>
                  <p className="text-sm text-slate-700">{selectedAlert.resolutionNotes}</p>
                </div>
              )}
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span className={cn("px-1.5 py-0.5 rounded", selectedAlert.soundPlayed ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600')}>
                  {selectedAlert.soundPlayed ? 'Sound Played' : 'No Sound'}
                </span>
                <span className={cn("px-1.5 py-0.5 rounded", selectedAlert.contacted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600')}>
                  {selectedAlert.contacted ? 'Citizen Contacted' : 'Not Contacted'}
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              {selectedAlert.status === 'pending' && (
                <button onClick={() => { setShowDetailModal(false); handleDispatch(selectedAlert.id); }} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors">
                  Dispatch Unit
                </button>
              )}
              {(selectedAlert.status === 'assigned' || selectedAlert.status === 'in-progress') && (
                <>
                  <button onClick={() => { setShowDetailModal(false); handleResolve(selectedAlert.id); }} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors">
                    Resolve
                  </button>
                  <button onClick={() => { setShowDetailModal(false); handlePlaySound(selectedAlert.id); }} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 transition-colors">
                    <Volume2 className="w-4 h-4 inline mr-1" />
                    Play Sound
                  </button>
                  <button onClick={() => { setShowDetailModal(false); handleCancel(selectedAlert.id); }} className="px-4 py-2 bg-slate-500 text-white text-sm font-medium rounded hover:bg-slate-600 transition-colors">
                    Cancel
                  </button>
                </>
              )}
              {!selectedAlert.contacted && selectedAlert.user?.phone && (
                <button onClick={() => { handleContact(selectedAlert.id); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Contact Citizen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                Dispatch Officer
              </h3>
            </div>
            <div className="p-4">
              <label className="text-xs text-slate-600 font-medium mb-2 block">Select Officer</label>
              {nearbyOfficersData?.officers && nearbyOfficersData.officers.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {nearbyOfficersData.officers.map(officer => (
                    <label key={officer.id} className={cn("flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors", selectedOfficerId === officer.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50")}>
                      <input type="radio" name="officer" value={officer.id} checked={selectedOfficerId === officer.id} onChange={(e) => setSelectedOfficerId(e.target.value)} className="text-blue-600 focus:ring-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{officer.name}</p>
                        <p className="text-[10px] text-slate-500">{officer.rank} Â· {officer.badgeNumber}</p>
                        <p className="text-[10px] text-slate-500">Specialization: {officer.specialization.join(', ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-blue-600">{officer.distance} km</p>
                        <p className="text-[10px] text-slate-500">away</p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No officers available nearby</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowDispatchModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors">Cancel</button>
              <button onClick={confirmDispatch} disabled={isAssigning || !selectedOfficerId} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 transition-colors">
                {isAssigning ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Resolve Alert
              </h3>
            </div>
            <div className="p-4">
              <label className="text-xs text-slate-600 font-medium mb-2 block">Resolution Notes</label>
              <textarea value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} placeholder="Describe how the situation was resolved..." className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" rows={4} />
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowResolveModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors">Cancel</button>
              <button onClick={confirmResolve} disabled={isResolving} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors">
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-slate-600" />
                Cancel Alert
              </h3>
            </div>
            <div className="p-4">
              <label className="text-xs text-slate-600 font-medium mb-2 block">Reason for Cancellation</label>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this alert being cancelled?" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent" rows={3} />
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors">Close</button>
              <button onClick={confirmCancel} disabled={isCancelling} className="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded hover:bg-slate-700 disabled:opacity-50 transition-colors">
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                Cancel Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
