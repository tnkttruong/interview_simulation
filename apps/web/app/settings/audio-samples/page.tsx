import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import SampleAudioPlayer from "@/features/SampleAudioPlayer";

export default async function AudioSamplesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  return <SampleAudioPlayer email={session.user.email} />;
}
