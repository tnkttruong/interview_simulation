/** Pure deterministic cursor policy. The model may only decide to follow up or advance. */
export type FlowItem={type:"standalone"|"interactive";maxFollowUps:number};
export type QuestionCursor={itemIndex:number;depth:number;type:"standalone"|"interactive"|"legacy"};
export type FlowChoice="follow_up"|"next_question";
export type FlowPosition={kind:"ask";itemIndex:number;depth:number;followUp:boolean}|{kind:"finish"};

export function nextFlowPosition(
 items:readonly FlowItem[],last:QuestionCursor|null,choice:FlowChoice|null,
 answeredCount:number,maxTurns:number
):FlowPosition{
 if(answeredCount>=maxTurns||!items.length)return {kind:"finish"};
 if(!last)return {kind:"ask",itemIndex:0,depth:0,followUp:false};
 const current=items[last.itemIndex];
 if(!current)return {kind:"finish"};
 if(current.type==="interactive"&&last.type==="interactive"&&
    choice==="follow_up"&&last.depth<current.maxFollowUps){
  return {kind:"ask",itemIndex:last.itemIndex,depth:last.depth+1,followUp:true};
 }
 const nextIndex=last.itemIndex+1;
 return nextIndex<items.length
  ?{kind:"ask",itemIndex:nextIndex,depth:0,followUp:false}
  :{kind:"finish"};
}
