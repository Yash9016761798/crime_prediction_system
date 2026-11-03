import { useState, useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Users, Plus, Search, Filter, X, AlertCircle, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Eye, Edit3, Trash2, ShieldCheck, ShieldX, ShieldAlert, Mail, Phone,
  MapPin, Clock, UserCheck, UserX, UserMinus, RefreshCw,
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { DialogOverlay, ConfirmDialog } from '../../components/Dialog';
import {
  useFetchUsersQuery,
  useFetchUserByIdQuery,
  useFetchUserStatsQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} from '../../store/api';
import type { User, UserRole, UserStatus } from '../../types/entities';
import type { CreateUserRequest, UpdateUserRequest } from '../../types/api';
import { USER_ROLES, USER_STATUS_OPTIONS, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../../constants';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  inactive: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
  training: 'bg-blue-100 text-blue-700',
};

const ROLE_STYLES: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  officer: 'bg-amber-100 text-amber-700',
  citizen: 'bg-slate-100 text-slate-600',
  viewer: 'bg-cyan-100 text-cyan-700',
};

const ROLE_ICONS: Record<string, string> = {
  super_admin: '🛡️',
  admin: '👨‍💼',
  officer: '👮',
  citizen: '👤',
  viewer: '👁️',
};

function formatDate(d: Date | string | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: Date | string | undefined): string {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d: Date | string | undefined): string {
  if (!d) return 'Never';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface UserFilters {
  search: string;
  role: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: UserFilters = { search: '', role: '', status: '', dateFrom: '', dateTo: '' };

export default function UserManagement() {
  const { addToast } = useToast();

  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
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
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => ({
    page, pageSize, sortBy: sortField, sortOrder,
    ...(filters.role && { role: filters.role }),
    ...(filters.status && { status: filters.status }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
  }), [page, pageSize, sortField, sortOrder, filters]);

  const { data, isLoading, isFetching, isError, error, refetch } = useFetchUsersQuery(queryParams);
  const { data: viewData, isLoading: viewLoading } = useFetchUserByIdQuery(viewId ?? '', { skip: !viewId });
  const { data: stats, isLoading: statsLoading } = useFetchUserStatsQuery();

  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();

  const users = data?.data ?? [];
  const totalRecords = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

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
    setSelectedIds(prev => prev.size === users.length ? new Set() : new Set(users.map(u => u.id)));
  }, [users]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const updateFilter = useCallback((key: keyof UserFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value })); setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(1);
  }, []);

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const handleCreate = useCallback(async (formData: CreateUserRequest) => {
    try {
      await createUser(formData).unwrap();
      addToast('User created successfully', 'success');
      setShowCreateModal(false); setPage(1);
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to create user', 'error');
    }
  }, [createUser, addToast]);

  const handleUpdate = useCallback(async (id: string, formData: UpdateUserRequest) => {
    try {
      await updateUser({ id, data: formData }).unwrap();
      addToast('User updated successfully', 'success');
      setEditId(null);
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to update user', 'error');
    }
  }, [updateUser, addToast]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteUser(id).unwrap();
      addToast('User deleted successfully', 'success');
      setDeleteId(null);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to delete user', 'error');
    }
  }, [deleteUser, addToast]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    let success = 0; const ids = Array.from(selectedIds);
    for (const id of ids) { try { await deleteUser(id).unwrap(); success++; } catch { /* skip */ } }
    addToast(`Deleted ${success} of ${ids.length} users`, success === ids.length ? 'success' : 'info');
    setSelectedIds(new Set());
  }, [selectedIds, deleteUser, addToast]);

  const handleToggleStatus = useCallback(async (user: User) => {
    const newStatus: UserStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await updateUser({ id: user.id, data: { status: newStatus } }).unwrap();
      addToast(`User ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`, 'success');
    } catch (err: unknown) {
      addToast((err as { data?: { message?: string } })?.data?.message ?? 'Failed to update status', 'error');
    }
  }, [updateUser, addToast]);

  const SortIcon = (field: string) =>
    sortField === field
      ? sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
      : <ArrowUpDown className="w-3 h-3 text-slate-300" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1">User Management</h2>
          <p className="text-sm text-slate-500">Manage registered user accounts and system access</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("bg-white border border-slate-200 text-slate-700 shadow-sm rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2", showFilters && "bg-slate-100")}
          ><Filter className="w-4 h-4" /> Filter {hasActiveFilters && <span className="bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{Object.values(filters).filter(Boolean).length}</span>}</button>
          <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> New User
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Total Users"
          value={stats?.total ?? '-'}
          icon={<Users className="w-5 h-5" />}
          color="blue"
          loading={statsLoading}
        />
        <KPICard
          label="Active"
          value={stats?.active ?? '-'}
          icon={<UserCheck className="w-5 h-5" />}
          color="green"
          loading={statsLoading}
        />
        <KPICard
          label="Suspended"
          value={stats?.suspended ?? '-'}
          icon={<UserX className="w-5 h-5" />}
          color="red"
          loading={statsLoading}
        />
        <KPICard
          label="Inactive"
          value={stats?.inactive ?? '-'}
          icon={<UserMinus className="w-5 h-5" />}
          color="slate"
          loading={statsLoading}
        />
        <KPICard
          label="Pending"
          value={stats?.pending ?? '-'}
          icon={<Clock className="w-5 h-5" />}
          color="amber"
          loading={statsLoading}
        />
        <KPICard
          label="Training"
          value={stats?.training ?? '-'}
          icon={<RefreshCw className="w-5 h-5" />}
          color="cyan"
          loading={statsLoading}
        />
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search users..." className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
              <select value={filters.role} onChange={e => updateFilter('role', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Roles</option>
                {USER_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {USER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2">
                <X className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={clearSelection} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Clear</button>
          <div className="h-4 w-px bg-blue-200" />
          <button onClick={handleBulkDelete} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700 transition-colors">
            <Trash2 className="w-3 h-3 inline mr-1" /> Delete Selected
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden relative">
        {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />)}
          </div>
        ) : isError ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-600 mb-1">Failed to load users</p>
            <p className="text-xs text-slate-500 mb-4">{(error as { data?: { message?: string }; message?: string })?.data?.message ?? (error as { message?: string })?.message ?? 'An unexpected error occurred'}</p>
            <button onClick={refetch} className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-red-100 transition-colors">Retry</button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <Users className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No users found</p>
            <p className="text-xs text-slate-400 mb-4">{hasActiveFilters ? 'Try adjusting your filters' : 'Create your first user to get started'}</p>
            {hasActiveFilters ? (
              <button onClick={resetFilters} className="bg-slate-100 border border-slate-200 text-slate-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors">Clear Filters</button>
            ) : (
              <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"><Plus className="w-4 h-4 inline mr-1" /> New User</button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={selectedIds.size === users.length && users.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('name')}>
                      <span className="flex items-center gap-1">User {SortIcon('name')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('role')}>
                      <span className="flex items-center gap-1">Role {SortIcon('role')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('status')}>
                      <span className="flex items-center gap-1">Status {SortIcon('status')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('lastLogin')}>
                      <span className="flex items-center gap-1">Last Login {SortIcon('lastLogin')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold cursor-pointer select-none" onClick={() => handleSort('registrationDate')}>
                      <span className="flex items-center gap-1">Registered {SortIcon('registrationDate')}</span>
                    </th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user: User) => (
                    <tr key={user.id} className={cn("hover:bg-slate-50 transition-colors", selectedIds.has(user.id) && "bg-blue-50/40")}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleSelect(user.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">{user.name.charAt(0)}</div>
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{user.name}</div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                              <Mail className="w-3 h-3" /> {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", ROLE_STYLES[user.role] || 'bg-slate-100 text-slate-600')}>{user.role.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 w-max", STATUS_STYLES[user.status] || 'bg-slate-100 text-slate-600')}>
                          {user.status === 'active' ? <ShieldCheck className="w-3 h-3" /> : user.status === 'suspended' ? <ShieldX className="w-3 h-3" /> : user.status === 'pending' ? <ShieldAlert className="w-3 h-3" /> : null}
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-500">
                          <div>{timeAgo(user.lastLogin)}</div>
                          {user.lastLogin && <div className="text-[10px] text-slate-400">{formatDate(user.lastLogin)}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(user.registrationDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewId(user.id)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(user.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleToggleStatus(user)} className={cn("p-1.5 rounded transition-colors", user.status === 'active' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50')} title={user.status === 'active' ? 'Suspend' : 'Activate'}>
                            {user.status === 'active' ? <ShieldX className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                          </button>
                          <button onClick={() => setDeleteId(user.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
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

      {showCreateModal && (
        <UserFormModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} isLoading={isCreating} />
      )}
      {editId && (
        <EditUserModal userId={editId} onClose={() => setEditId(null)} onSubmit={(data: UpdateUserRequest) => handleUpdate(editId, data)} isLoading={isUpdating} />
      )}
      {viewId && (
        <UserDetailDrawer userId={viewId} data={viewData ?? null} isLoading={viewLoading} onClose={() => setViewId(null)} />
      )}
      {deleteId && (
        <ConfirmDialog title="Delete User" message="Are you sure you want to delete this user? This action cannot be undone." confirmLabel="Delete" variant="danger" isLoading={isDeleting} onConfirm={() => handleDelete(deleteId)} onCancel={() => setDeleteId(null)} />
      )}
    </div>
  );
}

// ============================================================================
// KPI Card
// ============================================================================

function KPICard({ label, value, icon, color, loading }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; loading?: boolean;
}) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-100' },
    red: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-100' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
    cyan: { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-100' },
    slate: { bg: 'bg-slate-50', icon: 'text-slate-600', border: 'border-slate-100' },
  };
  const c = colorMap[color] ?? colorMap.blue;
  return (
    <div className={cn("bg-white border rounded-md p-3 shadow-sm", c.border)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn("p-1.5 rounded-md", c.bg, c.icon)}>{icon}</div>
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-slate-100 animate-pulse rounded" />
      ) : (
        <div className="text-xl font-bold text-slate-800">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function UserFormModal({ onClose, onSubmit, isLoading, initial }: {
  onClose: () => void;
  onSubmit: (data: CreateUserRequest) => void;
  isLoading?: boolean;
  initial?: CreateUserRequest;
}) {
  const [form, setForm] = useState<CreateUserRequest>(
    initial ?? { name: '', email: '', phone: '', address: '', role: 'citizen', password: '' }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserRequest, string>>>({});

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof CreateUserRequest, string>> = {};
    if (!form.name) e.name = 'Required';
    if (!form.email) e.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!form.phone) e.phone = 'Required';
    if (!form.role) e.role = 'Required';
    if (!initial && !form.password) e.password = 'Required';
    else if (!initial && form.password.length < 6) e.password = 'Min 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, initial]);

  const handleSubmit = useCallback((ev: React.FormEvent) => {
    ev.preventDefault();
    if (validate()) onSubmit(form);
  }, [form, validate, onSubmit]);

  const set = (key: keyof CreateUserRequest, value: string) => {
    setForm(p => ({ ...p, [key]: value }));
    if (errors[key]) setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{initial ? 'Edit User' : 'New User'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.name ? 'border-red-300' : 'border-slate-200')} />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email address" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.email ? 'border-red-300' : 'border-slate-200')} />
              {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
              <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone number" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.phone ? 'border-red-300' : 'border-slate-200')} />
              {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Role *</label>
              <select value={form.role} onChange={e => set('role', e.target.value)} className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.role ? 'border-red-300' : 'border-slate-200')}>
                {USER_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.role && <p className="text-xs text-red-500 mt-0.5">{errors.role}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
              <input type="text" value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="Address" className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            {!initial && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Password *</label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Password (min 6 chars)" className={cn("w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500", errors.password ? 'border-red-300' : 'border-slate-200')} />
                {errors.password && <p className="text-xs text-red-500 mt-0.5">{errors.password}</p>}
              </div>
            )}
          </div>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {initial ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function EditUserModal({ userId, onClose, onSubmit, isLoading }: {
  userId: string; onClose: () => void; onSubmit: (data: UpdateUserRequest) => void; isLoading?: boolean;
}) {
  const { data: u, isLoading: fetching } = useFetchUserByIdQuery(userId);
  if (fetching) {
    return <DialogOverlay onClose={onClose}><div className="bg-white rounded-lg shadow-xl p-12 flex items-center justify-center" onClick={e => e.stopPropagation()}><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div></DialogOverlay>;
  }
  if (!u) return null;
  const initial: CreateUserRequest = { name: u.name, email: u.email, phone: u.phone, address: u.address ?? '', role: u.role, password: '' };
  return <UserFormModal initial={initial} onClose={onClose} onSubmit={(data: CreateUserRequest) => onSubmit({ name: data.name, email: data.email, phone: data.phone, address: data.address, role: data.role })} isLoading={isLoading} />;
}

function UserDetailDrawer({ userId, data, isLoading, onClose }: {
  userId: string; data: User | null; isLoading: boolean; onClose: () => void;
}) {
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">User Details</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-6 bg-slate-100 animate-pulse rounded" />)}</div>
          ) : !data ? (
            <p className="text-sm text-slate-500 text-center py-8">User not found</p>
          ) : (
            <dl className="space-y-4 text-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">{data.name.charAt(0)}</div>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{data.name}</div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", ROLE_STYLES[data.role] || 'bg-slate-100 text-slate-600')}>{data.role.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Email</dt>
                <dd className="col-span-2 text-slate-800">{data.email}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Phone</dt>
                <dd className="col-span-2 text-slate-800">{data.phone}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Address</dt>
                <dd className="col-span-2 text-slate-800">{data.address || '-'}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Status</dt>
                <dd className="col-span-2">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider", STATUS_STYLES[data.status] || 'bg-slate-100 text-slate-600')}>{data.status}</span>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Registered</dt>
                <dd className="col-span-2 text-slate-500 text-xs">{formatDate(data.registrationDate)}</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500 font-medium">Last Login</dt>
                <dd className="col-span-2 text-slate-500 text-xs">{formatDateTime(data.lastLogin)}</dd>
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
