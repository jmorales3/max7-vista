import { QueryClient, QueryCache } from "@tanstack/react-query";
import { triggerForceLogout } from "./authBridge";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (_error, query) => {
      const statusCode = (query.state.error as { status?: number } | null)?.status;
      if (statusCode === 401) {
        triggerForceLogout();
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
