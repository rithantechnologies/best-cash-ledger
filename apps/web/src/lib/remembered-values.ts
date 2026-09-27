"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

type StoredValue={value:string;count:number;lastUsedAt:number};

const REMEMBERED_VALUES_EVENT="cashledger:remembered-values";

function parseStored(raw:string):StoredValue[]{
  try{
    const parsed=JSON.parse(raw||"[]") as StoredValue[];
    if(!Array.isArray(parsed))return [];
    return parsed.filter(item=>item&&typeof item.value==="string"&&item.value.trim());
  }catch{return [];}
}

function readRaw(storageKey:string){
  if(typeof window==="undefined")return "[]";
  try{return localStorage.getItem(storageKey)||"[]";}catch{return "[]";}
}

function ranked(items:StoredValue[]){
  return [...items].sort((a,b)=>b.count-a.count||b.lastUsedAt-a.lastUsedAt);
}

function subscribe(onStoreChange:()=>void){
  if(typeof window==="undefined")return()=>{};
  const listener=()=>onStoreChange();
  window.addEventListener("storage",listener);
  window.addEventListener(REMEMBERED_VALUES_EVENT,listener);
  return()=>{
    window.removeEventListener("storage",listener);
    window.removeEventListener(REMEMBERED_VALUES_EVENT,listener);
  };
}

export function useRememberedValues(storageKey:string,limit=8){
  const raw=useSyncExternalStore(
    subscribe,
    ()=>readRaw(storageKey),
    ()=>"[]",
  );
  const values=useMemo(
    ()=>ranked(parseStored(raw)).slice(0,limit).map(item=>item.value),
    [raw,limit],
  );
  const remember=useCallback((input:string)=>{
    const value=input.trim();
    if(!value||typeof window==="undefined")return;
    const items=parseStored(readRaw(storageKey));
    const needle=value.toLocaleLowerCase();
    const existing=items.find(item=>item.value.toLocaleLowerCase()===needle);
    const next=ranked(existing
      ?items.map(item=>item===existing?{...item,value,count:item.count+1,lastUsedAt:Date.now()}:item)
      :[{value,count:1,lastUsedAt:Date.now()},...items]
    ).slice(0,Math.max(limit,16));
    try{
      localStorage.setItem(storageKey,JSON.stringify(next));
      window.dispatchEvent(new Event(REMEMBERED_VALUES_EVENT));
    }catch{}
  },[storageKey,limit]);

  return {values,remember};
}
