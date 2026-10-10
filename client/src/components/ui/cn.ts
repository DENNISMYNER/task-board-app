/** Join class names, skipping falsy values. (Tiny stand-in for the `clsx` package.) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
