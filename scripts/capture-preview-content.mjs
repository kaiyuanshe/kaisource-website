import {
  LOCALES,
  RESOURCES,
  sanitizePublicRecord,
} from "../src/lib/preview-content.mjs";

// Intentionally only read public list endpoints. Article detail GETs increment
// production view counts, so they must not be used to capture a preview.
export async function capturePreviewContent() {
  const snapshot = {
    capturedAt: new Date().toISOString(),
    source: "https://kaiyuanshe.cn/v1",
    content: {},
    venues: {},
  };
  async function read(path) {
    const response = await fetch(`https://kaiyuanshe.cn/v1/${path}`, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Public content capture returned HTTP ${response.status}`,
      );
    const payload = await response.json();
    if (payload.code !== 200)
      throw new Error(`Public content capture failed: ${payload.message}`);
    return payload.data;
  }
  for (const locale of LOCALES) {
    snapshot.content[locale] = {};
    for (const resource of RESOURCES) {
      const records = [];
      for (let page = 1; page <= 100; page++) {
        const result = await read(
          `${resource}?publish_status=2&locale=${locale}&page=${page}&page_size=100`,
        );
        if (!Array.isArray(result[resource]))
          throw new Error(`Missing ${resource} list`);
        records.push(...result[resource]);
        if (records.length >= result.total || result[resource].length < 100)
          break;
        if (page === 100) throw new Error("Capture pagination limit exceeded");
      }
      snapshot.content[locale][resource] = sanitizePublicRecord(
        records.filter(
          (r) =>
            !["articles", "events"].includes(resource) ||
            r.publish_status === 2,
        ),
      );
    }
  }
  for (const event of Object.values(snapshot.content).flatMap(
    (c) => c.events,
  )) {
    if (String(event.ID) in snapshot.venues) continue;
    snapshot.venues[String(event.ID)] = sanitizePublicRecord(
      await read(`events/${event.ID}/venues`),
    );
  }
  return snapshot;
}
