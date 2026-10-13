import {createServer} from "node:http";
const plan={
 role:"Senior Backend Engineer",level:"Senior",overview:"Focus on production ownership and reliability.",
 stages:[{topic:"Backend architecture",questions:["Explain your service design decisions."]},
         {topic:"Teamwork",questions:["Describe how you reviewed code."]}],
 rubric:[{competency:"Reliability",criteria:"Uses measurable safeguards and incident lessons."},
         {competency:"Communication",criteria:"Explains tradeoffs clearly."}]
};
const server=createServer(async(req,res)=>{
 res.setHeader("Content-Type","application/json");
 if(req.method==="GET"&&req.url==="/health"){res.end(JSON.stringify({status:"ok"}));return;}
 if(req.method!=="POST"||req.url!=="/v1/chat/completions"){res.statusCode=404;res.end("{}");return;}
 let raw="";
 for await (const chunk of req)raw+=String(chunk);
 let input;
 try{input=JSON.parse(raw);}catch{res.statusCode=400;res.end("{}");return;}
 const content=String(input.messages?.[1]?.content||"");
 const result=content.includes("Create a realistic interview plan")?plan:
  content.includes("Revise this interview plan")?{...plan,overview:"Revised focus on database incidents."}:
  content.includes("Give brief coaching structure")?{hint:"Describe the challenge, your actions, measured results, and tradeoffs."}:
  {question:"How did you improve database reliability in production?",competency:"Reliability",
   rationale:"Grounded follow-up on role and historical examples"};
 res.end(JSON.stringify({model:"ci-mock-model",choices:[{message:{content:JSON.stringify(result)}}]}));
});
server.listen(8787,"127.0.0.1",()=>console.log("Mock LLM ready on 8787"));
