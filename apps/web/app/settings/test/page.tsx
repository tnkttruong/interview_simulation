import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import ProviderTestPanel from "@/features/ProviderTestPanel";

export default async function ProviderTestPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  return <ProviderTestPanel email={session.user.email} />;
}
