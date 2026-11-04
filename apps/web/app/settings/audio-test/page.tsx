import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import DualAudioTest from "@/features/DualAudioTest";

export default async function AudioTestPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  return <DualAudioTest email={session.user.email} />;
}
