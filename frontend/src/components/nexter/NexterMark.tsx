import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Hexagon-M wordmark from the product mockup. */
export function NexterMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const gid = `nexter-hex-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="6" y1="2" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <polygon
        points="20,2.5 35.5,11.5 35.5,28.5 20,37.5 4.5,28.5 4.5,11.5"
        fill={`url(#${gid})`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.2"
      />
      <path
        d="M12 28V13.2h3.4l4.6 10.2 4.6-10.2H28V28h-3.05V18.4L20.7 28h-1.4l-4.25-9.6V28H12z"
        fill="#f5f3ff"
      />
    </svg>
  );
}
