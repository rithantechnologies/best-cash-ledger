import {test} from "node:test";
import assert from "node:assert/strict";
import {amountSuggestion} from "../src/lib/follow-up-planned-amount.mjs";
test("old card retry shorthand is a suggested amount only",()=>{
 assert.equal(amountSuggestion("GATEWAY NOT OPEN SO.... 60K"),60000);
 assert.equal(amountSuggestion("GATEWAY NOT OPEN SO.... 1.60L"),160000);
 assert.equal(amountSuggestion("90k"),90000);
});
test("narrative numbers are not automatically guessed",()=>{
 assert.equal(amountSuggestion("Try at 8 AM or 3 PM"),null);
 assert.equal(amountSuggestion("Reference 123456"),null);
 assert.equal(amountSuggestion("Card limit 60K; retry tomorrow"),null);
});
