"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KeyRound,
  Cpu,
  Server,
  Activity,
  Settings,
  BookOpen,
  Sun,
  Moon,
  Menu,
  X,
  ShieldCheck,
  Terminal,
  Lock,
  Smartphone,
} from "lucide-react";
import { cn, getGatewayV1Url } from "@/lib/utils";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Label,
} from "@/components/ui/primitives";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "API Keys",
    href: "/dashboard/keys",
    icon: KeyRound,
  },
  {
    label: "Models",
    href: "/dashboard/models",
    icon: Cpu,
  },
  {
    label: "Providers",
    href: "/dashboard/providers",
    icon: Server,
  },
  {
    label: "Usage",
    href: "/dashboard/usage",
    icon: Activity,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Documentation",
    href: "/dashboard/docs",
    icon: BookOpen,
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Google Authenticator 2FA Session Lock State
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(true);
  const [checkingTwoFa, setCheckingTwoFa] = useState(true);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const checkTwoFaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/2fa");
      if (res.ok) {
        const data = await res.json();
        setTwoFaEnabled(Boolean(data.enabled));
        setSessionVerified(
          data.enabled ? Boolean(data.verified_session) : true
        );
      }
    } catch {
      // Allow fallback if offline
    } finally {
      setCheckingTwoFa(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("gateway_theme");
    const isDark = saved ? saved === "dark" : true;
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);

    checkTwoFaStatus();
    const handler = () => checkTwoFaStatus();
    window.addEventListener("gateway-2fa-updated", handler);
    return () => window.removeEventListener("gateway-2fa-updated", handler);
  }, [checkTwoFaStatus]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("gateway_theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const handleUnlockWithTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    try {
      setVerifyingOtp(true);
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          code: otpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Invalid 6-digit Google Authenticator code");
        return;
      }
      setSessionVerified(true);
      setOtpCode("");
    } catch {
      setOtpError("Failed to verify code. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleLockDashboard = async () => {
    await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    setSessionVerified(false);
    setOtpCode("");
  };

  const activeNav =
    NAV_ITEMS.find((item) =>
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(item.href)
    ) || NAV_ITEMS[0];

  const gatewayV1Url = getGatewayV1Url();

  // If 2FA is enabled and session is not verified, render Google Authenticator Lock Screen
  if (!checkingTwoFa && twoFaEnabled && !sessionVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
        <Card className="w-full max-w-md border-primary/30 shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">
              Google Authenticator Required
            </CardTitle>
            <CardDescription>
              Two-factor authentication is enabled for this AI Gateway. Enter
              the 6-digit code from your Google Authenticator app to unlock the
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlockWithTotp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lock-otp-input">6-Digit Authenticator Code</Label>
                <Input
                  id="lock-otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="font-mono text-xl tracking-[0.5em] text-center h-11"
                  autoFocus
                  required
                />
                {otpError && (
                  <p className="text-xs text-red-500 font-medium">{otpError}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyingOtp || otpCode.length !== 6}
              >
                <ShieldCheck className="h-4 w-4" />
                {verifyingOtp ? "Verifying..." : "Unlock Admin Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Terminal className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">AI Gateway</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border">
              v1
            </span>
          </Link>
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Gateway Base URL Footer */}
        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>OpenAI-Compatible Gateway</span>
          </div>
          <div className="rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground truncate">
            {gatewayV1Url}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 backdrop-blur-md px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground hidden sm:inline">
                AI Gateway
              </span>
              <span className="text-muted-foreground hidden sm:inline">/</span>
              <span className="font-medium">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {twoFaEnabled && (
              <>
                <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>2FA Active</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLockDashboard}
                  title="Lock Dashboard (Require 2FA Code)"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Lock</span>
                </Button>
              </>
            )}

            <div className="hidden sm:flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Gateway Online</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
