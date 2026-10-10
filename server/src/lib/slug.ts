import crypto from "node:crypto";

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

/** Append a short random suffix to make a taken slug unique: "acme" -> "acme-3fa9". */
export function withSuffix(slug: string): string {
  return `${slug.slice(0, 48)}-${crypto.randomBytes(2).toString("hex")}`;
}
