# DuctLedger

A local-first HVAC takeoff and variation-pricing workspace for a single estimator. The first launch opens Crescent Business Centre, an original two-revision sample tender in Lahore. Revision A is approved and frozen. Revision B is editable.

## Run locally

The delivery ZIP includes a ready-built `dist` folder. With Python 3 installed, serve it locally with

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8000`. This local build can run without an internet connection.

To develop from source, use Node.js 24 LTS and npm. In this directory, run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Keep the same browser profile and origin to reopen saved work. For a production build with offline caching, run

```sh
npm run build
npx vite preview --host 127.0.0.1
```

Open the production build once while connected so the service worker can cache its assets. Fonts, PDF.js, its worker, PDF font data, image decoders and the sample files are bundled. A new installation needs network access for `npm ci`.

## Use the sample tender

Select **SA-001** on **M-101**. Revision B shows an 800 × 400 mm rectangular duct, a 10 m measured route, 24 m² of net area and an amount of PKR 64,800. Select **Reports** to inspect the PKR 14,800 variation. Select the item ID to return to its highlighted drawing geometry. **Projects → Open sample tender** creates a fresh editable sample.

## Estimate your own tender

1. Choose **Projects → Create project**, then **Add sheets** to import your PDF. Each PDF page becomes a sheet with a stable ID.
2. Choose **Calibrate sheet** below the canvas. Click the two ends of a known dimension, then enter its length in metres or millimetres. **Verify dimension** checks a second dimension with a 1% tolerance. **Edit sheet details** sets the drawing number and title.
3. Use **Measure** to trace a straight run between fitting boundaries, place a counted fitting or locate a riser. Enter riser height explicitly. Use the inspector pencil to edit properties or redraw geometry. Pan, rotate and zoom affect the view only.
4. In **BOQ → Import rates**, choose a CSV or the first worksheet of an XLSX file. Map columns, review prices and correct flagged rows. Each code has one commercial unit and a material or labour basis. Map items to rate codes in the inspector. Expand a grouped BOQ row to see its source items.
5. Resolve exceptions, then **Approve & freeze** Revision A in **Revisions**. This locks its drawings, geometry, calibration, rates, waste assumptions and quantities.
6. From the latest frozen revision, choose **Create revision**. Attach a revised PDF and explicitly pair corresponding pages. Recalibrate the revised sheets, review carried measurements, edit sizes and routes, add new items and remove deleted scope.
7. Compare paired sheets side by side or in overlay. **Align points** uses two corresponding points on each drawing. This transformation applies only to the overlay.
8. Confirm changed items, then export a workbook or printable client report. Draft reports include outstanding checks. Final issue requires resolved quantities, rates, queries and change confirmations. **Query** pins a tender question to its drawing location.

For a mixed-scale drawing, mark the sheet as containing multiple scales in calibration settings. Measurement is then blocked for that sheet. Export its individual drawing regions as separate PDF sheets and calibrate them independently.

## Quantities and pricing

- Rectangular net sheet area equals twice the sum of width and height in metres, multiplied by length in metres. Circular net sheet area equals π × diameter in metres × length in metres.
- Linear rates use measured length. Square-metre rates use net sheet area. Fittings use explicit per-piece prices.
- Material waste increases the material quantity once. Labour quantities and piece counts are unaffected.
- Priced quantities retain six decimal places. Monetary amounts and scope effects round per line to two decimals. Rate effect is the line variation less its rounded scope effect so cent-level residuals reconcile.
- For comparable lines, scope effect uses the old rate on the quantity difference. Rate effect uses the new quantity on the rate difference. New scope receives its full new amount. Removed scope receives a credit for its old amount. A commercial-unit change produces linked removal and addition lines.
- Priced subtotals include resolved amounts. Unresolved lines display a dash and appear in the exception register. An explicitly entered zero is a valid rate.

## Reports and backups

**Export report** creates an Excel workbook with Estimate, BOQ, Variation summary, Detailed changes and Outstanding queries worksheets. Estimate and change item IDs link to the corresponding local project. The printable report includes marked drawing excerpts. Choose **Save as PDF** in the browser print dialog.

**Populate client BOQ** reads a simple XLSX workbook, maps code and quantity columns and previews each destination cell. Confirming downloads a separate copy. Formula targets, duplicate or absent matches, merged targets and unsupported advanced workbook features block that write. The generated-workbook export remains available.

Projects and PDF bytes are stored in IndexedDB. **Projects → Back up project** downloads a self-contained `.ductledger` file. **Restore backup** validates it before saving. If the project already exists, restoration makes a separate copy. Changing browser profile or origin requires restoring a backup.

## Included files

- [Revision A drawing](public/samples/ductledger-rev-a.pdf) and [Revision B drawing](public/samples/ductledger-rev-b.pdf), each with two original sheets
- [Contractor rate workbook](public/samples/contractor-rates.xlsx) and [CSV rate sheet](public/samples/contractor-rates.csv)
- [Client BOQ template](public/samples/client-boq.xlsx) with formatted reference cells and formulas
- [Verification report](VERIFICATION.md)

## Source and tests

React and TypeScript provide the workspace. PDF.js renders original pages beneath the SVG measurement layer. Geometry is stored in unrotated scale-1 page coordinates with a top-left origin. ExcelJS reads and writes the supported workbooks.

`src/model.ts` contains the shared quantity, pricing, comparison, sheet-pairing and aggregation functions. `src/io.ts` handles IndexedDB, PDFs and backup validation. `src/books.ts` implements workbook import and export. The sample geometry and rates are in `src/sampleLayout.ts`.

Run `npm test` for the acceptance, PDF rendering and workspace integration tests. Run `npm run samples` to regenerate the sample rate sheets and client workbook.

