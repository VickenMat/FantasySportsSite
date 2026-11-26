import { redirect } from "next/navigation";

export default async function LegacyPlayersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const query = await searchParams; const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value ? [value] : []) values.append(key, item);
  redirect(`/leagues/${id}/waivers?${values}`);
}
