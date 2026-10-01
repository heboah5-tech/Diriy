export function SkyLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="125" cy="50" r="45" fill="#FDD835" />
      <text x="10" y="75" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="72" fill="currentColor" letterSpacing="-4">SKY</text>
      <text x="175" y="85" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="20" fill="currentColor" transform="rotate(-90 175 85)" letterSpacing="4">PANEL</text>
    </svg>
  );
}
