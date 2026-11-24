const headers = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async req => {
  const reply=(status:number,message:string)=>Response.json({message},{status,headers});
  if(req.method==="OPTIONS") return new Response(null,{headers});
  if(req.method!=="POST") return reply(405,"Use POST.");
  const token=req.headers.get("authorization");
  if(!token?.startsWith("Bearer ")) return reply(401,"Sign in again.");
  const base=Deno.env.get("SUPABASE_URL")+"/auth/v1";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const verified=await fetch(base+"/user",{headers:{apikey:key,Authorization:token}});
  if(!verified.ok) return reply(401,"Sign in again.");
  const user=await verified.json();
  const body=await req.json().catch(()=>null);
  if(!user.email || body?.confirmEmail!==user.email) return reply(400,"Confirm your email.");
  const deleted=await fetch(base+"/admin/users/"+encodeURIComponent(user.id),{method:"DELETE",headers:{apikey:key,Authorization:"Bearer "+key}});
  return deleted.ok ? reply(200,"Account deleted.") : reply(502,"Deletion failed.");
});
