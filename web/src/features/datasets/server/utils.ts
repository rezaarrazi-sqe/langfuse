import { type DatasetRunItemDomain } from "@langfuse/shared";
import {
  calculateRecursiveCost,
  calculateRecursiveTokenUsage,
} from "../lib/costCalculations";
import { type ObservationTuple } from "@langfuse/shared/src/server";

// Helpers to extract fields from ObservationTuple
const getObservationId = (obs: ObservationTuple) => obs[0];
const getLatencyMs = (obs: ObservationTuple) => obs[5];
const toCostInput = (obs: ObservationTuple) => ({
  id: obs[0],
  parentObservationId: obs[1],
  totalCost: obs[2],
  inputCost: obs[3],
  outputCost: obs[4],
});
const toTokenUsageInput = (obs: ObservationTuple) => ({
  id: obs[0],
  parentObservationId: obs[1],
  inputUsage: obs[6],
  outputUsage: obs[7],
  totalUsage: obs[8],
});

/**
 * Calculate recursive metrics (cost, latency, and token usage) for dataset run items
 *
 * This function processes observations grouped by trace and calculates:
 * - Recursive total cost for each observation (includes children)
 * - Latency for each observation
 * - Recursive token usage for each observation (includes children)
 *
 * @param runItems - Dataset run items to calculate metrics for
 * @param observationsByTraceId - Map of trace IDs to their observations (from getObservationsGroupedByTraceId)
 * @returns Array of metrics with id, totalCost, latency, and token usage for each run item
 */
export const calculateRecursiveMetricsForRunItems = <
  WithIO extends boolean = true,
>(
  runItems: DatasetRunItemDomain<WithIO>[],
  observationsByTraceId: Map<string, ObservationTuple[]>,
): Array<{
  id: string;
  totalCost: number;
  latency: number;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
}> => {
  const calculatedCosts = new Map<string, number>();
  const latencies = new Map<string, number>();
  const tokenUsages = new Map<
    string,
    { input: number; output: number; total: number }
  >();

  const observationLevelRunItems = runItems.filter((ri) => !!ri.observationId);

  for (const runItem of observationLevelRunItems) {
    const observations = observationsByTraceId.get(runItem.traceId);
    if (observations?.length) {
      const observationId = runItem.observationId!;

      // Find target observation and extract latency
      const targetObs = observations.find(
        (obs) => getObservationId(obs) === observationId,
      );
      if (targetObs) {
        latencies.set(observationId, Number(getLatencyMs(targetObs)) / 1000);
      }

      // Calculate recursive cost
      const cost = calculateRecursiveCost(
        observationId,
        observations.map(toCostInput),
      );
      calculatedCosts.set(observationId, cost?.toNumber() ?? 0);

      // Calculate recursive token usage
      const tokenUsage = calculateRecursiveTokenUsage(
        observationId,
        observations.map(toTokenUsageInput),
      );
      tokenUsages.set(observationId, tokenUsage);
    }
  }

  return observationLevelRunItems.map((r) => ({
    id: r.observationId!,
    totalCost: calculatedCosts.get(r.observationId!) ?? 0,
    latency: latencies.get(r.observationId!) ?? 0,
    inputUsage: tokenUsages.get(r.observationId!)?.input ?? 0,
    outputUsage: tokenUsages.get(r.observationId!)?.output ?? 0,
    totalUsage: tokenUsages.get(r.observationId!)?.total ?? 0,
  }));
};
