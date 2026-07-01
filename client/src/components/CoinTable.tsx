import type { CoinDto } from "../api/types";
import CoinRow from "./CoinRow";
import styles from "./CoinTable.module.css";

interface CoinTableProps {
  coins: CoinDto[];
}

export default function CoinTable({ coins }: CoinTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">Price</th>
            <th scope="col">24h %</th>
            <th scope="col">Market Cap</th>
            <th scope="col">Volume</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => (
            <CoinRow key={coin.id} coin={coin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
