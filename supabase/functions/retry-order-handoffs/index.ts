import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Compatibility endpoint only: no database reads/writes or outbound requests.
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  return Response.json({ok:false,retired:true},{status:410});
});
