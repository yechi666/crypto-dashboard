import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCoinHistory } from "../../api/client";
import type { CoinDto, CoinHistoryResponse } from "../../api/types";
import Sparkline from "../../components/Sparkline";
import { toErrorMessage } from "../../utils/errors";
import { mergeLivePoint } from "../../utils/history";
import { HttpError } from "../../utils/http";
import CoinDetailHeader from "./CoinDetailHeader";
import HistoryStats from "./HistoryStats";
import styles from "./index.module.css";

const BackButton = () => (
  <Link to="/" className={styles.back}>
    ← Back
  </Link>
);

interface CoinDetailPageProps {
  coins: CoinDto[];
  lastSuccessfulFetchAt: string | null;
}

export default function CoinDetailPage({ coins, lastSuccessfulFetchAt }: CoinDetailPageProps) {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["coinHistory", id],
    queryFn: ({ signal }) => fetchCoinHistory(id!, undefined, signal),
    enabled: Boolean(id),
  });

  const handleRefresh = () => {
    void query.refetch();
  };

  useEffect(() => {
    if (!id || !lastSuccessfulFetchAt) return;

    // The live snapshot only contains the top COIN_COUNT coins shown on the
    // dashboard; a coin outside that slice simply won't be found here, and
    // the detail page keeps showing its last-fetched history unchanged.
    const liveCoin = coins.find((c) => c.id === id);
    if (!liveCoin) return;

    queryClient.setQueryData<CoinHistoryResponse>(["coinHistory", id], (prev) =>
      prev ? mergeLivePoint(prev, liveCoin, lastSuccessfulFetchAt) : prev,
    );
  }, [lastSuccessfulFetchAt, coins, id, queryClient]);

  const { data, error, isPending } = query;
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
