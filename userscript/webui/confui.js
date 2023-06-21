let g_SteamAccountDetails = null;

let g_CheckInitAttempts = 0;

checkInit();
async function checkInit() {
	if (!window.UserScriptInjected) {
		if (++g_CheckInitAttempts < 20) {
			// Give the userscript some time to inject and run
			setTimeout(checkInit, 100);
		}
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

		$('#loader-view').hide();
		$('#main-app-view').show();

		let $confsContainer = $('#confs-container');
		let $noConfsMsg = $('#no-confs-msg');

		let confs = (confsList.conf || []);
		if (confs.length == 0) {
			$confsContainer.hide();
			$noConfsMsg.show();
			return;
		}

		$noConfsMsg.hide();
		$confsContainer.show();
		$confsContainer.html('');

		confs.forEach((conf) => {
			let {id, nonce, headline, icon, summary, type_name: typeName, accept, cancel} = conf;

			let $conf = $('<div class="confirmation" />');

			let removeConf = () => {
				$conf.remove();
				if ($confsContainer.find('.confirmation').length == 0) {
					$noConfsMsg.show();
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
				try {
					$conf.addClass('loading');
					let result = await UserScriptInjected.respondToConfirmation(id, nonce, true);
					if (!result.success) {
						throw new Error(result.message || result.detail || 'Could not act on confirmation');
					}

					removeConf();
				} catch (ex) {
					// TODO use something other than alert()
					alert(ex.message || ex);
					$conf.removeClass('loading');
				}
			});

			let $btnCancel = $('<button type="button" class="action cancel" />');
			$btnCancel.attr('title', cancel);
			$btnCancel.html('&times;');
			$btnCancel.click(async () => {
				try {
					$conf.addClass('loading');
					let result = await UserScriptInjected.respondToConfirmation(id, nonce, false);
					if (!result.success) {
						throw new Error(result.message || result.detail || 'Could not act on confirmation');
					}

					removeConf();
				} catch (ex) {
					// TODO use something other than alert()
					alert(ex.message || ex);
					$conf.removeClass('loading');
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

function loading(message) {
	$('.view').hide();

	let $loaderView = $('#loader-view');
	$loaderView.find('h1').text(message);
	$loaderView.show();
}

function fatalError(message) {
	$('.view').hide();

	let $fatalView = $('#fatal-error-view');
	$fatalView.text(message);
	$fatalView.show();
}
