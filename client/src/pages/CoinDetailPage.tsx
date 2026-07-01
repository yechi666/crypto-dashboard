import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCoinHistory } from "../api/client";
import type { CoinHistoryResponse } from "../api/types";
import Sparkline from "../components/Sparkline";
import { changeDirection, formatCurrency, formatPercent } from "../utils/format";
import { historyStats } from "../utils/history";
import { HttpError } from "../utils/http";
import styles from "./CoinDetailPage.module.css";

interface CoinDetailState {
  data: CoinHistoryResponse | null;
  isLoading: boolean;
  error: string | null;
  notFound: boolean;
}

export default function CoinDetailPage() {
  const { id } = useParams();

  const [state, setState] = useState<CoinDetailState>({
    data: null,
    isLoading: true,
    error: null,
    notFound: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!id) return;
      try {
        const data = await fetchCoinHistory(id, undefined, signal);
        if (signal.aborted) return;
        setState({ data, isLoading: false, error: null, notFound: false });
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof HttpError && err.status === 404) {
          setState((prev) => ({ ...prev, isLoading: false, notFound: true, error: null }));
        } else {
          const message = err instanceof Error ? err.message : "Unknown error";
          setState((prev) => ({ ...prev, isLoading: false, error: message }));
        }
      } finally {
        if (!signal.aborted) setIsRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, isLoading: true, error: null, notFound: false });
    void load(controller.signal);
    return () => controller.abort();
  }, [id, load]);

  const handleRefresh = () => {
    const controller = new AbortController();
    setIsRefreshing(true);
    void load(controller.signal);
  };

  const { data, isLoading, error, notFound } = state;

  if (isLoading) {
    return <p className={styles.state}>Loading history…</p>;
  }

  if (notFound) {
    return (
      <div className={styles.state}>
        <p>Coin not found.</p>
        <Link to="/">← Back</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.state}>
        <p className={styles.stateError}>Couldn’t load history: {error}</p>
        <button type="button" className={styles.button} onClick={handleRefresh}>
          Retry
        </button>
        <Link to="/">← Back</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.state}>
        <p>No history yet.</p>
        <Link to="/">← Back</Link>
      </div>
    );
  }

  const { coin, points } = data;
  const stats = historyStats(points);
  const values = points.map((p) => Number(p.price));

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← Back
      </Link>

      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.name}>{coin.name}</h2>
          <span className={styles.symbol}>{coin.symbol}</span>
        </div>
        <div className={styles.priceGroup}>
          <span className={styles.price}>{formatCurrency(coin.currentPrice)}</span>
          <span
            className={`${styles.change} ${styles[changeDirection(coin.priceChangePercentage24h)]}`}
          >
            {formatPercent(coin.priceChangePercentage24h)}
          </span>
        </div>
        <button
          type="button"
          className={styles.button}
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className={styles.card}>
        {points.length === 0 ? (
          <p className={styles.state}>No history yet.</p>
        ) : (
          <>
            <Sparkline values={values} />
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Latest</span>
                <span className={styles.statValue}>
                  {stats.latest === null ? "—" : formatCurrency(stats.latest)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>1h High</span>
                <span className={styles.statValue}>
                  {stats.high === null ? "—" : formatCurrency(stats.high)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>1h Low</span>
                <span className={styles.statValue}>
                  {stats.low === null ? "—" : formatCurrency(stats.low)}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Change</span>
                <span className={`${styles.statValue} ${styles[changeDirection(stats.changePct)]}`}>
                  {formatPercent(stats.changePct)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
