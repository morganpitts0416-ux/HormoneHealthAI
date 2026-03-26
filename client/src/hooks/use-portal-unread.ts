import { useQuery } from "@tanstack/react-query";

export function usePortalUnreadCount() {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/portal/messages/unread"],
    refetchInterval: 30000,
    staleTime: 15000,
  });
  return data?.count ?? 0;
}
