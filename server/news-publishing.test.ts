import { describe, expect, it } from "vitest";
import { extractImages, htmlToReadableText, htmlToReadableTextWithImageMarkers, retainPersistedImageMarkers } from "./articleImport";
import { appRouter, articleWriteSchema } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("article status validation", () => {
  const baseArticle = {
    title: "An authorized newsroom story",
    summary: "A sufficiently descriptive summary for editorial review.",
    content: "This is enough body content for a valid editorial article import.",
    sourceUrl: "https://publisher.example.com/articles/one",
    categoryName: "World",
    tagNames: ["reporting"],
  };

  it("accepts each required status spelling", () => {
    (["draft", "pending review", "published"] as const).forEach(status => {
      expect(articleWriteSchema.safeParse({ ...baseArticle, status }).success).toBe(true);
    });
  });

  it("rejects a status outside the required workflow", () => {
    expect(articleWriteSchema.safeParse({ ...baseArticle, status: "scheduled" }).success).toBe(false);
  });
});

describe("authorized import parsing", () => {
  it("removes executable page content and keeps readable paragraphs", () => {
    const readable = htmlToReadableText("<article><h1>Story</h1><p>First paragraph.</p><script>ignore()</script><p>Second paragraph &amp; context.</p></article>");
    expect(readable).toContain("Story");
    expect(readable).toContain("First paragraph.");
    expect(readable).toContain("Second paragraph & context.");
    expect(readable).not.toContain("ignore");
  });

  it("resolves, de-duplicates, and orders remote image URLs", () => {
    const images = extractImages('<img src="/hero.jpg" alt="Hero"><img src="/hero.jpg"><img src="data:image/png;base64,aaa"><img data-src="https://cdn.example.com/inline.webp" alt="Inline">', "https://publisher.example.com/story");
    expect(images).toEqual([
      { url: "https://publisher.example.com/hero.jpg", altText: "Hero", index: 0 },
      { url: "https://cdn.example.com/inline.webp", altText: "Inline", index: 1 },
    ]);
  });

  it("preserves each source image relative to its surrounding article text", () => {
    const source = htmlToReadableTextWithImageMarkers("<article><p>Before the first image.</p><img src=\"/first.jpg\"><p>Between images.</p><img src=\"/second.jpg\"><p>After the second image.</p></article>", "https://publisher.example.com/story");
    expect(source.indexOf("Before the first image.")).toBeLessThan(source.indexOf("{{image:0}}"));
    expect(source.indexOf("{{image:0}}")).toBeLessThan(source.indexOf("Between images."));
    expect(source.indexOf("Between images.")).toBeLessThan(source.indexOf("{{image:1}}"));
    expect(source.indexOf("{{image:1}}")).toBeLessThan(source.indexOf("After the second image."));
  });

  it("removes only failed image markers without moving persisted images", () => {
    const result = retainPersistedImageMarkers("One.\n\n{{image:0}}\n\nTwo.\n\n{{image:1}}\n\nThree.", [1]);
    expect(result).not.toContain("{{image:0}}");
    expect(result.indexOf("Two.")).toBeLessThan(result.indexOf("{{image:1}}"));
    expect(result.indexOf("{{image:1}}")).toBeLessThan(result.indexOf("Three."));
  });
});

describe("article management access", () => {
  const validArticle = {
    title: "An authorized newsroom story",
    summary: "A sufficiently descriptive summary for editorial review.",
    content: "This is enough body content for a valid editorial article import.",
    status: "draft" as const,
    sourceUrl: "https://publisher.example.com/articles/one",
    categoryName: "World",
    tagNames: ["reporting"],
  };

  function ordinaryUserCaller() {
    const ctx = {
      user: {
        id: 1,
        openId: "ordinary-user",
        name: "Reader",
        email: "reader@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    } as TrpcContext;
    return appRouter.createCaller(ctx);
  }

  it("rejects content management requests from a non-administrator", async () => {
    const caller = ordinaryUserCaller();
    await expect(caller.admin.listArticles({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects create, update, and delete requests from a non-administrator", async () => {
    const caller = ordinaryUserCaller();
    await expect(caller.admin.createArticle(validArticle)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.updateArticle({ id: 9, article: validArticle })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.deleteArticle({ id: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
