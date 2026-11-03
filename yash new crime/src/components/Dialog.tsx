import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function DialogOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>{children}</div>;
}

export function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', variant = 'default', isLoading, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel?: string; variant?: 'default' | 'danger' | 'warning'; isLoading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const styles = {
    default: 'bg-blue-600 hover:bg-blue-700',
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-amber-600 hover:bg-amber-700',
  };

  return (
    <DialogOverlay onClose={onCancel}>
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          {variant === 'danger' ? (
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          ) : variant === 'warning' ? (
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
          ) : null}
          <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-600">{message}</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={isLoading} className={cn("px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2", styles[variant])}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
