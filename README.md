# 40K QuickSheet Web

Web/PWA conversion of the Windows 40K QuickSheet app.

Current status: **early alpha**.

## Hosting plan

The app is intended to run on **GitHub Pages** and be linked from the Wix site. That gives it a normal HTTPS top-level page, which is much better for microphone permissions and PWA behaviour than embedding it in a Wix iframe.

## Current web features

- Responsive QuickSheet interface
- Separate army tabs
- New Recruit JSON import
- Imported-list remove button
- Unit categories
- MATCHES section during search
- Army Rules / Detachments / Stratagems pinned below the unit list
- Fuzzy unit search
- Wake-word voice control, default `check`
- `check switch` cycles army/imported-list tabs
- MIC ON/OFF toggle
- PWA shell

## Current fix

The left unit browser now has its own mouse/touch scrolling region. The layout uses flex sizing with `min-height: 0` rather than assuming a fixed header height.

## Data

The goal is to build the browser-ready JSON automatically from the current community 11th-edition data, so users download compact generated data rather than parsing the upstream catalogues in their browser.
