import { MAP_TILE_URL } from '../../lib/mapTiles';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Navigation, Loader2, AlertCircle, Search, Users, UserCheck, UserX, Clock, Radio, Eye, MapPin, Phone, Briefcase, FileText, XCircle, RefreshCw, Shield, Signal, Wifi } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../../contexts/SocketContext';
import {
  useFetchTrackingStatsQuery,
  useFetchTrackingOfficersQuery,
  useUpdateOfficerStatusMutation,
} from '../../store/api';
import type { Officer } from '../../types/entities';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  'on-leave': '#f59e0b',
  inactive: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  'on-leave': 'On Leave',
  inactive: 'Inactive',
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  patrol: 'Foot Patrol',
  vehicle: 'Vehicle',
  motorcycle: 'Motorcycle',
  bike: 'Bicycle',
  foot: 'On Foot',
};

function formatDateTime(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useMemo(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

export default function LiveTracking() {
  const { addToast } = useToast();
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<Officer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6139, 77.2090]);
  const { socket, isConnected } = useSocket();

  // Locally tracked officers: seeded from REST, updated in real-time via Socket.IO.
  const [trackedOfficers, setTrackedOfficers] = useState<Officer[]>([]);

  const queryParams = useMemo(() => ({
    page: 1,
    pageSize: 50,
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
  }), [filterStatus, searchQuery]);

  const { data: stats } = useFetchTrackingStatsQuery();
  const { data, isLoading, isFetching, isError, refetch } = useFetchTrackingOfficersQuery(queryParams);
  const [updateOfficerStatus] = useUpdateOfficerStatusMutation();

  // Seed tracked officers from the REST response once (deferred). Real-time
  // Socket.IO updates are merged on top and are not overwritten by refetches.
  useEffect(() => {
    if (!data?.data || trackedOfficers.length > 0) return;
    const id = setTimeout(() => setTrackedOfficers(data.data), 0);
    return () => clearTimeout(id);
  }, [data, trackedOfficers.length]);

  // Real-time officer location updates via Socket.IO.
  useEffect(() => {
    if (!socket) return;
    socket.on('officer:location:updated', (payload: any) => {
      setTrackedOfficers(prev => prev.map(o => {
        if (String(o.id) !== String(payload.officerId)) return o;
        return {
          ...o,
          currentLocation: {
            latitude: payload.location.latitude,
            longitude: payload.location.longitude,
            timestamp: payload.timestamp,
          },
          updatedAt: payload.timestamp,
        };
      }));
      addToast(`Officer ${payload.name} location updated`, 'info');
    });
    socket.on('officer:status:updated', (payload: any) => {
      setTrackedOfficers(prev => prev.map(o => {
        if (String(o.id) !== String(payload.officerId)) return o;
        return { ...o, status: payload.status, updatedAt: payload.timestamp };
      }));
      addToast(`Officer ${payload.name} is now ${payload.status}`, 'info');
    });
    return () => {
      socket.off('officer:location:updated');
      socket.off('officer:status:updated');
    };
  }, [socket, addToast]);

  const officers = trackedOfficers;
  const filteredOfficers = useMemo(() => {
    if (!filterStatus) return officers;
    return officers.filter((o: Officer) => o.status === filterStatus);
  }, [officers, filterStatus]);

  const officersWithLocation = useMemo(() => filteredOfficers.filter((o: Officer) => o.currentLocation), [filteredOfficers]);

  const avgCenter = useMemo((): [number, number] => {
    if (officersWithLocation.length === 0) return [28.6139, 77.2090];
    const lat = officersWithLocation.reduce((s: number, o: Officer) => s + (o.currentLocation?.latitude ?? 0), 0) / officersWithLocation.length;
    const lng = officersWithLocation.reduce((s: number, o: Officer) => s + (o.currentLocation?.longitude ?? 0), 0) / officersWithLocation.length;
    return [lat, lng];
  }, [officersWithLocation]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      await updateOfficerStatus({ id, data: { status: newStatus } }).unwrap();
      addToast(`Officer status updated to ${STATUS_LABELS[newStatus] || newStatus}`, 'success');
    } catch {
      addToast('Failed to update officer status', 'error');
    }
  }, [updateOfficerStatus, addToast]);

  const handleUnitClick = useCallback((officer: Officer) => {
    setSelectedUnit(officer);
    setShowDetailModal(true);
    if (officer.currentLocation) {
      setMapCenter([officer.currentLocation.latitude, officer.currentLocation.longitude]);
    }
  }, []);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-600" />
            Live Tracking
          </h2>
          <p className="text-sm text-slate-500">Real-time police fleet monitoring — live GPS updates via Socket.IO</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", isConnected ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200")}>
            {isConnected ? <><Wifi className="w-3 h-3 inline mr-1" /> Live</> : <><Signal className="w-3 h-3 inline mr-1" /> Disconnected</>}
          </span>
          <button onClick={() => setShowStatsPanel(!showStatsPanel)} className={cn("border text-xs font-medium px-3 py-1.5 rounded transition-colors", showStatsPanel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
            <Radio className="w-3.5 h-3.5 inline mr-1" />
            Statistics
          </button>
          <button onClick={() => refetch()} className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-medium hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Units', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'On Leave', value: stats.onLeave, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'text-slate-600', bg: 'bg-slate-50' },
            { label: 'With GPS', value: stats.withLocation, icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3">
              <div className={cn("p-2 rounded-md", kpi.bg)}>
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">{kpi.label}</p>
                <p className="text-lg font-bold text-slate-800">{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showStatsPanel && stats && (
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By Rank</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byRank).sort(([,a],[,b]) => b-a).map(([rank, count]) => (
                  <div key={rank} className="flex justify-between text-xs">
                    <span className="text-slate-600">{rank}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By District</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byDistrict).sort(([,a],[,b]) => b-a).map(([district, count]) => (
                  <div key={district} className="flex justify-between text-xs">
                    <span className="text-slate-600">{district}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">By Unit Type</h4>
              <div className="space-y-1.5">
                {Object.entries(stats.byUnitType).sort(([,a],[,b]) => b-a).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-xs">
                    <span className="text-slate-600">{UNIT_TYPE_LABELS[type] || type}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" placeholder="Search by name, badge, district..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Units</option>
          <option value="active">Active</option>
          <option value="on-leave">On Leave</option>
          <option value="inactive">Inactive</option>
        </select>
        {(searchQuery || filterStatus) && (
          <button onClick={() => { setSearchQuery(''); setFilterStatus(''); }} className="text-xs text-blue-600 hover:underline">Clear</button>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-80 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col shrink-0 relative">
          <div className="p-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">
              Police Units
              {!isLoading && <span className="text-xs font-normal text-slate-500 ml-2">({filteredOfficers.length})</span>}
            </h3>
          </div>
          {isFetching && !isLoading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-200 z-10"><div className="h-full bg-blue-600 animate-pulse w-1/2" /></div>}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : isError ? (
            <div className="flex-1 flex items-center justify-center text-red-500 text-xs p-4 flex-col gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>Failed to load</span>
              <button onClick={() => refetch()} className="text-blue-600 underline">Retry</button>
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No units found</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredOfficers.map((o: Officer) => (
                <div key={o.id} className={cn("p-3 border-l-4 cursor-pointer hover:bg-slate-50 transition-colors", o.status === 'active' ? 'border-l-green-500' : o.status === 'on-leave' ? 'border-l-amber-500' : 'border-l-slate-300')} onClick={() => handleUnitClick(o)}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-2.5 h-2.5 rounded-full", o.status === 'active' ? 'bg-green-500 animate-pulse' : o.status === 'on-leave' ? 'bg-amber-500' : 'bg-slate-400')} />
                      <span className="text-xs font-bold text-slate-800">{o.name}</span>
                    </div>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", o.status === 'active' ? 'bg-green-100 text-green-700' : o.status === 'on-leave' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-slate-500">{o.badgeNumber}</span>
                    <span className="text-[10px] text-slate-400">Â·</span>
                    <span className="text-[10px] text-slate-500">{o.rank}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{UNIT_TYPE_LABELS[o.unitType] || o.unitType}</span>
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{o.district}</span>
                  </div>
                  {o.currentLocation && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-500">{o.currentLocation.latitude.toFixed(4)}, {o.currentLocation.longitude.toFixed(4)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {o.assignedFIRs.length > 0 && (
                      <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <FileText className="w-2.5 h-2.5" />{o.assignedFIRs.length} FIR
                      </span>
                    )}
                    {o.assignedCases.length > 0 && (
                      <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Briefcase className="w-2.5 h-2.5" />{o.assignedCases.length} Case
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 bg-slate-900 rounded-md border border-slate-800 overflow-hidden relative shadow-sm">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : officersWithLocation.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/80">
              <div className="text-center">
                <Signal className="w-10 h-10 mx-auto mb-2 text-slate-400 opacity-50" />
                <p className="text-sm text-slate-400">No GPS data available</p>
                <p className="text-xs text-slate-500 mt-1">Officers have not reported GPS positions yet</p>
              </div>
            </div>
          ) : null}
          <MapContainer center={avgCenter} zoom={11} scrollWheelZoom={true} className="h-full w-full absolute inset-0 z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={MAP_TILE_URL}
            />
            <MapRecenter center={mapCenter} />
            {officersWithLocation.map((o: Officer) => (
              <CircleMarker
                key={o.id}
                center={[o.currentLocation!.latitude, o.currentLocation!.longitude]}
                radius={10}
                pathOptions={{ color: 'white', fillColor: STATUS_COLORS[o.status] || '#6b7280', fillOpacity: 0.85, weight: 2 }}
                eventHandlers={{ click: () => handleUnitClick(o) }}
              >
                <CircleMarker
                  center={[o.currentLocation!.latitude, o.currentLocation!.longitude]}
                  radius={4}
                  pathOptions={{ color: 'white', fillColor: STATUS_COLORS[o.status] || '#6b7280', fillOpacity: 1, weight: 2 }}
                >
                  <Popup>
                    <div className="bg-slate-800 border-0 shadow-xl m-0 w-48 text-left rounded-md overflow-hidden">
                      <div className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", o.status === 'active' ? 'text-green-400 bg-green-500/10' : 'text-slate-400 bg-slate-500/10')}>
                            {STATUS_LABELS[o.status]}
                          </span>
                          <span className="text-[10px] text-slate-400">{o.badgeNumber}</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">{o.name}</p>
                        <p className="text-[10px] text-slate-400">{o.rank} Â· {o.district}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{UNIT_TYPE_LABELS[o.unitType] || o.unitType}</p>
                        {o.specialization.length > 0 && (
                          <p className="text-[10px] text-blue-400 mt-1">{o.specialization.join(', ')}</p>
                        )}
                        <div className="mt-3">
                          <button onClick={(e) => { e.stopPropagation(); handleUnitClick(o); }} className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded transition-colors text-center">
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>

      {showDetailModal && selectedUnit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Shield className={cn("w-5 h-5", selectedUnit.status === 'active' ? 'text-green-600' : 'text-slate-600')} />
                <h3 className="text-lg font-bold text-slate-800">Unit Details</h3>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase", selectedUnit.status === 'active' ? 'bg-green-100 text-green-700' : selectedUnit.status === 'on-leave' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                  {STATUS_LABELS[selectedUnit.status]}
                </span>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Officer Name</label>
                  <p className="text-sm font-semibold text-slate-800">{selectedUnit.name}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Badge Number</label>
                  <p className="text-sm font-semibold text-slate-800">{selectedUnit.badgeNumber}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Rank</label>
                  <p className="text-sm text-slate-800">{selectedUnit.rank}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">District</label>
                  <p className="text-sm text-slate-800">{selectedUnit.district}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Phone</label>
                  <p className="text-sm text-slate-800 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedUnit.phone}</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Unit Type</label>
                  <p className="text-sm text-slate-800">{UNIT_TYPE_LABELS[selectedUnit.unitType] || selectedUnit.unitType}</p>
                </div>
              </div>
              {selectedUnit.specialization.length > 0 && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-medium">Specialization</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedUnit.specialization.map(s => (
                      <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedUnit.currentLocation && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <label className="text-[10px] text-green-600 uppercase font-bold">Last Known Location</label>
                  <p className="text-sm font-semibold text-green-800 mt-1">GPS: {selectedUnit.currentLocation.latitude.toFixed(4)}Â° N, {selectedUnit.currentLocation.longitude.toFixed(4)}Â° E</p>
                  <p className="text-[10px] text-green-600 mt-0.5">Updated: {formatDateTime(selectedUnit.currentLocation.timestamp)}</p>
                </div>
              )}
              {(selectedUnit.assignedFIRs.length > 0 || selectedUnit.assignedCases.length > 0) && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <label className="text-[10px] text-blue-600 uppercase font-bold">Current Assignments</label>
                  <div className="mt-1 space-y-1">
                    {selectedUnit.assignedFIRs.map(fir => (
                      <div key={fir} className="flex items-center gap-1 text-sm text-blue-800">
                        <FileText className="w-3 h-3" /> FIR: {fir}
                      </div>
                    ))}
                    {selectedUnit.assignedCases.map(c => (
                      <div key={c} className="flex items-center gap-1 text-sm text-blue-800">
                        <Briefcase className="w-3 h-3" /> Case: {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-medium mb-2 block">Quick Status Update</label>
                <div className="flex gap-2">
                  {['active', 'on-leave', 'inactive'].map(status => (
                    <button key={status} onClick={() => handleStatusChange(selectedUnit.id, status)} disabled={selectedUnit.status === status} className={cn("text-[10px] font-bold px-3 py-1.5 rounded transition-colors", selectedUnit.status === status ? "opacity-50 cursor-not-allowed" : "", status === 'active' ? "bg-green-100 text-green-700 hover:bg-green-200" : status === 'on-leave' ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}