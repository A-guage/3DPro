import { warn } from "./logger.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildSummaryText(toolName: string, payload: unknown): string {
  if (typeof payload === "string") {
    const normalized = payload.trim();
    return normalized || `${toolName} responded`;
  }

  if (
    typeof payload === "number" ||
    typeof payload === "bigint" ||
    typeof payload === "boolean"
  ) {
    return `${toolName} responded: ${payload}`;
  }

  if (!isRecord(payload)) {
    return `${toolName} responded`;
  }

  const effectivePayload: Record<string, unknown> = { ...(payload as object) };

  const flattenWrappers = (
    obj: Record<string, unknown>,
    depth = 0
  ): void => {
    if (depth > 5) return;
    if (isRecord(obj.data)) {
      Object.assign(obj, obj.data);
      delete obj.data;
      flattenWrappers(obj, depth + 1);
    }
    if (isRecord(obj.result)) {
      Object.assign(obj, obj.result);
      delete obj.result;
      flattenWrappers(obj, depth + 1);
    }
  };
  flattenWrappers(effectivePayload);

  const parts: string[] = [];
  const addedKeys = new Set<string>();
  const skipKeys = new Set(["requestId", "type", "data", "result", "warnings"]);

  const scalarToText = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    )
      return String(value);
    return undefined;
  };

  const formatNestedValue = (value: unknown): string => {
    const scalar = scalarToText(value);
    if (scalar !== undefined) return scalar;
    if (Array.isArray(value))
      return `${value.length} item${value.length === 1 ? "" : "s"}`;
    if (isRecord(value)) return "{...}";
    if (value === null) return "null";
    return String(value);
  };

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string")
      return val.length > 150 ? val.slice(0, 150) + "..." : val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);

    if (Array.isArray(val)) {
      if (val.length === 0) return "[] (0)";
      const items = val.slice(0, 30).map((v) => {
        if (isRecord(v)) {
          for (const key of [
            "name",
            "label",
            "path",
            "id",
            "object_id",
            "scene_id",
            "asset_id",
          ]) {
            const value = scalarToText(v[key]);
            if (value !== undefined && value.trim() !== "") return value;
          }
          const entries = Object.entries(v)
            .filter(([, value]) => value !== undefined && value !== null)
            .slice(0, 4);
          if (entries.length === 0) return "{}";
          return `{ ${entries.map(([k, value]) => `${k}=${formatNestedValue(value)}`).join(", ")} }`;
        }
        return String(v);
      });
      const suffix =
        val.length > 30 ? `, ... (+${val.length - 30} more)` : "";
      return `[${items.join(", ")}${suffix}] (${val.length})`;
    }

    if (isRecord(val)) {
      const keys = Object.keys(val);
      if (keys.some((k) => ["x", "y", "z", "pitch", "yaw", "roll"].includes(k))) {
        const x = val.x ?? val.pitch ?? 0;
        const y = val.y ?? val.yaw ?? 0;
        const z = val.z ?? val.roll ?? 0;
        return `[${x}, ${y}, ${z}]`;
      }
      const entries = Object.entries(val).slice(0, 8);
      const formatted = entries.map(([k, v]) => {
        const vStr = formatNestedValue(v);
        return `${k}=${vStr}`;
      });
      return `{ ${formatted.join(", ")}${keys.length > 8 ? " ..." : ""} }`;
    }

    return String(val);
  };

  for (const key of ["success", "error"]) {
    if (effectivePayload[key] !== undefined && !addedKeys.has(key)) {
      const formatted = formatValue(effectivePayload[key]);
      if (formatted) {
        parts.push(`${key}: ${formatted}`);
        addedKeys.add(key);
      }
    }
  }

  let hasArrays = false;
  for (const [key, val] of Object.entries(effectivePayload)) {
    if (addedKeys.has(key)) continue;
    if (skipKeys.has(key)) continue;
    if (val === undefined || val === null) continue;
    if (typeof val === "string" && val.trim() === "") continue;
    if (key === "message") continue;

    if (Array.isArray(val) && val.length > 0) hasArrays = true;
    if ((key === "count" || key === "totalCount") && hasArrays) continue;

    const formatted = formatValue(val);
    if (formatted) {
      parts.push(`${key}: ${formatted}`);
      addedKeys.add(key);
    }
  }

  const message =
    typeof effectivePayload.message === "string"
      ? effectivePayload.message.replace(/\s+/g, " ").trim()
      : "";
  if (message && message.toLowerCase() !== "success") {
    const isDuplicateInfo =
      /^(found|listed|retrieved|got|loaded|created|deleted|saved|spawned)\s+\d+/i.test(
        message
      ) ||
      /Folders:\s*\[/.test(message) ||
      /\d+\s+(assets?|folders?|items?|actors?|components?)\s+(and|in|at)/i.test(
        message
      );
    const messageInParts = parts.some((p) =>
      p.toLowerCase().includes(message.toLowerCase().slice(0, 30))
    );

    if (!isDuplicateInfo && !messageInParts) {
      parts.push(message);
    }
  }

  const warnings = Array.isArray(effectivePayload.warnings)
    ? effectivePayload.warnings
    : [];
  if (warnings.length > 0) {
    parts.push(
      `Warnings: ${warnings.map((w: unknown) => (typeof w === "string" ? w : JSON.stringify(w))).join("; ")}`
    );
  }

  return parts.length > 0 ? parts.join(" | ") : `${toolName} responded`;
}

export function wrapResponse(
  toolName: string,
  response: unknown
): Record<string, unknown> {
  let safeResponse = response;
  try {
    if (response && typeof response === "object") {
      JSON.stringify(response);
    }
  } catch {
    warn("response-wrapper", `Response for ${toolName} contains circular references`);
    safeResponse = response;
  }

  const responseObj = safeResponse as Record<string, unknown> | null;
  const alreadyMcpShaped =
    responseObj &&
    typeof responseObj === "object" &&
    Array.isArray(responseObj.content);

  if (alreadyMcpShaped && responseObj) {
    let structuredContent: unknown = undefined;

    const textContent = (responseObj.content as unknown[]).find(
      (c: unknown) => {
        const cObj = c as Record<string, unknown> | null;
        return cObj?.type === "text";
      }
    ) as Record<string, unknown> | undefined;

    if (textContent?.text) {
      const rawText = String(textContent.text);
      const trimmed = rawText.trim();
      const looksLikeJson =
        trimmed.startsWith("{") || trimmed.startsWith("[");
      if (looksLikeJson) {
        try {
          structuredContent = JSON.parse(rawText);
        } catch {
          structuredContent = undefined;
        }
      }
    }

    if (
      structuredContent !== undefined &&
      responseObj.structuredContent === undefined
    ) {
      responseObj.structuredContent = structuredContent;
    }

    try {
      const sc =
        (responseObj.structuredContent || structuredContent || {}) as Record<
          string,
          unknown
        >;
      const hasExplicitFailure =
        (typeof sc.success === "boolean" && sc.success === false) ||
        (typeof sc.error === "string" && sc.error.length > 0);
      if (hasExplicitFailure && responseObj.isError !== true) {
        responseObj.isError = true;
      }
    } catch {
      /* ignore */
    }

    return responseObj;
  }

  const text = buildSummaryText(toolName, safeResponse);

  const wrapped: Record<string, unknown> = {
    content: [{ type: "text", text }],
  };

  try {
    const safeResponseObj = safeResponse as Record<string, unknown> | null;
    if (safeResponseObj && typeof safeResponseObj.success === "boolean") {
      wrapped.success = Boolean(safeResponseObj.success);
    }
  } catch {
    /* ignore */
  }

  if (safeResponse !== undefined) {
    wrapped.structuredContent = safeResponse;
  }

  try {
    const sc = (wrapped.structuredContent || {}) as Record<string, unknown>;
    const hasExplicitFailure =
      (typeof sc.success === "boolean" && sc.success === false) ||
      (typeof sc.error === "string" && sc.error.length > 0);
    if (hasExplicitFailure) {
      wrapped.isError = true;
    }
  } catch {
    /* ignore */
  }

  try {
    const s = wrapped.success;
    if (typeof s === "boolean" && s === false) {
      wrapped.isError = true;
    }
  } catch {
    /* ignore */
  }

  return wrapped;
}
