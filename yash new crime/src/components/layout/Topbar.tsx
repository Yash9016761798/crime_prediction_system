import { Bell, Search, Menu, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useGetUnreadNotificationCountQuery, useLogoutMutation } from '../../store/api';
import { logoutLocally } from '../../store/slices/authSlice';

export default function Topbar() {
  const { data: unreadCount = 0 } = useGetUnreadNotificationCountQuery(undefined, {
    pollingInterval: 30000,
  });
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [logout] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      dispatch(logoutLocally());
      navigate('/login');
    }
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-white border-b border-slate-200 flex-shrink-0">
      <div className="flex items-center space-x-4 flex-1">
        <button className="md:hidden text-slate-400 hover:text-slate-600">
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded hidden sm:inline-block">Status: System Normal</span>
      </div>

      <div className="flex items-center space-x-6">
        <div className="relative hidden md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-9 pr-3 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 placeholder-slate-400"
            placeholder="Search FIR, Officers..."
          />
        </div>
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-red-500 transition-colors relative"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
