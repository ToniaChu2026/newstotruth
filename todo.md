# Project TODO

- [x] Define database tables for articles, categories, tags, article-tag assignments, and imported media metadata.
- [x] Apply a single database migration for the news publishing data model.
- [x] Build a polished public news homepage with published-article pagination and category filtering.
- [x] Build a public article detail page that renders full article content, inline images, category, tags, publish time, and source link.
- [x] Build a protected administrator dashboard for all article statuses: draft, pending review, published.
- [x] Build administrator article editing, deletion, preview, status selection, and one-click publishing controls.
- [x] Build a backend URL-import workflow for authorized content that fetches title, body text, source URL, and eligible images into a draft.
- [x] Build backend automatic remote-image download and S3 upload persistence, retaining only stable S3 image references in article drafts.
- [x] Add category and tag assignment controls to the administrator article workflow.
- [x] Add automated tests for article status validation, article URL import parsing, image-persistence handling, and article CRUD access controls.
- [x] Verify public and administrator interfaces on desktop and mobile viewports.
- [x] Add explicit retryable error states for public homepage category and article queries.
- [x] Preserve imported image positions by rendering media within article content order rather than only after all text.
- [x] Add a distinct public article-detail query error state separate from unavailable article handling.
- [x] Add non-administrator denial tests for article create, update, and delete procedures.
- [x] Preserve original source-document image positions during import rather than distributing media markers evenly across paragraphs.
