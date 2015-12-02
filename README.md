# Steam Two-Factor Authentication Web Server

This is a node.js web server that returns Steam two-factor login codes for use in login and mobile trade confirmation.

You could maybe use this to separate your secrets from your accounts, or to make it easier to get codes for your
alternate accounts. You should use the app for any account with significant value.

There is no logging as of yet. It just prints messages to stdout. You could use `forever` to redirect these into a file.
You could also use `forever` to run it as a daemon.

## Configuration

Copy `config.sample.json` to `config.json` and edit the settings as you wish.

- `ip` - The IP address of the interface where the web server should listen. `0.0.0.0` for all interfaces
- `port` - The port that the web server should bind to
- `rootPath` - The root where the server should register its endpoints, with leading and trailing slashes.
	- For example, `/` will put all endpoints at `/endpoint` while `/2fa/` will put all endpoints at `/2fa/endpoint`.
	- This is designed for use with an HTTP proxy (like nginx or Apache).
- `behindProxy` - If your node server will be running behind an HTTP proxy like nginx, Apache, or CloudFlare, set this to `true`.
	- This will cause the server to use the `X-Forwarded-For` header for the remote client's IP address
- `restrictAccess` - `true` if you want to limit access by IP address (see `allowedAddresses`)
- `allowedAddresses` - An array of IP addresses that are allowed access if `restrictAccess` is `true`

You may have noticed that there's no options for HTTPS. This is currently unsupported. Use nginx or Apache as a proxy
if you want HTTPS for now.

## Secrets

Put your accounts' secrets under the `/secrets` directory. Each account should have a file named `accountname.json`,
where `accountname` if your account's Steam login name. The contents of each json file should be the full response
object from the `AddAuthenticator` Steam request. If you enabled 2FA using your phone, you can probably find this file
somewhere in your device's storage if you're rooted/jailbroken.

## Endpoints

To get actual codes, use the following endpoints

### /code/:username
- `username` - Your account's username

Returns a basic `text/plain` response containing your account's current 5-digit alphanumeric login code.

#### Example

- Request: `GET /code/test_account`
	- Response: `YD6DX`

### /key/:username/:tag
- `username` - Your account's username
- `tag` - The `tag` for this request

Returns a JSON response containing the current `time` and the `key` encoded in base64. These are to be used with the
mobile confirmations page on steamcommunity.com.

**Optional:** You can override the time using `?t=unixtime`.

### Example

- Request: `GET /key/test_account/conf`
    - Response: `{"time":1449086709,"key":"ev5vtBxVGJ2kcbvPWlaFEY8oFow="}`
- Request: `GET /key/test_account/conf?t=1449086710`
	- Response: `{"time":1449086710,"key":"1KrL/3IEsZ98sl/rP9uDRvErWJE="}`

## HTTP Response Codes

- `200` - The request completed successfully and you should have received a valid response
- `403` - Your IP is not whitelisted
- `404` - No secret file was found for that account (or bad endpoint)
- `500` - Some unexpected error occurred, likely in file I/O

If an error occurs, the response body will contain more information.
