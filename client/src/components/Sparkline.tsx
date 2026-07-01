import { useState } from "react";
import type { MouseEvent } from "react";

import { formatClockTime, formatCurrency } from "../utils/format";
import { buildSparklinePath } from "../utils/history";
import styles from "./Sparkline.module.css";

interface SparklinePoint {
  value: number;
  time: string;
}

interface SparklineProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function Sparkline({
  points,
  width = 600,
  height = 120,
  className,
}: SparklineProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div
        className={`${styles.placeholder} ${className ?? ""}`}
        role="img"
        aria-label="Not enough data to draw a chart"
      >
        Not enough data yet
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const path = buildSparklinePath(values, width, height);
  const first = values[0];
  const last = values[values.length - 1];
  const strokeClassName = last >= first ? styles.strokeUp : styles.strokeDown;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  const handleMouseMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = clamp(Math.round(ratio * (values.length - 1)), 0, values.length - 1);
    setHoverIndex(index);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? (hoverIndex / (values.length - 1)) * width : null;
  const hoverY =
    hoverIndex !== null
      ? range === 0
        ? height / 2
        : height - ((values[hoverIndex] - min) / range) * height
      : null;

  const tooltipLeftPct = hoverIndex !== null ? (hoverIndex / (values.length - 1)) * 100 : 0;
  // Clamp the horizontal transform so tooltips near the edges don't overflow the chart.
  const tooltipTranslateX = tooltipLeftPct < 10 ? "0%" : tooltipLeftPct > 90 ? "-100%" : "-50%";

  return (
    <div className={styles.container}>
      <svg
        className={`${styles.sparkline} ${className ?? ""}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Price sparkline from ${first} to ${last}`}
      >
        <polyline className={strokeClassName} points={path} fill="none" strokeWidth={2} />
        {hoverX !== null && hoverY !== null ? (
          <>
            <line
              className={styles.guide}
              x1={hoverX}
              y1={0}
              x2={hoverX}
              y2={height}
              strokeWidth={1}
            />
            <circle className={styles.dot} cx={hoverX} cy={hoverY} r={4} />
          </>
        ) : null}
        <rect
          className={styles.overlay}
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </svg>
      {hovered ? (
        <div
          className={styles.tooltip}
          style={{
            left: `${tooltipLeftPct}%`,
            transform: `translate(${tooltipTranslateX}, 0)`,
          }}
        >
          <div className={styles.tooltipTime}>{formatClockTime(hovered.time)}</div>
          <div className={styles.tooltipPrice}>{formatCurrency(hovered.value)}</div>
        </div>
      ) : null}
    </div>
  );
}
