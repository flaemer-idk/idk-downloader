---
order: 99
icon: tools
label: Limitations/Requirements
---

# Limitations and Requirements

MangaDex is a non-profit service operating with limited infrastructure resources.

To ensure the continued stability of our platform and combat abuse, we enforce a handful of restrictions on incoming
request rate on an IP-by-IP basis.
Hence, if you're on a VPN, proxy or a shared network in general, the requests of other users on this network might
affect your allowance.

## General connection requirements

MangaDex supports HTTP/1.1, HTTP/2, and HTTP/3 over QUIC, and requires the usage of SSL/TLS for all of these.

==- SSL/TLS requirements

MangaDex requires that your browser/client supports the following specifications.

The TLS [Server Name Indication](https://en.wikipedia.org/wiki/Server_Name_Indication) extension, with TLSv1.3 only.

!!!info
Insecure/plain-text requests will systematically result in an HTTP 30x redirection to the secure equivalent of the URL
reached.
!!!

You may find a more detailed report on [SSLLabs](https://www.ssllabs.com/ssltest/analyze.html?d=mangadex.org).

===

Additionally, the following requirements are placed on incoming HTTP requests:

- The request **MUST** have a `User-Agent` header, and it must not be spoofed
- The request **CANNOT** have a `Via` header (i.e.: we do not allow non-transparent proxies)

The following anti-abuse policies are in place:

- We do not send [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) responses for other websites than ours;
  **MUST** proxy the requests your users make to our services, and inject your own CORS responses and headers where
  relevant
- We will serve the [wrong response](https://uploads.mangadex.org/agg.jpg) for any image hotlinked from our domains; you
  **MUST** proxy the requests your users make to our services

Finally, an undocumented handful of IPv4 subnets are banned forever from reaching us.

## General rate limit

A **global limit of approximately 5 requests per second per IP address** is in effect for `api.mangadex.org` as a
whole (and its development counterpart, `api.mangadex.dev`, independently).

==- Exact rate limit

This is not an exact value but a minimum guaranteed allowance. Your effective allowed rate may be higher for
various reasons (notably that we enforce it at the load balancer level, so if you reach 2 load balancers of ours
perfectly equitably, you would get 10 requests/s. This is not something you can reliably control.)

===

==- Exceeded rate limit

Once above this rate limit, you will receive HTTP 429 responses for all requests to `*.mangadex.org` until enough time
has passed to bring your rate back in line.

If you persist in sending requests while receiving HTTP 429 responses, our DDoS protection will automatically be
triggered and you will be issued a temporary IP address ban, resulting in a generic HTTP 403 response for all requests
to `*.mangadex.org`. Its duration is not documented and subject to change without notice.

If you still persist in sending requests at that point, we will automatically stop replying to your IP address
altogether until we stop receiving traffic from you for a while. This cooldown period is renewed for every request you
send while still blocked. Its duration is not documented and subject to change without notice.

===

==- Abusive patterns rate limit

Unfortunately, we regularly see particularly abusive request patterns from clients that are just too lazy/disrespectful
to use our API decently. If you wonder whether your usage falls in this category, it probably doesn't. And offenders
are nearly always well-aware of it.

TL;DR: If you decide to do 500 requests where the same exact feature is implementable with 1 single request, we will
**drastically** throttle you, or block it altogether. The reduced rate and the patterns affected are not documented and
subject to change without notice.

===

==- Non-API rate limits

We enforce rate limits on all of our public services; this page documents only the ones for `api.mangadex.org`
specifically. These other rate limits are for DDoS protection and you will not hit them if you aren't trying to DoS us.
They are not documented and subject to change without notice.

===

## Endpoint-specific rate limits

On top of this general limit, **some endpoints are further restricted** as follows, primarily to combat spam and/or
mistaken API usage.

Most use-cases are highly unlikely to hit them in normal usage, since they mainly relate to data
modification rather than consumption.

| Endpoint                        | Requests per time period | Time period in minutes { class="compact" } |
|---------------------------------|--------------------------|--------------------------------------------|
| **AtHome** (MangaDex@Home)      |                          |                                            |
| `GET /at-home/server/{id}`      | 40                       | 1                                          |
| **Authentication**              |                          |                                            |
| `POST /auth/login`              | 30                       | 60                                         |
| `POST /auth/refresh`            | 60                       | 60                                         |
| **Author**                      |                          |                                            |
| `POST /author`                  | 10                       | 60                                         |
| `PUT /author`                   | 10                       | 1                                          |
| `DELETE /author/{id}`           | 10                       | 10                                         |
| **Captcha** (reCaptcha)         |                          |                                            |
| `POST /captcha/solve`           | 10                       | 10                                         |
| **Cover**                       |                          |                                            |
| `POST /cover`                   | 100                      | 10                                         |
| `PUT /cover/{id}`               | 100                      | 10                                         |
| `DELETE /cover/{id}`            | 10                       | 10                                         |
| **Chapter**                     |                          |                                            |
| `POST /chapter/{id}/read`       | 300                      | 10                                         |
| `PUT /chapter/{id}`             | 10                       | 1                                          |
| `DELETE /chapter/{id}`          | 10                       | 1                                          |
| **Forums**                      |                          |                                            |
| `POST /forums/thread`           | 10                       | 1                                          |
| **Manga**                       |                          |                                            |
| `POST /manga`                   | 10                       | 60                                         |
| `PUT /manga/{id}`               | 10                       | 60                                         |
| `DELETE /manga/{id}`            | 10                       | 10                                         |
| `POST /manga/draft/{id}/commit` | 10                       | 60                                         |
| `GET /manga/random`             | 60                       | 1                                          |
| **Reports**                     |                          |                                            |
| `POST /report`                  | 10                       | 1                                          |
| `GET /report`                   | 10                       | 1                                          |
| **ScanlationGroup**             |                          |                                            |
| `POST /group`                   | 10                       | 60                                         |
| `PUT /group/{id}`               | 10                       | 1                                          |
| `DELETE /group/{id}`            | 10                       | 10                                         |
| **Upload**                      |                          |                                            |
| -> Sessions                     |                          |                                            |
| `GET /upload`                   | 30                       | 1                                          |
| `POST /upload/begin`            | 20  (shared with ⬇️)     | 1                                          |
| `POST /upload/begin/{id}`       | 20  (shared with ⬆️)     | 1                                          |
| `POST /upload/{id}/commit`      | 10                       | 1                                          |
| `DELETE /upload/{id}`           | 30                       | 1                                          |
| -> Files                        |                          |                                            |
| `POST /upload/{id}`             | 250 (shared with ⬇️)     | 1                                          |
| `DELETE /upload/{id}/{id}`      | 250 (shared with ⬆️⬇️)   | 1                                          |
| `DELETE /upload/{id}/batch`     | 250 (shared with ⬆️)     | 1                                          |

Calling these endpoints will provide extra details via the following response headers:

| Header                    | Description                                                                |
|---------------------------|----------------------------------------------------------------------------|
| `X-RateLimit-Limit`       | Maximal number of requests this endpoint allows per its time period        |
| `X-RateLimit-Remaining`   | Remaining number of requests within your quota for the current time period |
| `X-RateLimit-Retry-After` | Timestamp of the end of the current time period, as UNIX timestamp         |

# Collection result sizes

Endpoints returning a collection of elements (such as the searches and feeds endpoints), typically take an `offset` and
a `size` query parameters.

1. Requests where `offset + size > 10.000` will be rejected.
2. The `size` query parameter will typically not allow values greater than `100` (`500` for a handful of feed
   endpoints); you must instead use multiple requests with changing `offset`s to paginate through large responses.

This is for performance reasons and will not change.
