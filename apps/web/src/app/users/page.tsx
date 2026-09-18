"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type User={id:string;fullName:string;mobile:string|null;email:string|null;isActive:boolean;createdAt:string;lastLoginAt:string|null;role:{name:string}};

export default function UsersPage(){
 const [items,setItems]=useState<User[]>([]);
 const [fullName,setFullName]=useState("");
 const [mobile,setMobile]=useState("");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [role,setRole]=useState("STAFF");
 const [error,setError]=useState("");

 const load=()=>apiFetch<User[]>("/users").then(setItems);
 useEffect(()=>{load().catch(()=>setError("You need Owner/Admin access to manage users."));},[]);

 async function submit(e:FormEvent){
  e.preventDefault();setError("");
  try{
   await apiFetch("/users",{method:"POST",body:JSON.stringify({
    fullName,mobile:mobile||undefined,email:email||undefined,password,role,
   })});
   setFullName("");setMobile("");setEmail("");setPassword("");setRole("STAFF");await load();
  }catch(err){setError(err instanceof Error?err.message:"Failed to create user");}
 }

 async function editUser(user:User){
  const name=window.prompt("Full name",user.fullName);
  if(name===null||!name.trim())return;
  const nextEmail=window.prompt("Email",user.email||"");
  if(nextEmail===null)return;
  const nextMobile=window.prompt("Mobile",user.mobile||"");
  if(nextMobile===null)return;
  const nextRole=window.prompt("Role: OWNER, ADMIN or STAFF",user.role.name);
  if(nextRole===null)return;
  setError("");
  try{
   await apiFetch("/users/"+user.id,{method:"PATCH",body:JSON.stringify({
    fullName:name.trim(),
    email:nextEmail.trim()||undefined,
    mobile:nextMobile.trim()||undefined,
    role:nextRole.trim().toUpperCase(),
   })});
   await load();
  }catch(err){setError(err instanceof Error?err.message:"Failed to update user");}
 }

 async function toggleUser(user:User){
  if(!window.confirm((user.isActive?"Disable ":"Reactivate ")+user.fullName+"?"))return;
  setError("");
  try{
   await apiFetch("/users/"+user.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!user.isActive})});
   await load();
  }catch(err){setError(err instanceof Error?err.message:"Failed to change user status");}
 }

 async function resetPassword(user:User){
  const next=window.prompt("Enter a new temporary password (minimum 8 characters)");
  if(!next)return;
  setError("");
  try{
   await apiFetch("/users/"+user.id+"/reset-password",{method:"POST",body:JSON.stringify({password:next})});
   window.alert("Password reset successfully.");
  }catch(err){setError(err instanceof Error?err.message:"Password reset failed");}
 }

 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold">Users & Staff</h2><p className="text-sm text-slate-500">Create, edit, disable/reactivate and reset operator access.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-3">
   <input className="rounded-lg border px-3 py-2.5" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" placeholder="Mobile" value={mobile} onChange={e=>setMobile(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5" type="password" minLength={8} placeholder="Temporary password" value={password} onChange={e=>setPassword(e.target.value)} required/>
   <select className="rounded-lg border px-3 py-2.5" value={role} onChange={e=>setRole(e.target.value)}><option value="STAFF">Staff / Operator</option><option value="ADMIN">Admin</option></select>
   <button className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white">Create User</button>
  </form>
  <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th><th>Actions</th></tr></thead><tbody>{items.map(u=><tr key={u.id} className="border-t"><td className="px-4 py-3 font-medium">{u.fullName}</td><td>{u.email??"—"}</td><td>{u.mobile??"—"}</td><td>{u.role.name}</td><td>{u.isActive?"Active":"Disabled"}</td><td>{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString("en-IN"):"—"}</td><td>{new Date(u.createdAt).toLocaleDateString("en-IN")}</td><td><div className="flex flex-wrap gap-2"><button onClick={()=>editUser(u)} className="rounded border px-2 py-1">Edit</button><button onClick={()=>toggleUser(u)} className="rounded border px-2 py-1">{u.isActive?"Disable":"Reactivate"}</button><button onClick={()=>resetPassword(u)} className="rounded border px-2 py-1">Reset Password</button></div></td></tr>)}</tbody></table></div>
 </div></AppShell>;
}
