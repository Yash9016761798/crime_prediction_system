import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import {
  FileText, Plus, Search, Filter, X, ChevronDown, ChevronUp,
  Eye, Edit3, Trash2, UserCheck, CheckCircle, Clock, AlertCircle,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Download, Loader2, UserPlus, Ban, MapPin, Users, Shield,
  Activity, TrendingUp, AlertTriangle, Calendar, FileBarChart,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { DialogOverlay, ConfirmDialog } from '../../components/Dialog';
import {
  useFetchFIRsQuery,
  useFetchFIRByIdQuery,
  useCreateFIRMutation,
  useUpdateFIRMutation,
  useAssignFirOfficerMutation,
  useCloseFIRMutation,
  useDeleteFIRMutation,
} from '../../store/api';
import type { FIR, FIRStatus } from '../../types/entities';
import type { CreateFIRRequest, UpdateFIRRequest, AssignOfficerRequest, CloseFIRRequest } from '../../types/api';
import { FIR_STATUS_OPTIONS, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, CRIME_TYPES, FIR_SEVERITY_OPTIONS, FIR_PRIORITY_OPTIONS } from '../../constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  investigation: 'bg-orange-100 text-orange-700',
  solved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  investigation: 'Investigation',
  solved: 'Solved',
  closed: 'Closed',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
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

interface FIRFilters {
  search: string;
  status: string;
  district: string;
  crimeType: string;
  dateFrom: string;
  dateTo: string;
  assignedOfficer: string;
}

const EMPTY_FILTERS: FIRFilters = {
  search: '', status: '', district: '', crimeType: '',
  dateFrom: '', dateTo: '', assignedOfficer: '',
};

// ---------------------------------------------------------------------------
// KPI Card Component
// ---------------------------------------------------------------------------

function KPICard({ icon, label, value, color, subtext }: { icon: React.ReactNode; label: string; value: number | string; color: string; subtext?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
          {subtext && <p className="text-[10px] text-slate-400 mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FIRManagement() {
  const { addToast } = useToast();

  // ---- filters & pagination ----
  const [filters, setFilters] = useState<FIRFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchInput, setSearchInput] = useState('');

  // ---- selection ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- modals ----
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ---- bulk action state ----
  const [bulkAssignOfficerId, setBulkAssignOfficerId] = useState('');

  // ---- debounced search ----
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ---- query ----
  const queryParams = useMemo(() => ({
    page,
    pageSize,
    sortBy: sortField,
    sortOrder,
    ...(filters.search && { search: filters.search }),
    ...(filters.status && { status: filters.status }),
    ...(filters.district && { district: filters.district }),
    ...(filters.crimeType && { crimeType: filters.crimeType }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
    ...(filters.assignedOfficer && { assignedOfficer: filters.assignedOfficer }),
  }), [page, pageSize, sortField, sortOrder, filters]);

  const { data, isLoading, isFetching, isError, error, refetch } = useFetchFIRsQuery(queryParams);

  const { data: viewData, isLoading: viewLoading } = useFetchFIRByIdQuery(viewId ?? '', { skip: !viewId });

  // ---- mutations ----
  const [createFIR, { isLoading: isCreating }] = useCreateFIRMutation();
  const [updateFIR, { isLoading: isUpdating }] = useUpdateFIRMutation();
  const [assignOfficer, { isLoading: isAssigning }] = useAssignFirOfficerMutation();
  const [closeFIR, { isLoading: isClosing }] = useCloseFIRMutation();
  const [deleteFIR, { isLoading: isDeleting }] = useDeleteFIRMutation();

  const firs = data?.data ?? [];
  const totalRecords = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // ---- KPI calculations ----
  const kpiData = useMemo(() => {
    const all = firs;
    return {
      total: totalRecords,
      pending: all.filter(f => f.status === 'pending').length,
      investigation: all.filter(f => f.status === 'investigation').length,
      solved: all.filter(f => f.status === 'solved').length,
      closed: all.filter(f => f.status === 'closed').length,
    };
  }, [firs, totalRecords]);

  // ---- sort handler ----
  const handleSort = useCallback((field: string) => {
    setSortField(prev => {
      if (prev === field) {
        setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortOrder('asc');
      return field;
    });
    setPage(1);
  }, []);

  // ---- selection handlers ----
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === firs.length ? new Set() : new Set(firs.map(f => f.id)));
  }, [firs]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ---- filter handler ----
  const updateFilter = useCallback((key: keyof FIRFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchInput('');
    setPage(1);
  }, []);

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  // ---- export CSV ----
  const handleExport = useCallback(() => {
    const csvRows = ['FIR Number,Crime Type,Severity,Priority,Complainant,District,State,Status,Assigned Officer,Incident Date,Created At'];
    firs.forEach(f => {
      csvRows.push([
        f.firNumber, f.crimeType, (f as any).severity || '', (f as any).priority || '',
        f.complainantName, f.district, (f as any).state || '', f.status,
        f.assignedOfficer?.name || '', formatDate(f.incidentDate), formatDate(f.createdAt),
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `firs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    addToast('FIR data exported successfully', 'success');
  }, [firs, addToast]);

  // ---- create/edit ----
  const handleCreate = useCallback(async (formData: CreateFIRRequest) => {
    try {
      await createFIR(formData).unwrap();
      addToast('FIR created successfully. Dashboard, Heatmap, Hotspots, and Analytics updated.', 'success');
      setShowCreateModal(false);
      setPage(1);
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to create FIR';
      addToast(msg, 'error');
    }
  }, [createFIR, addToast]);

  const handleUpdate = useCallback(async (id: string, formData: UpdateFIRRequest) => {
    try {
      await updateFIR({ id, data: formData }).unwrap();
      addToast('FIR updated successfully. All linked modules synchronized.', 'success');
      setEditId(null);
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to update FIR';
      addToast(msg, 'error');
    }
  }, [updateFIR, addToast]);

  // ---- assign officer ----
  const handleAssign = useCallback(async (id: string, data: AssignOfficerRequest) => {
    try {
      await assignOfficer({ id, data }).unwrap();
      addToast('Officer assigned. Notification sent and audit log recorded.', 'success');
      setAssignId(null);
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to assign officer';
      addToast(msg, 'error');
    }
  }, [assignOfficer, addToast]);

  // ---- close ----
  const handleClose = useCallback(async (id: string, data: CloseFIRRequest) => {
    try {
      await closeFIR({ id, data }).unwrap();
      addToast('FIR closed. Analytics and Dashboard updated.', 'success');
      setCloseId(null);
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to close FIR';
      addToast(msg, 'error');
    }
  }, [closeFIR, addToast]);

  // ---- delete ----
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFIR(id).unwrap();
      addToast('FIR deleted. Audit log recorded.', 'success');
      setDeleteId(null);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to delete FIR';
      addToast(msg, 'error');
    }
  }, [deleteFIR, addToast]);

  // ---- quick status change ----
  const handleQuickStatus = useCallback(async (id: string, newStatus: string) => {
    try {
      await updateFIR({ id, data: { status: newStatus } }).unwrap();
      addToast(`Status changed to ${STATUS_LABELS[newStatus] || newStatus}`, 'success');
    } catch (err: unknown) {
      addToast('Failed to change status', 'error');
    }
  }, [updateFIR, addToast]);

  // ---- bulk assign ----
  const handleBulkAssign = useCallback(async () => {
    if (!bulkAssignOfficerId || selectedIds.size === 0) return;
    let success = 0;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await assignOfficer({ id, data: { officerId: bulkAssignOfficerId } }).unwrap();
        success++;
      } catch { /* skip failed */ }
    }
    addToast(`Assigned officer to ${success} of ${ids.length} FIRs`, success === ids.length ? 'success' : 'info');
    setSelectedIds(new Set());
    setBulkAssignOfficerId('');
  }, [bulkAssignOfficerId, selectedIds, assignOfficer, addToast]);

  // ---- bulk delete ----
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    let success = 0;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await deleteFIR(id).unwrap();
        success++;
      } catch { /* skip failed */ }
    }
    addToast(`Deleted ${success} of ${ids.length} FIRs`, success === ids.length ? 'success' : 'info');
    setSelectedIds(new Set());
  }, [selectedIds, deleteFIR, addToast]);

  const SortIcon = (field: string) =>
    sortField === field
      ? sortOrder === 'asc'
        ? <ArrowUp className="w-3 h-3 text-blue-600" />
        : <ArrowDown className="w-3 h-3 text-blue-600" />
      : <ArrowUpDown className="w-3 h-3 text-slate-300" />;

  // ---- render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">FIR Management</h2>
          <p className="text-sm text-slate-500">Create, assign, and manage First Information Reports</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn("bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2", showFilters && "bg-slate-100")}
          >
            <Filter className="w-4 h-4" /> Filter {hasActiveFilters && <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{Object.values(filters).filter(Boolean).length}</span>}
          </button>
          <button onClick={handleExport} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> New FIR
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard icon={<FileText className="w-5 h-5 text-blue-600" />} label="Total FIRs" value={kpiData.total} color="bg-blue-50" />
        <KPICard icon={<Clock className="w-5 h-5 text-yellow-600" />} label="Pending" value={kpiData.pending} color="bg-yellow-50" subtext="Awaiting assignment" />
        <KPICard icon={<Activity className="w-5 h-5 text-orange-600" />} label="Investigation" value={kpiData.investigation} color="bg-orange-50" subtext="In progress" />
        <KPICard icon={<CheckCircle className="w-5 h-5 text-green-600" />} label="Solved" value={kpiData.solved} color="bg-green-50" subtext="Cases resolved" />
        <KPICard icon={<Shield className="w-5 h-5 text-slate-600" />} label="Closed" value={kpiData.closed} color="bg-slate-50" subtext="Archived" />
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <input
                type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Search FIRs..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {FIR_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assigned Officer</label>
              <input type="text" value={filters.assignedOfficer} onChange={e => updateFilter('assignedOfficer', e.target.value)} placeholder="Officer name..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2">
                <X className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={clearSelection} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Clear</button>
          <div className="h-4 w-px bg-blue-200" />
          <select
            value={bulkAssignOfficerId}
            onChange={e => setBulkAssignOfficerId(e.target.value)}
            className="px-2 py-1 border border-blue-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Assign officer...</option>
            <option value="off1">Inspector Sharma</option>
            <option value="off2">SI Verma</option>
            <option value="off3">Constable Patel</option>
            <option value="off4">ASI Gupta</option>
            <option value="off5">Inspector Singh</option>
          </select>
          <button onClick={handleBulkAssign} disabled={!bulkAssignOfficerId} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <UserPlus className="w-3 h-3 inline mr-1" />Assign
          </button>
          <button onClick={handleBulkDelete} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700 transition-colors">
            <Trash2 className="w-3 h-3 inline mr-1" />Delete Selected
          </button>
        </div>
      )}

        {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden relative">
        {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-600 mb-1">Failed to load FIRs</p>
            <p className="text-xs text-slate-500 mb-4">{(error as { data?: { message?: string }; message?: string })?.data?.message ?? (error as { message?: string })?.message ?? 'An unexpected error occurred'}</p>
            <button onClick={refetch} className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-red-100 transition-colors">Retry</button>
          </div>
        ) : firs.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <FileText className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No FIRs found</p>
            <p className="text-xs text-slate-400 mb-4">{hasActiveFilters ? 'Try adjusting your filters' : 'Create your first FIR to get started'}</p>
            {hasActiveFilters ? (
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors">Clear Filters</button>
            ) : (
              <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"><Plus className="w-4 h-4 inline mr-1" /> New FIR</button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === firs.length && firs.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('firNumber')}>
                      <span className="flex items-center gap-1">FIR # {SortIcon('firNumber')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('crimeType')}>
                      <span className="flex items-center gap-1">Crime Type {SortIcon('crimeType')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold">Severity</th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('complainantName')}>
                      <span className="flex items-center gap-1">Complainant {SortIcon('complainantName')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('district')}>
                      <span className="flex items-center gap-1">District {SortIcon('district')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('incidentDate')}>
                      <span className="flex items-center gap-1">Incident Date {SortIcon('incidentDate')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('status')}>
                      <span className="flex items-center gap-1">Status {SortIcon('status')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('assignedOfficerId')}>
                      <span className="flex items-center gap-1">Assigned To {SortIcon('assignedOfficerId')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {firs.map((fir: FIR) => (
                    <tr key={fir.id} className={cn("hover:bg-slate-50 transition-colors", selectedIds.has(fir.id) && "bg-blue-50/40")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(fir.id)}
                          onChange={() => toggleSelect(fir.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setViewId(fir.id)} className="text-blue-600 font-mono text-xs font-medium hover:text-blue-800 transition-colors">
                          {fir.firNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{fir.crimeType}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", SEVERITY_STYLES[(fir as any).severity] || 'bg-slate-100 text-slate-600')}>
                          {(fir as any).severity || 'medium'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fir.complainantName}</td>
                      <td className="px-4 py-3 text-slate-600">{fir.district}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(fir.incidentDate)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={fir.status}
                          onChange={e => handleQuickStatus(fir.id, e.target.value)}
                          className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500", STATUS_STYLES[fir.status] || 'bg-slate-100 text-slate-600')}
                        >
                          {FIR_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fir.assignedOfficer?.name ?? '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewId(fir.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(fir.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => setAssignId(fir.id)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Assign Officer"><UserCheck className="w-4 h-4" /></button>
                          {fir.status !== 'closed' && fir.status !== 'solved' && (
                            <button onClick={() => setCloseId(fir.id)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title="Close"><CheckCircle className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => setDeleteId(fir.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-xs">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs">{Math.min((page - 1) * pageSize + 1, totalRecords)}-{Math.min(page * pageSize, totalRecords)} of {totalRecords}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page <= 1} className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-2" /></button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-3 py-1 text-xs font-medium text-slate-600">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-2" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <FIRFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          isLoading={isCreating}
        />
      )}

      {/* Edit Modal */}
      {editId && (
        <EditFIRModal
          firId={editId}
          onClose={() => setEditId(null)}
          onSubmit={(data: UpdateFIRRequest) => handleUpdate(editId, data)}
          isLoading={isUpdating}
        />
      )}

      {/* View Drawer */}
      {viewId && (
        <FIRDetailDrawer
          firId={viewId}
          data={viewData ?? null}
          isLoading={viewLoading}
          onClose={() => { setViewId(null); }}
        />
      )}

      {/* Assign Officer Modal */}
      {assignId && (
        <AssignOfficerModal
          firId={assignId}
          onClose={() => setAssignId(null)}
          onSubmit={(data: AssignOfficerRequest) => handleAssign(assignId, data)}
          isLoading={isAssigning}
        />
      )}

      {/* Close Modal */}
      {closeId && (
        <CloseFIRModal
          firId={closeId}
          onClose={() => setCloseId(null)}
          onSubmit={(data: CloseFIRRequest) => handleClose(closeId, data)}
          isLoading={isClosing}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <ConfirmDialog
          title="Delete FIR"
          message="Are you sure you want to delete this FIR? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function FIRFormModal({
  onClose,
  onSubmit,
  isLoading,
  initial,
}: {
  onClose: () => void;
  onSubmit: (data: CreateFIRRequest) => void;
  isLoading?: boolean;
  initial?: CreateFIRRequest;
}) {
  const [form, setForm] = useState<CreateFIRRequest>(
    initial ?? {
      crimeType: '',
      severity: 'medium',
      priority: 'medium',
      incidentDate: new Date().toISOString().split('T')[0],
      location: '',
      district: '',
      state: '',
      city: '',
      policeStation: '',
      complainantName: '',
      complainantPhone: '',
      complainantEmail: '',
      victims: [],
      suspects: [],
      witnesses: [],
      description: '',
    }
  );

  const [errors, setErrors] = useState<Partial<Record<keyof CreateFIRRequest, string>>>({});
  const [activeTab, setActiveTab] = useState<'basic' | 'complainant' | 'victim' | 'suspect' | 'witness'>('basic');

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof CreateFIRRequest, string>> = {};
    if (!form.crimeType) e.crimeType = 'Required';
    if (!form.incidentDate) e.incidentDate = 'Required';
    if (!form.location) e.location = 'Required';
    if (!form.district) e.district = 'Required';
    if (!form.complainantName) e.complainantName = 'Required';
    if (!form.description) e.description = 'Required';
    if (form.complainantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.complainantEmail)) e.complainantEmail = 'Invalid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSubmit(form);
  }, [form, validate, onSubmit]);

  const set = (key: keyof CreateFIRRequest, value: any) => {
    setForm(p => ({ ...p, [key]: value }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const addVictim = () => set('victims', [...(form.victims || []), { name: '', age: undefined, gender: '', phone: '', address: '' }]);
  const removeVictim = (i: number) => set('victims', (form.victims || []).filter((_, idx) => idx !== i));
  const updateVictim = (i: number, key: string, value: any) => {
    const v = [...(form.victims || [])];
    (v[i] as any)[key] = value;
    set('victims', v);
  };

  const addSuspect = () => set('suspects', [...(form.suspects || []), { name: '', alias: '', description: '', age: undefined, gender: '' }]);
  const removeSuspect = (i: number) => set('suspects', (form.suspects || []).filter((_, idx) => idx !== i));
  const updateSuspect = (i: number, key: string, value: any) => {
    const s = [...(form.suspects || [])];
    (s[i] as any)[key] = value;
    set('suspects', s);
  };

  const addWitness = () => set('witnesses', [...(form.witnesses || []), { name: '', contact: '', statement: '' }]);
  const removeWitness = (i: number) => set('witnesses', (form.witnesses || []).filter((_, idx) => idx !== i));
  const updateWitness = (i: number, key: string, value: any) => {
    const w = [...(form.witnesses || [])];
    (w[i] as any)[key] = value;
    set('witnesses', w);
  };

  const TABS = [
    { key: 'basic', label: 'Crime Details' },
    { key: 'complainant', label: 'Complainant' },
    { key: 'victim', label: `Victims (${(form.victims || []).length})` },
    { key: 'suspect', label: `Suspects (${(form.suspects || []).length})` },
    { key: 'witness', label: `Witnesses (${(form.witnesses || []).length})` },
  ] as const;

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{initial ? 'Edit FIR' : 'New FIR'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap", activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Crime Type *</label>
                <select value={form.crimeType} onChange={e => set('crimeType', e.target.value)} className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.crimeType ? 'border-red-300' : 'border-slate-200')}>
                  <option value="">Select...</option>
                  {CRIME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.crimeType && <p className="text-xs text-red-500 mt-0.5">{errors.crimeType}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Incident Date *</label>
                <input type="date" value={form.incidentDate as string} onChange={e => set('incidentDate', e.target.value)} className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.incidentDate ? 'border-red-300' : 'border-slate-200')} />
                {errors.incidentDate && <p className="text-xs text-red-500 mt-0.5">{errors.incidentDate}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Severity</label>
                <select value={form.severity || 'medium'} onChange={e => set('severity', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {FIR_SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                <select value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {FIR_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Location *</label>
                <input type="text" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Address / location of incident" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.location ? 'border-red-300' : 'border-slate-200')} />
                {errors.location && <p className="text-xs text-red-500 mt-0.5">{errors.location}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
                <input type="text" value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="State" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">District *</label>
                <input type="text" value={form.district} onChange={e => set('district', e.target.value)} placeholder="District name" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.district ? 'border-red-300' : 'border-slate-200')} />
                {errors.district && <p className="text-xs text-red-500 mt-0.5">{errors.district}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
                <input type="text" value={form.city || ''} onChange={e => set('city', e.target.value)} placeholder="City" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Police Station</label>
                <input type="text" value={form.policeStation || ''} onChange={e => set('policeStation', e.target.value)} placeholder="Police station name" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Description *</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} placeholder="Detailed description of the incident..." className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none", errors.description ? 'border-red-300' : 'border-slate-200')} />
                {errors.description && <p className="text-xs text-red-500 mt-0.5">{errors.description}</p>}
              </div>
            </div>
          )}

          {activeTab === 'complainant' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Complainant Name *</label>
                <input type="text" value={form.complainantName} onChange={e => set('complainantName', e.target.value)} placeholder="Full name" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.complainantName ? 'border-red-300' : 'border-slate-200')} />
                {errors.complainantName && <p className="text-xs text-red-500 mt-0.5">{errors.complainantName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                <input type="text" value={form.complainantPhone ?? ''} onChange={e => set('complainantPhone', e.target.value)} placeholder="Phone number" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" value={form.complainantEmail ?? ''} onChange={e => set('complainantEmail', e.target.value)} placeholder="Email address" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.complainantEmail ? 'border-red-300' : 'border-slate-200')} />
                {errors.complainantEmail && <p className="text-xs text-red-500 mt-0.5">{errors.complainantEmail}</p>}
              </div>
            </div>
          )}

          {activeTab === 'victim' && (
            <div className="space-y-4">
              {(form.victims || []).map((victim, i) => (
                <div key={i} className="border border-slate-200 rounded-md p-4 space-y-3 relative">
                  <button type="button" onClick={() => removeVictim(i)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
                      <input type="text" value={victim.name} onChange={e => updateVictim(i, 'name', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Age</label>
                      <input type="number" value={victim.age || ''} onChange={e => updateVictim(i, 'age', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Gender</label>
                      <select value={victim.gender || ''} onChange={e => updateVictim(i, 'gender', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                      <input type="text" value={victim.phone || ''} onChange={e => updateVictim(i, 'phone', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addVictim} className="w-full py-2 border border-dashed border-slate-300 rounded-md text-sm text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Victim
              </button>
            </div>
          )}

          {activeTab === 'suspect' && (
            <div className="space-y-4">
              {(form.suspects || []).map((suspect, i) => (
                <div key={i} className="border border-slate-200 rounded-md p-4 space-y-3 relative">
                  <button type="button" onClick={() => removeSuspect(i)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
                      <input type="text" value={suspect.name} onChange={e => updateSuspect(i, 'name', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Alias</label>
                      <input type="text" value={suspect.alias || ''} onChange={e => updateSuspect(i, 'alias', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                      <input type="text" value={suspect.description || ''} onChange={e => updateSuspect(i, 'description', e.target.value)} placeholder="Physical description, known habits..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addSuspect} className="w-full py-2 border border-dashed border-slate-300 rounded-md text-sm text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Suspect
              </button>
            </div>
          )}

          {activeTab === 'witness' && (
            <div className="space-y-4">
              {(form.witnesses || []).map((witness, i) => (
                <div key={i} className="border border-slate-200 rounded-md p-4 space-y-3 relative">
                  <button type="button" onClick={() => removeWitness(i)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
                      <input type="text" value={witness.name} onChange={e => updateWitness(i, 'name', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Contact</label>
                      <input type="text" value={witness.contact || ''} onChange={e => updateWitness(i, 'contact', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Statement</label>
                      <textarea value={witness.statement || ''} onChange={e => updateWitness(i, 'statement', e.target.value)} rows={3} placeholder="Witness statement..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addWitness} className="w-full py-2 border border-dashed border-slate-300 rounded-md text-sm text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Witness
              </button>
            </div>
          )}
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Update FIR' : 'Create FIR'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function EditFIRModal({
  firId,
  onClose,
  onSubmit,
  isLoading,
}: {
  firId: string;
  onClose: () => void;
  onSubmit: (data: UpdateFIRRequest) => void;
  isLoading?: boolean;
}) {
  const { data: fir, isLoading: fetching } = useFetchFIRByIdQuery(firId);

  if (fetching) {
    return (
      <DialogOverlay onClose={onClose}>
        <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md p-12 flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </DialogOverlay>
    );
  }

  if (!fir) return null;

  const initial: CreateFIRRequest = {
    crimeType: fir.crimeType,
    severity: (fir as any).severity || 'medium',
    priority: (fir as any).priority || 'medium',
    incidentDate: new Date(fir.incidentDate).toISOString().split('T')[0],
    location: fir.location,
    district: fir.district,
    state: (fir as any).state || '',
    city: (fir as any).city || '',
    policeStation: (fir as any).policeStation || '',
    complainantName: fir.complainantName,
    complainantPhone: fir.complainantPhone ?? '',
    complainantEmail: fir.complainantEmail ?? '',
    victims: (fir as any).victims || [],
    suspects: (fir as any).suspects || [],
    witnesses: (fir as any).witnesses || [],
    description: fir.description,
  };

  return (
    <FIRFormModal
      initial={initial}
      onClose={onClose}
      onSubmit={(data: CreateFIRRequest) => onSubmit(data as UpdateFIRRequest)}
      isLoading={isLoading}
    />
  );
}

// ============================================================================
// FIR Detail Drawer with Tabs
// ============================================================================

function FIRDetailDrawer({
  firId,
  data,
  isLoading,
  onClose,
}: {
  firId: string;
  data: FIR | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'crime' | 'victim' | 'timeline' | 'map'>('overview');

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">FIR Details</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {(['overview', 'crime', 'victim', 'timeline', 'map'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize whitespace-nowrap", tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-6 bg-slate-100 animate-pulse rounded" />)}
            </div>
          ) : !data ? (
            <p className="text-sm text-slate-500 text-center py-8">FIR not found</p>
          ) : (
            <>
              {tab === 'overview' && (
                <dl className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">FIR Number</dt>
                    <dd className="col-span-2 text-slate-800 font-mono">{data.firNumber}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Status</dt>
                    <dd className="col-span-2">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", STATUS_STYLES[data.status] || 'bg-slate-100 text-slate-600')}>
                        {STATUS_LABELS[data.status] || data.status}
                      </span>
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Crime Type</dt>
                    <dd className="col-span-2 text-slate-800 font-medium">{data.crimeType}</dd>
                  </div>
                  {(data as any).severity && (
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="text-slate-500 font-medium">Severity</dt>
                      <dd className="col-span-2">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", SEVERITY_STYLES[(data as any).severity])}>{(data as any).severity}</span>
                      </dd>
                    </div>
                  )}
                  {(data as any).priority && (
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="text-slate-500 font-medium">Priority</dt>
                      <dd className="col-span-2">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", PRIORITY_STYLES[(data as any).priority])}>{(data as any).priority}</span>
                      </dd>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Incident Date</dt>
                    <dd className="col-span-2 text-slate-800">{formatDate(data.incidentDate)}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Location</dt>
                    <dd className="col-span-2 text-slate-800">{data.location}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">District</dt>
                    <dd className="col-span-2 text-slate-800">{data.district}</dd>
                  </div>
                  {(data as any).state && (
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="text-slate-500 font-medium">State</dt>
                      <dd className="col-span-2 text-slate-800">{(data as any).state}</dd>
                    </div>
                  )}
                  {(data as any).policeStation && (
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="text-slate-500 font-medium">Police Station</dt>
                      <dd className="col-span-2 text-slate-800">{(data as any).policeStation}</dd>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Complainant</dt>
                    <dd className="col-span-2 text-slate-800">{data.complainantName}</dd>
                  </div>
                  {data.complainantPhone && (
                    <div className="grid grid-cols-3 gap-2">
                      <dt className="text-slate-500 font-medium">Phone</dt>
                      <dd className="col-span-2 text-slate-800">{data.complainantPhone}</dd>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Assigned Officer</dt>
                    <dd className="col-span-2 text-slate-800">{data.assignedOfficer?.name ?? 'Not assigned'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-slate-500 font-medium">Created</dt>
                    <dd className="col-span-2 text-slate-500 text-xs">{formatDateTime(data.createdAt)}</dd>
                  </div>
                </dl>
              )}

              {tab === 'crime' && (
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium text-slate-700 mb-2">Description</h4>
                    <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-md">{data.description}</p>
                  </div>
                  {(data as any).suspects && (data as any).suspects.length > 0 && (
                    <div>
                      <h4 className="font-medium text-slate-700 mb-2">Suspects ({(data as any).suspects.length})</h4>
                      {(data as any).suspects.map((s: any, i: number) => (
                        <div key={i} className="bg-red-50 border border-red-100 rounded-md p-3 mb-2">
                          <p className="font-medium text-slate-800">{s.name}{s.alias ? ` aka "${s.alias}"` : ''}</p>
                          {s.description && <p className="text-xs text-slate-600 mt-1">{s.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {data.closureReason && (
                    <div>
                      <h4 className="font-medium text-slate-700 mb-2">Closure Details</h4>
                      <div className="bg-slate-50 p-3 rounded-md space-y-1">
                        <p className="text-xs text-slate-600"><strong>Reason:</strong> {data.closureReason}</p>
                        {data.resolutionNotes && <p className="text-xs text-slate-600"><strong>Notes:</strong> {data.resolutionNotes}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'victim' && (
                <div className="space-y-4 text-sm">
                  {(data as any).victims && (data as any).victims.length > 0 ? (
                    (data as any).victims.map((v: any, i: number) => (
                      <div key={i} className="border border-slate-200 rounded-md p-4">
                        <p className="font-medium text-slate-800">{v.name}</p>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                          {v.age && <p>Age: {v.age}</p>}
                          {v.gender && <p>Gender: {v.gender}</p>}
                          {v.phone && <p>Phone: {v.phone}</p>}
                          {v.address && <p>Address: {v.address}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-center py-4">No victim details recorded</p>
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div className="space-y-4 text-sm">
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                    <div className="relative">
                      <div className="absolute -left-7 w-4 h-4 bg-blue-500 rounded-full border-2 border-white" />
                      <p className="font-medium text-slate-800">FIR Created</p>
                      <p className="text-xs text-slate-500">{formatDateTime(data.createdAt)}</p>
                    </div>
                    {data.assignedOfficer && (
                      <div className="relative">
                        <div className="absolute -left-7 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                        <p className="font-medium text-slate-800">Officer Assigned: {data.assignedOfficer.name}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(data.updatedAt)}</p>
                      </div>
                    )}
                    {data.status === 'investigation' && (
                      <div className="relative">
                        <div className="absolute -left-7 w-4 h-4 bg-orange-500 rounded-full border-2 border-white" />
                        <p className="font-medium text-slate-800">Investigation Started</p>
                      </div>
                    )}
                    {data.status === 'solved' && (
                      <div className="relative">
                        <div className="absolute -left-7 w-4 h-4 bg-green-600 rounded-full border-2 border-white" />
                        <p className="font-medium text-slate-800">Case Solved</p>
                        {data.resolutionNotes && <p className="text-xs text-slate-600 mt-1">{data.resolutionNotes}</p>}
                      </div>
                    )}
                    {data.closedAt && (
                      <div className="relative">
                        <div className="absolute -left-7 w-4 h-4 bg-slate-400 rounded-full border-2 border-white" />
                        <p className="font-medium text-slate-800">Case Closed</p>
                        <p className="text-xs text-slate-500">{formatDateTime(data.closedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'map' && (
                <div className="space-y-4 text-sm">
                  {data.latitude && data.longitude ? (
                    <div className="bg-slate-100 rounded-md p-4 text-center">
                      <MapPin className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                      <p className="font-medium text-slate-800">{data.location}</p>
                      <p className="text-xs text-slate-500 mt-1">{data.district}{(data as any).state ? `, ${(data as any).state}` : ''}</p>
                      <p className="text-[10px] text-slate-400 mt-2">Lat: {data.latitude.toFixed(4)}, Lng: {data.longitude.toFixed(4)}</p>
                      <a
                        href={`https://www.google.com/maps?q=${data.latitude},${data.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-8">No location coordinates available</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Close</button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function AssignOfficerModal({
  firId,
  onClose,
  onSubmit,
  isLoading,
}: {
  firId: string;
  onClose: () => void;
  onSubmit: (data: AssignOfficerRequest) => void;
  isLoading?: boolean;
}) {
  const [officerId, setOfficerId] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (officerId) onSubmit({ officerId });
  }, [officerId, onSubmit]);

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Assign Officer</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Assign an officer to FIR <span className="font-mono font-medium text-slate-800">{firId}</span></p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Select Officer *</label>
            <select value={officerId} onChange={e => setOfficerId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Choose...</option>
              <option value="off1">Inspector Sharma (Central District)</option>
              <option value="off2">SI Verma (West District)</option>
              <option value="off3">Constable Patel (East District)</option>
              <option value="off4">ASI Gupta (North District)</option>
              <option value="off5">Inspector Singh (South District)</option>
            </select>
          </div>
          <p className="text-[10px] text-slate-400">A notification will be sent to the officer and an audit log will be recorded.</p>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!officerId || isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <UserCheck className="w-4 h-4" /> Assign
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function CloseFIRModal({
  firId,
  onClose,
  onSubmit,
  isLoading,
}: {
  firId: string;
  onClose: () => void;
  onSubmit: (data: CloseFIRRequest) => void;
  isLoading?: boolean;
}) {
  const [closureReason, setClosureReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!closureReason.trim()) { setError('Closure reason is required'); return; }
    onSubmit({ closureReason, resolutionNotes: resolutionNotes || undefined });
  }, [closureReason, resolutionNotes, onSubmit]);

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Close FIR</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Close FIR <span className="font-mono font-medium text-slate-800">{firId}</span></p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Closure Reason *</label>
            <textarea value={closureReason} onChange={e => { setClosureReason(e.target.value); setError(''); }} rows={3} placeholder="Reason for closing..." className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none", error ? 'border-red-300' : 'border-slate-200')} />
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Resolution Notes (optional)</label>
            <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3} placeholder="Additional notes..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
          <p className="text-[10px] text-slate-400">Closing will update Analytics, Dashboard, and Risk Scores. An audit log will be recorded.</p>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!closureReason.trim() || isLoading} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" /> Close FIR
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
