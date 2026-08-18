import { test as base } from "@playwright/test";
import { BasePage } from "../pages/BasePage";
import { ClassicPage } from "../pages/ClassicPage";
import { CreditsPage } from "../pages/CreditsPage";
import { EmojiPage } from "../pages/EmojiPage";
import { HomePage } from "../pages/HomePage";
import { IssueReportPage } from "../pages/IssueReportPage";
import { LoginPage } from "../pages/LoginPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { ProfilePage } from "../pages/ProfilePage";

type PageFixtures = {
  basePage: BasePage;
  classicPage: ClassicPage;
  creditsPage: CreditsPage;
  emojiPage: EmojiPage;
  homePage: HomePage;
  issueReportPage: IssueReportPage;
  loginPage: LoginPage;
  privacyPage: PrivacyPage;
  profilePage: ProfilePage;
};

export const test = base.extend<PageFixtures>({
  basePage: async ({ page }, use) => use(new BasePage(page)),
  classicPage: async ({ page }, use) => use(new ClassicPage(page)),
  creditsPage: async ({ page }, use) => use(new CreditsPage(page)),
  emojiPage: async ({ page }, use) => use(new EmojiPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  issueReportPage: async ({ page }, use) => use(new IssueReportPage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  privacyPage: async ({ page }, use) => use(new PrivacyPage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
});

export { expect } from "@playwright/test";