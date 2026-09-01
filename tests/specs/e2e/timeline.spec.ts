import { expect, test } from "../../fixtures/e2e";

test("Timeline screen loads with difficulty navigation", async ({ timelinePage }) => {
  await timelinePage.goto();

  await expect(timelinePage.heading).toBeVisible();
  await expect(timelinePage.difficultyNavigation).toBeVisible();
});

test("Timeline keeps submission disabled until every slot is filled", async ({ timelinePage }) => {
  await timelinePage.goto();

  await expect(timelinePage.heading).toBeVisible();
  await expect(timelinePage.submitButton).toBeDisabled();
});
