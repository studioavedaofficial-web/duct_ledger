# Verification report

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

