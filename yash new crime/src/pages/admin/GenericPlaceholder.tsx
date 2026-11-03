import type { ComponentType } from 'react';

export default function GenericPlaceholder({ title, description, icon: Icon }: { title: string, description: string, icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="h-[calc(100vh-140px)] flex flex-col pt-10 items-center justify-center text-center">
      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-slate-400" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 max-w-md">{description}</p>
      <div className="mt-8 px-4 py-2 bg-blue-50 text-blue-700 rounded-md border border-blue-200 text-sm font-semibold">
        Coming Soon in V2.0
      </div>
    </div>
  );
}
