import { z } from "zod";

export const minPasswordLength = 12;
export const maxPasswordLength = 128;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z
  .string()
  .min(minPasswordLength, "Use at least 12 characters.")
  .max(maxPasswordLength, "Use at most 128 characters.");

export const accountNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Use at most 80 characters.");
