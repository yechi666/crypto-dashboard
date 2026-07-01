import type { HistoryPointDto } from "../../api/types";
import { changeDirection, formatCurrency, formatPercent } from "../../utils/format";
import { historyStats } from "../../utils/history";
import styles from "./HistoryStats.module.css";

interface HistoryStatsProps {
  points: HistoryPointDto[];
}

export default function HistoryStats({ points }: HistoryStatsProps) {
  const stats = historyStats(points);

  return (
    <div className={styles.stats}>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Latest</span>
        <span className={styles.statValue}>{formatCurrency(stats.latest)}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>1h High</span>
        <span className={styles.statValue}>{formatCurrency(stats.high)}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>1h Low</span>
        <span className={styles.statValue}>{formatCurrency(stats.low)}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>1h Change</span>
        <span className={`${styles.statValue} ${styles[changeDirection(stats.changePct)]}`}>
          {formatPercent(stats.changePct)}
        </span>
      </div>
    </div>
  );
}
