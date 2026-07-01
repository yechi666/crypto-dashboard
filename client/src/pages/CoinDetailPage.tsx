import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCoinHistory } from "../api/client";
import Sparkline from "../components/Sparkline";
import { toErrorMessage } from "../utils/errors";
import { changeDirection, formatCurrency, formatPercent } from "../utils/format";
import { historyStats } from "../utils/history";
import { HttpError } from "../utils/http";
import styles from "./CoinDetailPage.module.css";

export default function CoinDetailPage() {
  const { id } = useParams();

  const query = useQuery({
    queryKey: ["coinHistory", id],
    queryFn: ({ signal }) => fetchCoinHistory(id!, undefined, signal),
    enabled: Boolean(id),
  });

  const handleRefresh = () => {
    void query.refetch();
  };

  const { data, error, isPending, isFetching } = query;
  const notFound = error instanceof HttpError && error.status === 404;
  const otherError = error && !notFound ? toErrorMessage(error) : null;

  if (isPending) {
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

  if (otherError) {
    return (
      <div className={styles.state}>
        <p className={styles.stateError}>Couldn’t load history: {otherError}</p>
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
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
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
                <span className={styles.statLabel}>1h Change</span>
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
