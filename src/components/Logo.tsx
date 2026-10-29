export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7af3e8" />
          <stop offset="1" stopColor="#14a99c" />
        </linearGradient>
      </defs>
      <path d="M32 4C19.3 4 9 14.1 9 26.6 9 43 32 60 32 60s23-17 23-33.4C55 14.1 44.7 4 32 4z" fill="url(#lg)" />
      <circle cx="30" cy="25" r="11" fill="#0a1c2a" />
      <circle cx="30" cy="25" r="7" fill="none" stroke="#7af3e8" strokeWidth="3" />
      <path d="M35 30l7 7" stroke="#7af3e8" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 6l1.6 3.4L55 11l-3.4 1.6L50 16l-1.6-3.4L45 11l3.4-1.6z" fill="#ffe08a" />
    </svg>
  );
}

export function Logo({ name = "Dawarly" }: { name?: string }) {
  return (
    <span className="flex items-center gap-2" dir="ltr">
      <LogoMark />
      <span className="text-xl font-bold tracking-tight text-white">{name}</span>
    </span>
  );
}
