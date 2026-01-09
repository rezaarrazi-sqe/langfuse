import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { Loader2 } from "lucide-react";
import { type Prisma } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getFormattedPayload } from "@/src/features/experiments/utils/format";
import { DEFAULT_ENDPOINTS } from "@/src/features/experiments/utils/remoteExperimentEndpoints";

// Schema for endpoint-only mode (host/port from env)
const RemoteExperimentSetupSchemaEndpointOnly = z.object({
  endpoint: z.string().min(1, "Endpoint is required"),
  defaultPayload: z.string(),
});

// Schema for single URL mode (legacy)
const RemoteExperimentSetupSchemaSingle = z.object({
  url: z.string().url("Invalid URL"),
  defaultPayload: z.string(),
});

type RemoteExperimentSetupFormEndpointOnly = z.infer<typeof RemoteExperimentSetupSchemaEndpointOnly>;
type RemoteExperimentSetupFormSingle = z.infer<typeof RemoteExperimentSetupSchemaSingle>;

// Helper function to parse existing URL
function parseExistingUrl(url: string | undefined): {
  endpoint: string;
} {
  if (!url) {
    return { endpoint: "" };
  }

  try {
    const urlObj = new URL(url);
    return {
      endpoint: urlObj.pathname,
    };
  } catch {
    // If URL parsing fails, try to extract manually
    const match = url.match(/^(https?:\/\/)?([^:\/]+)(:(\d+))?(\/.*)?$/);
    if (match) {
      return {
        endpoint: match[5] || "",
      };
    }
    return { endpoint: "" };
  }
}

// Helper function to build URL from env config and endpoint
function buildUrlFromEnv(baseUrl: string | null, port: number | null, endpoint: string): string {
  if (!baseUrl) {
    throw new Error("Base URL not configured");
  }

  // Determine protocol based on hostname
  const protocol = (baseUrl === "localhost" || baseUrl === "host.docker.internal") ? "http" : "https";
  const host = port ? `${baseUrl}:${port}` : baseUrl;
  return `${protocol}://${host}${endpoint}`;
}

export const RemoteExperimentUpsertForm = ({
  projectId,
  datasetId,
  existingRemoteExperiment,
  setShowRemoteExperimentUpsertForm,
}: {
  projectId: string;
  datasetId: string;
  existingRemoteExperiment?: {
    url: string;
    payload: Prisma.JsonValue;
  } | null;
  setShowRemoteExperimentUpsertForm: (show: boolean) => void;
}) => {
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });
  const utils = api.useUtils();

  // Get endpoints from server via tRPC
  const endpointsQuery = api.datasets.getRemoteExperimentEndpoints.useQuery();
  const availableEndpoints =
    endpointsQuery.data && endpointsQuery.data.length > 0
      ? endpointsQuery.data
      : DEFAULT_ENDPOINTS;

  // Get env config (base URL and port)
  const envConfigQuery = api.datasets.getRemoteExperimentConfig.useQuery();
  const hasEnvConfig = envConfigQuery.data?.baseUrl !== null && envConfigQuery.data?.baseUrl !== undefined;

  const parsedUrl = parseExistingUrl(existingRemoteExperiment?.url);
  
  // Determine initial mode: endpoint-only if env config exists, otherwise single URL
  const [mode, setMode] = useState<"endpoint-only" | "single">(
    hasEnvConfig ? "endpoint-only" : "single"
  );

  // Form for endpoint-only mode
  const formEndpointOnly = useForm<RemoteExperimentSetupFormEndpointOnly>({
    resolver: zodResolver(RemoteExperimentSetupSchemaEndpointOnly),
    defaultValues: {
      endpoint: parsedUrl.endpoint || availableEndpoints[0]?.value || "",
      defaultPayload: getFormattedPayload(existingRemoteExperiment?.payload),
    },
  });

  // Form for single URL mode
  const formSingle = useForm<RemoteExperimentSetupFormSingle>({
    resolver: zodResolver(RemoteExperimentSetupSchemaSingle),
    defaultValues: {
      url: existingRemoteExperiment?.url || "",
      defaultPayload: getFormattedPayload(existingRemoteExperiment?.payload),
    },
  });

  // Sync data between forms when mode changes
  useEffect(() => {
    if (mode === "endpoint-only") {
      const urlValue = formSingle.watch("url");
      if (urlValue) {
        const parsed = parseExistingUrl(urlValue);
        formEndpointOnly.setValue("endpoint", parsed.endpoint || availableEndpoints[0]?.value || "");
      }
    } else {
      // When switching to single URL mode, we can't reconstruct the full URL from endpoint only
      // So we leave it as is or clear it
      if (!formSingle.watch("url")) {
        formSingle.setValue("url", "");
      }
    }
  }, [mode, formEndpointOnly, formSingle, availableEndpoints]);

  const upsertRemoteExperimentMutation =
    api.datasets.upsertRemoteExperiment.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Setup successfully",
          description: "Your changes have been saved.",
        });
        setShowRemoteExperimentUpsertForm(false);
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
      },
      onError: (error) => {
        showErrorToast(
          error.message || "Failed to setup",
          "Please check your URL and config and try again.",
        );
      },
    });

  const deleteRemoteExperimentMutation =
    api.datasets.deleteRemoteExperiment.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Deleted successfully",
          description:
            "The remote dataset run trigger has been removed from this dataset.",
        });
        setShowRemoteExperimentUpsertForm(false);
      },
      onError: (error) => {
        showErrorToast(
          error.message || "Failed to delete remote dataset run trigger",
          "Please try again.",
        );
      },
    });

  const onSubmitEndpointOnly = (data: RemoteExperimentSetupFormEndpointOnly) => {
    if (data.defaultPayload.trim()) {
      try {
        JSON.parse(data.defaultPayload);
      } catch {
        formEndpointOnly.setError("defaultPayload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    if (!envConfigQuery.data?.baseUrl) {
      showErrorToast("Configuration error", "Remote experiment base URL not configured");
      return;
    }

    try {
      const fullUrl = buildUrlFromEnv(
        envConfigQuery.data.baseUrl,
        envConfigQuery.data.port || null,
        data.endpoint
      );

      upsertRemoteExperimentMutation.mutate({
        projectId,
        datasetId,
        url: fullUrl,
        defaultPayload: data.defaultPayload,
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "Failed to build URL",
        "Please check your environment configuration."
      );
    }
  };

  const onSubmitSingle = (data: RemoteExperimentSetupFormSingle) => {
    if (data.defaultPayload.trim()) {
      try {
        JSON.parse(data.defaultPayload);
      } catch {
        formSingle.setError("defaultPayload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    upsertRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      url: data.url,
      defaultPayload: data.defaultPayload,
    });
  };

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete this remote dataset run trigger?",
      )
    ) {
      deleteRemoteExperimentMutation.mutate({
        projectId,
        datasetId,
      });
    }
  };

  if (!hasDatasetAccess) {
    return null;
  }

  if (dataset.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  const selectedEndpoint = formEndpointOnly.watch("endpoint");
  const selectedEndpointData = availableEndpoints.find(
    (ep) => ep.value === selectedEndpoint
  );

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowRemoteExperimentUpsertForm(false)}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>
          {existingRemoteExperiment
            ? "Edit remote dataset run trigger"
            : "Set up remote dataset run trigger in UI"}
        </DialogTitle>
        <DialogDescription>
          Enable your team to run custom dataset runs on dataset{" "}
          <strong>
            {dataset.isSuccess ? (
              <>&quot;{dataset.data?.name}&quot;</>
            ) : (
              <Loader2 className="inline h-4 w-4 animate-spin" />
            )}
          </strong>
          . Configure a webhook URL to trigger remote custom dataset runs from
          UI. We will send dataset info (name, id) and config to your service,
          which can run against the dataset and post results to Langfuse.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Mode Selection */}
        {hasEnvConfig && (
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="space-y-0.5">
              <label className="text-base font-medium leading-none">
                Configuration Mode
              </label>
              <p className="text-sm text-muted-foreground">
                {mode === "endpoint-only"
                  ? "Select endpoint only (host/port configured via environment)"
                  : "Enter the full URL manually"}
              </p>
            </div>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as typeof mode)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="endpoint-only">Endpoint Only</SelectItem>
                <SelectItem value="single">Single URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "endpoint-only" && hasEnvConfig ? (
          <Form {...formEndpointOnly}>
            <form
              onSubmit={formEndpointOnly.handleSubmit(onSubmitEndpointOnly)}
              className="space-y-4"
            >
              <DialogBody>
                <div className="space-y-4">
                  <FormField
                    control={formEndpointOnly.control}
                    name="endpoint"
                    render={({ field }) => {
                      return (
                        <FormItem>
                          <FormLabel>Endpoint</FormLabel>
                          <FormDescription>
                            Select the API endpoint to use. Host and port are
                            configured via environment variables.
                          </FormDescription>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select endpoint">
                                  {selectedEndpointData
                                    ? selectedEndpointData.value
                                    : "Select endpoint"}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableEndpoints.map((ep) => (
                                <SelectItem key={ep.value} value={ep.value}>
                                  <div className="flex flex-col">
                                    <span>{ep.label}</span>
                                    {ep.description && (
                                      <span className="text-xs text-muted-foreground">
                                        {ep.description}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {ep.value}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  {/* No preview URL shown - host/port are hidden */}
                </div>

                <FormField
                  control={formEndpointOnly.control}
                  name="defaultPayload"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default config</FormLabel>
                      <FormDescription>
                        Set a default config that will be sent to the remote
                        dataset run URL. This can be modified before starting a
                        new run. View docs for more details.
                      </FormDescription>
                      <CodeMirrorEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        editable
                        mode="json"
                        minHeight={200}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>

              <DialogFooter>
                <div className="flex w-full justify-between">
                  {existingRemoteExperiment && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteRemoteExperimentMutation.isPending}
                    >
                      {deleteRemoteExperimentMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={upsertRemoteExperimentMutation.isPending}
                  >
                    {upsertRemoteExperimentMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {existingRemoteExperiment ? "Update" : "Set up"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...formSingle}>
            <form
              onSubmit={formSingle.handleSubmit(onSubmitSingle)}
              className="space-y-4"
            >
              <DialogBody>
                <FormField
                  control={formSingle.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormDescription>
                        The URL that will be called when the remote dataset run
                        is triggered.
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="https://your-service.com/webhook"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={formSingle.control}
                  name="defaultPayload"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default config</FormLabel>
                      <FormDescription>
                        Set a default config that will be sent to the remote
                        dataset run URL. This can be modified before starting a
                        new run. View docs for more details.
                      </FormDescription>
                      <CodeMirrorEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        editable
                        mode="json"
                        minHeight={200}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>

              <DialogFooter>
                <div className="flex w-full justify-between">
                  {existingRemoteExperiment && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteRemoteExperimentMutation.isPending}
                    >
                      {deleteRemoteExperimentMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={upsertRemoteExperimentMutation.isPending}
                  >
                    {upsertRemoteExperimentMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {existingRemoteExperiment ? "Update" : "Set up"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        )}
      </div>
    </>
  );
};
