// Admin delivery updates for both order sources; payment and bot handlers stay separate.
export function createDeliveryNotificationService({database,env,fetch:fetcher=fetch}){
  const rpc=async(name,body)=>{
    const result=await database('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});
    if(result.error)throw new Error('Delivery notification tracking unavailable');
    return result.payload;
  };
  async function send(job){
    const finish=(status,messageId=null,code=null,error=null)=>rpc('store_finish_delivery_notification',{
      p_order_id:job.order_id,p_lease_token:job.lease_token,p_status:status,p_message_id:messageId,p_error_code:code,p_error:error
    });
    if(!/^[0-9]{7,15}$/.test(job.phone)||!job.reference_id){
      await finish('failed',null,null,'Delivery details invalid');return;
    }
    const token=env('WHATSAPP_ACCESS_TOKEN');
    const phoneId=env('WHATSAPP_PHONE_NUMBER_ID')||'1327606333760280';
    const version=env('WHATSAPP_API_VERSION')||'v25.0';
    if(!token||!/^\d+$/.test(phoneId)||!/^v\d+\.\d+$/.test(version)){
      await finish('pending',null,null,'WhatsApp configuration unavailable');return;
    }
    let response,data;
    try{
      response=await fetcher('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:job.phone,type:'template',
          template:{name:'order_delivered',language:{code:'en'},components:[{type:'body',parameters:[
            {type:'text',parameter_name:'order_number',text:job.reference_id}
          ]}]}}),signal:AbortSignal.timeout(15000)
      });
      data=await response.json();
    }catch{
      await finish('uncertain',null,null,'No conclusive Meta response; check delivery before retrying.');return;
    }
    if(response.ok&&typeof data?.messages?.[0]?.id==='string'&&data.messages[0].id.startsWith('wamid.')){
      await finish('sent',data.messages[0].id);return;
    }
    if(!response.ok&&data?.error){
      const code=Number(data.error.code)||0;
      const transient=data.error.is_transient===true||response.status===429||response.status>=500||[4,17,130429,131056].includes(code);
      // An unapproved/missing template is a conclusive rejection. Staff can retry
      // after approval; there is no automatic approval polling or historical resend.
      await finish(transient?'pending':'failed',null,code,'Meta HTTP '+response.status+' code '+code);return;
    }
    await finish('uncertain',null,null,'Meta response missing message ID; check delivery before retrying.');
  }
  async function work(orderId=null){
    const jobs=await rpc('store_claim_delivery_notifications',{p_order_id:orderId});
    const results=await Promise.allSettled(jobs.map(send));
    if(results.some(r=>r.status==='rejected'))console.error('Delivery notification tracking failed; hold for review.');
    return {checked:jobs.length};
  }
  async function view(orderId){
    const result=await database('/rest/v1/store_delivery_notifications?select=status,error_code,attempts,accepted_at&order_id=eq.'+orderId+'&limit=1');
    return result.payload?.[0]||null;
  }
  async function retry(orderId){
    try{await rpc('store_retry_delivery_notification',{p_order_id:orderId});}
    catch(error){
      if(error.status===400)throw Object.assign(new Error('This delivery message cannot be retried safely. Refresh orders and check its status.'),{status:409});
      throw error;
    }
  }
  return {work,view,retry};
}
