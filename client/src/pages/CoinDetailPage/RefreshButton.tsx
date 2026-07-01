import styles from "./RefreshButton.module.css";

interface RefreshButtonProps {
  onClick: () => void;
  isFetching: boolean;
}

export default function RefreshButton({ onClick, isFetching }: RefreshButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={isFetching}
      aria-busy={isFetching}
    >
      <svg
        className={`${styles.icon} ${isFetching ? styles.spinning : ""}`}
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
      Refresh
    </button>
  );
}
