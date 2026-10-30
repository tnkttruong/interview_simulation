"use client";
import {Fragment} from "react";

export type PlanReviewData={
 role:string;level:string;overview:string;
 stages:{topic:string;questions:string[];suggestedAnswers?:string[];
  items?:{type:"standalone"|"interactive";prompt:string;goal:string;maxFollowUps:number;completionCriteria:string;suggestedAnswer:string}[]}[];
 rubric:{competency:string;criteria:string}[];
 bilingual?:{
  interviewerLocale:"en-US"|"en-GB"|"vi-VN";
  vietnamese:{
   role:string;level:string;overview:string;
   stages:{topic:string;items:{prompt:string;goal:string;completionCriteria:string;suggestedAnswer:string}[]}[];
   rubric:{competency:string;criteria:string}[]
  }
 }
};
type ReviewRow={type?:string;prompt:string;goal?:string;completionCriteria?:string;maxFollowUps?:number;suggestedAnswer?:string};
type RowStage={topic:string;items:ReviewRow[]};

function PlanTable({title,description,overview,stages,rubric,isVietnamese,testId}:{
 title:string;description:string;overview:string;stages:RowStage[];
 rubric:{competency:string;criteria:string}[];isVietnamese:boolean;testId:string
}){
 return <section className="bilingual-script-panel" data-testid={testId} aria-label={title}>
  <h3>{title}</h3><p className="muted small">{description}</p>
  <p className="bilingual-script-overview">{overview}</p>
  <div className="bilingual-script-scroll"><table className="bilingual-script-table">
   <thead><tr><th scope="col">#</th><th scope="col">{isVietnamese?"Câu hỏi và mục tiêu":"Question and goal"}</th>
    <th scope="col">{isVietnamese?"Câu trả lời":"Answer"}</th></tr></thead>
   <tbody>{stages.map((stage,i)=><Fragment key={i}>
    <tr className="bilingual-script-stage"><th colSpan={3} scope="rowgroup">{i+1}. {stage.topic}</th></tr>
    {stage.items.map((item,j)=><tr key={j}><th scope="row">{j+1}</th>
     <td><div className="bilingual-script-type">{item.type==="interactive"?(isVietnamese?"Tình huống tương tác":"Interactive scenario"):(isVietnamese?"Câu hỏi độc lập":"Standalone")}</div>
      <strong>{item.prompt}</strong>
      {item.goal&&<p className="muted small">{isVietnamese?"Mục tiêu":"Goal"}: {item.goal}</p>}
      {item.type==="interactive"&&<p className="muted small">{isVietnamese?"Hỏi tiếp tối đa":"Max follow-ups"}: {item.maxFollowUps}. {isVietnamese?"Kết thúc khi":"Complete when"}: {item.completionCriteria}</p>}
     </td><td>{item.suggestedAnswer&&<details><summary>{isVietnamese?"Câu trả lời gợi ý":"Suggested answer"}</summary><p>{item.suggestedAnswer}</p></details>}</td>
    </tr>)}
   </Fragment>)}</tbody>
  </table></div>
  <h4>{isVietnamese?"Tiêu chí đánh giá":"Evaluation rubric"}</h4>
  <ul className="bilingual-script-rubric">{rubric.map((r,i)=><li key={i}><b>{r.competency}:</b> {r.criteria}</li>)}</ul>
 </section>;
}

/** The top-level plan is the executable translation; the Vietnamese copy is index-aligned. */
export default function BilingualPlanTables({plan}:{plan:PlanReviewData}){
 if(!plan.bilingual)return null;
 const {vietnamese,interviewerLocale}=plan.bilingual;
 const languageName={"en-US":"English (US)","en-GB":"English (UK)","vi-VN":"Tiếng Việt"}[interviewerLocale];
 const originalStages:RowStage[]=vietnamese.stages.map((stage,i)=>({
  topic:stage.topic,items:stage.items.map((item,j)=>({
   ...item,type:plan.stages[i]?.items?.[j]?.type||"standalone",
   maxFollowUps:plan.stages[i]?.items?.[j]?.maxFollowUps||0
  }))
 }));
 const translatedStages:RowStage[]=plan.stages.map(stage=>({
  topic:stage.topic,items:stage.questions.map((prompt,j)=>({
   ...stage.items?.[j],prompt,suggestedAnswer:stage.items?.[j]?.suggestedAnswer||stage.suggestedAnswers?.[j]||""
  }))
 }));
 return <div className="bilingual-script-columns" data-testid="bilingual-plan">
  <PlanTable testId="vietnamese-script" title="Bảng tiếng Việt"
   description="Kịch bản tiếng Việt để đối chiếu và luyện tập." isVietnamese
   overview={vietnamese.overview} rubric={vietnamese.rubric} stages={originalStages}/>
  <PlanTable testId="translated-script" title={`Bảng dịch · ${languageName}`}
   description={interviewerLocale==="vi-VN"?"Ngôn ngữ phỏng vấn mặc định là tiếng Việt.":"Đây là câu hỏi AI sẽ sử dụng trong buổi phỏng vấn."}
   overview={plan.overview} rubric={plan.rubric} isVietnamese={false} stages={translatedStages}/>
 </div>;
}
