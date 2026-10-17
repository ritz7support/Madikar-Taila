// Owner-confirmed courier policy, 17 October 2026. Amounts are integer paise.
// Pack weights include the product/container; courier boxes are additional.
export function calculateShipping(lines) {
  const units=[];
  for(const line of lines){
    if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>1000)throw new Error('Invalid shipping quantity.');
    if(!Number.isSafeInteger(line.weightGrams)||line.weightGrams<=0)throw new Error('Shipping weight is missing for '+(line.name||'a selected pack')+'. Please contact the store.');
    if(line.weightGrams>6000)throw new Error('A selected pack needs a larger shipping box. Please contact the store.');
    for(let i=0;i<line.quantity;i++)units.push(line.weightGrams);
    if(units.length>1000)throw new Error('This order needs a manual shipping quote. Please contact the store.');
  }
  if(!units.length)throw new Error('Select a product before calculating shipping.');
  // Keep individual packs intact. Deterministic first-fit decreasing, then use
  // the smallest available box for each load (1 / 4 / 6 kg product capacity).
  const loads=[];
  for(const weight of units.sort((a,b)=>b-a)){
    const index=loads.findIndex(load=>load+weight<=6000);
    if(index<0)loads.push(weight);else loads[index]+=weight;
  }
  const boxes=loads.map(productGrams=>({productGrams,capacityGrams:productGrams<=1000?1000:productGrams<=4000?4000:6000,packagingGrams:productGrams<=1000?100:productGrams<=4000?336:403}));
  const productGrams=units.reduce((sum,n)=>sum+n,0),packagingGrams=boxes.reduce((sum,b)=>sum+b.packagingGrams,0);
  const packedGrams=productGrams+packagingGrams;
  // The next kilogram starts at 200 g over a whole kg, inclusive; minimum 1 kg.
  const billedKg=Math.max(1,Math.floor((packedGrams+800)/1000));
  return {policy:'courier-2026-10-17',productGrams,packagingGrams,packedGrams,billedKg,ratePaise:4000,shippingPaise:billedKg*4000,boxes};
}
