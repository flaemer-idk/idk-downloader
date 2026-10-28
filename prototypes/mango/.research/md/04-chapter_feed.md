---
order: 90
label: Manga Chapter Feed
icon: rss
---

# Find a Manga's Chapters

```http
 GET /manga/{id}/feed
```

After finding the manga we are looking for, we may now want to read its chapters. The first step is to find which
chapter exactly we want.

## Getting the Manga Feed

Manga Feed is a Manga's Chapter collection. A Chapter resource contains various information useful for identifying the
chapter we are looking for, such as the chapter number, volume, language, and more.

##### Request

+++Python

:::code-block

```python
manga_id = "f98660a1-d2e2-461c-960d-7bd13df8b76d"
```

:::

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(f"{base_url}/manga/{manga_id}/feed")

print([chapter["id"] for chapter in r.json()["data"]])
```

:::

+++JavaScript

:::code-block

```javascript
const mangaID = 'f98660a1-d2e2-461c-960d-7bd13df8b76d';
```

:::

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga/${mangaID}/feed`
});

console.log(resp.data.data.map(chapter => chapter.id));

```

:::

+++

### Filtering the Manga Feed

We may want to filter out chapters which we may not be interested in. Attributes like language, group, user, and others
are all fields we can apply filters for. Refer to the [API Reference](/redoc.html#tag/Manga/operation/get-manga-id-feed)
for a list of all the available query parameters.

##### Request

Suppose we want to get all English chapters for the
Manga [Kimi wa Shinenai Hai Kaburi no Majo](https://mangadex.org/title/7c145eaf-1037-48cb-b6ba-f259103b05ea).

!!!info
We use the ISO language code "en" for "English." You can find other languages'
codes [here](/3-enumerations.md#language-codes--localization).
!!!

+++Python

:::code-block

```python
manga_id = "7c145eaf-1037-48cb-b6ba-f259103b05ea"
languages = ["en"]
```

:::

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(
    f"{base_url}/manga/{manga_id}/feed",
    params={"translatedLanguage[]": languages},
)

print([chapter["id"] for chapter in r.json()["data"]])
```

:::

+++JavaScript

:::code-block

```javascript
const mangaID = '7c145eaf-1037-48cb-b6ba-f259103b05ea';
const languages = ['en'];
```

:::

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/manga/${mangaID}/feed`,
    params: {
        translatedLanguage: languages
    }
});

console.log(resp.data.data.map(chapter => chapter.id));
```

:::

+++

## Download a Chapter

Once we've found which chapter(s) we want, the next step would probably be to retrieve the images for it.

!!!info
For a closer and more detailed look of this section, refer
to [Retrieving chapter pages](/04-chapter/retrieving-chapter.md).
!!!

Let's proceed with chapter `27cd0902-ad4c-490a-b752-ae032f0503c9`.

##### Request

+++Python

:::code-block

```python
chapter_id = "27cd0902-ad4c-490a-b752-ae032f0503c9"
```

:::

:::code-block

```python
import requests

base_url = "https://api.mangadex.org"

r = requests.get(f"{base_url}/at-home/server/{chapter_id}")
r_json = r.json()

host = r_json["baseUrl"]
chapter_hash = r_json["chapter"]["hash"]
data = r_json["chapter"]["data"]
data_saver = r_json["chapter"]["dataSaver"]
```

:::

+++JavaScript

:::code-block

```javascript
const chapterID = '27cd0902-ad4c-490a-b752-ae032f0503c9';
```

:::

:::code-block

```javascript
const axios = require('axios');

const baseUrl = 'https://api.mangadex.org';

const resp = await axios({
    method: 'GET',
    url: `${baseUrl}/at-home/server/${chapterID}`,
});

const host = resp.data.baseUrl;
const chapterHash = resp.data.chapter.hash;
const data = resp.data.chapter.data;
const dataSaver = resp.data.chapter.dataSaver;
```

:::

+++

Now, let's explain a few things. For every chapter, Mangadex provides two quality options: `data`
and `data-saver`. `data` quality will always be original quality images (just like the uploader uploaded them),
whereas `data-saver` are their compressed counterparts, which are low in size, meant for people who wish to conserve
their bandwidth and for faster loading times on slow connections.

The full URL to retrieve an image is in the following format: `<baseUrl>/<quality>/<chapterHash>/<filename>`.

- `baseUrl` is the URL we received from the /at-home/server endpoint (**Always** use the URL you receive from this
  endpoint. The at-home URLs are geographically optimized, therefore it's only going to cause issues for yourself by
  hardcoding them).
- `quality` is the preferred quality option. Must be either `data` or `data-saver`.
- `chapterHash` is the chapter hash the /at-home/server endpoint provides us with.
- `filename` is the full name of the file under the quality option we chose.

##### Request

+++Python

:::code-block

```python
import os

# Making a folder to store the images in.
folder_path = f"Mangadex/{chapter_id}"
os.makedirs(folder_path, exist_ok=True)
```

:::

:::code-block

```python
import requests

for page in data:
    r = requests.get(f"{host}/data/{chapter_hash}/{page}")

    with open(f"{folder_path}/{page}", mode="wb") as f:
        f.write(r.content)

print(f"Downloaded {len(data)} pages.")
```

:::

+++JavaScript

:::code-block

```javascript
const fs = require('fs');

const folderPath = `Mangadex/${chapterID}`;
fs.mkdirSync(folderPath, { recursive: true });
```

:::

:::code-block

```javascript
const axios = require('axios');

for (const page of data) {
    const resp = await axios({
        method: 'GET',
        url: `${host}/data/${chapterHash}/${page}`,
        responseType: 'arraybuffer'
    });

    fs.writeFileSync(`${folderPath}/${page}`, resp.data);
}

console.log(`Downloaded ${data.length} pages.`);
```

:::

+++

!!!warning
While downloading chapters from Mangadex is trivial, our CORS policy does **not** allow hotlinking of images. What that
means is that you cannot make, say, a website where the users can read chapters from, with the at-home URLs. The only
whitelisted domains are those owned by Mangadex, and localhost. To circumvent this, you may disable CORS from your
browser's security settings, but know that if you're planning to distribute it to users, you must proxy those images
from your server, and serve the images to them afterwards.
!!!
