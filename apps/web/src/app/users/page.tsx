"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type User={id:string;fullName:string;mobile:string|null;email:string|null;isActive:boolean;createdAt:string;lastLoginAt:string|null;role:{name:string}};

export default function UsersPage(){
 const [items,setItems]=useState<User[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [creating,setCreating]=useState(false),[fullName,setFullName]=useState(""),[mobile,setMobile]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[role,setRole]=useState("STAFF");
 const [editing,setEditing]=useState<User|null>(null),[editName,setEditName]=useState(""),[editEmail,setEditEmail]=useState(""),[editMobile,setEditMobile]=useState(""),[editRole,setEditRole]=useState("STAFF");
 const [passwordUser,setPasswordUser]=useState<User|null>(null),[newPassword,setNewPassword]=useState("");
 const [toggleTarget,setToggleTarget]=useState<User|null>(null),[message,setMessage]=useState(""),[error,setError]=useState("");
 const control="app-control";

 const load=()=>apiFetch<User[]>("/users").then(setItems);
 useEffect(()=>{load().catch(()=>setError("You need Owner/Admin access to manage users.")).finally(()=>setLoading(false));},[]);
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{await apiFetch("/users",{method:"POST",body:JSON.stringify({fullName,mobile:mobile||undefined,email:email||undefined,password,role})});setFullName("");setMobile("");setEmail("");setPassword("");setRole("STAFF");setCreating(false);setMessage("User created.");await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to create user");}finally{setBusy(false);}
 }
 function beginEdit(user:User){setEditing(user);setEditName(user.fullName);setEditEmail(user.email||"");setEditMobile(user.mobile||"");setEditRole(user.role.name);setError("");}
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing)return;setBusy(true);setError("");
  try{await apiFetch("/users/"+editing.id,{method:"PATCH",body:JSON.stringify({fullName:editName.trim(),email:editEmail.trim()||undefined,mobile:editMobile.trim()||undefined,role:editRole})});setEditing(null);setMessage("User updated.");await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to update user");}finally{setBusy(false);}
 }
 async function toggleUser(){
  if(!toggleTarget)return;setBusy(true);setError("");
  try{await apiFetch("/users/"+toggleTarget.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})});setMessage(toggleTarget.isActive?"User disabled.":"User reactivated.");setToggleTarget(null);await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to change user status");}finally{setBusy(false);}
 }
 async function resetPassword(e:FormEvent){
  e.preventDefault();if(!passwordUser)return;setBusy(true);setError("");
  try{await apiFetch("/users/"+passwordUser.id+"/reset-password",{method:"POST",body:JSON.stringify({password:newPassword})});setPasswordUser(null);setNewPassword("");setMessage("Password reset successfully.");}
  catch(err){setError(err instanceof Error?err.message:"Password reset failed");}finally{setBusy(false);}
 }
 if(loading)return <AppShell><PageLoader label="Loading staff access…"/></AppShell>;
 const active=items.filter(x=>x.isActive).length;
 const admins=items.filter(x=>["OWNER","ADMIN"].includes(x.role.name)&&x.isActive).length;

 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Access control" title="Users & staff" description="Keep operator access simple, intentional and easy to audit."
   action={<button onClick={()=>setCreating(true)} className="app-primary-button min-h-11 px-4 text-sm font-bold">+ Add user</button>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <DetailStat label="Users" value={items.length}/>
   <DetailStat label="Active" value={active} tone="emerald"/>
   <DetailStat label="Admins / owners" value={admins} tone="indigo"/>
  </div>
  {items.length?<><div className="space-y-2 md:hidden">{items.map(u=><Surface key={u.id} className={!u.isActive?"p-4 opacity-60":"p-4"}>
   <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{u.fullName}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{u.email||u.mobile||"No contact detail"}</p></div><StatusBadge tone={u.isActive?"emerald":"slate"}>{u.isActive?"Active":"Disabled"}</StatusBadge></div>
   <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-bold text-indigo-700">{u.role.name}</span><span className="text-slate-400">{u.lastLoginAt?"Last "+new Date(u.lastLoginAt).toLocaleDateString("en-IN"):"Never signed in"}</span></div>
   <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={()=>beginEdit(u)} className="min-h-10 rounded-xl border border-slate-200 text-[11px] font-bold">Edit</button><button onClick={()=>{setPasswordUser(u);setNewPassword("");}} className="min-h-10 rounded-xl border border-slate-200 text-[11px] font-bold">Password</button><button onClick={()=>setToggleTarget(u)} className="min-h-10 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500">{u.isActive?"Disable":"Enable"}</button></div>
  </Surface>)}</div>

  <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Last login</th><th>Created</th><th className="pr-5">Actions</th></tr></thead><tbody>{items.map(u=><tr key={u.id} className={"border-t border-slate-100 hover:bg-slate-50/60 "+(!u.isActive?"opacity-60":"")}><td className="px-5 py-3 font-semibold">{u.fullName}</td><td>{u.email??"—"}</td><td>{u.mobile??"—"}</td><td className="font-bold text-indigo-700">{u.role.name}</td><td><StatusBadge tone={u.isActive?"emerald":"slate"}>{u.isActive?"Active":"Disabled"}</StatusBadge></td><td className="text-xs">{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString("en-IN"):"—"}</td><td className="text-xs">{new Date(u.createdAt).toLocaleDateString("en-IN")}</td><td className="pr-5"><div className="flex gap-2"><button onClick={()=>beginEdit(u)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold">Edit</button><button onClick={()=>{setPasswordUser(u);setNewPassword("");}} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold">Password</button><button onClick={()=>setToggleTarget(u)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500">{u.isActive?"Disable":"Reactivate"}</button></div></td></tr>)}</tbody></table></div></Surface></>:<EmptyState title="No staff users found"/>}
  <Modal open={creating} title="Create staff user" description="Give the operator only the access level they need." onClose={()=>setCreating(false)} footer={<button form="create-user" disabled={busy} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Creating…":"Create user"}</button>}>
   <form id="create-user" onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Field label="Full name"><input className={control} value={fullName} onChange={e=>setFullName(e.target.value)} required/></Field><Field label="Mobile"><input className={control} value={mobile} onChange={e=>setMobile(e.target.value)}/></Field><Field label="Email"><input className={control} type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Role"><SearchableSelect className={control} value={role} onChange={e=>setRole(e.target.value)}><option value="STAFF">Staff / Operator</option><option value="ADMIN">Admin</option></SearchableSelect></Field><Field label="Temporary password" className="sm:col-span-2"><input className={control} type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></Field></form>
  </Modal>

  <Modal open={!!editing} title="Edit user" description={editing?.fullName} onClose={()=>setEditing(null)} footer={<button form="edit-user" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save changes</button>}>
   <form id="edit-user" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={control} value={editName} onChange={e=>setEditName(e.target.value)} required/></Field><Field label="Email"><input className={control} type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/></Field><Field label="Mobile"><input className={control} value={editMobile} onChange={e=>setEditMobile(e.target.value)}/></Field><Field label="Role"><SearchableSelect className={control} value={editRole} onChange={e=>setEditRole(e.target.value)}><option value="OWNER">Owner</option><option value="ADMIN">Admin</option><option value="STAFF">Staff</option></SearchableSelect></Field></form>
  </Modal>
  <Modal open={!!passwordUser} title="Reset password" description={passwordUser?.fullName} onClose={()=>setPasswordUser(null)} footer={<button form="reset-password" disabled={busy} className="min-h-11 w-full rounded-xl bg-amber-600 font-bold text-white">Reset password</button>}>
   <form id="reset-password" onSubmit={resetPassword}><Field label="New temporary password" hint="Use at least 8 characters."><input className={control} type="password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></Field></form>
  </Modal>

  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Disable user?":"Reactivate user?"} description="The user record and audit history remain available." onClose={()=>setToggleTarget(null)} footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-11 font-bold">Cancel</button><button onClick={toggleUser} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white">{toggleTarget?.isActive?"Disable":"Reactivate"}</button></div>}><p className="text-sm text-slate-600">Change access for <strong>{toggleTarget?.fullName}</strong>?</p></Modal>
 </PageFrame></AppShell>;
}
