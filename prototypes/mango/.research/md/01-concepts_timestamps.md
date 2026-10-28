---
order: 95
icon: clock
---

# Timestamps

There are a lot of timestamps found across entities and it can admittedly get quite confusing.

## Timestamp format

All dates use the Internet date/time format as defined
in [RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339#section-5.8), in the UTC timezone when not specified.

For example, `1985-04-12T23:20:50.52Z` represents:

- The 12th of April, 1985
- At 23 hours 20 minute 50.52 seconds
- In UTC

## `CreatedAt`

This date is present on all resources, it represents the instant when the resource was originally created.

## `UpdatedAt`

This date is present on all resources, it represents the instant when the resource was last updated.

## `PublishAt` and `ReadableAt`

The following table explains the relationship between these two and the various **possible** states of a chapter:

| Possible | PublishAt | ReadableAt | ExternalUrl | **Result**                                                                                         |
|----------|-----------|------------|-------------|----------------------------------------------------------------------------------------------------|
| Yes      | Future    | Past       | `null`      | Chapter will be readable on MangaDex at `publishAt`, but is not readable at all yet                |
| Yes      | Future    | Past       | non-`null`  | Chapter will be readable on MangaDex directly at `publishAt`, but is for now just an external link |
| Yes      | Past      | Past       | `null`      | Chapter is readable on MangaDex, and has no external site link                                     |
| Yes      | Past      | Past       | non-`null`  | Chapter is readable on MangaDex, and also contains a link to an external site                      |

Note that `publishAt` may be set extremely far in the future as a way to say "it will always only be just a link".

### `PublishAt`

This date is present on chapter resources and represents the instant when the content will be available **directly** on
MangaDex.

- Before that time, the chapter will be visible but not readable directly
    - If the chapter has a non-null `externalUrl`, then it will be link before being readable
    - If the chapter has no `externalUrl`, then it will only be displayed in the chapter lists

### `ReadableAt`

This date is present on chapter resources and represents the instant when the chapter is "readable" at all.

That is, whether it's an external chapter or an internal chapter whose pages are now available directly on MangaDex.

- If publishAt is in future & chapter has externalUrl then readableAt is equals createdAt date
- Otherwise readableAt is equals publishAt date
