"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { acceptAdvancedTrade, closeAdvancedTrade, configureTradeReview, proposeAdvancedTrade, tradeAssetsSchema } from "@/server/advanced-trades";

export async function saveAdvancedTrade(leagueId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    const assets = tradeAssetsSchema.parse(JSON.parse(String(form.get("assets"))));
    const participants = [...new Set(assets.flatMap((asset) => "to" in asset ? [asset.from, asset.to] : [asset.from]))];
    await proposeAdvancedTrade(user.id, { leagueId, assets, participants, expiresAt: new Date(Date.now() + Number(form.get("expiryHours")) * 3600000),
      proposalId: form.get("proposalId") ? String(form.get("proposalId")) : undefined, expectedRevision: form.get("revision") ? Number(form.get("revision")) : undefined });
    revalidatePath(`/leagues/${leagueId}/trades`);
  } catch (error) { return error instanceof Error ? error.message : "Proposal could not be saved."; }
  redirect(`/leagues/${leagueId}/trades?tab=outgoing`);
}
export async function advancedTradeResponse(leagueId: string, proposalId: string, revision: number, operation: "ACCEPT" | "CANCEL" | "VETO", _state: string, form: FormData) {
  const { user } = await requireSession();
  try {
    if (operation === "ACCEPT") await acceptAdvancedTrade(user.id, proposalId, revision);
    else await closeAdvancedTrade(user.id, proposalId, operation, String(form.get("reason")));
    revalidatePath(`/leagues/${leagueId}/trades`); return operation === "ACCEPT" ? "Acceptance recorded for this revision." : "Proposal closed with audit history preserved.";
  } catch (error) { return error instanceof Error ? error.message : "Response failed."; }
}
export async function tradeReviewAction(leagueId: string, _state: string, form: FormData) {
  const { user } = await requireSession();
  try { await configureTradeReview(user.id, leagueId, Number(form.get("reviewHours"))); revalidatePath(`/leagues/${leagueId}/trades`); return "Review period saved for future proposals."; }
  catch (error) { return error instanceof Error ? error.message : "Policy could not be saved."; }
}
