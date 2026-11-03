import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import {
  UserPlus, Search, Filter, X, AlertCircle, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Eye, Edit3, Trash2, Shield, Users, UserCheck, UserX, Clock,
  MapPin, Briefcase, BarChart2,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { apiFetch } from '../../lib/apiClient';
import { DialogOverlay, ConfirmDialog } from '../../components/Dialog';
import {
  useFetchOfficersQuery,
  useFetchOfficerByIdQuery,
  useCreateOfficerMutation,
  useUpdateOfficerMutation,
  useDeleteOfficerMutation,
} from '../../store/api';
import type { Officer, OfficerStatus } from '../../types/entities';
import type { CreateOfficerRequest, UpdateOfficerRequest } from '../../types/api';
import { OFFICER_STATUS_OPTIONS, OFFICER_RANKS, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../../constants';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700 border-green-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  'on-leave': 'bg-amber-100 text-amber-700 border-amber-200',
  suspended: 'bg-red-100 text-red-700 border-red-200',
  training: 'bg-purple-100 text-purple-700 border-purple-200',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  'on-leave': 'On Leave',
  suspended: 'Suspended',
  training: 'Training',
};

const SPECIALIZATIONS = [
  'Cyber Crime', 'Fraud', 'Women Safety', 'Traffic', 'Investigation',
  'Narcotics', 'Crime Branch', 'Patrol', 'Organized Crime',
];

function formatDate(d: Date | string | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface OfficerFilters {
  search: string;
  district: string;
  rank: string;
  status: string;
  specialization: string;
}

const EMPTY_FILTERS: OfficerFilters = { search: '', district: '', rank: '', status: '', specialization: '' };

export default function OfficerManagement() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState<OfficerFilters>(EMPTY_FILTERS);
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
  const [districts, setDistricts] = useState<string[]>([]);
  const [allOfficers, setAllOfficers] = useState<Officer[]>([]);

  useEffect(() => {
    apiFetch('/references/districts').then(r => r.json()).then(d => { if (Array.isArray(d)) setDistricts(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => ({
    page, pageSize, sortBy: sortField, sortOrder,
    ...(filters.district && { district: filters.district }),
    ...(filters.rank && { rank: filters.rank }),
    ...(filters.status && { status: filters.status }),
    ...(filters.specialization && { specialization: filters.specialization }),
    ...(filters.search && { search: filters.search }),
  }), [page, pageSize, sortField, sortOrder, filters]);

  const { data, isLoading, isFetching, isError, error, refetch } = useFetchOfficersQuery(queryParams);
  const { data: viewData, isLoading: viewLoading } = useFetchOfficerByIdQuery(viewId ?? '', { skip: !viewId });
  const [createOfficer, { isLoading: isCreating }] = useCreateOfficerMutation();
  const [updateOfficer, { isLoading: isUpdating }] = useUpdateOfficerMutation();
  const [deleteOfficer, { isLoading: isDeleting }] = useDeleteOfficerMutation();

  const officers = data?.data ?? [];
  const totalRecords = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Keep a local cache of every officer seen so far (paginated data is merged in).
  /* eslint-disable react-hooks/set-state-in-effect -- merging paginated results into a local cache */
  useEffect(() => {
    if (!isFetching && officers.length > 0) {
      setAllOfficers(prev => {
        const map = new Map(prev.map(o => [o.id, o]));
        officers.forEach(o => map.set(o.id, o));
        return Array.from(map.values());
      });
    }
  }, [officers, isFetching]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stats = useMemo(() => {
    const list = allOfficers.length > 0 ? allOfficers : officers;
    const byRank: Record<string, number> = {};
    const byDistrict: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    list.forEach(o => {
      byRank[o.rank] = (byRank[o.rank] || 0) + 1;
      byDistrict[o.district] = (byDistrict[o.district] || 0) + 1;
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    });
    return {
      total: totalRecords || list.length,
      active: byStatus['active'] || 0,
      onLeave: byStatus['on-leave'] || 0,
      inactive: byStatus['inactive'] || 0,
      suspended: byStatus['suspended'] || 0,
      training: byStatus['training'] || 0,
      byRank,
      byDistrict,
    };
  }, [officers, allOfficers, totalRecords]);

  const handleSort = useCallback((field: string) => {
    setSortField(prev => {
      if (prev === field) { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortOrder('asc'); return field;
    });
    setPage(1);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === officers.length ? new Set() : new Set(officers.map(o => o.id)));
  }, [officers]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const updateFilter = useCallback((key: keyof OfficerFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value })); setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(1);
  }, []);

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const handleCreate = useCallback(async (formData: CreateOfficerRequest) => {
    try {
      await createOfficer(formData).unwrap();
      addToast('Officer created successfully', 'success');
      setShowCreateModal(false); setPage(1);
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to create officer', 'error');
    }
  }, [createOfficer, addToast]);

  const handleUpdate = useCallback(async (id: string, formData: UpdateOfficerRequest) => {
    try {
      await updateOfficer({ id, data: formData }).unwrap();
      addToast('Officer updated successfully', 'success');
      setEditId(null);
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to update officer', 'error');
    }
  }, [updateOfficer, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteOfficer(id).unwrap();
      addToast('Officer deleted successfully', 'success');
      setDeleteId(null);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to delete officer', 'error');
    }
  }, [deleteOfficer, addToast]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    let success = 0; const ids = Array.from(selectedIds);
    for (const id of ids) { try { await deleteOfficer(id).unwrap(); success++; } catch { /* skip */ } }
    addToast(`Deleted ${success} of ${ids.length} officers`, success === ids.length ? 'success' : 'info');
    setSelectedIds(new Set());
  }, [selectedIds, deleteOfficer, addToast]);

  const SortIcon = (field: string) =>
    sortField === field
      ? sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
      : <ArrowUpDown className="w-3 h-3 text-slate-300" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Officer Management
          </h2>
          <p className="text-sm text-slate-500">Manage directory, assign zones, and configure roles</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className={cn("bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1", showFilters && "bg-slate-100")}>
            <Filter className="w-3.5 h-3.5" /> Filter {hasActiveFilters && <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{Object.values(filters).filter(Boolean).length}</span>}
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white shadow-sm rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Add Officer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Officers', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'On Leave', value: stats.onLeave, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: 'Suspended', value: stats.suspended, icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Training', value: stats.training, icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
            <div className={cn("p-2 rounded-md", kpi.bg)}><kpi.icon className={cn("w-4 h-4", kpi.color)} /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-medium">{kpi.label}</p>
              <p className="text-lg font-bold text-slate-800">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase">Search</label>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search officers..." className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase">District</label>
              <select value={filters.district} onChange={e => updateFilter('district', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Districts</option>
                {[...new Set([...districts, ...officers.map(o => o.district)])].sort().map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase">Rank</label>
              <select value={filters.rank} onChange={e => updateFilter('rank', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Ranks</option>
                {OFFICER_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase">Status</label>
              <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {OFFICER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded px-3 py-1.5 text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-3 text-xs">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={clearSelection} className="text-blue-600 hover:text-blue-800 font-medium">Clear</button>
          <div className="h-4 w-px bg-blue-200" />
          <button onClick={handleBulkDelete} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700 transition-colors">
            <Trash2 className="w-3 h-3 inline mr-1" /> Delete Selected
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden relative">
          {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
            </div>
          ) : isError ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm font-medium text-red-600 mb-1">Failed to load officers</p>
              <p className="text-xs text-slate-500 mb-4">{(error as { data?: { message?: string }; message?: string })?.data?.message ?? (error as { message?: string })?.message ?? 'An unexpected error occurred'}</p>
              <button onClick={refetch} className="bg-red-50 border border-red-200 text-red-600 rounded px-4 py-2 text-xs font-medium hover:bg-red-100 transition-colors">Retry</button>
            </div>
          ) : officers.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <Shield className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600 mb-1">No officers found</p>
              <p className="text-xs text-slate-400 mb-4">{hasActiveFilters ? 'Try adjusting your filters' : 'Add your first officer to get started'}</p>
              {hasActiveFilters ? (
                <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded px-4 py-2 text-xs font-medium hover:bg-slate-200 transition-colors">Clear Filters</button>
              ) : (
                <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded px-4 py-2 text-xs font-medium hover:bg-blue-700 transition-colors"><UserPlus className="w-3.5 h-3.5 inline mr-1" /> Add Officer</button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                    <tr>
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={selectedIds.size === officers.length && officers.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      </th>
                      {(['name', 'badgeNumber', 'rank', 'district', 'status'] as const).map(field => (
                        <th key={field} className="px-3 py-2.5 font-bold cursor-pointer select-none" onClick={() => handleSort(field)}>
                          <span className="flex items-center gap-1">
                            {field === 'badgeNumber' ? 'Badge #' : field.charAt(0).toUpperCase() + field.slice(1)}
                            {' '}{SortIcon(field)}
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-bold">Specialization</th>
                      <th className="px-3 py-2.5 font-bold text-center">Workload</th>
                      <th className="px-3 py-2.5 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {officers.map((officer: Officer) => (
                      <tr key={officer.id} className={cn("hover:bg-slate-50 transition-colors", selectedIds.has(officer.id) && "bg-blue-50/40")}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={selectedIds.has(officer.id)} onChange={() => toggleSelect(officer.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-[10px]">{officer.name.charAt(0)}</div>
                            <span className="font-semibold text-slate-900">{officer.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono">{officer.badgeNumber}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-medium">{officer.rank}</td>
                        <td className="px-3 py-2.5 text-slate-600">{officer.district}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border", STATUS_STYLES[officer.status] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                            {STATUS_LABELS[officer.status] || officer.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {officer.specialization?.slice(0, 2).map((s: string) => (
                              <span key={s} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                            )) || '-'}
                            {(officer.specialization?.length ?? 0) > 2 && <span className="text-[9px] text-slate-400">+{officer.specialization.length - 2}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2 text-[10px]">
                            <span className="text-blue-600 font-medium">{officer.assignedFIRs?.length ?? 0} FIR</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-amber-600 font-medium">{officer.assignedCases?.length ?? 0} Case</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => setViewId(officer.id)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="View"><Eye className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditId(officer.id)} className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteId(officer.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 px-3 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <span>Rows:</span>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none">
                    {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span>{Math.min((page - 1) * pageSize + 1, totalRecords)}-{Math.min(page * pageSize, totalRecords)} of {totalRecords}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setPage(1)} disabled={page <= 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /><ChevronLeft className="w-3.5 h-3.5 -ml-1.5" /></button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <span className="px-2 py-0.5 text-xs font-medium text-slate-600">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /><ChevronRight className="w-3.5 h-3.5 -ml-1.5" /></button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[10px] font-bold text-slate-700 mb-3 uppercase flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> By Rank</h3>
            <div className="space-y-2">
              {Object.entries(stats.byRank).sort((a, b) => b[1] - a[1]).map(([rank, count]) => (
                <div key={rank}>
                  <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                    <span>{rank}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(count / (stats.total || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[10px] font-bold text-slate-700 mb-3 uppercase flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> By District</h3>
            <div className="space-y-2">
              {Object.entries(stats.byDistrict).sort((a, b) => b[1] - a[1]).map(([district, count]) => (
                <div key={district}>
                  <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                    <span>{district}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${(count / (stats.total || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && <OfficerFormModal districts={districts} onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} isLoading={isCreating} />}
      {editId && <EditOfficerModal officerId={editId} districts={districts} onClose={() => setEditId(null)} onSubmit={(data: UpdateOfficerRequest) => handleUpdate(editId, data)} isLoading={isUpdating} />}
      {viewId && <OfficerDetailDrawer officerId={viewId} data={viewData ?? null} isLoading={viewLoading} onClose={() => setViewId(null)} />}
      {deleteId && <ConfirmDialog title="Delete Officer" message="Are you sure you want to delete this officer? This action cannot be undone." confirmLabel="Delete" variant="danger" isLoading={isDeleting} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} />}
    </div>
  );
}

function OfficerFormModal({ onClose, onSubmit, isLoading, initial, districts }: {
  onClose: () => void;
  onSubmit: (data: CreateOfficerRequest) => void;
  isLoading?: boolean;
  initial?: CreateOfficerRequest;
  districts: string[];
}) {
  const [form, setForm] = useState<CreateOfficerRequest>(
    initial ?? { name: '', badgeNumber: '', rank: 'Constable', district: '', phone: '', specialization: [] }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof CreateOfficerRequest, string>>>({});

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof CreateOfficerRequest, string>> = {};
    if (!form.name) e.name = 'Required';
    if (!form.badgeNumber) e.badgeNumber = 'Required';
    if (!form.rank) e.rank = 'Required';
    if (!form.district) e.district = 'Required';
    if (!form.phone) e.phone = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSubmit = useCallback((ev: React.FormEvent) => {
    ev.preventDefault();
    if (validate()) onSubmit(form);
  }, [form, validate, onSubmit]);

  const set = (key: keyof CreateOfficerRequest, value: string | string[]) => {
    setForm(p => ({ ...p, [key]: value }));
    if (errors[key as keyof CreateOfficerRequest]) setErrors(p => { const n = { ...p }; delete n[key as keyof CreateOfficerRequest]; return n; });
  };

  const toggleSpecialization = useCallback((spec: string) => {
    setForm(p => ({
      ...p,
      specialization: p.specialization.includes(spec)
        ? p.specialization.filter(s => s !== spec)
        : [...p.specialization, spec],
    }));
  }, []);

  const officerDistricts = [...new Set([...districts, ...(initial?.district ? [initial.district] : [])])].sort();

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{initial ? 'Edit Officer' : 'Add Officer'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.name ? 'border-red-300' : 'border-slate-200')} />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Badge Number *</label>
              <input type="text" value={form.badgeNumber} onChange={e => set('badgeNumber', e.target.value)} placeholder="e.g. BN-1031" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.badgeNumber ? 'border-red-300' : 'border-slate-200')} />
              {errors.badgeNumber && <p className="text-xs text-red-500 mt-0.5">{errors.badgeNumber}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Rank *</label>
              <select value={form.rank} onChange={e => set('rank', e.target.value)} className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.rank ? 'border-red-300' : 'border-slate-200')}>
                {OFFICER_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {errors.rank && <p className="text-xs text-red-500 mt-0.5">{errors.rank}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">District *</label>
              <select value={form.district} onChange={e => set('district', e.target.value)} className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.district ? 'border-red-300' : 'border-slate-200')}>
                <option value="">Select District</option>
                {officerDistricts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.district && <p className="text-xs text-red-500 mt-0.5">{errors.district}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
              <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone number" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.phone ? 'border-red-300' : 'border-slate-200')} />
              {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Specializations</label>
              <div className="flex flex-wrap gap-1.5">
                {SPECIALIZATIONS.map(s => (
                  <button key={s} type="button" onClick={() => toggleSpecialization(s)} className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors", form.specialization.includes(s) ? "bg-blue-50 text-blue-700 border-blue-200 font-medium" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200")}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Update Officer' : 'Add Officer'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function EditOfficerModal({ officerId, onClose, onSubmit, isLoading, districts }: {
  officerId: string; onClose: () => void; onSubmit: (data: UpdateOfficerRequest) => void; isLoading?: boolean; districts: string[];
}) {
  const { data: o, isLoading: fetching } = useFetchOfficerByIdQuery(officerId);
  if (fetching) {
    return <DialogOverlay onClose={onClose}><div className="bg-white rounded-lg shadow-xl p-12 flex items-center justify-center" onClick={e => e.stopPropagation()}><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div></DialogOverlay>;
  }
  if (!o) return null;
  const initial: CreateOfficerRequest = { name: o.name, badgeNumber: o.badgeNumber, rank: o.rank, district: o.district, phone: o.phone, specialization: o.specialization };
  return <OfficerFormModal initial={initial} districts={districts} onClose={onClose} onSubmit={(data: CreateOfficerRequest) => onSubmit(data as UpdateOfficerRequest)} isLoading={isLoading} />;
}

function OfficerDetailDrawer({ officerId, data, isLoading, onClose }: {
  officerId: string; data: Officer | null; isLoading: boolean; onClose: () => void;
}) {
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Officer Details</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-6 bg-slate-100 animate-pulse rounded" />)}</div>
          ) : !data ? (
            <p className="text-sm text-slate-500 text-center py-8">Officer not found</p>
          ) : (
            <dl className="space-y-4 text-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">{data.name.charAt(0)}</div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{data.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{data.badgeNumber}</div>
                </div>
              </div>
              {[
                ['Rank', data.rank],
                ['District', data.district],
                ['Phone', data.phone],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500 font-medium">{label}</dt>
                  <dd className="col-span-2 text-slate-800">{value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Status</dt>
                <dd className="col-span-2">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border", STATUS_STYLES[data.status] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                    {STATUS_LABELS[data.status] || data.status}
                  </span>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Specializations</dt>
                <dd className="col-span-2">
                  <div className="flex flex-wrap gap-1">
                    {data.specialization?.map((s: string) => (
                      <span key={s} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200">{s}</span>
                    )) || '-'}
                  </div>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Assigned FIRs</dt>
                <dd className="col-span-2 text-slate-800 font-medium">{data.assignedFIRs?.length ?? 0}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Assigned Cases</dt>
                <dd className="col-span-2 text-slate-800 font-medium">{data.assignedCases?.length ?? 0}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Created</dt>
                <dd className="col-span-2 text-slate-500 text-xs">{formatDate(data.createdAt)}</dd>
              </div>
            </dl>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Close</button>
        </div>
      </div>
    </DialogOverlay>
  );
}
