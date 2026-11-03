import { MAP_TILE_URL } from '../../lib/mapTiles';
import { Navigation, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon paths globally
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function SafeRouteNavigation() {
  const { addToast } = useToast();

  const safeRoute: [number, number][] = [
    [23.0225, 72.5714],
    [23.0325, 72.5614],
    [23.0425, 72.5714],
    [23.0525, 72.5814],
    [23.0625, 72.5714]
  ];

  const normalRoute: [number, number][] = [
    [23.0225, 72.5714],
    [23.0425, 72.5814],
    [23.0625, 72.5714]
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[600px] overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Safe Route Navigation</h3>
          <p className="text-sm text-slate-500 mt-1">Route suggestions weighted by district-level crime density from the 2001-2012 dataset.</p>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* Sidebar Controls */}
        <div className="w-full md:w-80 border-r border-slate-200 bg-white p-4 flex flex-col z-10 z-20">
          <div className="space-y-4 mb-6">
            <div className="relative">
              <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm z-10"></div>
              <input type="text" value="Current Location" readOnly className="block w-full pl-8 pr-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-md sm:text-sm focus:outline-none" />
              <div className="absolute left-[17px] top-[26px] bottom-[-18px] w-0.5 bg-slate-200 z-0"></div>
            </div>
            <div className="relative">
              <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm z-10"></div>
              <input type="text" placeholder="Enter destination..." className="block w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm bg-white" />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Suggested Routes</p>
          
          <div className="space-y-3">
            {/* Safe Route */}
            <div className="border-2 border-blue-500 bg-blue-50 rounded-lg p-3 cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-blue-900">Safe Route</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded ml-1">Density-based</span>
                </div>
                <span className="text-sm font-bold text-slate-900">13 min</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Avoids high crime areas. Well-lit roads.</span>
                <span>7.2 km</span>
              </div>
            </div>

            {/* Normal Route */}
            <div className="border border-slate-200 rounded-lg p-3 cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-slate-700">Fastest Route</span>
                <span className="text-sm font-bold text-slate-900">10 min</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-medium text-orange-700">Passes through reported hotspot.</span>
              </div>
              <div className="flex justify-end text-xs text-slate-500">
                <span>6.1 km</span>
              </div>
            </div>
          </div>

          <button onClick={() => addToast('Navigation started. Please follow the instructions.', 'success')} className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2">
            <Navigation className="w-4 h-4 fill-current" /> Start Navigation
          </button>
        </div>

        {/* Map View */}
        <div className="flex-1 min-h-[300px] bg-slate-100 relative z-0">
          <MapContainer center={[23.0425, 72.5714]} zoom={13} scrollWheelZoom={true} className="h-full w-full absolute inset-0 z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={MAP_TILE_URL}
            />
            
            {/* Hotspot */}
            <CircleMarker center={[23.0425, 72.5814]} radius={40} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2, stroke: false }}>
              <Tooltip>High Risk Area</Tooltip>
            </CircleMarker>

            {/* Safe Route */}
            <Polyline positions={safeRoute} pathOptions={{ color: '#2563eb', weight: 4 }} />
            
            {/* Normal Route (Danger) */}
            <Polyline positions={normalRoute} pathOptions={{ color: '#94a3b8', weight: 3, dashArray: '5, 5' }} />

            {/* Start point */}
            <CircleMarker center={[23.0225, 72.5714]} radius={8} pathOptions={{ color: 'white', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }} />
            
            {/* End point */}
            <CircleMarker center={[23.0625, 72.5714]} radius={8} pathOptions={{ color: 'white', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}>
              <Tooltip permanent direction="right">Destination</Tooltip>
            </CircleMarker>
            
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
