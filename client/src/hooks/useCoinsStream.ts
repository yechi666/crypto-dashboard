import { useEffect, useState } from "react";

import { subscribeToCoins } from "../api/coinsStream";
import type { ConnectionState } from "../api/coinsStream";
import type { CoinDto, FreshnessStatus } from "../api/types";

export interface CoinsStreamState {
  coins: CoinDto[];
  status: FreshnessStatus;
  lastSuccessfulFetchAt: string | null;
  isLoading: boolean;
  error: string | null;
  connection: ConnectionState;
}

export function useCoinsStream(): CoinsStreamState {
  const [state, setState] = useState<CoinsStreamState>({
    coins: [],
    status: "error",
    lastSuccessfulFetchAt: null,
    isLoading: true,
    error: null,
    connection: "connecting",
  });

  useEffect(() => {
    return subscribeToCoins({
      onSnapshot: (data) =>
        setState((prev) => ({
          ...prev,
          coins: data.coins,
          status: data.status,
          lastSuccessfulFetchAt: data.lastSuccessfulFetchAt,
          isLoading: false,
          error: null,
        })),
      onError: (message) => setState((prev) => ({ ...prev, isLoading: false, error: message })),
      onConnectionChange: (connection) => setState((prev) => ({ ...prev, connection })),
    });
  }, []);

  return state;
}
