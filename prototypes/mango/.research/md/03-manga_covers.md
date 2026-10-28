---
order: 89
icon: image
label: Cover Images
---

# Retrieving Covers

To retrieve a cover, you need 2 pieces:

1. The manga id of the cover
2. The file name of the cover

Once you have these two, the URL of the cover is:

    https://uploads.mangadex.org/covers/:manga-id/:cover-filename

In addition to the unaltered cover, we also provide two premade thumbnail sizes for each cover, with respective widths
of 256 and 512 pixels.

    https://uploads.mangadex.org/covers/:manga-id/:cover-filename.{256, 512}.jpg

Note that the **full cover filename** is still expected. Including the original extension.

That is, given the cover filename `26dd2770-d383-42e9-a42b-32765a4d99c8.png` and URL

    https://uploads.mangadex.org/covers/8f3e1818-a015-491d-bd81-3addc4d7d56a/26dd2770-d383-42e9-a42b-32765a4d99c8.png

The 256px and 512px thumbnails are `26dd2770-d383-42e9-a42b-32765a4d99c8.png.{256, 512}.jpg`

    https://uploads.mangadex.org/covers/8f3e1818-a015-491d-bd81-3addc4d7d56a/26dd2770-d383-42e9-a42b-32765a4d99c8.png.256.jpg
    https://uploads.mangadex.org/covers/8f3e1818-a015-491d-bd81-3addc4d7d56a/26dd2770-d383-42e9-a42b-32765a4d99c8.png.512.jpg

## Where do I find the cover filename ?

You have two options depending on what you want.

### Main cover

In the manga's `cover_art` relationship you will find its cover id (which is **not** its filename). That cover entity
has a filename attribute.

That relationship is always there and unique. It is the cover displayed on our website.

Finally, you can have the filename (and other attributes) resolved directly (avoiding the need for a subsequent call
to `/cover/:id`)
using [reference expansion](/01-concepts/reference-expansion.md).

### All covers for a manga

Using the [GET /cover endpoint](/swagger.html#/Cover/get-cover).
