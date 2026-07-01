import type { CoinDto } from "../api/types";
import { changeDirection, formatCompactCurrency, formatCurrency, formatPercent } from "../utils/format";
import styles from "./CoinRow.module.css";

interface CoinRowProps {
  coin: CoinDto;
}

export default function CoinRow({ coin }: CoinRowProps) {
  return (
    <tr className={styles.row}>
      <td className={styles.rank}>{coin.marketCapRank ?? "—"}</td>
      <td className={styles.nameCell}>
        <span className={styles.ticker}>{coin.symbol}</span>
        <span className={styles.name}>{coin.name}</span>
      </td>
      <td className={styles.numeric}>{formatCurrency(coin.currentPrice)}</td>
      <td className={`${styles.numeric} ${styles[changeDirection(coin.priceChangePercentage24h)]}`}>
        {formatPercent(coin.priceChangePercentage24h)}
      </td>
      <td className={styles.numeric}>{formatCompactCurrency(coin.marketCap)}</td>
      <td className={styles.numeric}>{formatCompactCurrency(coin.volume24h)}</td>
    </tr>
  );
}
