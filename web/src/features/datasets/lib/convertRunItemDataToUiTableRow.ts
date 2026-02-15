import { usdFormatter } from "@/src/utils/numbers";
import {
  type DatasetRunItemByRunRowData,
  type DatasetRunItemByItemRowData,
} from "./types";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { isPresent } from "@langfuse/shared";

export const convertRunItemToItemsByItemUiTableRow = (
  item: EnrichedDatasetRunItem,
): DatasetRunItemByItemRowData => {
  // Token usage: priority observation > trace (matches cost pattern exactly)
  const totalUsage =
    item.observation?.totalUsage ?? item.trace?.totalUsage ?? 0;
  const inputUsage = item.observation?.inputUsage ?? item.trace?.inputUsage ?? 0;
  const outputUsage =
    item.observation?.outputUsage ?? item.trace?.outputUsage ?? 0;

  return {
    id: item.id,
    runAt: item.createdAt,
    datasetRunName: item.datasetRunName,
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: isPresent(item.observation?.calculatedTotalCost)
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : isPresent(item.trace?.totalCost)
        ? usdFormatter(item.trace.totalCost)
        : undefined,
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
    totalUsage: totalUsage > 0 ? totalUsage.toLocaleString() : undefined,
    usageDetails:
      totalUsage > 0
        ? {
            input: inputUsage,
            output: outputUsage,
            total: totalUsage,
          }
        : undefined,
  };
};

export const convertRunItemToItemsByRunUiTableRow = (
  item: EnrichedDatasetRunItem,
): DatasetRunItemByRunRowData => {
  // Token usage: priority observation > trace (matches cost pattern exactly)
  const totalUsage =
    item.observation?.totalUsage ?? item.trace?.totalUsage ?? 0;
  const inputUsage = item.observation?.inputUsage ?? item.trace?.inputUsage ?? 0;
  const outputUsage =
    item.observation?.outputUsage ?? item.trace?.outputUsage ?? 0;

  return {
    id: item.id,
    runAt: item.createdAt,
    datasetItemId: item.datasetItemId,
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: isPresent(item.observation?.calculatedTotalCost)
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : isPresent(item.trace?.totalCost)
        ? usdFormatter(item.trace.totalCost)
        : undefined,
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
    totalUsage: totalUsage > 0 ? totalUsage.toLocaleString() : undefined,
    usageDetails:
      totalUsage > 0
        ? {
            input: inputUsage,
            output: outputUsage,
            total: totalUsage,
          }
        : undefined,
  };
};
