// ==UserScript==
// @name        Steam Community Mobile Trade Confirmations
// @namespace   www.doctormckay.com
// @description Enables mobile trade confirmations in the web browser
// @include     https://steamcommunity.com/mobileconf/conf*
// @include     https://steamcommunity.com/tradeoffer/*
// @include     https://steamcommunity.com/login/*
// @include     https://steamcommunity.com/openid/login*
// @include     https://store.steampowered.com/login/*
// @include     https://store.steampowered.com//login/*
// @include     https://partner.steamgames.com/
// @include     https://help.steampowered.com/en/wizard/Login*
// @require     https://greasemonkey.github.io/gm4-polyfill/gm4-polyfill.js
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js
// @require     https://raw.githubusercontent.com/DoctorMcKay/steam-twofactor-server/master/userscript/sha1.js
// @version     1.4.8
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM.setValue
// @grant       GM.getValue
// @grant       GM.deleteValue
// @grant       GM.xmlHttpRequest
// ==/UserScript==

var $ = jQuery;
var g_DeviceID = typeof unsafeWindow.g_steamID === 'string' ? encodeURIComponent("android:" +
	hex_sha1(unsafeWindow.g_steamID).replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12}).*$/, '$1-$2-$3-$4-$5')) : "";

function error(msg) {
	GM.setValue("errormsg", msg);
	location.href = "/mobileconf/conf?options";
}

if (location.href.match(/mobileconf/)) {
	unsafeWindow.SGHandler = cloneInto({"getResultStatus": function() { return "busy"; }, "getResultValue": function() { return ""; }}, unsafeWindow, {"cloneFunctions": true});
	unsafeWindow.GetValueFromLocalURL = exportFunction(function(url, timeout, success, error, fatal) {
		GM.getValue("serverurl").then(function(serverUrl) {
			var accountName = $('#account_pulldown').text().trim();

			getKey("allow", function(time, key) {
				success("p=" + g_DeviceID + "&a=" + unsafeWindow.g_steamID + "&k=" + encodeURIComponent(key) + "&t=" + time + "&m=android&tag=allow");
			});
		});
	}, unsafeWindow);

	if (!location.search || location.search == "?options") {
		GM.getValue("serverurl", "").then(function(serverUrl) {
			if (location.search == "?options" || !serverUrl) {
				GM.getValue("errormsg").then(function(error) {
					var $error = $('<p style="color: #c00"></p>');
					if (error) {
						$error.text(error);
						GM.deleteValue("errormsg");
					}

					var $serverurl = $('<p>2FA Server Base URL: <input type="text" size="100" placeholder="http://example.com/2fa/" style="padding: 3px; border-color: #222; color: #ccc" value="' + serverUrl + '" /></p>');
					var $save = $('<p><button type="button" id="gm_save">Save</button></p>');
					var $empty = $('#mobileconf_empty');
					$empty.html($error).append($serverurl).append($save);

					$save.find('button').click(function() {
						GM.setValue("serverurl", $serverurl.find('input').val());
						redirectToConf();
					});
				});
			} else {
				redirectToConf();
			}
		});
	} else {
		$('#mobileconf_empty').append('<div style="margin-top: 20px"><a href="/mobileconf/conf?options" style="text-decoration: underline">Change 2FA Server URL</a></div>');
		
		if ($('.mobileconf_list_entry').length > 0) {
			var $acceptAll = $('<a class="btn_darkblue_white_innerfade btn_medium" href="#" style="margin: 10px 50px"><span>Accept All</span></a>');
			$('.responsive_page_template_content').prepend($acceptAll);
			$acceptAll.click(function() {
				doAcceptAll();
			});
		}
	}
}

function doAcceptAll(failures) {
	var $confs = $('.mobileconf_list_entry');
	
	if ($confs.length == 0) {
		location.reload();
		return;
	}
	
	var modal = unsafeWindow.ShowBlockingWaitDialog("Accepting Confirmations...", $confs.length + " confirmation" + ($confs.length == 1 ? '' : 's') + " remaining..." + (failures ? '<br />' + failures + ' failure' + (failures == 1 ? '' : 's') : ''));
	var $conf = $($confs[0]);
	
	unsafeWindow.SendMobileConfirmationOp("allow", $conf.data('confid'), $conf.data('key'), exportFunction(function() {
		// success
		confDone();
	}, unsafeWindow), exportFunction(function() {
		// error
		failures = failures || 0;
		failures++;
		confDone();
	}, unsafeWindow));
	
	function confDone() {
		unsafeWindow.RemoveConfirmationFromList($conf.data('confid'));
		modal.Dismiss();
		doAcceptAll(failures);
	}
}

if (location.href.match(/tradeoffer/)) {
	var originalShowAlertDialog = unsafeWindow.ShowAlertDialog;
	unsafeWindow.ShowAlertDialog = exportFunction(function(title, msg) {
		originalShowAlertDialog(title, msg);
		
		if (msg.match(/verify it in your Steam Mobile app/)) {
			redirectToConf(true);
		}
	}, unsafeWindow);
}

function redirectToConf(suppressDialog) {
	if (!suppressDialog) {
		unsafeWindow.ShowBlockingWaitDialog('Loading...', 'Loading your confirmations...');
	}
	
	getKey("conf", function(time, key) {
		location.href = "/mobileconf/conf?p=" + g_DeviceID + "&a=" + unsafeWindow.g_steamID + "&k=" + encodeURIComponent(key) + "&t=" + time + "&m=android&tag=conf";
	});
}

function getAccountName(callback) {
	var accountName  = $('#account_dropdown .persona').text().trim();
	if (accountName) {
		callback(accountName);
		return;
	}
	
	// It's not on this page
	$.get('/', function(html) {
		accountName = html.match(/<span [^>]*class="persona online"[^>]*>([^<]+)<\/span>/);
		if (!accountName) {
			callback(null);
		} else {
			callback(accountName[1].trim());
		}
	});
}

function getKey(tag, callback) {
	GM.getValue("serverurl").then(function(serverUrl) {
		getAccountName(function(accountName) {
			if (!accountName) {
				error("We couldn't get your account name.");
				return;
			}
			
			GM.xmlHttpRequest({
				"method": "GET",
				"url": serverUrl + "key/" + accountName + "/" + tag,
				"onload": function(response) {
					if (!response.responseText) {
						error("There was an unknown error when requesting a key.");
						return;
					}

					var errMatch = response.responseText.match(/<h1>[^<]+<\/h1>([^\n]+)/);
					if (errMatch) {
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
		});
	});
}

// Add auto-code-entering for logins
unsafeWindow.addEventListener('load', function() {
	if (unsafeWindow.CLoginPromptManager) {
		GM.getValue("serverurl").then(function(serverUrl) {
			if (!serverUrl) {
				return;
			}

			var proto = unsafeWindow.CLoginPromptManager.prototype;

			var originalStartTwoFactorAuthProcess = proto.StartTwoFactorAuthProcess;
			proto.StartTwoFactorAuthProcess = exportFunction(function() {
				originalStartTwoFactorAuthProcess.call(this);

				var self = this;
				var username = this.m_strUsernameEntered;
				GM.xmlHttpRequest({
					"method": "GET",
					"url": serverUrl + "code/" + username,
					"onload": function(response) {
						if (!response.responseText || response.responseText.length != 5) {
							return;
						}
						
						document.getElementById('twofactorcode_entry').value = response.responseText;
						proto.SubmitTwoFactorCode.call(self);
					}
				});
			}, unsafeWindow);
		});
	}
});
