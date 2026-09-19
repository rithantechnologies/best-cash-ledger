export function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Best Agency">
      <defs>
        <linearGradient id="best-agency-mark-gradient" x1="7" y1="4" x2="43" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9F7AEA" />
          <stop offset=".5" stopColor="#6D28D9" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <path
        fill="url(#best-agency-mark-gradient)"
        fillRule="evenodd"
        d="M9 5h18c9 0 15 4.8 15 12 0 4.1-2.2 7.6-6.1 9.6 5.4 1.8 8.6 5.7 8.6 10.5C44.5 44.1 38 48 28.4 48H9V5Zm11 8v11h7c3.6 0 5.8-2.1 5.8-5.5S30.6 13 27 13h-7Zm0 19v8h8.5c3.8 0 6-1.6 6-4s-2.2-4-6-4H20Z"
      />
    </svg>
  );
}
