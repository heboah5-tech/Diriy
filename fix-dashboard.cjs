const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync('/tmp/dashboard_current.tsx', 'utf8');

// The broken code looks like:
// const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(getSavedTheme); const handleSelectTheme = (theme: ThemeConfig) => { setCurrentTheme(theme); saveTheme(theme.id); }; if (stored !== null) return stored === "1"; return document.documentElement.classList.contains("dark"); } catch { return true; // default dark } }); useEffect(() => { if (isDarkMode) { document.documentElement.classList.add("dark"); } else { document.documentElement.classList.remove("dark"); } try { localStorage.setItem("admin.darkMode", isDarkMode ? "1" : "0"); } catch {} }, [isDarkMode]);

const searchStr = `if (stored !== null) return stored === "1"; return document.documentElement.classList.contains("dark"); } catch { return true; // default dark } }); useEffect(() => { if (isDarkMode) { document.documentElement.classList.add("dark"); } else { document.documentElement.classList.remove("dark"); } try { localStorage.setItem("admin.darkMode", isDarkMode ? "1" : "0"); } catch {} }, [isDarkMode]);`;

// Remove the broken leftover dark mode logic
content = content.replace(searchStr, "");
content = content.replace(/\s+/g, ' '); // It's already flattened, but let's make sure we find the exact string if spacing differs.

let normalizedContent = fs.readFileSync('/tmp/dashboard_current.tsx', 'utf8').replace(/\s+/g, ' ');

const searchRegex = /if \(stored !== null\) return stored === "1"; return document\.documentElement\.classList\.contains\("dark"\); \} catch \{ return true; \/\/ default dark \} \}\); useEffect\(\(\) => \{ if \(isDarkMode\) \{ document\.documentElement\.classList\.add\("dark"\); \} else \{ document\.documentElement\.classList\.remove\("dark"\); \} try \{ localStorage\.setItem\("admin\.darkMode", isDarkMode \? "1" : "0"\); \} catch \{\} \}, \[isDarkMode\]\);/g;

normalizedContent = normalizedContent.replace(searchRegex, "");

fs.writeFileSync(file, normalizedContent, 'utf8');
