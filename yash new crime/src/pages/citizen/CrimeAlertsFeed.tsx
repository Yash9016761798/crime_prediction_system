import { useMemo, useState } from 'react';
import { MapPin, Filter, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useGetHotspotsQuery } from '../../store/api';

const FILTERS = ['All', 'Theft', 'Assault', 'Robbery', 'Other'] as const;

const TONE: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'bg-red-100 text-red-600' },
  high: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'bg-orange-100 text-orange-600' },
  moderate: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: 'bg-yellow-100 text-yellow-600' },
  low: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'bg-blue-100 text-blue-600' },
};

function relativeTime(iso?: string) {
  if (!iso) return 'just now';
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) return 'just now';
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function matchesFilter(kind: string, text: string) {
  const t = text.toLowerCase();
  if (kind === 'All') return true;
  if (kind === 'Other') {
    return !['theft', 'assault', 'robbery'].some(k => t.includes(k));
  }
  return t.includes(kind.toLowerCase());
}

export default function CrimeAlertsFeed() {
  const { addToast } = useToast();
  const [filter, setFilter] = useState<string>('All');
  const { data, isLoading, isError, refetch, isFetching } = useGetHotspotsQuery();

  const alerts = useMemo(() => {
    const hotspots = data?.hotspots ?? [];
    return hotspots
      .slice()
      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0) || (b.crimeCount ?? 0) - (a.crimeCount ?? 0))
      .slice(0, 12)
      .map(h => {
        const haystack = [h.dominantCrimeType, ...(h.topCrimes ?? []).map(c => c.type)].join(' ');
        return { h, haystack };
      })
      .filter(({ haystack }) => matchesFilter(filter, haystack));
  }, [data, filter]);

  const refreshedAt = relativeTime(data?.detectedAt);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Local Crime Alerts</h3>
          <p className="text-sm text-slate-500 mt-1">
            Highest-risk districts &bull; analysis refreshed {refreshedAt}
          </p>
        </div>
        <button
          onClick={() => { refetch(); addToast('Refreshing hotspot analysis…', 'info'); }}
          className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded hover:bg-slate-200"
          aria-label="Refresh alerts"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2 p-4 border-b border-slate-100 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            onClick={() => setFilter(f)}
            key={f}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
              filter === f
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading hotspot analysis…
          </div>
        )}

        {isError && (
          <div className="text-center py-10">
            <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-3">Could not load alerts.</p>
            <button onClick={() => refetch()} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && alerts.length === 0 && (
          <div className="text-center py-10">
            <Filter className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hotspots match this filter.</p>
          </div>
        )}

        {!isLoading && !isError && alerts.map(({ h }) => {
          const tone = TONE[h.riskLevel] ?? TONE.moderate;
          return (
            <div key={h.id} className={`rounded-lg border ${tone.border} ${tone.bg} p-4`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tone.icon.split(' ')[1].replace('text-', 'bg-')}`}></span>
                  <h4 className={`text-sm font-bold ${tone.text}`}>{h.dominantCrimeType}</h4>
                </div>
                <span className="text-[10px] font-medium text-slate-500 bg-white/50 px-2 py-0.5 rounded border border-slate-200/50">
                  {h.riskLevel} risk
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600 flex items-center gap-1 mb-2">
                <MapPin className="w-3 h-3" /> {h.district}, {h.state}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed bg-white/50 p-2 rounded border border-slate-200/50">
                {h.crimeCount.toLocaleString('en-IN')} recorded cases ({h.trend}, {h.yoyChange > 0 ? '+' : ''}
                {h.yoyChange}% YoY). {h.prediction}.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
