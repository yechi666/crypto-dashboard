import { useEffect, useState } from "react";

import { subscribeToCoins } from "../api/coinsStream";
import type { CoinDto, FreshnessStatus } from "../api/types";

export interface CoinsStreamState {
  coins: CoinDto[];
  status: FreshnessStatus;
  lastSuccessfulFetchAt: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useCoinsStream(): CoinsStreamState {
  const [state, setState] = useState<CoinsStreamState>({
    coins: [],
    status: "error",
    lastSuccessfulFetchAt: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    return subscribeToCoins({
      onSnapshot: (data) =>
        setState({
          coins: data.coins,
          status: data.status,
          lastSuccessfulFetchAt: data.lastSuccessfulFetchAt,
          isLoading: false,
          error: null,
        }),
      onError: (message) => setState((prev) => ({ ...prev, isLoading: false, error: message })),
    });
  }, []);

  return state;
}
