import { expect, test } from "@playwright/test";

test("requires latest scenario approval and explicit transcript consent", async ({page}) => {
  await page.goto("/signin");
  await page.getByRole("button",{name:/New here/}).click();
  const unique=`e2e-${Date.now()}-${Math.floor(Math.random()*1e8)}@example.test`;
  await page.getByLabel("Name").fill("P0 Test Candidate");
  await page.getByLabel("Email").fill(unique);
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button",{name:"Create account"}).click();
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
  await expect(page.getByRole("button",{name:"Start meeting →"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/explicitly consent/}).check();
  await page.getByRole("button",{name:"Start meeting →"}).click();

  await expect(page.getByRole("heading",{name:/Senior Backend Engineer/})).toBeVisible();
  await page.getByLabel("Type answer (STT fallback / offline demo)").fill("I reviewed the explain plan.");
  await page.getByRole("button",{name:"✓ Finish answer"}).click();
  await expect(page.getByText("I reviewed the explain plan.")).toBeVisible();
  await page.reload();
  // Homepage shows persisted session; resume through history.
  await expect(page.getByText(/Sessions/).first()).toBeVisible();
});
