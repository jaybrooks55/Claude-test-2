/* ============================================================
   REVLAR PORTAL — smoke test
   Catches the failure class that has bitten this project before:
   a broken script / missing function that blanks the app or
   stops login working.

   One-time setup:   npm init -y && npm i -D playwright && npx playwright install chromium
   Run:              node smoke-test.js
   (Optional) point at a deployed URL:  PORTAL_URL=https://portal.revlar.io node smoke-test.js

   Exit code 0 = pass, 1 = fail. Wire it into CI if you like.
   ============================================================ */
const { chromium } = require("playwright");
const path = require("path");

const URL = process.env.PORTAL_URL || ("file://" + path.join(__dirname, "index.html"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    // ignore the Supabase CDN failing in offline/preview environments
    if (m.type() === "error" && m.text().indexOf("ERR_") === -1 && m.text().indexOf("Failed to load resource") === -1) {
      errors.push("console: " + m.text());
    }
  });

  function check(cond, label) {
    if (cond) { console.log("  PASS  " + label); }
    else { console.log("  FAIL  " + label); errors.push("assert: " + label); }
  }

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);

    check(await page.isVisible("#login"), "login screen visible");

    // sign in (works in preview mode; in real mode use TEST creds via env)
    await page.fill("#email", process.env.TEST_EMAIL || "smoke@revlar.io");
    await page.fill("#password", process.env.TEST_PASSWORD || "smoke");
    await page.click("#loginBtn");
    await page.waitForTimeout(800);

    check(await page.evaluate(() => document.getElementById("app").classList.contains("show")), "app shell shown after login");
    check(await page.isVisible("#nav button"), "sidebar nav rendered");

    // navigate every view
    for (const v of ["cases", "clients", "activity", "settings", "submit", "dashboard"]) {
      await page.click('[data-nav="' + v + '"]');
      await page.waitForTimeout(250);
      check(await page.isVisible("#main"), "view rendered: " + v);
    }

    // open a case from the table
    await page.click('[data-nav="cases"]');
    await page.waitForTimeout(250);
    const viewBtn = await page.$("#caseRows [data-open]");
    check(!!viewBtn, "at least one case row with a View button");
    if (viewBtn) {
      await viewBtn.click();
      await page.waitForTimeout(400);
      check((await page.evaluate(() => location.hash)).indexOf("#/case/") === 0, "case detail deep-link in URL");
      check(await page.isVisible(".verdict-card"), "verdict card rendered");
      check(await page.isVisible("#notesArea"), "analyst notes field rendered");
    }

    check(errors.length === 0, "no script errors during run");
  } catch (e) {
    errors.push("exception: " + e.message);
  } finally {
    await browser.close();
  }

  if (errors.length) { console.log("\nSMOKE TEST FAILED:\n" + errors.join("\n")); process.exit(1); }
  console.log("\nSMOKE TEST PASSED");
})();
