/* Small first-party Supabase REST/Auth/Storage client. No CDN or service-role key. */
(() => {
  'use strict';
  const cfg=window.SUPABASE_CONFIG||{};
  const url=String(cfg.url||'').replace(/\/$/,'');
  const key=String(cfg.publishableKey||'');
  const SESSION_KEY='station-ops-supabase-session-v1';
  let session=null;
  try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}
  const assertConfigured=()=>{if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key)throw new Error('Configure js/supabase-config.js with a valid Supabase project URL and publishable key.');};
  const saveSession=value=>{session=value||null;try{if(session)sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));else sessionStorage.removeItem(SESSION_KEY);}catch{}};
  async function request(path,{method='GET',body,headers={},auth=true}={}){
    assertConfigured();const token=auth&&session&&session.access_token?session.access_token:key;
    const response=await fetch(`${url}${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${token}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text();let result=null;try{result=text?JSON.parse(text):null;}catch{result=text;}
    if(!response.ok)throw new Error(result&& (result.msg||result.message||result.error_description||result.error)||`Supabase request failed (${response.status})`);
    return result;
  }
  async function signIn(email,password){const value=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});saveSession(value);return value;}
  async function signInUsername(username,password){const login=String(username||'').trim().toLowerCase();if(!/^[a-z0-9._-]{3,30}$/.test(login))throw new Error('Invalid username format.');const value=await signIn(`${login}@login.station-ops.invalid`,password);try{const profiles=await rest('profiles',{select:'id,role,region_id,full_name,must_change_password',filters:{id:value.user.id}});if(!profiles||profiles.length!==1)throw new Error('No authorized application profile is provisioned.');return {session:value,profile:profiles[0]};}catch(error){await signOut();throw error;}}
  async function signOut(){try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{saveSession(null);}}
  async function changePassword(password){if(!session)throw new Error('Sign in before changing your password.');return request('/auth/v1/user',{method:'PUT',body:{password}});}
  async function markPasswordChanged(){return request('/rest/v1/rpc/mark_my_password_changed',{method:'POST',body:{}});}
  async function refresh(){if(!session||!session.refresh_token)return null;const value=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});saveSession(value);return value;}
  async function rest(table,{select='*',filters={},method='GET',body,prefer}={}){
    const qs=new URLSearchParams({select});Object.entries(filters).forEach(([k,v])=>qs.set(k,`eq.${v}`));
    const h={};if(prefer)h.Prefer=prefer;if(method==='POST')h.Prefer=prefer||'return=representation';
    return request(`/rest/v1/${encodeURIComponent(table)}?${qs}`,{method,body,headers:h});
  }
  async function upload(bucket,path,file){assertConfigured();if(!session)throw new Error('Sign in before uploading.');const token=session.access_token;const response=await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':file.type,'x-upsert':'false'},body:file});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||`Receipt upload failed (${response.status})`);}return {path};}
  async function download(bucket,path){assertConfigured();if(!session)throw new Error('Sign in before viewing protected files.');const response=await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});if(!response.ok)throw new Error(`Protected file download failed (${response.status})`);return URL.createObjectURL(await response.blob());}
  window.SupabaseClient=Object.freeze({configured:()=>Boolean(url&&key),request,signIn,signInUsername,signOut,refresh,rest,upload,download,changePassword,markPasswordChanged,getSession:()=>session,projectUrl:url});
})();
