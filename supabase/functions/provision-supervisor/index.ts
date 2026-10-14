import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'POST required'},405);
  const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth=req.headers.get('Authorization');if(!auth)return json({error:'Authentication required'},401);
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userErr}=await caller.auth.getUser();if(userErr||!user)return json({error:'Invalid session'},401);
  const {data:manager,error:profileErr}=await admin.from('profiles').select('id,role,region_id,full_name').eq('id',user.id).single();
  if(profileErr||manager?.role!=='manager'||!manager.region_id)return json({error:'Regional Manager permission required'},403);
  let input;try{input=await req.json();}catch{return json({error:'Invalid JSON'},400);}
  const name=String(input.fullName||'').trim(),username=String(input.username||'').trim().toLowerCase(),password=String(input.temporaryPassword||'');
  const stationId=String(input.stationId||'');
  if(name.length<2||name.length>80||!/^[a-z0-9._-]{3,30}$/.test(username)||password.length<12||!stationId)return json({error:'Provide valid name, username, station and temporary password (12+ characters).'},400);
  const {data:station,error:stationErr}=await admin.from('stations').select('id,region_id').eq('id',stationId).eq('region_id',manager.region_id).single();
  if(stationErr||!station)return json({error:'Station is outside your authorized region.'},403);
  // Auth uses a non-routable tenant login alias. Do not use the password as a database/profile field.
  const email=`${username}@login.station-ops.invalid`;
  const {data:created,error:createErr}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name,login_name:username},app_metadata:{role:'supervisor'}});
  if(createErr||!created.user)return json({error:createErr?.message||'Could not create account'},400);
  const {error:insertErr}=await admin.from('profiles').insert({id:created.user.id,role:'supervisor',region_id:manager.region_id,full_name:name,must_change_password:true});
  if(insertErr){await admin.auth.admin.deleteUser(created.user.id);return json({error:'Profile creation failed; account creation rolled back.'},500);}
  const {error:assignErr}=await admin.from('station_assignments').insert({station_id:station.id,supervisor_id:created.user.id,assigned_by:user.id});
  if(assignErr){await admin.from('profiles').delete().eq('id',created.user.id);await admin.auth.admin.deleteUser(created.user.id);return json({error:'Assignment failed; account creation rolled back.'},400);}
  await admin.from('audit_events').insert({region_id:manager.region_id,station_id:station.id,actor_id:user.id,action:'supervisor_provisioned',entity_type:'profile',entity_id:created.user.id,after_data:{full_name:name,login_name:username,station_id:station.id},reason:'Provisioned by regional Manager'});
  return json({userId:created.user.id,username,stationId:station.id,mustChangePassword:true});
});
