import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateShipping} from './shipping.ts';
const quote=(weightGrams,quantity=1)=>calculateShipping([{weightGrams,quantity,name:'Test pack'}]);
test('owner examples include product capacity, packaging and inclusive 200 g cutoff',()=>{
  assert.deepEqual([quote(1000).packedGrams,quote(1000).shippingPaise],[1100,4000]);
  // Above 1 kg the next available box is 4 kg, weighing 336 g.
  assert.deepEqual([quote(1863).packedGrams,quote(1863).shippingPaise],[2199,8000]);
  assert.deepEqual([quote(1864).packedGrams,quote(1864).shippingPaise],[2200,12000]);
  assert.deepEqual([quote(4000).packagingGrams,quote(4000).shippingPaise],[336,20000]);
  assert.deepEqual([quote(6000).packagingGrams,quote(6000).shippingPaise],[403,28000]);
  assert.equal(quote(90).shippingPaise,4000);
});
test('multiple boxes preserve indivisible packs and sum their packaging before billing',()=>{
  const s=quote(4550,2);
  assert.equal(s.boxes.length,2);assert.equal(s.productGrams,9100);assert.equal(s.packagingGrams,806);assert.equal(s.shippingPaise,40000);
  const mixed=calculateShipping([{weightGrams:3000,quantity:2},{weightGrams:1000,quantity:1}]);
  assert.deepEqual(mixed.boxes.map(b=>[b.productGrams,b.packagingGrams]),[[6000,403],[1000,100]]);
  assert.equal(mixed.packedGrams,7503);assert.equal(mixed.shippingPaise,32000);
  assert.deepEqual(calculateShipping([{weightGrams:1000,quantity:1},{weightGrams:3000,quantity:2}]),mixed);
});
test('unknown, non-integral and unsupported weights cannot silently produce free shipping',()=>{
  for(const weight of [null,undefined,0,-1,1.5,NaN,Infinity,6001,'500'])assert.throws(()=>quote(weight));
  for(const qty of [0,-1,1.5,1001])assert.throws(()=>quote(500,qty));
  assert.throws(()=>calculateShipping([]));
});
