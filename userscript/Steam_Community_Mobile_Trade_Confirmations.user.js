// ==UserScript==
// @name        Steam Community Mobile Trade Confirmations
// @namespace   www.doctormckay.com
// @description Enables mobile trade confirmations in the web browser
// @include     https://steamcommunity.com/mobileconf/conf*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js
// @version     1.0.0
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// ==/UserScript==

var g_DeviceID = encodeURIComponent("android:" + Date.now());

function error(msg) {
	GM_setValue("errormsg", msg);
	location.href = "/mobileconf/conf?options";
}

unsafeWindow.SGHandler = cloneInto({"getResultStatus": function() { return "busy"; }, "getResultValue": function() { return ""; }}, unsafeWindow, {"cloneFunctions": true});
unsafeWindow.GetValueFromLocalURL = exportFunction(function(url, timeout, success, error, fatal) {
	var serverUrl = GM_getValue("serverurl");
	var accountName = $('#account_pulldown').text().trim();
	
	getKey("allow", function(time, key) {
		success("p=" + g_DeviceID + "&a=" + unsafeWindow.g_steamID + "&k=" + encodeURIComponent(key) + "&t=" + time + "&m=android&tag=allow");
	});
}, unsafeWindow);

if (!location.search || location.search == "?options") {
	var serverUrl = GM_getValue("serverurl", "");
	
	if(location.search == "?options" || !serverUrl) {
		var error = GM_getValue("errormsg");
		
		var $error = $('<p style="color: #c00"></p>');
		if(error) {
			$error.text(error);
			GM_deleteValue("errormsg");
		}
		
		var $serverurl = $('<p>2FA Server Base URL: <input type="text" size="100" placeholder="http://example.com/2fa/" style="padding: 3px; border-color: #222; color: #ccc" value="' + serverUrl + '" /></p>');
		var $save = $('<p><button type="button" id="gm_save">Save</button></p>');
		var $empty = $('#mobileconf_empty');
		$empty.html($error).append($serverurl).append($save);
		
		$save.find('button').click(function() {
			GM_setValue("serverurl", $serverurl.find('input').val());
			redirectToConf();
		});
	} else {
		redirectToConf();
	}
}

function redirectToConf() {
	unsafeWindow.ShowBlockingWaitDialog('Loading...', 'Loading your confirmations...');
	getKey("conf", function(time, key) {
		location.href = "/mobileconf/conf?p=" + g_DeviceID + "&a=" + unsafeWindow.g_steamID + "&k=" + encodeURIComponent(key) + "&t=" + time + "&m=android&tag=conf";
	});
}

function getKey(tag, callback) {
	var serverUrl = GM_getValue("serverurl");
	var accountName = $('#account_pulldown').text().trim();
	
	GM_xmlhttpRequest({
		"method": "GET",
		"url": serverUrl + "key/" + accountName + "/" + tag,
		"onload": function(response) {
			if(!response.responseText) {
				error("There was an unknown error when requesting a key.");
				return;
			}
			
			var errMatch = response.responseText.match(/<h1>[^<]+<\/h1>([^\n]+)/);
			if(errMatch) {
				error(errMatch[1]);
				return;
			}
			
			try {
				var json = JSON.parse(response.responseText);
				callback(json.time, json.key);
			} catch(e) {
				error("We got a malformed response from your 2FA server.");
			}
		},
		"onerror": function(response) {
			error("Error Code " + response.status + " from your 2FA server.");
		}
	});
}
