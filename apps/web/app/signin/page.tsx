import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import AuthForm from "@/features/AuthForm";
export default async function SignInPage() {
  const session=await auth.api.getSession({headers:await headers()});
  if(session) redirect("/");
  return <main className="auth-page"><div className="auth-card">
    <p className="eyebrow">OPEN SOURCE · AI MOCK INTERVIEW</p>
    <h1>Interview Simulation</h1>
    <p>Sign in to create an interview from your job description and CV.</p>
    <AuthForm/>
    <p className="muted small">Your self-hosted account stores scenarios and transcripts. AI planning requires a configured model; speech is optional.</p>
  </div></main>;
}
