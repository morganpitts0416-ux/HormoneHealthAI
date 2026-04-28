import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Settings,
  ShieldCheck,
  CreditCard,
  HelpCircle,
  CalendarDays,
  Menu,
  LayoutDashboard,
  Inbox,
  FileText,
  ChevronDown,
  User as UserIcon,
} from "lucide-react";

export function AppHeader() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: notif } = useQuery<{ unreadMessages: Array<{ count: number }> }>({
    queryKey: ["/api/clinician/notifications"],
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const { data: inboxCounts } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/clinician/inbox-notifications/unread-count"],
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unreadMessagesTotal = (notif?.unreadMessages ?? []).reduce(
    (sum, r) => sum + (Number(r.count) || 0),
    0,
  );
  const unreadTotal = unreadMessagesTotal + (inboxCounts?.unreadCount ?? 0);

  if (!user) return null;

  const isStaff = (user as any)?.isStaff;

  return (
    <header
      className="sticky top-0 z-50 border-b flex-shrink-0"
      style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}
      data-testid="app-header"
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 min-w-0">
          <img
            src="/realign-health-logo.png"
            alt="ReAlign Health"
            className="h-12 sm:h-14 w-auto flex-shrink-0 cursor-pointer"
            style={{ mixBlendMode: "multiply" }}
            onClick={() => setLocation("/dashboard")}
            data-testid="logo-home"
          />
          <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: "#c4b9a5" }} />
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-medium leading-tight truncate" style={{ color: "#1c2414" }}>{user?.clinicName}</p>
            <p className="text-xs leading-tight truncate" style={{ color: "#7a8a64" }}>
              {isStaff
                ? `${(user as any)?.staffFirstName ?? ""} ${(user as any)?.staffLastName ?? ""}`
                : `${user?.title ?? ""} ${user?.firstName ?? ""} ${user?.lastName ?? ""}`
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-0.5">
            {(user as any)?.role === "admin" && (
              <NavButton
                icon={ShieldCheck}
                label="Admin"
                onClick={() => setLocation("/admin")}
                active={location === "/admin"}
                testId="nav-admin"
              />
            )}
            <NavButton
              icon={LayoutDashboard}
              label="Dashboard"
              onClick={() => setLocation("/dashboard")}
              active={location === "/dashboard"}
              testId="nav-dashboard"
            />
            <NavButton
              icon={CalendarDays}
              label="Schedule"
              onClick={() => setLocation("/scheduling")}
              active={location === "/scheduling" || location === "/appointments"}
              testId="nav-scheduling"
            />
            <div className="relative">
              <NavButton
                icon={Inbox}
                label="Inbox"
                onClick={() => setLocation("/inbox")}
                active={location === "/inbox"}
                testId="nav-inbox"
              />
              {unreadTotal > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white inline-flex items-center justify-center pointer-events-none"
                  style={{ backgroundColor: "#c0392b" }}
                  data-testid="badge-inbox-unread"
                >
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={
                    ["/account", "/billing", "/help", "/note-templates"].includes(location)
                      ? "font-semibold"
                      : ""
                  }
                  style={{ color: "#2e3a20" }}
                  data-testid="nav-settings-menu"
                >
                  <Settings className="w-4 h-4 mr-1.5" />
                  <span className="hidden md:inline">Settings</span>
                  <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setLocation("/account")}
                  data-testid="menuitem-account"
                >
                  <UserIcon className="w-4 h-4 mr-2" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/account?section=notes")}
                  data-testid="menuitem-note-templates"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Note Templates
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/billing")}
                  data-testid="menuitem-billing"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/help")}
                  data-testid="menuitem-help"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Help
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutateAsync()}
                  disabled={logoutMutation.isPending}
                  data-testid="menuitem-logout"
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="sm:hidden" style={{ color: "#2e3a20" }} data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0">
              <div className="flex flex-col h-full" style={{ backgroundColor: "#f5f2ed" }}>
                <div className="px-4 py-4 border-b" style={{ borderColor: "#d4c9b5", backgroundColor: "#e8ddd0" }}>
                  <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>{user?.clinicName}</p>
                  <p className="text-xs" style={{ color: "#7a8a64" }}>
                    {isStaff
                      ? `${(user as any)?.staffFirstName ?? ""} ${(user as any)?.staffLastName ?? ""}`
                      : `${user?.title ?? ""} ${user?.firstName ?? ""} ${user?.lastName ?? ""}`
                    }
                  </p>
                </div>
                <nav className="flex flex-col gap-1 p-3 flex-1">
                  <MobileNavButton icon={LayoutDashboard} label="Dashboard" onClick={() => setLocation("/dashboard")} active={location === "/dashboard"} />
                  {(user as any)?.role === "admin" && (
                    <MobileNavButton icon={ShieldCheck} label="Admin" onClick={() => setLocation("/admin")} active={location === "/admin"} />
                  )}
                  <MobileNavButton icon={CalendarDays} label="Schedule" onClick={() => setLocation("/scheduling")} active={location === "/scheduling" || location === "/appointments"} />
                  <MobileNavButton icon={Inbox} label={unreadTotal > 0 ? `Inbox (${unreadTotal > 99 ? "99+" : unreadTotal})` : "Inbox"} onClick={() => setLocation("/inbox")} active={location === "/inbox"} />
                  <div className="pt-2 mt-1 border-t" style={{ borderColor: "#d4c9b5" }}>
                    <p className="text-[10px] uppercase tracking-wider px-2 pb-1" style={{ color: "#7a8a64" }}>Settings</p>
                  </div>
                  <MobileNavButton icon={UserIcon} label="Account" onClick={() => setLocation("/account")} active={location === "/account"} />
                  <MobileNavButton icon={FileText} label="Note Templates" onClick={() => setLocation("/account?section=notes")} active={false} />
                  <MobileNavButton icon={CreditCard} label="Billing" onClick={() => setLocation("/billing")} active={location === "/billing"} />
                  <MobileNavButton icon={HelpCircle} label="Help" onClick={() => setLocation("/help")} active={location === "/help"} />
                </nav>
                <div className="p-3 border-t" style={{ borderColor: "#d4c9b5" }}>
                  <Button variant="ghost" className="justify-start gap-3 w-full text-destructive" onClick={() => logoutMutation.mutateAsync()} disabled={logoutMutation.isPending}>
                    <LogOut className="w-4 h-4" /> Sign Out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function NavButton({ icon: Icon, label, onClick, active, disabled, testId }: {
  icon: any;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={active ? "font-semibold" : ""}
      style={{ color: "#2e3a20" }}
      title={label}
      data-testid={testId}
    >
      <Icon className="w-4 h-4 mr-1.5" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}

function MobileNavButton({ icon: Icon, label, onClick, active }: {
  icon: any;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      className={`justify-start gap-3 w-full ${active ? "font-semibold" : ""}`}
      style={{ color: "#2e3a20", backgroundColor: active ? "rgba(90,112,64,0.1)" : undefined }}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" /> {label}
    </Button>
  );
}
