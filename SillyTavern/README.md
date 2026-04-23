# Weyland Tavern

**A purpose-built client for Weyland University.**

Weyland Tavern is a fork of [SillyTavern](https://github.com/SillyTavern/SillyTavern), heavily modified to serve as the frontend for a single fictional setting: Weyland University, a roleplay world developed by Lucky Paw and collaborators. It is not a general-purpose SillyTavern replacement, and it is not cross-compatible with standard SillyTavern character cards.

If you're looking for a general-purpose LLM roleplay frontend for your own characters and settings, you want [SillyTavern](https://github.com/SillyTavern/SillyTavern). It's excellent, it's actively developed, and it's what Weyland Tavern is built on top of.

\---

## 🔗 Join Us

# [**➡️ Join the Weyland Discord**](Discord.gg/Weyland)

# [**☕ Support on Ko-fi (Paw Patrol Subscription)**](https://ko-fi.com/luckypaw)

\---

## Credit where it's due

Weyland Tavern exists because SillyTavern exists. The core frontend — the engine, the extension system, the API handling, the prompt architecture — is the work of **Cohee**, **RossAscends**, **Wolfsblvt**, and the 300+ contributors to the SillyTavern project. Weyland Tavern is a derivative work that adds a specific setting, character system, various features and UI layer on top of their foundation.

SillyTavern is licensed under **AGPL-3.0**, and Weyland Tavern inherits that license. The LICENSE file in this repository is the original, unmodified SillyTavern license. All modifications made by the Weyland Tavern team are released under the same license and are publicly visible in this repository's commit history.

* **Upstream project:** https://github.com/SillyTavern/SillyTavern
* **Upstream documentation:** https://docs.sillytavern.app

\---

## What Weyland Tavern is

Weyland Tavern is a client for the **Weyland University** roleplay setting — a closed-world narrative environment with a wide cast of deeply hand-written characters, a shared campus, a unified aesthetic, and a heavily pre-configured backend designed to remove the technical setup burden from the user.

Features built on top of SillyTavern include:

* A visual novel-style interface with per-character expression and outfit suites
* An integrated character downloader and updater
* An in-app message tracker
* A snooze-able long-term memory system
* Custom narrator/writing-style presets
* World-wide shared location and cast data across every character
* +many more

## What Weyland Tavern is not

* **It is not cross-compatible with SillyTavern.** Weyland Tavern has no card import button. Standard SillyTavern character cards will not function here, and Weyland characters will not function in standard SillyTavern.
* **It is not a general-purpose roleplay frontend.** The entire system is tuned for one setting. If you want flexibility, use SillyTavern.
* **It is not a replacement for or competitor to SillyTavern.** It is a niche client for a niche creative project.

\---

## Free and paid

**The code is free.** This repository is AGPL-3.0. Clone it, fork it, modify it, redistribute it — the license permits all of that, subject to AGPL's source-availability requirements.

**The content and service are subscription-based.** Access to the Weyland character library, the API infrastructure that powers them, and official support is provided through the **Paw Patrol** subscription, starting at $10/month on Ko-fi. Without a subscription, Weyland Tavern can be downloaded and run, but there are no characters to load into it — the character files are delivered via the integrated downloader, which authenticates against the subscription API.

This is a deliberate architecture. The engine (fork of SillyTavern) remains free and open. The original creative content (characters, setting, prompts) and the infrastructure to serve it are what the subscription pays for.

\---

## Installation

### For Weyland subscribers

If you're here to use Weyland Tavern as a subscriber, **don't install from this repo directly** — the guided installer, setup walkthroughs, API configuration, and troubleshooting all live in the Weyland Discord's `#tavern-guide` channel. Join the Discord, follow the guide, and you'll be running in a few minutes.

# [**➡️ Weyland Discord**](Discord.gg/Weyland)

### For developers, the curious, and AGPL-minded folks

If you want to inspect the fork, build from source, or run it outside the subscription flow, here's the manual path. Note that without a subscription you can launch Weyland Tavern, but you won't have any characters to load — the character library is gated behind the Paw Patrol API.

**Prerequisites:**

* [Node.js](https://nodejs.org/en/download) (v22+)
* [Git](https://git-scm.com/download)

**Windows / Mac / Linux:**

```bash
git clone https://github.com/Shirubaurufu/WeylandTavern -b release
cd WeylandTavern
```

Then launch with the script for your platform:

* **Windows:** double-click `Start-WeylandTavernWindows.bat`
* **macOS / Linux:** `bash Start-WeylandTavernOther.sh` (or `./Start-WeylandTavernOther.sh`)

Weyland Tavern runs on **port 8000** by default. Keep the launched terminal window open — closing it stops the server.

**Android (Termux):** supported via the same `git clone` flow; install `git` and `nodejs` via `pkg install`, run `npm install` inside `WeylandTavern/SillyTavern`, then `bash Start-WeylandTavernOther.sh` from the repo root.

**iOS:** not natively supported. Run on a PC/Mac/Android device and access remotely via Tailscale or a similar overlay network.
---
REDISTRIBUTION / DERIVATIVE WORKS:
The character definitions, personas, and setting content embedded in these files are the proprietary creative property of Lucky Paw. Distribution of this software does not grant any license to reproduce, reuse, or create derivative works from this content outside of Weyland Tavern.

\---

## Community \& Support

# [**➡️ Weyland Discord**](Discord.gg/Weyland)

# [**☕ Paw Patrol Subscription on Ko-fi**](https://ko-fi.com/luckypaw)

For SillyTavern itself — bug reports, feature requests, general ST questions — please direct those to the [upstream project](https://github.com/SillyTavern/SillyTavern). Weyland Tavern's scope is limited to the Weyland setting.
