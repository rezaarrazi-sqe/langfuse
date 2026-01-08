export interface RemoteExperimentEndpoint {
  value: string;
  label: string;
  description?: string;
}

// Default endpoints (fallback if env var not set)
const DEFAULT_ENDPOINTS: RemoteExperimentEndpoint[] = [
  {
    value: "/remote-experiment-extraction-analysis",
    label: "Extraction & Analysis",
    description: "For extraction and analysis experiments",
  },
  {
    value: "/remote-experiment-labelling",
    label: "Labelling",
    description: "For labelling experiments",
  },
];

/**
 * Get available remote experiment endpoints (server-side only).
 * Can be configured via LANGFUSE_REMOTE_EXPERIMENT_ENDPOINTS environment variable.
 *
 * Environment variable format (JSON):
 * [{"label": "Extraction & Analysis", "endpoint": "/remote-experiment-extraction-analysis", "description": "..."}]
 *
 * This function should only be called on the server side.
 */
export async function getRemoteExperimentEndpointsServer(): Promise<RemoteExperimentEndpoint[]> {
  // Dynamic import to ensure this only runs on server
  const { env } = await import("@/src/env.mjs");
  const configuredEndpoints = env.LANGFUSE_REMOTE_EXPERIMENT_ENDPOINTS;

  if (configuredEndpoints && configuredEndpoints.length > 0) {
    return configuredEndpoints.map((ep: { label: string; endpoint: string; description?: string }) => ({
      value: ep.endpoint,
      label: ep.label,
      description: ep.description,
    }));
  }

  return DEFAULT_ENDPOINTS;
}

// Export default endpoints for client-side fallback
export { DEFAULT_ENDPOINTS };
