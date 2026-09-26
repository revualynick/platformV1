# Migration sources: what competitors let customers export (research, 2026-09-26)

Researched by web-firewall agents from each vendor's own docs. Confidence per item: confirmed (documented), inferred, not found. Treat "confirmed" as "documented to exist", not "field list verified against a real export".

## Culture Amp
- Employees: admin CSV export; Merge API / HRIS sync; no SCIM. Better sourced from the customer's HRIS.
- Goals: .xlsx export (description, progress, dates); alignment field not documented.
- Continuous feedback: admin CSV by email, with author and recipient.
- Performance reviews: admin export exists; fields and format undocumented (get a real export from a customer).
- 1:1 notes: no bulk export; each person exports their own only.
- Competency frameworks: import only, no export.
- Engagement surveys: aggregates, comments, raw extracts; groups under 5 suppressed; confidential, not anonymous. Import aggregates only.
- API: OAuth client credentials, endpoints behind login; old survey API deprecated.
- GDPR: CSV export on request (privacy@cultureamp.com), 90-day backup purge.
- Sources: support.cultureamp.com articles 7048543, 7048413, 9861835, 7048610, 8438326, 7048386, 8349777, 8675204; docs.api.cultureamp.com. Some answers rest on search summaries rather than a specific page.

## 15Five
- People: public API (Users, Groups, attributes); SCIM and HRIS connector are inbound only; no UI people CSV found.
- Reviews: per-cycle CSV (answers, comments, ratings), per-person history (CSV per cycle by email), PDF; API needs company + review + cycle admin.
- Objectives: CSV of public objectives only (title, owner, manager, dates, parent title, key results); API returns all objectives regardless of privacy. Parent references are titles, not IDs.
- Check-ins: CSV/XLSX reports (Q&A, Pulse, Priorities); not in the API.
- 1:1 notes/agendas/actions: private to participants, not exportable.
- High Fives: CSV report, feed download, API read.
- Engagement: CSV aggregates and comments; threshold 5 by default (3-4 allowed); per-respondent export probably not available.
- API: HTTP Basic with admin-only key, 5 requests/second, list endpoints; endpoint reference renders in JavaScript (not read).
- GDPR/account export: not found.
- Importer: API first for people, objectives, reviews, High Fives; check-ins via customer CSV upload; 1:1 history likely lost.

## Google Meet (for 1:1 ingestion, not migration)
- Meet REST API v2 exposes conferenceRecords.transcripts (+ entries) and conferenceRecords.smartNotes (Gemini notes metadata with a Docs pointer).
- Scopes: meetings.space.readonly (list conferences, participants, transcript entries; entries deleted 30 days after the meeting); drive.meet.readonly (restricted: only Meet-created files) to read the notes Doc text; drive.readonly works but is broad.
- Domain-wide delegation supported (counts as user auth); impersonate the organiser.
- Workspace Events API: transcript.v2.fileGenerated and smartNote.v2.fileGenerated; smartNote events only go to the organiser.
- Gemini notes Doc: organiser's Drive, auto-attached to the Calendar event; sharing chosen by the organiser.
- Restricted scope means Google app verification plus a security assessment if data is stored server-side.
- Still to confirm: transcript endpoint scopes, smartNotes preview status, Events subscription scopes, admin API controls page.

## Betterworks (weakest coverage: key export article returned 403, API docs need a login)
- People: REST API exposes users (ID, title, department, manager); HRIS sync is inbound only; SCIM and UI directory export not found.
- Reviews ("conversations"): API returns templates and responses; UI export is one conversation at a time via print/PDF; bulk CSV not found.
- Goals/OKRs: UI export to XLSX or PPTX (link by email); API has goal and milestone history with assessments and comments; alignment fields inferred.
- 1:1s/check-ins, feedback, recognition: not found (check-ins may be a conversation type).
- Surveys: overview report PDF or CSV (aggregate); polls PDF only; raw responses and thresholds not found.
- API: token auth, REST; rate limits and plan not found; api@betterworks.com.
- Next: read support article 360041343532 in a browser; ask for the API reference and a sample conversation export.

## Leapsome (help centre returned 403: findings from search summaries of Leapsome's own pages)
- People: Company > Employees > Export (Excel, same schema as its import); SCIM 2.0 (likely Enterprise + SSO); read-only Content API /users.
- Reviews: all-reviews export; per cycle answers, scores and status exports (glossary article exists); API /reviews.
- Goals: Goals > Actions > Export (Excel); API /goals with key results and initiatives; alignment not found.
- 1:1 meetings: admin analytics raw data; full content (talking points, action items) only via each employee's own export.
- Instant feedback: admin export with sender, receiver, text, visibility, linked skills.
- Surveys: raw data export exists; comments export respects the anonymity threshold (e.g. 3 per team).
- Competencies/templates: not found.
- Content API: read-only (reviews, goals, employees, payroll, time tracking); Swagger at api.leapsome.com/v1/api-docs.
- GDPR: DPA return-or-delete at termination; controller self-service export per individual.

## Workday Peakon Employee Voice (engagement only)
- People: SCIM inbound from Workday HCM (hourly); REST Employees and Segments endpoints out; manager hierarchy probably via attributes.
- Engagement: aggregate endpoints (overview, drivers, questions) respecting minimum segment size; Excel/PPT from the UI.
- Raw answers: Survey Answer Export API, identified by email or employee ID, off by default (Customer Care enables it), whole company only, forward-only from the enable date (no backfill), no UI download.
- Participation: aggregate only.
- Actions endpoints exist (fields not found); conversations and acknowledgements not exportable (not found).
- No performance, goals or 1:1s in Peakon (they live in Workday HCM).
- Offboarding: pull data via API or Excel/PPT before the instance is disabled; deletion within 6 months of termination.

## Lattice (help centre bodies did not load: mostly inferred from article titles and third-party summaries)
- People: admin CSV directory export; managers limited to direct reports; HRIS sync; SCIM via Okta (third-party claim).
- Reviews: cycle export and calibrated scores (CSV), review packets per person (PDF, singly or in bulk); column contents unverified.
- Goals: CSV export (Goals > Participation/Status); fields and alignment not found.
- 1:1s: only an adoption-statistics CSV; no export of note content found.
- Feedback: "Export Feedback via a Custom CSV" exists (scope unknown); praise not found.
- Surveys: Themes, Questions, Comments as CSV (aggregates + comments); pulse, onboarding and exit exports; thresholds not found.
- API: REST with an API key (developers.lattice.com); covers employees, goals, feedback, compensation (third-party); rate limits conflict (60 to 1000 RPM).
- Next: read developers.lattice.com and a real export.

## Cross-platform conclusions (for the importer design)
- People and org structure: take them from the HRIS or Google Workspace, not the old tool.
- Goals: exportable everywhere that has them (Culture Amp XLSX, 15Five CSV/API, Leapsome Excel/API, Betterworks XLSX/API); alignment fields are the uncertain part.
- Reviews: exportable but field lists are undocumented or behind logins everywhere; design each mapping from a real customer export.
- 1:1 notes: effectively not bulk-exportable anywhere (private to participants; per-person exports at best). Plan for no 1:1 history, or an optional per-person upload.
- Engagement: import aggregates only; raw answers are identified in some tools (Peakon, Culture Amp extracts) and should not be imported at individual level.
- Validation note: none of these agents had the Gemini second check available; content was filtered by WebFetch's own model only.
