import { useEffect, useState } from "react";

import type { ConnectionState } from "../api/coinsStream";
import type { FreshnessStatus } from "../api/types";
import { STALE_AFTER_MS } from "../config";
import { effectiveFreshness, formatRelativeTime } from "../utils/format";
import styles from "./FreshnessBadge.module.css";

interface FreshnessBadgeProps {
  status: FreshnessStatus;
  connection: ConnectionState;
  lastSuccessfulFetchAt: string | null;
}

export default function FreshnessBadge({
  status,
  connection,
  lastSuccessfulFetchAt,
}: FreshnessBadgeProps) {
  // Own a 1-second tick so the relative time refreshes without re-rendering the table.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const relative = formatRelativeTime(lastSuccessfulFetchAt);

  const ageMs = lastSuccessfulFetchAt
    ? Date.now() - new Date(lastSuccessfulFetchAt).getTime()
    : Number.POSITIVE_INFINITY;
  const effective = effectiveFreshness(status, ageMs, STALE_AFTER_MS);

  const isInitialConnecting = lastSuccessfulFetchAt === null && connection === "connecting";

  const dotClassName = isInitialConnecting
    ? styles.dotNeutral
    : effective === "live"
      ? styles.dotLive
      : effective === "stale"
        ? styles.dotStale
        : styles.dotError;

  const pulse = connection === "polling" || connection === "connecting";

  let label: string;
  if (isInitialConnecting) {
    label = "Connecting…";
  } else {
    const word = effective === "live" ? "Live" : effective === "stale" ? "Stale" : "Offline";
    label = lastSuccessfulFetchAt ? `${word} · updated ${relative}` : word;
    if (connection === "polling") {
      label += " · reconnecting";
    }
  }

  return (
    <div className={styles.badge} role="status" aria-label={`Data freshness: ${label}`}>
      <span className={`${styles.dot} ${dotClassName} ${pulse ? styles.pulse : ""}`} />
      <span className={styles.text}>{label}</span>
    </div>
  );
}
