import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useGetDashboardStatisticsQuery } from '../../store/api';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  isPositive?: boolean;
  loading?: boolean;
}

const cardConfig = [
  { label: 'Total FIRs', key: 'totalFIRs' as const, format: true },
  { label: 'Active Cases', key: 'activeCases' as const, format: true },
  { label: 'Pending Reports', key: 'pendingReports' as const, format: true },
  { label: 'Active Officers', key: 'activeOfficers' as const, format: true },
  { label: 'SOS Alerts', key: 'sosAlerts' as const, format: true },
  { label: 'Solved Cases', key: 'solvedCases' as const, format: true },
  { label: 'Historical Crimes', key: 'historicalCrimes' as const, format: true },
  { label: "Today's Incidents", key: 'todayIncidents' as const, format: true },
];

function formatNumber(n: number): string {
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

export function StatCard({ label, value, trend, isPositive, loading }: StatCardProps) {
  return (
    <div className="bg-white rounded-md p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
          <div className="flex items-end space-x-2">
            {loading ? (
              <div className="h-8 w-20 bg-slate-200 animate-pulse rounded" />
            ) : (
              <>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>
                {trend && (
                  <span className={cn("text-xs font-semibold flex items-center pr-1 pb-1", isPositive ? "text-red-500" : "text-green-600")}>
                    {trend} {isPositive ? "▲" : "▼"}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardStats() {
  const { data, isLoading, isError, error } = useGetDashboardStatisticsQuery();

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
        Failed to load dashboard statistics: {(error as any)?.message ?? 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {cardConfig.map(card => (
        <StatCard
          key={card.key}
          label={card.label}
          value={data ? formatNumber(data[card.key]) : '—'}
          loading={isLoading}
        />
      ))}
    </div>
  );
}
