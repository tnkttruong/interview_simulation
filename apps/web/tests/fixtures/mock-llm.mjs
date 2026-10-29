import {createServer} from "node:http";
const plan={
 role:"Senior Backend Engineer",level:"Senior",overview:"Focus on production ownership and reliability.",
 stages:[{topic:"Backend architecture",questions:["Explain your service design decisions."],
          suggestedAnswers:["I would define explicit service boundaries, clear API contracts, reliable retries, and observability before scaling."]},
         {topic:"Teamwork",questions:["Describe how you reviewed code."],
          suggestedAnswers:["A strong review combines correctness, test coverage, maintainability, and constructive feedback to the author."]}],
 rubric:[{competency:"Reliability",criteria:"Uses measurable safeguards and incident lessons."},
         {competency:"Communication",criteria:"Explains tradeoffs clearly."}]
};
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
 const result=content.includes("Create a realistic interview plan")?plan:
  content.includes("Revise this interview plan")?{...plan,overview:"Revised focus on database incidents."}:
  content.includes("Give brief coaching structure")?{hint:"Describe the challenge, your actions, measured results, and tradeoffs."}:
  {question:"How did you improve database reliability in production?",competency:"Reliability",
   rationale:"Grounded follow-up on role and historical examples",
   suggestedAnswer:"I would diagnose slow queries using production traces, review query plans and indexes, then validate safer migrations and alerting against an agreed latency target."};
 res.end(JSON.stringify({model:"ci-mock-model",choices:[{message:{content:JSON.stringify(result)}}]}));
});
server.listen(8787,()=>console.log("Mock LLM ready on 8787"));
