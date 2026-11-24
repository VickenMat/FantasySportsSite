"use server";

import { cookies } from "next/headers";

export async function actionNotice(message: string, type: "success" | "error" = "success") {
  (await cookies()).set("fantasy_notice", encodeURIComponent(JSON.stringify({ message, type })), {
    path: "/", maxAge: 120, sameSite: "strict", secure: process.env.NODE_ENV === "production", httpOnly: false,
  });
}
