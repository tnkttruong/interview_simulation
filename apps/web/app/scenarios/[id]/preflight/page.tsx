import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import ScenarioPreflight from "@/features/ScenarioPreflight";

export default async function ScenarioPreflightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  const { id } = await params;
  return <ScenarioPreflight scenarioId={id} userEmail={session.user.email} />;
}
