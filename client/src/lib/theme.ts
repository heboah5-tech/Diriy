export type ThemeConfig = {
  id: string;
  name: string;
  isDark: boolean;
  bgMain: string;
  bgHeader: string;
  borderSubtle: string;
};

export const themes: ThemeConfig[] = [
  { id: 'slate', name: 'داكن (أساسي)', isDark: true, bgMain: 'bg-slate-950', bgHeader: 'bg-slate-900', borderSubtle: 'border-slate-800' },
  { id: 'light', name: 'فاتح', isDark: false, bgMain: 'bg-slate-50', bgHeader: 'bg-indigo-600', borderSubtle: 'border-indigo-700/50' },
  { id: 'blue', name: 'أزرق ليلي', isDark: true, bgMain: 'bg-blue-950', bgHeader: 'bg-blue-900', borderSubtle: 'border-blue-800' },
];

export function getSavedTheme(): ThemeConfig {
  try {
    const id = localStorage.getItem('admin.theme');
    return themes.find(t => t.id === id) || themes[0];
  } catch {
    return themes[0];
  }
}

export function saveTheme(id: string) {
  try {
    localStorage.setItem('admin.theme', id);
  } catch {}
}
