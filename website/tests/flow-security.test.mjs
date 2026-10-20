import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto,createHmac} from 'node:crypto';
import vm from 'node:vm';

const source=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/whatsapp-flow/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''));
const secret='fixture-flow-secret',appSecret='fixture-meta-secret',phone='919000000001';
test('delivery diagnostics retain status and error code without message IDs, recipients or error text',async()=>{
  const bot=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/whatsapp-webhook/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''));
  const logs=[];const context=vm.createContext({Deno:{env:{get:()=> 'fixture'},serve(){}},crypto:webcrypto,TextEncoder,
    console:{log:(...args)=>logs.push(args)}});
  vm.runInContext(bot+';globalThis.statuses=logMessageStatuses;',context);
  await context.statuses([{id:'wamid.PRIVATE_RECIPIENT',recipient_id:phone,status:'failed',errors:[{code:131049,message:'PRIVATE_ERROR'}]},
    {id:'wamid.PRIVATE_RECIPIENT',status:'delivered'},{id:'invalid',status:'read'},{id:'wamid.x',status:'unknown'}]);
  assert.equal(logs.length,2);
  assert.equal(JSON.parse(logs[0][1]).error_code,131049);
  assert.equal(JSON.parse(logs[1][1]).status,'delivered');
  assert.match(JSON.parse(logs[0][1]).message_hash,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(logs[0][1]).message_hash,JSON.parse(logs[1][1]).message_hash);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|919000000001/);
});
function token(prefix,parts,expiry=Math.floor(Date.now()/1000)+300){
  const raw=[prefix,...parts,crypto.randomUUID(),expiry].join(':');
  return raw+':'+createHmac('sha256',secret).update(raw).digest('hex');
}
function fixture(privatePem=''){
  const state={calls:[],logs:[],orderPhone:phone};
  const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'fixture',FLOW_TOKEN_SECRET:secret,WHATSAPP_APP_SECRET:appSecret,WHATSAPP_FLOW_PRIVATE_KEY:privatePem,FLOW_SIGNATURE_MODE:'log'};
  const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Response,Request,URL,Date,atob,btoa,
    console:Object.fromEntries(['log','warn','error'].map(k=>[k,(...args)=>state.logs.push(args)])),
    Deno:{env:{get:k=>env[k]},serve:handler=>state.handler=handler},
    fetch:async(url,options={})=>{
      state.calls.push({url,options});const u=new URL(url);
      assert.equal(u.hostname,'db.test');assert.equal(options.method||'GET','GET');
      if(u.pathname.endsWith('/Profile'))return Response.json([{id:'profile',name:'PRIVATE_NAME_CANARY',email:'private@example.test'}]);
      if(u.pathname.endsWith('/orders'))return Response.json([{id:1,profile_id:'profile',status:'pending_payment',whatsapp_user_id:state.orderPhone}]);
      if(u.pathname.endsWith('/addresses'))return Response.json([]);
      throw Error('Unexpected request');
    }});
  vm.runInContext(source+';globalThis.api={getFlowProfile,handleInit,handleDataExchange};',context);
  return {...state,state,api:context.api};
}
test('legacy, missing, expired and tampered Flow identity never resolves a profile',async()=>{
  const f=fixture(),valid=token('update-profile',[phone]);
  const cases=['',`update-profile:${phone}:${crypto.randomUUID()}`,`checkout-address:1:${crypto.randomUUID()}`,`address-${phone}`,`address-test-${phone}`,valid.slice(0,-1)+(valid.endsWith('0')?'1':'0'),token('update-profile',[phone],1)];
  for(const flow_token of cases)assert.equal(await f.api.getFlowProfile({flow_token,data:{whatsapp_user_id:phone,wa_id:phone}}),null);
  assert.equal(f.state.calls.length,0);
});
test('signed Settings and checkout tokens work; checkout must match the bound phone',async()=>{
  const f=fixture();
  assert.equal((await f.api.handleInit({flow_token:token('update-profile',[phone])})).data.name,'PRIVATE_NAME_CANARY');
  assert.equal((await f.api.getFlowProfile({flow_token:token('checkout-address',['1',phone])})).id,'profile');
  f.state.orderPhone='919000000002';assert.equal(await f.api.getFlowProfile({flow_token:token('checkout-address',['1',phone])}),null);
});
test('untrusted identity cannot enumerate or write saved addresses',async()=>{
  const f=fixture();
  for(const screen of ['ADDRESS_LIST','NEW_ADDRESS']){
    await assert.rejects(f.api.handleDataExchange({screen,flow_token:'invalid',data:{wa_id:phone,user_action:'SELECT_ADDRESS',address_line_1:'PRIVATE_ADDRESS_CANARY'}}),/Profile not found/);
  }
  assert.equal(f.state.calls.length,0);
});
test('Meta signatures fail closed even when old log-only mode is configured',async()=>{
  const f=fixture();const response=await f.state.handler(new Request('https://flow.test',{method:'POST',body:'{}'}));
  assert.equal(response.status,432);assert.equal(f.state.calls.length,0);
});
test('encrypted signed Flow requests still round-trip without logging payload or token',async()=>{
  const keys=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
  const f=fixture(pem),aes=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12));
  const key=await webcrypto.subtle.importKey('raw',aes,'AES-GCM',false,['encrypt','decrypt']);
  const flowToken=token('update-profile',[phone]);
  const data={action:'INIT',flow_token:flowToken,data:{phone,address_line_1:'PRIVATE_ADDRESS_CANARY'}};
  const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
  const body=JSON.stringify({encrypted_aes_key:Buffer.from(await webcrypto.subtle.encrypt('RSA-OAEP',keys.publicKey,aes)).toString('base64'),encrypted_flow_data:Buffer.from(encrypted).toString('base64'),initial_vector:Buffer.from(iv).toString('base64')});
  const response=await f.state.handler(new Request('https://flow.test',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',appSecret).update(body).digest('hex')}}));
  assert.equal(response.status,200);
  const plaintext=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:iv.map(b=>b^255)},key,Buffer.from(await response.text(),'base64'));
  assert.equal(JSON.parse(new TextDecoder().decode(plaintext)).screen,'UPDATE_PROFILE');
  const logs=JSON.stringify(f.state.logs);for(const value of [phone,flowToken,'PRIVATE_ADDRESS_CANARY','PRIVATE_NAME_CANARY','private@example.test'])assert.equal(logs.includes(value),false);
});

test('bot outbound logs omit recipient, message body and provider error content',async()=>{
  const bot=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/whatsapp-webhook/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''));
  for(const status of [200,400]){
    const logs=[];const context=vm.createContext({Deno:{env:{get:()=> 'fixture'},serve(){}},performance,TextEncoder,crypto:webcrypto,Response,URL,AbortSignal,setTimeout,
      console:{log:(...a)=>logs.push(a),error:(...a)=>logs.push(a)},fetch:async()=>new Response('PRIVATE_PROVIDER_CANARY',{status})});
    vm.runInContext(bot+';globalThis.api={send};',context);
    const action=context.api.send({to:phone,text:{body:'PRIVATE_MESSAGE_CANARY'}});
    if(status===200)await action;else await assert.rejects(action,/WhatsApp API 400/);
    assert.doesNotMatch(JSON.stringify(logs),/919000000001|PRIVATE_/);
  }
});
