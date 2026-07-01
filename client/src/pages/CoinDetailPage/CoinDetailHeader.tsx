import type { CoinDto } from "../../api/types";
import { changeDirection, formatCurrency, formatPercent } from "../../utils/format";
import styles from "./CoinDetailHeader.module.css";

interface CoinDetailHeaderProps {
  coin: CoinDto;
}

export default function CoinDetailHeader({ coin }: CoinDetailHeaderProps) {
  return (
    <>
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
    </>
  );
}
