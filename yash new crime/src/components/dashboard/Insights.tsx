import { cn } from '../../lib/utils';
import { ChevronRight } from 'lucide-react';
import { useGetDashboardDistrictAnalysisQuery } from '../../store/api';

const BAR_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-blue-500'];

function maxCount(items: Array<{ count: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.count), 0);
}

export function TopDistricts() {
  const { data, isLoading, isError } = useGetDashboardDistrictAnalysisQuery();
  const districts = Array.isArray(data) ? data : [];
  const maxVal = maxCount(districts);
  const top5 = districts.slice(0, 5);

  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-6">Top Districts (By Crime Rate)</h3>
      {isLoading ? (
        <div className="flex-1 space-y-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-5 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center text-red-500 text-xs">Failed to load</div>
      ) : top5.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No data available</div>
      ) : (
        <div className="flex-1 flex flex-col justify-center space-y-4">
          {top5.map((d: any, i: number) => {
            const widthPct = maxVal > 0 ? Math.max(5, (d.count / maxVal) * 100) : 0;
            return (
              <div key={d.district} className="flex items-center text-sm">
                <span className="w-4 text-slate-400 text-xs">{i + 1}</span>
                <span className="w-24 text-slate-700 font-medium">{d.district}</span>
                <div className="flex-1 mx-3 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className={cn("h-full rounded-full", BAR_COLORS[i])} style={{ width: `${widthPct}%` }} />
                </div>
                <span className="w-14 text-right text-slate-600 font-medium text-xs">{d.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AIPredictionSummary() {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm relative overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          Prediction Summary
        </h3>
        <select className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded px-2 py-1 outline-none focus:border-blue-500">
          <option>This Week</option>
          <option>Next Week</option>
        </select>
      </div>

      <div className="flex gap-6 flex-1">
        <div className="flex-1">
          <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-wider font-semibold">High Risk Areas</p>
          <div className="space-y-3">
            {[
              { name: 'Central District', risk: '72%', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
              { name: 'South District', risk: '65%', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
              { name: 'West District', risk: '58%', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' }
            ].map((area, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-medium">{i + 1}. {area.name}</span>
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", area.color, area.bg)}>
                  {area.risk}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-px bg-slate-200 my-2" />

        <div className="flex-1 flex flex-col">
          <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-wider font-semibold">Prediction Insight</p>
          <p className="text-sm text-slate-700 leading-relaxed">
            Theft cases are likely to <span className="text-red-600 font-bold">increase by 18%</span> in Central District next week due to upcoming festivals.
          </p>
          <button className="mt-auto w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1">
            View Full Prediction
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
