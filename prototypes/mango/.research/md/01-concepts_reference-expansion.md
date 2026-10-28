---
order: 91
icon: unfold
---

# Reference Expansion

Reference Expansion is a feature of certain endpoints where relationships of a resource are expanded with their
attributes, which reduces the amount of requests that need to be sent to the API to retrieve a complete set of data.

It works by appending a list of includes to the query with the type names from the relationships. If an endpoint
supports this feature is indicated by the presence of the optional `includes` parameter.

## Example

To fetch a specific manga with `author`, `artist` and `cover_art` expanded, you can send the following
request: `GET /manga/f9c33607-9180-4ba6-b85c-e4b5faee7192?includes[]=author&includes[]=artist&includes[]=cover_art`. You
will now find the objects' attributes inside the returned relationships array.

## Note

Your current user needs `*.view` permission on each type of reference you want to expand. Guests have most of these
permissions and for logged-in user accounts you can check `GET /auth/check` to list all permissions you have been
granted. For example, to be able to expand `cover_art`, you need to have been granted the `cover.view` permission,
for `author` and `artist` types you need the `author.view` permission and so on.
If a reference can't be expanded, the request will still succeed and no error indication will be visible.
