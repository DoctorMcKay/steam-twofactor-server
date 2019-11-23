# Steam Two-Factor Authentication Web Server

This is a node.js web server that returns Steam two-factor login codes for use in login and mobile trade confirmation.

You could maybe use this to separate your secrets from your accounts, or to make it easier to get codes for your
alternate accounts. You should use the official Steam app for any account with significant value.

There is no logging as of yet. It just prints messages to stdout. You could use `forever` to redirect these into a file.
You could also use `forever` to run it as a daemon.

## PHP Version

If Node.js isn't your thing or you already have a PHP-supporting webserver running, a PHP version is also available in this repo.
Just upload the included steam_twofactor.php somewhere to your webserver. Create a directory somewhere else to store your secrets
and upload them to that directory as .json files (just like how the Node version wants them). **Make sure this directory is not
web accessible.** You could accomplish this by putting the directory outside of your webroot, or by configuring your server to deny
access to this directory (e.g. via .htaccess).

Once everything is uploaded, edit steam_twofactor.php (you can rename this file if you wish) and put the path (relative to the script)
to your secrets directory (which can be named anything you wish) in the `$secrets_dir` variable at the top. You can also configure the
other settings via the variables at the top of the file.

This PHP script is entirely standalone and has no dependencies of any kind; all you need to upload is the file itself and your secrets.

Once uploaded, all endpoints provided by the Node server are accessible via the script. For example, if you uploaded the script to
https://www.example.com/steam_twofactor.php, then to get a login code for the account "gaben" you would request
https://www.example.com/steam_twofactor.php/code/gaben

If you're using the included user script, then your server URL should be the full URL to the base script, followed by a slash. Following
the above example URL, it would be https://www.example.com/steam_twofactor.php/

If you're using Apache, PATH_INFO should already be set up and working. If you're using nginx, then your configuration might not work
with PATH_INFO. You can set it up by using this php-fpm location block (replace `fastcgi_pass` if you're using a Unix socket):

	location ~ \.php(/|$) {
		# Split out path info
		fastcgi_split_path_info ^(.+?\.php)(/.*)$;
		
		# Make sure that the base script exists
		if (!-f $document_root$fastcgi_script_name) {
			return 404;
		}

		# Mitigate https://httpoxy.org vulns
		fastcgi_param HTTP_PROXY "";

		include /etc/nginx/fastcgi_params;
		fastcgi_pass 127.0.0.1:9000; # replace this if you're using a Unix sock
		fastcgi_index index.php;
		fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
		fastcgi_param PATH_INFO $fastcgi_path_info; # pass the path info to php-fpm
	}

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
