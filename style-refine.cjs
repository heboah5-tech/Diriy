const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  // Soften backgrounds and shadows for containers
  { regex: /shadow-xl backdrop-blur-md/g, replace: 'shadow-sm' },
  { regex: /shadow-lg backdrop-blur-md/g, replace: 'shadow-sm' },
  { regex: /shadow-2xl backdrop-blur-xl/g, replace: 'shadow-lg' },
  { regex: /backdrop-blur-xl/g, replace: '' },
  
  // Clean up arbitrary background opacities to solid colors for cleaner UI
  { regex: /bg-white\/90 dark:bg-\[\#0e1626\]\/90/g, replace: 'bg-white dark:bg-slate-900' },
  { regex: /bg-white\/95 dark:bg-\[\#0e1626\]\/95/g, replace: 'bg-white dark:bg-slate-900' },
  { regex: /bg-\[\#0e1626\]\/90/g, replace: 'bg-slate-900' },
  { regex: /bg-\[\#0e1626\]\/95/g, replace: 'bg-slate-900' },
  { regex: /bg-white\/60 dark:bg-slate-900\/60/g, replace: 'bg-slate-50/50 dark:bg-slate-900/50' },
  
  // Improve borders
  { regex: /border-slate-200 dark:border-slate-800/g, replace: 'border-slate-200/70 dark:border-slate-800' },
  { regex: /border-slate-300\/80 dark:border-slate-700\/80/g, replace: 'border-slate-200 dark:border-slate-700' },
  
  // Simplify header
  { regex: /border-b shrink-0 z-20 bg-white\/90 dark:bg-\[\#0c1322\]\/90 border-slate-200\/80 dark:border-slate-800\/80 shadow-lg/g, replace: 'border-b shrink-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-slate-200/70 dark:border-slate-800/80 shadow-sm' },
  
  // Clean main app background
  { regex: /bg-slate-50 dark:bg-\[\#070b14\]/g, replace: 'bg-slate-50 dark:bg-slate-950' },
  { regex: /bg-white dark:bg-slate-950/g, replace: 'bg-white dark:bg-slate-950' },
  
  // Adjust typography
  { regex: /text-2xl font-black/g, replace: 'text-2xl font-bold tracking-tight' },
  { regex: /font-black text-slate-950/g, replace: 'font-bold tracking-tight text-slate-900' },
  
  // Remove arbitrary gradient ghost borders
  { regex: /bg-gradient-to-tr from-\[\#c9a96e\] via-\[\#dfc495\] to-\[\#f4e4c1\]/g, replace: 'bg-amber-400' },
  
  // Remove excessive inner box shadows
  { regex: /shadow-\[0_0_15px_rgba[^\]]+\]/g, replace: 'shadow-sm' },
  { regex: /shadow-\[0_4px_16px_rgba[^\]]+\]/g, replace: 'shadow-md' },
  { regex: /shadow-\[0_8px_20px_rgba[^\]]+\]/g, replace: 'shadow-md' }
];

for (const {regex, replace} of replacements) {
    content = content.replace(regex, replace);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Refined styling successfully');
