import { z } from "zod";
import { emailField } from "../../common/schemas";

export const registerSchema = z.object({
  email: emailField,
  // Length matters more than composition rules (NIST 800-63B). 128 max avoids hashing abuse.
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  name: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
