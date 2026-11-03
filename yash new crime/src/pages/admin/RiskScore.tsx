import { useState, useMemo } from 'react';
import {
  ShieldAlert, TrendingUp, TrendingDown, BarChart2, Filter, Loader2, AlertCircle,
  AlertTriangle, MapPin, Users, ArrowUpRight, ArrowDownRight, Minus, Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  useGetRiskScoreQuery,
  useGetRiskDistrictsQuery,
  useGetRiskAllQuery,
  useGetRiskHistoryQuery,
  useGetDeploymentRecommendationsQuery,
} from '../../store/api';

const LEVEL_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const LEVEL_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#22c55e',
};

const PIE_COLORS = ['#ef4444', '#f97316', '#3b82f6', '#22c55e'];

export default function RiskScore() {
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'all' | 'history' | 'deployment'>('overview');

  const { data: riskDistricts } = useGetRiskDistrictsQuery();
  const { data: allRisk, isLoading: allLoading } = useGetRiskAllQuery();

  const defaultDistrict = useMemo(() => {
    if (selectedDistrict) return selectedDistrict;
    if (riskDistricts?.districts?.length) return riskDistricts.districts[0].district;
    return '';
  }, [selectedDistrict, riskDistricts]);

  const riskParams = useMemo(() => ({ district: defaultDistrict }), [defaultDistrict]);
  const deployParams = useMemo(() => ({ district: defaultDistrict, date: new Date().toISOString().slice(0, 10) }), [defaultDistrict]);
  const historyParams = useMemo(() => ({ district: defaultDistrict }), [defaultDistrict]);

  const { data: risk, isLoading: riskLoading, isError: riskError, refetch } = useGetRiskScoreQuery(riskParams, { skip: !defaultDistrict });
  const { data: deploy, isLoading: deployLoading } = useGetDeploymentRecommendationsQuery(deployParams, { skip: !defaultDistrict });
  const { data: riskHistory } = useGetRiskHistoryQuery(historyParams, { skip: !defaultDistrict || activeTab !== 'history' });

  const isLoading = riskLoading || allLoading;
  const riskLevel = risk?.level ?? 'medium';
  const filteredDistricts = useMemo(() => {
    if (!allRisk?.districts) return [];
    if (!levelFilter) return allRisk.districts;
    return allRisk.districts.filter(d => d.level === levelFilter);
  }, [allRisk, levelFilter]);

  const riskPieData = allRisk?.summary ? [
    { name: 'Critical', value: allRisk.summary.critical },
    { name: 'High', value: allRisk.summary.high },
    { name: 'Medium', value: allRisk.summary.medium },
    { name: 'Low', value: allRisk.summary.low },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Risk Score Analysis
          </h2>
          <p className="text-sm text-slate-500">Relative risk indices computed from year-on-year change in the 2001-2012 NCRB district dataset</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-2 py-1.5 text-xs outline-none focus:border-blue-500">
            <option value="">All Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={() => refetch()} className="bg-blue-600 text-white shadow-sm rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {allRisk?.summary && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Districts', value: allRisk.summary.totalDistricts, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Critical Risk', value: allRisk.summary.critical, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'High Risk', value: allRisk.summary.high, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Avg Score', value: allRisk.summary.avgScore, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Highest Risk', value: allRisk.summary.highestRisk?.score ?? '--', color: 'text-red-600', bg: 'bg-red-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className={cn("p-2 rounded-md", kpi.bg)}>
                <ShieldAlert className={cn("w-4 h-4", kpi.color)} />
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
          { key: 'overview', label: 'District Detail' },
          { key: 'all', label: 'All Districts' },
          { key: 'history', label: 'Risk History' },
          { key: 'deployment', label: 'Deployment' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors", activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : activeTab === 'overview' && risk ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Risk Assessment</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{defaultDistrict}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={defaultDistrict} onChange={e => setSelectedDistrict(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {riskDistricts?.districts?.slice(0, 15).map(d => <option key={d.district} value={d.district}>{d.district}</option>)}
                  </select>
                  <span className={cn("text-xs font-bold px-2 py-1 rounded border", LEVEL_STYLES[riskLevel])}>{riskLevel.toUpperCase()}</span>
                </div>
              </div>

              <div className="flex items-start gap-6 mb-5">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={LEVEL_COLORS[riskLevel]} strokeWidth="2.5" strokeDasharray={`${risk.score}, 100`} strokeLinecap="round" />
                    <text x="18" y="20.5" textAnchor="middle" fontSize="8" fill="#1e293b" fontWeight="bold">{risk.score}</text>
                  </svg>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Historical Rate</p>
                    <p className="text-lg font-bold text-slate-800">{risk.historicalRate}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Recent Incidents</p>
                    <p className="text-lg font-bold text-slate-800">{risk.recentIncidents}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Total Crimes</p>
                    <p className="text-lg font-bold text-slate-800">{risk.totalCrimes?.toLocaleString() ?? '--'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">YoY Change</p>
                    <p className={cn("text-lg font-bold flex items-center gap-1", (risk.yearOverYearChange ?? 0) > 0 ? 'text-red-600' : (risk.yearOverYearChange ?? 0) < 0 ? 'text-green-600' : 'text-slate-800')}>
                      {(risk.yearOverYearChange ?? 0) > 0 ? <ArrowUpRight className="w-4 h-4" /> : (risk.yearOverYearChange ?? 0) < 0 ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                      {risk.yearOverYearChange ?? 0}%
                    </p>
                  </div>
                </div>
              </div>

              {risk.contributingFactors && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Contributing Factors</h4>
                  <div className="space-y-2">
                    {risk.contributingFactors.map((f, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                          <span>{f.factor}</span>
                          <span className="font-medium">{f.weight}/{f.maxWeight}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(f.weight / f.maxWeight) * 100}%`, backgroundColor: LEVEL_COLORS[riskLevel] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {risk.topCrimes && risk.topCrimes.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Crime Type Breakdown</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-600">Crime Type</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-600">Count</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-600">Percentage</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-600 w-32">Distribution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {risk.topCrimes.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{c.type}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{c.count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">{c.percentage}%</td>
                            <td className="px-3 py-2"><div className="w-full h-1.5 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.percentage}%` }} /></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {risk.yearTrend && risk.yearTrend.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-700 uppercase mb-3">Crime Trend Over Years</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={risk.yearTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {risk.yearTrend.map((entry, i) => (
                        <Cell key={i} fill={i === risk.yearTrend!.length - 1 ? LEVEL_COLORS[riskLevel] : '#93c5fd'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {risk.recommendations && risk.recommendations.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Risk Recommendations</h3>
                <ul className="space-y-2">
                  {risk.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {risk.topCrimes && risk.topCrimes.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Crime Distribution</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={risk.topCrimes.slice(0, 5).map(c => ({ name: c.type, value: c.count }))} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {risk.topCrimes.slice(0, 5).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'all' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-800">All Districts Risk Comparison</h3>
            <span className="text-xs text-slate-500">{filteredDistricts.length} districts</span>
          </div>
          {allRisk?.summary && (
            <div className="grid grid-cols-4 gap-3 mb-4">
              {riskPieData.map((d, i) => (
                <div key={i} className="text-center p-3 rounded-lg border border-slate-200">
                  <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <p className="text-lg font-bold text-slate-800">{d.value}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{d.name}</p>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-3 py-3 text-left font-bold border-b border-slate-200">#</th>
                  <th className="px-3 py-3 text-left font-bold border-b border-slate-200">District</th>
                  <th className="px-3 py-3 text-right font-bold border-b border-slate-200">Total Crimes</th>
                  <th className="px-3 py-3 text-right font-bold border-b border-slate-200">Latest Year</th>
                  <th className="px-3 py-3 text-right font-bold border-b border-slate-200">Avg/Year</th>
                  <th className="px-3 py-3 text-center font-bold border-b border-slate-200">Score</th>
                  <th className="px-3 py-3 text-center font-bold border-b border-slate-200">Level</th>
                  <th className="px-3 py-3 text-right font-bold border-b border-slate-200">YoY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDistricts.map((d, i) => (
                  <tr key={d.district} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedDistrict(d.district); setActiveTab('overview'); }}>
                    <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-slate-800">{d.district}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{d.totalCrimes.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{d.latestYearCrimes.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{d.averagePerYear.toLocaleString()}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2" style={{ borderColor: LEVEL_COLORS[d.level], color: LEVEL_COLORS[d.level] }}>
                        <span className="text-xs font-bold">{d.score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase", LEVEL_STYLES[d.level])}>{d.level}</span>
                    </td>
                    <td className={cn("px-3 py-3 text-right font-semibold", d.yearOverYearChange > 0 ? 'text-red-600' : d.yearOverYearChange < 0 ? 'text-green-600' : 'text-slate-500')}>
                      {d.yearOverYearChange > 0 ? '+' : ''}{d.yearOverYearChange}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allRisk?.districts && allRisk.districts.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-slate-700 mb-2">Risk Score Distribution</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={allRisk.districts.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="district" tick={{ fontSize: 8 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {allRisk.districts.slice(0, 15).map((entry, i) => (
                      <Cell key={i} fill={LEVEL_COLORS[entry.level]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : activeTab === 'history' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Risk Score History - {defaultDistrict}</h3>
            <select value={defaultDistrict} onChange={e => setSelectedDistrict(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none">
              {riskDistricts?.districts?.slice(0, 15).map(d => <option key={d.district} value={d.district}>{d.district}</option>)}
            </select>
          </div>
          {riskHistory?.history ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={riskHistory.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">No history data available</div>
          )}
        </div>
      ) : activeTab === 'deployment' && deploy ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Deployment Recommendation - {defaultDistrict}</h3>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-blue-600">{deploy.recommendedOfficers}</p>
              <p className="text-xs text-slate-500 mt-1">Recommended Officers</p>
            </div>
            {deploy.shifts && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase">Shift Distribution</h4>
                {deploy.shifts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-2">
                    <span className="text-slate-600">{s.time}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{s.officers} officers</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", s.priority === 'critical' ? 'bg-red-100 text-red-700' : s.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700')}>{s.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4">
            {deploy.patrolRoutes && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase">Patrol Routes</h3>
                <div className="space-y-2">
                  {deploy.patrolRoutes.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{r.name}</p>
                        <p className="text-[10px] text-slate-500">{r.coordinates.length} waypoints</p>
                      </div>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", r.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>{r.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {deploy.checkpoints && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-xs font-bold text-slate-800 mb-3 uppercase">Checkpoints</h3>
                <div className="space-y-2">
                  {deploy.checkpoints.map((c, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-slate-800">{c.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{c.frequency}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Select a district to view risk analysis</div>
      )}
    </div>
  );
}