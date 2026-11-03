import { MAP_TILE_URL } from '../../lib/mapTiles';
import { useState, useMemo, useCallback } from 'react';
import {
  AlertOctagon, TrendingUp, TrendingDown, Minus, Filter, Crosshair, Loader2, AlertCircle,
  Search, MapPin, Shield, Activity, Download, FileText, FileSpreadsheet, Image, X,
  ChevronRight, ChevronDown, ChevronUp, Clock, Target, Zap, Eye, EyeOff, RefreshCw,
  Building2, Stethoscope, Brain, Phone, Users, BarChart3, Calendar, ArrowUpRight,
  ArrowDownRight, Info
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGetHotspotsQuery, useGetHotspotDetailQuery } from '../../store/api';
import type { HotspotData } from '../../types/entities';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MAP_LAYERS = [
  { id: 'crime-density', name: 'Crime Density', icon: Target },
  { id: 'live-crime', name: 'Live Crime Reports', icon: AlertOctagon },
  { id: 'sos-alerts', name: 'SOS Alerts', icon: Phone },
  { id: 'police-stations', name: 'Police Stations', icon: Building2 },
  { id: 'hospitals', name: 'Hospitals', icon: Stethoscope },
  { id: 'ai-prediction', name: 'Prediction', icon: Brain },
];

const TIME_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

function MapFlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useMemo(() => { map.flyTo(center, zoom, { animate: true, duration: 1.5 }); }, [center, zoom, map]);
  return null;
}

function getRiskColor(level: string): string {
  if (level === 'critical') return '#ef4444';
  if (level === 'high') return '#f59e0b';
  if (level === 'moderate') return '#3b82f6';
  return '#22c55e';
}

function TrendIcon({ trend, change }: { trend: string; change: number }) {
  if (trend === 'increasing') return <ArrowUpRight className="w-3 h-3 text-red-500" />;
  if (trend === 'decreasing') return <ArrowDownRight className="w-3 h-3 text-emerald-500" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

function StatBox({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    slate: 'bg-slate-50 border-slate-100 text-slate-700',
  };
  return (
    <div className={cn('border rounded-lg p-3', colors[color] ?? colors.slate)}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span></div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
      {value && <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (format: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
          {[
            { format: 'csv', label: 'CSV', icon: FileSpreadsheet },
            { format: 'pdf', label: 'PDF Report', icon: FileText },
            { format: 'excel', label: 'Excel', icon: FileSpreadsheet },
            { format: 'png', label: 'Map Image', icon: Image },
          ].map(e => (
            <button key={e.format} onClick={() => { onExport(e.format); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
              <e.icon className="w-3.5 h-3.5 text-slate-400" /> {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HotspotDetailPanel({ districtName, onBack }: { districtName: string; onBack: () => void }) {
  const { data, isLoading } = useGetHotspotDetailQuery(districtName);
  const [activeTab, setActiveTab] = useState<'overview' | 'crimes' | 'fir' | 'ai'>('overview');
  const { addToast } = useToast();

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (!data) return <div className="text-center text-slate-400 text-xs py-8">No data available</div>;

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'crimes' as const, label: 'Crimes' },
    { id: 'fir' as const, label: 'FIR' },
    { id: 'ai' as const, label: 'Analysis' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600"><ChevronRight className="w-4 h-4 rotate-180" /></button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 truncate">{data.district}</h3>
          <p className="text-[10px] text-slate-500">{data.state}</p>
        </div>
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", data.yoyChange > 0 ? 'bg-red-100 text-red-700' : data.yoyChange < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
          {data.yoyChange > 0 ? 'â†‘' : data.yoyChange < 0 ? 'â†“' : 'â†’'} {Math.abs(data.yoyChange)}% YoY
        </span>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn("flex-1 text-[10px] font-medium py-1.5 rounded-md transition-colors", activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <p className="text-[10px] font-bold text-slate-600 mb-1.5 uppercase">Area Information</p>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div><span className="text-slate-500">State:</span> <span className="font-medium text-slate-700">{data.areaInfo.state}</span></div>
              <div><span className="text-slate-500">District:</span> <span className="font-medium text-slate-700">{data.areaInfo.district}</span></div>
              <div><span className="text-slate-500">Police Station:</span> <span className="font-medium text-slate-700">{data.areaInfo.policeStation}</span></div>
              <div><span className="text-slate-500">Coordinates:</span> <span className="font-medium text-slate-700">{data.latitude.toFixed(2)}, {data.longitude.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Total Crimes" value={data.totalCrimes.toLocaleString()} icon={<Activity className="w-3 h-3" />} color="red" />
            <StatBox label="Risk Score" value={`${data.riskScore}/100`} icon={<Shield className="w-3 h-3" />} color={data.riskScore > 70 ? 'red' : data.riskScore > 40 ? 'amber' : 'emerald'} />
            <StatBox label="Last 30 Days" value={data.last30Days.toLocaleString()} icon={<Clock className="w-3 h-3" />} color="blue" />
            <StatBox label="Last 12 Months" value={data.last12Months.toLocaleString()} icon={<Calendar className="w-3 h-3" />} color="slate" />
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <p className="text-[10px] font-bold text-slate-600 mb-1.5 uppercase">SOS Alerts</p>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div><span className="text-slate-500">Active:</span> <span className="font-bold text-red-600">{data.sosAlerts.active}</span></div>
              <div><span className="text-slate-500">Last SOS:</span> <span className="font-medium text-slate-700">{data.sosAlerts.lastSOS}</span></div>
              <div><span className="text-slate-500">Frequency:</span> <span className="font-medium text-slate-700">{data.sosAlerts.emergencyFrequency}</span></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'crimes' && (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-600 mb-1.5 uppercase">Crime Breakdown</p>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {data.crimeBreakdown.slice(0, 12).map(c => (
                <div key={c.type} className="flex items-center gap-2 text-[10px]">
                  <span className="w-24 truncate text-slate-600">{c.type}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${c.percentage}%` }} />
                  </div>
                  <span className="w-8 text-right font-medium text-slate-700">{c.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-600 mb-1.5 uppercase">Year Trend</p>
            <div className="flex items-end gap-0.5 h-16">
              {data.yearTrend.map(t => {
                const max = Math.max(...data.yearTrend.map(y => y.count));
                const h = max > 0 ? (t.count / max) * 100 : 0;
                return (
                  <div key={t.year} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer" style={{ height: `${h}%`, minHeight: '2px' }} />
                    <span className="text-[7px] text-slate-500">{t.year.toString().slice(2)}</span>
                    <div className="absolute -top-8 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      {t.year}: {t.count.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fir' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Active FIRs" value={data.fir.active} icon={<AlertOctagon className="w-3 h-3" />} color="red" />
            <StatBox label="Pending" value={data.fir.pending} icon={<Clock className="w-3 h-3" />} color="amber" />
            <StatBox label="Solved" value={data.fir.solved} icon={<Shield className="w-3 h-3" />} color="emerald" />
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <p className="text-[10px] font-bold text-slate-600 mb-1">Assigned Officer</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center"><Users className="w-3 h-3 text-blue-600" /></div>
              <span className="text-xs font-medium text-slate-700">{data.fir.officerAssigned}</span>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <p className="text-[10px] font-bold text-slate-600 mb-1">Resolution Rate</p>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.totalCrimes > 0 ? Math.round((data.fir.solved / data.totalCrimes) * 100) : 0}%` }} />
            </div>
            <p className="text-[9px] text-slate-500 mt-1">{data.totalCrimes > 0 ? Math.round((data.fir.solved / data.totalCrimes) * 100) : 0}% solved</p>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-3">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-800">Risk Analysis (relative intensity)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-white/60 rounded p-2">
                <p className="text-[9px] text-blue-600 font-semibold uppercase">Risk Score</p>
                <p className="text-xl font-bold text-blue-900">{data.riskScore}<span className="text-xs">/100</span></p>
              </div>
              <div className="bg-white/60 rounded p-2">
                <p className="text-[9px] text-blue-600 font-semibold uppercase">YoY Change</p>
                <p className={cn("text-xl font-bold", data.yoyChange > 0 ? 'text-red-600' : 'text-emerald-600')}>{data.yoyChange > 0 ? '+' : ''}{data.yoyChange}%</p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
            <p className="text-[10px] font-bold text-amber-700 mb-1">Prediction</p>
            <p className="text-xs text-amber-800">{data.prediction}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-700 mb-1">Recommended Action</p>
            <p className="text-xs text-emerald-800">{data.recommendation}</p>
          </div>
          <button onClick={() => addToast('Officer deployment initiated!', 'success')}
            className="w-full bg-blue-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Deploy Officers
          </button>
        </div>
      )}
    </div>
  );
}

export default function CrimeHotspots() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState({ riskLevel: '', crimeType: '', state: '', district: '', timeRange: 'year' });
  const [search, setSearch] = useState('');
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]);
  const [mapZoom, setMapZoom] = useState(5);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({ 'crime-density': true });
  const [showFilters, setShowFilters] = useState(false);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.riskLevel) p.riskLevel = filters.riskLevel;
    if (filters.crimeType) p.crimeType = filters.crimeType;
    if (filters.state) p.state = filters.state;
    if (filters.district) p.district = filters.district;
    return p;
  }, [filters]);

  const { data, isLoading, isFetching, isError, refetch } = useGetHotspotsQuery(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const hotspots = data?.hotspots ?? [];
  const summary = data?.summary ?? { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };
  const crimeTypes = data?.filters?.crimeTypes ?? [];
  const states = data?.filters?.states ?? [];

  const displayedHotspots = useMemo(() => {
    if (!search) return hotspots;
    const q = search.toUpperCase();
    return hotspots.filter(h => h.district.toUpperCase().includes(q) || h.state.toUpperCase().includes(q) || h.dominantCrimeType.toUpperCase().includes(q));
  }, [hotspots, search]);

  const handleSelectHotspot = useCallback((h: HotspotData) => {
    setSelectedHotspot(h.district);
    setMapCenter([h.latitude, h.longitude]);
    setMapZoom(10);
  }, []);

  const handleExport = useCallback((format: string) => {
    if (format === 'csv') {
      const rows = [['District', 'State', 'Crimes', 'Risk Level', 'Intensity', 'YoY Change', 'Dominant Crime', 'Risk Score']];
      displayedHotspots.forEach(h => rows.push([h.district, h.state, String(h.crimeCount), h.riskLevel, String(h.intensity), String(h.yoyChange), h.dominantCrimeType, String(h.riskScore)]));
      const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'crime-hotspots.csv'; a.click(); URL.revokeObjectURL(url);
      addToast('CSV exported!', 'success');
    } else {
      addToast(`${format.toUpperCase()} export coming soon`, 'info');
    }
  }, [displayedHotspots]);

  const toggleLayer = (id: string) => setActiveLayers(p => ({ ...p, [id]: !p[id] }));

  const avgCenter = useMemo((): [number, number] => {
    if (displayedHotspots.length === 0) return [20.5937, 78.9629];
    const lat = displayedHotspots.reduce((s, h) => s + h.latitude, 0) / displayedHotspots.length;
    const lng = displayedHotspots.reduce((s, h) => s + h.longitude, 0) / displayedHotspots.length;
    return [lat, lng];
  }, [displayedHotspots]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex justify-between items-center mb-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-0.5">District Crime Hotspots</h2>
          <p className="text-xs text-slate-500">District and state level aggregation of the 2001-2012 NCRB dataset - not exact incident locations</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExport={handleExport} />
          <button onClick={() => refetch()} className="bg-blue-600 text-white shadow-sm rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : isError ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-600">Failed to load hotspot data</p>
          <button onClick={() => refetch()} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">Retry</button>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Left Panel */}
          <div className="w-[340px] flex-shrink-0 flex flex-col gap-3 overflow-hidden">
            {/* Summary */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-800">Hotspot Summary</h3>
                <span className="text-[9px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date().toLocaleTimeString()}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                <div><p className="text-lg font-bold text-slate-800">{summary.total}</p><p className="text-[9px] text-slate-500">Total</p></div>
                <div><p className="text-lg font-bold text-red-600">{summary.critical}</p><p className="text-[9px] text-slate-500">Critical</p></div>
                <div><p className="text-lg font-bold text-orange-600">{summary.high}</p><p className="text-[9px] text-slate-500">High</p></div>
                <div><p className="text-lg font-bold text-blue-600">{summary.moderate}</p><p className="text-[9px] text-slate-500">Moderate</p></div>
                <div><p className="text-lg font-bold text-emerald-600">{summary.low}</p><p className="text-[9px] text-slate-500">Low</p></div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex-shrink-0">
              <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <Filter className="w-3.5 h-3.5" /> Filters {showFilters ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
              </button>
              {showFilters && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
                  <SearchBar value={search} onChange={setSearch} placeholder="Search district, state, crime type..." />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={filters.riskLevel} onChange={e => setFilters(p => ({ ...p, riskLevel: e.target.value }))} className="border border-slate-200 rounded px-2 py-1.5 text-[10px] bg-white">
                      <option value="">All Risk Levels</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="moderate">Moderate</option>
                      <option value="low">Low</option>
                    </select>
                    <select value={filters.crimeType} onChange={e => setFilters(p => ({ ...p, crimeType: e.target.value }))} className="border border-slate-200 rounded px-2 py-1.5 text-[10px] bg-white">
                      <option value="">All Crime Types</option>
                      {crimeTypes.slice(0, 15).map(c => <option key={c.type} value={c.type}>{c.type}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={filters.state} onChange={e => setFilters(p => ({ ...p, state: e.target.value }))} className="border border-slate-200 rounded px-2 py-1.5 text-[10px] bg-white">
                      <option value="">All States</option>
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filters.timeRange} onChange={e => setFilters(p => ({ ...p, timeRange: e.target.value }))} className="border border-slate-200 rounded px-2 py-1.5 text-[10px] bg-white">
                      {TIME_RANGES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {(filters.riskLevel || filters.crimeType || filters.state || search) && (
                    <button onClick={() => { setFilters({ riskLevel: '', crimeType: '', state: '', district: '', timeRange: 'year' }); setSearch(''); }} className="text-[10px] text-red-600 hover:text-red-800 font-medium">Clear All Filters</button>
                  )}
                </div>
              )}
            </div>

            {/* Hotspot List */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex-1 overflow-y-auto">
              {displayedHotspots.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">No hotspots match filters</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {displayedHotspots.map((h, i) => {
                    const color = getRiskColor(h.riskLevel);
                    const isSelected = selectedHotspot === h.district;
                    return (
                      <button key={h.id} onClick={() => handleSelectHotspot(h)}
                        className={cn("w-full text-left p-3 hover:bg-slate-50 transition-colors", isSelected && 'bg-blue-50 border-l-2 border-l-blue-500')}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ backgroundColor: color }}>{i + 1}</span>
                            <span className="text-xs font-semibold text-slate-800 truncate">{h.district}</span>
                          </div>
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0",
                            h.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                            h.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
                            h.riskLevel === 'moderate' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          )}>{h.riskLevel}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <span className="flex items-center gap-0.5"><AlertOctagon className="w-2.5 h-2.5" /> {h.crimeCount.toLocaleString()}</span>
                          <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" /> {h.intensity}%</span>
                          <span className="flex items-center gap-0.5"><TrendIcon trend={h.trend} change={h.yoyChange} /> <span className={h.yoyChange > 0 ? 'text-red-500' : h.yoyChange < 0 ? 'text-emerald-500' : 'text-slate-400'}>{h.yoyChange > 0 ? '+' : ''}{h.yoyChange}%</span></span>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">{h.dominantCrimeType}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Map + Detail */}
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="flex-1 relative bg-slate-900 rounded-lg border border-slate-800 overflow-hidden min-h-0">
              {/* Layer Controls */}
              <div className="absolute top-2 left-2 z-[400] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-2 max-h-[280px] overflow-y-auto">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Layers</p>
                <div className="space-y-1">
                  {MAP_LAYERS.map(l => (
                    <button key={l.id} onClick={() => toggleLayer(l.id)}
                      className={cn("flex items-center gap-1.5 w-full px-2 py-1 rounded text-[10px] font-medium transition-colors",
                        activeLayers[l.id] ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:bg-slate-50 border border-transparent')}>
                      {activeLayers[l.id] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      <l.icon className="w-3 h-3" /> {l.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="absolute bottom-2 left-2 z-[400] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-2">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">Risk Level</p>
                {[{ l: 'Critical', c: '#ef4444' }, { l: 'High', c: '#f59e0b' }, { l: 'Moderate', c: '#3b82f6' }, { l: 'Low', c: '#22c55e' }].map(x => (
                  <div key={x.l} className="flex items-center gap-1.5 text-[9px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full border border-slate-200" style={{ backgroundColor: x.c }} /> {x.l}
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div className="absolute top-2 right-2 z-[400] flex flex-col gap-1">
                <button onClick={() => { setMapCenter(avgCenter); setMapZoom(5); setSelectedHotspot(null); }}
                  className="bg-white p-1.5 rounded shadow border border-slate-200 hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-600" /></button>
              </div>

              {isFetching && <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-200 z-[500]"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}

              <MapContainer center={avgCenter} zoom={mapZoom} scrollWheelZoom={true} className="h-full w-full z-0">
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={MAP_TILE_URL} />
                <MapFlyTo center={selectedHotspot ? displayedHotspots.find(h => h.district === selectedHotspot) ? [displayedHotspots.find(h => h.district === selectedHotspot)!.latitude, displayedHotspots.find(h => h.district === selectedHotspot)!.longitude] : avgCenter : avgCenter} zoom={selectedHotspot ? 10 : mapZoom} />
                {displayedHotspots.map(h => {
                  const color = getRiskColor(h.riskLevel);
                  const isSelected = selectedHotspot === h.district;
                  return (
                    <CircleMarker key={`${h.state}-${h.district}`} center={[h.latitude, h.longitude]}
                      radius={isSelected ? Math.max(12, h.intensity / 3) + 4 : Math.max(8, h.intensity / 3)}
                      pathOptions={{ color, fillColor: color, fillOpacity: isSelected ? 0.7 : 0.3, weight: isSelected ? 3 : 1 }}>
                      <CircleMarker center={[h.latitude, h.longitude]} radius={isSelected ? 6 : 4}
                        pathOptions={{ color: 'white', fillColor: color, fillOpacity: 1, weight: 2 }}>
                        <Popup>
                          <div className="text-xs min-w-[160px]">
                            <p className="font-bold mb-1">{h.district}</p>
                            <p className="text-slate-600">Crimes: {h.crimeCount.toLocaleString()}</p>
                            <p className="text-slate-600">Risk: {h.riskLevel} ({h.riskScore}/100)</p>
                            <p className="text-slate-600">Trend: {h.yoyChange > 0 ? '+' : ''}{h.yoyChange}%</p>
                            <p className="text-slate-600">Top Crime: {h.dominantCrimeType}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>

            {/* Detail Panel */}
            {selectedHotspot && (
              <div className="h-[320px] flex-shrink-0 bg-white border border-slate-200 rounded-lg shadow-sm overflow-y-auto p-3">
                <HotspotDetailPanel districtName={selectedHotspot} onBack={() => setSelectedHotspot(null)} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
