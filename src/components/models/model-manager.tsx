"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  ModalDialog,
  ConfirmDialog,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ModelRecord, ProviderRecord } from "@/types";

export function ModelManager() {
  const { toast } = useToast();
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelRecord | null>(null);
  const [publicId, setPublicId] = useState("");
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("gemini");
  const [providerModel, setProviderModel] = useState("");
  const [modelType, setModelType] = useState<"chat" | "completion" | "reasoning">("chat");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ModelRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [modelsRes, providersRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/providers"),
      ]);
      const modelsData = await modelsRes.json();
      const providersData = await providersRes.json();
      setModels(modelsData.models || []);
      setProviders(providersData.providers || []);
    } catch (err) {
      toast({
        title: "Failed to load models",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingModel(null);
    setPublicId("");
    setName("");
    setProviderId(providers[0]?.id || "gemini");
    setProviderModel("");
    setModelType("chat");
    setDescription("");
    setEnabled(true);
    setModalOpen(true);
  };

  const openEditModal = (model: ModelRecord) => {
    setEditingModel(model);
    setPublicId(model.public_id);
    setName(model.name);
    setProviderId(model.provider_id);
    setProviderModel(model.provider_model);
    setModelType(model.type);
    setDescription(model.description);
    setEnabled(model.enabled);
    setModalOpen(true);
  };

  const handleToggleEnabled = async (model: ModelRecord, nextEnabled: boolean) => {
    try {
      const res = await fetch("/api/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: model.id, enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update model");

      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? data.model : m))
      );
      toast({
        title: nextEnabled ? "Model Enabled" : "Model Disabled",
        description: `${model.public_id} is now ${nextEnabled ? "exposed on /v1/models" : "disabled"}.`,
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Could not update model status",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    }
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...(editingModel ? { id: editingModel.id } : {}),
        public_id: publicId.trim(),
        name: name.trim() || publicId.trim(),
        provider_id: providerId,
        provider_model: providerModel.trim(),
        type: modelType,
        enabled,
        description: description.trim(),
      };

      const res = await fetch("/api/models", {
        method: editingModel ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save model route");

      if (editingModel) {
        setModels((prev) =>
          prev.map((m) => (m.id === editingModel.id ? data.model : m))
        );
        toast({
          title: "Model Route Updated",
          description: `Updated routing for "${data.model.public_id}".`,
          variant: "success",
        });
      } else {
        setModels((prev) => [...prev, data.model]);
        toast({
          title: "Model Route Created",
          description: `Added "${data.model.public_id}" to the model registry.`,
          variant: "success",
        });
      }
      setModalOpen(false);
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(
        `/api/models?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete model route");

      setModels((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({
        title: "Model Route Deleted",
        description: `Removed "${deleteTarget.public_id}" from the router.`,
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getProviderName = (id: string) => {
    const found = providers.find((p) => p.id === id);
    if (!found) return id;
    return found.type === "gemini" ? "Gemini" : found.name;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="text-sm text-muted-foreground">
            Configure the Model Router registry mapping public model IDs to
            upstream AI providers.
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          Add Model Route
        </Button>
      </div>

      {/* Models Table Card */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Cpu className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="text-sm font-semibold">No models configured</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Add a model route to expose it on{" "}
                <code className="font-mono">/v1/models</code> and route chat
                completions.
              </p>
              <Button className="mt-4" size="sm" onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Add Model Route
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3.5 font-medium">Model</th>
                    <th className="px-5 py-3.5 font-medium">Provider</th>
                    <th className="px-5 py-3.5 font-medium">Upstream Route</th>
                    <th className="px-5 py-3.5 font-medium">Type</th>
                    <th className="px-5 py-3.5 font-medium">Status</th>
                    <th className="px-5 py-3.5 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {models.map((model) => (
                    <tr
                      key={model.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="font-mono font-semibold text-foreground">
                          {model.public_id}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {model.name}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline">
                          {getProviderName(model.provider_id)}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                          <span>{model.public_id}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-foreground">
                            {model.provider_model}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="capitalize text-xs text-muted-foreground">
                          {model.type}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <Switch
                            checked={model.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleEnabled(model, checked)
                            }
                            ariaLabel={`Toggle ${model.public_id}`}
                          />
                          <Badge
                            variant={model.enabled ? "success" : "outline"}
                          >
                            {model.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(model)}
                            title="Edit model route"
                            aria-label={`Edit ${model.public_id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(model)}
                            title="Delete model route"
                            aria-label={`Delete ${model.public_id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Model Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingModel ? "Edit Model Route" : "Add Model Route"}
        description="Map a client-facing public model ID to an upstream AI provider and model."
      >
        <form onSubmit={handleSaveModel} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="public-id">Public Model ID</Label>
              <Input
                id="public-id"
                placeholder="e.g. gemini-fast"
                value={publicId}
                onChange={(e) => setPublicId(e.target.value)}
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                placeholder="e.g. Gemini Fast"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="provider-select">Provider</Label>
              <select
                id="provider-select"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="provider-model">Upstream Provider Model</Label>
              <Input
                id="provider-model"
                placeholder={
                  providerId === "gemini"
                    ? "e.g. gemini-3.6-flash"
                    : "e.g. qwen2.5:latest"
                }
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
                className="font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="model-type">Model Type</Label>
              <select
                id="model-type"
                value={modelType}
                onChange={(e) =>
                  setModelType(
                    e.target.value as "chat" | "completion" | "reasoning"
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="chat">Chat</option>
                <option value="reasoning">Reasoning</option>
                <option value="completion">Completion</option>
              </select>
            </div>

            <div className="space-y-1.5 flex flex-col justify-end pb-1">
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  ariaLabel="Enable model"
                />
                <Label>Expose on /v1/models</Label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model-desc">Description (Optional)</Label>
            <Input
              id="model-desc"
              placeholder="Short description for admin reference"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : editingModel
                ? "Save Changes"
                : "Create Route"}
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteModel}
        title="Delete Model Route"
        description={`Remove "${deleteTarget?.public_id}" from the model registry? Clients requesting this model ID will receive 404 model_not_found.`}
        confirmLabel="Delete Route"
        destructive
        loading={deleting}
      />
    </div>
  );
}
