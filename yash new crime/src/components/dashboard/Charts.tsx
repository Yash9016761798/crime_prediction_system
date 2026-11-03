import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useGetDashboardTrendsQuery, useGetDashboardCrimeTypeBreakdownQuery } from '../../store/api';
import type { TrendData, CrimeTypeBreakdown } from '../../types/entities';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function transformTrends(data: TrendData[] | undefined) {
  if (!data || data.length === 0) return [];
  return data.map(d => ({
    name: d.date,
    count: d.count,
    predicted: d.predicted,
  }));
}

function transformBreakdown(data: CrimeTypeBreakdown[] | undefined) {
  if (!data || data.length === 0) return [];
  return data.map((d, i) => ({
    name: d.type,
    value: d.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
}

export function CrimeTrendChart() {
  const { data, isLoading, isError } = useGetDashboardTrendsQuery('12m');
  const chartData = transformTrends(data);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm">
        <div className="h-4 w-40 bg-slate-200 animate-pulse rounded mb-6" />
        <div className="flex-1 bg-slate-100 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-slate-800">Crime Trend</h3>
        {isError && <span className="text-xs text-red-500">Failed to load</span>}
      </div>
      <div className="flex-1 min-h-[250px]">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">No trend data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val: number) => `${val / 1000}k`} />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '4px', color: '#1e293b', fontSize: '12px' }} />
              <Line type="monotone" dataKey="count" name="Crimes" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function CrimeCategoryChart() {
  const { data, isLoading, isError } = useGetDashboardCrimeTypeBreakdownQuery();
  const chartData = transformBreakdown(data);
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-6">Crime by Category</h3>
      {isLoading ? (
        <div className="flex-1 bg-slate-100 animate-pulse rounded" />
      ) : isError ? (
        <div className="flex items-center justify-center h-full text-red-500 text-sm">Failed to load</div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data available</div>
      ) : (
        <>
          <div className="flex-1 min-h-[200px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5} dataKey="value"
                  stroke="none"
                >
                  {chartData.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={chartData[index].color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '4px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
              <span className="text-xl font-bold text-slate-900">{total.toLocaleString()}</span>
              <span className="text-xs text-slate-500">Total</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-3 mt-4">
            {chartData.map((cat: any, i: number) => (
              <div key={i} className="flex items-center text-xs">
                <span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: cat.color }} />
                <span className="text-slate-600 flex-1">{cat.name}</span>
                <span className="text-slate-800 font-medium">{Math.round((cat.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
