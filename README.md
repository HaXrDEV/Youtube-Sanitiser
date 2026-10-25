<p align="center">
  <img src="docs/banner-light.svg#gh-light-mode-only" alt="YouTube Sanitiser" width="100%">
  <img src="docs/banner-dark.svg#gh-dark-mode-only" alt="YouTube Sanitiser" width="100%">
</p>

<p align="center">
  A Chrome and Firefox extension that hides Shorts, playlists, mixes, live streams,<br>
  low-view videos and videos you've watched from YouTube's recommendations.
</p>

<p align="center">
  <a href="manifest.json"><img src="https://img.shields.io/github/manifest-json/v/HaXrDEV/youtube-sanitiser?style=flat-square&label=version&color=ff0033" alt="Version"></a>
  <a href="https://github.com/HaXrDEV/youtube-sanitiser/actions/workflows/checks.yml"><img src="https://img.shields.io/github/actions/workflow/status/HaXrDEV/youtube-sanitiser/checks.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Chrome-Manifest_V3-4285f4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Manifest V3"></a>
  <a href="https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/"><img src="https://img.shields.io/badge/Firefox-Manifest_V3-ff7139?style=flat-square&logo=firefoxbrowser&logoColor=white" alt="Firefox Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#install">Install</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="docs/screenshot-light.png#gh-light-mode-only" alt="The YouTube Sanitiser popup" width="352">
  <img src="docs/screenshot-dark.png#gh-dark-mode-only" alt="The YouTube Sanitiser popup" width="352">
</p>

## Features

The filters only touch the feeds where YouTube recommends videos for you to discover: Home, search, hashtag and Explore pages, and the recommendations beside a video. Anything you open on purpose, like a channel, a playlist or your history, is never filtered, and your Subscriptions feed only is when you ask for it.

| Filter | Hides | Default |
| :--- | :--- | :---: |
| **Shorts** | Shorts shelves, and Shorts mixed in with other videos | On |
| **Playlists** | Playlist cards | On |
| **Mixes** | The Mix playlists YouTube generates for you | On |
| **Live streams** | Streams that are live right now. Recordings stay. | Off |
| **Low view count** | Videos under a minimum you choose, 10,000 by default | Off |
| **Watched videos** | Videos you've watched at least a share of, 90% by default | Off |

- **Instant.** Changes apply to every open YouTube tab, and settings follow you through your browser's sync.
- **Subscriptions exempt.** *Keep subscribed channels* still shows live streams and small videos from the channels you follow.
- **Subscriptions too, if you like.** Shorts, live streams and watched videos each have an *Also in Subscriptions* option that filters your Subscriptions feed as well. For live streams it's there while *Keep subscribed channels* is off.
- **Any language.** View counts are read in every language YouTube offers.

## Install

Clone this repository, or download and unzip it. Then:

**Chrome**

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the repository folder.

**Firefox** (140 or later)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json` in the repository folder.

Firefox removes a temporary add-on when it closes, so you load it again after a restart.

## Privacy

The extension collects nothing and sends nothing anywhere. Settings stay in your browser's own storage. *Keep subscribed channels* reads your subscriptions from YouTube's sidebar, briefly expanding its *Show more* list, and keeps them in memory only. See the [privacy policy](privacy-policy.md).

## Development

There is no build step and nothing to install. Run the tests with:

```bash
node --test
```

After changing the code, reload the extension on `chrome://extensions` (or `about:debugging` in Firefox) and refresh YouTube. [How it works](docs/how-it-works.md) explains how it finds and hides things.

## License

[MIT](LICENSE)
