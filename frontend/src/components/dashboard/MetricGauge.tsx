import { useCallback, useEffect, useRef, useState } from 'react';

interface MetricGaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  size?: number;
}

function getColor(value: number, warning: number, critical: number): string {
  if (value >= critical) return '#ef4444';
  if (value >= warning) return '#f59e0b';
  return '#10b981';
}

function getTrailColor(): string {
  return '#27272a';
}

export function MetricGauge({
  value,
  max,
  label,
  unit,
  warningThreshold = 70,
  criticalThreshold = 90,
  size = 100,
}: MetricGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const previousValue = useRef(0);
  const animationRef = useRef<number>(0);

  const animate = useCallback(() => {
    const start = previousValue.current;
    const end = value;
    const duration = 800;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setAnimatedValue(current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        previousValue.current = end;
      }
    };

    animationRef.current = requestAnimationFrame(step);
  }, [value]);

  useEffect(() => {
    animate();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animate]);

  const percentage = Math.min((animatedValue / max) * 100, 100);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const offset = arcLength - (percentage / 100) * arcLength;
  const color = getColor(animatedValue, warningThreshold, criticalThreshold);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-[135deg]"
        >
          {/* Background arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getTrailColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke 0.3s ease',
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-lg font-bold font-mono leading-none"
            style={{ color }}
          >
            {animatedValue.toFixed(1)}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">{unit}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
