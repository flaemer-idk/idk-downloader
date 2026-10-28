---
label: Pagination
order: 92
icon: number
---

# Pagination

Sometimes there will be more results than the resource returns. The API enforces limitations to achieve high performance
and encourages you to incorporate reasonable pagination.

This is achieved by using three props that are returned in tandem with the collection and setting the query parameters
accordingly.

| Name   | Description                            |
|--------|----------------------------------------|
| limit  | The maximum number of items to include |
| offset | The offset on the collection           |
| total  | The total items in the collection      |

!!!
The maximum limit and offset are unique to each resource.
!!!

For example, for a collection with a total of 45 results, and each page containing 20 items the parameters for each page
would be as follows:

| Page | Parameter Values          |
|------|---------------------------|
| 1    | `limit: 20`, `offset: 0`  |
| 2    | `limit: 20`, `offset: 20` |
| 3    | `limit: 20`, `offset: 40` |

!!!warning Warning
Setting `offset` to anything higher than the collection's total items will result in an empty collection response.
!!!
