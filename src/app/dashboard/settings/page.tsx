"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Save,
  Database,
  Shield,
  Smartphone,
  QrCode,
  Copy,
  Check,
  Lock,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
  Switch,
  Badge,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { GatewaySettings, ModelRecord } from "@/types";

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<GatewaySettings | null>(null);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [storageEngine, setStorageEngine] = useState("local_file");
  const [envInfo, setEnvInfo] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Google Authenticator 2FA State
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, modelsRes, twoFaRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/models"),
        fetch("/api/auth/2fa"),
      ]);
      const settingsData = await settingsRes.json();
      const modelsData = await modelsRes.json();
      const twoFaData = await twoFaRes.json();

      setSettings(settingsData.settings);
      setStorageEngine(settingsData.storage_engine || "local_file");
      setEnvInfo(settingsData.env || {});
      setModels(modelsData.models || []);
      setTotpEnabled(Boolean(twoFaData.enabled));
    } catch (err) {
      toast({
        title: "Failed to load settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleStartTotpSetup = async () => {
    try {
      setTotpLoading(true);
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize 2FA setup");

      setSetupSecret(data.secret);
      setQrSvg(data.qr_svg);
      setVerificationCode("");
      setSetupMode(true);
      setDisableMode(false);
    } catch (err) {
      toast({
        title: "2FA Setup Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleConfirmEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setTotpLoading(true);
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret: setupSecret,
          code: verificationCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid authenticator code");

      setTotpEnabled(true);
      setSetupMode(false);
      setSetupSecret("");
      setQrSvg("");
      setVerificationCode("");
      window.dispatchEvent(new Event("gateway-2fa-updated"));

      toast({
        title: "Google Authenticator Enabled",
        description:
          "Two-factor authentication is now active on your Admin Dashboard.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Verification Failed",
        description: err instanceof Error ? err.message : "Invalid 6-digit code",
        variant: "error",
      });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleConfirmDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setTotpLoading(true);
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          code: verificationCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid authenticator code");

      setTotpEnabled(false);
      setDisableMode(false);
      setVerificationCode("");
      window.dispatchEvent(new Event("gateway-2fa-updated"));

      toast({
        title: "Google Authenticator Disabled",
        description: "Two-factor authentication has been turned off.",
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Could Not Disable 2FA",
        description: err instanceof Error ? err.message : "Invalid 6-digit code",
        variant: "error",
      });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleLockSessionNow = async () => {
    await fetch("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    });
    window.dispatchEvent(new Event("gateway-2fa-updated"));
  };

  const handleCopySecret = async () => {
    await navigator.clipboard.writeText(setupSecret);
    setCopiedSecret(true);
    toast({
      title: "Secret Key Copied",
      description: "Paste this key into Google Authenticator if scanning QR is unavailable.",
      variant: "success",
    });
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_model: settings.default_model,
          request_timeout_ms: Number(settings.request_timeout_ms),
          logging_enabled: settings.logging_enabled,
          rate_limit_rpm: Number(settings.rate_limit_rpm),
          max_request_bytes: Number(settings.max_request_bytes),
          cors_origins: settings.cors_origins,
          ip_allowlist: settings.ip_allowlist || "*",
          strict_security_headers: settings.strict_security_headers ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update settings");
      setSettings(data.settings);
      toast({
        title: "Settings Saved",
        description: "Gateway security and runtime settings have been updated.",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Could not save settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Security & Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage Google Authenticator (2FA), brute-force protection, IP allowlists, rate limits, and gateway policies.
        </p>
      </div>

      {loading || !settings ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Google Authenticator (TOTP 2FA) Card */}
          <Card className="border-primary/20">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <CardTitle>Google Authenticator (TOTP 2FA)</CardTitle>
                  {totpEnabled ? (
                    <Badge variant="success" className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Disabled
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Protect your Admin Dashboard with RFC 6238 time-based 6-digit
                  one-time passwords (compatible with Google Authenticator,
                  Authy, and 1Password).
                </CardDescription>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={totpEnabled}
                    onCheckedChange={(checked) => {
                      if (checked && !totpEnabled) {
                        handleStartTotpSetup();
                      } else if (!checked && totpEnabled) {
                        setDisableMode(true);
                        setSetupMode(false);
                        setVerificationCode("");
                      }
                    }}
                    ariaLabel="Toggle Google Authenticator 2FA"
                  />
                  <span className="text-xs font-medium">
                    {totpEnabled ? "Active" : "Off"}
                  </span>
                </div>

                {!totpEnabled && !setupMode && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleStartTotpSetup}
                    disabled={totpLoading}
                  >
                    <QrCode className="h-4 w-4" />
                    Enable Authenticator
                  </Button>
                )}

                {totpEnabled && !disableMode && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLockSessionNow}
                      title="Lock dashboard now to test 2FA screen"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Lock Dashboard Now
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDisableMode(true);
                        setVerificationCode("");
                      }}
                    >
                      Disable 2FA
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Setup Flow (QR Code + Secret + 6-Digit Verify) */}
            {setupMode && (
              <CardContent className="border-t pt-5 bg-muted/10">
                <form
                  onSubmit={handleConfirmEnableTotp}
                  className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center"
                >
                  {/* QR Code Box */}
                  <div className="md:col-span-4 flex flex-col items-center justify-center">
                    <div className="w-44 h-44 rounded-lg border bg-white p-2 shadow-sm">
                      <div
                        className="w-full h-full"
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-2 text-center">
                      Scan with Google Authenticator app
                    </span>
                  </div>

                  {/* Manual Secret + Code Input */}
                  <div className="md:col-span-8 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Step 1: Scan the QR code or enter this setup key manually
                        in Google Authenticator
                      </Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs font-semibold tracking-wider select-all">
                          {setupSecret.replace(/(.{4})/g, "$1 ").trim()}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopySecret}
                        >
                          {copiedSecret ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy Key
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="totp-enable-code">
                        Step 2: Enter the 6-digit code shown in Google
                        Authenticator to activate
                      </Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="totp-enable-code"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          placeholder="000000"
                          value={verificationCode}
                          onChange={(e) =>
                            setVerificationCode(
                              e.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                          }
                          className="font-mono text-base tracking-[0.35em] sm:max-w-[180px] text-center"
                          required
                        />
                        <Button
                          type="submit"
                          disabled={
                            totpLoading || verificationCode.length !== 6
                          }
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {totpLoading
                            ? "Verifying..."
                            : "Verify & Enable 2FA"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setSetupMode(false);
                            setVerificationCode("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </CardContent>
            )}

            {/* Disable Flow (Verify 6-digit code to disable) */}
            {disableMode && (
              <CardContent className="border-t pt-5 bg-muted/10">
                <form
                  onSubmit={handleConfirmDisableTotp}
                  className="space-y-3 max-w-xl"
                >
                  <Label htmlFor="totp-disable-code">
                    Enter your current 6-digit Google Authenticator code to
                    confirm disabling 2FA:
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="totp-disable-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) =>
                        setVerificationCode(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      className="font-mono text-base tracking-[0.35em] sm:max-w-[180px] text-center"
                      required
                    />
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={totpLoading || verificationCode.length !== 6}
                    >
                      {totpLoading
                        ? "Disabling..."
                        : "Confirm & Disable 2FA"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDisableMode(false);
                        setVerificationCode("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            )}
          </Card>

          {/* 2. Gateway Runtime & API Security Form */}
          <form onSubmit={handleSave} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <CardTitle>Gateway Security & Runtime Policies</CardTitle>
                </div>
                <CardDescription>
                  Configure IP allowlists, rate limits, payload size caps, CORS,
                  and natural response timeout behavior.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="default-model">Default Model</Label>
                    <select
                      id="default-model"
                      value={settings.default_model}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          default_model: e.target.value,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.public_id}>
                          {m.public_id} ({m.provider_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="timeout-ms">
                      API Request Timeout (ms — 0 for Unlimited / Natural Speed)
                    </Label>
                    <Input
                      id="timeout-ms"
                      type="number"
                      min={0}
                      max={600000}
                      value={settings.request_timeout_ms}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          request_timeout_ms: Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="rate-limit">
                      Rate Limit (Requests / Minute per Key)
                    </Label>
                    <Input
                      id="rate-limit"
                      type="number"
                      min={0}
                      max={100000}
                      value={settings.rate_limit_rpm}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          rate_limit_rpm: Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="max-bytes">Max Request Size (Bytes)</Label>
                    <Input
                      id="max-bytes"
                      type="number"
                      min={1024}
                      max={52428800}
                      value={settings.max_request_bytes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          max_request_bytes: Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cors-origins">Allowed CORS Origins</Label>
                    <Input
                      id="cors-origins"
                      value={settings.cors_origins}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          cors_origins: e.target.value,
                        })
                      }
                      placeholder="* or https://my-app.com"
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ip-allowlist">
                      Allowed Client IPs (* for all, or comma-separated IPs)
                    </Label>
                    <Input
                      id="ip-allowlist"
                      value={settings.ip_allowlist || "*"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          ip_allowlist: e.target.value,
                        })
                      }
                      placeholder="* or 127.0.0.1, 10.0.0.5"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-md border p-4 bg-muted/20">
                    <div className="space-y-0.5 pr-3">
                      <div className="text-sm font-medium">
                        Strict HTTP Security Headers
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Enforce{" "}
                        <code className="font-mono">
                          X-Content-Type-Options: nosniff
                        </code>
                        , <code className="font-mono">X-Frame-Options: DENY</code>
                        , and <code className="font-mono">no-store</code> cache
                        headers.
                      </div>
                    </div>
                    <Switch
                      checked={settings.strict_security_headers ?? true}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          strict_security_headers: checked,
                        })
                      }
                      ariaLabel="Toggle strict security headers"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-4 bg-muted/20">
                    <div className="space-y-0.5 pr-3">
                      <div className="text-sm font-medium">
                        Usage Telemetry Logging
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Record request metadata, status codes, latency, and
                        token estimates (never logs prompt/response text).
                      </div>
                    </div>
                    <Switch
                      checked={settings.logging_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, logging_enabled: checked })
                      }
                      ariaLabel="Toggle usage logging"
                    />
                  </div>
                </div>

                {/* Built-in Active Security Protections Summary */}
                <div className="rounded-md border bg-muted/15 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Active Cryptographic & Gateway Defenses</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      • <strong>SHA-256 + Constant-Time Auth</strong>: API keys
                      are hashed with SHA-256 and verified via{" "}
                      <code className="font-mono">timingSafeEqual</code>.
                    </div>
                    <div>
                      • <strong>Brute-Force Lockout</strong>: Automatic IP
                      rate-lockout after repeated failed API key or 2FA
                      attempts.
                    </div>
                    <div>
                      • <strong>Error Sanitization</strong>: Upstream stack
                      traces and Bearer secrets are scrubbed before returning.
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Security Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Environment & Storage Info */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <CardTitle>Environment & Database Layer</CardTitle>
                </div>
                <CardDescription>
                  Active server environment variables (secrets are never
                  exposed).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Database Adapter</span>
                  <Badge
                    variant={
                      storageEngine === "postgresql" ? "success" : "outline"
                    }
                  >
                    {storageEngine === "postgresql"
                      ? "PostgreSQL / Supabase (DATABASE_URL)"
                      : "Local Persistent Store (.data/gateway-db.json)"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">
                    NEXT_PUBLIC_APP_URL (Single Domain Config)
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {String(envInfo.app_url || "http://localhost:3000")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">API Key Prefix</span>
                  <span className="font-mono">
                    {String(envInfo.api_key_prefix || "sk_live_")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">
                    GEMINI_WEB2API_BASE_URL
                  </span>
                  <span className="font-mono">
                    {String(
                      envInfo.gemini_base_url || "http://localhost:8081/v1"
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground">OLLAMA_BASE_URL</span>
                  <span className="font-mono">
                    {String(envInfo.ollama_base_url || "http://localhost:11434")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      )}
    </div>
  );
}
