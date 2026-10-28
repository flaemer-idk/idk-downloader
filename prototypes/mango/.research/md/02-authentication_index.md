---
label: Authentication
order: 3
expanded: true
icon: lock
---

Authentication against our API is made using the [OAuth standard](https://en.wikipedia.org/wiki/OAuth) version 2.

## Authentication tokens and when to use them

In general, authentication tokens are passed as HTTP `Authorization` headers. For best performance:

1. Do not send authentication headers unless necessary for your API call. Authenticated requests cannot be cached, so
   you're slowing yourself down.
2. Do **NOT** send authentication headers to any domain other than `{api, auth}.mangadex.org`. This means **NOT**
   sending authentication headers to `*.mangadex.network` or `uploads.mangadex.org` (image download domains).

## The OAuth standard

We recommend you get familiar with the OAuth 2 specifications, or use some library that implements it for your language
of choice.

Okta maintains a very comprehensive and simple [documentation of the specification](https://www.oauth.com/),
alongside a list of [tools and libraries](https://www.oauth.com/oauth2-servers/tools-and-libraries/).

==- 15-minutes video summary of the OAuth standard

[!embed](https://www.youtube.com/watch?v=t18YB3xDfXI)

===

## OAuth and MangaDex

Once familiar with the OAuth specification, you will want an OAuth client of yours registered on our end. For
simplicity, we will refer to those as "API clients" but they are effectively OAuth clients.

We aim to offer two types of API clients, based on the use-case.

==- 1. Public clients (not available yet)

!!!Note
Public clients are not yet available.
!!!

A public API client uses the `authorization_code` flow. This means that it requires the end-user to browse to an
authentication url on `https://auth.mangadex.org`, and then be redirected to the client service/application at a
predetermined url.

**Pros:**

- Most secure
- Can be used by any user of the site once set up

**Cons:**

- Requires the client service (your site/application/script) to handle an HTTP request upon redirection
  from `https://auth.mangadex.org` back to your callback URL

Find out more in [Public clients](public-clients.md).

==- 2. Personal clients

!!!Note
Only the account that owns a personal client can be used with it.<br/>
This is why it is a **personal** client.
!!!

A personal API client uses the `password` flow. This means that no user interaction is required to perform
authentication.

**Pros:**

- Simpler to use with small scripts

**Cons:**

- Less secure than public clients, as it ignores the multi-factor settings of the account
- Only the account of the owner of the client can be used with it

Find out more in [Personal clients](personal-clients.md).

===

The summary is:

- If you are developing a website/application and want other people to use it, use a **public** client
- If you need a client for your own personal use only, a **personal** client is simpler and behaves closer to an API key
