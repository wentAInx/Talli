import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import { RecurringManager } from "../../../components/automation/recurring-manager";

describe("RecurringManager App-timezone defaults", () => {
  it("uses the server-computed App-local date for a new recurring anchor", () => {
    const markup = renderToStaticMarkup(
      createElement(RecurringManager, {
        bookId: "book-1",
        items: [],
        accounts: [],
        categories: [],
        tags: [],
        currentLocalDate: "2026-08-15",
      }),
    );

    expect(markup).toMatch(
      /<input(?=[^>]*name="anchorDate")(?=[^>]*value="2026-08-15")[^>]*>/,
    );
  });
});
