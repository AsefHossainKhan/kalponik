---
name: kalponik-on-kindle-feasibility
description: "Research on running Kalponik itself on Kindle (CEF/WPE/miniblink, native UI + MuPDF); full handoff lives in a gitignored plans file; memory comparison not yet run"
metadata:
  type: project
---

Research thread (2026-11-03/04) on running Kalponik directly on Kindle, as opposed to the KOReader + `kalponik.koplugin` route. The full record is in `apps/kalponik-app/.claude/plans/kindle-feasibility-research.md`. That file is gitignored and exists on the Mac and on the Linux box (192.168.2.3), where the work continues.

Conclusions so far, none measured on a device:
- Memory is the blocker: many Kindles have 512 MB, and there's no usable GPU on MT8110 models.
- Only the 1 GB Kindles look plausible for a web engine. WPE WebKit is the best engine candidate.
- A native UI plus MuPDF would fit better, but that is a new app.

**Why:** the maintainer is weighing a Kalponik-built Kindle app. Kalponik Android is reported smooth on the Xteink S4 (2 GB, 32-bit Android). That result doesn't transfer to Kindle.

**How to apply:** read the plans file before more research. Its section 10 is the pending memory comparison: foliate demo vs Kalponik UI, CEF default vs low-memory switches, and WPE. Keep competitor app names out of these notes (see [[feedback-no-competitor-names-in-public]]).
