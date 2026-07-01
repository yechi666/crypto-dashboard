import { Link, Route, Routes } from "react-router-dom";

import FreshnessBadge from "./components/FreshnessBadge";
import { useCoinsStream } from "./hooks/useCoinsStream";
import CoinDetailPage from "./pages/CoinDetailPage";
import DashboardPage from "./pages/DashboardPage";
import styles from "./App.module.css";

export default function App() {
  const { coins, isLoading, error, status, connection, lastSuccessfulFetchAt } = useCoinsStream();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link to="/" className={styles.title}>
          Crypto Dashboard
        </Link>
        <FreshnessBadge
          status={status}
          connection={connection}
          lastSuccessfulFetchAt={lastSuccessfulFetchAt}
        />
      </header>
      <main className={styles.main}>
        <Routes>
          <Route
            path="/"
            element={<DashboardPage coins={coins} isLoading={isLoading} error={error} />}
          />
          <Route path="/coins/:id" element={<CoinDetailPage />} />
          <Route
            path="*"
            element={
              <p className={styles.state}>
                Page not found. <Link to="/">Go home</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
