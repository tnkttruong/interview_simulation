import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import ScenarioDetail from "@/features/ScenarioDetail";

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  const { id } = await params;
  return <ScenarioDetail scenarioId={id} userEmail={session.user.email} />;
}
