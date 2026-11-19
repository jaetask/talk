# money-items

## Input

[money-items.json](money-items.json)

## Output

# money-items

Items the lookups returned: Tesco Mobile, Rent, Rent

| dangerous call | gate | what is said |
| --- | --- | --- |
| delete-item {"id":"i1"} | ask | Delete the Tesco Mobile item in Money? |
| mark-paid {"name":"Tesco Mobile"} | ask | Mark Tesco Mobile as paid in Money? |
| delete-item {"name":"Rent"} | refuse | Not done. Look it up first: call a list or get tool that returns the item, then call delete-item again with its exact id or name. More than one item matches (Rent, Rent). Ask Jae which one, in one short question. |
| delete-item {"name":"Netflix"} | refuse | Not done. Look it up first: call a list or get tool that returns the item, then call delete-item again with its exact id or name. None of the items you looked up matches. If it isn't there, tell Jae you can't find it. |
| delete-item {"id":"i1","profile":"Company"} | refuse | Not done. Look it up first: call a list or get tool that returns the item, then call delete-item again with its exact id or name. profile is 'Company' but Tesco Mobile has 'Personal'. Use the item's own values. |
| ticket-archive {"id":"TLK-1"} | refuse | Not done. Look it up first: call a list or get tool that returns the item, then call ticket-archive again with its exact id or name. You haven't looked it up yet. After the lookup, call the tool again straight away; don't ask Jae to confirm in words, the system asks him itself. |

| Jae says | counts as |
| --- | --- |
| yes | yes |
| Yeah go on | yes |
| ok do it | yes |
| sure | yes |
| no | not a yes |
| hmm maybe | not a yes |
| yesterday I said so | not a yes |
| what would that do? | not a yes |
