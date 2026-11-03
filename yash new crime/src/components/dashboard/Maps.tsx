import { MAP_TILE_URL } from '../../lib/mapTiles';
import { Map as MapIcon, Plus, Minus, AlertCircle } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGetDashboardDistrictAnalysisQuery } from '../../store/api';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function getIntensityColor(count: number, maxCount: number): string {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio > 0.7) return '#ef4444';
  if (ratio > 0.4) return '#f59e0b';
  return '#10b981';
}

const GUJARAT_DISTRICTS: Record<string, [number, number]> = {
  'Ahmedabad': [23.0225, 72.5714],
  'Surat': [21.1702, 72.8311],
  'Vadodara': [22.3072, 73.1812],
  'Rajkot': [22.3039, 70.8022],
  'Bharuch': [21.7051, 72.9959],
  'Bhavnagar': [21.7645, 72.1519],
  'Jamnagar': [22.4707, 70.0577],
  'Junagadh': [21.5222, 70.4579],
  'Gandhinagar': [23.2156, 72.6369],
  'Anand': [22.5645, 72.9289],
  'Kutch': [23.7337, 69.8597],
  'Mehsana': [23.5880, 72.3693],
  'Navsari': [20.9467, 72.9220],
  'Patan': [23.8493, 72.1266],
  'Porbandar': [21.6417, 69.6293],
};

const INDIA_CENTER: [number, number] = [22.3072, 73.1812];

export function IndiaHeatmap() {
  const { data, isLoading, isError, refetch } = useGetDashboardDistrictAnalysisQuery();
  const districts = Array.isArray(data) ? data : [];
  const maxCount = districts.reduce((m, d) => Math.max(m, d.count), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-md p-0 flex flex-col h-full shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-[400] bg-white/90 backdrop-blur-sm pointer-events-none border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800">National Heatmap: Crime Density</h3>
          <p className="text-xs text-slate-500 mt-1">District-level aggregation of the 2001-2012 NCRB dataset</p>
        </div>
        <div className="flex flex-col space-y-1 text-[10px] text-slate-600">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-red-600 mr-1" /> Critical</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-orange-400 mr-1" /> High</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-1" /> Safe</span>
        </div>
      </div>

      <div className="flex-1 w-full relative z-0">
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="text-slate-400 text-sm">Loading map data...</div>
          </div>
        ) : isError ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50 flex-col gap-2">
            <AlertCircle className="w-6 h-6 text-red-400" />
            <div className="text-red-500 text-sm">Failed to load map data</div>
            <button onClick={() => refetch()} className="bg-red-50 border border-red-200 text-red-600 px-3 py-1 rounded text-xs font-medium hover:bg-red-100">Retry</button>
          </div>
        ) : districts.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="text-slate-400 text-sm">No district data available</div>
          </div>
        ) : (
          <MapContainer center={INDIA_CENTER} zoom={6} scrollWheelZoom={false} className="h-full w-full custom-leaflet-map z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={MAP_TILE_URL}
            />
            {districts.map((d: any) => {
              const coords = GUJARAT_DISTRICTS[d.district];
              if (!coords) return null;
              const color = getIntensityColor(d.count, maxCount);
              const radius = Math.max(8, Math.min(30, (d.count / Math.max(1, maxCount)) * 30));
              return (
                <CircleMarker
                  key={d.district}
                  center={coords}
                  radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.5 }}
                >
                  <Popup>
                    <div className="text-[11px] text-slate-800">
                      <p className="font-bold mb-1">{d.district}</p>
                      <p className="text-slate-600">Crimes: {d.count.toLocaleString()}</p>
                      {d.change != null && (
                        <p className="text-slate-600">Change: {d.change > 0 ? '+' : ''}{d.change}%</p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

export function CrimeHotspotMap() {
  const { addToast } = useToast();

  return (
    <div className="bg-slate-900 rounded-md overflow-hidden border border-slate-800 flex flex-col h-full relative group shadow-sm">
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-[400] bg-slate-900/80 backdrop-blur-sm border-b border-slate-800">
        <h3 className="text-sm font-bold text-white drop-shadow-md">Crime Hotspot Map</h3>
        <Link to="/admin/hotspots" className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors drop-shadow-md pointer-events-auto">
          View Full Map
        </Link>
      </div>

      <div className="flex-1 w-full relative z-0">
        <MapContainer center={[23.1072, 72.6312]} zoom={11} scrollWheelZoom={false} className="h-full w-full z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={MAP_TILE_URL}
          />
          <CircleMarker center={[23.0225, 72.5714]} radius={35} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.4, stroke: false }}>
            <Popup><div className="bg-slate-800 text-white border border-slate-700 p-2 rounded text-xs"><span className="font-bold">Ahmedabad</span><br />High Risk Zone</div></Popup>
          </CircleMarker>
          <CircleMarker center={[23.2156, 72.6369]} radius={25} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.4, stroke: false }}>
            <Popup><div className="bg-slate-800 text-white border border-slate-700 p-2 rounded text-xs"><span className="font-bold">Gandhinagar</span><br />Elevated Incidents</div></Popup>
          </CircleMarker>
        </MapContainer>
      </div>
    </div>
  );
}
