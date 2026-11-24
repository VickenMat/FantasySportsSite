import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createTransport } from "nodemailer";
import { accountNameSchema, maxPasswordLength, minPasswordLength } from "./auth-validation";
import { getDatabase } from "./db";
import { clientIdentity, enforceRateLimit, RateLimitError } from "@/server/rate-limit";

export function trustedAuthOrigins(authUrl: string) {
  const configured = new URL(authUrl);
  const isLoopback = configured.hostname === "localhost" || configured.hostname === "127.0.0.1";
  if (!isLoopback) return [configured.origin];
  const port = configured.port ? `:${configured.port}` : "";
  return [...new Set([
    configured.origin,
    `${configured.protocol}//localhost${port}`,
    `${configured.protocol}//127.0.0.1${port}`,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])];
}

function createAuth() {
  const { AUTH_SECRET, AUTH_URL, SMTP_URL, MAIL_FROM } = process.env;
  if (!AUTH_SECRET || !AUTH_URL) throw new Error("AUTH_SECRET and AUTH_URL are required.");

  const mail = SMTP_URL && MAIL_FROM
    ? createTransport({ url: SMTP_URL, connectionTimeout: 10_000, socketTimeout: 15_000 })
    : undefined;

  return betterAuth({
    appName: "Fantasy Evolution",
    baseURL: AUTH_URL,
    trustedOrigins: trustedAuthOrigins(AUTH_URL),
    secret: AUTH_SECRET,
    database: prismaAdapter(getDatabase(), { provider: "postgresql", transaction: true }),
    advanced: { database: { generateId: "uuid" } },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength,
      maxPasswordLength,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: mail
        ? async ({ user, url }) => {
            void mail.sendMail({
              from: MAIL_FROM,
              to: user.email,
              subject: "Reset your Fantasy Evolution password",
              text: `Use this link within 30 minutes to reset your password:\n\n${url}`,
            }).catch(() => console.error("Password reset email delivery failed"));
          }
        : undefined,
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (["/sign-in/email", "/forget-password"].includes(context.path)) {
          try {
            await enforceRateLimit(clientIdentity(context.headers ?? new Headers()), `auth${context.path}`, 10, 15 * 60_000);
          } catch (error) {
            if (error instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: error.message });
            throw error;
          }
        }
        if (context.path !== "/sign-up/email") return;
        const name = accountNameSchema.safeParse(context.body?.name);
        if (!name.success) {
          throw new APIError("BAD_REQUEST", { message: "Enter a name between 1 and 80 characters." });
        }
        return { context: { ...context, body: { ...context.body, name: name.data } } };
      }),
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();
  return auth;
}

export async function requireSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session;
}
