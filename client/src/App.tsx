import CoinTable from "./components/CoinTable";
import FreshnessBadge from "./components/FreshnessBadge";
import { useCoinsStream } from "./hooks/useCoinsStream";
import styles from "./App.module.css";

export default function App() {
  const { coins, isLoading, error, status, connection, lastSuccessfulFetchAt } = useCoinsStream();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Crypto Dashboard</h1>
        <FreshnessBadge
          status={status}
          connection={connection}
          lastSuccessfulFetchAt={lastSuccessfulFetchAt}
        />
      </header>
      <main className={styles.main}>
        {coins.length > 0 ? (
          <CoinTable coins={coins} />
        ) : isLoading ? (
          <p className={styles.state}>Loading market data…</p>
        ) : error ? (
          <p className={styles.stateError}>Couldn’t load data: {error}</p>
        ) : (
          <p className={styles.state}>No coins to display.</p>
        )}
      </main>
    </div>
  );
}
