module.exports = async (page) => {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? image.decode?.().catch(() => undefined)
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
      ),
    );
  });

  await page.waitForTimeout(250);

  let stableSamples = 0;
  let previousLayout = "";
  for (let attempt = 0; attempt < 12 && stableSamples < 2; attempt += 1) {
    const layout = await page.evaluate(() => {
      const body = document.body;
      return JSON.stringify({
        height: body?.scrollHeight,
        width: body?.scrollWidth,
        children: body?.children.length,
        text: body?.innerText,
        boxes: Array.from(document.querySelectorAll("*"), (element) => {
          const rect = element.getBoundingClientRect();
          return [element.tagName, rect.x, rect.y, rect.width, rect.height];
        }),
      });
    });
    stableSamples = layout === previousLayout ? stableSamples + 1 : 0;
    previousLayout = layout;
    if (stableSamples < 2) await page.waitForTimeout(250);
  }
};
