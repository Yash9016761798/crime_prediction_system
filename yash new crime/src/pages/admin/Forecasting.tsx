import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Calendar, Download, Loader2, AlertCircle, BarChart2,
  Target, Clock, MapPin, ChevronDown, RefreshCw, FileText, Shield,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { apiFetch } from '../../lib/apiClient';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, Legend, BarChart, Bar, Cell,
} from 'recharts';
import {
  useGetForecastQuery, useGetPredictionHistoryQuery,
} from '../../store/api';

const PERIODS = [
  { value: '7d', label: 'Next 7 Days' },
  { value: '30d', label: 'Next 30 Days' },
  { value: '90d', label: 'Next 90 Days' },
];

const TREND_COLORS: Record<string, string> = {
  increasing: 'text-red-600',
  decreasing: 'text-green-600',
  stable: 'text-blue-600',
};

const TREND_BG: Record<string, string> = {
  increasing: 'bg-red-50 border-red-200',
  decreasing: 'bg-green-50 border-green-200',
  stable: 'bg-blue-50 border-blue-200',
};

export default function Forecasting() {
  const [district, setDistrict] = useState('');
  const [crimeType, setCrimeType] = useState('');
  const [period, setPeriod] = useState('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'projections' | 'history'>('overview');
  const [districts, setDistricts] = useState<string[]>([]);
  const [crimeTypes, setCrimeTypes] = useState<string[]>([]);

  useEffect(() => {
    apiFetch('/references/districts').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) { setDistricts(d); setDistrict(d[0]); } }).catch(() => {});
    apiFetch('/references/crime-types').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) { setCrimeTypes(d); setCrimeType(d[0]); } }).catch(() => {});
  }, []);

  const forecastParams = useMemo(() => ({ district, crimeType, period }), [district, crimeType, period]);
  const historyParams = useMemo(() => ({ district, limit: 30 }), [district]);

  const { data: forecast, isLoading, isFetching, isError, refetch } = useGetForecastQuery(forecastParams, { skip: !district || !crimeType });
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useGetPredictionHistoryQuery(historyParams, { skip: !district });

  const chartData = useMemo(() => {
    if (!forecast) return [];
    const entries: { month: string; actual?: number; predicted?: number; low?: number; high?: number }[] = [];
    forecast.histMonthly?.forEach(h => { entries.push({ month: h.label, actual: h.actual }); });
    forecast.projections?.forEach(p => { entries.push({ month: p.label, predicted: p.predicted, low: p.low, high: p.high }); });
    return entries;
  }, [forecast]);

  const yearlyChartData = useMemo(() => {
    return forecast?.trendData?.map(t => ({ year: String(t.year), count: t.count, predicted: t.predicted })) ?? [];
  }, [forecast]);

  const historyChartData = useMemo(() => {
    return history?.predictions?.slice(0, 10).map(p => ({
      month: p.month,
      forecast: p.forecastedCount,
      actual: p.actualCount,
      accuracy: p.accuracy,
    })).reverse() ?? [];
  }, [history]);

  const handleExport = async () => {
    if (!district || !crimeType) return;
    try {
      const res = await apiFetch(`/forecast/export?district=${encodeURIComponent(district)}&crimeType=${encodeURIComponent(crimeType)}&period=${period}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forecast_${district.replace(/\s+/g, '_')}_${crimeType.replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silent */
    }
  };

  const trendIcon = (t: string) => t === 'increasing' ? <TrendingUp className="w-4 h-4" /> : t === 'decreasing' ? <TrendingDown className="w-4 h-4" /> : <BarChart2 className="w-4 h-4" />;
  const trendLabel = (t: string) => t === 'increasing' ? 'Increasing' : t === 'decreasing' ? 'Decreasing' : 'Stable';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            Crime Forecasting
          </h2>
          <p className="text-sm text-slate-500">Year-on-year trend extrapolation over the 2001-2012 NCRB district dataset (statistical, not machine learning)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={district} onChange={e => setDistrict(e.target.value)} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            {!district && <option value="">Select District</option>}
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={crimeType} onChange={e => setCrimeType(e.target.value)} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            {!crimeType && <option value="">Select Crime</option>}
            {crimeTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => { refetch(); refetchHistory(); }} className="bg-slate-100 text-slate-600 shadow-sm rounded-md px-2 py-1.5 text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleExport} className="bg-blue-600 text-white shadow-sm rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {isLoading || !district || !crimeType ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-600">Failed to load forecast</p>
          <button onClick={() => refetch()} className="mt-3 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded text-xs font-medium hover:bg-red-100">Retry</button>
        </div>
      ) : forecast ? (
        <>
          {isFetching && <div className="h-0.5 bg-blue-200"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}

          <div className="grid grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-50"><Target className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Forecasted Count</p>
                <p className="text-lg font-bold text-slate-800">{forecast.forecastedCount.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">{crimeType} / {PERIODS.find(p => p.value === period)?.label}</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-green-50"><Shield className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Forecast Confidence</p>
                <p className="text-lg font-bold text-green-600">{forecast.confidence}%</p>
                <p className="text-[10px] text-slate-400">Based on patterns</p>
              </div>
            </div>
            <div className={cn("border rounded-md p-3 flex items-center gap-3", TREND_BG[forecast.trendDirection] || 'bg-slate-50 border-slate-200')}>
              <div className={cn("p-2 rounded-md", forecast.trendDirection === 'increasing' ? 'bg-red-100' : forecast.trendDirection === 'decreasing' ? 'bg-green-100' : 'bg-blue-100')}>
                {trendIcon(forecast.trendDirection)}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Trend Direction</p>
                <p className={cn("text-lg font-bold", TREND_COLORS[forecast.trendDirection] || 'text-slate-800')}>{trendLabel(forecast.trendDirection)}</p>
                <p className="text-[10px] text-slate-400">{forecast.percentageChange > 0 ? '+' : ''}{forecast.percentageChange}% change</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-purple-50"><BarChart2 className="w-4 h-4 text-purple-600" /></div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Historical Average</p>
                <p className="text-lg font-bold text-slate-800">{forecast.historicalAverage.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">per year</p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-50"><Clock className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Recent Trend</p>
                <p className="text-lg font-bold text-slate-800">{forecast.recentTrend.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">latest year</p>
              </div>
            </div>
          </div>

          <div className="flex gap-1 border-b border-slate-200">
            {[
              { key: 'overview', label: 'Trend Analysis' },
              { key: 'projections', label: 'Monthly Projections' },
              { key: 'history', label: 'Forecast History' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors", activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">Historical vs Predicted Trends</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Area type="monotone" dataKey="actual" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} name="Historical" dot={{ r: 3 }} />
                        <Area type="monotone" dataKey="high" stroke="transparent" fill="#f59e0b" fillOpacity={0.05} name="Upper Bound" />
                        <Area type="monotone" dataKey="low" stroke="transparent" fill="#f59e0b" fillOpacity={0.05} name="Lower Bound" />
                        <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" name="Predicted" dot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">Yearly Trend</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {yearlyChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.predicted ? '#f59e0b' : '#3b82f6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {forecast.projections && forecast.projections.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">6-Month Forecast</h3>
                    <div className="space-y-2">
                      {forecast.projections.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded px-3 py-2">
                          <span className="font-medium text-slate-700">{p.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{p.low}â€“{p.high}</span>
                            <span className="font-bold text-slate-800">{p.predicted}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {forecast.peakDays && forecast.peakDays.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">Peak Days</h3>
                    <div className="flex flex-wrap gap-2">
                      {forecast.peakDays.map((d, i) => (
                        <span key={i} className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200">{d}</span>
                      ))}
                    </div>
                  </div>
                )}

                {forecast.contributingFactors && forecast.contributingFactors.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">Contributing Factors</h3>
                    <ul className="space-y-2">
                      {forecast.contributingFactors.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'projections' && forecast.projections && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Monthly Crime Projections</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecast.projections}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="predicted" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Predicted" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Projection Details</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-600">Month</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-600">Predicted</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-600">Range</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-600 w-28">Confidence Band</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {forecast.projections.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{p.label}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{p.predicted.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{p.low}â€“{p.high}</td>
                          <td className="px-3 py-2">
                            <div className="w-full h-2 bg-slate-100 rounded-full relative">
                              <div className="absolute h-full bg-amber-200 rounded-full" style={{ left: `${(p.low / (p.high || 1)) * 10}%`, width: `${((p.high - p.low) / (p.high || 1)) * 100}%` }} />
                              <div className="absolute h-full w-1.5 bg-amber-500 rounded-full" style={{ left: `${(p.predicted / (p.high || 1)) * 100}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {forecast.recommendations && (
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">Deployment Recommendations</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Recommended Officers</p>
                      <p className="text-2xl font-bold text-blue-600">{forecast.recommendations.officerCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Patrol Shifts</p>
                      <div className="space-y-1">
                        {forecast.recommendations.patrolShifts.map((s, i) => (
                          <div key={i} className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">{s}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Priority Areas</p>
                      <div className="space-y-1">
                        {forecast.recommendations.priorityAreas.map((a, i) => (
                          <div key={i} className="text-xs text-slate-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{a}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {forecast.recommendations.preventiveMeasures.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Preventive Measures</p>
                      <div className="flex flex-wrap gap-2">
                        {forecast.recommendations.preventiveMeasures.map((m, i) => (
                          <span key={i} className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-800">Forecast History â€” {district}</h3>
                <span className="text-xs text-slate-500">{history?.predictions?.length ?? 0} records</span>
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : historyChartData.length > 0 ? (
                <>
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={historyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="forecast" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Forecasted" />
                        <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Actual" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-600">Month</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-600">Crime Type</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-600">Forecasted</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-600">Actual</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-600">Backtest Accuracy</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-600">Trend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history?.predictions?.map((p, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{p.month}</td>
                            <td className="px-3 py-2 text-slate-600">{p.crimeType}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">{p.forecastedCount}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{p.actualCount ?? 'â€”'}</td>
                            <td className="px-3 py-2 text-right">
                              {p.accuracy != null ? (
                                <span className={cn("font-bold", p.accuracy >= 90 ? 'text-green-600' : p.accuracy >= 75 ? 'text-amber-600' : 'text-red-600')}>{p.accuracy}%</span>
                              ) : 'â€”'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold", TREND_COLORS[p.trendDirection] || 'text-slate-500')}>
                                {trendIcon(p.trendDirection)} {trendLabel(p.trendDirection)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs">No forecast history available</div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}