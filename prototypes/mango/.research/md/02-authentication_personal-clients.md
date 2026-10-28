---
label: Personal clients
order: 1
icon: person
---

!!!warning
Only the account that owns a personal client can be used with it.<br/>
This is why it is a **personal** client. No other account can use it.
!!!

## Registering an API client

Go to https://mangadex.org/settings (make sure you are logged-in). Then open the API client section and follow the
instructions there.

Once your client is requested, it will either be automatically approved, or be in a pending state, requiring manual
approval by staff members.

**If it is in a pending/requested state (instead of approved), it cannot be used yet.**

!!!info
We plan to enable automatic approval for personal client after a few weeks of experimentation with the feature available
to the public.
!!!

### Client details

When your client is registered **and approved**/active.

- Your client id is displayed and looks like this: `personal-client-...`
- Your client secret is displayed upon clicking the `Get Secret` button

!!!warning
Your client secret is effectively a password<br/>
**Never share it with anyone under any circumstance!**<br/>
MangaDex staff will **never** ask you for it!
!!!

## Authenticating

Once you have your client id and secret, you will need your username and password to authenticate.

This is achieved by submitting an HTTP form:

```
POST https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```
```
grant_type=password
username=<your_username>
password=<your_password>
client_id=<your_client_id>
client_secret=<your_client_secret>
```

!!!info
This is an HTTP form. **NOT** a Json payload.
If done correctly, it should have request Content-Type `application/x-www-form-urlencoded`
!!!

Upon success, you will get back a Json object containing 2 properties like so:
```json
{
  "access_token": "...",
  "refresh_token": "..."
}
```

This token pair is then used to perform authenticated requests against the API, alongside maintaining your authentication.

- The `access_token` authenticated you with our API (https://api.mangadex.org), it has a lifetime of 15 minutes
- The `refresh_token` allows you to quickly get a new access token (aka "refresh" it) when it has expired, from our authentication service (https://auth.mangadex.org)

==- Code samples

+++Python


:::code-block

```python
import requests

creds = {
    "grant_type": "password",
    "username": "<your_username>",
    "password": "<your_password>",
    "client_id": "<your_client_id>",
    "client_secret": "<your_client_secret>"
}

r = requests.post(
    "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
    data=creds
)
r_json = r.json()

access_token = r_json["access_token"]
refresh_token = r_json["refresh_token"]

print(access_token, refresh_token)
```

:::

+++JavaScript

:::code-block

```javascript
const axios = require('axios');

const creds = {
    grant_type: "password",
    username: '<your_username>',
    password: '<your_password>',
    client_id: '<your_client_id>',
    client_secret: '<your_client_secret>'
};

const resp = await axios({
    method: 'POST',
    url: `https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token`,
    data: creds
});

const { access_token, refresh_token } = resp.data;
console.log(access_token, refresh_token);
```

:::

+++

===

## Refreshing your access token

Once an access token expires, it will start being rejected by the API and must be replaced ("refreshed").

This is achieved using the `refresh_token` flow, by sending another HTTP form:

```
POST https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```
```
grant_type=refresh_token
refresh_token=<your_refresh_token>
client_id=<your_client_id>
client_secret=<your_client_secret>
```

!!!info
This is an HTTP form. **NOT** a Json payload.
If done correctly, it should have request Content-Type `application/x-www-form-urlencoded`
!!!

Upon success, you will get back a Json object containing at least 1 `access_token` property, with your new access token in it:
```json
{
  "access_token": "...",
  ...
}
```

==- Code samples

+++Python

:::code-block

```python
import requests

creds = {
    "grant_type": "refresh_token",
    "refresh_token": "<your_refresh_token>",
    "client_id": "<your_client_id>",
    "client_secret": "<your_client_secret>"
}

r = requests.post(
    "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
    data=creds,
)

access_token = r.json()["access_token"]

print(access_token)
```

:::

+++JavaScript


:::code-block

```javascript
const axios = require('axios');

const creds = {
    grant_type: 'refresh_token',
    refresh_token: '<your_refresh_token>',
    client_id: '<your_client_id>',
    client_secret: '<your_client_secret>'
}

const resp = await axios({
    method: 'POST',
    url: 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token',
    data: creds
});

const accessToken = resp.data.access_token;
console.log(accessToken)
```

:::

+++

===
