import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleanJsonText, normalizePlan, planSchema } from "../../src/server/ai";

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
    suggestedAnswer:"I evaluate reliability, failure modes, data consistency and operational costs before choosing service boundaries."
   }]}],
   rubric:[{competency:"Design",criteria:"Explains system tradeoffs clearly"}]
  };
  const vietnamese={role:"Kỹ sư Backend",level:"Cấp cao",overview:"Đánh giá hệ thống phân tán.",
   stages:[{topic:"Kiến trúc",items:[{
    prompt:"Bạn thiết kế các dịch vụ backend phân tán như thế nào?",
    goal:"Đánh giá khả năng thiết kế hệ thống",
    completionCriteria:"Ứng viên trả lời câu hỏi",
    suggestedAnswer:"Tôi cân nhắc độ tin cậy, các tình huống lỗi và tính nhất quán dữ liệu trước khi đưa ra quyết định."
   }]}],rubric:[{competency:"Thiết kế",criteria:"Giải thích rõ các đánh đổi của hệ thống"}]};
  const parsed=planSchema.parse(normalizePlan({...english,bilingual:{interviewerLocale:"en-US",vietnamese}}));
  expect(parsed.bilingual?.interviewerLocale).toBe("en-US");
  expect(parsed.bilingual?.vietnamese.stages[0].items[0].prompt).toContain("Bạn thiết kế");
  expect(parsed.stages[0].questions[0]).toBe("How do you design distributed backend services?");
 });
});
