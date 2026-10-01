const fs = require('fs');

const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add Sun/Moon icons to imports if missing
if (!content.includes('Sun') || !content.includes('Moon')) {
    content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*["']lucide-react["'];/, (m, p1) => {
        const icons = p1.split(',').map(i => i.trim());
        if (!icons.includes('Sun')) icons.push('Sun');
        if (!icons.includes('Moon')) icons.push('Moon');
        return `import { ${icons.join(', ')} } from "lucide-react";`;
    });
}

// Add state
const stateCode = `
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("admin.darkMode");
      if (stored !== null) return stored === "1";
      return document.documentElement.classList.contains("dark");
    } catch {
      return true; // default dark
    }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("admin.darkMode", isDarkMode ? "1" : "0");
    } catch {}
  }, [isDarkMode]);
`;

// Insert after useState("all")
content = content.replace(
  /(\("all"\);\s*const \[soundOn, setSoundOn\] = useState<boolean>)/,
  `${stateCode.trim()}\n  $1`
);

// Update header toggle
const toggleBtn = `
            <IconButton
              color={isDarkMode ? "slate" : "amber"}
              icon={isDarkMode ? Moon : Sun}
              label={isDarkMode ? "الوضع المظلم" : "الوضع المضيء"}
              onClick={() => setIsDarkMode(!isDarkMode)}
            />
`;

content = content.replace(
  /(<IconButton\s*color=\{soundOn \? "green" : "slate"\})/,
  `${toggleBtn.trim()}\n            $1`
);

// Also replace the hardcoded bg-[#0c1322]/90
content = content.replace(/bg-\[\#0c1322\]\/90/g, 'bg-white/90 dark:bg-[#0c1322]/90');

fs.writeFileSync(file, content, 'utf8');
console.log('Updated AdminDashboard successfully');
