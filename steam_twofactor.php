<?php
/**
 * This is the PHP version of steam-twofactor-server (https://github.com/DoctorMcKay/steam-twofactor-server)
 * It should be pretty straightforward. Just put this file somewhere on your webserver and configure the path
 * below to where your secrets are stored. If you're using nginx, make sure PATH_INFO works (see README.md in
 * the above repo for more information).
 * VERY IMPORTANT: MAKE SURE YOUR SECRETS DIRECTORY IS NOT WEB-ACCESSIBLE!
 */
 
$secrets_dir = './secrets/';     // make certain this isn't web-accessible
$get_time_offset = false;        // set to true to request the current time from Steam and calculate an offset for each request
$whitelisted_ips = [];           // if you want to limit requests to only specific IPs, put them in this array in dotted-decimal string format (e.g. 127.0.0.1)




// Don't edit below this point
if (!empty($whitelisted_ips) && !in_array($_SERVER['REMOTE_ADDR'], $whitelisted_ips)) {
	http_response_code(403);
	die('<h1>403 Forbidden</h1>Your IP address (' . $_SERVER['REMOTE_ADDR'] . ') is not permitted to use this service.');
}

if (empty($_SERVER['PATH_INFO'])) {
	http_response_code(404);
	die('<h1>404 Not Found</h1>');
}

if (preg_match('#^/code/([^/]+)$#', $_SERVER['PATH_INFO'], $matches)) {
	$secrets = get_secrets($matches[1]);
	if (!$secrets || empty($secrets['shared_secret'])) {
		http_response_code(404);
		die('<h1>404 Not Found</h1>No secret is available for that account.');
	}
	
	header('Content-Type: text/plain');
	echo SteamTotp::getAuthCode($secrets['shared_secret'], get_time_offset());
	exit(0);
}

if (preg_match('#^/key/([^/]+)/([^/]+)$#', $_SERVER['PATH_INFO'], $matches)) {
	$secrets = get_secrets($matches[1]);
	if (!$secrets || empty($secrets['identity_secret'])) {
		http_response_code(404);
		die('<h1>404 Not Found</h1>No secret is available for that account.');
	}
	
	$time = filter_input(INPUT_GET, 't', FILTER_VALIDATE_INT);
	if (!$time) {
		$time = time() + get_time_offset();
	}
	
	header('Content-Type: application/json');
	echo json_encode(['time' => $time, 'key' => SteamTotp::getConfirmationKey($secrets['identity_secret'], $time, $matches[2])]);
	exit(0);
}

http_response_code(404);
die('<h1>404 Not Found</h1>');


// functions
function get_secrets($username) {
	global $secrets_dir;
	
	if (!preg_match('#/$#', $secrets_dir)) {
		$secrets_dir .= '/';
	}
	
	$file = @file_get_contents($secrets_dir . $username . '.json');
	if (!$file) {
		return false;
	}
	
	$file = json_decode($file, true);
	return $file ?: false;
}

function get_time_offset() {
	global $get_time_offset;
	if (!$get_time_offset) {
		return 0;
	}
	
	return SteamTotp::getTimeOffset() ?: 0;
}


// SteamTotp
class SteamTotp {
    const CHARSET = '23456789BCDFGHJKMNPQRTVWXY';
    const CODE_LENGTH = 5;

    /**
     * Generate a Steam-style TOTP authentication code.
     * @param string $shared_secret   Your TOTP shared_secret, as a base64 string, hex string, or binary string
     * @param int $time_offset        If you know how far off your clock is from the Steam servers, put the offset here in seconds
     * @return string
     */
    public static function getAuthCode($shared_secret, $time_offset = 0) {
        $hmac = hash_hmac('sha1', pack('NN', 0, floor((time() + $time_offset) / 30)), self::bufferizeSecret($shared_secret), true);
        $start = unpack('c19trash/Cstart', $hmac);
        $start = $start['start'] & 0x0F;

        $fullcode = unpack('c' . $start . 'trash/Nfullcode', $hmac);
        $fullcode = $fullcode['fullcode'] & 0x7FFFFFFF;

        $code = '';
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= substr(self::CHARSET, $fullcode % strlen(self::CHARSET), 1);
            $fullcode /= strlen(self::CHARSET);
        }

        return $code;
    }

    /**
     * Generate a base64 confirmation key for use with mobile trade confirmations. The key can only be used once.
     * @param string $identity_secret   The identity_secret that you received when enabling two-factor authentication, as a base64 string, hex string, or binary string
     * @param int $time                 The Unix time for which you are generating this secret. Generally should be the current time.
     * @param string $tag               The tag which identifies what this request (and therefore key) will be for. "conf" to load the confirmations page, "details" to load details about a trade, "allow" to confirm a trade, "cancel" to cancel it.
     * @return string
     */
    public static function getConfirmationKey($identity_secret, $time, $tag) {
        if (empty($tag)) {
            $buf = pack('NN', 0, $time);
        } else {
            $buf = pack('NNa*', 0, 	$time, $tag);
        }

        $hmac = hash_hmac('sha1', $buf, self::bufferizeSecret($identity_secret), true);
        return base64_encode($hmac);
    }

    /**
     * Queries the Steam servers for their time, then subtracts our local time from it to get our offset.
     * The offset is how many seconds we are *behind* Steam. Therefore, *add* this number to our local time to get Steam time.
     * You can pass this value to getAuthCode as-is with no math involved.
     * @return int|false false on failure
     */
    public static function getTimeOffset() {
        $ch = curl_init("http://api.steampowered.com/ITwoFactorService/QueryTime/v1/");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Length: 0']);
        $response = curl_exec($ch);
        curl_close($ch);

        if (!$response) {
            return false;
        }

        $response = json_decode($response, true);
        if (!$response || !isset($response['response']) || !isset($response['response']['server_time'])) {
            return false;
        }

        return $response['response']['server_time'] - time();
    }

    /**
     * Get a standardized device ID based on your SteamID.
     * @param string|int $steamid Your SteamID in 64-bit format (as a string or integer)
     * @return string
     */
    public static function getDeviceID($steamid) {
        return 'android:' . preg_replace('/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12}).*$/', '$1-$2-$3-$4-$5', sha1($steamid));
    }

    private static function bufferizeSecret($secret) {
        if (preg_match('/[0-9a-fA-F]{40}/', $secret)) {
            return pack('H*', $secret);
        }

        if (preg_match('/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{4})$/', $secret)) {
            return base64_decode($secret);
        }

        return $secret;
    }
}
