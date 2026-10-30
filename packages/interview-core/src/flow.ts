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

/** Worst-case answer count if every interactive item consumes all follow-ups. */
export function maxFlowTurns(items:readonly FlowItem[]):number{
 return items.reduce((sum,item)=>sum+1+item.maxFollowUps,0);
}

/** Conservative guard: prefer advancing to the next item over an unrelated AI follow-up. */
export function isRelevantScenarioFollowUp(context:string,question:string,previousQuestions:readonly string[]=[]):boolean{
 const tokens=(value:string)=>value.toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g,"").match(/[a-z]{4,}|[\p{L}]{4,}/gu)||[];
 const stop=new Set(["what","which","when","where","your","with","from","about","that","this","would","could","should","their","these","those","have","were","been","into","through","them","they","then","how","candidate","assess","explain","describe","answer","question","scenario","evidence","provides","details","project"]);
 const anchors=new Set(tokens(context).filter(word=>!stop.has(word)));
 const candidate=question.trim().toLowerCase().replace(/\s+/g," ");
 if(candidate.length<8||previousQuestions.some(prior=>prior.trim().toLowerCase().replace(/\s+/g," ")===candidate))return false;
 return tokens(question).some(word=>anchors.has(word));
}
