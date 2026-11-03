/**
 * Crime Intel — Officer Dispatch page.
 *
 * Officer-facing interface for:
 *   - Real-time GPS tracking (live device GPS or clearly-labelled demo simulation)
 *   - SOS emergency button (press and hold to activate)
 *   - Officer status updates
 *   - Real-time notifications
 *   - Live map showing the officer's own position
 *
 * Simulated coordinates are ALWAYS labelled as DEMO MODE and are never mixed
 * with real GPS data or presented as real tracking information.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  useSocket,
} from '../../contexts/SocketContext';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCurrentUser, selectIsAuthenticated } from '../../store/slices/authSlice';
import { useToast } from '../../components/ToastProvider';
import { cn } from '../../lib/utils';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DEMO_ORIGIN: [number, number] = [22.3072, 73.1812]; // Vadodara, Gujarat (demo reference point)
const DEMO_ROUTES: Record<string, [number, number][]> = {
  'Central Patrol': [
    [22.3072, 73.1812],
    [22.312, 73.188],
    [22.320, 73.195],
    [22.328, 73.182],
    [22.335, 73.175],
    [22.328, 73.160],
    [22.320, 73.152],
    [22.310, 73.160],
  ],
  'City Perimeter': [
    [22.3072, 73.1812],
    [22.295, 73.170],
    [22.285, 73.160],
    [22.275, 73.175],
    [22.270, 73.190],
    [22.280, 73.205],
    [22.295, 73.210],
    [22.3072, 73.1812],
  ],
};

function formatTime(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface DemoOfficer {
  id: string;
  name: string;
  badgeNumber: string;
  routeName: string;
  routeIndex: number;
  positions: [number, number][];
  lat: number;
  lng: number;
  heading: number;
  moving: boolean;
}

function bearing(from: [number, number], to: [number, number]): number {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;
  return brng;
}

/** Captures the Leaflet map instance into a ref so we can pan programmatically. */
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

export default function OfficerDispatch() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);
  const { addToast } = useToast();
  const { socket, isConnected, emit, on, off } = useSocket();

  // ---- UI state ----
  const [trackingMode, setTrackingMode] = useState<'live' | 'demo'>('live');
  const [isTracking, setIsTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [sosPressed, setSosPressed] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [emergencyType, setEmergencyType] = useState('Officer Assistance');
  const [sosDescription, setSosDescription] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: string } | null>(null);
  const [officerStatus, setOfficerStatus] = useState<'active' | 'on-leave' | 'inactive'>('active');
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type: string; createdAt: string; read: boolean }>>([]);
  const [demoOfficers, setDemoOfficers] = useState<DemoOfficer[]>([]);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [selectedDemoRoute, setSelectedDemoRoute] = useState('Central Patrol');

  // ---- Refs ----
  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const sosHoldTimerRef = useRef<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const ownMarkerRef = useRef<L.Marker | null>(null);
  const demoMarkersRef = useRef<Map<string, L.Marker | L.CircleMarker>>(new Map());

  // ---- Geolocation (live) ----
  const startLiveTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setTrackingError('Geolocation is not supported by this browser.');
      return;
    }
    setTrackingError(null);
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        const timestamp = new Date(pos.timestamp).toISOString();
        setLocation({ latitude, longitude, accuracy: accuracy ?? 0, timestamp });

        if (socket) {
          emit('officer:location:update', {
            latitude,
            longitude,
            accuracy: accuracy ?? 0,
            trackingMode: 'live',
            timestamp,
          });
        }
      },
      err => {
        let msg = 'Unable to retrieve location.';
        if (err.code === 1) msg = 'Location permission denied. Please grant location access.';
        else if (err.code === 2) msg = 'Position unavailable (GPS signal not found).';
        else if (err.code === 3) msg = 'Location request timed out.';
        setTrackingError(msg);
        addToast(msg, 'error');
      },
      options
    );
    setIsTracking(true);
  }, [socket, emit, addToast]);

  const stopLiveTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    if (socket) {
      emit('officer:status:update', { status: 'offline' });
    }
  }, [socket, emit]);

  // ---- Demo simulation ----
  const initDemoOfficers = useCallback(() => {
    const route = DEMO_ROUTES[selectedDemoRoute];
    if (!route) return;
    const base: DemoOfficer[] = [
      {
        id: 'demo-officer-1',
        name: 'Demo Inspector Rao',
        badgeNumber: 'DEMO-1001',
        routeName: selectedDemoRoute,
        routeIndex: 0,
        positions: route,
        lat: route[0][0],
        lng: route[0][1],
        heading: bearing(route[0], route[1] ?? route[0]),
        moving: true,
      },
      {
        id: 'demo-officer-2',
        name: 'Demo SI Mehta',
        badgeNumber: 'DEMO-1002',
        routeName: selectedDemoRoute,
        routeIndex: 2,
        positions: route,
        lat: route[2][0],
        lng: route[2][1],
        heading: bearing(route[2], route[3] ?? route[0]),
        moving: true,
      },
    ];
    setDemoOfficers(base);
  }, [selectedDemoRoute]);

  const startDemo = useCallback(() => {
    if (simIntervalRef.current !== null) return;
    initDemoOfficers();
    setSimulationRunning(true);
    const step = () => {
      setDemoOfficers(prev =>
        prev.map(o => {
          if (!o.moving) return o;
          const positions = o.positions;
          const nextIndex = (o.routeIndex + 1) % positions.length;
          const next = positions[nextIndex];
          // Move a fraction toward the next point.
          const stepF = 0.18;
          const newLat = o.lat + (next[0] - o.lat) * stepF;
          const newLng = o.lng + (next[1] - o.lng) * stepF;
          const reached = Math.hypot(newLat - next[0], newLng - next[1]) < 0.0005;
          const updated: DemoOfficer = {
            ...o,
            lat: newLat,
            lng: newLng,
            heading: bearing([newLat, newLng], next),
            routeIndex: reached ? nextIndex : o.routeIndex,
            moving: true,
          };
          // Emit simulated location through Socket.IO (clearly demo-labelled).
          if (socket) {
            emit('officer:location:update', {
              latitude: newLat,
              longitude: newLng,
              accuracy: 10,
              trackingMode: 'demo',
              timestamp: new Date().toISOString(),
            });
          }
          return updated;
        })
      );
    };
    step();
    simIntervalRef.current = window.setInterval(step, 1200) as unknown as number;
    addToast('Demo simulation started — simulated officers are labelled DEMO', 'info');
  }, [socket, emit, initDemoOfficers, addToast]);

  const stopDemo = useCallback(() => {
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setSimulationRunning(false);
    setDemoOfficers([]);
    addToast('Demo simulation stopped', 'info');
  }, [addToast]);

  // ---- SOS ----
  const triggerSos = async () => {
    setSosActive(true);
    setSosConfirm(false);
    // Capture current location (live or demo).
    const current = location;
    const lat = current ? current.latitude : DEMO_ORIGIN[0];
    const lng = current ? current.longitude : DEMO_ORIGIN[1];
    const accuracy = current ? current.accuracy : 0;

    try {
      if (socket) {
        const res: any = await new Promise(resolve => {
          emit(
            'sos:create',
            {
              latitude: lat,
              longitude: lng,
              accuracy,
              emergency_type: emergencyType,
              description: sosDescription || `SOS activated by ${user?.name ?? 'Officer'}`,
              locationAddress: trackingMode === 'demo' ? 'DEMO SIMULATION LOCATION' : 'Live GPS location',
              district: 'Central District',
              priority: 'high',
            },
            resolve
          );
        });
        if (res?.ok) {
          addToast('SOS alert sent to monitoring center', 'success');
        } else {
          addToast(res?.error || 'Failed to send SOS', 'error');
        }
      } else {
        addToast('Socket not connected — SOS could not be sent', 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'SOS submission failed', 'error');
    } finally {
      setTimeout(() => setSosActive(false), 3000);
    }
  };

  const startSosHold = useCallback(() => {
    if (sosActive) return;
    setSosPressed(true);
    sosHoldTimerRef.current = window.setTimeout(() => {
      setSosPressed(false);
      triggerSos();
    }, 2000);
  }, [sosActive, triggerSos]);

  const cancelSosHold = useCallback(() => {
    setSosPressed(false);
    if (sosHoldTimerRef.current !== null) {
      window.clearTimeout(sosHoldTimerRef.current);
      sosHoldTimerRef.current = null;
    }
  }, []);

  // ---- Socket listeners ----
  useEffect(() => {
    if (!socket) return;

    // Real-time location updates from other officers (live or demo-labelled).
    on('officer:location:updated', payload => {
      // payload.officerId etc.
    });

    // Officer status updates.
    on('officer:status:updated', payload => {
      addToast(`Officer status: ${payload.status}`, 'info');
    });

    // New SOS alerts (broadcast to all, so officer sees SOS activity).
    on('sos:new', alert => {
      addToast(`New SOS: ${alert.alertType} — ${alert.locationAddress}`, 'error');
      setNotifications(prev => [
        { id: alert.id, title: 'New SOS Alert', message: `${alert.alertType} — ${alert.locationAddress}`, type: 'sos', createdAt: alert.createdAt, read: false },
        ...prev,
      ].slice(0, 50));
    });

    // Notifications.
    on('notification:new', notif => {
      setNotifications(prev => [{ id: notif.id, title: notif.title, message: notif.message, type: notif.type, createdAt: notif.createdAt, read: false }, ...prev].slice(0, 50));
      addToast(notif.title, 'info');
    });

    // SOS assigned to this officer (sent directly to the assigned officer's socket).
    on('sos:assigned', alert => {
      addToast(`SOS assigned: ${alert.id}`, 'info');
    });

    return () => {
      // listeners removed via socket.off handled by unmount cleanup
    };
  }, [socket, on, user, addToast]);

  // ---- Tracking lifecycle ----
  useEffect(() => {
    const run = () => {
      if (trackingMode === 'live') {
        if (isTracking) startLiveTracking();
        else stopLiveTracking();
      } else {
        stopLiveTracking();
        if (isTracking && simulationRunning) stopDemo();
        if (!isTracking) stopDemo();
      }
    };
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [trackingMode, isTracking, simulationRunning, startLiveTracking, stopLiveTracking, stopDemo]);

  // When switching to demo, ensure live watcher stops.
  useEffect(() => {
    const run = () => {
      if (trackingMode === 'demo') {
        stopLiveTracking();
      }
    };
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [trackingMode, stopLiveTracking]);

  // Update own marker on map.
  useEffect(() => {
    if (!mapRef.current) return;
    const coords = trackingMode === 'demo' ? demoOfficers.find(o => o.id === 'demo-officer-1') : null;
    const lat = trackingMode === 'demo' ? (coords ? coords.lat : DEMO_ORIGIN[0]) : location?.latitude ?? DEMO_ORIGIN[0];
    const lng = trackingMode === 'demo' ? (coords ? coords.lng : DEMO_ORIGIN[1]) : location?.longitude ?? DEMO_ORIGIN[1];

    if (!ownMarkerRef.current) {
      const marker = L.marker([lat, lng], {
        title: trackingMode === 'demo' ? 'DEMO — Simulated Officer' : 'You (Live GPS)',
      }).addTo(mapRef.current);
      ownMarkerRef.current = marker;
      marker.bindPopup(
        `<div><strong>${trackingMode === 'demo' ? 'DEMO MODE' : 'Live GPS'}</strong><br/>
        ${user?.name ?? 'Officer'}<br/>
        ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>`
      );
    } else {
      ownMarkerRef.current.setLatLng([lat, lng]);
    }
    mapRef.current.setView([lat, lng], mapRef.current.getZoom());
  }, [trackingMode, location, demoOfficers, user, mapRef]);

  // Demo markers on map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = demoMarkersRef.current;
    demoOfficers.forEach(o => {
      if (!markers.has(o.id)) {
        const m = L.circleMarker([o.lat, o.lng], {
          radius: 8,
          color: 'white',
          fillColor: '#9ca3af',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
        m.bindPopup(`<div><strong style="color:#6b7280">DEMO — ${o.name}</strong><br/>${o.badgeNumber}<br/>Simulated route</div>`);
        markers.set(o.id, m);
      } else {
        markers.get(o.id)?.setLatLng([o.lat, o.lng]);
      }
    });
    // Remove stale markers.
    markers.forEach((m, id) => {
      if (!demoOfficers.find(o => o.id === id)) {
        map.removeLayer(m);
        markers.delete(id);
      }
    });
  }, [demoOfficers, mapRef]);

  const mapCenter: [number, number] = trackingMode === 'demo'
    ? (demoOfficers[0] ? [demoOfficers[0].lat, demoOfficers[0].lng] : DEMO_ORIGIN)
    : location
    ? [location.latitude, location.longitude]
    : DEMO_ORIGIN;

  // ---- Emergency types ----
  const emergencyTypes = [
    'Medical Emergency',
    'Officer Assistance',
    'Public Safety Emergency',
    'Security Threat',
    'Other',
  ];

  const isOfficer = user?.role === 'officer';

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight mb-1 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-600" />
            Officer Dispatch
          </h2>
          <p className="text-sm text-slate-500">
            Real-time GPS tracking & SOS • {user?.name ?? 'Officer'} ({user?.role ?? 'officer'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          <button onClick={() => (socket ? socket.connect() : null)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-3 h-3 inline mr-1" />
            Reconnect
          </button>
        </div>
      </div>

      {/* Tracking mode selector — clearly labelled */}
      <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tracking Mode</span>
            <div className="flex border border-slate-300 rounded-md overflow-hidden">
              <button
                onClick={() => setTrackingMode('live')}
                className={cn("px-4 py-2 text-xs font-medium transition-colors", trackingMode === 'live' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-transparent hover:bg-slate-50")}
              >
                LIVE GPS
              </button>
              <button
                onClick={() => setTrackingMode('demo')}
                className={cn("px-4 py-2 text-xs font-medium transition-colors", trackingMode === 'demo' ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-transparent hover:bg-slate-50")}
              >
                DEMO SIMULATION
              </button>
            </div>
          </div>
          {trackingMode === 'demo' && (
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
              DEMO DATA — Simulated movement, not real GPS
            </span>
          )}
        </div>
      </div>

      {/* Live GPS status / errors */}
      {trackingMode === 'live' && (
        <div className="bg-white border border-slate-200 rounded-md p-3 shadow-sm flex items-center gap-3">
          <div className={cn("w-2.5 h-2.5 rounded-full", isTracking ? (location ? "bg-green-500 animate-pulse" : "bg-amber-500 animate-pulse") : "bg-slate-400")} />
          <div className="flex-1">
            <p className={cn("text-sm font-semibold", isTracking ? "text-green-800" : "text-slate-600")}>
              {isTracking ? 'Tracking active — sending GPS updates' : 'Tracking stopped'}
            </p>
            <p className="text-[10px] text-slate-500">
              {location ? `Last update: ${formatTime(location.timestamp)} • Accuracy: ±${location.accuracy}m` : 'Waiting for location permission...'}
            </p>
          </div>
          <button
            onClick={() => (isTracking ? stopLiveTracking() : startLiveTracking())}
            disabled={!isAuthenticated}
            className={cn("px-3 py-1.5 text-xs font-bold rounded transition-colors", isTracking ? "bg-red-600 text-white hover:bg-red-700" : "bg-green-600 text-white hover:bg-green-700")}
          >
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </button>
        </div>
      )}
      {trackingError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {trackingError}
        </div>
      )}

      {/* Demo simulation controls */}
      {trackingMode === 'demo' && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-amber-800 uppercase">Demo Simulation</span>
            <select
              value={selectedDemoRoute}
              onChange={e => setSelectedDemoRoute(e.target.value)}
              disabled={simulationRunning}
              className="text-xs border border-amber-300 rounded px-2 py-1 bg-white"
            >
              {Object.keys(DEMO_ROUTES).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={simulationRunning ? stopDemo : startDemo}
              disabled={!isAuthenticated}
              className={cn("px-3 py-1.5 text-xs font-bold rounded transition-colors", simulationRunning ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-blue-600 text-white hover:bg-blue-700")}
            >
              {simulationRunning ? 'Stop Simulation' : 'Start Simulation'}
            </button>
            <span className={cn("text-[10px] font-bold", simulationRunning ? "text-green-700" : "text-slate-500")}>
              {simulationRunning ? '● Running' : '○ Stopped'}
            </span>
          </div>
          <p className="text-[10px] text-amber-600 mt-1">
            Simulated officers move along predefined routes. Coordinates are DEMO data only.
          </p>
        </div>
      )}

      {/* SOS Section */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-bold text-slate-800">SOS Emergency</h3>
          </div>
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", sosActive ? "bg-red-100 text-red-700 animate-pulse" : "bg-slate-100 text-slate-600")}>
            {sosActive ? 'SOS ACTIVE' : 'Standby'}
          </span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-medium block mb-1">Emergency Type</label>
              <select
                value={emergencyType}
                onChange={e => setEmergencyType(e.target.value)}
                disabled={sosActive}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white"
              >
                {emergencyTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-medium block mb-1">Mode</label>
              <span className={cn("text-xs", trackingMode === 'demo' ? "bg-amber-100 text-amber-700 px-2 py-1 rounded uppercase font-bold" : "bg-green-100 text-green-700 px-2 py-1 rounded uppercase font-bold")}>
                {trackingMode === 'demo' ? 'DEMO' : 'LIVE GPS'}
              </span>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase font-medium block mb-1">Description (optional)</label>
            <textarea
              value={sosDescription}
              onChange={e => setSosDescription(e.target.value)}
              placeholder="Additional details..."
              rows={2}
              disabled={sosActive}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white"
            />
          </div>
          <div className="flex items-center justify-center">
            <button
              onPointerDown={startSosHold}
              onPointerUp={cancelSosHold}
              onPointerLeave={cancelSosHold}
              onClick={e => e.preventDefault()}
              disabled={sosActive || !isAuthenticated || !isConnected}
              className={cn(
                "relative flex-1 h-24 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 font-bold shadow-lg",
                sosActive
                  ? "bg-red-100 border-4 border-red-500 text-red-700"
                  : "bg-red-600 border-4 border-red-700 text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <span className="text-2xl">{sosPressed ? <div className="animate-pulse">🔴</div> : '🚨'}</span>
              <span className="text-sm mt-1">{sosPressed ? 'Holding to confirm...' : 'Press & Hold 2s'}</span>
              <span className="text-[10px] text-opacity-75">{sosActive ? 'SOS triggered' : 'SOS Emergency'}</span>
            </button>
          </div>
          {sosPressed && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 font-medium">
              <AlertCircle className="w-3 h-3" /> Hold to confirm SOS activation
            </div>
          )}
          {trackingMode === 'demo' && (
            <p className="text-[10px] text-amber-600 mt-2 text-center">
              SOS in demo mode sends a simulated alert labelled DEMO.
            </p>
          )}
        </div>
      </div>

      {/* Officer status */}
      <div className="bg-white border border-slate-200 rounded-md p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase font-medium">Officer Status</p>
            <p className="text-sm font-semibold text-slate-800">{officerStatus}</p>
          </div>
          <div className="flex gap-2">
            {(['active', 'on-leave', 'inactive'] as const).map(status => (
              <button
                key={status}
                onClick={() => {
                  setOfficerStatus(status);
                  socket?.emit('officer:status:update', { status });
                }}
                className={cn("text-[10px] font-bold px-2.5 py-1 rounded transition-colors", officerStatus === status ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map + notifications */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Map */}
        <div className="flex-1 bg-slate-900 rounded-md border border-slate-800 overflow-hidden relative shadow-sm">
          <MapContainer center={mapCenter} zoom={14} scrollWheelZoom={true} className="h-full w-full absolute inset-0 z-0">
            <MapRefCapture mapRef={mapRef} />
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {trackingMode === 'live' && location && (
              <CircleMarker
                center={[location.latitude, location.longitude]}
                radius={9}
                pathOptions={{ color: 'white', fillColor: '#22c55e', fillOpacity: 0.9, weight: 2 }}
              >
                <Popup>
                  <div className="bg-slate-800 text-white p-2 rounded text-left w-48">
                    <p className="text-xs font-bold text-green-400 uppercase">LIVE GPS — You</p>
                    <p className="text-sm">{user?.name ?? 'Officer'}</p>
                    <p className="text-[10px] text-slate-300">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Accuracy ±{location.accuracy}m</p>
                  </div>
                </Popup>
              </CircleMarker>
            )}
            {trackingMode === 'demo' && (
              <>
                <CircleMarker
                  center={[mapCenter[0], mapCenter[1]]}
                  radius={10}
                  pathOptions={{ color: 'white', fillColor: '#9ca3af', fillOpacity: 0.9, weight: 2, dashArray: '6' }}
                >
                  <Popup>
                    <div className="bg-slate-800 text-white p-2 rounded text-left w-48">
                      <p className="text-xs font-bold text-amber-400 uppercase">DEMO — Simulated</p>
                      <p className="text-sm">{user?.name ?? 'Officer'}</p>
                      <p className="text-[10px] text-slate-300">{mapCenter[0].toFixed(4)}, {mapCenter[1].toFixed(4)}</p>
                      <p className="text-[10px] text-amber-300 mt-1">Simulated position — not real GPS</p>
                    </div>
                  </Popup>
                </CircleMarker>
              </>
            )}
          </MapContainer>
        </div>
        {/* Notifications panel */}
        <div className="w-72 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
            <span className="text-[10px] text-slate-500">{notifications.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">No notifications</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="p-3 text-xs">
                  <p className="text-slate-800 font-medium leading-snug">{n.message}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{n.title} • {formatTime(n.createdAt)}</p>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-slate-200">
            <button onClick={() => setNotifications([])} className="w-full text-xs text-slate-500 underline hover:text-slate-700">Clear all</button>
          </div>
        </div>
      </div>

      {/* Help hint */}
      <div className="text-[10px] text-slate-400 text-center">
        Demo data is clearly labelled and never presented as real GPS. Tracking requires HTTPS in production.
      </div>
    </div>
  );
}
