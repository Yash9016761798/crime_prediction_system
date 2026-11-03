import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Calendar, Download, AlertCircle, Loader2, TrendingUp, TrendingDown, Users, Clock,
  Shield, Activity, FileText, Filter, ChevronDown, ChevronUp, Search, Target,
  Building2, Zap, Brain, Phone, BarChart3, PieChart as PieChartIcon, ArrowUpRight,
  ArrowDownRight, Minus, RefreshCw, FileSpreadsheet, Image, Star, AlertTriangle,
  CheckCircle, XCircle, Eye,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { apiFetch } from '../../lib/apiClient';

const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];

function StatCard({ label, value, icon, color, change }: { label: string; value: string | number; icon: React.ReactNode; color: string; change?: number }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    red: 'bg-red-50 border-red-100 text-red-600',
    green: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-600',
  };
  return (
    <div className={cn('border rounded-xl p-4 relative overflow-hidden', colors[color] ?? colors.blue)}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-bold text-slate-800">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {change !== undefined && (
        <div className={cn("flex items-center gap-0.5 mt-1 text-[10px] font-semibold", change > 0 ? 'text-red-600' : change < 0 ? 'text-emerald-600' : 'text-slate-500')}>
          {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : change < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {change > 0 ? '+' : ''}{change}% vs last year
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white p-5 rounded-xl border border-slate-200 shadow-sm", className)}>
      <div className="flex items-center gap-2 mb-4">
        {icon}<h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Analytics() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState({ year: '', state: '', crimeType: '', district: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'districts' | 'demographics' | 'performance' | 'predictions'>('overview');

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.year) p.year = filters.year;
    if (filters.state) p.state = filters.state;
    if (filters.crimeType) p.crimeType = filters.crimeType;
    if (filters.district) p.district = filters.district;
    return p;
  }, [filters]);

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const queryKey = JSON.stringify(queryParams);

  /* eslint-disable react-hooks/set-state-in-effect -- showing the loading state as soon as the filters change */
  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    const params = new URLSearchParams(queryParams);
    apiFetch(`/analytics/full?${params}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => { setData(d); setIsLoading(false); })
      .catch(() => { setIsError(true); setIsLoading(false); });
  }, [queryKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleExport = (format: string) => {
    if (!data) return;
    if (format === 'csv') {
      const rows = [['District', 'Crimes', 'Change %']];
      data.districts.forEach((d: any) => rows.push([d.district, String(d.count), String(d.change)]));
      const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'analytics-report.csv'; a.click(); URL.revokeObjectURL(url);
      addToast('CSV exported!', 'success');
    } else {
      addToast(`${format.toUpperCase()} export coming soon`, 'info');
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'districts' as const, label: 'Districts', icon: Target },
    { id: 'demographics' as const, label: 'Demographics', icon: Users },
    { id: 'performance' as const, label: 'Performance', icon: Shield },
    { id: 'predictions' as const, label: 'Crime Predictions', icon: Brain },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-0.5">Data Analytics</h2>
          <p className="text-xs text-slate-500">2001-2012 NCRB district dataset - totals exclude state sub-total rows and roll-up columns; estimated fields are labelled in the payload</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Filter className="w-3.5 h-3.5" /> Filters {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
          <select value={filters.year} onChange={e => setFilters(p => ({ ...p, year: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
            <option value="">All Years</option>
            {[2012,2011,2010,2009,2008,2007,2006,2005,2004,2003,2002,2001].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filters.state} onChange={e => setFilters(p => ({ ...p, state: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white min-w-[130px]">
            <option value="">All States</option>
            {data?.filters?.states?.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.crimeType} onChange={e => setFilters(p => ({ ...p, crimeType: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white min-w-[130px]">
            <option value="">All Crime Types</option>
            {data?.filters?.crimeTypes?.slice(0, 20).map((c: string) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={filters.district} onChange={e => setFilters(p => ({ ...p, district: e.target.value }))} placeholder="Search district..."
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white w-40" />
          {(filters.year || filters.state || filters.crimeType || filters.district) && (
            <button onClick={() => setFilters({ year: '', state: '', crimeType: '', district: '' })} className="text-[10px] text-red-600 hover:text-red-800 font-medium">Clear</button>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-600">Failed to load analytics</p>
          <button onClick={() => { setIsLoading(true); setIsError(false); apiFetch('/analytics/full').then(r=>r.json()).then(d=>{setData(d);setIsLoading(false)}).catch(()=>setIsError(true)); }} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">Retry</button>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Crimes" value={data.kpi.totalCrimes} icon={<Activity className="w-4 h-4" />} color="blue" change={data.kpi.crimeGrowth} />
            <StatCard label="Active FIRs" value={data.kpi.activeFIRs} icon={<FileText className="w-4 h-4" />} color="amber" />
            <StatCard label="Solved Cases" value={data.kpi.solvedCases} icon={<CheckCircle className="w-4 h-4" />} color="green" />
            <StatCard label="Pending Cases" value={data.kpi.pendingCases} icon={<Clock className="w-4 h-4" />} color="red" />
            <StatCard label="Crime Growth" value={`${data.kpi.crimeGrowth > 0 ? '+' : ''}${data.kpi.crimeGrowth}%`} icon={<TrendingUp className="w-4 h-4" />} color={data.kpi.crimeGrowth > 0 ? 'red' : 'green'} />
            <StatCard label="Avg Response" value={data.kpi.avgResponseTime} icon={<Zap className="w-4 h-4" />} color="purple" />
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Monthly Crime Trend" icon={<BarChart3 className="w-4 h-4 text-blue-500" />}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.monthlyTrend}>
                        <defs><linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                        <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" name="Crimes" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Yearly Crime Trend" icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.yearlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                        <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} name="Crimes" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="Crime by Type" icon={<PieChartIcon className="w-4 h-4 text-purple-500" />}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.crimeTypes.slice(0, 8)} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="count" label={({ type, percentage }: any) => `${type?.slice(0,8)} ${percentage}%`}>
                          {data.crimeTypes.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Crime by Time of Day" icon={<Clock className="w-4 h-4 text-amber-500" />}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.crimeByTime}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" radius={[4,4,0,0]} name="Crimes">
                          {data.crimeByTime.map((_: any, i: number) => <Cell key={i} fill={['#fbbf24','#f59e0b','#ef4444','#6366f1'][i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Crime by Day of Week" icon={<Calendar className="w-4 h-4 text-cyan-500" />}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.crimeByDay}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" fill="#06b6d4" radius={[4,4,0,0]} name="Crimes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard title="Crime by Gender" icon={<Users className="w-4 h-4 text-pink-500" />}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.crimeByGender} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="count" label={({ gender, percentage }: any) => `${gender} ${percentage}%`}>
                          {data.crimeByGender.map((_: any, i: number) => <Cell key={i} fill={['#3b82f6','#ec4899','#a855f7'][i]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Crime by Age Group" icon={<BarChart3 className="w-4 h-4 text-indigo-500" />}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.crimeByAge}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" radius={[4,4,0,0]} name="Victims">
                          {data.crimeByAge.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="FIR Analytics" icon={<FileText className="w-4 h-4 text-red-500" />}>
                  <div className="space-y-3 mt-2">
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Total FIRs</span><span className="text-sm font-bold text-slate-800">{data.firAnalytics.total.toLocaleString()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Pending</span><span className="text-sm font-bold text-amber-600">{data.firAnalytics.pending.toLocaleString()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Solved</span><span className="text-sm font-bold text-emerald-600">{data.firAnalytics.solved.toLocaleString()}</span></div>
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Avg Investigation</span><span className="text-sm font-bold text-slate-800">{data.firAnalytics.avgInvestigationDays} days</span></div>
                    <div className="mt-2"><div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Resolution Rate</span><span>{data.firAnalytics.closedRate}%</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.firAnalytics.closedRate}%` }} /></div></div>
                  </div>
                </ChartCard>
              </div>
            </div>
          )}

          {/* DISTRICTS TAB */}
          {activeTab === 'districts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Top 10 Districts" icon={<Target className="w-4 h-4 text-blue-500" />}>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.districts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis dataKey="district" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} width={110} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" radius={[0,4,4,0]} name="Crimes">
                          {data.districts.map((_: any, i: number) => <Cell key={i} fill={i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#3b82f6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="State Distribution" icon={<BarChart3 className="w-4 h-4 text-purple-500" />}>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.states.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="state" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" radius={[4,4,0,0]} name="Crimes">
                          {data.states.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              <ChartCard title="District Risk Scores" icon={<Shield className="w-4 h-4 text-red-500" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">#</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">District</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Risk Score</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-600">Trend</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Change</th>
                    </tr></thead>
                    <tbody>
                      {data.riskScores.map((r: any, i: number) => (
                        <tr key={r.district} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-500">{i + 1}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{r.district}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={cn("inline-block px-2 py-0.5 rounded-full font-bold", r.riskScore > 70 ? 'bg-red-100 text-red-700' : r.riskScore > 40 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                              {r.riskScore}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {r.trend === 'increasing' ? <ArrowUpRight className="w-4 h-4 text-red-500 inline" /> : r.trend === 'decreasing' ? <ArrowDownRight className="w-4 h-4 text-emerald-500 inline" /> : <Minus className="w-4 h-4 text-slate-400 inline" />}
                          </td>
                          <td className={cn("py-2 px-3 text-right font-medium", r.change > 0 ? 'text-red-600' : r.change < 0 ? 'text-emerald-600' : 'text-slate-500')}>
                            {r.change > 0 ? '+' : ''}{r.change}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          )}

          {/* DEMOGRAPHICS TAB */}
          {activeTab === 'demographics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Crime by Gender Distribution" icon={<Users className="w-4 h-4 text-pink-500" />}>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.crimeByGender} cx="50%" cy="50%" outerRadius={100} dataKey="count" label={({ gender, count, percentage }: any) => `${gender}: ${count.toLocaleString()} (${percentage}%)`}>
                          {data.crimeByGender.map((_: any, i: number) => <Cell key={i} fill={['#3b82f6','#ec4899','#a855f7'][i]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Crime by Age Group" icon={<BarChart3 className="w-4 h-4 text-indigo-500" />}>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.crimeByAge}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="count" name="Victims" radius={[4,4,0,0]}>
                          {data.crimeByAge.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {data.crimeByAge.map((a: any) => (
                      <div key={a.group} className="text-center bg-slate-50 rounded-lg p-2">
                        <p className="text-[10px] text-slate-500">{a.group}</p>
                        <p className="text-sm font-bold text-slate-800">{a.percentage}%</p>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Crime by Time of Day" icon={<Clock className="w-4 h-4 text-amber-500" />}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={data.crimeByTime}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                        <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Radar name="Crimes" dataKey="count" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Crime by Day of Week" icon={<Calendar className="w-4 h-4 text-cyan-500" />}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.crimeByDay}>
                        <defs><linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/><stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#dayGrad)" name="Crimes" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            </div>
          )}

          {/* PERFORMANCE TAB */}
          {activeTab === 'performance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Officer Performance" icon={<Users className="w-4 h-4 text-blue-500" />}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Officer</th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-600">Assigned</th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-600">Solved</th>
                        <th className="text-center py-2 px-2 font-semibold text-slate-600">Rate</th>
                        <th className="text-center py-2 px-2 font-semibold text-slate-600">Response</th>
                      </tr></thead>
                      <tbody>
                        {data.officerPerformance.map((o: any) => (
                          <tr key={o.name} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-2 font-medium text-slate-800">{o.name}</td>
                            <td className="py-2 px-2 text-right text-slate-600">{o.assigned}</td>
                            <td className="py-2 px-2 text-right text-emerald-600 font-medium">{o.solved}</td>
                            <td className="py-2 px-2 text-center"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", Math.round(o.solved/o.assigned*100) > 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{Math.round(o.solved/o.assigned*100)}%</span></td>
                            <td className="py-2 px-2 text-center text-slate-600">{o.responseTime}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>

                <ChartCard title="SOS Alert Analytics" icon={<Phone className="w-4 h-4 text-red-500" />}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">{data.sosData.total}</p>
                        <p className="text-[10px] text-red-500 font-semibold">Total SOS</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{data.sosData.avgResponseTime}</p>
                        <p className="text-[10px] text-blue-500 font-semibold">Avg Response</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-600 mb-2">Area Distribution</p>
                      {data.sosData.areaDistribution.map((a: any) => (
                        <div key={a.area} className="flex items-center gap-2 text-[10px] mb-1.5">
                          <span className="w-20 truncate text-slate-600">{a.area}</span>
                          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(100, a.count * 10)}%` }} /></div>
                          <span className="w-6 text-right font-medium text-slate-700">{a.count}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">Emergency Frequency: <span className="font-bold text-slate-700">{data.sosData.frequency}/day</span></p>
                  </div>
                </ChartCard>
              </div>

              <ChartCard title="FIR Analytics Detail" icon={<FileText className="w-4 h-4 text-amber-500" />}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-blue-600">{data.firAnalytics.total.toLocaleString()}</p><p className="text-[10px] text-blue-500">Total FIRs</p></div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-amber-600">{data.firAnalytics.pending.toLocaleString()}</p><p className="text-[10px] text-amber-500">Pending</p></div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-emerald-600">{data.firAnalytics.solved.toLocaleString()}</p><p className="text-[10px] text-emerald-500">Solved</p></div>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-purple-600">{data.firAnalytics.avgInvestigationDays}</p><p className="text-[10px] text-purple-500">Avg Days</p></div>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center"><p className="text-xl font-bold text-red-600">{data.firAnalytics.closedRate}%</p><p className="text-[10px] text-red-500">Resolution</p></div>
                </div>
              </ChartCard>
            </div>
          )}

          {/* PREDICTIONS TAB */}
          {activeTab === 'predictions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Crime Predictions (statistical trend model)" icon={<Brain className="w-4 h-4 text-indigo-500" />}>
                  <div className="space-y-2">
                    {data.aiPredictions.map((p: any) => (
                      <div key={p.district} className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800">{p.district}</span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", p.riskScore > 70 ? 'bg-red-100 text-red-700' : p.riskScore > 40 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>Risk: {p.riskScore}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div><span className="text-slate-500">Prediction:</span><p className="font-medium text-slate-700">{p.prediction}</p></div>
                          <div><span className="text-slate-500">Confidence:</span><p className="font-medium text-indigo-600">{p.confidence}%</p></div>
                          <div><span className="text-slate-500">Action:</span><p className="font-medium text-emerald-600">{p.recommendation}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>

                <ChartCard title="Risk Score Distribution" icon={<Shield className="w-4 h-4 text-red-500" />}>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.riskScores}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="district" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 11 }} />
                        <Bar dataKey="riskScore" name="Risk Score" radius={[4,4,0,0]}>
                          {data.riskScores.map((_: any, i: number) => <Cell key={i} fill={_.riskScore > 70 ? '#ef4444' : _.riskScore > 40 ? '#f59e0b' : '#10b981'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
