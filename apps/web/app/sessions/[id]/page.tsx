import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import SessionDetail from "@/features/SessionDetail";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  const { id } = await params;
  return <SessionDetail sessionId={id} userEmail={session.user.email} />;
}
