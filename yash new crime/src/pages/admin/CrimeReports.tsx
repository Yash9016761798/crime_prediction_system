import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Shield, Filter, X, Eye, CheckCircle, XCircle,
  MessageSquare, UserPlus, Archive,
  Loader2, Camera, MapPin, ChevronLeft, ChevronRight,
  AlertTriangle, ExternalLink, ZoomIn,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { DialogOverlay, ConfirmDialog } from '../../components/Dialog';
import {
  useFetchCrimeReportsQuery,
  useFetchCrimeReportByIdQuery,
  useApproveCrimeReportMutation,
  useRejectCrimeReportMutation,
  useReviewCrimeReportMutation,
  useAssignCrimeReportMutation,
  useRequestInfoCrimeReportMutation,
  useArchiveCrimeReportMutation,
} from '../../store/api';
import type { CrimeReport } from '../../types/entities';
import { CRIME_REPORT_STATUS_OPTIONS, CRIME_TYPES, PAGE_SIZE_OPTIONS } from '../../constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  requested_info: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-slate-100 text-slate-600',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  requested_info: 'Info Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
};

function formatDate(d: Date | string | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: Date | string | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface ReportFilters {
  search: string;
  status: string;
  district: string;
  crimeType: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: ReportFilters = { search: '', status: '', district: '', crimeType: '', dateFrom: '', dateTo: '' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CrimeReports() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Modals
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [requestInfoId, setRequestInfoId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setFilters(prev => ({ ...prev, search: searchInput })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = useMemo(() => ({
    page, pageSize,
    ...(filters.search && { search: filters.search }),
    ...(filters.status && { status: filters.status }),
    ...(filters.district && { district: filters.district }),
    ...(filters.crimeType && { crimeType: filters.crimeType }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
  }), [page, pageSize, filters]);

  const { data, isLoading, isFetching, isError, refetch } = useFetchCrimeReportsQuery(queryParams);
  const { data: selectedReport, isLoading: selectedLoading } = useFetchCrimeReportByIdQuery(selectedId ?? '', { skip: !selectedId });

  const [approveReport, { isLoading: isApproving }] = useApproveCrimeReportMutation();
  const [rejectReport, { isLoading: isRejecting }] = useRejectCrimeReportMutation();
  const [reviewReport] = useReviewCrimeReportMutation();
  const [assignReport] = useAssignCrimeReportMutation();
  const [requestInfo] = useRequestInfoCrimeReportMutation();
  const [archiveReport] = useArchiveCrimeReportMutation();

  const reports = data?.data ?? [];
  const totalRecords = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Auto-select first if none selected
  /* eslint-disable react-hooks/set-state-in-effect -- selecting the first row when data arrives is derived state, not a cascade */
  useEffect(() => { if (!selectedId && reports.length > 0) setSelectedId(reports[0].id); }, [reports, selectedId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateFilter = useCallback((key: keyof ReportFilters, value: string) => { setFilters(prev => ({ ...prev, [key]: value })); setPage(1); }, []);
  const resetFilters = useCallback(() => { setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(1); }, []);
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const counts = useMemo(() => ({
    total: totalRecords,
    pending: reports.filter(r => r.status === 'pending').length,
    under_review: reports.filter(r => r.status === 'under_review').length,
    approved: reports.filter(r => r.status === 'approved').length,
    rejected: reports.filter(r => r.status === 'rejected').length,
  }), [reports, totalRecords]);

  // ---- Actions ----
  const handleApprove = useCallback(async (id: string) => {
    try {
      const result = await approveReport({ id, data: {} }).unwrap();
      addToast(`Report approved. FIR ${(result as any).createdFIRId ? 'created' : 'pending'}. Dashboard, Heatmap, and Analytics updated.`, 'success');
    } catch { addToast('Failed to approve report', 'error'); }
  }, [approveReport, addToast]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    try { await rejectReport({ id, data: { reason } }).unwrap(); addToast('Report rejected. Citizen notified.', 'success'); setRejectId(null); }
    catch { addToast('Failed to reject report', 'error'); }
  }, [rejectReport, addToast]);

  const handleMarkReview = useCallback(async (id: string) => {
    try { await reviewReport(id).unwrap(); addToast('Report marked as under review', 'success'); }
    catch { addToast('Failed to update status', 'error'); }
  }, [reviewReport, addToast]);

  const handleAssign = useCallback(async (id: string, officerId: string) => {
    try { await assignReport({ id, officerId }).unwrap(); addToast('Officer assigned. Report status updated.', 'success'); setAssignId(null); }
    catch { addToast('Failed to assign officer', 'error'); }
  }, [assignReport, addToast]);

  const handleRequestInfo = useCallback(async (id: string, message: string) => {
    try { await requestInfo({ id, message }).unwrap(); addToast('Information requested from citizen.', 'success'); setRequestInfoId(null); }
    catch { addToast('Failed to request info', 'error'); }
  }, [requestInfo, addToast]);

  const handleArchive = useCallback(async (id: string) => {
    try { await archiveReport(id).unwrap(); addToast('Report archived', 'success'); setArchiveId(null); }
    catch { addToast('Failed to archive', 'error'); }
  }, [archiveReport, addToast]);

  // ---- Status filter tabs ----
  const statusTabs = [
    { key: '', label: 'All', count: counts.total },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'under_review', label: 'Under Review', count: counts.under_review },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">Crime Reports Review</h2>
          <p className="text-sm text-slate-500">Review and verify citizen crime submissions</p>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={cn("bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2", showFilters && "bg-slate-100")}>
          <Filter className="w-4 h-4" /> Filter {hasActiveFilters && <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{Object.values(filters).filter(Boolean).length}</span>}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search reports..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {CRIME_REPORT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">District</label>
              <input type="text" value={filters.district} onChange={e => updateFilter('district', e.target.value)} placeholder="District..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Crime Type</label>
              <select value={filters.crimeType} onChange={e => updateFilter('crimeType', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Types</option>
                {CRIME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date From</label>
              <input type="date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Date To</label>
              <input type="date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"><X className="w-4 h-4" /> Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {statusTabs.map(tab => (
          <button key={tab.key} onClick={() => { updateFilter('status', tab.key); }}
            className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors", filters.status === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            {tab.label} <span className="ml-1 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[500px]">
        {/* Left: Report list */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Reports <span className="text-slate-400">({totalRecords})</span></span>
            {isFetching && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-slate-100 animate-pulse rounded" />)}</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No reports found</div>
            ) : (
              reports.map((r: CrimeReport) => (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={cn("w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors", selectedId === r.id && "bg-blue-50 border-l-2 border-l-blue-500")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-slate-500">{r.id}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", STATUS_STYLES[r.status])}>{STATUS_LABELS[r.status]}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{r.crimeType}</p>
                  <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{r.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                    <span>{r.district}</span>
                    <span>·</span>
                    <span>{formatDate(r.incidentDate)}</span>
                    {r.evidenceUrls?.length > 0 && <><span>·</span><span className="text-blue-500">{r.evidenceUrls.length} files</span></>}
                  </div>
                </button>
              ))
            )}
          </div>
          {/* Mini pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">{Math.min((page - 1) * pageSize + 1, totalRecords)}-{Math.min(page * pageSize, totalRecords)} of {totalRecords}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a report to view details</div>
          ) : selectedLoading ? (
            <div className="flex-1 p-6 space-y-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-6 bg-slate-100 animate-pulse rounded" />)}</div>
          ) : !selectedReport ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Report not found</div>
          ) : (
            <>
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-lg font-bold text-slate-800">{selectedReport.id}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", STATUS_STYLES[selectedReport.status])}>{STATUS_LABELS[selectedReport.status]}</span>
                  </div>
                  <p className="text-xs text-slate-500">Submitted {formatDateTime(selectedReport.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-700 uppercase">Category: {selectedReport.crimeType}</p>
                  <p className="text-xs text-slate-500">Location: {selectedReport.location}</p>
                  <p className="text-xs text-slate-500">District: {selectedReport.district}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Citizen Info */}
                {selectedReport.user && (
                  <section>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Shield className="w-3 h-3" /> Citizen Information</h4>
                    <div className="bg-slate-50 rounded-md p-3 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">Name:</span> <span className="text-slate-800 font-medium">{selectedReport.user.name}</span></div>
                      <div><span className="text-slate-500">Phone:</span> <span className="text-slate-800">{selectedReport.user.phone}</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="text-slate-800">{selectedReport.user.email}</span></div>
                      <div><span className="text-slate-500">User ID:</span> <span className="text-slate-800 font-mono">{selectedReport.userId}</span></div>
                    </div>
                  </section>
                )}

                {/* Incident Info */}
                <section>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Incident Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">Crime Type:</span><span className="text-slate-800 font-medium">{selectedReport.crimeType}</span></div>
                    <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">Date:</span><span className="text-slate-800">{formatDate(selectedReport.incidentDate)}</span></div>
                    {(selectedReport as any).incidentTime && <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">Time:</span><span className="text-slate-800">{(selectedReport as any).incidentTime}</span></div>}
                    <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">Location:</span><span className="text-slate-800">{selectedReport.location}</span></div>
                    <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">District:</span><span className="text-slate-800">{selectedReport.district}</span></div>
                    {(selectedReport as any).state && <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">State:</span><span className="text-slate-800">{(selectedReport as any).state}</span></div>}
                    {(selectedReport as any).policeStation && <div className="grid grid-cols-2 gap-2"><span className="text-slate-500">Police Station:</span><span className="text-slate-800">{(selectedReport as any).policeStation}</span></div>}
                  </div>
                </section>

                {/* Description */}
                <section>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md leading-relaxed">{selectedReport.description}</p>
                </section>

                {/* Map */}
                {selectedReport.latitude && selectedReport.longitude && (
                  <section>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> Location Map</h4>
                    <div className="bg-slate-100 rounded-md p-4 text-center">
                      <MapPin className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                      <p className="text-xs text-slate-600">{selectedReport.location}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Lat: {selectedReport.latitude.toFixed(4)}, Lng: {selectedReport.longitude.toFixed(4)}</p>
                      <a href={`https://www.google.com/maps?q=${selectedReport.latitude},${selectedReport.longitude}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors">
                        <ExternalLink className="w-3 h-3" /> Open in Google Maps
                      </a>
                    </div>
                  </section>
                )}

                {/* Evidence */}
                <section>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Camera className="w-3 h-3" /> Attached Evidence ({selectedReport.evidence?.length || selectedReport.evidenceUrls?.length || 0})</h4>
                  {(selectedReport.evidence?.length || selectedReport.evidenceUrls?.length) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(selectedReport.evidence || selectedReport.evidenceUrls?.map((url: string, i: number) => ({ id: String(i), type: 'Photo', name: `Evidence ${i + 1}`, url })) || []).map((ev: any) => (
                        <div key={ev.id} className="relative group border border-slate-200 rounded-md overflow-hidden">
                          <img src={ev.url} alt={ev.name} className="w-full h-32 object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <button onClick={() => setPreviewImage(ev.url)} className="bg-white/90 p-2 rounded-full hover:bg-white"><ZoomIn className="w-4 h-4 text-slate-700" /></button>
                          </div>
                          <div className="px-2 py-1.5 bg-white">
                            <p className="text-[10px] text-slate-600 truncate">{ev.name}</p>
                            <p className="text-[10px] text-slate-400">{ev.type}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">No evidence attached</p>
                  )}
                </section>

                {/* Rejection/Request Info */}
                {selectedReport.rejectionReason && (
                  <section className="bg-red-50 border border-red-100 rounded-md p-3">
                    <h4 className="text-xs font-semibold text-red-600 mb-1">Rejection Reason</h4>
                    <p className="text-xs text-red-700">{selectedReport.rejectionReason}</p>
                  </section>
                )}
                {selectedReport.requestInfoMessage && (
                  <section className="bg-purple-50 border border-purple-100 rounded-md p-3">
                    <h4 className="text-xs font-semibold text-purple-600 mb-1">Information Requested</h4>
                    <p className="text-xs text-purple-700">{selectedReport.requestInfoMessage}</p>
                  </section>
                )}

                {/* FIR link */}
                {selectedReport.createdFIRId && (
                  <section className="bg-green-50 border border-green-100 rounded-md p-3">
                    <h4 className="text-xs font-semibold text-green-600 mb-1">Created FIR</h4>
                    <p className="text-xs text-green-700">FIR ID: <span className="font-mono">{selectedReport.createdFIRId}</span></p>
                  </section>
                )}

                {/* Reviewer */}
                {selectedReport.reviewedBy && (
                  <div className="text-[10px] text-slate-400">Reviewed by: {selectedReport.reviewedBy} on {formatDateTime(selectedReport.reviewedAt)}</div>
                )}
              </div>

              {/* Action buttons */}
              <div className="border-t border-slate-200 px-6 py-3 flex flex-wrap gap-2">
                {(selectedReport.status === 'pending' || selectedReport.status === 'requested_info') && (
                  <>
                    <button onClick={() => handleApprove(selectedReport.id)} disabled={isApproving} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                      {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve & Create FIR
                    </button>
                    <button onClick={() => setRejectId(selectedReport.id)} className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </>
                )}
                {(selectedReport.status === 'pending' || selectedReport.status === 'under_review') && (
                  <>
                    <button onClick={() => setRequestInfoId(selectedReport.id)} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Request Info
                    </button>
                    <button onClick={() => setAssignId(selectedReport.id)} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> Assign Officer
                    </button>
                    {selectedReport.status === 'pending' && (
                      <button onClick={() => handleMarkReview(selectedReport.id)} className="px-3 py-1.5 bg-slate-600 text-white text-xs font-medium rounded-md hover:bg-slate-700 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Mark Under Review
                      </button>
                    )}
                  </>
                )}
                {selectedReport.status !== 'archived' && (
                  <button onClick={() => setArchiveId(selectedReport.id)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded-md hover:bg-slate-300 flex items-center gap-1">
                    <Archive className="w-3 h-3" /> Archive
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectId && <RejectModal reportId={rejectId} onClose={() => setRejectId(null)} onSubmit={handleReject} isLoading={isRejecting} />}

      {/* Assign Modal */}
      {assignId && <AssignModal reportId={assignId} onClose={() => setAssignId(null)} onSubmit={handleAssign} />}

      {/* Request Info Modal */}
      {requestInfoId && <RequestInfoModal reportId={requestInfoId} onClose={() => setRequestInfoId(null)} onSubmit={handleRequestInfo} />}

      {/* Archive Confirm */}
      {archiveId && <ConfirmDialog title="Archive Report" message="Archive this report for future reference?" confirmLabel="Archive" variant="default" onConfirm={() => handleArchive(archiveId)} onCancel={() => setArchiveId(null)} />}

      {/* Image Preview */}
      {previewImage && (
        <DialogOverlay onClose={() => setPreviewImage(null)}>
          <div className="bg-black/90 rounded-lg max-w-4xl max-h-[90vh] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="Evidence preview" className="max-w-full max-h-[85vh] object-contain rounded" />
            <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function RejectModal({ reportId, onClose, onSubmit, isLoading }: {
  reportId: string; onClose: () => void; onSubmit: (id: string, reason: string) => void; isLoading?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const reasons = ['False report', 'Insufficient evidence', 'Duplicate report', 'Outside jurisdiction', 'Unable to verify'];
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Reject Report</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Rejecting report <span className="font-mono font-medium">{reportId}</span>. The citizen will be notified.</p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Quick Reason</label>
            <div className="flex flex-wrap gap-1">
              {reasons.map(r => <button key={r} onClick={() => setReason(r)} className={cn("px-2 py-1 text-[10px] rounded-full border transition-colors", reason === r ? "bg-red-100 border-red-300 text-red-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100")}>{r}</button>)}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Detailed Reason *</label>
            <textarea value={reason} onChange={e => { setReason(e.target.value); setError(''); }} rows={3} placeholder="Explain why this report is being rejected..." className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none", error ? 'border-red-300' : 'border-slate-200')} />
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={() => { if (!reason.trim()) { setError('Reason is required'); return; } onSubmit(reportId, reason); }} disabled={!reason.trim() || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Reject Report
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function AssignModal({ reportId, onClose, onSubmit }: {
  reportId: string; onClose: () => void; onSubmit: (id: string, officerId: string) => void;
}) {
  const [officerId, setOfficerId] = useState('');
  const officers = [
    { id: 'off1', name: 'Inspector Sharma', district: 'Central' },
    { id: 'off2', name: 'SI Verma', district: 'West' },
    { id: 'off3', name: 'Constable Patel', district: 'East' },
    { id: 'off4', name: 'ASI Gupta', district: 'North' },
    { id: 'off5', name: 'Inspector Singh', district: 'South' },
  ];
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Assign Reviewer</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Assign an officer to review report <span className="font-mono font-medium">{reportId}</span></p>
          <select value={officerId} onChange={e => setOfficerId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Select officer...</option>
            {officers.map(o => <option key={o.id} value={o.id}>{o.name} ({o.district})</option>)}
          </select>
          <p className="text-[10px] text-slate-400">Report will be marked as &quot;Under Review&quot; and the officer will be notified.</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={() => officerId && onSubmit(reportId, officerId)} disabled={!officerId} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Assign
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function RequestInfoModal({ reportId, onClose, onSubmit }: {
  reportId: string; onClose: () => void; onSubmit: (id: string, message: string) => void;
}) {
  const [message, setMessage] = useState('');
  const suggestions = ['Please upload clearer photos of the incident', 'Can you provide witness contact details?', 'Please share the exact location with GPS coordinates', 'Any additional documents or evidence?'];
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Request More Information</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Send a message to the citizen for report <span className="font-mono font-medium">{reportId}</span></p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Quick Request</label>
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => <button key={s} onClick={() => setMessage(s)} className="px-2 py-1 text-[10px] rounded-full border bg-slate-50 border-slate-200 text-slate-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors">{s.slice(0, 30)}...</button>)}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Message *</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="What information do you need from the citizen?" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
          <p className="text-[10px] text-slate-400">The citizen will receive a notification with your message and can update the report.</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={() => message.trim() && onSubmit(reportId, message)} disabled={!message.trim()} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Send Request
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
