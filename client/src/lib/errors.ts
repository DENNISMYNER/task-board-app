import { ApiError } from "./api";

/** Turns anything thrown into a sentence fit for a toast or inline message. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ApiError) {
    const fields = Object.entries(err.fieldErrors);
    const first = fields[0];
    if (first) return `${first[0]}: ${first[1]}`;
    return err.message;
  }
  return fallback;
}
