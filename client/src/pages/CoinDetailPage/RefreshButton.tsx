import styles from "./RefreshButton.module.css";

interface RefreshButtonProps {
  onClick: () => void;
  isFetching: boolean;
}

export default function RefreshButton({ onClick, isFetching }: RefreshButtonProps) {
  return (
    <button type="button" className={styles.button} onClick={onClick} disabled={isFetching}>
      {isFetching ? "Refreshing…" : "Refresh"}
    </button>
  );
}
