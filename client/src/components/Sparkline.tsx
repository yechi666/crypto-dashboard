import { buildSparklinePath } from "../utils/history";
import styles from "./Sparkline.module.css";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export default function Sparkline({
  values,
  width = 600,
  height = 120,
  className,
}: SparklineProps) {
  if (values.length < 2) {
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

  const points = buildSparklinePath(values, width, height);
  const first = values[0];
  const last = values[values.length - 1];
  const strokeClassName = last >= first ? styles.strokeUp : styles.strokeDown;

  return (
    <svg
      className={`${styles.sparkline} ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price sparkline from ${first} to ${last}`}
    >
      <polyline className={strokeClassName} points={points} fill="none" strokeWidth={2} />
    </svg>
  );
}
