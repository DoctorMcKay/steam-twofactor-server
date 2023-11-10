let g_SteamAccountDetails = null;

let g_RequestInFlight = false;
let g_IsAutoConfirming = false;
let g_UsedTimestamps = [];
let g_CheckInitAttempts = 0;

checkInit();
async function checkInit() {
	loading('Loading');

	if (!window.UserScriptInjected) {
		if (++g_CheckInitAttempts < 20) {
			// Give the userscript some time to inject and run
			setTimeout(checkInit, 100);
			return;
		}

		// Userscript is not present
		$('.view').hide();
		$('#fatal-error-view').show();

		// Only this once, we don't want to show the "Change 2FA Server URL" link on the error view
		$('#fatal-error-view .configure-server-link').remove();

		return;
	}

	let serverUrl = await UserScriptInjected.getServerUrl();
	if (!serverUrl) {
		showConfigView();
		return;
	}

	// Userscript is present
	let accountDetails = await UserScriptInjected.getLoggedInAccountDetails();
	if (!accountDetails) {
		fatalError('Sign in to steamcommunity.com before attempting to access this page.');
		return;
	}

	g_SteamAccountDetails = accountDetails;
	$('#account-name').text(accountDetails.accountName);

	loadConfirmations();
}

$('#refresh-btn').click(loadConfirmations);

async function loadConfirmations() {
	try {
		loading('Loading Your Confirmations');

		let confsList = await UserScriptInjected.getConfirmationList();
		if (!confsList.success) {
			throw new Error(confsList.message || confsList.detail || 'Failed to load confirmations list');
		}

		let $mainAppView = $('#main-app-view');

		$('#loader-view').hide();
		$mainAppView.show();

		let $confsContainer = $('#confs-container');
		let $noConfsMsg = $('#no-confs-msg');

		let confs = (confsList.conf || []);
		$mainAppView[confs.length == 0 ? 'removeClass' : 'addClass']('has-confirmations');
		if (confs.length == 0) {
			return;
		}

		$confsContainer.html('');

		confs.forEach((conf) => {
			let {id, nonce, headline, icon, summary, type_name: typeName, accept, cancel} = conf;

			let $conf = $('<div class="confirmation" />');

			let removeConf = () => {
				$conf.remove();
				if ($confsContainer.find('.confirmation').length == 0) {
					$('#main-app-view').removeClass('has-confirmations');
				} else if (g_IsAutoConfirming) {
					// start confirming the next one
					$('#accept-all-btn').click();
				}
			};

			let $typeDesc = $('<span class="type-desc" />');
			$typeDesc.text(typeName);

			let $headline = $('<span class="headline" />');
			$headline.text(headline);

			let $summary = $('<span class="summary" />');
			$summary.html(summary.join('<br />'));

			let $icon = $('<img class="icon" />');
			$icon.attr('src', icon);

			let $btnAccept = $('<button type="button" class="action accept" />');
			$btnAccept.attr('title', accept);
			$btnAccept.html('&#10004');
			$btnAccept.click(async () => {
				if (g_RequestInFlight) {
					return;
				}

				try {
					g_RequestInFlight = true;
					$conf.addClass('loading');

					let overrideTimestamp = null;
					if (g_IsAutoConfirming) {
						overrideTimestamp = Math.floor(Date.now() / 1000);

						while (g_UsedTimestamps.includes(overrideTimestamp)) {
							overrideTimestamp++;
						}

						g_UsedTimestamps.push(overrideTimestamp);
					}

					let result = await UserScriptInjected.respondToConfirmation(id, nonce, true, overrideTimestamp);
					if (!result.success) {
						throw new Error(result.message || result.detail || 'Could not act on confirmation');
					}

					g_RequestInFlight = false;
					removeConf();
				} catch (ex) {
					// TODO use something other than alert()
					alert(ex.message || ex);
					$conf.removeClass('loading');
					g_RequestInFlight = false;
				}
			});

			let $btnCancel = $('<button type="button" class="action cancel" />');
			$btnCancel.attr('title', cancel);
			$btnCancel.html('&times;');
			$btnCancel.click(async () => {
				if (g_RequestInFlight) {
					return;
				}

				try {
					g_RequestInFlight = true;
					$conf.addClass('loading');
					let result = await UserScriptInjected.respondToConfirmation(id, nonce, false);
					if (!result.success) {
						throw new Error(result.message || result.detail || 'Could not act on confirmation');
					}

					g_RequestInFlight = false;
					removeConf();
				} catch (ex) {
					// TODO use something other than alert()
					alert(ex.message || ex);
					$conf.removeClass('loading');
					g_RequestInFlight = false;
				}
			});

			let $loader = $('<div class="loader-cube" />');

			$conf.append($typeDesc);
			$conf.append($headline);
			$conf.append($summary);
			$conf.append($icon);
			$conf.append($btnAccept);
			$conf.append($btnCancel);
			$conf.append($loader);

			$confsContainer.append($conf);
		});
	} catch (ex) {
		fatalError('Error: ' + (ex.message || ex));
	}
}

$('#accept-all-btn').click(() => {
	if (g_RequestInFlight) {
		return;
	}

	let $confsContainer = $('#confs-container');

	if ($confsContainer.find('.confirmation').length == 0) {
		// nothing to do here
		g_IsAutoConfirming = false;
		return;
	}

	g_IsAutoConfirming = true;
	g_AutoConfirmTimestampOffset = -20;
	$confsContainer.find(':first-child').find('.accept').click();
});

function loading(message) {
	$('.view').hide();

	let $loaderView = $('#loader-view');
	$loaderView.find('h1').text(message);
	$loaderView.show();
}

function fatalError(message) {
	$('.view').hide();

	let $fatalView = $('#fatal-error-view');
	$fatalView.find('#fatal-error-msg').text(message);
	$fatalView.show();
}

// Configure UI stuff

$('.configure-server-link').click(function(e) {
	e.preventDefault();
	showConfigView();
});

async function showConfigView() {
	loading('Loading');

	let serverUrl = await UserScriptInjected.getServerUrl();

	$('.view').hide();
	$('#configure-server-view').show();

	$('#twofa-server-url').val(serverUrl);
}

$('#twofa-server-save-btn').click(async () => {
	let newServerUrl = $('#twofa-server-url').val();
	if (newServerUrl.length > 0 && !newServerUrl.endsWith('/')) {
		newServerUrl += '/';
	}

	await UserScriptInjected.setServerUrl(newServerUrl);

	checkInit();
});
