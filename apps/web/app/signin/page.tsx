import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import AuthForm from "@/features/AuthForm";
export default async function SignInPage() {
  const session=await auth.api.getSession({headers:await headers()});
  if(session) redirect("/");
  return <main className="auth-page"><div className="auth-card">
    <p className="eyebrow">OPEN SOURCE · DEMO MODE</p>
    <h1>Interview Simulation</h1>
    <p>Sign in or create a local account to try the offline interview demo.</p>
    <AuthForm/>
    <p className="muted small">Your practice sessions live in your self-hosted SQLite database. No Azure or LLM requests are sent in P0.</p>
  </div></main>;
}
