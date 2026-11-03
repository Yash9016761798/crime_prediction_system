import { Shield, HeartPulse, Plus } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';

export default function NearbyServices() {
  const { addToast } = useToast();

  const services = [
    { name: 'Gandhinagar Police Station', type: 'Police', dist: '1.2 km', addr: 'Sector 7, Gandhinagar', icon: Shield, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Women Police Station', type: 'Police', dist: '2.5 km', addr: 'Sector 11, Gandhinagar', icon: Shield, color: 'text-purple-600', bg: 'bg-purple-100' },
    { name: 'Civil Hospital', type: 'Hospital', dist: '3.1 km', addr: 'Sector 12, Gandhinagar', icon: HeartPulse, color: 'text-red-500', bg: 'bg-red-50' },
    { name: '24x7 Emergency Center', type: 'Emergency', dist: '4.0 km', addr: 'Gandhinagar', icon: Plus, color: 'text-orange-500', bg: 'bg-orange-50' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <h3 className="text-lg font-bold text-slate-900">Nearby Services</h3>
        <p className="text-sm text-slate-500 mt-1">Quick access to essential emergency locations.</p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto divide-y divide-slate-100">
        {services.map((svc, i) => (
          <div key={i} className="py-4 hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${svc.bg} ${svc.color} group-hover:scale-105 transition-transform`}>
                <svc.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight mb-1">{svc.name}</h4>
                <p className="text-xs text-slate-500">{svc.addr}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded block mb-1">
                {svc.dist}
              </span>
              <button onClick={() => addToast(`Getting directions to ${svc.name}...`)} className="text-[10px] text-blue-600 font-semibold hover:underline">Get Directions</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
