import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCoinHistory } from "../../api/client";
import Sparkline from "../../components/Sparkline";
import { toErrorMessage } from "../../utils/errors";
import { HttpError } from "../../utils/http";
import CoinDetailHeader from "./CoinDetailHeader";
import HistoryStats from "./HistoryStats";
import RefreshButton from "./RefreshButton";
import styles from "./index.module.css";

const BackButton = () => (
  <Link to="/" className={styles.back}>
    ← Back
  </Link>
);

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
        <BackButton />
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
        <BackButton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.state}>
        <p>No history yet.</p>
        <BackButton />
      </div>
    );
  }

  const { coin, points } = data;

  return (
    <div className={styles.page}>
      <BackButton />

      <div className={styles.header}>
        <CoinDetailHeader coin={coin} />
        <RefreshButton onClick={handleRefresh} isFetching={isFetching} />
      </div>

      <div className={styles.card}>
        {points.length === 0 ? (
          <p className={styles.state}>No history yet.</p>
        ) : (
          <>
            <Sparkline
              points={points.map((p) => ({ value: Number(p.price), time: p.recordedAt }))}
            />
            <HistoryStats points={points} />
          </>
        )}
      </div>
    </div>
  );
}
