---
label: Search
order: 100
icon: search
---

# Searching for a manga

!!!
This resource supports [pagination](/01-concepts/pagination.md)
and [reference expansion](/01-concepts/reference-expansion.md).
!!!

```http
  GET /manga
```

## Search via a query

One of the first steps made to navigate Mangadex's manga, manhwa, manhua, and/or user-submitted comics is to search for
them through a query.
The query we often want is the Manga's title. Thus, we pass a `title` query parameter to the URL, with the title we want
to search for.

!!!
By default, the Manga list is provided in descending order, based on the latest chapter uploaded.
See [Manga order options](/3-enumerations.md).
!!!

!!!warning
Pornographic titles are hidden by default. For more information on Content Rating
filters, [read here](/3-enumerations.md).
!!!

##### Request

Quering for the
manga [Kanojyo to Himitsu to Koimoyou](https://mangadex.org/title/f98660a1-d2e2-461c-960d-7bd13df8b76d/).

+++Python

:::code-block

```python
title = "Kanojyo to Himitsu to Koimoyou"

```

:::

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(
    f"{base_url}/manga",
    params={"title": title}
)

print([manga["id"] for manga in r.json()["data"]])

```

:::

+++JavaScript

:::code-block

```javascript
const title = 'Kanojyo to Himitsu to Koimoyou';

```

:::

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga`,
    params: {
        title: title
    }
});

console.log(resp.data.data.map(manga => manga.id));

```

:::

+++

## Advanced Manga search

Sometimes we may not be looking for a specific title, but many titles that are similar in some way. Sometimes we may be
looking for action-romance stories, sometimes we're looking for that one amazing manga we forgot the title of, but
remember ever so few characteristics about it. Our API provides a wide range of collection-filtering options, such as
filtering by including or excluding tags, demographic, and more.

### Filtering by Tags

To filter a Manga collection by one or more Tags, we have to first understand how the Tag system works. We will use
the `includedTags[]` and `excludedTags[]` query parameters to filter our list. Refer to
the [API reference](/redoc.html#tag/Manga/operation/get-manga-tag) for further details on the Tag system.

!!!info
The default included tags mode is `AND`, meaning that a Manga has to contain **all** the tags specified to be included.
The default excluded tags mode is `OR`, meaning that a Manga has to contain **any** of the tags specified to be omitted.
!!!

##### Request

Let's look for a Manga with tags "Action" and "Romance," but not "Harem."

+++Python

We declare our tag names in a list.

:::code-block

```python
included_tag_names = ["Action", "Romance"]
excluded_tag_names = ["Harem"]

```

:::

We then transform those lists into lists of UUIDs using the `/manga/tags` resource.

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

tags = requests.get(
    f"{base_url}/manga/tag"
).json()

# ["391b0423-d847-456f-aff0-8b0cfc03066b", "423e2eae-a7a2-4a8b-ac03-a8351462d71d"]
included_tag_ids = [
    tag["id"]
    for tag in tags["data"]
    if tag["attributes"]["name"]["en"]
       in included_tag_names
]

# ["aafb99c1-7f60-43fa-b75f-fc9502ce29c7"]
excluded_tag_ids = [
    tag["id"]
    for tag in tags["data"]
    if tag["attributes"]["name"]["en"]
       in excluded_tag_names
]

```

:::

Finally, we send the request.

:::code-block

```python
r = requests.get(
    f"{base_url}/manga",
    params={
        "includedTags[]": included_tag_ids,
        "excludedTags[]": excluded_tag_ids,
    },
)

print([manga["id"] for manga in r.json()["data"]])

```

:::

+++JavaScript

We declare our tag names in an array.

:::code-block

```javascript
const includedTagNames = ['Action', 'Romance'];
const excludedTagNames = ['Harem'];

```

:::

We then transform those arrays into arrays of UUIDs using the `/manga/tags` resource.

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const tags = await axios(`${baseUrl}/manga/tag`);

// ['391b0423-d847-456f-aff0-8b0cfc03066b', '423e2eae-a7a2-4a8b-ac03-a8351462d71d']
const includedTagIDs = tags.data.data
    .filter(tag => includedTagNames.includes(tag.attributes.name.en))
    .map(tag => tag.id);

// ['aafb99c1-7f60-43fa-b75f-fc9502ce29c7']
const excludedTagIDs = tags.data.data
    .filter(tag => excludedTagNames.includes(tag.attributes.name.en))
    .map(tag => tag.id);

```

:::

Finally, we send the request.

:::code-block

```javascript
const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga`,
    params: {
        'includedTags': includedTagIDs,
        'excludedTags': excludedTagIDs
    }
});

console.log(resp.data.data.map(manga => manga.id));

```

:::

+++

#### Sorting

You can apply sorting via the `order` field, see [Manga order options](/3-enumerations.md).

!!!warning
Because the `order` field accepts deep object values, the query parameter will be in the shape
of `<field>[<key>]=<value>`.
!!!

##### Request

+++Python

We declare the order dictionary.

:::code-block

```python
order = {
    "rating": "desc",
    "followedCount": "desc",
}

```

:::

We transform the dictionary into a dictionary we can use for deep object query parameters.

:::code-block

```python
final_order_query = {}

# { "order[rating]": "desc", "order[followedCount]": "desc" }
for key, value in order.items():
    final_order_query[f"order[{key}]"] = value
```

:::

We send the request.

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(
    f"{base_url}/manga",
    params={
        **{
            "includedTags[]": included_tag_ids,
            "excludedTags[]": excluded_tag_ids,
        },
        **final_order_query,
    },
)

print([manga["id"] for manga in r.json()["data"]])

```

:::

+++JavaScript

We declare the order object.

:::code-block

```javascript
const order = {
    rating: 'desc',
    followedCount: 'desc'
};
```

:::

We transform the object into an object we can use for deep object query parameters.

:::code-block

```javascript
const finalOrderQuery = {};

// { "order[rating]": "desc", "order[followedCount]": "desc" }
for (const [key, value] of Object.entries(order)) {
    finalOrderQuery[`order[${key}]`] = value;
}
;
```

:::

We send the request.

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org'

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga`,
    params: {
        includedTags: includedTagIDs,
        excludedTags: excludedTagIDs,
        ...finalOrderQuery
    }
});

console.log(resp.data.data.map(manga => manga.id));

```

:::

+++

### Filtering by Demographic or Content Rating

You can filter the collection by specifying which [demographics](/3-enumerations.md#manga-publication-demographic) to
include, what [content rating](/3-enumerations.md#manga-content-rating) to contain,
its [publication status](/3-enumerations.md#manga-status) and more. For the full list of what query parameters are
available, refer to the [API Reference](/redoc.html#tag/Manga/operation/get-search-manga).

##### Request

Let's say we want to get all Seinen Manga with publication status completed, and suggestive content rating. We'll be
using the `publicationDemographic[]`, `status[]`, and `contentRating[]` query parameters.

+++Python

:::code-block

```python
filters = {
    "publicationDemographic[]": ["seinen"],
    "status[]": ["completed"],
    "contentRating[]": ["suggestive"],
}
```

:::

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(
    f"{base_url}/manga", params=filters
)

print([manga["id"] for manga in r.json()["data"]])
```

:::

+++JavaScript

:::code-block

```javascript
const filters = {
    publicationDemographic: ['seinen'],
    status: ['completed'],
    contentRating: ['suggestive']
};
```

:::

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga`,
    params: filters
});

console.log(resp.data.data.map(manga => manga.id));
```

:::

+++

