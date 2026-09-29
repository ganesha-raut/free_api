"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldAlert,
  Ban,
  Trash2,
  Clock,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  ModalDialog,
  ConfirmDialog,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatNumber, formatRelativeTime } from "@/lib/utils";
import type { PublicApiKey } from "@/types";

export function ApiKeyManager() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create key dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  // One-time secret reveal modal
  const [revealedSecret, setRevealedSecret] = useState<{
    name: string;
    rawKey: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke / Delete confirmation dialog
  const [revokeTarget, setRevokeTarget] = useState<PublicApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicApiKey | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      toast({
        title: "Failed to load API keys",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create API key");
      }

      setKeys((prev) => [data.key, ...prev]);
      setCreateOpen(false);
      setRevealedSecret({
        name: data.key.name,
        rawKey: data.raw_key,
      });
      setNewKeyName("");
      toast({
        title: "API Key Created",
        description: `Created key "${data.key.name}". Copy it now — it will not be shown again.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Could not create API key",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret.rawKey);
    setCopied(true);
    toast({
      title: "Copied to clipboard",
      description: "Your secret API key has been copied.",
      variant: "info",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeKey = async () => {
    if (!revokeTarget) return;
    try {
      setActionLoading(true);
      const res = await fetch("/api/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: revokeTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke key");

      setKeys((prev) =>
        prev.map((k) => (k.id === revokeTarget.id ? data.key : k))
      );
      setRevokeTarget(null);
      toast({
        title: "API Key Revoked",
        description: `Key "${revokeTarget.name}" can no longer authenticate requests.`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Revocation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/keys?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete key");
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        title: "API Key Deleted",
        description: `Removed key "${deleteTarget.name}" from the registry.`,
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Manage Bearer authentication keys for your projects calling{" "}
            <code className="font-mono text-foreground">/v1/*</code> endpoints.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <span className="font-medium text-foreground">
            SHA-256 Hashed Storage:
          </span>{" "}
          Complete API keys are never stored in plaintext in the database or logs.
          Each key is displayed only once at creation time.
        </div>
      </div>

      {/* Key Cards List */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <KeyRound className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-semibold">No API keys created yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Generate an API key to authenticate requests from your Python, Node.js,
              or curl clients against this gateway.
            </p>
            <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create First API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {keys.map((key) => {
            const isRevoked = key.status === "revoked";
            return (
              <Card
                key={key.id}
                className={isRevoked ? "opacity-70 bg-muted/20" : ""}
              >
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-base">
                        {key.name}
                      </span>
                      <Badge
                        variant={isRevoked ? "destructive" : "success"}
                      >
                        {isRevoked ? "Revoked" : "Active"}
                      </Badge>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground bg-muted/50 inline-block px-2.5 py-1 rounded border">
                      {key.masked_key}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Created: {formatRelativeTime(key.created_at)}
                      </span>
                      <span>
                        Last used: {formatRelativeTime(key.last_used_at)}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        Requests: {formatNumber(key.request_count)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevokeTarget(key)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(key)}
                      title="Delete key record"
                      aria-label={`Delete ${key.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Key Modal */}
      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New API Key"
        description="Assign a descriptive name for the application or project that will use this key."
      >
        <form onSubmit={handleCreateKey} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Key Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. My Development Key"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !newKeyName.trim()}>
              {creating ? "Generating..." : "Generate Key"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* One-Time Secret Key Display Modal */}
      <ModalDialog
        open={Boolean(revealedSecret)}
        onClose={() => setRevealedSecret(null)}
        title="Save Your Secret API Key"
        description="Please copy and store this key securely now. For security reasons, you will not be able to view it again."
      >
        {revealedSecret && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              This is the only time the full secret key for{" "}
              <strong>{revealedSecret.name}</strong> will be shown.
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={revealedSecret.rawKey}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopySecret}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setRevealedSecret(null)}>Done</Button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevokeKey}
        title="Revoke API Key"
        description={`Are you sure you want to revoke "${revokeTarget?.name}"? Any applications using this key will immediately receive 401 Unauthorized responses.`}
        confirmLabel="Revoke Key"
        destructive
        loading={actionLoading}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteKey}
        title="Delete API Key Record"
        description={`Permanently delete "${deleteTarget?.name}" from the key list?`}
        confirmLabel="Delete Permanently"
        destructive
        loading={actionLoading}
      />
    </div>
  );
}
