import { expect, test } from "@playwright/test";

test("requires latest scenario approval and explicit transcript consent", async ({page}) => {
  await page.goto("/signin");
  await page.getByRole("button",{name:/New here/}).click();
  const unique=`e2e-${Date.now()}-${Math.floor(Math.random()*1e8)}@example.test`;
  await page.getByLabel("Name").fill("P0 Test Candidate");
  await page.getByLabel("Email").fill(unique);
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true");
  await page.goto("/demo");
  await expect(page.getByRole("heading",{name:"Your interview workspace"})).toBeVisible();
  await expect(page.getByTestId("workspace-shell")).toHaveAttribute("data-hydrated","true");

  await page.getByRole("button",{name:"New interview",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Describe the job"})).toBeVisible();
  await page.getByRole("button",{name:/Create demo scenario/}).click();
  await expect(page.getByRole("heading",{name:"Review & approve"})).toBeVisible();

  await page.getByRole("button",{name:/Language & voice/}).first().click();
  await expect(page.getByRole("button",{name:"Start meeting →"})).toBeDisabled();

  // Output locale must NOT alter candidate STT locale.
  await expect(page.getByLabel("Your microphone input language")).toHaveValue("vi-VN");
  await page.getByLabel("AI interviewer language").selectOption("vi-VN");
  await expect(page.getByLabel("Your microphone input language")).toHaveValue("vi-VN");
  await expect(page.getByLabel("AI interviewer voice")).toHaveValue("vi-VN-HoaiMyNeural");

  await page.getByRole("button",{name:"Scenario review"}).first().click();
  await page.getByRole("button",{name:/Approve latest revision/}).click();
  // Approval redirects to the dedicated preflight page.
  await expect(page.getByRole("button",{name:"Start Demo meeting →"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/explicitly consent/}).check();
  await page.getByRole("button",{name:"Start Demo meeting →"}).click();

  await expect(page.getByRole("heading",{name:/Senior Backend Engineer/})).toBeVisible();
  await page.getByLabel("Type answer (STT fallback / offline demo)").fill("I reviewed the explain plan.");
  await page.getByRole("button",{name:"✓ Finish answer"}).click();
  await expect(page.getByText("I reviewed the explain plan.")).toBeVisible();
  await page.reload();
  // The same session and recorded answer survive a reload at /demo.
  await expect(page.getByText("I reviewed the explain plan.")).toBeVisible();
});

test("a new meeting requires fresh consent and old session evidence does not leak", async ({page}) => {
  await page.goto("/signin");
  await page.getByRole("button",{name:/New here/}).click();
  await page.getByLabel("Name").fill("Consent Test");
  await page.getByLabel("Email").fill(`consent-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true");
  await page.goto("/demo");
  await expect(page.getByTestId("workspace-shell")).toHaveAttribute("data-hydrated","true");
  await page.getByRole("button",{name:"New interview",exact:true}).click();
  await page.getByRole("button",{name:/Create demo scenario/}).click();
  await page.getByRole("button",{name:/Approve latest revision/}).click();
  // Approval redirects to the dedicated preflight page.
  await page.getByRole("checkbox",{name:/explicitly consent/}).check();
  await page.getByRole("button",{name:"Start Demo meeting →"}).click();
  await page.getByLabel("Type answer (STT fallback / offline demo)").fill("Question 1 answer");
  await page.getByRole("button",{name:"✓ Finish answer"}).click();
  await page.getByRole("button",{name:"End interview"}).click();
  await page.getByRole("button",{name:"Review transcript & workflow events"}).click();
  await expect(page.getByText(/answer.committed/)).toBeVisible();
  await page.getByRole("button",{name:"Scenario review"}).first().click();
  // A reloaded demo workspace may already display the scenario list.
  const browse=page.getByRole("button",{name:"Browse scenarios"});
  if(await browse.isVisible())await browse.click();
  await page.getByRole("button",{name:/Senior Backend Engineer · v1/}).click();
  await page.getByRole("link",{name:/Continue to preflight/}).click();
  const consent=page.getByRole("checkbox",{name:/explicitly consent/});
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("button",{name:"Start Demo meeting →"})).toBeDisabled();
  await consent.check();
  await page.getByRole("button",{name:"Start Demo meeting →"}).click();
  await page.getByRole("button",{name:"History & audit"}).first().click();
  await expect(page.getByText(/answer.committed/)).toHaveCount(0);
});
