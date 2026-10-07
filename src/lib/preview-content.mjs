export const LOCALES = ["zh-CN", "zh-TW", "en"];
export const RESOURCES = ["articles", "events", "communities", "members"];

// Public display data only. Never include account details from nested users.
export function sanitizePublicRecord(value) {
  if (Array.isArray(value)) return value.map(sanitizePublicRecord);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      /email|password|token|secret|permissions?|roles?|phone|DeletedAt/i.test(
        key,
      )
    )
      continue;
    if (key === "user" || key === "publisher") {
      result[key] = child
        ? Object.fromEntries(
            ["ID", "username", "avatar", "github"]
              .filter((k) => k in child)
              .map((k) => [k, child[k]]),
          )
        : null;
    } else result[key] = sanitizePublicRecord(child);
  }
  return result;
}

const rootID = (record) => record.translation_of || record.ID;
const positiveInt = (value, fallback, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

export function resolvePreviewResponse(snapshot, path, query = {}) {
  const [resource, id, child] = path;
  if (
    !RESOURCES.includes(resource) ||
    path.length > 3 ||
    (child && (resource !== "events" || child !== "venues"))
  )
    return { code: 404, message: "Not available in this preview" };
  const locale = LOCALES.includes(query.locale) ? query.locale : "en";
  let records = [...(snapshot.content[locale]?.[resource] || [])];
  if (id) {
    if (!/^\d+$/.test(id)) return { code: 404, message: "Not found" };
    const original = LOCALES.flatMap(
      (l) => snapshot.content[l]?.[resource] || [],
    ).find((r) => r.ID === Number(id));
    const record =
      original && records.find((r) => rootID(r) === rootID(original));
    if (!record) return { code: 404, message: "Not found" };
    if (child)
      return {
        code: 200,
        message: "Read-only preview",
        data: snapshot.venues[String(record.ID)] || [],
      };
    if (resource === "communities")
      return {
        code: 200,
        message: "Read-only preview",
        data: {
          ...record,
          members: snapshot.content[locale].members.filter(
            (r) => r.community_id === record.ID,
          ),
          events: snapshot.content[locale].events.filter(
            (r) => r.community_id === record.ID,
          ),
        },
      };
    return { code: 200, message: "Read-only preview", data: record };
  }
  if (query.keyword) {
    const keyword = query.keyword.toLowerCase();
    records = records.filter((r) =>
      [r.title, r.description, r.city, r.intro, r.name].some((v) =>
        v?.toLowerCase().includes(keyword),
      ),
    );
  }
  for (const key of [
    "category",
    "event_mode",
    "event_type",
    "community_id",
    "status",
  ]) {
    if (query[key] && query[key] !== "0")
      records = records.filter((r) => String(r[key]) === query[key]);
  }
  for (const key of ["city", "location", "author"])
    if (query[key])
      records = records.filter((r) =>
        r[key]?.toLowerCase().includes(query[key].toLowerCase()),
      );
  if (query.tag) records = records.filter((r) => r.tags?.includes(query.tag));
  if (query.start_date)
    records = records.filter(
      (r) => r.start_time?.slice(0, 10) >= query.start_date,
    );
  if (query.end_date)
    records = records.filter(
      (r) => r.start_time?.slice(0, 10) <= query.end_date,
    );
  records.sort((a, b) => {
    const key = query.order_by || "publish_time";
    const comparison = String(a[key] || a.CreatedAt || "").localeCompare(
      String(b[key] || b.CreatedAt || ""),
    );
    return query.order === "asc" ? comparison : -comparison;
  });
  const page = positiveInt(query.page, 1, 100000);
  const page_size = positiveInt(query.page_size, 6, 100);
  return {
    code: 200,
    message: "Read-only preview",
    data: {
      [resource]: records.slice((page - 1) * page_size, page * page_size),
      total: records.length,
      page,
      page_size,
    },
  };
}
