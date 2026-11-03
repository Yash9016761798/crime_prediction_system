import { useToast } from '../ToastProvider';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useGetDashboardRecentCrimesQuery, useFetchSOSAlertsQuery } from '../../store/api';
import type { SOSAlert } from '../../types/entities';

export function LiveSOSAlerts() {
  const { addToast } = useToast();
  const [dispatched, setDispatched] = useState<Record<string, boolean>>({});
  const { data, isLoading, isError } = useFetchSOSAlertsQuery({
    page: 1,
    pageSize: 5,
  });

  const alerts = data?.data ?? [];

  const handleDispatch = (id: string) => {
    setDispatched(prev => ({ ...prev, [id]: true }));
    addToast('Patrol dispatched to location.', 'success');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-col h-full shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          Live SOS Alerts
          {!isLoading && alerts.length > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{alerts.length}</span>
          )}
        </h3>
        <Link to="/admin/sos-monitoring" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
          View All
        </Link>
      </div>

      {isLoading ? (
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-100 animate-pulse rounded" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center text-red-500 text-xs">Failed to load alerts</div>
      ) : alerts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No active SOS alerts</div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
          {alerts.map((alert: SOSAlert) => (
            <div key={alert.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded border-l-4 gap-3 ${dispatched[alert.id] ? 'bg-slate-50 border-slate-300' : 'bg-red-50 border-red-500'}`}>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">{alert.user?.name ?? 'Unknown'}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Lat: {alert.latitude.toFixed(4)}, Lng: {alert.longitude.toFixed(4)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2 sm:gap-1">
                <span className="text-[10px] text-slate-500 font-medium">
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDispatch(alert.id)}
                    disabled={dispatched[alert.id]}
                    className={cn("text-[10px] text-white px-2 py-0.5 rounded transition-colors shadow-sm", dispatched[alert.id] ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 cursor-pointer')}
                  >
                    {dispatched[alert.id] ? 'Dispatched' : 'Dispatch'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecentFIRsTable() {
  const { addToast } = useToast();
  const { data, isLoading, isError } = useGetDashboardRecentCrimesQuery(5);
  const firs = Array.isArray(data) ? data : [];

  return (
    <div className="bg-white rounded-md border border-slate-200 flex flex-col h-full overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-800">Recent FIRs</h3>
        <Link to="/admin/fir-management" className="text-xs font-semibold bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 py-1.5 px-3 rounded transition-colors">
          View Full FIRs
        </Link>
      </div>
      {isLoading ? (
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center text-red-500 text-xs">Failed to load FIRs</div>
      ) : firs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No recent FIRs</div>
      ) : (
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
              <tr>
                <th className="px-5 py-3 font-bold border-b border-slate-200">FIR Number</th>
                <th className="px-5 py-3 font-bold border-b border-slate-200">Crime Type</th>
                <th className="px-5 py-3 font-bold border-b border-slate-200">District</th>
                <th className="px-5 py-3 font-bold border-b border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {firs.map((fir: any) => (
                <tr key={fir.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{fir.firNumber}</td>
                  <td className="px-5 py-3 text-slate-800 font-medium">{fir.crimeType}</td>
                  <td className="px-5 py-3 text-slate-600">{fir.district}</td>
                  <td className="px-5 py-3">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                      fir.status === 'investigation' ? 'bg-orange-100 text-orange-700' :
                      fir.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      fir.status === 'solved' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {fir.status === 'investigation' ? 'Investigation' :
                       fir.status === 'pending' ? 'Pending' :
                       fir.status === 'solved' ? 'Solved' : fir.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
