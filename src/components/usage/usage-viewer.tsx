"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  ShieldCheck,
  Clock,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import type { UsageLogRecord, DashboardSummary } from "@/types";

export function UsageViewer() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<UsageLogRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">(
    "all"
  );

  const loadUsage = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/usage?limit=200");
      if (!res.ok) throw new Error("Failed to load usage telemetry");
      const data = await res.json();
      setLogs(data.logs || []);
      setSummary(data.summary || null);
    } catch (err) {
      toast({
        title: "Error loading usage logs",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const filteredLogs = logs.filter((log) => {
    if (
      statusFilter === "success" &&
      (log.status_code < 200 || log.status_code >= 300)
    ) {
      return false;
    }
    if (
      statusFilter === "error" &&
      log.status_code >= 200 &&
      log.status_code < 300
    ) {
      return false;
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      return (
        log.model.toLowerCase().includes(q) ||
        log.provider.toLowerCase().includes(q) ||
        log.request_id.toLowerCase().includes(q) ||
        (log.api_key_name && log.api_key_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalTokens = logs.reduce(
    (acc, l) => acc + (l.total_tokens || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">
            Request volume, latency, status codes, and approximate token telemetry.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsage}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh Logs
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-4 text-xs">
        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">
            Privacy-First Telemetry:
          </span>{" "}
          Prompt messages and model completion responses are never persisted to the
          database. Only routing metadata, latency, HTTP status, and approximate
          token counts are tracked.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(summary?.total_requests || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.avg_latency_ms || 0} ms
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.success_rate ?? 100}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Approx. Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(totalTokens)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by model, provider, key, or request ID..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "success", "error"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Clock className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="text-sm font-semibold">No matching usage logs</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Requests sent to <code className="font-mono">/v1/chat/completions</code>{" "}
                will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Request ID</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">API Key</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Latency</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Tokens (P/C/T)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div>{formatRelativeTime(log.created_at)}</div>
                        <div className="text-[10px] opacity-75">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {log.request_id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold">
                            {log.model}
                          </span>
                          {log.is_stream && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              SSE
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{log.provider}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {log.api_key_name || "API Key"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            log.status_code >= 200 && log.status_code < 300
                              ? "success"
                              : "destructive"
                          }
                        >
                          {log.status_code}
                          {log.error_code ? ` (${log.error_code})` : ""}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        {log.latency_ms} ms
                      </td>
                      <td className="px-4 py-3 font-mono text-right text-muted-foreground whitespace-nowrap">
                        {log.total_tokens !== null
                          ? `${log.prompt_tokens ?? 0} / ${
                              log.completion_tokens ?? 0
                            } / ${log.total_tokens}`
                          : "—"}
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
  );
}
