"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth, requireSession } from "@/lib/auth";
import { accountNameSchema, maxPasswordLength, minPasswordLength } from "@/lib/auth-validation";
import { getDatabase } from "@/lib/db";
import { actionNotice } from "@/lib/action-notice";

export async function updateAccountAction(form: FormData) {
  await requireSession();
  const name = accountNameSchema.parse(form.get("name"));
  await getAuth().api.updateUser({ headers: await headers(), body: { name } });
  await actionNotice("Account profile updated.");
  revalidatePath("/account");
}

export async function changePasswordAction(form: FormData) {
  await requireSession();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  if (newPassword.length < minPasswordLength || newPassword.length > maxPasswordLength) throw new Error(`Password must contain ${minPasswordLength} to ${maxPasswordLength} characters.`);
  await getAuth().api.changePassword({ headers: await headers(), body: { currentPassword, newPassword, revokeOtherSessions: true } });
  await actionNotice("Password changed. Other sessions were signed out.");
  revalidatePath("/account");
}

export async function deleteAccountAction(form: FormData) {
  const { user } = await requireSession();
  if (form.get("confirm") !== "on" || String(form.get("confirmation")) !== "DELETE") throw new Error("Confirm account deletion by entering DELETE and selecting the confirmation checkbox.");
  await getAuth().api.verifyPassword({ headers: await headers(), body: { password: String(form.get("password") ?? "") } });
  const database = getDatabase();
  const activeCommissioner = await database.leagueMember.findFirst({ where: {
    userId: user.id, role: "COMMISSIONER", league: { status: { not: "COMPLETE" } },
  }, include: { league: true } });
  if (activeCommissioner) throw new Error(`Transfer or resolve commissioner ownership for ${activeCommissioner.league.name} before deleting this account.`);
  const suffix = randomUUID();
  await database.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: {
      name: "Deleted user", email: `deleted-${suffix}@invalid.local`, emailVerified: false, image: null,
    } });
  }, { isolationLevel: "Serializable" });
  redirect("/sign-in?deleted=1");
}
