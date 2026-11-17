import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {
  buildQuoteTitleSeed,
  prettyServiceCategory,
  stripEnquiryMetaForQuoteScope,
} from './quote-prefill.ts';

describe('prettyServiceCategory',()=>{
 it('maps known categories and blanks other',()=>{
  assert.equal(prettyServiceCategory('fault_finding'),'Fault finding');
  assert.equal(prettyServiceCategory('other'),'');
  assert.equal(prettyServiceCategory('custom_thing'),'custom thing');
 });
});

describe('stripEnquiryMetaForQuoteScope',()=>{
 it('removes intake metadata lines and keeps the request narrative',()=>{
  const cleaned=stripEnquiryMetaForQuoteScope([
   'No power at house. Caller reports a total loss of power.',
   'Call ID: 01a1b9a2',
   'Urgency: urgent',
   'Time preference: morning',
  ].join('\n'));
  assert.equal(cleaned,'No power at house. Caller reports a total loss of power.');
 });
});

describe('buildQuoteTitleSeed',()=>{
 it('prefers service and suburb over generic other',()=>{
  assert.equal(
   buildQuoteTitleSeed({serviceCategory:'fault_finding',suburb:'Byford'}),
   'Fault finding · Byford'
  );
  assert.equal(
   buildQuoteTitleSeed({serviceCategory:'other',scopeHint:'No power at house'}),
   'No power at house'
  );
 });

 it('prefixes variation titles',()=>{
  assert.equal(
   buildQuoteTitleSeed({asVariation:true,parentTitle:'Switchboard upgrade'}),
   'Variation — Switchboard upgrade'
  );
 });
});
