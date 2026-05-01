import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Home,
  Activity,
  Package,
  MessageSquare,
  LogOut,
  UserCircle,
} from "lucide-react";

interface PortalShellProps {
  children: ReactNode;
  activeTab: "home" | "healthiq" | "protocol" | "messages";
  /** Optional sub-page title shown in the header below the logo. */
  headerSubtitle?: string;
}

interface PortalMe {
  patientId: number;
  firstName?: string;
  lastName?: string;
  clinicName?: string;
  email?: string;
}

export function PortalShell({ children, activeTab, headerSubtitle }: PortalShellProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const unreadCount = usePortalUnreadCount();

  const { data: me } = useQuery<PortalMe>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/portal/logout", {});
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/portal/login");
    },
  });

  const initials = me ? `${(me.firstName?.[0] ?? "").toUpperCase()}${(me.lastName?.[0] ?? "").toUpperCase()}` || "P" : "P";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/portal/dashboard">
            <img
              src="/cliniq-logo.png"
              alt="ClinIQ"
              className="h-12 sm:h-11 w-auto flex-shrink-0 cursor-pointer"
              style={{ mixBlendMode: "multiply" }}
              data-testid="link-portal-logo"
            />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full hover-elevate active-elevate-2 px-1.5 py-1"
                data-testid="button-portal-avatar"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback style={{ backgroundColor: "#edf4e4", color: "#2e3a20", fontWeight: 600, fontSize: "0.85rem" }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                    {me?.firstName} {me?.lastName}
                  </span>
                  {me?.email && (
                    <span className="text-xs font-normal truncate" style={{ color: "#7a8a64" }}>
                      {me.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/portal/account">
                  <span className="flex items-center gap-2 w-full" data-testid="menu-portal-account">
                    <UserCircle className="w-4 h-4" />
                    Account
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="menu-portal-signout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {headerSubtitle && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-3">
            <p className="text-base font-semibold" style={{ color: "#1c2414" }}>{headerSubtitle}</p>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 pb-28">
        {children}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t z-40"
        style={{ backgroundColor: "#1c2414", borderColor: "#0e1208" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-around">
          <NavTab href="/portal/dashboard" label="Home" Icon={Home} active={activeTab === "home"} testId="nav-portal-home" />
          <NavTab href="/portal/healthiq" label="HealthIQ" Icon={Activity} active={activeTab === "healthiq"} testId="nav-portal-healthiq" />
          <NavTab href="/portal/supplements" label="Protocol" Icon={Package} active={activeTab === "protocol"} testId="nav-portal-supplements" />
          <NavTab
            href="/portal/messages"
            label="Messages"
            Icon={MessageSquare}
            active={activeTab === "messages"}
            badge={unreadCount}
            testId="nav-portal-messages"
          />
        </div>
      </nav>
    </div>
  );
}

interface NavTabProps {
  href: string;
  label: string;
  Icon: typeof Home;
  active: boolean;
  badge?: number;
  testId: string;
}

function NavTab({ href, label, Icon, active, badge, testId }: NavTabProps) {
  const color = active ? "#ffffff" : "#a0a880";
  return (
    <Link href={href} className="flex-1">
      <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid={testId}>
        <span className="relative">
          <Icon className="w-4 h-4" style={{ color }} />
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none text-white"
              style={{ backgroundColor: "#c0392b" }}
              data-testid={`${testId}-badge`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color }}>{label}</span>
      </button>
    </Link>
  );
}
