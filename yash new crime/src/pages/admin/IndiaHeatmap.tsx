import { MAP_TILE_URL } from '../../lib/mapTiles';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download, Filter, Search, ChevronDown, ChevronUp, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, MapPin, Layers, X,
  BarChart3, FileText, Loader2, Eye, EyeOff, Maximize2, Minimize2,
  RefreshCw, Target, Shield, Activity, Zap, Database
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useToast } from '../../components/ToastProvider';
import {
  useGetHeatmapDataQuery,
  useGetHeatmapStateDataQuery,
  useGetHeatmapDistrictDataQuery,
} from '../../store/api';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const INDIA_CENTER: [number, number] = [22.3072, 78.9629];

const LAYERS = [
  { id: 'crime-density', name: 'Crime Density', icon: Target },
  { id: 'risk-scores', name: 'Relative Risk', icon: Shield },
];

const FALLBACK_CRIME_TYPES = [
  'ALL', 'MURDER', 'ATTEMPT TO MURDER', 'CULPABLE HOMICIDE NOT AMOUNTING TO MURDER',
  'RAPE', 'CUSTODIAL RAPE', 'OTHER RAPE', 'KIDNAPPING & ABDUCTION',
  'KIDNAPPING AND ABDUCTION OF WOMEN AND GIRLS', 'KIDNAPPING AND ABDUCTION OF OTHERS',
  'DACOITY', 'PREPARATION AND ASSEMBLY FOR DACOITY', 'ROBBERY', 'BURGLARY',
  'THEFT', 'AUTO THEFT', 'OTHER THEFT', 'RIOTS', 'CRIMINAL BREACH OF TRUST',
  'CHEATING', 'COUNTERFIETING', 'ARSON', 'HURT/GREVIOUS HURT', 'DOWRY DEATHS',
  'ASSAULT ON WOMEN WITH INTENT TO OUTRAGE HER MODESTY', 'INSULT TO MODESTY OF WOMEN',
  'CRUELTY BY HUSBAND OR HIS RELATIVES', 'IMPORTATION OF GIRLS FROM FOREIGN COUNTRIES',
  'CAUSING DEATH BY NEGLIGENCE', 'OTHER IPC CRIMES',
];

function getIntensityColor(intensity: number): string {
  if (intensity > 80) return '#1a1a2e';
  if (intensity > 60) return '#ef4444';
  if (intensity > 40) return '#f59e0b';
  if (intensity > 20) return '#eab308';
  return '#10b981';
}

function getRadius(count: number, maxCount: number): number {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  return Math.max(6, Math.min(35, ratio * 35));
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { animate: true, duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

function Legend() {
  const levels = [
    { label: 'Critical (>80%)', color: '#1a1a2e' },
    { label: 'High (60-80%)', color: '#ef4444' },
    { label: 'Elevated (40-60%)', color: '#f59e0b' },
    { label: 'Moderate (20-40%)', color: '#eab308' },
    { label: 'Low (0-20%)', color: '#10b981' },
  ];
  return (
    <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-3">
      <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Crime Intensity</p>
      <div className="space-y-1">
        {levels.map(l => (
          <div key={l.label} className="flex items-center gap-2 text-[10px]">
            <span className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: l.color }} />
            <span className="text-slate-600">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryBar({ data, isFetching }: { data: any; isFetching: boolean }) {
  if (!data) return null;
  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-6">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">Districts:</span>
        <span className="text-xs text-slate-900 font-bold">{data.summary?.totalDistricts ?? 0}</span>
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-slate-700">States:</span>
        <span className="text-xs text-slate-900 font-bold">{data.summary?.totalStates ?? 0}</span>
      </div>
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-red-600" />
        <span className="text-xs font-semibold text-slate-700">Total Crimes:</span>
        <span className="text-xs text-slate-900 font-bold">{(data.summary?.totalCrimes ?? 0).toLocaleString()}</span>
      </div>
      {isFetching && <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-2" />}
    </div>
  );
}

function FilterBar({ year, setYear, crimeType, setCrimeType, state, setState, statesList, yearOptions, crimeTypeOptions, onExport }: {
  year: number | null; setYear: (v: number | null) => void;
  crimeType: string; setCrimeType: (v: string) => void;
  state: string; setState: (v: string) => void;
  statesList: string[]; yearOptions: number[]; crimeTypeOptions: string[]; onExport: () => void;
}) {
  const [showFilters, setShowFilters] = useState(true);
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="flex items-center gap-2 px-4 py-2">
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">
          <Filter className="w-3.5 h-3.5" /> Filters
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        <div className="flex-1" />
        <button onClick={onExport} className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>
      {showFilters && (
        <div className="flex items-center gap-4 px-4 pb-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Year</label>
            <select value={year ?? ''} onChange={e => setYear(e.target.value ? Number(e.target.value) : null)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white">
              <option value="">All Years</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Crime Type</label>
            <select value={crimeType} onChange={e => setCrimeType(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white">
              {crimeTypeOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
            <select value={state} onChange={e => setState(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white min-w-[150px]">
              <option value="">All States</option>
              {statesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {(year || crimeType !== 'ALL' || state) && (
            <button onClick={() => { setYear(null); setCrimeType('ALL'); setState(''); }} className="text-[10px] text-red-600 hover:text-red-800 font-medium mt-4">
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StateDetailPanel({ stateName, onBack }: { stateName: string; onBack: () => void }) {
  const { data, isLoading, isFetching } = useGetHeatmapStateDataQuery(stateName);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [showAllDistricts, setShowAllDistricts] = useState(false);

  const displayDistricts = useMemo(() => {
    if (!data) return [];
    if (showAllDistricts) return data.districts;
    return data.districts.slice(0, 50);
  }, [data, showAllDistricts]);

  if (isLoading) return <PanelLoading />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{stateName}</h3>
          <p className="text-[10px] text-slate-500">{data?.summary.totalDistricts ?? 0} districts â€¢ {(data?.summary.totalCrimes ?? 0).toLocaleString()} crimes</p>
        </div>
        {isFetching && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total Crimes" value={(data?.summary.totalCrimes ?? 0).toLocaleString()} icon={<Activity className="w-3.5 h-3.5" />} color="red" />
        <StatCard label="Top District" value={data?.summary.topDistrict ?? '-'} icon={<MapPin className="w-3.5 h-3.5" />} color="blue" />
        <StatCard label="Top Crime" value={data?.summary.topCrime ?? '-'} icon={<Shield className="w-3.5 h-3.5" />} color="amber" />
        <StatCard label="Districts" value={String(data?.summary.totalDistricts ?? 0)} icon={<Database className="w-3.5 h-3.5" />} color="emerald" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-700">District Crime Data</h4>
          {data && data.districts.length > 50 && (
            <button onClick={() => setShowAllDistricts(!showAllDistricts)} className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
              {showAllDistricts ? 'Show Less' : `Show All (${data.districts.length})`}
            </button>
          )}
        </div>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {displayDistricts.map((d: any, i: number) => (
            <button key={d.district} onClick={() => setSelectedDistrict(selectedDistrict === d.district ? null : d.district)}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors flex items-center gap-2 ${selectedDistrict === d.district ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: getIntensityColor(d.intensity) }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{d.district}</p>
                <p className="text-[9px] text-slate-500">{d.crimeCount.toLocaleString()} crimes â€¢ {d.topCrime}</p>
              </div>
              <span className={`text-[9px] font-medium ${d.yearOverYearChange > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {d.yearOverYearChange > 0 ? '+' : ''}{d.yearOverYearChange}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedDistrict && <DistrictDetailInline districtName={selectedDistrict} />}
    </div>
  );
}

function DistrictDetailInline({ districtName }: { districtName: string }) {
  const { data, isLoading } = useGetHeatmapDistrictDataQuery(districtName);
  if (isLoading) return <PanelLoading />;
  if (!data) return null;

  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800">{data.district}</h4>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.yearOverYearChange > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {data.yearOverYearChange > 0 ? 'â†‘' : 'â†“'} {Math.abs(data.yearOverYearChange)}% YoY
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total Crimes" value={data.totalCrimes.toLocaleString()} icon={<Activity className="w-3 h-3" />} color="red" size="sm" />
        <StatCard label="Risk Score" value={`${data.riskScore}/100`} icon={<Shield className="w-3 h-3" />} color={data.riskScore > 70 ? 'red' : data.riskScore > 40 ? 'amber' : 'emerald'} size="sm" />
      </div>

      {data.crimeBreakdown.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 mb-1">Crime Breakdown</p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {data.crimeBreakdown.slice(0, 10).map((c: any) => (
              <div key={c.type} className="flex items-center gap-2 text-[10px]">
                <span className="w-16 truncate text-slate-600">{c.type}</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.percentage}%` }} />
                </div>
                <span className="w-8 text-right font-medium text-slate-700">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.yearTrend.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 mb-1">Year Trend</p>
          <div className="flex items-end gap-0.5 h-12">
            {data.yearTrend.map((t: any) => {
              const max = Math.max(...data.yearTrend.map((y: any) => y.count));
              const h = max > 0 ? (t.count / max) * 100 : 0;
              return (
                <div key={t.year} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, minHeight: '2px' }} />
                  <span className="text-[7px] text-slate-500">{t.year.toString().slice(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, size = 'md' }: {
  label: string; value: string; icon: React.ReactNode; color: string; size?: 'sm' | 'md';
}) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-600 border-red-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };
  return (
    <div className={`${colorMap[color] ?? colorMap.slate} border rounded-lg ${size === 'sm' ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className={`${size === 'sm' ? 'text-[9px]' : 'text-[10px]'} font-semibold uppercase tracking-wider`}>{label}</span>
      </div>
      <p className={`${size === 'sm' ? 'text-sm' : 'text-base'} font-bold`}>{value}</p>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
    </div>
  );
}

function SearchBar({ onSearch }: { onSearch: (v: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input value={val} onChange={e => { setVal(e.target.value); onSearch(e.target.value); }}
        placeholder="Search state or district..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
      {val && <button onClick={() => { setVal(''); onSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
    </div>
  );
}

function AnalyticsPanel({ data }: { data: any }) {
  if (!data) return null;
  const topStates = data.states?.slice(0, 5) ?? [];
  const topDistricts = data.districts?.slice(0, 5) ?? [];
  const districtsForStats = data.districts ?? [];
  const avgIntensity = districtsForStats.length > 0
    ? Math.round(districtsForStats.reduce((s: number, d: any) => s + (d.intensity || 0), 0) / districtsForStats.length)
    : 0;
  const highIntensityCount = districtsForStats.filter((d: any) => d.intensity > 60).length;
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Top 5 States</h4>
      <div className="space-y-1.5">
        {topStates.map((s: any, i: number) => {
          const max = topStates[0]?.crimeCount ?? 1;
          return (
            <div key={s.state} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-700 font-medium">{i + 1}. {s.state}</span>
                <span className="text-slate-500">{s.crimeCount.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(s.crimeCount / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider pt-2">Top 5 Districts</h4>
      <div className="space-y-1.5">
        {topDistricts.map((d: any, i: number) => {
          const max = topDistricts[0]?.crimeCount ?? 1;
          return (
            <div key={d.district} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-700 font-medium truncate">{i + 1}. {d.district}</span>
                <span className="text-slate-500 flex-shrink-0">{d.crimeCount.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(d.crimeCount / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          <span className="text-[10px] font-bold text-slate-700">Risk Assessment</span>
        </div>
        <p className="text-[10px] text-slate-600">Avg Intensity: <span className="font-bold text-amber-600">{avgIntensity}/100</span></p>
        <p className="text-[10px] text-slate-600">High Intensity Districts: <span className="font-bold text-red-600">{highIntensityCount}</span></p>
        <p className="text-[9px] text-slate-400 mt-1">Relative share of the district&apos;s total recorded crime, not a probability.</p>
      </div>
    </div>
  );
}

export default function IndiaHeatmap() {
  const { addToast } = useToast();
  const [year, setYear] = useState<number | null>(null);
  const [crimeType, setCrimeType] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('');
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({ 'crime-density': true, 'risk-scores': false });
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(INDIA_CENTER);
  const [mapZoom, setMapZoom] = useState(6);
  const [expanded, setExpanded] = useState(false);

  const queryParams = useMemo(() => ({
    year: year ?? undefined,
    crimeType: crimeType !== 'ALL' ? crimeType : undefined,
    state: stateFilter || undefined,
  }), [year, crimeType, stateFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useGetHeatmapDataQuery(queryParams);
  const statesList = useMemo(() => [...(data?.filters?.states ?? [])].sort(), [data]);
  const yearOptions = useMemo(
    () => [...(data?.filters?.years ?? [])].sort((a: number, b: number) => b - a),
    [data],
  );
  const crimeTypeOptions = useMemo(() => {
    const fromApi = (data?.filters?.crimeTypes ?? []) as string[];
    return fromApi.length > 0 ? ['ALL', ...fromApi] : FALLBACK_CRIME_TYPES;
  }, [data]);

  const districtsToShow = useMemo(() => {
    const sorted = (data?.districts ?? []).slice().sort((a: any, b: any) => b.crimeCount - a.crimeCount);
    return sorted.slice(0, 200);
  }, [data]);

  const maxCrimeCount = useMemo(() => districtsToShow.length > 0 ? districtsToShow[0].crimeCount : 1, [districtsToShow]);

  const handleStateClick = useCallback((stateName: string) => {
    setSelectedState(stateName);
    const stateData = data?.states?.find((s: any) => s.state === stateName);
    if (stateData) {
      setMapCenter([stateData.latitude, stateData.longitude]);
      setMapZoom(8);
    }
  }, [data]);

  const handleExport = useCallback(() => {
    if (!data) return;
    const rows = [['State', 'District', 'Latitude', 'Longitude', 'Crime Count', 'Intensity', 'Top Crime']];
    data.districts.forEach((d: any) => {
      rows.push([d.state, d.district, String(d.latitude), String(d.longitude), String(d.crimeCount), String(d.intensity), d.topCrime]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crime-heatmap-${year ?? 'all'}-${crimeType}-${stateFilter || 'india'}.csv`;
    a.click(); URL.revokeObjectURL(url);
    addToast('Map data exported successfully!', 'success');
  }, [data, year, crimeType, stateFilter]);

  const toggleLayer = (id: string) => {
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className={`flex flex-col ${expanded ? 'fixed inset-0 z-50 bg-slate-100' : 'h-full min-h-[calc(100vh-12rem)]'}`}>
      <SummaryBar data={data} isFetching={isFetching} />
      <p className="px-4 py-1 text-[10px] text-slate-400 bg-slate-50 border-b border-slate-200">
        District and state level aggregates of the 2001-2012 NCRB dataset. Coordinates are district centroids, not incident locations.
      </p>
      <FilterBar year={year} setYear={setYear} crimeType={crimeType} setCrimeType={setCrimeType} state={stateFilter} setState={setStateFilter} statesList={statesList} yearOptions={yearOptions} crimeTypeOptions={crimeTypeOptions} onExport={handleExport} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="h-full flex items-center justify-center bg-slate-50">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="h-full flex flex-col items-center justify-center bg-slate-50">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-sm text-red-600 font-medium">Failed to load heatmap data</p>
              <button onClick={() => refetch()} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">Retry</button>
            </div>
          ) : (
            <>
              <div className="absolute top-2 right-2 z-[400] flex flex-col gap-1">
                <button onClick={() => setExpanded(!expanded)} className="bg-white p-1.5 rounded shadow border border-slate-200 hover:bg-slate-50">
                  {expanded ? <Minimize2 className="w-3.5 h-3.5 text-slate-600" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-600" />}
                </button>
                <button onClick={() => { setMapCenter(INDIA_CENTER); setMapZoom(6); setSelectedState(null); }} className="bg-white p-1.5 rounded shadow border border-slate-200 hover:bg-slate-50">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>

              <div className="absolute top-2 left-2 z-[400] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-2">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Layers</p>
                <div className="space-y-1">
                  {LAYERS.map(l => (
                    <button key={l.id} onClick={() => toggleLayer(l.id)}
                      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-[10px] font-medium transition-colors ${activeLayers[l.id] ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:bg-slate-50 border border-transparent'}`}>
                      {activeLayers[l.id] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      <l.icon className="w-3 h-3" />
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>

              <Legend />

              <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} className="h-full w-full z-0">
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={MAP_TILE_URL} />
                <MapController center={mapCenter} zoom={mapZoom} />
                {activeLayers['crime-density'] && districtsToShow.map((d: any) => (
                  <CircleMarker key={`${d.state}-${d.district}`} center={[d.latitude, d.longitude]}
                    radius={getRadius(d.crimeCount, maxCrimeCount)}
                    pathOptions={{ color: getIntensityColor(d.intensity), fillColor: getIntensityColor(d.intensity), fillOpacity: 0.6, weight: 1 }}
                    eventHandlers={{ click: () => handleStateClick(d.state) }}>
                    <Popup>
                      <div className="text-[11px] min-w-[180px]">
                        <p className="font-bold text-slate-800 mb-1">{d.district}</p>
                        <p className="text-slate-600">State: {d.state}</p>
                        <p className="text-slate-600">Crimes: {d.crimeCount.toLocaleString()}</p>
                        <p className="text-slate-600">Top Crime: {d.topCrime}</p>
                        <p className="text-slate-600">Intensity: {d.intensity}%</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
                {activeLayers['risk-scores'] && districtsToShow.slice(0, 100).map((d: any) => {
                  const risk = d.intensity;
                  const color = risk > 70 ? '#ef4444' : risk > 40 ? '#f59e0b' : '#10b981';
                  return (
                    <CircleMarker key={`risk-${d.state}-${d.district}`} center={[d.latitude, d.longitude]} radius={18}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 2, dashArray: '4 4' }}>
                      <Popup><div className="text-[11px]"><p className="font-bold">Risk: {risk}%</p><p>{d.district}, {d.state}</p></div></Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </>
          )}
        </div>

        <div className="w-[320px] border-l border-slate-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-slate-200">
            <SearchBar onSearch={(v) => { if (v) { const match = statesList.find(s => s.toUpperCase().includes(v.toUpperCase())); if (match) handleStateClick(match); } else { setSelectedState(null); setMapCenter(INDIA_CENTER); setMapZoom(6); } }} />
          </div>

          {selectedState ? (
            <div className="p-3">
              <StateDetailPanel stateName={selectedState} onBack={() => { setSelectedState(null); setMapCenter(INDIA_CENTER); setMapZoom(6); }} />
            </div>
          ) : (
            <div className="p-3">
              <AnalyticsPanel data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
