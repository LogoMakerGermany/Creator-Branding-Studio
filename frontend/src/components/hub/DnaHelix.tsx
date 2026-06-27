export function DnaHelix({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 200"
      className={`ucbs-dna-glow ucbs-dna-animate ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="dnaGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      {/* Left strand */}
      <path
        d="M30 10 Q60 30 30 50 Q0 70 30 90 Q60 110 30 130 Q0 150 30 170 Q60 190 30 200"
        stroke="url(#dnaGrad1)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Right strand */}
      <path
        d="M90 10 Q60 30 90 50 Q120 70 90 90 Q60 110 90 130 Q120 150 90 170 Q60 190 90 200"
        stroke="url(#dnaGrad1)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Rungs */}
      {[20, 45, 70, 95, 120, 145, 170].map((y) => (
        <line
          key={y}
          x1="35"
          y1={y}
          x2="85"
          y2={y + 5}
          stroke="url(#dnaGrad1)"
          strokeWidth="2"
          opacity="0.7"
        />
      ))}
    </svg>
  );
}
