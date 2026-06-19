import { useEffect, useState } from 'react';

interface ProgressBarProps {
  label: string;
  value: number;
  delayMs?: number;
}

export function ProgressBar({ label, value, delayMs = 0 }: ProgressBarProps) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(value);
    }, 100 + delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return (
    <div className="w-full mb-3" style={{ animation: `fadeInUp 0.5s ease-out ${delayMs}ms both` }}>
      <div className="flex justify-between text-xs font-medium text-slate-300 mb-1 px-1">
        <span>{label}</span>
        <span className="text-blue-300">{value}%</span>
      </div>
      <div className="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden backdrop-blur-sm border border-slate-700/50">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-indigo-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
