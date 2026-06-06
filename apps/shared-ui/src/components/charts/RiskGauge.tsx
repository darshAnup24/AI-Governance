interface RiskGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

export default function RiskGauge({ score, size = 120, label }: RiskGaugeProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const color = clamped >= 80 ? '#f87171' : clamped >= 50 ? '#fb923c' : clamped >= 20 ? '#facc15' : '#4ade80';
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1f2937" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-100" style={{ color }}>{Math.round(clamped)}</span>
        {label && <span className="text-xs text-gray-500 mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
