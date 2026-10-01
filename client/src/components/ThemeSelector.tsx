import { Palette } from "lucide-react";
import { themes, type ThemeConfig } from "@/lib/theme";

export function ThemeSelector({ currentTheme, onSelectTheme }: { currentTheme: ThemeConfig, onSelectTheme: (t: ThemeConfig) => void }) {
  return (
    <div className="relative group">
      <button className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center gap-2">
        <Palette className="w-4 h-4" />
        <span className="text-xs font-bold hidden sm:inline">{currentTheme.name}</span>
      </button>
      
      <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => onSelectTheme(t)}
            className={`w-full text-right px-3 py-2 text-xs font-bold rounded-lg transition mb-1 last:mb-0 ${currentTheme.id === t.id ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
