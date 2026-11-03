import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Briefcase, Plus, Search, Filter, X,
  Eye, Edit3, Trash2, UserCheck, CheckCircle, AlertCircle,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Download, Loader2, Shield,
  Activity, TrendingUp, AlertTriangle, Camera,
  Users, Paperclip, StickyNote, GitBranch,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { DialogOverlay, ConfirmDialog } from '../../components/Dialog';
import {
  useFetchCasesQuery,
  useFetchCaseByIdQuery,
  useCreateCaseMutation,
  useUpdateCaseMutation,
  useDeleteCaseMutation,
  useFetchFIRsQuery,
} from '../../store/api';
import type { Case } from '../../types/entities';
import type { CreateCaseRequest, UpdateCaseRequest } from '../../types/api';
import {
  CASE_STATUS_OPTIONS, CASE_PRIORITY_OPTIONS, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE,
  CRIME_TYPES, CASE_CATEGORY_OPTIONS,
} from '../../constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  investigation: 'bg-blue-100 text-blue-700',
  solved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
  archived: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  investigation: 'Investigation',
  solved: 'Solved',
  closed: 'Closed',
  archived: 'Archived',
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const TIMELINE_ICONS: Record<string, React.ReactNode> = {
  created: <CheckCircle className="w-4 h-4 text-blue-500" />,
  assigned: <UserCheck className="w-4 h-4 text-green-500" />,
  evidence: <Camera className="w-4 h-4 text-purple-500" />,
  suspect: <AlertTriangle className="w-4 h-4 text-orange-500" />,
  arrested: <Shield className="w-4 h-4 text-red-500" />,
  solved: <TrendingUp className="w-4 h-4 text-emerald-500" />,
  closed: <CheckCircle className="w-4 h-4 text-slate-400" />,
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

interface CaseFilters {
  search: string;
  status: string;
  priority: string;
  category: string;
  assignedOfficer: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: CaseFilters = {
  search: '', status: '', priority: '', category: '',
  assignedOfficer: '', dateFrom: '', dateTo: '',
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KPICard({ icon, label, value, color, subtext }: { icon: React.ReactNode; label: string; value: number | string; color: string; subtext?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>{icon}</div>
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

export default function CaseManagement() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState<CaseFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setFilters(prev => ({ ...prev, search: searchInput })); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => ({
    page, pageSize, sortBy: sortField, sortOrder,
    ...(filters.search && { search: filters.search }),
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.category && { category: filters.category }),
    ...(filters.assignedOfficer && { assignedOfficer: filters.assignedOfficer }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
  }), [page, pageSize, sortField, sortOrder, filters]);

  const { data, isLoading, isFetching, isError, error, refetch } = useFetchCasesQuery(queryParams);
  const { data: viewData, isLoading: viewLoading } = useFetchCaseByIdQuery(viewId ?? '', { skip: !viewId });
  const { data: firsData } = useFetchFIRsQuery({ page: 1, pageSize: 100 });

  const [createCase, { isLoading: isCreating }] = useCreateCaseMutation();
  const [updateCase, { isLoading: isUpdating }] = useUpdateCaseMutation();
  const [deleteCase, { isLoading: isDeleting }] = useDeleteCaseMutation();

  const cases = data?.data ?? [];
  const totalRecords = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const kpiData = useMemo(() => ({
    total: totalRecords,
    active: cases.filter(c => c.status === 'active').length,
    investigation: cases.filter(c => c.status === 'investigation').length,
    solved: cases.filter(c => c.status === 'solved').length,
    closed: cases.filter(c => c.status === 'closed' || c.status === 'archived').length,
  }), [cases, totalRecords]);

  const handleSort = useCallback((field: string) => {
    setSortField(prev => { if (prev === field) { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); return prev; } setSortOrder('asc'); return field; });
    setPage(1);
  }, []);

  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => prev.size === cases.length ? new Set() : new Set(cases.map(c => c.id))); }, [cases]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const updateFilter = useCallback((key: keyof CaseFilters, value: string) => { setFilters(prev => ({ ...prev, [key]: value })); setPage(1); }, []);
  const resetFilters = useCallback(() => { setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(1); }, []);
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const handleExport = useCallback(() => {
    const csv = ['Case Number,Name,Status,Priority,Category,Crime Type,District,Lead Officer,Officers,Created At'];
    cases.forEach(c => { csv.push([c.caseNumber, c.name, c.status, c.priority, c.category || '', c.crimeType || '', c.district || '', (c as any).leadOfficer?.name || '', c.assignedOfficers?.map(o => o.name).join('; ') || '', formatDate(c.createdAt)].join(',')); });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `cases-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    addToast('Cases exported successfully', 'success');
  }, [cases, addToast]);

  const handleCreate = useCallback(async (formData: CreateCaseRequest) => {
    try { await createCase(formData).unwrap(); addToast('Case created. Dashboard, Analytics, and Risk Scores updated.', 'success'); setShowCreateModal(false); setPage(1); }
    catch (err: unknown) { addToast((err as any)?.data?.message ?? 'Failed to create case', 'error'); }
  }, [createCase, addToast]);

  const handleUpdate = useCallback(async (id: string, formData: UpdateCaseRequest) => {
    try { await updateCase({ id, data: formData }).unwrap(); addToast('Case updated. All linked modules synchronized.', 'success'); setEditId(null); }
    catch (err: unknown) { addToast((err as any)?.data?.message ?? 'Failed to update case', 'error'); }
  }, [updateCase, addToast]);

  const handleQuickStatus = useCallback(async (id: string, newStatus: string) => {
    try { await updateCase({ id, data: { status: newStatus } }).unwrap(); addToast(`Status changed to ${STATUS_LABELS[newStatus] || newStatus}`, 'success'); }
    catch { addToast('Failed to change status', 'error'); }
  }, [updateCase, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    try { await deleteCase(id).unwrap(); addToast('Case deleted. Audit log recorded.', 'success'); setDeleteId(null); setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    catch (err: unknown) { addToast((err as any)?.data?.message ?? 'Failed to delete case', 'error'); }
  }, [deleteCase, addToast]);

  const SortIcon = (field: string) => sortField === field ? (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />) : <ArrowUpDown className="w-3 h-3 text-slate-300" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">Case Management</h2>
          <p className="text-sm text-slate-500">Track and manage ongoing criminal investigations</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowFilters(!showFilters)} className={cn("bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2", showFilters && "bg-slate-100")}>
            <Filter className="w-4 h-4" /> Filter {hasActiveFilters && <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{Object.values(filters).filter(Boolean).length}</span>}
          </button>
          <button onClick={handleExport} className="bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Case
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard icon={<Briefcase className="w-5 h-5 text-blue-600" />} label="Total Cases" value={kpiData.total} color="bg-blue-50" />
        <KPICard icon={<Activity className="w-5 h-5 text-green-600" />} label="Active" value={kpiData.active} color="bg-green-50" subtext="Open investigations" />
        <KPICard icon={<Search className="w-5 h-5 text-blue-600" />} label="Investigation" value={kpiData.investigation} color="bg-blue-50" subtext="Under investigation" />
        <KPICard icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} label="Solved" value={kpiData.solved} color="bg-emerald-50" subtext="Cases resolved" />
        <KPICard icon={<CheckCircle className="w-5 h-5 text-slate-600" />} label="Closed/Archived" value={kpiData.closed} color="bg-slate-50" subtext="Completed" />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search cases..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {CASE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select value={filters.priority} onChange={e => updateFilter('priority', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Priorities</option>
                {CASE_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
              <select value={filters.category} onChange={e => updateFilter('category', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Categories</option>
                {CASE_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assigned Officer</label>
              <input type="text" value={filters.assignedOfficer} onChange={e => updateFilter('assignedOfficer', e.target.value)} placeholder="Officer name..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
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

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={clearSelection} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden relative">
        {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
        {isLoading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}</div>
        ) : isError ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-600 mb-1">Failed to load cases</p>
            <button onClick={refetch} className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-red-100 transition-colors">Retry</button>
          </div>
        ) : cases.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Briefcase className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No cases found</p>
            <p className="text-xs text-slate-400 mb-4">{hasActiveFilters ? 'Try adjusting your filters' : 'Create your first case to get started'}</p>
            {hasActiveFilters ? <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors">Clear Filters</button> : <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"><Plus className="w-4 h-4 inline mr-1" /> New Case</button>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 w-10"><input type="checkbox" checked={selectedIds.size === cases.length && cases.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('caseNumber')}><span className="flex items-center gap-1">Case # {SortIcon('caseNumber')}</span></th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('name')}><span className="flex items-center gap-1">Name {SortIcon('name')}</span></th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('status')}><span className="flex items-center gap-1">Status {SortIcon('status')}</span></th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('priority')}><span className="flex items-center gap-1">Priority {SortIcon('priority')}</span></th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('createdAt')}><span className="flex items-center gap-1">Created {SortIcon('createdAt')}</span></th>
                    <th className="px-4 py-3 font-bold">Officers</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cases.map((c: Case) => (
                    <tr key={c.id} className={cn("hover:bg-slate-50 transition-colors", selectedIds.has(c.id) && "bg-blue-50/40")}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></td>
                      <td className="px-4 py-3"><button onClick={() => setViewId(c.id)} className="text-blue-600 font-mono text-xs font-medium hover:text-blue-800 transition-colors">{c.caseNumber}</button></td>
                      <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px] truncate">{c.name}</td>
                      <td className="px-4 py-3">
                        <select value={c.status} onChange={e => handleQuickStatus(c.id, e.target.value)} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500", STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-600')}>
                          {CASE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", PRIORITY_STYLES[c.priority])}>{c.priority}</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{(c as any).leadOfficer?.name ?? (c.assignedOfficers?.map(o => o.name).join(', ') || '-')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewId(c.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(c.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-xs">Rows per page:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">{PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
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

      {showCreateModal && <CaseFormModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} isLoading={isCreating} availableFIRs={firsData?.data ?? []} />}
      {editId && <EditCaseModal caseId={editId} onClose={() => setEditId(null)} onSubmit={(data: UpdateCaseRequest) => handleUpdate(editId, data)} isLoading={isUpdating} availableFIRs={firsData?.data ?? []} />}
      {viewId && <CaseDetailDrawer caseId={viewId} data={viewData ?? null} isLoading={viewLoading} onClose={() => setViewId(null)} />}
      {deleteId && <ConfirmDialog title="Delete Case" message="Are you sure you want to delete this case? This action cannot be undone." confirmLabel="Delete" variant="danger" isLoading={isDeleting} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} />}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function CaseFormModal({ onClose, onSubmit, isLoading, initial, availableFIRs }: {
  onClose: () => void;
  onSubmit: (data: CreateCaseRequest) => void;
  isLoading?: boolean;
  initial?: CreateCaseRequest;
  availableFIRs?: any[];
}) {
  const [form, setForm] = useState<CreateCaseRequest>(initial ?? {
    name: '', description: '', priority: 'medium', category: '', crimeType: '',
    crimeLocation: '', policeStation: '', district: '', state: '',
    leadOfficerId: '', linkedFIRIds: [], linkedFIRId: '', assignedOfficerIds: [],
    investigationStartDate: new Date().toISOString().split('T')[0], expectedCompletionDate: '',
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [tab, setTab] = useState<'basic' | 'location' | 'officers' | 'fir'>('basic');

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!form.name) e.name = 'Required';
    if (!form.priority) e.priority = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSubmit = useCallback((ev: React.FormEvent) => { ev.preventDefault(); if (validate()) onSubmit(form); }, [form, validate, onSubmit]);
  const set = (key: string, value: any) => { setForm(p => ({ ...p, [key]: value })); if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; }); };

  const TABS = [
    { key: 'basic', label: 'Basic Info' },
    { key: 'location', label: 'Crime Location' },
    { key: 'officers', label: 'Officers' },
    { key: 'fir', label: 'Linked FIR' },
  ] as const;

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{initial ? 'Edit Case' : 'New Case'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {TABS.map(t => (<button key={t.key} onClick={() => setTab(t.key)} className={cn("px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap", tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>{t.label}</button>))}
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Case Name *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Central Theft Investigation" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.name ? 'border-red-300' : 'border-slate-200')} />
                {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Priority *</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">{CASE_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                <select value={form.category ?? ''} onChange={e => set('category', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select...</option>
                  {CASE_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Crime Type</label>
                <select value={form.crimeType ?? ''} onChange={e => set('crimeType', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select...</option>
                  {CRIME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Investigation Start Date</label>
                <input type="date" value={form.investigationStartDate ?? ''} onChange={e => set('investigationStartDate', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Expected Completion</label>
                <input type="date" value={form.expectedCompletionDate ?? ''} onChange={e => set('expectedCompletionDate', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={3} placeholder="Case description..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          )}
          {tab === 'location' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Crime Location</label>
                <input type="text" value={form.crimeLocation ?? ''} onChange={e => set('crimeLocation', e.target.value)} placeholder="Where the crime occurred" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Police Station</label>
                <input type="text" value={form.policeStation ?? ''} onChange={e => set('policeStation', e.target.value)} placeholder="PS name" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">District</label>
                <input type="text" value={form.district ?? ''} onChange={e => set('district', e.target.value)} placeholder="District" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">State</label>
                <input type="text" value={form.state ?? ''} onChange={e => set('state', e.target.value)} placeholder="State" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          )}
          {tab === 'officers' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Lead Officer</label>
                <select value={form.leadOfficerId ?? ''} onChange={e => set('leadOfficerId', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select lead officer...</option>
                  <option value="off1">Inspector Sharma (Central)</option>
                  <option value="off2">SI Verma (West)</option>
                  <option value="off3">Constable Patel (East)</option>
                  <option value="off4">ASI Gupta (North)</option>
                  <option value="off5">Inspector Singh (South)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Supporting Officers</label>
                <div className="space-y-2">
                  {['off1', 'off2', 'off3', 'off4', 'off5'].map(id => {
                    const names: Record<string, string> = { off1: 'Inspector Sharma', off2: 'SI Verma', off3: 'Constable Patel', off4: 'ASI Gupta', off5: 'Inspector Singh' };
                    const checked = (form.assignedOfficerIds || []).includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={checked} onChange={e => {
                          const current = form.assignedOfficerIds || [];
                          set('assignedOfficerIds', e.target.checked ? [...current, id] : current.filter(x => x !== id));
                        }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        {names[id]}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {tab === 'fir' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Link FIR</label>
                <select value={form.linkedFIRId ?? ''} onChange={e => set('linkedFIRId', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select FIR...</option>
                  {(availableFIRs || []).map((f: any) => <option key={f.id} value={f.id}>{f.firNumber} — {f.crimeType} ({f.district})</option>)}
                </select>
              </div>
              {form.linkedFIRId && (
                <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-xs text-blue-700">
                  <p>Linked FIR details will be auto-populated in the case from the FIR record.</p>
                </div>
              )}
            </div>
          )}
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Update Case' : 'Create Case'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function EditCaseModal({ caseId, onClose, onSubmit, isLoading, availableFIRs }: {
  caseId: string; onClose: () => void; onSubmit: (data: UpdateCaseRequest) => void; isLoading?: boolean; availableFIRs?: any[];
}) {
  const { data: c, isLoading: fetching } = useFetchCaseByIdQuery(caseId);
  if (fetching) return <DialogOverlay onClose={onClose}><div className="bg-white rounded-lg shadow-xl p-12 flex items-center justify-center" onClick={e => e.stopPropagation()}><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div></DialogOverlay>;
  if (!c) return null;
  const initial: CreateCaseRequest = {
    name: c.name, description: c.description ?? '', priority: c.priority, category: c.category ?? '',
    crimeType: c.crimeType ?? '', crimeLocation: c.crimeLocation ?? '', policeStation: c.policeStation ?? '',
    district: c.district ?? '', state: c.state ?? '', leadOfficerId: (c as any).leadOfficerId ?? '',
    linkedFIRIds: c.linkedFIRs?.map(f => f.id) ?? [], linkedFIRId: (c as any).linkedFIRId ?? '',
    assignedOfficerIds: c.assignedOfficers?.map(o => o.id) ?? [],
    investigationStartDate: (c as any).investigationStartDate ? new Date((c as any).investigationStartDate).toISOString().split('T')[0] : '',
    expectedCompletionDate: (c as any).expectedCompletionDate ? new Date((c as any).expectedCompletionDate).toISOString().split('T')[0] : '',
  };
  return <CaseFormModal initial={initial} onClose={onClose} onSubmit={(data: CreateCaseRequest) => onSubmit(data as UpdateCaseRequest)} isLoading={isLoading} availableFIRs={availableFIRs} />;
}

// ============================================================================
// Case Detail Drawer with Tabs
// ============================================================================

function CaseDetailDrawer({ caseId, data, isLoading, onClose }: {
  caseId: string; data: Case | null; isLoading: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'suspects' | 'witnesses' | 'evidence' | 'notes' | 'timeline'>('overview');

  if (isLoading) return <DialogOverlay onClose={onClose}><div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-3xl p-12 flex items-center justify-center" onClick={e => e.stopPropagation()}><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div></DialogOverlay>;
  if (!data) return null;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: <Eye className="w-3 h-3" /> },
    { key: 'suspects', label: `Suspects (${(data as any).suspects?.length || 0})`, icon: <AlertTriangle className="w-3 h-3" /> },
    { key: 'witnesses', label: `Witnesses (${(data as any).witnesses?.length || 0})`, icon: <Users className="w-3 h-3" /> },
    { key: 'evidence', label: `Evidence (${(data as any).evidence?.length || 0})`, icon: <Paperclip className="w-3 h-3" /> },
    { key: 'notes', label: `Notes (${(data as any).notes?.length || 0})`, icon: <StickyNote className="w-3 h-3" /> },
    { key: 'timeline', label: 'Timeline', icon: <GitBranch className="w-3 h-3" /> },
  ] as const;

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{data.caseNumber}</h3>
            <p className="text-xs text-slate-500">{data.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-slate-200 px-6 overflow-x-auto">
          {tabs.map(t => (<button key={t.key} onClick={() => setTab(t.key)} className={cn("px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1", tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700")}>{t.icon} {t.label}</button>))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && (
            <dl className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Status</dt><dd className="col-span-2"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", STATUS_STYLES[data.status])}>{STATUS_LABELS[data.status]}</span></dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Priority</dt><dd className="col-span-2"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", PRIORITY_STYLES[data.priority])}>{data.priority}</span></dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Category</dt><dd className="col-span-2 text-slate-800">{data.category || '-'}</dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Crime Type</dt><dd className="col-span-2 text-slate-800">{(data as any).crimeType || '-'}</dd></div>
              {(data as any).crimeLocation && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Crime Location</dt><dd className="col-span-2 text-slate-800">{(data as any).crimeLocation}</dd></div>}
              {(data as any).district && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">District</dt><dd className="col-span-2 text-slate-800">{(data as any).district}</dd></div>}
              {(data as any).policeStation && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Police Station</dt><dd className="col-span-2 text-slate-800">{(data as any).policeStation}</dd></div>}
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Lead Officer</dt><dd className="col-span-2 text-slate-800">{(data as any).leadOfficer?.name || 'Not assigned'}</dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Officers</dt><dd className="col-span-2 text-slate-800">{data.assignedOfficers?.map(o => o.name).join(', ') || 'None'}</dd></div>
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Linked FIRs</dt><dd className="col-span-2 text-slate-800">{data.linkedFIRs?.map(f => f.firNumber).join(', ') || 'None'}</dd></div>
              {(data as any).investigationStartDate && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Start Date</dt><dd className="col-span-2 text-slate-800">{formatDate((data as any).investigationStartDate)}</dd></div>}
              {(data as any).expectedCompletionDate && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Expected End</dt><dd className="col-span-2 text-slate-800">{formatDate((data as any).expectedCompletionDate)}</dd></div>}
              {data.description && <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Description</dt><dd className="col-span-2 text-slate-700 text-xs leading-relaxed whitespace-pre-wrap">{data.description}</dd></div>}
              <div className="grid grid-cols-3 gap-2"><dt className="text-slate-500 font-medium">Created</dt><dd className="col-span-2 text-slate-500 text-xs">{formatDateTime(data.createdAt)}</dd></div>
            </dl>
          )}

          {tab === 'suspects' && (
            <div className="space-y-3">
              {(data as any).suspects?.length > 0 ? (data as any).suspects.map((s: any, i: number) => (
                <div key={i} className="border border-slate-200 rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800">{s.name}{s.alias ? ` aka "${s.alias}"` : ''}</p>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", s.status === 'arrested' ? 'bg-red-100 text-red-700' : s.status === 'identified' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700')}>{s.status}</span>
                  </div>
                  {s.description && <p className="text-xs text-slate-600 mt-1">{s.description}</p>}
                  <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
                    {s.age && <span>Age: {s.age}</span>}
                    {s.gender && <span>Gender: {s.gender}</span>}
                  </div>
                </div>
              )) : <p className="text-slate-500 text-center py-6">No suspects recorded</p>}
            </div>
          )}

          {tab === 'witnesses' && (
            <div className="space-y-3">
              {(data as any).witnesses?.length > 0 ? (data as any).witnesses.map((w: any, i: number) => (
                <div key={i} className="border border-slate-200 rounded-md p-4">
                  <p className="font-medium text-slate-800">{w.name}</p>
                  {w.contact && <p className="text-xs text-slate-500 mt-1">Contact: {w.contact}</p>}
                  {w.statement && <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded italic">&quot;{w.statement}&quot;</p>}
                  {w.recordedAt && <p className="text-[10px] text-slate-400 mt-1">Recorded: {formatDate(w.recordedAt)}</p>}
                </div>
              )) : <p className="text-slate-500 text-center py-6">No witnesses recorded</p>}
            </div>
          )}

          {tab === 'evidence' && (
            <div className="space-y-3">
              {(data as any).evidence?.length > 0 ? (data as any).evidence.map((ev: any) => (
                <div key={ev.id} className="border border-slate-200 rounded-md p-4">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-purple-500" />
                    <p className="font-medium text-slate-800">{ev.name}</p>
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{ev.type}</span>
                  </div>
                  {ev.description && <p className="text-xs text-slate-600 mt-1">{ev.description}</p>}
                  <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
                    {ev.addedBy && <span>Added by: {ev.addedBy}</span>}
                    {ev.addedAt && <span>{formatDate(ev.addedAt)}</span>}
                  </div>
                  {ev.url && <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">View evidence</a>}
                </div>
              )) : <p className="text-slate-500 text-center py-6">No evidence collected</p>}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              {(data as any).notes?.length > 0 ? (data as any).notes.map((n: any) => (
                <div key={n.id} className="border border-slate-200 rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 text-xs">{n.author}</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{n.content}</p>
                </div>
              )) : <p className="text-slate-500 text-center py-6">No investigation notes</p>}
            </div>
          )}

          {tab === 'timeline' && (
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
              {(data as any).timeline?.length > 0 ? (data as any).timeline.map((ev: any) => (
                <div key={ev.id} className="relative">
                  <div className="absolute -left-7 w-4 h-4 bg-white border-2 border-slate-300 rounded-full flex items-center justify-center">{TIMELINE_ICONS[ev.type] || <div className="w-2 h-2 bg-slate-400 rounded-full" />}</div>
                  <p className="font-medium text-slate-800 text-sm">{ev.title}</p>
                  {ev.description && <p className="text-xs text-slate-600 mt-0.5">{ev.description}</p>}
                  <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(ev.timestamp)}</p>
                </div>
              )) : <p className="text-slate-500 text-center py-6">No timeline events</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Close</button>
        </div>
      </div>
    </DialogOverlay>
  );
}
