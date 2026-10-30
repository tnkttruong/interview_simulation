import {describe,it,expect} from "vitest";
import {nextFlowPosition} from "./flow";
const steps=[
 {type:"standalone" as const,maxFollowUps:0},
 {type:"interactive" as const,maxFollowUps:2},
 {type:"standalone" as const,maxFollowUps:0}
];
describe("typed interview cursor",()=>{
 it("starts with the first scripted question, then advances without an LLM decision",()=>{
  expect(nextFlowPosition(steps,null,null,0,15)).toEqual({kind:"ask",itemIndex:0,depth:0,followUp:false});
  expect(nextFlowPosition(steps,{itemIndex:0,depth:0,type:"standalone"},null,1,15))
   .toEqual({kind:"ask",itemIndex:1,depth:0,followUp:false});
 });
 it("keeps an interactive case open when AI requests a follow-up",()=>{
  expect(nextFlowPosition(steps,{itemIndex:1,depth:0,type:"interactive"},"follow_up",2,15))
   .toEqual({kind:"ask",itemIndex:1,depth:1,followUp:true});
  expect(nextFlowPosition(steps,{itemIndex:1,depth:1,type:"interactive"},"follow_up",3,15))
   .toEqual({kind:"ask",itemIndex:1,depth:2,followUp:true});
 });
 it("enforces scenario depth even when the model requests additional follow-ups",()=>{
  expect(nextFlowPosition(steps,{itemIndex:1,depth:2,type:"interactive"},"follow_up",4,15))
   .toEqual({kind:"ask",itemIndex:2,depth:0,followUp:false});
  expect(nextFlowPosition(steps,{itemIndex:1,depth:0,type:"interactive"},"next_question",2,15))
   .toEqual({kind:"ask",itemIndex:2,depth:0,followUp:false});
 });
 it("finishes after the plan or hard session turn limit",()=>{
  expect(nextFlowPosition(steps,{itemIndex:2,depth:0,type:"standalone"},null,5,15)).toEqual({kind:"finish"});
  expect(nextFlowPosition(steps,{itemIndex:1,depth:1,type:"interactive"},"follow_up",15,15)).toEqual({kind:"finish"});
 });
});
