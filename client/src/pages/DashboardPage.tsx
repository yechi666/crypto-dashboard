import CoinTable from "../components/CoinTable";
import type { CoinDto } from "../api/types";
import styles from "./DashboardPage.module.css";

interface DashboardPageProps {
  coins: CoinDto[];
  isLoading: boolean;
  error: string | null;
}

export default function DashboardPage({ coins, isLoading, error }: DashboardPageProps) {
  if (error) {
    return <p className={styles.stateError}>Couldn’t load data: {error}</p>;
  }

  if (isLoading) {
    return <p className={styles.state}>Loading market data…</p>;
  }

  if (coins.length > 0) {
    return <CoinTable coins={coins} />;
  }

  return <p className={styles.state}>No coins to display.</p>;
}
