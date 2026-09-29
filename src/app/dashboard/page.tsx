"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  KeyRound,
  Cpu,
  Server,
  RefreshCw,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import type { DashboardSummary } from "@/types";

export default function DashboardOverviewPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [storageEngine, setStorageEngine] = useState<string>("local_file");
  const [loading, setLoading] = useState(true);
  const [providerPing, setProviderPing] = useState<
    Record<string, { connected?: boolean; latency?: number; checking?: boolean }>
  >({});

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/usage?limit=8");
      if (!res.ok) throw new Error("Failed to load dashboard overview");
      const data = await res.json();
      setSummary(data.summary);
      setStorageEngine(data.storage_engine || "local_file");
    } catch (err) {
      toast({
        title: "Error loading dashboard",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const checkProviderStatus = useCallback(async (providerId: string) => {
    setProviderPing((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], checking: true },
    }));
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: providerId }),
      });
      const data = await res.json();
      if (data.result) {
        setProviderPing((prev) => ({
          ...prev,
          [providerId]: {
            connected: data.result.connected,
            latency: data.result.latency_ms,
            checking: false,
          },
        }));
      }
    } catch {
      setProviderPing((prev) => ({
        ...prev,
        [providerId]: { connected: false, checking: false },
      }));
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (summary?.providers) {
      summary.providers.forEach((p) => {
        checkProviderStatus(p.id);
      });
    }
  }, [summary?.providers, checkProviderStatus]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Private OpenAI-compatible AI API gateway & model routing overview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            DB: {storageEngine === "postgresql" ? "PostgreSQL" : "Local Store"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOverview}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total API Requests
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(summary?.total_requests || 0)}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {summary?.success_rate ?? 100}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Requests Today
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(summary?.requests_today || 0)}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Avg latency: {summary?.avg_latency_ms || 0} ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active API Keys
            </CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(summary?.active_api_keys || 0)}
              </div>
            )}
            <Link
              href="/dashboard/keys"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Manage keys <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Enabled Models
            </CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {formatNumber(summary?.enabled_models || 0)}
              </div>
            )}
            <Link
              href="/dashboard/models"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Configure router <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Provider Status & Recent Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider Status */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Provider Status</CardTitle>
              <CardDescription>
                Upstream inference backends configured in the router
              </CardDescription>
            </div>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              summary?.providers.map((provider) => {
                const ping = providerPing[provider.id];
                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between rounded-md border p-3.5 bg-muted/20"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {provider.name}
                        </span>
                        {!provider.enabled && (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
                        {provider.base_url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ping?.checking ? (
                        <Badge variant="outline">Checking...</Badge>
                      ) : ping?.connected ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <XCircle className="h-3 w-3" />
                          Offline
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div className="pt-1">
              <Link href="/dashboard/providers">
                <Button variant="outline" size="sm" className="w-full">
                  Configure Providers
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent API Traffic</CardTitle>
              <CardDescription>
                Latest routed requests across `/v1/chat/completions`
              </CardDescription>
            </div>
            <Link href="/dashboard/usage">
              <Button variant="ghost" size="sm">
                View All <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !summary?.recent_requests.length ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">No API requests recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Create an API key and send a request to{" "}
                  <code className="font-mono text-foreground">
                    POST /v1/chat/completions
                  </code>{" "}
                  to see live telemetry.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Provider</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Latency</th>
                      <th className="pb-2 font-medium">Tokens</th>
                      <th className="pb-2 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.recent_requests.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="py-2.5 font-mono font-medium">
                          {log.model}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {log.provider}
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              log.status_code >= 200 && log.status_code < 300
                                ? "success"
                                : "destructive"
                            }
                          >
                            {log.status_code}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-mono">
                          {log.latency_ms} ms
                        </td>
                        <td className="py-2.5 font-mono text-muted-foreground">
                          {log.total_tokens ?? "—"}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">
                          {formatRelativeTime(log.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
