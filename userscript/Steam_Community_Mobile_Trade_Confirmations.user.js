// ==UserScript==
// @name        Steam Community Mobile Trade Confirmations
// @author      Dr. McKay
// @namespace   www.doctormckay.com
// @description Enables mobile trade confirmations in the web browser
// @match       https://doctormckay.github.io/steam-twofactor-server/*
// @match       https://steamcommunity.com/mobileconf/*
// @match       https://steamcommunity.com/tradeoffer/*
// @match       https://steamcommunity.com/login/*
// @match       https://steamcommunity.com/openid/login*
// @match       https://store.steampowered.com/login/*
// @match       https://store.steampowered.com//login/*
// @match       https://partner.steamgames.com/
// @match       https://help.steampowered.com/en/wizard/Login*
// @require     https://greasemonkey.github.io/gm4-polyfill/gm4-polyfill.js
// @require     https://raw.githubusercontent.com/DoctorMcKay/steam-twofactor-server/master/userscript/sha1.js
// @connect     steamcommunity.com
// @connect     *
// @version     2.0.5
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM.setValue
// @grant       GM.getValue
// @grant       GM.deleteValue
// @grant       GM.xmlHttpRequest
// ==/UserScript==

let g_PageIsConfirmationUI = location.href.startsWith('https://doctormckay.github.io/steam-twofactor-server');
let g_AccountDetails = null;

if (g_PageIsConfirmationUI) {
	unsafeWindow.UserScriptInjected = {
		getServerUrl() {
			return GM.getValue('serverurl');
		},

		setServerUrl(serverUrl) {
			return GM.setValue('serverurl', serverUrl);
		},

		getLoggedInAccountDetails() {
			return getAccountDetails();
		},

		getConfirmationList() {
			return new Promise(async (resolve, reject) => {
				try {
					let serverUrl = await GM.getValue('serverurl');
					if (!serverUrl) {
						return reject(new Error('No 2FA server URL configured'));
					}

					let query = await getOpQueryString('list');
					let result = await gmGet('https://steamcommunity.com/mobileconf/getlist?' + query);
					try {
						result = JSON.parse(result.responseText);
					} catch (ex) {
						return reject(new Error('No valid response received from Steam for confirmation list.'));
					}

					resolve(result);
				} catch (ex) {
					reject(ex);
				}
			});
		},

		respondToConfirmation(confId, confKey, accept, overrideTimestamp) {
			return new Promise(async (resolve, reject) => {
				try {
					let keyTag = accept ? 'accept' : 'reject';
					let op = accept ? 'allow' : 'cancel';

					let query = await getOpQueryString(keyTag, {
						op,
						cid: confId,
						ck: confKey
					}, overrideTimestamp);

					let result = await gmGet('https://steamcommunity.com/mobileconf/ajaxop?' + query);
					if (!result.responseText) {
						return reject(new Error('Invalid response received from Steam'));
					}

					try {
						result = JSON.parse(result.responseText);
					} catch (ex) {
						return reject(new Error('Malformed response received from Steam'));
					}

					resolve(result);
				} catch (ex) {
					reject(ex);
				}
			});
		}
	};
}

function getOpQueryString(keyTag, params, overrideTimestamp) {
	return new Promise(async (resolve, reject) => {
		try {
			let {steamID, accountName} = await getAccountDetails();
			let {time, key} = await getKey(keyTag, overrideTimestamp);

			let deviceId = 'android:' + hex_sha1(steamID).replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12}).*$/, '$1-$2-$3-$4-$5');

			let qsParams = {
				p: deviceId,
				a: steamID,
				k: key,
				t: time,
				m: 'react',
				tag: keyTag,
				...(params || {})
			};

			resolve(Object.keys(qsParams).map(i => `${i}=${encodeURIComponent(qsParams[i])}`).join('&'));
		} catch (ex) {
			reject(ex);
		}
	});
}

function gmGet(url) {
	return new Promise((resolve, reject) => {
		GM.xmlHttpRequest({
			method: 'GET',
			url,
			onload: resolve,
			onerror: (res) => reject(new Error(`HTTP error ${res.status}`))
		});
	});
}

function getAccountDetails() {
	return new Promise(async (resolve, reject) => {
		if (g_AccountDetails) {
			return resolve(g_AccountDetails);
		}

		try {
			let result = await gmGet('https://steamcommunity.com');

			let steamId = result.responseText.match(/g_steamID = "(\d+)";/);
			let accountName = result.responseText.match(/<span class="[^"]*account_name[^"]*">([^<]+)<\/span>/);
			if (!steamId || !accountName) {
				return resolve(null);
			}

			g_AccountDetails = {
				steamID: steamId[1],
				accountName: accountName[1]
			};

			resolve(g_AccountDetails);
		} catch (ex) {
			reject(ex);
		}
	});
}

if (location.href.match(/tradeoffer/)) {
	var originalShowAlertDialog = unsafeWindow.ShowAlertDialog;
	unsafeWindow.ShowAlertDialog = exportFunction(function(title, msg) {
		originalShowAlertDialog(title, msg);

		if (msg.match(/verify it in your Steam Mobile app/)) {
			location.href = 'https://doctormckay.github.io/steam-twofactor-server/';
		}
	}, unsafeWindow);
}

function getKey(tag, overrideTimestamp) {
	return new Promise(async (resolve, reject) => {
		let serverUrl, account;

		try {
			serverUrl = await GM.getValue('serverurl');
			if (!serverUrl) {
				return reject(new Error('No 2FA server URL configured'));
			}

			account = await getAccountDetails();
			if (!account) {
				return reject(new Error('Not logged in to steamcommunity.com'));
			}
		} catch (ex) {
			reject(new Error(`Error from Steam: ${ex.message || ex}`));
		}

		try {
			let queryString = overrideTimestamp ? `?t=${overrideTimestamp}` : '';
			let result = await gmGet(`${serverUrl}key/${account.accountName}/${tag}${queryString}`);
			if (!result.responseText) {
				return reject(new Error('There was an unknown error when requesting a key from your 2FA server.'));
			}

			let errMatch = result.responseText.match(/<h1>[^<]+<\/h1>([^\n]+)/);
			if (errMatch) {
				return reject(new Error(errMatch[1]));
			}

			try {
				let json = JSON.parse(result.responseText);
				return resolve(json);
			} catch(e) {
				return reject(new Error('We got a malformed response from your 2FA server.'));
			}
		} catch (ex) {
			let err = ex.message || ex;
			reject(new Error(`Error from your 2FA server: ${ex.message || ex}`));
		}
	});
}

// Add auto-code-entering for logins
unsafeWindow.addEventListener('load', function() {
	if (
		!location.pathname.startsWith('/login') &&
		!location.pathname.startsWith('/openid/login') &&
		!location.pathname.match(/^\/([^\/]+)\/wizard\/Login/) &&
		location.hostname != 'partner.steamgames.com'
	) {
		return;
	}

	GM.getValue("serverurl").then(function(serverUrl) {
		if (!serverUrl) {
			return;
		}

		var interval = setInterval(function() {
			var inputs = document.querySelectorAll('[class^=newlogindialog_ConfirmationEntryContainer] [class^=segmentedinputs_SegmentedCharacterInput] input');
			var accountNameElement = document.querySelector('[class^=newlogindialog_AccountName]');
			if (inputs.length > 0 && accountNameElement && accountNameElement.textContent.trim().length > 0) {
				clearInterval(interval);

				GM.xmlHttpRequest({
					method: 'GET',
					url: serverUrl + 'code/' + accountNameElement.textContent.trim(),
					onload: function(response) {
						if (!response.responseText || response.responseText.length != 5) {
							return;
						}

						var dt = new DataTransfer();
						dt.setData('Text', response.responseText);
						var evt = new ClipboardEvent('paste', {clipboardData: dt, bubbles: true});

						inputs[0].dispatchEvent(evt);
					}
				});
			}
		}, 100);

		// Also handle legacy login prompts, still used on some pages like /openid/login
		if (unsafeWindow.CLoginPromptManager) {
			var proto = unsafeWindow.CLoginPromptManager.prototype;
			var codeSubmitted = false;

			var originalStartTwoFactorAuthProcess = proto.StartTwoFactorAuthProcess;
			proto.StartTwoFactorAuthProcess = exportFunction(function() {
				originalStartTwoFactorAuthProcess.call(this);

				if (codeSubmitted) {
					// If we already submitted a code, bail early to avoid a loop if the code was wrong
					return;
				}

				var self = this;
				var username = this.m_strUsernameEntered;
				GM.xmlHttpRequest({
					method: 'GET',
					url: serverUrl + 'code/' + username,
					onload: function(response) {
						if (!response.responseText || response.responseText.length != 5) {
							return;
						}

						document.getElementById('twofactorcode_entry').value = response.responseText;
						codeSubmitted = true;
						proto.SubmitTwoFactorCode.call(self);
					}
				});
			}, unsafeWindow);
		}
	});
});
