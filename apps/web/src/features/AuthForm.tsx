"use client";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";

const client=createAuthClient();
export default function AuthForm() {
  const [mode,setMode]=useState<"signin"|"signup">("signin");
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [password,setPassword]=useState("");
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");setPending(true);
    try {
      const result=mode==="signin"?
        await client.signIn.email({email,password}):
        await client.signUp.email({email,password,name});
      if(result.error) throw new Error(result.error.message||"Authentication failed");
      window.location.assign("/");
    }catch(e){setError(e instanceof Error?e.message:"Unable to sign in");}
    finally{setPending(false);}
  }
  return <form onSubmit={submit} className="auth-form">
    {mode==="signup"&&<label>Name<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={120}/></label>}
    <label>Email<input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    <label>Password<input type="password" autoComplete={mode==="signin"?"current-password":"new-password"}
      minLength={10} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="btn primary" type="submit" disabled={pending}>{pending?"Working…":mode==="signin"?"Sign in":"Create account"}</button>
    <button className="btn quiet" type="button" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");}}>
      {mode==="signin"?"New here? Create an account":"Already registered? Sign in"}
    </button>
  </form>;
}
