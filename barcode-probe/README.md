# UGA barcode probe

Tiny standalone tester: does a UGA dining shelf label expose a scannable
barcode or QR that we could map to a dish?

This is **not** part of the main Plate app. It only prints the raw scan so you
can decide whether barcode login is realistic.

## Run

```bash
cd barcode-probe
npm install
npm run dev
```

Open the printed URL on your phone (same wifi). Camera needs **HTTPS or
localhost**; if iOS blocks the camera on `http://192.168…`, use **Or pick a
photo** (shoot the label with the Camera app, then choose the image).

## What to do in the dining hall

1. Start camera (or pick photos) at Bolton / Snelling / etc.
2. Aim at whatever code is on the e-ink shelf label.
3. Save 5–10 successful reads (history stays in this phone’s localStorage).
4. Ask:
   - Did most labels scan at all?
   - Is the value stable for the same dish?
   - Does it look like Nutrislice `synced_id` (often short digits) or a URL?

## How to read the result

| Outcome | Meaning for UGA Plate |
|---|---|
| Reliable scans + stable ids | Barcode can be the fast path; wire ids into the catalog |
| Scans but random / unusable ids | Scanner works, mapping doesn’t — don’t replace Gemini yet |
| Never scans | Labels aren’t phone-scannable — keep search + OCR |

## Stack

- [html5-qrcode](https://github.com/mebjas/html5-qrcode) (QR + common 1D formats)
- Vite for a one-command local server
