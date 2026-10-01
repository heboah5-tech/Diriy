const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add ThemeSelector imports
if (!content.includes('ThemeSelector')) {
  content = content.replace(
    /import \{ playSound[^}]+\} from "@\/lib\/sounds";/,
    `$&
import { getSavedTheme, saveTheme, type ThemeConfig } from "@/lib/theme";
import { ThemeSelector } from "@/components/ThemeSelector";`
  );
}

// 2. Replace isDarkMode state with currentTheme
content = content.replace(
  /const \[isDarkMode, setIsDarkMode\] = useState<boolean>[^;]+;/,
  `const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(getSavedTheme);

  const handleSelectTheme = (theme: ThemeConfig) => {
    setCurrentTheme(theme);
    saveTheme(theme.id);
  };`
);

// 3. Replace the Sun/Moon toggle with ThemeSelector
content = content.replace(
  /<IconButton\s+color=\{isDarkMode \? "slate" : "amber"\}[\s\S]+?onClick=\{[^}]+\}\s*\/>/,
  `<ThemeSelector currentTheme={currentTheme} onSelectTheme={handleSelectTheme} />`
);
content = content.replace(
  /<button[^>]+onClick=\{[^>]+setIsDarkMode[^>]+>[\s\S]+?<\/button>/,
  `<ThemeSelector currentTheme={currentTheme} onSelectTheme={handleSelectTheme} />`
);

// 4. Update the main wrapper className
content = content.replace(
  /className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans"/,
  'className={`min-h-screen ${currentTheme.bgMain} ${currentTheme.isDark ? "text-slate-200" : "text-slate-800"} flex items-center justify-center p-4 relative overflow-hidden font-sans`}'
);
content = content.replace(
  /className="h-screen text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans"/,
  'className={`h-screen flex flex-col overflow-hidden ${currentTheme.bgMain} ${currentTheme.isDark ? "text-slate-200" : "text-slate-800"} font-sans`}'
);

// 5. Update the header className
content = content.replace(
  /className="border-b shrink-0 z-20 bg-white\/80 dark:bg-slate-950\/80 backdrop-blur-md border-slate-200\/70 dark:border-slate-800\/80 shadow-sm"/,
  'className={`shrink-0 ${currentTheme.bgHeader} text-slate-100 border-b ${currentTheme.borderSubtle} z-20 px-4 py-2.5 flex items-center justify-between shadow-md`}'
);

// 6. Strip dark classes and enforce white cards with slate-200 borders
content = content.replace(/dark:bg-slate-900/g, '');
content = content.replace(/dark:bg-slate-800/g, '');
content = content.replace(/dark:bg-slate-950/g, '');
content = content.replace(/dark:border-slate-800/g, '');
content = content.replace(/dark:border-slate-700/g, '');
content = content.replace(/dark:text-slate-100/g, '');
content = content.replace(/dark:text-slate-200/g, '');
content = content.replace(/dark:text-slate-300/g, '');
content = content.replace(/dark:text-slate-400/g, '');
content = content.replace(/dark:text-white/g, '');
content = content.replace(/dark:divide-slate-800\/50/g, '');

// Clean up double spaces
content = content.replace(/\s+/g, ' ');

fs.writeFileSync(file, content, 'utf8');
console.log('Design applied successfully');
