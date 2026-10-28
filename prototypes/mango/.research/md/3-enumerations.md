---
order: 88
icon: list-ordered
label: Static Data
---

# Static Data

## Language Codes & Localization

To denote Chapter Translation language, translated fields such as Titles and Descriptions, the API expects a 2-letter
language code in accordance with the [ISO 639-1 standard](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).
Additionally, some cases require the [5-letter extension](https://en.wikipedia.org/wiki/IETF_language_tag) if the
alpha-2 code is not sufficient to determine the correct sub-type of a language, in the style of $language-$region,
e.g. `zh-hk` or `pt-br`.

Because there is no standardized method of denoting romanized translations, we chose to append the `-ro` suffix. For
example the romanized version of `五等分の花嫁` is `5Toubun no Hanayome` or `Gotoubun no Hanayome`. Both would have
the `ja-ro` language code, alternative versions are inserted as alternative titles. This is a clear distinction from the
localized `en` translation `The Quintessential Quintuplets`

Notable exceptions are in the table below, otherwise ask a staff member if unsure.

| alpha-5 | Description            |
|---------|------------------------|
| `zh`    | Simplified Chinese     |
| `zh-hk` | Traditional Chinese    |
| `pt-br` | Brazilian Portugese    |
| `es`    | Castilian Spanish      |
| `es-la` | Latin American Spanish |
| `ja-ro` | Romanized Japanese     |
| `ko-ro` | Romanized Korean       |
| `zh-ro` | Romanized Chinese      |

## Manga publication demographic

| Value   | Description        |
|---------|--------------------|
| shounen | Manga is a Shounen |
| shoujo  | Manga is a Shoujo  |
| josei   | Manga is a Josei   |
| seinen  | Manga is a Seinen  |

## Manga status

| Value     | Description              |
|-----------|--------------------------|
| ongoing   | Manga is still going on  |
| completed | Manga is completed       |
| hiatus    | Manga is paused          |
| cancelled | Manga has been cancelled |

## Manga reading status

| Value          |
|----------------|
| reading        |
| on_hold        |
| plan\_to\_read |
| dropped        |
| re\_reading    |
| completed      |

## Manga content rating

| Value        | Description          |
|--------------|----------------------|
| safe         | Safe content         |
| suggestive   | Suggestive content   |
| erotica      | Erotica content      |
| pornographic | Pornographic content |

## Manga order options

| Name                  | Value                   | Default  |
|-----------------------|-------------------------|----------|
| title                 | Enum: `"asc"`, `"desc"` |          |
| year                  | Enum: `"asc"`, `"desc"` |          |
| createdAt             | Enum: `"asc"`, `"desc"` |          |
| updatedAt             | Enum: `"asc"`, `"desc"` |          |
| latestUploadedChapter | Enum: `"asc"`, `"desc"` | `"desc"` |
| followedCount         | Enum: `"asc"`, `"desc"` |          |
| relevance             | Enum: `"asc"`, `"desc"` |          |

## Chapter order options

| Name       | Value                   | Default |
|------------|-------------------------|---------|
| createdAt  | Enum: `"asc"`, `"desc"` | `"asc"` |
| updatedAt  | Enum: `"asc"`, `"desc"` | `"asc"` |
| publishAt  | Enum: `"asc"`, `"desc"` | `"asc"` |
| readableAt | Enum: `"asc"`, `"desc"` | `"asc"` |
| volume     | Enum: `"asc"`, `"desc"` | `"asc"` |
| chapter    | Enum: `"asc"`, `"desc"` | `"asc"` |

## CustomList visibility

| Value   | Description           |
|---------|-----------------------|
| public  | CustomList is public  |
| private | CustomList is private |

## Relationship types

| Value            | Description                    |
|------------------|--------------------------------|
| manga            | Manga resource                 |
| chapter          | Chapter resource               |
| cover_art        | A Cover Art for a manga `*`    |
| author           | Author resource                |
| artist           | Author resource (drawers only) |
| scanlation_group | ScanlationGroup resource       |
| tag              | Tag resource                   |
| user             | User resource                  |
| custom_list      | CustomList resource            |

`*` Note, that on manga resources you get only one cover_art resource relation marking the primary cover if there are
more than one.
By default this will be the latest volume's cover art. If you like to see all the covers for a given manga, use the
cover search endpoint for your mangaId and select the one you wish to display.

## Manga links data

In Manga attributes you have the `links` field that is a JSON object with some strange keys, here is how to decode this
object:

| Key   | Related site  | URL                                                                                           | URL details                                                    |
|-------|---------------|-----------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| al    | anilist       | https://anilist.co/manga/`{id}`                                                               | Stored as id                                                   |
| ap    | animeplanet   | https://www.anime-planet.com/manga/`{slug}`                                                   | Stored as slug                                                 |
| bw    | bookwalker.jp | https://bookwalker.jp/`{slug}`                                                                | Stored as "series/{id}"                                        |
| mu    | mangaupdates  | https://www.mangaupdates.com/series.html?id=`{id}`                                            | Stored as id                                                   |
| nu    | novelupdates  | https://www.novelupdates.com/series/`{slug}`                                                  | Stored as slug                                                 |
| kt    | kitsu.io      | https://kitsu.io/api/edge/manga/`{id}` or https://kitsu.io/api/edge/manga?filter[slug]={slug} | If integer, use id version of the URL, otherwise use slug one  |
| amz   | amazon        | N/A                                                                                           | Stored as full URL                                             |
| ebj   | ebookjapan    | N/A                                                                                           | Stored as full URL                                             |
| mal   | myanimelist   | https://myanimelist.net/manga/{id}                                                            | Store as id                                                    |
| cdj   | CDJapan       | N/A                                                                                           | Stored as full URL                                             |
| raw   | N/A           | N/A                                                                                           | Stored as full URL, untranslated stuff URL (original language) |
| engtl | N/A           | N/A                                                                                           | Stored as full URL, official english licenced URL              |

## Manga related enum

This data is used in the "related" field of a Manga relationships

| Value             | Description                                                          |
|-------------------|----------------------------------------------------------------------|
| monochrome        | A monochrome variant of this manga                                   |
| colored           | A colored variant of this manga                                      |
| preserialization  | The original version of this manga before its official serialization |
| serialization     | The official serialization of this manga                             |
| prequel           | The previous entry in the same series                                |
| sequel            | The next entry in the same series                                    |
| main_story        | The original narrative this manga is based on                        |
| side_story        | A side work contemporaneous with the narrative of this manga         |
| adapted_from      | The original work this spin-off manga has been adapted from          |
| spin_off          | An official derivative work based on this manga                      |
| based_on          | The original work this self-published derivative manga is based on   |
| doujinshi         | A self-published derivative work based on this manga                 |
| same_franchise    | A manga based on the same intellectual property as this manga        |
| shared_universe   | A manga taking place in the same fictional world as this manga       |
| alternate_story   | An alternative take of the story in this manga                       |
| alternate_version | A different version of this manga with no other specific distinction |

## User roles enum

| Value                 | Description                                                                                                     |
|-----------------------|-----------------------------------------------------------------------------------------------------------------|
| ROLE_ADMIN            | MangaDex admins                                                                                                 |
| ROLE_BANNED           | Banned                                                                                                          |
| ROLE_CONTRIBUTOR      | Helpers contributing by filling in missing information (Description, External Links) on Manga pages on MangaDex |
| ROLE_DESIGNER         | Designer                                                                                                        |
| ROLE_DEVELOPER        | MangaDex site developers                                                                                        |
| ROLE_FORUM_MODERATOR  | Moderates the forum                                                                                             |
| ROLE_GLOBAL_MODERATOR |                                                                                                                 |
| ROLE_GROUP_LEADER     | Leaders of active groups on MangaDex                                                                            |
| ROLE_GROUP_MEMBER     | Member of a group                                                                                               |
| ROLE_GUEST            | Users viewing the site without being logged in                                                                  |
| ROLE_MEMBER           | A normal account                                                                                                |
| ROLE_MD_AT_HOME       | Involved with the MangaDex@Home project                                                                         |
| ROLE_POWER_UPLOADER   | Uploaded 500 or more chapters to MangaDex                                                                       |
| ROLE_PUBLIC_RELATIONS | Manages social media                                                                                            |
| ROLE_STAFF            | Staff                                                                                                           |
| ROLE_UNVERIFIED       | Accounts that haven't had their email address verified yet                                                      |
| ROLE_USER             | A normal account                                                                                                |
| ROLE_VIP              | Important people that in one way or another helped MangaDex                                                     |
