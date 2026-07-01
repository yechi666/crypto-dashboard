import { QueryClient } from "@tanstack/react-query";

import { HttpError } from "../utils/http";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
