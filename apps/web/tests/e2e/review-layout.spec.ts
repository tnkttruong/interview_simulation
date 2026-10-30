import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";

async function signUp(page:Page){
 await page.goto("/signin");
 await page.getByRole("button",{name:/New here/}).click();
 await page.getByLabel("Name").fill("Review Layout Tester");
 await page.getByLabel("Email").fill("review-layout-"+randomUUID()+"@example.test");
 await page.getByLabel("Password").fill("correct-horse-battery-staple!");
 await page.getByRole("button",{name:"Create account"}).click();
 await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true",{timeout:15000});
}

test("review gives the script full width and puts planner revision below it",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await signUp(page);
 const created=await page.request.post("/api/live/scenarios",{data:{
  role:"Backend Engineer",
  jobDescription:"Build and own reliable backend services.",
  cvText:"I built production APIs and managed PostgreSQL incidents.",
  planImmediately:true
 }});
 expect(created.status(),await created.text()).toBe(201);
 const {id}=await created.json() as {id:string};
 await page.goto("/live?step=review&scenarioId="+id);

 await expect(page.getByRole("heading",{name:"Meeting script & review plan"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Ask planner to revise"})).toBeVisible();
 const bounds=await Promise.all([".review-layout",".review-main",".review-revision"].map(async selector=>
  page.locator(selector).boundingBox()));
 const [layout,main,revision]=bounds;
 expect(layout).not.toBeNull();
 expect(main).not.toBeNull();
 expect(revision).not.toBeNull();
 expect(main!.width).toBeGreaterThan(layout!.width*0.95);
 expect(revision!.y).toBeGreaterThanOrEqual(main!.y+main!.height-1);

 const sources=page.locator(".review-source-details");
 await expect(sources).not.toHaveAttribute("open","");
 await sources.locator("summary").click();
 await expect(sources).toHaveAttribute("open","");
 await expect(sources.getByText("Build and own reliable backend services.")).toBeVisible();
 await expect(sources.getByText("I built production APIs and managed PostgreSQL incidents.")).toBeVisible();
});
