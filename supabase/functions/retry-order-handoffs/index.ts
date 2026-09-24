import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { retryDueOrderHandoffs } from "../_shared/order-handoff.ts";

// Called every few minutes by the retry-order-handoffs cron job. It only resends
// handoffs that are already due, so an unauthenticated call cannot do more than that.
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try{
    const counts=await retryDueOrderHandoffs();
    if(counts.due)console.log("Order handoff retry run:",JSON.stringify(counts));
    return Response.json({ok:true,...counts});
  }catch(e){
    console.error("Order handoff retry error:",e);
    return Response.json({ok:false},{status:500});
  }
});
