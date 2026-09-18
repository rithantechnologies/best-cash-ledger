"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type User={id:string;fullName:string;mobile:string|null;email:string|null;isActive:boolean;createdAt:string;lastLoginAt:string|null;role:{name:string}};

export default function UsersPage(){
 const [items,setItems]=useState<User[]>([]);
 const [fullName,setFullName]=useState(""),[mobile,setMobile]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[role,setRole]=useState("STAFF");
 const [editing,setEditing]=useState<User|null>(null),[editName,setEditName]=useState(""),[editEmail,setEditEmail]=useState(""),[editMobile,setEditMobile]=useState(""),[editRole,setEditRole]=useState("STAFF");
 const [passwordUser,setPasswordUser]=useState<User|null>(null),[newPassword,setNewPassword]=useState("");
 const [message,setMessage]=useState(""),[error,setError]=useState("");

 const load=()=>apiFetch<User[]>("/users").then(setItems);
 useEffect(()=>{load().catch(()=>setError("You need Owner/Admin access to manage users."));},[]);

 async function submit(e:FormEvent){
  e.preventDefault();setError("");setMessage("");
  try{
   await apiFetch("/users",{method:"POST",body:JSON.stringify({fullName,mobile:mobile||undefined,email:email||undefined,password,role})});
   setFullName("");setMobile("");setEmail("");setPassword("");setRole("STAFF");setMessage("User created.");await load();
  }catch(err){setError(err instanceof Error?err.message:"Failed to create user");}
 }

 function beginEdit(user:User){
  setEditing(user);setEditName(user.fullName);setEditEmail(user.email||"");setEditMobile(user.mobile||"");setEditRole(user.role.name);setError("");setMessage("");
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing)return;setError("");setMessage("");
  try{
   await apiFetch("/users/"+editing.id,{method:"PATCH",body:JSON.stringify({
    fullName:editName.trim(),email:editEmail.trim()||undefined,mobile:editMobile.trim()||undefined,role:editRole,
   })});
   setEditing(null);setMessage("User updated.");await load();
  }catch(err){setError(err instanceof Error?err.message:"Failed to update user");}
 }

 async function toggleUser(user:User){
  if(!window.confirm((user.isActive?"Disable ":"Reactivate ")+user.fullName+"?"))return;
  setError("");setMessage("");
  try{await apiFetch("/users/"+user.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!user.isActive})});setMessage(user.isActive?"User disabled.":"User reactivated.");await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to change user status");}
 }

 async function resetPassword(e:FormEvent){
  e.preventDefault();if(!passwordUser)return;setError("");setMessage("");
  try{
   await apiFetch("/users/"+passwordUser.id+"/reset-password",{method:"POST",body:JSON.stringify({password:newPassword})});
   setPasswordUser(null);setNewPassword("");setMessage("Password reset successfully.");
  }catch(err){setError(err instanceof Error?err.message:"Password reset failed");}
 }

 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold">Users & Staff</h2><p className="text-sm text-slate-500">Create, edit, disable/reactivate and reset operator access.</p></div>

  {editing?<form onSubmit={saveEdit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
   <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Edit user</h3><p className="text-xs text-slate-500">{editing.fullName}</p></div><button type="button" className="text-sm font-semibold" onClick={()=>setEditing(null)}>Close</button></div>
   <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Full name" required/><input className="rounded-lg border bg-white px-3 py-2.5" type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="Email"/><input className="rounded-lg border bg-white px-3 py-2.5" value={editMobile} onChange={e=>setEditMobile(e.target.value)} placeholder="Mobile"/><select className="rounded-lg border bg-white px-3 py-2.5" value={editRole} onChange={e=>setEditRole(e.target.value)}><option value="OWNER">Owner</option><option value="ADMIN">Admin</option><option value="STAFF">Staff</option></select></div>
   <div className="mt-4 flex justify-end"><button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Save Changes</button></div>
  </form>:null}

  {passwordUser?<form onSubmit={resetPassword} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
   <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Reset password</h3><p className="text-xs text-slate-600">{passwordUser.fullName}</p></div><button type="button" className="text-sm font-semibold" onClick={()=>{setPasswordUser(null);setNewPassword("");}}>Close</button></div>
   <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="flex-1 rounded-lg border bg-white px-3 py-2.5" type="password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="New temporary password" required/><button className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white">Reset Password</button></div>
  </form>:null}

  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  {message?<p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{message}</p>:null}

  <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-3">
   <input className="rounded-lg border px-3 py-2.5" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" placeholder="Mobile" value={mobile} onChange={e=>setMobile(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5" type="password" minLength={8} placeholder="Temporary password" value={password} onChange={e=>setPassword(e.target.value)} required/>
   <select className="rounded-lg border px-3 py-2.5" value={role} onChange={e=>setRole(e.target.value)}><option value="STAFF">Staff / Operator</option><option value="ADMIN">Admin</option></select>
   <button className="rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white">Create User</button>
  </form>

  <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th><th>Actions</th></tr></thead><tbody>{items.map(u=><tr key={u.id} className={"border-t "+(!u.isActive?"opacity-60":"")}><td className="px-4 py-3 font-medium">{u.fullName}</td><td>{u.email??"—"}</td><td>{u.mobile??"—"}</td><td>{u.role.name}</td><td>{u.isActive?"Active":"Disabled"}</td><td>{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString("en-IN"):"—"}</td><td>{new Date(u.createdAt).toLocaleDateString("en-IN")}</td><td><div className="flex flex-wrap gap-2"><button onClick={()=>beginEdit(u)} className="rounded border px-2 py-1">Edit</button><button onClick={()=>toggleUser(u)} className="rounded border px-2 py-1">{u.isActive?"Disable":"Reactivate"}</button><button onClick={()=>{setPasswordUser(u);setNewPassword("");}} className="rounded border px-2 py-1">Reset Password</button></div></td></tr>)}</tbody></table></div>
 </div></AppShell>;
}
