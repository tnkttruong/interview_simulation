import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import Workspace from "@/features/Workspace";
export default async function Home() {
  const session = await auth.api.getSession({ headers:await headers() });
  if (!session) redirect("/signin");
  return <Workspace userEmail={session.user.email}/>;
}
