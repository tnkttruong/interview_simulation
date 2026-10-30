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

const vi={
 role:"Kỹ sư Backend cao cấp",level:"Cao cấp",overview:"Tập trung vào kinh nghiệm vận hành hệ thống và độ tin cậy.",
 stages:[
  {topic:"Kiến trúc backend",items:[{prompt:"Hãy giải thích các quyết định thiết kế dịch vụ của bạn.",
   goal:"Đánh giá ranh giới dịch vụ và hợp đồng API",completionCriteria:"Ứng viên trả lời một lần",
   suggestedAnswer:"Tôi sẽ xác định rõ ranh giới dịch vụ, hợp đồng API, chiến lược thử lại và xây dựng cơ chế giám sát trước khi mở rộng hệ thống."}]},
  {topic:"Xử lý sự cố production",items:[{prompt:"Hãy kể lại một sự cố liên quan đến độ tin cậy của cơ sở dữ liệu trong dự án.",
   goal:"Đánh giá khả năng điều tra nguyên nhân và phòng ngừa sự cố",
   completionCriteria:"Ứng viên trình bày quá trình điều tra, nguyên nhân và hướng phòng ngừa",
   suggestedAnswer:"Tôi sẽ phân tích truy vấn chậm bằng dữ liệu giám sát, kiểm tra chỉ mục và kế hoạch truy vấn, sau đó xác minh cải tiến bằng các chỉ số độ trễ."}]}
 ],
 rubric:[{competency:"Độ tin cậy",criteria:"Có biện pháp phòng ngừa và rút kinh nghiệm từ sự cố."},
         {competency:"Giao tiếp",criteria:"Trình bày rõ ràng những đánh đổi kỹ thuật."}]
};
function bilingualPlan(script,locale){
 const vietnamese={...vi,stages:script.stages.map((stage,i)=>({
  topic:vi.stages[i]?.topic||"Độ tin cậy của hệ thống",
  items:stage.items.map((item,j)=>vi.stages[i]?.items[j]||{
   prompt:"Hãy mô tả cách bạn bảo đảm độ tin cậy của hệ thống ở câu số "+(j+1)+".",
   goal:"Đánh giá kinh nghiệm vận hành và thiết kế hệ thống",
   completionCriteria:"Ứng viên trình bày cách giải quyết vấn đề",
   suggestedAnswer:"Tôi sẽ quan sát các chỉ số vận hành, tìm nguyên nhân lỗi và kiểm tra hiệu quả của phương án sửa chữa trước khi đưa vào production."
  })
 }))};
 if(locale==="vi-VN"){
  return {...script,role:vietnamese.role,level:vietnamese.level,overview:vietnamese.overview,
   stages:script.stages.map((stage,i)=>({...stage,topic:vietnamese.stages[i].topic,
    items:stage.items.map((item,j)=>({...item,...vietnamese.stages[i].items[j]}))})),
   rubric:vietnamese.rubric,bilingual:{interviewerLocale:locale,vietnamese}};
 }
 return {...script,bilingual:{interviewerLocale:locale,vietnamese}};
}
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
 const locale=content.includes('interviewerLocale":"vi-VN"')?"vi-VN":
  content.includes('interviewerLocale":"en-GB"')?"en-GB":"en-US";
 const kind=content.includes("Create a realistic interview plan")?"plan":
  content.includes("Revise this interview plan")?"revise":
  content.includes("Give brief coaching structure")?"hint":"question";
 counts[kind]++;
 const result=content.includes("Create a realistic interview plan")?bilingualPlan(content.includes("TURN_LIMIT")?limitPlan:plan,locale):
  content.includes("Revise this interview plan")?bilingualPlan({...plan,overview:"Revised focus on database incidents."},locale):
  content.includes("Give brief coaching structure")?{hint:"Describe the challenge, your actions, measured results, and tradeoffs."}:
  {nextAction:content.includes("I identified root cause and verified mitigation")?"next_question":"follow_up",
   question:content.includes("OFF_TOPIC")?"What sport do you play on weekends?":"How did you improve database reliability in production?",competency:"Reliability",
   rationale:"Grounded follow-up on role and historical examples",
   suggestedAnswer:"I would diagnose slow queries using production traces, review query plans and indexes, then validate safer migrations and alerting against an agreed latency target."};
 res.end(JSON.stringify({model:"ci-mock-model",choices:[{message:{content:JSON.stringify(result)}}]}));
});
server.listen(8787,()=>console.log("Mock LLM ready on 8787"));
