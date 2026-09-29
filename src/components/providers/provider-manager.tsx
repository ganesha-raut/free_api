"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Settings2,
  Cpu,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  ModalDialog,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ProviderRecord } from "@/types";
import type { ProviderConnectionTestResult } from "@/lib/providers/provider.interface";

export function ProviderManager() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<
    Record<string, ProviderConnectionTestResult & { testing?: boolean }>
  >({});

  // Edit modal state
  const [editingProvider, setEditingProvider] = useState<ProviderRecord | null>(
    null
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(120000);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error("Failed to load providers");
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      toast({
        title: "Error loading providers",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleTestConnection = useCallback(
    async (provider: ProviderRecord, notify = true) => {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          ...(prev[provider.id] || {
            connected: false,
            latency_ms: 0,
            models: [],
            message: "",
          }),
          testing: true,
        },
      }));

      try {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: provider.id }),
        });
        const data = await res.json();
        const result: ProviderConnectionTestResult = data.result || {
          connected: false,
          latency_ms: 0,
          models: [],
          message: data.error || "Connection test failed",
        };

        setTestResults((prev) => ({
          ...prev,
          [provider.id]: { ...result, testing: false },
        }));

        if (notify) {
          toast({
            title: result.connected
              ? `${provider.name}: Connected`
              : `${provider.name}: Unreachable`,
            description: `${result.message} (${result.latency_ms} ms)`,
            variant: result.connected ? "success" : "error",
          });
        }
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [provider.id]: {
            connected: false,
            latency_ms: 0,
            models: [],
            message:
              err instanceof Error ? err.message : "Connection test failed",
            testing: false,
          },
        }));
      }
    },
    [toast]
  );

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    providers.forEach((p) => {
      handleTestConnection(p, false);
    });
  }, [providers, handleTestConnection]);

  const openEditProvider = (provider: ProviderRecord) => {
    setEditingProvider(provider);
    setBaseUrl(provider.base_url);
    setTimeoutMs(provider.timeout_ms);
    setEnabled(provider.enabled);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    try {
      setSaving(true);
      const res = await fetch("/api/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProvider.id,
          base_url: baseUrl.trim(),
          timeout_ms: Number(timeoutMs),
          enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update provider");

      setProviders((prev) =>
        prev.map((p) => (p.id === editingProvider.id ? data.provider : p))
      );
      setEditingProvider(null);
      toast({
        title: "Provider Updated",
        description: `Saved configuration for ${data.provider.name}.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="text-sm text-muted-foreground">
            Manage upstream AI backends and verify server-side connectivity.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {providers.map((provider) => {
            const status = testResults[provider.id];
            const isTesting = status?.testing;
            const isConnected = status?.connected;

            return (
              <Card key={provider.id} className="flex flex-col justify-between">
                <div>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <Server className="h-4 w-4 text-primary" />
                        <CardTitle>{provider.name}</CardTitle>
                        {!provider.enabled && (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </div>
                      <CardDescription>
                        Adapter type:{" "}
                        <span className="font-mono">{provider.type}</span>
                      </CardDescription>
                    </div>

                    <div>
                      {isTesting ? (
                        <Badge variant="outline">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Testing...
                        </Badge>
                      ) : isConnected ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected ({status?.latency_ms} ms)
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <XCircle className="h-3 w-3" />
                          Offline
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Base URL</span>
                        <span className="font-mono font-medium text-foreground">
                          {provider.base_url}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Timeout</span>
                        <span className="font-mono">
                          {provider.timeout_ms} ms
                        </span>
                      </div>
                      {status?.message && (
                        <div className="pt-1 border-t text-muted-foreground">
                          {status.message}
                        </div>
                      )}
                    </div>

                    {/* Dynamically discovered upstream models */}
                    {status?.models && status.models.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Cpu className="h-3.5 w-3.5" />
                          <span>
                            Discovered Upstream Models ({status.models.length})
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                          {status.models.map((m) => (
                            <span
                              key={m.id}
                              className="rounded border bg-muted/50 px-2 py-0.5 font-mono text-[11px]"
                            >
                              {m.id}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditProvider(provider)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configure
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleTestConnection(provider, true)}
                    disabled={isTesting}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        isTesting ? "animate-spin" : ""
                      }`}
                    />
                    Test Connection
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Configure Provider Modal */}
      <ModalDialog
        open={Boolean(editingProvider)}
        onClose={() => setEditingProvider(null)}
        title={`Configure ${editingProvider?.name || "Provider"}`}
        description="Update upstream endpoint URL, request timeout, or provider availability."
      >
        <form onSubmit={handleSaveProvider} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="provider-url">Base URL</Label>
            <Input
              id="provider-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-timeout">Timeout (ms)</Label>
            <Input
              id="provider-timeout"
              type="number"
              min={1000}
              max={600000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              required
            />
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              ariaLabel="Enable provider"
            />
            <Label>Provider Enabled</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingProvider(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
