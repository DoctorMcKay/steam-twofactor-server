var Express = require('express');
var SteamTotp = require('steam-totp');
var fs = require('fs');

var server = new Express();

// Set up the web server
fs.readFile(__dirname + '/config.json', function(err, file) {
	if(err) {
		console.log("Fatal error reading config.json: " + err.message);
		process.exit(1);
	}

	var config = JSON.parse(file.toString('utf8'));

	// Everything looks good so far.
	server.listen(config.port, config.ip || "0.0.0.0");
	console.log("Server listening on " + (config.ip || "0.0.0.0") + ":" + config.port);

	// Set up proxy IPs, if necessary
	if(config.behindProxy) {
		server.set('trust proxy', true);
	}

	// Set up our middleware
	server.use(loadConfig);
	server.use(checkAuthorized);

	// Set up our routes
	var rootPath = config.rootPath || "/";
	server.get(rootPath + "code/:username", loadSecret, reqGetCode);
	server.get(rootPath + "key/:username/:tag", loadSecret, reqGetKey);
});

function loadConfig(req, res, next) {
	fs.readFile(__dirname + '/config.json', function(err, file) {
		if(err) {
			console.log("Cannot load config: " + err.message);
			res.status(500).send("<h1>500 Internal Server Error</h1>" + err.message);
			return;
		}

		req.appConfig = JSON.parse(file.toString('utf8'));
		next();
	});
}

function checkAuthorized(req, res, next) {
	if(!req.appConfig.restrictAccess) {
		next();
		return;
	}

	var address = req.connection.remoteAddress;
	if(req.appConfig.allowedAddresses.indexOf(req.ip) == -1) {
		console.log("Access denied from remote IP " + req.ip);
		res.status(403).send("<h1>403 Forbidden</h1>Your IP address is not allowed to access this resource.");
		return;
	}

	// All good
	next();
}

function loadSecret(req, res, next) {
	if(!req.params.username) {
		// No bot username in this request
		next();
		return;
	}

	fs.readFile(__dirname + '/secrets/' + req.params.username + '.json', function(err, file) {
		if(err) {
			if(err.code == 'ENOENT') {
				// No matching file
				res.status(404).send("<h1>404 Not Found</h1>No account data was found for that username.");
			} else {
				console.log("Cannot load secrets for " + req.params.username + ": " + err.message);
				res.status(500).send("<h1>500 Internal Server Error</h1>" + err.message);
			}

			return;
		}

		req.appSecrets = JSON.parse(file.toString('utf8'));
		next();
	});
}

function reqGetCode(req, res) {
	if(!req.appSecrets.shared_secret) {
		res.status(404).send("<h1>404 Not Found</h1>No <code>shared_secret</code> was found for that username.");
		return;
	}
	
	console.log("User requesting login code for " + req.params.username + " from " + req.ip);
	res.header("Content-Type", "text/plain");
	res.send(SteamTotp.generateAuthCode(req.appSecrets.shared_secret));
}

function reqGetKey(req, res) {
	console.log("User requesting confirmation key for " + req.params.username + ", tag " + req.params.tag + " from " + req.ip);

	var time = req.query.t ? parseInt(req.query.t, 10) : Math.floor(Date.now() / 1000);
	res.send({
		"time": time,
		"key": SteamTotp.getConfirmationKey(req.appSecrets.identity_secret, time, req.params.tag)
	});
}
