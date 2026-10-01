// Website-only WhatsApp confirmation. Never invokes bot message handlers.
export function createPaymentConfirmationService({database,env,fetch:fetcher=fetch}){
  const rpc=async(name,body)=>{
    const result=await database('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});
    if(result.error)throw new Error('Confirmation tracking unavailable');
    return result.payload;
  };
  async function send(job){
    const finish=(status,messageId=null,error=null)=>rpc('store_finish_payment_confirmation',{
      p_session_id:job.session_id,p_lease_token:job.lease_token,p_status:status,p_message_id:messageId,p_error:error
    });
    const token=env('WHATSAPP_ACCESS_TOKEN');
    const phoneId=env('WHATSAPP_PHONE_NUMBER_ID')||'1327606333760280';
    const version=env('WHATSAPP_API_VERSION')||'v25.0';
    if(!token||!/^\d+$/.test(phoneId)||!/^v\d+\.\d+$/.test(version)){
      await finish('pending',null,'WhatsApp configuration unavailable');return;
    }
    let response,data;
    try{
      response=await fetcher('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:job.phone,type:'template',
          template:{name:'website_payment_confirmation',language:{code:'en'}}}),
        signal:AbortSignal.timeout(15000)
      });
      data=await response.json();
    }catch{
      await finish('uncertain',null,'No conclusive Meta response; check delivery before retrying.');return;
    }
    if(response.ok&&typeof data?.messages?.[0]?.id==='string'&&data.messages[0].id.startsWith('wamid.')){
      // If saving fails, leave the lease in place. Recovery holds it for review.
      await finish('sent',data.messages[0].id);return;
    }
    if(!response.ok&&data?.error){
      const code=Number(data.error.code)||0;
      const retry=data.error.is_transient===true||response.status===429||response.status>=500||[4,17,130429,131056].includes(code);
      await finish(retry?'pending':'failed',null,'Meta HTTP '+response.status+' code '+code);return;
    }
    await finish('uncertain',null,'Meta response missing message ID; check delivery before retrying.');
  }
  async function work(sessionId=null){
    const jobs=await rpc('store_claim_payment_confirmations',{p_session_id:sessionId});
    const results=await Promise.allSettled(jobs.map(send));
    if(results.some(r=>r.status==='rejected'))console.error('Website confirmation tracking failed; lease will be held for review.');
    return {checked:jobs.length};
  }
  return {work};
}
