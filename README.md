# Web Blocker & Timer

The simplest Web Blocker & Timer. Customizable block modes,  daily time limits,  schedules, and block screens.

<a href="https://chromewebstore.google.com/detail/web-blocker-timer/njmoiibhnbpgbgjjfoohndjfeolghkje">
  <img src="assets/available_on_chrome_webstore.png" width="250" alt="Available on the Chrome Web Store">
</a>
<br>
<a href="https://addons.mozilla.org/en-US/firefox/addon/web-blocker-timer/">
  <img src="assets/firefox_add_ons.png" width="250" alt="Available on Firefox Add-ons">
</a>

## Features
🔒 Mode-Based Blocking: Create custom categories (e.g. "Focus Mode," or "General Blocks") and configure tailored block lists for each.

⏱️ Daily Time Limits: Set custom time allowances for specific websites. 

📅 Scheduling: Enforce modes automatically. Define custom active time and days to automate your blocks.

🧩 Custom Block Pages: Personalize your block screen by uploading your own static HTML files.

## Block List Formats & Syntax

When editing a block mode, you can write blocking rules in several formats. Each line corresponds to one rule:

| Format / Example | Description |
| :--- | :--- |
| `facebook.com` | **Standard Block**: Blocks the domain (and subdomains) completely. |
| `youtube.com; 30` | **Daily Time Limit**: Restricts access to the domain to a maximum of 30 minutes daily. |
| `games` | **Keyword Block**: Blocks any website whose hostname contains the keyword "games" (e.g., `coolgames.com`). |
| `facebook.com, instagram.com; 20` | **Combined Daily Limit**: Combines the daily limit for multiple domains to a shared pool of 20 minutes. |
| `games; 20` | **Combined Daily Limit with Keyword**: Blocks any website whose hostname contains the keyword "games" (e.g., `coolgames.com`) and combines the daily limit for multiple domains to a shared pool of 20 minutes. |
| `!music.youtube.com`<br>`!https://www.reddit.com/r` | **Allowlist Exception**: Bypasses any block rules for specific subdomains or page subpaths (e.g. block `reddit.com` but allow `!https://www.reddit.com/r`). |


## Sample Custom Block Pages

The extension supports custom block page templates. You can find pre-made samples in the [blockpages_samples](./blockpages_samples) directory. You can upload them either as a single `.html` file or as a `.zip` archive containing the assets:


## License

GNU GENERAL PUBLIC LICENSE Version 3

