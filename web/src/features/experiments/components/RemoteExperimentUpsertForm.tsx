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
import { Switch } from "@/src/components/ui/switch";
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

// Schema for split fields mode
const RemoteExperimentSetupSchemaSplit = z.object({
  baseUrl: z.string().min(1, "Base URL is required"),
  port: z.string().optional(),
  endpoint: z.string().min(1, "Endpoint is required"),
  defaultPayload: z.string(),
});

// Schema for single URL mode
const RemoteExperimentSetupSchemaSingle = z.object({
  url: z.string().url("Invalid URL"),
  defaultPayload: z.string(),
});

type RemoteExperimentSetupFormSplit = z.infer<typeof RemoteExperimentSetupSchemaSplit>;
type RemoteExperimentSetupFormSingle = z.infer<typeof RemoteExperimentSetupSchemaSingle>;

// Helper function to parse existing URL
function parseExistingUrl(url: string | undefined): {
  baseUrl: string;
  port: string;
  endpoint: string;
} {
  if (!url) {
    return { baseUrl: "", port: "", endpoint: "" };
  }

  try {
    const urlObj = new URL(url);
    const baseUrl = urlObj.hostname;
    const port = urlObj.port || "";
    const pathname = urlObj.pathname;

    return {
      baseUrl,
      port,
      endpoint: pathname,
    };
  } catch {
    // If URL parsing fails, try to extract manually
    const match = url.match(/^(https?:\/\/)?([^:\/]+)(:(\d+))?(\/.*)?$/);
    if (match) {
      return {
        baseUrl: match[2] || "",
        port: match[4] || "",
        endpoint: match[5] || "",
      };
    }
    return { baseUrl: url, port: "", endpoint: "" };
  }
}

// Helper function to build URL from form values
function buildUrl(baseUrl: string, port: string | undefined, endpoint: string): string {
  const protocol = baseUrl === "localhost" ? "http" : "https";
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

  const parsedUrl = parseExistingUrl(existingRemoteExperiment?.url);
  
  // State for toggle between split fields and single URL
  const [useSplitFields, setUseSplitFields] = useState(true);

  // Form for split fields mode
  const formSplit = useForm<RemoteExperimentSetupFormSplit>({
    resolver: zodResolver(RemoteExperimentSetupSchemaSplit),
    defaultValues: {
      baseUrl: parsedUrl.baseUrl || "localhost",
      port: parsedUrl.port || "8000",
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

  // Sync data between forms when toggle changes
  useEffect(() => {
    if (useSplitFields) {
      const urlValue = formSingle.watch("url");
      if (urlValue) {
        const parsed = parseExistingUrl(urlValue);
        formSplit.setValue("baseUrl", parsed.baseUrl || "localhost");
        formSplit.setValue("port", parsed.port || "8000");
        formSplit.setValue("endpoint", parsed.endpoint || availableEndpoints[0]?.value || "");
      }
    } else {
      const baseUrl = formSplit.watch("baseUrl");
      const port = formSplit.watch("port");
      const endpoint = formSplit.watch("endpoint");
      if (baseUrl && endpoint) {
        const fullUrl = buildUrl(baseUrl, port, endpoint);
        formSingle.setValue("url", fullUrl);
      }
    }
  }, [useSplitFields, formSplit, formSingle, availableEndpoints]);

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

  const onSubmitSplit = (data: RemoteExperimentSetupFormSplit) => {
    if (data.defaultPayload.trim()) {
      try {
        JSON.parse(data.defaultPayload);
      } catch {
        formSplit.setError("defaultPayload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    const fullUrl = buildUrl(data.baseUrl, data.port || "", data.endpoint);

    upsertRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      url: fullUrl,
      defaultPayload: data.defaultPayload,
    });
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

  const baseUrl = formSplit.watch("baseUrl") || "";
  const port = formSplit.watch("port");
  const endpoint = formSplit.watch("endpoint") || "";
  const previewUrl = buildUrl(baseUrl, port, endpoint);
  const singleUrl = formSingle.watch("url") || "";

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
        {/* Toggle Switch */}
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="space-y-0.5">
            <label className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Use split fields
            </label>
            <p className="text-sm text-muted-foreground">
              {useSplitFields
                ? "Enter host, port, and endpoint separately for better UX"
                : "Enter the full URL in a single field"}
            </p>
          </div>
          <Switch
            checked={useSplitFields}
            onCheckedChange={setUseSplitFields}
          />
        </div>

        {useSplitFields ? (
          <Form {...formSplit}>
            <form onSubmit={formSplit.handleSubmit(onSubmitSplit)} className="space-y-4">
              <DialogBody>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={formSplit.control}
                      name="baseUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Host</FormLabel>
                          <FormDescription>Server hostname or IP</FormDescription>
                          <FormControl>
                            <Input placeholder="localhost" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={formSplit.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port (optional)</FormLabel>
                          <FormDescription>Server port (defaults to 80/443)</FormDescription>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="8000"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={formSplit.control}
                      name="endpoint"
                      render={({ field }) => {
                        const selectedEndpoint = availableEndpoints.find(
                          (ep) => ep.value === field.value
                        );
                        return (
                          <FormItem>
                            <FormLabel>Endpoint</FormLabel>
                            <FormDescription>API endpoint</FormDescription>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select endpoint">
                                    {selectedEndpoint ? selectedEndpoint.value : "Select endpoint"}
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
                  </div>

                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm font-medium mb-1">Preview URL:</p>
                    <p className="text-sm text-muted-foreground font-mono break-all">
                      {previewUrl}
                    </p>
                  </div>
                </div>

                <FormField
                  control={formSplit.control}
                  name="defaultPayload"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default config</FormLabel>
                      <FormDescription>
                        Set a default config that will be sent to the remote dataset
                        run URL. This can be modified before starting a new run.
                        View docs for more details.
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
            <form onSubmit={formSingle.handleSubmit(onSubmitSingle)} className="space-y-4">
              <DialogBody>
                <FormField
                  control={formSingle.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormDescription>
                        The URL that will be called when the remote dataset run is
                        triggered.
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
                        Set a default config that will be sent to the remote dataset
                        run URL. This can be modified before starting a new run.
                        View docs for more details.
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
