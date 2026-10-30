import {createServer} from "node:http";
const plan={
 role:"Senior Backend Engineer",level:"Senior",overview:"Focus on production ownership and reliability.",
 stages:[
  {topic:"Backend architecture",items:[{
   type:"standalone",prompt:"Explain your service design decisions.",
   goal:"Assess service boundaries and API contracts",maxFollowUps:0,
   completionCriteria:"Answer is submitted",
   suggestedAnswer:"I would define explicit service boundaries, clear API contracts, reliable retries, and observability before scaling."
  }]},
  {topic:"Production incident deep dive",items:[{
   type:"interactive",prompt:"Walk through a database reliability incident from your project.",
   goal:"Assess incident triage, investigation, tradeoffs and prevention",maxFollowUps:2,
   completionCriteria:"Candidate explains investigation, root cause and preventative action",
   suggestedAnswer:"I would diagnose slow queries using production traces, review query plans and indexes, then validate safer migrations and alerting against an agreed latency target."
  }]}
 ],
 rubric:[{competency:"Reliability",criteria:"Uses measurable safeguards and incident lessons."},
         {competency:"Communication",criteria:"Explains tradeoffs clearly."}]
};
// Exactly fifteen answers if the final interactive scenario uses its one follow-up.
const limitPlan={...plan,stages:[
 {topic:"Service reliability",items:Array.from({length:10},(_,i)=>({
  ...plan.stages[0].items[0],prompt:`Service design question ${i+1}: how do you ensure production reliability?`
 }))},
 {topic:"Operations and incidents",items:[
  ...Array.from({length:3},(_,i)=>({
   ...plan.stages[0].items[0],prompt:`Reliability check ${i+1}: how do you improve production systems?`
  })),
  {...plan.stages[1].items[0],maxFollowUps:1}
 ]}
]};
const counts={plan:0,revise:0,question:0,hint:0};
const server=createServer(async(req,res)=>{
 res.setHeader("Content-Type","application/json");
 if(req.method==="GET"&&req.url==="/health"){res.end(JSON.stringify({status:"ok"}));return;}
 if(req.method==="GET"&&req.url==="/stats"){res.end(JSON.stringify(counts));return;}
 if(req.method!=="POST"||req.url!=="/v1/chat/completions"){res.statusCode=404;res.end("{}");return;}
 let raw="";
 for await (const chunk of req)raw+=String(chunk);
 let input;
 try{input=JSON.parse(raw);}catch{res.statusCode=400;res.end("{}");return;}
 const content=String(input.messages?.[1]?.content||"");
 const kind=content.includes("Create a realistic interview plan")?"plan":
  content.includes("Revise this interview plan")?"revise":
  content.includes("Give brief coaching structure")?"hint":"question";
 counts[kind]++;
 const result=content.includes("Create a realistic interview plan")?(content.includes("TURN_LIMIT")?limitPlan:plan):
  content.includes("Revise this interview plan")?{...plan,overview:"Revised focus on database incidents."}:
  content.includes("Give brief coaching structure")?{hint:"Describe the challenge, your actions, measured results, and tradeoffs."}:
  {nextAction:content.includes("I identified root cause and verified mitigation")?"next_question":"follow_up",
   question:content.includes("OFF_TOPIC")?"What sport do you play on weekends?":"How did you improve database reliability in production?",competency:"Reliability",
   rationale:"Grounded follow-up on role and historical examples",
   suggestedAnswer:"I would diagnose slow queries using production traces, review query plans and indexes, then validate safer migrations and alerting against an agreed latency target."};
 res.end(JSON.stringify({model:"ci-mock-model",choices:[{message:{content:JSON.stringify(result)}}]}));
});
server.listen(8787,()=>console.log("Mock LLM ready on 8787"));
