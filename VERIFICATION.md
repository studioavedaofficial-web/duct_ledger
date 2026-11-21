# Verification report

## Review and pricing fixes

All six requested acceptance cases passed in the automated checks. Testing used disposable Crescent Business Centre projects and a separately generated workshop drawing and workbook. Existing user projects were not used as test data.

| Case | Root cause and change | Observed result |
| --- | --- | --- |
| 1. Drawing evidence | The comparison viewer owned its sheet selector. The review table independently listed all project changes and could approve any ID. Review now resolves stable sheet and item IDs and enables confirmation only on rendered, matching side-by-side evidence. | M-102 had no change rows. All sheets showed SA-001 on M-101 · Ground Floor. Its old and new marks were visible. Tests also covered a failed render, switching sheets during an incomplete render, added items, removed sheets, and a physically reordered revised PDF whose matching sheet moved to page 2. |
| 2. BOQ compatibility | The old form accepted FT-EL and persisted it. A calculation error appeared after save. The editor, rate preview, loaded-item pricing and final checks now share unit validation. | Area-to-piece and area-to-length mismatches were blocked. A legacy FT-EL mapping loaded with a remapping warning. Repair restored the sample total. Tests distinguished aliases, missing prices, explicit zero and partial priced subtotals. |
| 3. BOQ arithmetic | Compact quantities had two display decimals while pricing used six decimals of quantity and rounded each item amount independently. | GI-RA has 38.955 m². Its four PKR amounts are 37,173.50, 4,703.13, 37,173.50 and 4,703.13. Their sum is 83,753.26. Reopened Excel numeric cells reproduced every amount and the subtotal to the cent. Mixed-rate groups disclosed their individual rates in the UI and Excel. |
| 4. Review status and money | The report previously summed every price change into one total. Confirmation only affected the final-issue gate. | Confirmed / pending / proposed PKR moved from 0 / 14,800 / 14,800 to 14,800 / 0 / 14,800. Reopening preserved the approval and one change row. Signed credits and separate commercial-unit legs reconciled. Scope and price edits invalidated affected approvals. |
| 5. Frozen baseline | The historical line-rounding rule was retained. | A remained PKR 249,971.26. B was PKR 264,771.26. SA-001 contributed PKR 10,000 scope and PKR 4,800 rate. The frozen revision stayed identical through editing and saving the working revision. |
| 6. Independent workflow | A separate single-page Tenant C workshop PDF, CSV rate sheet and client XLSX were generated for the test. | The real PDF.js renderer opened the drawing. Calibrating 200 page points to 5 m and checking a second 80-point dimension against 2 m verified scale. A 4 m run at 600 × 400 mm produced 8 m² and PKR 10,000. The downloaded client copy reopened with 8 in Schedule!C2, its F10 formula, B10 reference and font formatting preserved. The original C2 remained blank. Restoring the downloaded backup preserved revisions, amounts, original PDF bytes, stable item/sheet links and page number. |

### Checks run

- `npm test` passed 29 tests across the pricing and spreadsheet suite (15), standalone PDF rendering (1), workspace integration (10) and external-file workflow (3).
- Both pending and confirmed draft workbooks were reopened. The print report HTML contained the same status totals and an actual marked drawing excerpt. Each HTML report was also rendered to PDF with PyMuPDF and reopened to check the amounts and embedded image.
- `npm run build` passed TypeScript checking, Vite compilation and packaging of the offline assets.

### Files changed

- `src/App.tsx`, `src/Canvas.tsx` and `src/Reports.tsx` connect the sheet filter, drawing evidence, approval state, report metrics and printable report.
- `src/model.ts`, `src/Inspector.tsx`, `src/Imports.tsx` and `src/io.ts` implement unit checks, recoverable legacy mappings, BOQ detail and approval invalidation.
- `src/books.ts` exports numeric line calculations, group details, status totals and issue checks.
- `scripts/acceptance.test.ts`, `scripts/workspace.ui.test.tsx` and `scripts/external-workflow.ui.test.tsx` cover the regressions and external-file workflow. `README.md` and this report document usage and results.

### Verification boundaries

The automated application tests use React in a DOM emulator with simulated IndexedDB. The external-file workflow uses real PDF and XLSX bytes, PDF.js with a native canvas adapter, and the application's real import, pricing, export and restore handlers. ExcelJS reopened the workbooks. Desktop Excel 2016, the operating system's native print dialog and an offline browser restart were not exercised by that suite. The managed local preview relay timed out opening port 4173.

---

# Original release checks

The production TypeScript and Vite build succeeded. The automated suite exercised the pricing engine, original PDFs, workbook round trips and React workspace. Run `npm test` to repeat the checks.

| Acceptance case | Observed result |
| --- | --- |
| A · Baseline | 10 m at 600 × 400 mm produced 20 m² and PKR 50,000 at PKR 2,500/m². |
| B · Resized duct | Changing only width to 800 mm produced 24 m², +4 m² and +PKR 10,000. A React integration test clicked the report item and verified the selected SVG mark was SA-001. |
| C · Scope and rate | At PKR 2,700/m² the revised amount was PKR 64,800. Scope effect was PKR 10,000, rate effect PKR 4,800 and net variation PKR 14,800. The baseline retained PKR 50,000. |
| D · Fittings | Adding an elbow gave +PKR 2,400. Removing the same fitting gave −PKR 2,400. Reloading its revision produced one change. |
| E · Exceptions | Missing calibration, missing rate, incompatible unit and missing BOQ mapping generated exceptions. An explicit zero produced a valid zero amount. Unresolved checks blocked final workbook issue. |
| F · Drawing identity and persistence | A test physically reversed the revised PDF pages and paired them by stable sheet ID. PDF.js verified the drawing numbers on the new pages. The main duct remained 10 m after recalibration. The React test zoomed, rotated, switched sheets and remounted the app, preserving length and selection. A validated backup restored PDF bytes and identical totals into fresh simulated IndexedDB storage. A broken sheet reference was rejected. |
| G · Client workbook | The exported copy reopened with 24 m² in C2, the unrelated SUM formula in F12, reference text and font formatting intact. Formula targets were blocked. The original template retained its blank quantity cell. |

Additional tests covered circular area, explicit riser lengths, material waste, labour and piece-count treatment, per-metre pricing, commercial-unit changes, CSV/XLSX import, generated report worksheets and draft/final gating. PDF.js rendered all four sample pages and verified their drawing numbers and changed duct-size labels.

A separate React integration test created a project, imported a PDF, calibrated both sheets, measured a duct, imported the supplied Excel rates, mapped its BOQ code, froze the baseline, attached a revised PDF, paired pages, recalibrated, resized the duct and confirmed its variation. The final issue option became available, with baseline and revised amounts of PKR 50,000 and PKR 60,000 at the unchanged rate.

## Verification limits

The React integration tests use a DOM emulator and an in-memory IndexedDB implementation. Their PDF-rendering boundary is stubbed. The separate PDF tests use the actual PDF.js renderer and supplied files. The managed local preview relay timed out before opening its browser port. Native print-to-PDF output, an offline browser restart and opening the workbook in desktop Excel 2016 were not independently verified.

