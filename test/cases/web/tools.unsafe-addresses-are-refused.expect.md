# tools.unsafe-addresses-are-refused

## Input

[tools.unsafe-addresses-are-refused.json](tools.unsafe-addresses-are-refused.json)

## Output

# tools.unsafe-addresses-are-refused

Only public http(s) pages are read. Local and private addresses, other schemes, and a redirect into a private network are all refused.

## web_read {"url":"http://localhost:8081/mcp"}

```json
{
  "error": "local addresses can't be read"
}
```

## web_read {"url":"http://127.0.0.1:3910/"}

```json
{
  "error": "that address points inside a private network, so it can't be read"
}
```

## web_read {"url":"http://192.168.1.1/admin"}

```json
{
  "error": "that address points inside a private network, so it can't be read"
}
```

## web_read {"url":"http://[::1]/"}

```json
{
  "error": "that address points inside a private network, so it can't be read"
}
```

## web_read {"url":"file:///etc/passwd"}

```json
{
  "error": "only http(s) web addresses can be read"
}
```

## web_read {"url":"http://web.test/moved"}

```json
{
  "error": "that address points inside a private network, so it can't be read"
}
```
