import assert from "node:assert/strict";

export async function assertActionRowAlignment(page, row, name) {
  const bottomGap = await row.evaluate(
    (element) =>
      element.parentElement.getBoundingClientRect().bottom -
      element.getBoundingClientRect().bottom,
  );
  assert(
    bottomGap >= 0 && bottomGap <= 4,
    `${name} bottom gap: ${bottomGap}px`,
  );
  const controls = await row.evaluate((element) => {
    const center = (rect) => rect.top + rect.height / 2;
    return Array.from(
      element.querySelectorAll(":scope > label, :scope > button"),
    ).map((control) => {
      const hit = control.getBoundingClientRect();
      const parts = Array.from(
        control.querySelectorAll("input[type=checkbox]:not(.sr-only), svg"),
      ).map((node) => ({
        name: node.tagName,
        y: center(node.getBoundingClientRect()),
      }));
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || node.parentElement.closest("svg"))
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width)
            parts.push({ name: node.textContent.trim(), y: center(rect) });
        }
      }
      return {
        label: control.getAttribute("aria-label") || control.textContent.trim(),
        top: hit.top,
        bottom: hit.bottom,
        height: hit.height,
        width: hit.width,
        y: center(hit),
        parts,
      };
    });
  });
  assert(
    controls.length >= 3,
    name + " should include checkbox and action buttons",
  );
  const minSize = page.viewportSize().width <= 1050 ? 44 : 36;
  for (const control of controls) {
    assert(
      control.height >= minSize && control.width >= minSize,
      name + " undersized target: " + JSON.stringify(control),
    );
    assert(control.parts.length > 0);
    for (const part of control.parts) {
      assert(
        Math.abs(part.y - control.y) <= 2,
        name + " misaligned content: " + JSON.stringify(control),
      );
    }
    for (const peer of controls) {
      // Source actions may wrap. Only controls sharing a visual row should align.
      if (
        Math.min(control.bottom, peer.bottom) <= Math.max(control.top, peer.top)
      )
        continue;
      assert(
        Math.abs(control.y - peer.y) <= 2,
        name +
          " controls have different vertical centers: " +
          JSON.stringify([control, peer]),
      );
    }
  }
}

export async function assertRichReply(page, turn, source, capture) {
  const prose = turn.locator(".chat-reply-text");
  const heading = prose.getByRole("heading", {
    name: "Reading the results",
    exact: true,
  });
  await heading.waitFor();
  assert.equal(
    await prose.locator("ul > li > ul > li").innerText(),
    "Check the observation count.",
  );
  const task = prose.getByRole("checkbox");
  assert(await task.isChecked());
  assert(await task.isDisabled());
  assert.equal(await prose.getByRole("img").count(), 0);
  assert.equal(
    await prose
      .getByText("sample_size", { exact: true })
      .evaluate((el) => el.tagName),
    "CODE",
  );
  const table = prose.getByRole("table");
  assert.equal(await table.getByRole("columnheader").count(), 7);
  assert.equal(await table.getByRole("row").count(), 2);
  assert(
    (await prose.locator("pre > code").textContent()).includes(
      "print(observation_count)",
    ),
  );
  const proseLink = prose.getByRole("link", {
    name: "Read the field report",
    exact: true,
  });
  assert.equal(await proseLink.getAttribute("href"), source.url);
  assert.equal(await proseLink.getAttribute("target"), "_blank");
  assert.match(await proseLink.getAttribute("rel"), /noopener/);
  const cardLink = turn.getByRole("link", { name: source.title, exact: true });
  assert.equal(await cardLink.getAttribute("href"), source.url);

  for (const [width, height, device] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole(width > 1050 ? "complementary" : "dialog", {
        name: "Writing assistant",
      })
      .waitFor();
    await heading.scrollIntoViewIfNeeded();
    const overflow = await table.evaluate((el) => {
      const article = el.closest(".chat-reply-text");
      let p = el;
      while (p && p !== article) {
        if (
          ["auto", "scroll"].includes(getComputedStyle(p).overflowX) &&
          p.scrollWidth > p.clientWidth + 1
        ) {
          p.scrollLeft = 80;
          const actuallyScrolled = p.scrollLeft > 0;
          p.scrollLeft = 0;
          return {
            scrollable: actuallyScrolled,
            width: article.clientWidth,
            content: article.scrollWidth,
          };
        }
        p = p.parentElement;
      }
      return {
        scrollable: false,
        width: article.clientWidth,
        content: article.scrollWidth,
      };
    });
    assert(
      overflow.content <= overflow.width + 1,
      "Rich reply overflows its viewport: " + JSON.stringify(overflow),
    );
    assert(
      overflow.scrollable,
      "Wide table should scroll inside the reply on " + device,
    );
    const code = prose.locator("pre");
    const codeOverflow = await code.evaluate((el) => {
      el.scrollLeft = 90;
      const offset = el.scrollLeft;
      el.scrollLeft = 0;
      return offset;
    });
    assert(codeOverflow > 0, "Fenced code should scroll within the reply");
    await capture(page, "chat-markdown-" + device);
  }
  const context = page.context();
  const intercept = (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Field report fixture</title>",
    });
  await context.route(source.url, intercept);
  try {
    const sourcePage = context.waitForEvent("page");
    await proseLink.click();
    const opened = await sourcePage;
    try {
      await opened.waitForURL(source.url);
      assert.equal(await opened.evaluate(() => window.opener), null);
      await proseLink.waitFor();
    } finally {
      await opened.close();
    }
  } finally {
    await context.unroute(source.url, intercept);
  }
}
