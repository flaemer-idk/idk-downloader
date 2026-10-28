---
label: Home
order: 100
icon: home
---

# MangaDex API documentation

MangaDex is an ad-free manga reader offering high-quality images.

This sub-site documents the usage of our API for projects of your own. As our API changes over time, so does this
document. We always give advance notice of significant changes in the **api-changelog** channel of
our [Discord server](https://discord.gg/mangadex).

## Acceptable Usage Policy

We make our API **entirely public** and **free to use** exclusively for projects that satisfy the following:

1. You **MUST** credit MangaDex
2. You **MUST** credit scanlation groups (and honor their content removal requests) if you allow reading chapters
3. You **CANNOT** run ads or paid services on your website and/or apps

==- Scanlation group removal requests

A scanlation group removal request is any request in writing that originates from an active (as per the group's MangaDex
page) scanlation group's leader asking you to make their works unavailable on your platform.

As we do honor such requests, you must in turn honor them. This applies to both groups that upload on MangaDex and
groups that do not.

===

==- What constitutes an "ad" or a "paid service"?

The point is that you must not be profiting from our API. Exceptions may be made for legitimate services, but never for
non-legal services.

So the rule of thumb is that you may not have any advertisement (placed content from which you derive a revenue) at all
on your platform, nor sell access to anything provided by the MangaDex API. You may accept donations however.

In the end, we're not lawyers, and will judge on a case-by-case basis. We will cut off offenders even if "technically"
those rules don't cover them because of some semantic loophole.

===

## Issues and Questions

### I have a question

You may join [our Discord](https://discord.gg/mangadex)'s `#dev-talk-api` channel to ask questions or for help.

However we're all busy so please read the docs first, then a second time, or try searching in the channel. Then ask away
if you can't figure it out.

### Security Issues

If you think you found a security issue, please contact us privately as soon as possible via either:

1. **(Preferred)** Our security@ email (see [security.txt file](https://api.mangadex.org/security.txt))
2. A staff member on our [Discord server](https://discord.gg/mangadex)

If you aren't certain, it is better to ask us privately first anyway. We prefer a false-positive than something coming
our endangering our users' privacy.

And please keep it in private until you get a response; there are a lots of eyes watching our public discussion
channels, ready to abuse anything they can as soon as they learn of it.

### I found a bug

Please read the docs carefully and **triple-check** the request you're actually sending to us.
If you're sure you found a bug, then congrats and please report it to us so we can fix it!

==- Request identifiers for debugging

Every HTTP response from our services has a `X-Request-ID` header with a value unique to the request-response that was
handled.
Please provide it to us when reporting the bug. If your request has a body, please also provide it.

Essentially, we suggest that your error error handling should look something like this:

```
var httpResponse = httpClient.execute(httpRequest);
if (httpResponse.status >= 400) {
  logger.error("
    Request ID: ${httpResponse.headers['X-Request-ID]'}

    Request:
    ${httpRequest.body}

    Response:
    ${httpResponse.body}
  ");
}
```

!!!info
The HTTP specification notes
that [headers (fields) are case-insensitive](https://www.rfc-editor.org/rfc/rfc9110.html#fields) so
check that your HTTP library is properly handling that when retrieving the header's value.

Ours are *typically* always lowercase in practice but do not rely on that.
!!!

===

### I found something missing/wrong in the documentation

We sometimes forget or make mistakes when updating the documentation. Please report it to us on
our [Discord server](https://discord.gg/mangadex), or make a merge request for it against our api-docs repository.

Occasionally, some things (like response fields) may be undocumented on purpose, for example when they are only
experimental and cannot be relied upon yet. If you ask us, we will clarify it.

