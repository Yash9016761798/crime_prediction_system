import { useState, useMemo, useEffect } from 'react';
import {
  BrainCircuit, TrendingUp, AlertTriangle, Loader2, AlertCircle, ChevronRight,
  BarChart3, Shield, Target, Zap, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import {
  useGetPredictionStatsQuery,
  useGetForecastQuery,
  useGetAllDistrictsForecastQuery,
  useGetRiskScoreQuery,
  useGetDeploymentRecommendationsQuery,
  useGetPredictionHistoryQuery,
} from '../../store/api';
import { AIPredictionSummary } from '../../components/dashboard/Insights';
import { apiFetch } from '../../lib/apiClient';

const TREND_COLORS: Record<string, string> = {
  increasing: 'text-red-600',
  decreasing: 'text-green-600',
  stable: 'text-slate-500',
};

const TREND_ICONS: Record<string, string> = {
  increasing: '\u25B2',
  decreasing: '\u25BC',
  stable: '\u2014',
};

const TREND_LABELS: Record<string, string> = {
  increasing: 'High Increase',
  decreasing: 'Decreasing',
  stable: 'Stable',
};

const RISK_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

export default function AIPredictionCenter() {
  const [period, setPeriod] = useState('30d');
  const [districts, setDistricts] = useState<string[]>([]);
  const [crimeTypes, setCrimeTypes] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [crimeType, setCrimeType] = useState('');
  const [activeTab, setActiveTab] = useState<'forecast' | 'districts' | 'deployment' | 'history'>('forecast');

  useEffect(() => {
    apiFetch('/references/districts')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length) {
          setDistricts(d);
          setSelectedDistrict(prev => (prev && d.includes(prev) ? prev : d[0]));
        }
      })
      .catch(() => {});
    apiFetch('/references/crime-types')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length) {
          setCrimeTypes(d);
          setCrimeType(prev => (prev && d.includes(prev) ? prev : 'THEFT'));
        }
      })
      .catch(() => {});
  }, []);

  const forecastParams = useMemo(() => ({
    district: selectedDistrict,
    crimeType,
    period,
  }), [selectedDistrict, crimeType, period]);

  const riskParams = useMemo(() => ({ district: selectedDistrict }), [selectedDistrict]);
  const historyParams = useMemo(() => ({ district: selectedDistrict, crimeType, limit: 10 }), [selectedDistrict, crimeType]);
  const allDistrictsParams = useMemo(() => ({ crimeType, period }), [crimeType, period]);
  const deploymentParams = useMemo(() => ({ district: selectedDistrict }), [selectedDistrict]);

  const { data: stats } = useGetPredictionStatsQuery();
  const { data: forecast, isLoading: forecastLoading, isError: forecastError, refetch: refetchForecast } = useGetForecastQuery(forecastParams, { skip: !selectedDistrict || !crimeType });
  const { data: allDistricts, isLoading: allDistrictsLoading } = useGetAllDistrictsForecastQuery(allDistrictsParams, { skip: !crimeType });
  const { data: riskScore } = useGetRiskScoreQuery(riskParams, { skip: !selectedDistrict });
  const { data: deployment } = useGetDeploymentRecommendationsQuery(deploymentParams, { skip: !selectedDistrict });
  const { data: history, isLoading: historyLoading } = useGetPredictionHistoryQuery(historyParams, { skip: !selectedDistrict || !crimeType });

  const predictions = history?.predictions ?? [];
  const trendData = forecast?.trendData ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-purple-600" />
            Crime Prediction Center
          </h2>
          <p className="text-sm text-slate-500">Statistical forecasts and relative risk assessment computed from the 2001-2012 NCRB district dataset</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">Model: 3-year moving average (backtest)</span>
          <select value={crimeType} onChange={e => setCrimeType(e.target.value)} className="bg-white border border-slate-200 shadow-sm text-slate-700 text-xs rounded-md px-2 py-1.5 outline-none focus:border-blue-500">
            {!crimeType && <option value="">Select crime type</option>}
            {crimeTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="bg-white border border-slate-200 shadow-sm text-slate-700 text-xs rounded-md px-2 py-1.5 outline-none focus:border-blue-500">
            <option value="7d">Next 7 Days</option>
            <option value="30d">Next 30 Days</option>
            <option value="90d">Next 90 Days</option>
          </select>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Predictions', value: stats.totalPredictions, icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'High Risk Districts', value: stats.highRiskDistricts, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Avg Confidence', value: `${stats.avgConfidence}%`, icon: Shield, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Backtest Accuracy', value: `${stats.modelAccuracy}%`, icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Crime Types', value: stats.totalCrimeTypes, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
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

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'forecast', label: 'Forecast', icon: TrendingUp },
          { key: 'districts', label: 'All Districts', icon: BarChart3 },
          { key: 'deployment', label: 'Deployment', icon: Shield },
          { key: 'history', label: 'History', icon: AlertCircle },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={cn("flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors", activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
        <div className="md:col-span-2 space-y-4">
          {activeTab === 'forecast' && (
            <>
              <div className="bg-white border border-slate-200 rounded-md shadow-sm p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-5 opacity-5 pointer-events-none">
                  <BrainCircuit className="w-28 h-28" />
                </div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Forecast for {selectedDistrict} - {crimeType}</h3>
                  <select value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {!selectedDistrict && <option value="">Select District</option>}
                    {districts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {forecastLoading ? (
                  <div className="py-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : forecastError ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                    <p className="text-xs text-red-600">Failed to load prediction data</p>
                    <button onClick={() => refetchForecast()} className="mt-2 bg-red-50 border border-red-200 text-red-600 px-3 py-1 rounded text-xs font-medium hover:bg-red-100">Retry</button>
                  </div>
                ) : forecast ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Forecasted Count</p>
                        <p className="text-2xl font-bold text-slate-800">{forecast.forecastedCount}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Confidence</p>
                        <p className="text-2xl font-bold text-blue-600">{forecast.confidence}%</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Trend</p>
                        <p className={cn("text-lg font-bold flex items-center gap-1", TREND_COLORS[forecast.trendDirection] || 'text-slate-500')}>
                          {TREND_ICONS[forecast.trendDirection] || '\u2014'} {TREND_LABELS[forecast.trendDirection] || forecast.trendDirection}
                        </p>
                      </div>
                    </div>

                    {trendData.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-bold text-slate-700 mb-2">Historical Trend & Forecast</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                          <Line type="monotone" dataKey="predicted" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#ef4444' }} connectNulls={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <p className="text-[10px] text-blue-600 uppercase font-bold mb-1">Recommendations</p>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                        <div>Deploy {forecast.recommendations.officerCount} officers</div>
                        <div>Priority: {forecast.recommendations.priorityAreas.join(', ')}</div>
                        <div>Shifts: {forecast.recommendations.patrolShifts.join(', ')}</div>
                        <div>Measures: {forecast.recommendations.preventiveMeasures.join(', ')}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 flex items-center justify-center text-slate-400 text-xs">Select a district to view forecast</div>
                )}
              </div>
            </>
          )}

          {activeTab === 'districts' && (
            <div className="bg-white border border-slate-200 rounded-md shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-800">District Forecasts - {crimeType}</h3>
                <span className="text-xs text-slate-500">{allDistricts?.predictions?.length || 0} districts</span>
              </div>
              {allDistrictsLoading ? (
                <div className="py-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : allDistricts?.predictions ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">District</th>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">Historical Avg</th>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">Recent Trend</th>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">Forecast</th>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">Change</th>
                        <th className="px-4 py-3 font-bold border-b border-slate-200">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allDistricts.predictions.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50" onClick={() => { setSelectedDistrict(p.district); setActiveTab('forecast'); }}>
                          <td className="px-4 py-3 font-medium text-slate-800 cursor-pointer hover:text-blue-600">{p.district}</td>
                          <td className="px-4 py-3 text-slate-600">{p.historicalAverage}</td>
                          <td className="px-4 py-3 text-slate-600">{p.recentTrend}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{p.forecastedCount}</td>
                          <td className={cn("px-4 py-3 font-semibold text-xs", p.percentageChange > 0 ? 'text-red-600' : p.percentageChange < 0 ? 'text-green-600' : 'text-slate-500')}>
                            {p.percentageChange > 0 ? '+' : ''}{p.percentageChange}%
                          </td>
                          <td className={cn("px-4 py-3 font-semibold text-xs uppercase", TREND_COLORS[p.trendDirection] || 'text-slate-500')}>
                            {TREND_ICONS[p.trendDirection] || '\u2014'} {TREND_LABELS[p.trendDirection] || p.trendDirection}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {allDistricts?.predictions && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">Forecast Distribution</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={allDistricts.predictions}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="district" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="forecastedCount" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        {allDistricts.predictions.map((entry, i) => (
                          <Cell key={i} fill={entry.percentageChange > 10 ? '#ef4444' : entry.percentageChange > 0 ? '#f59e0b' : '#22c55e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {activeTab === 'deployment' && deployment && (
            <div className="bg-white border border-slate-200 rounded-md shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Deployment Recommendations - {selectedDistrict}</h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{deployment.recommendedOfficers}</p>
                  <p className="text-[10px] text-blue-600 uppercase font-bold">Recommended Officers</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{deployment.shifts.length}</p>
                  <p className="text-[10px] text-green-600 uppercase font-bold">Shifts</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{deployment.checkpoints.length}</p>
                  <p className="text-[10px] text-purple-600 uppercase font-bold">Checkpoints</p>
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Shift Allocation</h4>
                <div className="space-y-2">
                  {deployment.shifts.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-600 w-32">{s.time}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                        <div className={cn("h-full rounded-full flex items-center justify-end pr-2 text-[9px] text-white font-bold", s.priority === 'critical' ? 'bg-red-500' : s.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500')} style={{ width: `${(s.officers / deployment.recommendedOfficers) * 100}%` }}>
                          {s.officers}
                        </div>
                      </div>
                      <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", s.priority === 'critical' ? 'bg-red-100 text-red-700' : s.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        {s.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Patrol Routes & Checkpoints</h4>
                <div className="grid grid-cols-2 gap-3">
                  {deployment.patrolRoutes.map((r, i) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs font-bold text-slate-800">{r.name}</p>
                      <p className="text-[10px] text-slate-500">{r.coordinates.length} waypoints</p>
                      <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded mt-1 inline-block", r.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>
                        {r.priority}
                      </span>
                    </div>
                  ))}
                  {deployment.checkpoints.map((c, i) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                      <p className="text-xs font-bold text-slate-800">{c.name}</p>
                      <p className="text-[10px] text-slate-500">{c.frequency}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-md shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Prediction History</h3>
              {historyLoading ? (
                <div className="py-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : predictions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No prediction history available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                      <tr>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">District</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Crime Type</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Month</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Forecasted</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Actual</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Backtest Accuracy</th>
                        <th className="px-3 py-3 font-bold border-b border-slate-200">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {predictions.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-3 font-medium text-slate-800">{p.district}</td>
                          <td className="px-3 py-3 text-slate-600">{p.crimeType}</td>
                          <td className="px-3 py-3 text-slate-600">{p.month}</td>
                          <td className="px-3 py-3 font-semibold text-slate-800">{p.forecastedCount}</td>
                          <td className="px-3 py-3 text-slate-600">{p.actualCount ?? '--'}</td>
                          <td className={cn("px-3 py-3 font-semibold text-xs", p.accuracy && p.accuracy >= 90 ? 'text-green-600' : p.accuracy ? 'text-amber-600' : 'text-slate-400')}>
                            {p.accuracy ? `${p.accuracy}%` : '--'}
                          </td>
                          <td className={cn("px-3 py-3 font-semibold text-xs uppercase", TREND_COLORS[p.trendDirection] || 'text-slate-500')}>
                            {TREND_ICONS[p.trendDirection] || '\u2014'} {TREND_LABELS[p.trendDirection] || p.trendDirection}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-1 space-y-4">
          <AIPredictionSummary />

          {riskScore && (
            <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Risk Score - {selectedDistrict}</h3>
              <div className="text-center mb-3">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                    <circle cx="48" cy="48" r="40" stroke={RISK_COLORS[riskScore.level]} strokeWidth="8" fill="none" strokeDasharray={`${(riskScore.score / 100) * 251} 251`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute">
                    <p className="text-2xl font-bold text-slate-800">{riskScore.score}</p>
                    <p className="text-[9px] text-slate-500 uppercase">Risk</p>
                  </div>
                </div>
              </div>
              <div className="text-center mb-3">
                <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", riskScore.level === 'high' ? 'bg-red-100 text-red-700' : riskScore.level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                  {riskScore.level} risk
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">YoY Change</span><span className={cn("font-semibold", (riskScore.yearOverYearChange ?? 0) > 0 ? 'text-red-600' : 'text-green-600')}>{(riskScore.yearOverYearChange ?? 0) > 0 ? '+' : ''}{riskScore.yearOverYearChange ?? 0}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Recent Incidents</span><span className="font-semibold text-slate-800">{riskScore.recentIncidents}</span></div>
              </div>
              {riskScore.topCrimes && riskScore.topCrimes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Top Crimes</p>
                  {riskScore.topCrimes.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-600">{c.type}</span>
                      <span className="font-semibold text-slate-800">{c.percentage}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {forecast && (
            <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
              <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Key Insights</h3>
              <ul className="text-xs text-slate-600 space-y-2">
                {forecast.contributingFactors.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}