// Retired by the owner on 18 October 2026. Orders are managed in Supabase admin.
// Preserve exports for old imports without permitting any external handoff.
export async function deliverOrderHandoff(_orderId:number,_options:{retry:boolean}) {
  return "retired";
}
export async function retryDueOrderHandoffs() {
  return {due:0,sent:0,failed:0,skipped:0,retired:true};
}
