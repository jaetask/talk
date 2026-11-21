export type Source = { url: string; title: string; text: string };

export const domain = (url: string): string => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
};

const norm = (t: string): string =>
  t
    .replace(/[“”"'‘’]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

export function checked(text: string, sources: Source[]): string {
  const n = sources.length;
  text = text.replace(/\[(\d+)\]/g, (m, d: string) => (Number(d) >= 1 && Number(d) <= n ? m : ""));
  const corpus = norm(sources.map((s) => s.text).join(" "));
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) =>
      [...sentence.matchAll(/[“"]([^”"]{12,})[”"]/g)].every((q) => corpus.includes(norm(q[1]))),
    )
    .join(" ")
    .trim();
}

export function forSpeech(text: string, sources: Source[]): string {
  const cited = [
    ...new Set(
      [...text.matchAll(/\[(\d+)\]/g)]
        .map((m) => Number(m[1]))
        .filter((i) => i >= 1 && i <= sources.length),
    ),
  ].sort((a, b) => a - b);
  const use = cited.length ? cited : sources.map((_, i) => i + 1);
  const body = text.replace(/\s*\[\d+\]/g, "").trim();
  const sites: string[] = [];
  for (const i of use) {
    const d = domain(sources[i - 1].url);
    if (d && !sites.includes(d)) sites.push(d);
  }
  if (!sites.length) return body;
  return `${body} Sources: ${sites.length > 1 ? `${sites.slice(0, -1).join(", ")} and ${sites[sites.length - 1]}` : sites[0]}.`;
}

export function jsonIn(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
