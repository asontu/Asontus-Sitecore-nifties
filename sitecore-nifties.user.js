// ==UserScript==
// @name         Asontu's Sitecore nifties
// @namespace    https://asontu.github.io/
// @version      6.1a2
// @description  Add environment info to Sitecore header, extend functionality
// @author       Herman Scheele
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==
(function() {
	'use strict';
	// Constants and globals
	const langLabelMap = {
		'english' : 'en',
		'german'  : 'de-DE',
		'dutch'   : 'nl-NL',
		'all'     : 'en'
	};
	const flags = {
		'nl-NL' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAIAAADdv/LVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY1gro8Hw//9/BkW3bgAdYwThATJlswAAAABJRU5ErkJggg==)',
		'de-DE' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAIAAADdv/LVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAASSURBVBhXYwCBtzIqDP/PMAAADHgC+WifnsQAAAAASUVORK5CYII=)',
		'en'    : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAFCAYAAACJmvbYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsIAAA7CARUoSoAAAAAkSURBVBhXY/iPBC7wqENZEMDEgAcwglRD2ZgAagIYkGAsAwMASNE13HrcoigAAAAASUVORK5CYII=)'
	};
	const exm = isPage('/sitecore/shell/client/Applications/ECM');
	const ribbon = isPage('ribbon.aspx');
	const desktop = isPage('/sitecore/shell/default.aspx');
	const launchPad = isPage('/sitecore/client/applications/launchpad');
	const formsEditor = isPage('/sitecore/client/Applications/FormsBuilder/');
	const designingForm = isPage('/sitecore/client/Applications/FormsBuilder/Pages/FormDesigner');
	const loginScreen = isPage('/sitecore/login') || isPage('/Account/Login');
	const contentEditor = isPage('/sitecore/shell/Applications/Content%20Editor.aspx');
	var search = getSearch();
	var globalLogo;

	function init() {
		globalLogo = headerInfo.detectGlobalLogo();
		if (!globalLogo) {
			// we're inside some non-Ribbon iframe we don't care about, exit
			return;
		}
		if (contentEditor) {
			contentTreeTweaks.init();
		}
		if (!continueFeature.init()) {
			return;
		}
		let envName, envColor;
		[envName, envColor] = recognizedDomain.init();
		headerInfo.repaint(globalLogo, envName, envColor);
		if (contentEditor || formsEditor) {
			languageInfo.init();
		}
		if (launchPad) {
			quickAccess.initCheckboxes();
		}
		if (exm) {
			var exmObserver = new MutationObserver(repaintExmHeader);
			var exmPanel = document.querySelector('div.progress-indicator-panel');

			if (exmPanel) {
				exmObserver.observe(exmPanel, {attributes:false, childList: true, subtree: true});
			}
			function repaintExmHeader() {
				exmObserver.disconnect();

				globalLogo = headerInfo.detectGlobalLogo();
				if (globalLogo) {
					headerInfo.repaint(globalLogo, envName, envColor);
				}

				exmObserver.observe(exmPanel, {attributes:false, childList: true, subtree: true});
			}
		}
		if (formsEditor) {
			formsContentEditorLinks.init();
		}
	}

	var recognizedDomain = new (function() {
		let registeredDomains = JSON.parse(GM_getValue('RegisteredDomains', '[]'));
		let domainSettings = false;
		let menuCommand = null;
		this.init = function() {
			let domIndex = registeredDomains.findIndex(d => new RegExp(d.regex).test(location.host));
			if (domIndex > -1) {
				domainSettings = registeredDomains[domIndex];
			}
			if (!domainSettings) {
				menuCommand = GM_registerMenuCommand("Register domain with user-script", showRegForm, "r");
				return ['', ''];
			} else {
				menuCommand = GM_registerMenuCommand("Forget this domain", forgetDomain, "f");
				return [domainSettings.friendly, domainSettings.color];
			}
		}
		function showRegForm() {
			let ul = document.querySelector('ul.sc-accountInformation');
			if (!ul) { return; }
			let li = ul.querySelector('li');

			addRegFormElement(ul, li, `<input type="text" id="domainRegex" placeholder="Domain regex" title="The regex to recognize this domain/environment" value="^${location.host.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$" style="display: inline-block;max-width: 80%; line-height: initial; color: #000;">`);
			addRegFormElement(ul, li, `<input type="text" id="domainFriendlyName" placeholder="Friendly name" title="Friendly name for this domain, will be placed in header and title" style="display: inline-block;width: 80%; line-height: initial; color: #000;">`);
			addRegFormElement(ul, li, `<input type="color" id="domainColor" title="Color to give the header on this domain" value="#2b2b2b">`);
			addRegFormElement(ul, li, `<button type="button" style="line-height: initial; color: #000;">Save</button>`);

			ul.querySelector('button').onclick = function() {
				domainSettings = {
					regex : ul.querySelector('#domainRegex').value,
					friendly : ul.querySelector('#domainFriendlyName').value,
					color : ul.querySelector('#domainColor').value
				};

				registeredDomains.push(domainSettings);
				GM_setValue('RegisteredDomains', JSON.stringify(registeredDomains));

				let formElements = q('ul.sc-accountInformation li.form-element');
				for (let i = 0; i < formElements.length; i++) {
					ul.removeChild(formElements[i]);
				}

				GM_unregisterMenuCommand(menuCommand);
			}
		}
		function addRegFormElement(ul, li, newHtml) {
			let newLi = document.createElement('li');
				newLi.className = 'form-element';
				newLi.innerHTML = newHtml;
			ul.insertBefore(newLi, li);
		}
		function forgetDomain() {
			registeredDomains = JSON.parse(GM_getValue('RegisteredDomains', '[]'));
			let i = registeredDomains.findIndex(d => new RegExp(d.regex).test(location.host));
			if (i > -1 && confirm(`Are you sure you want forget this ${registeredDomains[i].friendly} domain?\n\n(matched: ${registeredDomains[i].regex})`)) {
				registeredDomains.splice(i, 1);
				GM_setValue('RegisteredDomains', JSON.stringify(registeredDomains));
				GM_unregisterMenuCommand(menuCommand);
				domainSettings = false;
			}
		}
	})();

	var headerInfo = new (function() {
		this.detectGlobalLogo = () => document.querySelector('#globalLogo, .sc-global-logo, .global-logo:not([style]), .logo-wrap img');
		this.repaint = function(globalLogo, envName, envColor) {
			let logoContainer = globalLogo.parentElement;
			let col = logoContainer.parentElement;
			// add number to envName
			let envNum = location.host.match(/\d+/);
			if (envNum) {
				envName += ' ' + envNum[0];
			}
			// add envName to document title before adding HTML
			if (document.title.indexOf(envName) == -1) {
				document.title = envName + ' ' + document.title;
			}
			// add html with img of forms-icon that exists since Sitecore 9
			envName = (isPage('/sitecore/login')
					? '8 '
					: isPage('/Account/Login')
					? '9 '
					: `<img src="/temp/iconcache/apps/48x48/forms.png?uniq=${Date.now()}" style="display: none" onerror="this.outerHTML=8" onload="this.outerHTML=9"> `)
				+ envName;
			// add language and set initial flag
			if (contentEditor || formsEditor) {
				envName = `${envName} (<span id="showLang"><i>loading...</i></span>)`;
			}
			// add currently active database and append next to logo
			let dbName = findDb();
			envName = dbName == '' ? envName : `${envName} [${dbName}] `;
			let span = document.createElement('span');
				span.innerHTML = envName;
				span.style.fontSize = '2em';
			logoContainer.appendChild(span);

			// prep closing x
			var a = document.createElement('a');
				a.setAttribute('href', ribbon ? window.parent.location.href.replace(/([?#].*)?$/, '?sc_mode=normal') : '/?sc_mode=normal');
				a.innerHTML = '&times;';
				a.style.position = 'absolute';
				a.style.right = '20px';
				a.style.color = '#fff';
				a.style.fontSize = '2em';
				a.style.textDecoration = 'none';

			if (!loginScreen) {
				globalLogo.style.float = 'left';
				globalLogo.style.marginTop = '8.5px';
				span.style.paddingLeft = '1em';
				col.style.maxHeight = '50px';

				let button1, button2;
				[button1, button2] = continueFeature.getButtons(dbName);
				if (button1) { logoContainer.appendChild(button1); }
				if (button2) { logoContainer.appendChild(button2); }

				if (ribbon) {
					col.style.position = 'relative';
					a.setAttribute('target', '_top');
					logoContainer.appendChild(a);
				} else {
					logoContainer.style.float = 'none';
					logoContainer.appendChild(quickAccess.getContainer());
					quickAccess.render();
				}
			} else {
				// different logic for the log-in screen
				col.style.position = 'relative';
				span.style.position = 'absolute';
				span.style.top = '10px';
				span.style.left = '20px';
				a.style.top = '10px';
				logoContainer.appendChild(a);
			}
			col.style.background = envColor;
			col.style.overflow = 'hidden';
			col.style.whiteSpace = 'nowrap';
			if (col.className == 'col-md-6') {
				col.className = 'col-xs-6';
				col.nextElementSibling.className = 'col-xs-6';
			}
		}
	})();

	var languageInfo = new (function() {
		this.init = function() {
			let rightCol = document.querySelector('.sc-globalHeader-loginInfo').parentElement;
				rightCol.style.height = '50px';
				rightCol.style.backgroundSize = '75px 100%';
				rightCol.style.backgroundRepeat = 'no-repeat';
				rightCol.style.imageRendering = 'pixelated';
			if (contentEditor) {
				let curLang = document.getElementById('scLanguage').value;
				document.getElementById('showLang').innerHTML = curLang;
				rightCol.style.backgroundImage = flags[curLang];
				// observe to update language and flag
				langHiddenObserver.observe(document.getElementById('scLanguage'), {attributes: true, childList: false, subtree: false});
			} else {
				// observe to update language and flag
				langHiddenObserver.observe(document.querySelector('div[data-sc-id=LanguageListControl] .sc-listcontrol-content'), {attributes:true, childList: false, subtree: true});
			}
		}
		let langHiddenObserver = new MutationObserver(updateShownLang);
		function updateShownLang(mutationList) {
			let curLang;
			if (contentEditor && mutationList.filter(ml => ml.attributeName == 'value').length) {
				curLang = document.getElementById('scLanguage').value;
			} else if (formsEditor && mutationList.filter(ml => ml.target.classList.contains('selected')).length) {
				curLang = langLabelMap[
					document.querySelector('div[data-sc-id=LanguageListControl] .selected')
						.innerText
						.trim()
						.split(/\W+/)[0]
						.toLowerCase()];
			} else {
				return;
			}

			document.getElementById('showLang').innerHTML = curLang;
			let rightCol = document.querySelector('.sc-globalHeader-loginInfo').parentElement;
				rightCol.style.backgroundImage = flags[curLang];
		}
	})();

	var continueFeature = new (function() {
		this.getButtons = function(dbName) {
			if (dbName == '' || exm) {
				return [false, false];
			}
			let switchTo1 = dbName == 'master' ? 'core' : 'master';
			let continueQuery = '';
			if (!desktop) {
				continueQuery = cleanHref(location.href.split(location.host)[1], true,
					'continueTo', 'expandTo', 'scrollTo', 'clickTo', 'langTo', 'guidTo');
				continueQuery = '&' + generateUrlQuery({ 'continueTo' : continueQuery });
			}
			let dbSwitch1 = document.createElement('a');
				dbSwitch1.setAttribute('href', `/sitecore/shell/default.aspx?sc_content=${switchTo1}${continueQuery}`);
				dbSwitch1.innerHTML = `${switchTo1}`;
				dbSwitch1.style.color = '#fff';
				dbSwitch1.style.fontStyle = 'italic';
				dbSwitch1.style.fontSize = '1.5em';
				dbSwitch1.style.marginRight = '.5em';
			if (contentEditor && switchTo1 != 'core' && dbName != 'core') {
				dbSwitch1.onclick = function() {
					setLinkHref(dbSwitch1);
				}
			}
			let switchTo2 = dbName == 'web' ? 'core' : 'web';
			let dbSwitch2 = document.createElement('a');
				dbSwitch2.setAttribute('href', `/sitecore/shell/default.aspx?sc_content=${switchTo2}${continueQuery}`);
				dbSwitch2.innerHTML = `${switchTo2} &rarr;`;
				dbSwitch2.style.color = '#fff';
				dbSwitch2.style.fontStyle = 'italic';
				dbSwitch2.style.fontSize = '1.5em';
			if (contentEditor && switchTo2 != 'core' && dbName != 'core') {
				dbSwitch2.onclick = function() {
					setLinkHref(dbSwitch2);
				}
			}
			return [dbSwitch1, dbSwitch2];
		}
		function setLinkHref(link) {
			let continueQuery = cleanHref(link.href, true,
				'expandTo', 'scrollTo', 'clickTo', 'langTo', 'guidTo');
			let ids = [];
			q('img[src*=treemenu_expanded][id]').forEach(i => ids.push(i.id));
			continueQuery += prepForQuery(continueQuery) + generateUrlQuery({
				'expandTo' : ids.join(','),
				'scrollTo' : document.getElementById('ContentTreeInnerPanel').scrollTop,
				'clickTo' : document.querySelector('a.scContentTreeNodeActive[id]').id,
				'langTo' : document.querySelector('#scLanguage').value
			});
			link.href = continueQuery;
		}
		function cleanHref(href, removeAnker, ...paramNames) {
			if (removeAnker) {
				href = href.replace(/#.*/, '');
			}
			for (let p = 0; p < paramNames.length; p++) {
				href = href.replace(new RegExp(`[?&]${paramNames[p]}=[^?&#]*`), '');
			}
			return href;
		}
		let expandItemIds = [];
		this.init = function () {
			if (desktop && search.continueTo) {
				// we arrived at the desktop to switch databases and continue where we were
				let continueTo = search.continueTo;
				if (search.expandTo) {
					// pass on all params needed to expand, scroll and click to the same position in the content editor
					continueTo = prepForQuery(continueTo) + generateUrlQuery({
						'expandTo' : search.expandTo,
						'scrollTo' : search.scrollTo,
						'clickTo' : search.clickTo,
						'langTo' : search.langTo
					});
				}
				// go to the page the user was using before switching database
				location.replace(continueTo);
				return false;
			}
			if (contentEditor) {
				if (search.expandTo) {
					// show spinner while expanding tree
					showSpinner();
					expandItemIds = search.expandTo
						.split(',')
						.map(id => `#${id}[src*=treemenu_collapsed]`);
					// start recursively expanding the content tree
					expandNext();
				}
				if (search.guidTo) {
					document.getElementById('TreeSearch').value = search.guidTo;
					if (search.langTo) {
						showSpinner();
						langMenuObserver.observe(document.getElementById('ContentEditor'), {attributes:false, childList: true, subtree: true});
					}
					document.querySelector('.scSearchButton').click();
				}
			}
			return true;
		}
		let treeObserver = new MutationObserver(expandNext);
		function expandNext(mutationList) {
			if (mutationList) {
				// If there is a mutationList (and thus this function triggered from the MutationObserver)
				// then check if there are mutationRecords that have expandable <img> nodes somewhere in
				// their tree by looking for src containing treemenu_collapsed, or clickable nodes by looking
				// for src containing noexpand. If not then there's nothing to click, wait for the next
				// MutationObserver come-around.
				if (!searchMutationListFor(mutationList, 'img[src*=treemenu_collapsed][id],img[src*=noexpand][id]')) {
					return;
				}
			}
			treeObserver.disconnect();
			if (expandItemIds.length == 0) {
				// no more items to expand, now scroll, click and hide the spinner
				let nodeToClick = document.querySelector(`a#${search.clickTo}.scContentTreeNodeNormal`);
				if (nodeToClick) {
					// click the node to open the item and wait till the item is opened
					langMenuObserver.observe(document.getElementById('ContentEditor'), {attributes:false, childList: true, subtree: true});
					nodeToClick.click();
				} else {
					// nothing to click, scroll and hide spinner
					document.getElementById('ContentTreeInnerPanel').scrollTop = search.scrollTo;
					hideSpinner();
				}
				return;
			}
			// take next item to click, if it doesn't exist skip, else observe its parent's children and click it.
			let itemId = expandItemIds.shift();
			let item = document.querySelector(itemId);
			if (!item) {
				expandNext();
				return;
			}
			treeObserver.observe(item.parentNode, {attributes:false, childList: true, subtree: true});
			item.click();
		}
		let langMenuObserver = new MutationObserver(openLanguageMenu);
		function openLanguageMenu(mutationList) {
			if (!searchMutationListFor(mutationList, '#EditorTabs .scEditorHeaderVersionsLanguage')) {
				return;
			}
			// item has opened enough to open Language Menu and scroll to scrollTo position
			langMenuObserver.disconnect();
			if (search.scrollTo) {
				document.getElementById('ContentTreeInnerPanel').scrollTop = search.scrollTo;
			}
			if (search.langTo != document.querySelector('#scLanguage').value) {
				// current language is different than previously selected language, click Language Menu and wait for it to load.
				let langLink = document.querySelector('.scEditorHeaderVersionsLanguage');
				langFrameObserver.observe(langLink, {attributes:false, childList: true, subtree: true});
				setTimeout(function() { langLink.click(); }, 500);
			} else {
				// nothing left to do, hide spinner
				hideSpinner();
			}
		}
		let langFrameObserver = new MutationObserver(clickLanguage);
		function clickLanguage(mutationList) {
			if (!searchMutationListFor(mutationList, '#Header_Language_Gallery')) {
				return;
			}
			// iframe was placed, when the iframe's document has loaded click the correct language and hide spinner
			langFrameObserver.disconnect();
			document.getElementById('Header_Language_Gallery').onload = function() {
				this.contentWindow.document.querySelector(`div.scMenuPanelItem[onclick*="language=${search.langTo}"]`).click();
				hideSpinner();
			}
		}
	})();

	var quickAccess = new (function() {
		let _this = this;
		this.getContainer = function () {
			let qaContainer = document.createElement('div');
				qaContainer.id = 'QuickAccess';
				qaContainer.style.float = 'right';
			return qaContainer;
		}
		this.render = function() {
			let qaBar = document.getElementById('QuickAccess');
			let qaItems = JSON.parse(GM_getValue('QuickAccessItems', '[]'));
			if (!qaBar || !qaItems) {
				return;
			}
			qaBar.innerHTML = '';
			for (let i = 0; i < qaItems.length; i++) {
				let qaItem = document.createElement('a');
					qaItem.setAttribute('href', qaItems[i].href);
					qaItem.setAttribute('title', qaItems[i].title);
					qaItem.innerHTML = `<img src="${qaItems[i].imgsrc}" height="32" style="vertical-align:middle">`;
					qaItem.style.float = 'right';
					qaItem.style.marginLeft = '10px';
				qaBar.appendChild(qaItem);
			}
		}
		this.initCheckboxes = function () {
			let items = q('.sc-launchpad-item');
			let qaItems = JSON.parse(GM_getValue('QuickAccessItems', '[]'));
			for (let i = 0; i < items.length; i++) {
				let item = items[i];
				item.style.position = 'relative';
				let chck = document.createElement('input');
					chck.setAttribute('type', 'checkbox');
					chck.checked = qaItems.findIndex(qi => qi.href == item.getAttribute('href')) != -1;
					chck.style.position = 'absolute';
					chck.style.left = '0';
					chck.style.top = '-4px';
					chck.onclick = setItemAsQuickAccess;
				item.appendChild(chck);
			}
		}
		function setItemAsQuickAccess() {
			let item = {
				'href' : this.parentNode.getAttribute('href'),
				'imgsrc' : this.parentNode.querySelector('img').getAttribute('src'),
				'title' : this.parentNode.getAttribute('title')
			};
			let qaItems = JSON.parse(GM_getValue('QuickAccessItems', '[]'));
			let qaIndex = qaItems.findIndex(qi => qi.href == item.href);
			if (this.checked) {
				if (qaIndex == -1) {
					qaItems.push(item);
				}
			} else {
				if (qaIndex != -1) {
					qaItems.splice(qaIndex, 1);
				}
			}
			GM_setValue('QuickAccessItems', JSON.stringify(qaItems));
			_this.render();
		}
	})();

	var contentTreeTweaks = new (function() {
		let wasScrolledToBottom = false;
		this.init = function() {
			// Add scroll-to-active-item button
			let scrollLink = document.createElement('a');
				scrollLink.innerHTML = '&leftrightarrows;';
				scrollLink.style.fontSize = '1.5em';
				scrollLink.style.marginLeft = '-1em';
				scrollLink.style.cursor = 'pointer';
				scrollLink.onclick = scrollToActive;
			let newCel = document.querySelector('#SearchPanel tr').insertCell(2);
				newCel.appendChild(scrollLink);
			// Add stay-at-bottom event listener
			document.getElementById('ContentTreeInnerPanel').onscroll = function() {
				const nowScrolledToBottom = this.scrollHeight - this.clientHeight <= this.scrollTop + 10;

				if (nowScrolledToBottom && !wasScrolledToBottom) {
					wasScrolledToBottom = nowScrolledToBottom;
					scrollObserver.observe(this, {attributes:false, childList: true, subtree: true})
				} else if (!nowScrolledToBottom && wasScrolledToBottom) {
					wasScrolledToBottom = nowScrolledToBottom;
					scrollObserver.disconnect();
				}
			}
			searchObserver.observe(document.getElementById('SearchResultHolder'), {attributes:true, childList: false, subtree: false});
		}
		let scrollObserver = new MutationObserver(scrollToBottom);
		let maxScroll;
		function scrollToBottom(mutationList) {
			let spinner = searchMutationListFor(mutationList, 'img[src*=sc-spinner]');
			if (spinner && spinner[0].offsetTop > 0) {
				maxScroll = spinner[0].offsetTop;
			}
			if (!searchMutationListFor(mutationList, 'img[src*=treemenu_collapsed][id],img[src*=noexpand][id]')) {
				return;
			}
			setTimeout(function() {
				let tree = document.getElementById('ContentTreeInnerPanel');
				tree.scrollTop = Math.min(maxScroll, tree.scrollHeight - tree.clientHeight);
			}, 200);
		}
		let searchObserver = new MutationObserver(hideSearchResults);
		function hideSearchResults(mutationList) {
			if (!mutationList.filter(ml => ml.attributeName == 'style').length) {
				return;
			}
			if (document.getElementById('SearchResultHolder').style.display != 'none'
				&& document.querySelectorAll('#SearchResult .scSearchLink').length == 1) {
				searchScrollObserver.observe(document.getElementById('ContentTreeActualSize'), {attributes:false, childList: true, subtree: true});
				document.querySelector('#SearchHeader .scElementHover').click();
			}
		}
		let searchScrollObserver = new MutationObserver(scrollToResult);
		function scrollToResult(mutationList) {
			if (!searchMutationListFor(mutationList, 'a.scContentTreeNodeActive[id]')) {
				return;
			}
			searchScrollObserver.disconnect();
			scrollToActive();
		}
		function scrollToActive() {
			let activeNode = document.querySelector('a.scContentTreeNodeActive[id]');
			if (activeNode) {
				document.getElementById('ContentTreeInnerPanel').scrollTop = Math.max(0, activeNode.offsetTop - document.getElementById('ContentTreeInnerPanel').offsetHeight/2);
			}
		}
	})();

	var formsContentEditorLinks = new (function() {
		let lastResponse = [];
		this.init = function() {
			// listen in on every XHR to see if it returns details we need for the Content Editor link
			(function(open) {
				XMLHttpRequest.prototype.open = function() {
					this.addEventListener("readystatechange", function() {
						if (this.readyState != 4
							|| (!designingForm && (this.responseURL.indexOf('/sitecore/api/ssc/forms/formdesign/formdesign/details?formId=') == -1 || !hasJsonStructure(this.responseText)))
							|| (designingForm && this.responseURL.indexOf('/sitecore/api/ssc/forms/formdesign/formdesign/save?sc_formmode=new') == -1)) {
							return;
						}
						let response = JSON.parse(this.responseText);
						if (!designingForm && response.length == 0) {
							lastResponse = [{
								formId: decodeURIComponent(this.responseURL.split(/\?|&/).filter(q => q.indexOf('formId=') > -1)[0].split('=')[1]),
								id: '',
								name: '_unfindable',
								path: '_unfindable'
							}];
							return;
						}
						if (designingForm) {
							addFormPencil(response, decodeURIComponent(this.responseURL.split(/\?|&/).filter(q => q.indexOf('sc_formlang=') > -1)[0].split('=')[1]));
							return;
						}
						// this is the information we need, keep it in a global variable that openInContentEditor() reads
						lastResponse = response;
					}, false);
					open.apply(this, arguments);
				};
			})(XMLHttpRequest.prototype.open);
			let contextPane = document.querySelector('aside.sc-flx-context-pane');
			if (contextPane) {
				formDetailObserver.observe(contextPane, {attributes:false, childList: true, subtree: true});
			}
			if (designingForm && search.formId) {
				addFormPencil(search.formId, search.lang);
			}
		}
		let formDetailObserver = new MutationObserver(openInContentEditor);
		function openInContentEditor(mutationList) {
			if (!lastResponse.length) {
				return;
			}
			for (let i = 0; i < lastResponse.length; i++) {
				formDetailObserver.disconnect();
				let query = {};
				let langLabel = document.querySelector('.sc-listcontrol-icon.selected .sc-listcontrol-icon-description-row2');
				if (langLabel) {
					query['langTo'] = langLabel.innerText;
				}
				if (i == 0) {
					query['guidTo'] = lastResponse[i].formId;
					let pathSpan = q('[data-sc-id="LocationValue"]')[0];
					let pathParent = pathSpan.parentNode;
					let oldLink = document.getElementById('formIdLink');
					if (oldLink) {
						pathParent.removeChild(oldLink);
					} else {
						pathParent.style.position = 'relative';
					}
					var a = document.createElement('a');
						a.id = 'formIdLink';
						a.innerHTML = '<img src="/temp/iconcache/apps/16x16/pencil.png" />';
						a.setAttribute('href', `/sitecore/shell/Applications/Content%20Editor.aspx?sc_bw=1&${generateUrlQuery(query)}`);
						a.onclick = function(e) { e.stopPropagation(); };
						a.setAttribute('title', `Open [${pathSpan.innerText.trim()}/${q('.sc-listcontrol-icon.selected .sc-listcontrol-icon-description a')[0].title}] in the Content Editor`);
						a.style.position = 'absolute';
						a.style.left = '-1em';
					pathParent.prepend(a);
				}
				let par = searchMutationListFor(mutationList, 'p[title="'+lastResponse[i].name+' '+lastResponse[i].path+'"]');
				if (!par) {
					continue;
				}
				query['guidTo'] = lastResponse[i].id;
				a = a.cloneNode(true);
					a.setAttribute('href', `/sitecore/shell/Applications/Content%20Editor.aspx?sc_bw=1&${generateUrlQuery(query)}`);
					a.setAttribute('title', `Open [${lastResponse[i].path}] in the Content Editor`);
					a.style.left = '';
					a.style.right = '6em';
				par[0].appendChild(a);
			}
			formDetailObserver.observe(document.querySelector('div[data-sc-id=LinksListControl] .sc-listcontrol-content'), {attributes:false, childList: true, subtree: true});
		}
		function addFormPencil(guid, lang) {
			let a = document.createElement('a');
				a.innerHTML = '<img src="/temp/iconcache/apps/32x32/pencil.png" />';
				a.setAttribute('href', `/sitecore/shell/Applications/Content%20Editor.aspx?sc_bw=1&${generateUrlQuery({
					'guidTo' : guid,
					'langTo' : lang
				})}`);
				a.setAttribute('title', 'Open this form as item in the Content Editor');
			q('.sc-applicationHeader-title')[0].appendChild(a);
		}
	})();

	init();

	// Helper functions
	function searchMutationListFor(mutationList, query) {
		if (!mutationList.length) {
			return false;
		}
		let foundNodes = [];
		let addNodes = function(addedNode) {
			if (addedNode.matches(query)) {
				foundNodes.push(addedNode);
			}
			foundNodes = foundNodes.concat(toArr(addedNode.querySelectorAll(query)));
		}
		for (let m = 0; m < mutationList.length; m++) {
			if (!mutationList[m].addedNodes.length) continue;
			toArr(mutationList[m].addedNodes)
				.filter(nod => nod.nodeType == 1)
				.forEach(addNodes);
		}
		if (!foundNodes.length) {
			return false;
		}
		return foundNodes;
	}
	function hasJsonStructure(str) {
		if (typeof str !== 'string') return false;
		try {
			const result = JSON.parse(str);
			const type = Object.prototype.toString.call(result);
			return type === '[object Object]'
			|| type === '[object Array]';
		} catch (err) {
			return false;
		}
	}
	function isPage(url) {
		return location.pathname.match(new RegExp(url.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'));
	}
	function q(query) {
		return toArr(document.querySelectorAll(query));
	}
	function toArr(nodeList) {
		return Array.from(nodeList);
	}
	function prepForQuery(inp) {
		return inp + (inp.indexOf('?') > -1 ? '&' : '?');
	}
	function getSearch() {
		let returnVal = {};
		top.location.search
			.split(/\?|&/)
			.slice(1)
			.forEach(s => returnVal[s.split('=')[0]] = decodeURIComponent(s.split('=')[1]));
		return returnVal;
	}
	function setLinkHref(link) {
		let continueQuery = link.href.replace(/#.*/, '');
		let ids = [];
		q('img[src*=treemenu_expanded][id]').forEach(i => ids.push(i.id));
		continueQuery += prepForQuery(continueQuery) + generateUrlQuery({
			'expandTo' : ids.join(','),
			'scrollTo' : document.getElementById('ContentTreeInnerPanel').scrollTop,
			'clickTo' : document.querySelector('a.scContentTreeNodeActive[id]').id,
			'langTo' : document.querySelector('#scLanguage').value
		});
		link.href = continueQuery;
	}
	function generateUrlQuery(obj) {
		let retArray = [];
		for (let prop in obj) {
			retArray.push(`${prop}=${encodeURIComponent(obj[prop])}`);
		}
		return retArray.join('&');
	}
	function findDb() {
		if (exm) {
			return 'master';
		}

		let dbNameDiv = document.querySelector('#DatabaseName, #DatabaseSelector, .scDatabaseName');
		if (dbNameDiv != null && dbNameDiv.innerText.trim() != '') {
			return dbNameDiv.innerText.trim();
		}
		let locMatch = location.search.match(/database=(\w+)/);
		if (ribbon && locMatch != null) {
			return locMatch[1];
		}
		let meta = document.querySelector('meta[data-sc-name=sitecoreContentDatabase]');
		if (meta != null) {
			return meta.getAttribute('data-sc-content');
		}
		let curEl = document.getElementById('__CurrentItem');
		let match = curEl == null ? null : curEl.value.match(/sitecore:\/\/(\w+)/);
		if (match != null) {
			return match[1];
		}
		let iframe = document.querySelector('iframe[src*="db="]');
		let regexMatch = iframe == null ? null : iframe.src.match(/db=(\w+)/);
		if (regexMatch) {
			return regexMatch[1];
		}
		return '';
	}
	function showSpinner() {
		globalLogo.style.backgroundImage = 'url(/sitecore/shell/themes/standard/images/sc-spinner32.gif)';
	}
	function hideSpinner() {
		globalLogo.style.backgroundImage = '';
	}
})();