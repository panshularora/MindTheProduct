'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { RiskRadarData } from '@/lib/risk-radar';

interface RiskRadarChartProps {
  data: RiskRadarData;
  size?: number;
}

// Color based on overall health score
function getOverallColor(score: number | null): { fill: string; stroke: string; glow: string } {
  if (score === null) return { fill: 'rgba(139,148,158,0.12)', stroke: 'var(--color-neutral)', glow: 'rgba(139,148,158,0.3)' };
  if (score >= 70) return { fill: 'rgba(16,185,129,0.18)', stroke: 'var(--color-fresh)', glow: 'rgba(16,185,129,0.4)' };
  if (score >= 45) return { fill: 'rgba(245,158,11,0.18)', stroke: 'var(--color-contested)', glow: 'rgba(245,158,11,0.4)' };
  return { fill: 'rgba(239,68,68,0.18)', stroke: 'var(--color-stale)', glow: 'rgba(239,68,68,0.4)' };
}

function getAxisColor(score: number | null): string {
  if (score === null) return 'var(--color-neutral-dark)';
  if (score >= 70) return 'var(--color-fresh)';
  if (score >= 45) return 'var(--color-contested)';
  return 'var(--color-stale)';
}

export default function RiskRadarChart({ data, size = 320 }: RiskRadarChartProps) {
  const [animProgress, setAnimProgress] = useState(0);
  const [prevDataKey, setPrevDataKey] = useState('');
  const [pulsingAxes, setPulsingAxes] = useState<Set<string>>(new Set());
  const animRef = useRef<number | null>(null);
  const prevScoresRef = useRef<Record<string, number | null>>({});

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;
  const labelR = size * 0.46;
  const axisCount = data.axes.length;
  const angleStep = (2 * Math.PI) / axisCount;
  const startAngle = -Math.PI / 2; // Top

  // Build a stable key from current scores to detect changes
  const currentDataKey = useMemo(() =>
    data.axes.map(a => `${a.key}:${a.score}`).join('|'),
    [data.axes]
  );

  // Detect which axes just became available (null -> number)
  useEffect(() => {
    if (currentDataKey !== prevDataKey) {
      const newPulsing = new Set<string>();
      for (const axis of data.axes) {
        const prev = prevScoresRef.current[axis.key];
        if (prev === null && axis.score !== null) {
          newPulsing.add(axis.key);
        }
      }
      if (newPulsing.size > 0) {
        setPulsingAxes(newPulsing);
        setTimeout(() => setPulsingAxes(new Set()), 2000);
      }

      // Store current scores for next comparison
      const scores: Record<string, number | null> = {};
      for (const axis of data.axes) {
        scores[axis.key] = axis.score;
      }
      prevScoresRef.current = scores;
      setPrevDataKey(currentDataKey);

      // Restart animation
      setAnimProgress(0);
      if (animRef.current) cancelAnimationFrame(animRef.current);

      const startTime = performance.now();
      const duration = 800; // ms
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setAnimProgress(eased);
        if (t < 1) {
          animRef.current = requestAnimationFrame(animate);
        }
      };
      animRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [currentDataKey, prevDataKey, data.axes]);

  // Compute polygon points
  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * maxR * animProgress;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPoints = data.axes.map((axis, i) => {
    const score = axis.score ?? 0;
    return getPoint(i, score);
  });

  const polygonPath = polygonPoints.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  ).join(' ') + ' Z';

  // Grid lines (25%, 50%, 75%, 100%)
  const gridLevels = [25, 50, 75, 100];

  const overallColor = getOverallColor(data.overallScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id="radar-glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="radar-bg-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* Background circle */}
        <circle cx={cx} cy={cy} r={maxR + 4} fill="url(#radar-bg-gradient)" />

        {/* Grid hexagons */}
        {gridLevels.map(level => {
          const r = (level / 100) * maxR;
          const points = Array.from({ length: axisCount }, (_, i) => {
            const angle = startAngle + i * angleStep;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
          }).join(' ');
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={level === 100 ? 1.5 : 0.8}
              strokeDasharray={level === 50 ? '4 3' : undefined}
            />
          );
        })}

        {/* Axis lines */}
        {data.axes.map((axis, i) => {
          const angle = startAngle + i * angleStep;
          const x2 = cx + maxR * Math.cos(angle);
          const y2 = cy + maxR * Math.sin(angle);
          const isUnavailable = axis.score === null;
          return (
            <line
              key={axis.key}
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke={isUnavailable ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={1}
              strokeDasharray={isUnavailable ? '3 4' : undefined}
            />
          );
        })}

        {/* Data polygon */}
        {data.axes.some(a => a.score !== null) && (
          <path
            d={polygonPath}
            fill={overallColor.fill}
            stroke={overallColor.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            filter="url(#radar-glow)"
            style={{ transition: 'fill 0.4s, stroke 0.4s' }}
          />
        )}

        {/* Data points */}
        {data.axes.map((axis, i) => {
          const isPulsing = pulsingAxes.has(axis.key);
          if (axis.score === null) {
            // Show "?" indicator at 50% radius
            const angle = startAngle + i * angleStep;
            const r50 = 0.5 * maxR;
            const qx = cx + r50 * Math.cos(angle);
            const qy = cy + r50 * Math.sin(angle);
            return (
              <g key={axis.key}>
                <circle cx={qx} cy={qy} r={8} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="3 2" />
                <text x={qx} y={qy + 1} textAnchor="middle" dominantBaseline="middle" fill="#484f58" fontSize="9" fontWeight="700" fontFamily="JetBrains Mono, monospace">?</text>
              </g>
            );
          }

          const pt = polygonPoints[i];
          const color = getAxisColor(axis.score);
          return (
            <g key={axis.key}>
              {isPulsing && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={12}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.6}
                  style={{ animation: 'radarPulseRing 1s ease-out 2' }}
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isPulsing ? 5 : 4}
                fill={color}
                stroke="#0d1117"
                strokeWidth={2}
                style={{ transition: 'all 0.3s' }}
              />
            </g>
          );
        })}

        {/* Axis labels */}
        {data.axes.map((axis, i) => {
          const angle = startAngle + i * angleStep;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const isUnavailable = axis.score === null;
          const color = isUnavailable ? '#484f58' : getAxisColor(axis.score);

          // Text anchor based on position
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (Math.cos(angle) > 0.3) textAnchor = 'start';
          else if (Math.cos(angle) < -0.3) textAnchor = 'end';

          return (
            <g key={`label-${axis.key}`}>
              <text
                x={lx}
                y={ly - 6}
                textAnchor={textAnchor}
                fill={color}
                fontSize="10"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
                style={{ transition: 'fill 0.4s' }}
              >
                {axis.label}
              </text>
              <text
                x={lx}
                y={ly + 7}
                textAnchor={textAnchor}
                fill={isUnavailable ? '#30363d' : color}
                fontSize="11"
                fontWeight="800"
                fontFamily="JetBrains Mono, monospace"
                style={{ transition: 'fill 0.4s' }}
              >
                {isUnavailable ? '—' : `${axis.score}%`}
              </text>
            </g>
          );
        })}

        {/* Center overall score */}
        {data.overallScore !== null && (
          <g>
            <circle cx={cx} cy={cy} r={22} fill="rgba(5,8,16,0.8)" stroke={overallColor.stroke} strokeWidth={1.5} />
            <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle" fill={overallColor.stroke} fontSize="14" fontWeight="900" fontFamily="JetBrains Mono, monospace">
              {data.overallScore}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle" fill="#8b949e" fontSize="6" fontWeight="700" letterSpacing="0.06em" fontFamily="Inter, system-ui, sans-serif" style={{ textTransform: 'uppercase' }}>
              OVERALL
            </text>
          </g>
        )}
      </svg>

      {/* Inline keyframes for pulse ring */}
      <style>{`
        @keyframes radarPulseRing {
          0% { r: 5; opacity: 0.8; }
          100% { r: 18; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
