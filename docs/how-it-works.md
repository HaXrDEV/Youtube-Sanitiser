# How it works

YouTube Sanitiser has no build step and no background script. The manifest loads three content scripts on YouTube pages, `defaults.js` (the default settings), `view-count.js` (reading view counts) and `content.js` (everything else), and the popup reads and writes the settings.

## Hiding things

`content.js` adds a small stylesheet to the page and hides things by giving them the `yt-sanitised` class, which sets `display: none`. Because the element is taken out of the layout rather than blanked, a hidden video doesn't leave a gap. A grid row whose videos are all hidden is collapsed too.

What gets hidden depends on the filter:

- **Shorts:** the Shorts shelves on the home page and in search (a shelf in search is recognised by the Shorts cards inside it), and sidebar videos marked as Shorts.
- **Playlists and mixes:** the older playlist and mix renderers, plus cards in YouTube's newer "lockup" layout whose content ID starts with `PL` (playlist) or `RD` (mix). Video IDs are always 11 characters long, so a plain video whose ID happens to start with those letters isn't mistaken for one. Neither is hidden on the You page (`/feed/you`), `/feed/playlists` or a channel's Playlists tab, where your own playlists and saved mixes live.
- **Low view count:** any video card whose view count is below your minimum.

## Keeping up with YouTube

YouTube builds most of the page after it loads, as you scroll and as you click around without a full page reload. The script handles that in two ways:

- A `MutationObserver` watches the page for new elements. Each one is filtered through the video card it belongs to, so a view count that arrives after its card still gets checked, and a freshly added card is checked once more shortly after, in case its details were still loading.
- When YouTube reports a navigation (the `yt-navigate-finish` and `yt-page-data-updated` events), every filter is removed and applied again from scratch, once, shortly after the last of the two.

A card is always checked from scratch, not just added to, because YouTube reuses cards for different videos. Otherwise a card that once showed a low-view video would stay hidden after it started showing a popular one.

## Reading view counts

Video cards come in a few shapes: the older `ytd-rich-item-renderer`, `ytd-video-renderer` and `ytd-compact-video-renderer`, and the newer `yt-lockup-view-model`, which sits inside a rich item on the home page and stands on its own in the watch page sidebar.

The script knows no language, so it never looks for the word "views". It finds the count by where it sits instead. On a lockup card, it's the metadata text right after the small ▷ icon. On the other cards, it's the first item of the metadata line under the title.

That text has to be a number with at most one word next to it, like `12.941`, `1,2 mio.` or `114万`. Anything else, like `38 watching` or an upload date, is left alone. The number is read without knowing the language's conventions. View counts are whole numbers, so in `12.941`, `12 941` or `12,34,567` every separator just groups digits, while in an abbreviated count like `1,2 mio.` a separator before one or two digits is the decimal point. Digits in other scripts, like Arabic `١٢` or Devanagari `१२`, are read too.

The word next to the number says how big it is. The script looks it up in two places:

- **The browser's own number formatting.** Chrome knows how each language abbreviates numbers (`1.2K`, `1,2 mio.`, `1.2万`, `12 लाख`), so the script asks it to abbreviate some sample numbers in the page's language and notes the words it uses.
- **Words learned on YouTube.** When YouTube uses a word the browser doesn't have, the script learns it from YouTube itself. A video page shows its own count both short, under the title (`1,1 mio. visninger`), and in full, in the tooltip next to it (`1.141.413 visninger`), and comparing the two gives the word and its size. A card's accessibility label helps too, since it spells the count out (`9,9 mil visualizaciones` for `9,9 K`).

A count the script can't read for certain is skipped, and that video stays visible.

`tests/view-count.test.js` checks all this against how YouTube writes counts in each of its languages. Run it with `node --test`, and refresh its examples with `node tests/capture-fixtures.js`.

## Subscribed channels

**Exclude subscribed channels** needs to know who you're subscribed to. The script reads the channel list from YouTube's sidebar, briefly opening its "Show more" list so the whole list is there, then closes it again. If you already have the list open, it reads it as it is and leaves it open. It does this only while the option is on, and keeps the list in memory for as long as the page is open.

A card is matched to a channel by its channel link or, failing that, by the channel name. Lockup cards don't link to the channel at all, and other cards sometimes link to it by its `/channel/` ID where the sidebar uses its handle.

## Settings

Settings live in `chrome.storage.sync`, so Chrome syncs them across your computers if sync is on. The popup saves each change straight away, and the content script listens for `chrome.storage.onChanged`, so a toggle takes effect in every open YouTube tab without a reload. The content script starts filtering only once it has loaded your settings, so nothing stays hidden by a filter you've turned off.

Magnitude words learned on YouTube are kept per language in `chrome.storage.local`, on this computer only, and every open YouTube tab picks up what another one learns.
