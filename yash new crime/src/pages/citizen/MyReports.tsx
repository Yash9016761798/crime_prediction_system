import { FileText, Clock, CheckCircle, Loader2, AlertCircle, XCircle } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { useFetchCrimeReportsQuery } from '../../store/api';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  under_review: 'Under Investigation',
  requested_info: 'Info Requested',
  approved: 'Resolved',
  rejected: 'Rejected',
  archived: 'Archived',
};

function statusTone(status: string) {
  if (status === 'approved') return { chip: 'bg-green-100 text-green-700', Icon: CheckCircle };
  if (status === 'rejected') return { chip: 'bg-red-100 text-red-700', Icon: XCircle };
  return { chip: 'bg-orange-100 text-orange-700', Icon: Clock };
}

function formatDate(value?: string | Date) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyReports() {
  const { addToast } = useToast();
  const { data, isLoading, isError, refetch } = useFetchCrimeReportsQuery({ page: 1, pageSize: 50 });

  const reports = data?.data ?? [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-bold text-slate-900">My Reports History</h3>
        <p className="text-sm text-slate-500 mt-1">Track the status of incidents you have reported.</p>
      </div>

      <div className="p-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your reports…
          </div>
        )}

        {isError && (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-3">Could not load your reports.</p>
            <button onClick={() => refetch()} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && reports.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">You have not submitted any reports recently.</p>
          </div>
        )}

        {!isLoading && !isError && reports.map((report) => {
          const { chip, Icon } = statusTone(report.status);
          const label = STATUS_LABELS[report.status] || report.status;
          const officerName = report.assignedOfficer?.name;

          return (
            <div key={report.id} className="border border-slate-200 rounded-lg p-5 hover:border-blue-300 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{report.crimeType}</h4>
                    <p className="text-xs text-slate-500">ID: {report.id} &bull; {formatDate(report.incidentDate)}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${chip}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </div>
              </div>

              <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                &ldquo;{report.description}&rdquo;
              </p>

              {report.location && (
                <p className="text-xs text-slate-500 mt-2">
                  {report.location}{report.district ? `, ${report.district}` : ''}{report.state ? ` - ${report.state}` : ''}
                </p>
              )}

              {report.status !== 'approved' && report.status !== 'rejected' && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-blue-600">
                    {officerName
                      ? <>Investigating Officer Assigned: {officerName}</>
                      : 'Awaiting officer assignment'}
                  </span>
                  <button
                    onClick={() => addToast('Additional information can be added once an officer contacts you.', 'info')}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Add Information
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
