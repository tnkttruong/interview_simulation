import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleanJsonText, normalizePlan, planSchema, generatedPlanSchema } from "../../src/server/ai";

describe("AI plan parsing and normalization", () => {
  it("strips markdown code fences from AI output", () => {
    const raw = "```json\n{\"role\":\"Senior Engineer\",\"level\":\"Senior\",\"overview\":\"Overview text\",\"stages\":[],\"rubric\":[]}\n```";
    const cleaned = cleanJsonText(raw);
    expect(cleaned).toBe("{\"role\":\"Senior Engineer\",\"level\":\"Senior\",\"overview\":\"Overview text\",\"stages\":[],\"rubric\":[]}");
  });

  it("handles markdown with extra pre/post text", () => {
    const raw = "Here is the interview plan:\n```json\n{\"role\":\"DevOps Lead\"}\n```\nHope this helps!";
    const cleaned = cleanJsonText(raw);
    expect(cleaned).toBe("{\"role\":\"DevOps Lead\"}");
  });

  it("normalizes incomplete AI output into valid planSchema", () => {
    const incomplete = {
      role: "Backend Architect",
      stages: [
        { name: "Architecture & System Design", questions: ["How do you design for high throughput?"] }
      ],
      rubric: {
        "Distributed Systems": "Understands consensus and replication",
        "Problem Solving": "Structured troubleshooting methodology"
      }
    };

    const normalized = normalizePlan(incomplete);
    const parsed = planSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.role).toBe("Backend Architect");
      expect(parsed.data.level).toBe("Mid-Senior");
      expect(parsed.data.stages.length).toBeGreaterThanOrEqual(1);
      expect(parsed.data.rubric.length).toBeGreaterThanOrEqual(2);
      expect(parsed.data.rubric[0].competency).toBe("Distributed Systems");
    }
  });

  it("handles nested plan object { plan: ... }", () => {
    const nested = {
      plan: {
        role: "Frontend Engineer",
        level: "Lead",
        overview: "Deep dive into React, state management, and web performance.",
        stages: [
          { topic: "Component Architecture", questions: ["Explain React Server Components."] },
          { topic: "Performance & Rendering", questions: ["How do you profile rendering bottlenecks?"] }
        ],
        rubric: [
          { competency: "Frontend Architecture", criteria: "Builds scalable UI systems." },
          { competency: "Performance Optimization", criteria: "Identifies and eliminates web performance issues." }
        ]
      }
    };

    const normalized = normalizePlan(nested);
    const parsed = planSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
  });
});

describe("Bilingual plan compatibility",()=>{
 it("retains Vietnamese and translated versions through normalization",()=>{
  const english={
   role:"Backend Engineer",level:"Senior",overview:"Assess distributed systems.",
   stages:[{topic:"Architecture",items:[{
    type:"standalone",prompt:"How do you design distributed backend services?",
    goal:"Assess architecture decisions",maxFollowUps:0,
    completionCriteria:"Candidate answers the question",
    suggestedAnswer:"I evaluate reliability, failure modes, data consistency and operational costs before choosing service boundaries.",
    fullAnswer:"I start with domain boundaries and define explicit contracts between services. When designing a checkout API, I would protect writes with a transaction and use an idempotency key for retries. I would add request tests and inspect database indexes and production latency before making the design more complex."
   }]}],
   rubric:[{competency:"Design",criteria:"Explains system tradeoffs clearly"}]
  };
  const vietnamese={role:"Kỹ sư Backend",level:"Cấp cao",overview:"Đánh giá hệ thống phân tán.",
   stages:[{topic:"Kiến trúc",items:[{
    prompt:"Bạn thiết kế các dịch vụ backend phân tán như thế nào?",
    goal:"Đánh giá khả năng thiết kế hệ thống",
    completionCriteria:"Ứng viên trả lời câu hỏi",
    suggestedAnswer:"Tôi cân nhắc độ tin cậy, các tình huống lỗi và tính nhất quán dữ liệu trước khi đưa ra quyết định.",
    fullAnswer:"Tôi bắt đầu từ ranh giới nghiệp vụ và hợp đồng API giữa các dịch vụ. Với ví dụ tính năng thanh toán, tôi sẽ dùng transaction để đảm bảo tính nhất quán và idempotency key để xử lý retry an toàn. Sau đó tôi viết request specs, kiểm tra index và theo dõi độ trễ thực tế trước khi mở rộng kiến trúc."
   }]}],rubric:[{competency:"Thiết kế",criteria:"Giải thích rõ các đánh đổi của hệ thống"}]};
  const parsed=planSchema.parse(normalizePlan({...english,bilingual:{interviewerLocale:"en-US",vietnamese}}));
  expect(parsed.bilingual?.interviewerLocale).toBe("en-US");
  expect(parsed.bilingual?.vietnamese.stages[0].items[0].prompt).toContain("Bạn thiết kế");
  expect(parsed.stages[0].questions[0]).toBe("How do you design distributed backend services?");
  expect(parsed.stages[0].items?.[0].fullAnswer).toContain("I start with domain boundaries");
  expect(parsed.bilingual?.vietnamese.stages[0].items[0].fullAnswer).toContain("Tôi bắt đầu");
 });
});

describe("Complete answer compatibility and generation contract",()=>{
 it("loads old plans without a full answer without replacing existing suggestions",()=>{
  const old=normalizePlan({role:"Backend Engineer",stages:[{
   topic:"API",questions:["How do you safely retry requests?"],
   suggestedAnswers:["The candidate should cover idempotency, transaction boundaries and uniqueness constraints in the database."]
  }],rubric:[{competency:"Reliability",criteria:"Clear trade-offs"}]});
  const parsed=planSchema.parse(old);
  expect(parsed.stages[0].items?.[0].fullAnswer).toBeUndefined();
  expect(parsed.stages[0].items?.[0].suggestedAnswer).toContain("idempotency");
 });
 it("requires a distinct complete answer in both language versions for new generation",()=>{
  const shared={
   role:"Backend Engineer",level:"Senior",overview:"Interview plan",
   rubric:[{competency:"Architecture",criteria:"Valid explanation of trade-offs"}]
  };
  const item=(type:"standalone"|"interactive")=>({
   type,prompt:"How would you handle an incident affecting API response times?",
   goal:"Assess production incident response",maxFollowUps:type==="standalone"?0:1,
   completionCriteria:"Candidate explains investigation and remediation",
   suggestedAnswer:"Candidate should cover instrumentation and query plans before recommending mitigation.",
   fullAnswer:"I would start by inspecting endpoint latency and traces, identify the expensive SQL query using EXPLAIN ANALYZE, and verify the smallest safe fix under realistic load. I would deploy with rollback readiness and monitor the error rate after the release."
  });
  const viItem={
   prompt:"Bạn xử lý sự cố chậm API trên production như thế nào?",
   goal:"Đánh giá xử lý sự cố production",
   completionCriteria:"Ứng viên trình bày cách xử lý và kiểm chứng",
   suggestedAnswer:"Ứng viên nên trình bày cách quan sát logs, phân tích truy vấn và giảm rủi ro triển khai.",
   fullAnswer:"Tôi sẽ bắt đầu bằng cách xem latency và traces để khoanh vùng API bị ảnh hưởng. Sau đó tôi chạy EXPLAIN ANALYZE, kiểm tra index và transaction đang chờ khóa, rồi thử một phương án khắc phục có rollback. Cuối cùng tôi theo dõi lại error rate và độ trễ sau khi triển khai."
  };
  const stages=[{topic:"Architecture",questions:[item("standalone").prompt],suggestedAnswers:[item("standalone").suggestedAnswer],items:[item("standalone")]},
   {topic:"Incident",questions:[item("interactive").prompt],suggestedAnswers:[item("interactive").suggestedAnswer],items:[item("interactive")]}];
  const vietnamese={...shared,stages:[{topic:"Kiến trúc",items:[viItem]},{topic:"Sự cố",items:[viItem]}]};
  const plan={...shared,stages,bilingual:{interviewerLocale:"en-US",vietnamese}};
  expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
  expect(generatedPlanSchema.safeParse({...plan,stages:stages.map(stage=>({
   ...stage,items:stage.items.map(item=>({...item,fullAnswer:undefined}))
  }))}).success).toBe(false);
  expect(generatedPlanSchema.safeParse({...plan,bilingual:{...plan.bilingual,vietnamese:{
   ...vietnamese,stages:vietnamese.stages.map(stage=>({
    ...stage,items:stage.items.map(item=>({...item,fullAnswer:undefined}))
   }))
  }}}).success).toBe(false);
 });
});
