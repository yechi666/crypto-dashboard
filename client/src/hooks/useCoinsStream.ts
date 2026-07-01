import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchCoins } from "../api/client";
import { subscribeToCoins } from "../api/coinsStream";
import type { ConnectionState } from "../api/coinsStream";
import type { CoinDto, FreshnessStatus } from "../api/types";
import { toErrorMessage } from "../utils/errors";

const POLL_MS = 15000;

export interface CoinsStreamState {
  coins: CoinDto[];
  status: FreshnessStatus;
  lastSuccessfulFetchAt: string | null;
  isLoading: boolean;
  error: string | null;
  connection: ConnectionState;
}

export function useCoinsStream(): CoinsStreamState {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  const query = useQuery({
    queryKey: ["coins"],
    queryFn: ({ signal }) => fetchCoins(signal),
    // SSE is the primary transport; this is only a fallback while it's down.
    refetchInterval: connection === "polling" ? POLL_MS : false,
  });

  useEffect(() => {
    return subscribeToCoins({
      onSnapshot: (data) => queryClient.setQueryData(["coins"], data),
      onConnectionChange: setConnection,
    });
  }, [queryClient]);

  const data = query.data;

  return {
    coins: data?.coins ?? [],
    status: data?.status ?? "error",
    lastSuccessfulFetchAt: data?.lastSuccessfulFetchAt ?? null,
    isLoading: query.isPending,
    error: query.error ? toErrorMessage(query.error) : null,
    connection,
  };
}
