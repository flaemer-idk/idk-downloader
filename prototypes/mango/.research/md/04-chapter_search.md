---
order: 94
icon: search
label: Search
---

# Searching for chapters

Listing chapters related to an entity typically relies on **feed**s. There are currently 3 chapter feed endpoints:

- `GET /manga/{id}/feed` Will list all Chapter for a given Manga
- `GET /user/follows/manga/feed` Will list all Chapter for your followed Manga
- `GET /list/{id}/feed` Will list all Chapter for a given CustomList

(Please check the endpoint documentation for more details about each of these)

When not overridden, they all apply a default filter of `publishAt <= NOW()`. This is because we don't usually want
chapters showing up before they are available.

The following query parameters can be used to override this behaviour:

- `includeEmptyPages` is used to show Chapters with no pages available
- `includeFuturePublishAt` is used to show Chapters with a publishAt date set in the future
- `includeExternalUrl` is used to show Chapter that have an external url attached to them

Using any of them implicitly disables the default filter (which is equivalent to `includeFuturePublishAt=0`).

> The "include" part of their name can be somewhat misleading. Read below.

Each filter has 3 possible values:

- it is unset: and thus not applied in any way
- 1: Will **require** it to be true for all returned chapters
- 0: Will **require** it to be false for all returned chapters

## Examples

    /manga/{id}/feed?includeFuturePublishAt=1

Shows **only** Chapters that have a publishAt value in the future. In that way it would be better
names `onlyFuturePublishAt`.

    /manga/{id}/feed?includeFuturePublishAt=0

Shows **only** Chapters that have a publishAt value in the past. In that case "include" is correct.

    /manga/{id}/feed?includeFuturePublishAt=1&includeExternalUrl=0

Shows **only** Chapters with a publishAt value in the future and no external URL attached.
