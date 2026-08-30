import { test as base } from "@playwright/test";
import { applyCloudflareE2EHeaders } from "../http-headers";
import { AccountDisabledPage } from "../pages/AccountDisabledPage";
import { BasePage } from "../pages/BasePage";
import { ClassicPage } from "../pages/ClassicPage";
import { CreditsPage } from "../pages/CreditsPage";
import { DeleteAccountPage } from "../pages/DeleteAccountPage";
import { EmojiPage } from "../pages/EmojiPage";
import { HomePage } from "../pages/HomePage";
import { IssueReportPage } from "../pages/IssueReportPage";
import { LoginPage } from "../pages/LoginPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RegisterPage } from "../pages/RegisterPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { TimelinePage } from "../pages/TimelinePage";
import { TimelineLeaderboardPage } from "../pages/TimelineLeaderboardPage";

type PageFixtures = {
  accountDisabledPage: AccountDisabledPage;
  basePage: BasePage;
  classicPage: ClassicPage;
  creditsPage: CreditsPage;
  deleteAccountPage: DeleteAccountPage;
  emojiPage: EmojiPage;
  homePage: HomePage;
  issueReportPage: IssueReportPage;
  loginPage: LoginPage;
  privacyPage: PrivacyPage;
  profilePage: ProfilePage;
  registerPage: RegisterPage;
  resetPasswordPage: ResetPasswordPage;
  timelinePage: TimelinePage;
  timelineLeaderboardPage: TimelineLeaderboardPage;
};

export const test = base.extend<PageFixtures>({
  context: async ({ context }, use) => {
    await applyCloudflareE2EHeaders(context);
    await use(context);
  },
  accountDisabledPage: async ({ page }, use) => use(new AccountDisabledPage(page)),
  basePage: async ({ page }, use) => use(new BasePage(page)),
  classicPage: async ({ page }, use) => use(new ClassicPage(page)),
  creditsPage: async ({ page }, use) => use(new CreditsPage(page)),
  deleteAccountPage: async ({ page }, use) => use(new DeleteAccountPage(page)),
  emojiPage: async ({ page }, use) => use(new EmojiPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  issueReportPage: async ({ page }, use) => use(new IssueReportPage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  privacyPage: async ({ page }, use) => use(new PrivacyPage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  resetPasswordPage: async ({ page }, use) => use(new ResetPasswordPage(page)),
  timelinePage: async ({ page }, use) => use(new TimelinePage(page)),
  timelineLeaderboardPage: async ({ page }, use) => use(new TimelineLeaderboardPage(page)),
});

export { expect } from "@playwright/test";
