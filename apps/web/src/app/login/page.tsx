"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type LoginResponse={
 accessToken:string;
 user:{id:string;fullName:string;email:string;role:string};
};

export default function LoginPage(){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);

 async function submit(event:FormEvent){
  event.preventDefault();setLoading(true);setError("");
  try{
   const result=await apiFetch<LoginResponse>("/auth/login",{method:"POST",body:JSON.stringify({email,password})});
   localStorage.removeItem("cashledger_token");
   localStorage.setItem("cashledger_user",JSON.stringify(result.user));
   router.replace("/");
  }catch(err){setError(err instanceof Error?err.message:"Login failed");}
  finally{setLoading(false);}
 }
 return <main className="relative min-h-screen overflow-hidden bg-slate-950">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,.28),transparent_30rem),radial-gradient(circle_at_90%_85%,rgba(14,165,233,.18),transparent_28rem)]"/>
  <div className="relative mx-auto grid min-h-screen max-w-7xl items-stretch lg:grid-cols-[1.05fr_.95fr]">
   <section className="hidden flex-col justify-between p-10 text-white lg:flex xl:p-14">
    <div className="flex items-center gap-3">
     <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-sm font-black text-slate-950 shadow-xl">CL</div>
     <div><p className="text-[10px] font-bold uppercase tracking-[.24em] text-indigo-300">Financial operations</p><h1 className="text-xl font-bold tracking-tight">Cash Ledger</h1></div>
    </div>
    <div className="max-w-xl">
     <p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Built for the counter</p>
     <h2 className="mt-4 text-5xl font-black leading-[1.04] tracking-[-.045em]">Every rupee, every obligation, one calm workspace.</h2>
     <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">Fast transaction entry for staff. Clear receivables, payables and settlements for owners. Designed to stay understandable through a busy day.</p>
    </div>
    <div className="grid grid-cols-3 gap-3 text-xs">
     {["Fast entry","Live position","Audit ready"].map(x=><div key={x} className="rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3 font-semibold text-slate-300 backdrop-blur">{x}</div>)}
    </div>
   </section>
   <section className="flex items-center justify-center p-4 sm:p-8 lg:bg-white/[.025]">
    <div className="w-full max-w-md">
     <div className="mb-6 flex items-center gap-3 text-white lg:hidden">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xs font-black text-slate-950">CL</div>
      <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-indigo-300">Financial operations</p><p className="font-bold">Cash Ledger</p></div>
     </div>

     <div className="rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,.35)] backdrop-blur-xl sm:p-8">
      <div className="mb-7">
       <p className="text-[10px] font-bold uppercase tracking-[.2em] text-indigo-600">Welcome back</p>
       <h2 className="mt-2 text-3xl font-black tracking-[-.035em] text-slate-950">Sign in</h2>
       <p className="mt-1 text-sm leading-6 text-slate-500">Open today’s financial workspace and continue where you left off.</p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
       <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Email</span><input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm" placeholder="you@example.com" required/></label>
       <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Password</span><input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm" placeholder="Enter your password" required/></label>
       {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
       <button disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#111827,#312e81)] px-4 text-sm font-bold text-white shadow-lg shadow-indigo-950/15 disabled:opacity-60">
        {loading?<><Spinner size="sm"/>Signing in…</>:"Sign in to Cash Ledger"}
       </button>
      </form>
      <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 text-[11px] text-slate-400">
       <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-700">✓</span>
       <span>Your session is protected and operational changes are audited.</span>
      </div>
     </div>
    </div>
   </section>
  </div>
 </main>;
}
