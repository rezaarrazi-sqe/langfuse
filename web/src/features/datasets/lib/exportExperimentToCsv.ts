import type { EnrichedDatasetRunItem } from "@langfuse/shared/src/server";

export function exportExperimentToCsv(
  runItems: EnrichedDatasetRunItem[],
  runName: string,
): string {
  if (runItems.length === 0) {
    return "";
  }

  const escapeCsvValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "";
    }
    
    // Handle objects and arrays by stringifying them
    if (typeof value === "object") {
      try {
        value = JSON.stringify(value);
      } catch {
        value = String(value);
      }
    } else {
      value = String(value);
    }
    
    const stringValue = String(value);
    if (
      stringValue.includes(",") ||
      stringValue.includes('"') ||
      stringValue.includes("\n")
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const formatJsonValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "";
    }
    
    // Format as compact JSON
    try {
      let parsed: any;
      
      // If it's already a string, try to parse it first
      if (typeof value === "string") {
        // Remove any existing escaping first
        let cleanValue = value;
        // If it's a string that looks like JSON, try to parse it
        try {
          parsed = JSON.parse(cleanValue);
        } catch {
          // If parsing fails, it's not JSON, return as is
          return value;
        }
      } else {
        // If it's already an object/array, use it directly
        parsed = value;
      }
      
      // Stringify as compact JSON (single line)
      // This produces clean JSON string
      return JSON.stringify(parsed);
    } catch {
      // Fallback to string conversion
      return String(value);
    }
  };

  // Define base CSV headers - include IO columns and metadata
  const baseHeaders = [
    "Dataset Item ID",
    "Run At",
    "Trace ID",
    "Observation ID",
    "Input",
    "Expected Output",
    "Trace Output",
    "Metadata",
    "Latency (s)",
    "Total Cost",
    "Error",
  ];

  // Collect all unique score names for dynamic columns
  const scoreNames = new Set<string>();
  runItems.forEach((item) => {
    if (item.scores) {
      Object.keys(item.scores).forEach((scoreName) => {
        scoreNames.add(scoreName);
      });
    }
  });

  // Add score columns to headers
  const scoreHeaders = Array.from(scoreNames)
    .sort()
    .map((name) => `Score: ${name}`);
  const allHeaders = [...baseHeaders, ...scoreHeaders];

  // Build CSV rows
  const rows = runItems.map((item) => {
    const latency =
      item.observation?.latency ?? item.trace?.duration ?? undefined;
    const totalCost = item.observation?.calculatedTotalCost
      ? item.observation.calculatedTotalCost.toNumber()
      : item.trace?.totalCost ?? undefined;

    // Extract IO data and metadata from enriched item (these are added by the export endpoint)
    const enrichedItem = item as EnrichedDatasetRunItem & {
      datasetItemInput?: unknown;
      datasetItemExpectedOutput?: unknown;
      traceOutput?: unknown;
      traceMetadata?: unknown;
    };

    // Format IO fields and metadata as JSON strings (already formatted, don't escape again)
    const formattedInput = formatJsonValue(enrichedItem.datasetItemInput);
    const formattedExpectedOutput = formatJsonValue(enrichedItem.datasetItemExpectedOutput);
    const formattedTraceOutput = formatJsonValue(enrichedItem.traceOutput);
    const formattedTraceMetadata = formatJsonValue(enrichedItem.traceMetadata);

    // For JSON fields, we need to escape them properly for CSV
    // JSON strings contain quotes, so we need to double them for CSV format
    const escapeJsonForCsv = (jsonString: string): string => {
      if (!jsonString) return "";
      // JSON strings will always contain quotes, so wrap in quotes and double internal quotes
      return `"${jsonString.replace(/"/g, '""')}"`;
    };

    const row: Record<string, string> = {
      "Dataset Item ID": item.datasetItemId,
      "Run At": item.createdAt ? new Date(item.createdAt).toISOString() : "",
      "Trace ID": item.trace?.id || "",
      "Observation ID": item.observation?.id || "",
      "Input": escapeJsonForCsv(formattedInput),
      "Expected Output": escapeJsonForCsv(formattedExpectedOutput),
      "Trace Output": escapeJsonForCsv(formattedTraceOutput),
      "Metadata": escapeJsonForCsv(formattedTraceMetadata),
      "Latency (s)": latency !== undefined ? String(latency) : "",
      "Total Cost": totalCost !== undefined ? String(totalCost) : "",
      "Error": "", // Error field - would need to be added if available
    };

    // Add score values
    scoreNames.forEach((scoreName) => {
      const scoreData = item.scores?.[scoreName];
      if (scoreData !== undefined && scoreData !== null) {
        // Handle score aggregates - extract the appropriate value based on type
        if (typeof scoreData === "object") {
          if (scoreData.type === "NUMERIC" && "average" in scoreData) {
            row[`Score: ${scoreName}`] = String(scoreData.average ?? "");
          } else if (scoreData.type === "CATEGORICAL" && "valueCounts" in scoreData) {
            // For categorical, use the most common value
            const mostCommon = scoreData.valueCounts?.[0];
            row[`Score: ${scoreName}`] = mostCommon ? String(mostCommon.value) : "";
          } else {
            row[`Score: ${scoreName}`] = "";
          }
        } else {
          row[`Score: ${scoreName}`] = String(scoreData);
        }
      } else {
        row[`Score: ${scoreName}`] = "";
      }
    });

    return row;
  });

  // Build CSV content
  // Note: JSON fields (Input, Expected Output, Trace Output, metadata fields) are already escaped,
  // so we don't need to escape them again
  const jsonFields = new Set([
    "Input",
    "Expected Output",
    "Trace Output",
    "Metadata",
  ]);
  const csvRows = [
    allHeaders.map(escapeCsvValue).join(","),
    ...rows.map((row) =>
      allHeaders.map((header) => {
        const value = row[header] || "";
        // JSON fields are already properly escaped, use them as-is
        if (jsonFields.has(header)) {
          return value;
        }
        // Other fields need CSV escaping
        return escapeCsvValue(value);
      }).join(",")
    ),
  ];

  return csvRows.join("\n");
}

export function downloadCsv(csvContent: string, fileName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
