<div align="center">
  <img src="./apps/kalponik-app/public/icon.png" alt="Kalponik logo" width="20%" />
  <h1>Kalponik · কাল্পনিক</h1>
  <p><strong>Your imagination, synced across your devices.</strong><br>
  <em>Get lost in a book, then pick it up anywhere.</em></p>

Kalponik (Bengali for "imaginary") is a personal, self-hosted ebook reader for
the web and Android, with your library, highlights and reading position synced
between them.

**Kalponik is built on [Readest](https://github.com/readest/readest)**, the
open-source ebook reader by the Readest team and contributors, itself a modern
rewrite of [Foliate](https://github.com/johnfactotum/foliate) on
[Next.js](https://github.com/vercel/next.js) and
[Tauri v2](https://github.com/tauri-apps/tauri). Nearly everything that makes
it a good reader comes from their work; see [Built on Readest](#built-on-readest).

[![AGPL Licence][badge-license]](LICENSE)
[![Latest release][badge-release]][link-gh-releases]
[![Last commit][badge-last-commit]][link-gh-commits]

</div>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#get-kalponik">Get Kalponik</a> •
  <a href="#host-your-own">Host Your Own</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#built-on-readest">Built on Readest</a> •
  <a href="#license">License</a>
</p>

## Features

What Kalponik adds:

| **Feature**                     | **Description**                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Self-hosted, for $0**         | A free hosted Supabase project for accounts and sync, and your own S3-compatible storage (such as Garage) for book files. |
| **Invite-only sign-up**         | People join with an invite link or ask for access; admins approve requests, make invites and add other admins. |
| **Public and private shelves**  | Your books are yours alone; share one on the public shelf and everyone on your instance can read it.          |
| **Reading sets**                | Your reader settings per kind of book (text, or PDF and fixed layout), with three saved sets and presets, synced per account. |
| **Updates from your releases**  | The Android app updates itself from your own GitHub releases.                                                 |

What it keeps from Readest:

| **Feature**                                | **Description**                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Multi-Format Support**                   | EPUB, PDF, MOBI, KF8 (AZW3), FB2, CBZ, TXT, HTML and MD (Markdown).                                                     |
| **Scroll/Page View Modes**                 | Switch between scrolling and paginated reading.                                                                        |
| **Full-Text Search**                       | Search inside a book or across the current library shelf.                                                              |
| **Annotations and Highlighting**           | Highlights, bookmarks and notes, with an instant mode for quicker highlighting.                                         |
| **Dictionary/Wikipedia Lookup**            | Look up words with built-in sources or import local packs, including Yomitan ZIP/RDICT, from Settings → Custom Dictionaries. |
| **Parallel Read**                          | Read two books or documents side by side.                                                                              |
| **Customize Font and Layout**              | Adjust font, layout, theme mode and theme colors.                                                                      |
| **Code Syntax Highlighting**               | Read software manuals with colored code examples.                                                                      |
| **Library Management**                     | Organize, sort and manage your library.                                                                                |
| **OPDS/Calibre Integration**               | Browse OPDS catalogs and Calibre libraries.                                                                            |
| **Web Page Clipping**                      | Clip web pages and web-novel chapters into your library.                                                               |
| **Translation**                            | Translate a sentence or a whole book with Yandex, or with DeepL given your own API key on the server.                  |
| **Text-to-Speech (TTS) Support**           | Multilingual narration, even within a single book.                                                                     |
| [**Read-Along Narration**][link-readalong] | Play EPUB 3 Media Overlays with timed highlighting, or pair a reflowable EPUB with DRM-free MP3, M4A or M4B narration.  |
| **Sync across Devices**                    | Book files, reading progress, notes and bookmarks follow you between the web and Android.                              |
| **Sync with KOReader**                     | Sync reading progress, notes and bookmarks with [KOReader][link-koreader] devices.                                     |
| **Accessibility**                          | Full keyboard navigation and screen reader support (TalkBack, VoiceOver, NVDA, Orca).                                  |
| **Visual & Focus Aids**                    | Reading ruler, paragraph-by-paragraph mode and speed reading.                                                          |

## Get Kalponik

Kalponik's own instance is invite-only. If you have an invite:

- **Android:** install the APK from the [latest release][link-gh-releases]. After that, the app updates itself.
- **Web:** open the address in your invite and read in any modern browser.

## Host Your Own

To run your own copy (the web app, the Android app, your own server and a free
Supabase project), follow **[Host your own Kalponik](./SELF-HOSTING.md)**.

## Documentation

- [Host your own Kalponik](./SELF-HOSTING.md): server, storage, Supabase and the Android build.
- [Getting Started](./CONTRIBUTING.md#getting-started): building from source.
- Contributor references: [architecture](./apps/kalponik-app/docs/architecture.md),
  [code layout](./apps/kalponik-app/docs/code-layout.md) and
  [testing](./apps/kalponik-app/docs/testing.md).
- Using the reader: most of [Readest's documentation](https://readest.com/docs)
  applies, since the reader itself is Readest's.

## Contributing

Issues and pull requests are welcome. Please read the
[contributing guidelines](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first. Bugs in the reader itself are
often Readest's too: check [Readest's issues](https://github.com/readest/readest/issues)
and consider fixing them there, so everyone benefits.

## Built on Readest

Kalponik is a fork of [Readest](https://github.com/readest/readest)
([readest.com](https://readest.com)). The reader itself, its formats, its
sync design and most of this repository's history are the work of the Readest
team and [its contributors](https://github.com/readest/readest/graphs/contributors).
Kalponik adds self-hosting on a free Supabase project and your own S3 storage,
invite-only sign-up, public and private shelves, reading sets, and its own name
and look. If you want a polished reader with official apps for every platform,
use and [support Readest](https://donate.readest.com).

## License

Kalponik is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.html) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See the [LICENSE](LICENSE) file for details.

The following libraries and frameworks are used in this software:

- [Readest](https://github.com/readest/readest), which is AGPL-3.0 licensed.
- [foliate-js](https://github.com/johnfactotum/foliate-js), which is MIT licensed.
- [zip.js](https://github.com/gildas-lormeau/zip.js), which is licensed under the BSD-3-Clause license.
- [fflate](https://github.com/101arrowz/fflate), which is MIT licensed.
- [PDF.js](https://github.com/mozilla/pdf.js), which is licensed under Apache License 2.0.
- [daisyUI](https://github.com/saadeghi/daisyui), which is MIT licensed.
- [marked](https://github.com/markedjs/marked), which is MIT licensed.
- [next.js](https://github.com/vercel/next.js), which is MIT licensed.
- [react-icons](https://github.com/react-icons/react-icons), which has various open-source licenses.
- [react](https://github.com/facebook/react), which is MIT licensed.
- [tauri](https://github.com/tauri-apps/tauri), which is MIT licensed.

The following fonts are utilized in this software, either bundled within the application or provided through web fonts:

[Bitter](https://fonts.google.com/specimen/Bitter), [Fira Code](https://fonts.google.com/specimen/Fira+Code), [Inter](https://fonts.google.com/specimen/Inter), [Literata](https://fonts.google.com/specimen/Literata), [Merriweather](https://fonts.google.com/specimen/Merriweather), [Noto Sans](https://fonts.google.com/specimen/Noto+Sans), [Roboto](https://fonts.google.com/specimen/Roboto), [LXGW WenKai](https://github.com/lxgw/LxgwWenKai), [MiSans](https://hyperos.mi.com/font/en/), [Source Han](https://github.com/adobe-fonts/source-han-sans/), [WenQuanYi Micro Hei](http://wenq.org/wqy2/)

We would also like to thank the [Web Chinese Fonts Plan](https://chinese-font.netlify.app) for offering open-source tools that enable the use of Chinese fonts on the web.

---

<div align="center" style="color: gray;">Get lost in a book with Kalponik.</div>

[badge-license]: https://img.shields.io/badge/license-AGPL--3.0-teal
[badge-release]: https://img.shields.io/github/v/release/AsefHossainKhan/kalponik?color=green
[badge-last-commit]: https://img.shields.io/github/last-commit/AsefHossainKhan/kalponik?color=blue
[link-gh-releases]: https://github.com/AsefHossainKhan/kalponik/releases/latest
[link-gh-commits]: https://github.com/AsefHossainKhan/kalponik/commits/main
[link-koreader]: https://github.com/koreader/koreader
[link-readalong]: ./apps/kalponik-app/docs/read-along-narration.md
