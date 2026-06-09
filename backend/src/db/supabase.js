import crypto from "crypto";

class SupabaseRestError extends Error {
  constructor({ status, message, payload }) {
    super(message);
    this.name = "SupabaseRestError";
    this.status = status;
    this.payload = payload;
  }
}

const getSupabaseEnv = () => {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) {
    throw new SupabaseRestError({
      status: 500,
      message: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured",
      payload: null,
    });
  }
  return { url, serviceKey };
};

const getRestBaseUrl = () => {
  const { url } = getSupabaseEnv();
  return new URL("/rest/v1/", url);
};

const buildHeaders = ({ extra = {}, prefer = null, includeCount = false } = {}) => {
  const { serviceKey } = getSupabaseEnv();
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra,
  };

  const preferParts = [];
  if (prefer) {
    preferParts.push(prefer);
  }
  if (includeCount) {
    preferParts.push("count=exact");
  }
  if (preferParts.length > 0) {
    headers.Prefer = preferParts.join(", ");
  }

  return headers;
};

const parseJsonSafely = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseContentRangeTotal = (contentRange) => {
  if (!contentRange) return null;
  const raw = String(contentRange);
  const slashIndex = raw.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const totalPart = raw.slice(slashIndex + 1).trim();
  const total = Number(totalPart);
  return Number.isFinite(total) ? total : null;
};

const restRequest = async ({ method, table, query = {}, body, headers = {}, prefer, includeCount = false }) => {
  const base = getRestBaseUrl();
  const url = new URL(table, base);
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.append(key, String(value));
  });

  url.search = params.toString();

  const isBodyAllowed = ["POST", "PUT", "PATCH", "DELETE"].includes(String(method).toUpperCase());
  const requestHeaders = buildHeaders({
    extra: {
      Accept: "application/json",
      ...(isBodyAllowed ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    prefer,
    includeCount,
  });

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: isBodyAllowed && body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  if (!response.ok) {
    const payload = parseJsonSafely(raw) || raw;
    const message =
      (typeof payload === "object" && payload ? payload.message : null) ||
      `Supabase request failed (${response.status})`;
    throw new SupabaseRestError({ status: response.status, message, payload });
  }

  const data = parseJsonSafely(raw);
  const total = includeCount ? parseContentRangeTotal(response.headers.get("content-range")) : null;
  return { data, total, headers: response.headers };
};

const encodeOrFilter = (filters = []) => {
  if (!Array.isArray(filters) || filters.length === 0) return "";
  const parts = filters
    .map((item) => {
      const column = item?.column;
      const operator = item?.operator || "eq";
      const value = item?.value;
      if (!column) return "";
      if (operator === "is") {
        return `${column}.is.${value === null ? "null" : value}`;
      }
      return `${column}.${operator}.${String(value)}`;
    })
    .filter(Boolean);

  if (parts.length === 0) return "";
  return `(${parts.join(",")})`;
};

const applyFiltersToQuery = ({ query, filters = [] }) => {
  const normalized = Array.isArray(filters) ? filters : [];
  normalized.forEach((filter) => {
    const column = filter?.column;
    const operator = filter?.operator || "eq";
    const value = filter?.value;
    if (!column) return;

    if (operator === "is") {
      query[column] = `is.${value === null ? "null" : value}`;
      return;
    }

    if (operator === "in") {
      const list = Array.isArray(value) ? value : [];
      const inner = list.map((item) => String(item).replace(/,/g, "")).join(",");
      query[column] = `in.(${inner})`;
      return;
    }

    query[column] = `${operator}.${String(value)}`;
  });
};

const createId = () => crypto.randomUUID();

const supabase = {
  createId,
  restRequest,
  async select(table, { select = "*", filters = [], or = [], orderBy, limit, offset, count = false } = {}) {
    const query = { select };
    applyFiltersToQuery({ query, filters });
    const orValue = encodeOrFilter(or);
    if (orValue) {
      query.or = orValue;
    }
    if (orderBy) {
      query.order = orderBy;
    }
    if (Number.isFinite(limit)) {
      query.limit = String(limit);
    }
    if (Number.isFinite(offset)) {
      query.offset = String(offset);
    }

    const response = await restRequest({
      method: "GET",
      table,
      query,
      includeCount: Boolean(count),
    });
    return { rows: Array.isArray(response.data) ? response.data : [], total: response.total };
  },
  async insert(table, rows, { returning = true } = {}) {
    const body = Array.isArray(rows) ? rows : [rows];
    const response = await restRequest({
      method: "POST",
      table,
      query: {},
      body,
      prefer: returning ? "return=representation" : "return=minimal",
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  async upsert(table, rows, { onConflict, returning = true } = {}) {
    const body = Array.isArray(rows) ? rows : [rows];
    const query = {};
    if (onConflict) {
      query.on_conflict = onConflict;
    }
    const response = await restRequest({
      method: "POST",
      table,
      query,
      body,
      prefer: `resolution=merge-duplicates, ${returning ? "return=representation" : "return=minimal"}`,
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  async update(table, values, { filters = [], returning = true } = {}) {
    const query = {};
    applyFiltersToQuery({ query, filters });
    const response = await restRequest({
      method: "PATCH",
      table,
      query,
      body: values,
      prefer: returning ? "return=representation" : "return=minimal",
    });
    return Array.isArray(response.data) ? response.data : [];
  },
  SupabaseRestError,
};

export default supabase;
export { SupabaseRestError };

