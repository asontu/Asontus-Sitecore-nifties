// ==UserScript==
// @name         Asontu's Sitecore nifties
// @namespace    https://asontu.github.io/
// @version      7.4
// @description  Add environment info to Sitecore header, extend functionality
// @author       Herman Scheele
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @updateURL    https://github.com/asontu/Asontus-Sitecore-nifties/raw/master/sitecore-nifties.user.js
// @downloadURL  https://github.com/asontu/Asontus-Sitecore-nifties/raw/master/sitecore-nifties.user.js
// ==/UserScript==
(function() {
	'use strict';
	// Constants and globals
	var sc10 = false;
	const exm91 = isPage('/sitecore/client/Applications/ECM/Pages');
	const exm93 = !exm91 && isPage('/sitecore/shell/client/Applications/ECM');
	const exm = exm91 || exm93;
	const ribbon = isPage('ribbon.aspx');
	const desktop = isPage('/sitecore/shell/default.aspx');
	const launchPad = isPage('/sitecore/client/applications/launchpad');
	const formsEditor = isPage('/sitecore/client/Applications/FormsBuilder/');
	const designingForm = isPage('/sitecore/client/Applications/FormsBuilder/Pages/FormDesigner');
	const loginScreen = isPage('/sitecore/login') || isPage('/Account/Login');
	const contentEditor = isPage('/sitecore/shell/Applications/Content%20Editor.aspx');
	const marketingAutomation = isPage('/sitecore/shell/client/Applications/MarketingAutomation');
	var search = getSearch();
	var globalSettings = {};
	var globalLogo;

	function init() {
		niftySettings.init(globalSettings, headerInfo.repaint);
		
		if (isPage('/sitecore/shell/default.aspx') && location.search === '?xmlcontrol=CustomizeRibbon') {
			customRibbonExchange.init();
		}
		globalLogo = headerInfo.detectGlobalLogo();
		if (!globalLogo) {
			// we're inside some non-Ribbon iframe we don't care about, exit
			return;
		}

		sc10 = !!getComputedStyle(globalLogo).getPropertyValue('background-image').match(/logo\.svg"\)$/);
		let sc10domains = GM_getJson('sc10domains');
		if (sc10 && sc10domains.indexOf(location.host) === -1) {
			sc10domains.push(location.host);
			GM_setJson('sc10domains', sc10domains);
		}
		if (!sc10 && sc10domains.indexOf(location.host) !== -1) {
			sc10 = true;
		}

		if (contentEditor) {
			contentTreeTweaks.init();
		}
		if (!continueFeature.init()) {
			return;
		}
		if (launchPad) {
			quickAccess.initCheckboxes();
		}
		let envName, envColor, envAlpha;
		[envName, envColor, envAlpha] = recognizedDomain.init(headerInfo.setHeaderColor);
		if (globalSettings['niftyHeader']) {
			headerInfo.repaint(globalLogo, envName, envColor, envAlpha, continueFeature.getButtons);
		}
		if (globalSettings['niftyHeader'] && (contentEditor || formsEditor || exm)) {
			languageInfo.init();
		}
		if (globalSettings['niftyHeader'] && (exm93 || marketingAutomation)) {
			var headerObserver = new MutationObserver(function() {
				headerObserver.disconnect();

				globalLogo = headerInfo.detectGlobalLogo();
				if (globalLogo) {
					headerInfo.repaint(globalLogo, envName, envColor, envAlpha, continueFeature.getButtons);
                    languageInfo.init();
				}

				headerObserver.observe(exmPanel, {attributes:false, childList: true, subtree: true});
			});

			var exmPanel = document.querySelector('div.progress-indicator-panel');
			var maPanel = document.querySelector('ma-campaign-task-page');

			if (exmPanel) {
				headerObserver.observe(exmPanel, {attributes:false, childList: true, subtree: true});
			} else if (maPanel) {
				headerObserver.observe(maPanel, {attributes:false, childList: true, subtree: false});
			}
		}
		if (formsEditor) {
			formsContentEditorLinks.init();
		}
	}

	var recognizedDomain = new (function() {
		let registeredDomains = GM_getJson('RegisteredDomains');
		let domainSettings = false;
		let menuCommand = null;
		let colorsFn = null;
		this.init = function(headerColorsFn) {
			colorsFn = headerColorsFn;
			let domIndex = registeredDomains.findIndex(d => new RegExp(d.regex).test(location.host));
			if (domIndex > -1) {
				domainSettings = registeredDomains[domIndex];
			}
			if (!domainSettings) {
				if (!loginScreen) {
					menuCommand = GM_registerMenuCommand("Register domain with user-script", showRegForm, "r");
				}
				return ['', '', ''];
			} else {
				menuCommand = GM_registerMenuCommand("Forget this domain", forgetDomain, "f");
				GM_registerMenuCommand("Adjust settings for this domain", showRegForm, "a");
				return [domainSettings.friendly, domainSettings.color, domainSettings.alpha || '.5'];
			}
		}
		function showRegForm() {
			let ul = document.querySelector('ul.sc-accountInformation');
			if (!ul) { return; }
			let li = ul.querySelector('li');

			let prefilled = domainSettings || {
				regex : `^${regEsc(location.host)}$`,
				friendly : '',
				color : '#2b2b2b',
				alpha : '.5'
			};

			addRegFormElement(ul, li,
				`<input type="text" id="domainRegex" placeholder="Domain regex" value="${prefilled.regex}"
						title="The regex to recognize this domain/environment"
						style="display: inline-block;max-width: 80%; line-height: initial; color: #000;">`);
			addRegFormElement(ul, li,
				`<input type="text" id="domainTitle" placeholder="Friendly name" value="${prefilled.friendly}"
						title="Friendly name for this domain, will be placed in header and title"
						style="display: inline-block;width: 80%; line-height: initial; color: #000;">`);
			addRegFormElement(ul, li,
				`<input type="color" id="domainColor"
						title="Color to give the header on this domain" value="${prefilled.color}">`);
			addRegFormElement(ul, li,
				`<input type="range" id="domainAlpha" min="0" max="1" step=".1" value="${prefilled.alpha}"
						title="Transparency for the header color"
						style="width: 100px;transform: rotate(-90deg) translate(-40px);display: inline-block;margin: 0 -45px;">`);
			addRegFormElement(ul, li, `<button type="button" style="line-height: initial; color: #000;" value="save">Save</button>`);
			addRegFormElement(ul, li, `<button type="button" style="line-height: initial; color: #000;" value="cancel">Cancel</button>`);

			ul.querySelector('#domainColor').oninput = function() {
				colorsFn(this.value, ul.querySelector('#domainAlpha').value);
			}

			ul.querySelector('#domainAlpha').oninput = function() {
				colorsFn(ul.querySelector('#domainColor').value, this.value);
			}

			ul.querySelector('button[value="save"]').onclick = function() {
				if (domainSettings) {
					domainSettings.regex = ul.querySelector('#domainRegex').value,
					domainSettings.friendly = ul.querySelector('#domainTitle').value,
					domainSettings.color = ul.querySelector('#domainColor').value,
					domainSettings.alpha = ul.querySelector('#domainAlpha').value
				} else {
					domainSettings = {
						regex : ul.querySelector('#domainRegex').value,
						friendly : ul.querySelector('#domainTitle').value,
						color : ul.querySelector('#domainColor').value,
						alpha : ul.querySelector('#domainAlpha').value
					};

					registeredDomains.push(domainSettings);
					GM_unregisterMenuCommand(menuCommand);
				}

				GM_setJson('RegisteredDomains', registeredDomains);

				delRegForm(ul);
			}
			
			ul.querySelector('button[value="cancel"]').onclick = function() {
				delRegForm(ul);
			}
		}
		function delRegForm(ul) {
			let formElements = q('ul.sc-accountInformation li.form-element');
			for (let i = 0; i < formElements.length; i++) {
				ul.removeChild(formElements[i]);
			}
		}
		function addRegFormElement(ul, li, newHtml) {
			let newLi = document.createElement('li');
				newLi.className = 'form-element';
				newLi.innerHTML = newHtml;
			ul.insertBefore(newLi, li);
		}
		function forgetDomain() {
			registeredDomains = GM_getJson('RegisteredDomains');
			let i = registeredDomains.findIndex(d => new RegExp(d.regex).test(location.host));
			if (i > -1 && confirm(`Are you sure you want forget this ${registeredDomains[i].friendly} domain?\n\n(matched: ${registeredDomains[i].regex})`)) {
				registeredDomains.splice(i, 1);
				GM_setJson('RegisteredDomains', registeredDomains);
				GM_unregisterMenuCommand(menuCommand);
				domainSettings = false;
			}
		}
	})();

	var headerInfo = new (function() {
		var _this = this;
		var headerCol;
		this.detectGlobalLogo = () => document.querySelector('#globalLogo, .sc-global-logo, .global-logo:not([style]), .logo-wrap img');
		this.repaint = function(globalLogo, envName, envColor, envAlpha, buttonsFn) {
			let logoContainer = globalLogo.parentElement;
			if (sc10 && launchPad) {
				document.querySelector('.sc-applicationHeader-title').style.display = 'none';
			}
			if (logoContainer.classList.contains('mat-toolbar-row')) {
				headerCol = logoContainer;
				headerCol.parentElement.style.background = 'rgba(0,0,0,.87)';
			} else {
				headerCol = logoContainer.parentElement;
			}
			// add envName to document title before adding HTML
			if (document.title.indexOf(envName) !== 0) {
				document.title = envName + ' ' + document.title;
			}
			// add language
			if (contentEditor || formsEditor || exm) {
				envName = `${envName} (<span id="showLang"><i>loading...</i></span>)`;
			}
			// add currently active database and append next to logo
			let dbName = findDb();
			envName = dbName === '' ? envName : `${envName} [<span id="db-name">${dbName}</span>] `;
			let span = document.createElement('span');
				span.innerHTML = envName;
				span.style.fontSize = '24px';
				span.style.textTransform = 'initial';
			logoContainer.appendChild(span);

			// prep closing x
			var a = document.createElement('a');
				a.setAttribute('href', ribbon ? window.parent.location.href.replace(/([?#].*)?$/, '?sc_mode=normal') : '/?sc_mode=normal');
				a.innerHTML = '&times;';
				a.style.position = 'absolute';
				a.style.right = '20px';
				a.style.color = '#fff';
				a.style.fontSize = '24px';
				a.style.textDecoration = 'none';

			if (!loginScreen) {
				globalLogo.style.float = 'left';
				if (!exm93 && !(sc10 && launchPad)) {
					globalLogo.style.marginTop = '8.5px';
				}
				span.style.paddingLeft = '1rem';
				headerCol.style.maxHeight = sc10 && launchPad ? '40px' : '50px';

				let button0, button1, button2;
				[button0, button1, button2] = buttonsFn(dbName);
				if (button1) { logoContainer.appendChild(button1); }
				if (button2) { logoContainer.appendChild(button2); }
				if (button0) {
					span.querySelector('#db-name').innerHTML = '';
					span.querySelector('#db-name').appendChild(button0);
				}

				if (ribbon) {
					headerCol.style.position = 'relative';
					a.setAttribute('target', '_top');
					logoContainer.appendChild(a);
				} else {
					logoContainer.style.float = 'none';
					logoContainer.appendChild(quickAccess.getContainer());
					quickAccess.render();
				}
			} else {
				// different logic for the log-in screen
				headerCol.style.position = 'relative';
				span.style.position = 'absolute';
				span.style.top = '10px';
				span.style.left = '20px';
				a.style.top = '10px';
				logoContainer.appendChild(a);
			}
			if (envColor) {
				_this.setHeaderColor(envColor, envAlpha);
			}
			headerCol.style.overflow = 'hidden';
			headerCol.style.whiteSpace = 'nowrap';
			if (headerCol.className === 'col-md-6') {
				headerCol.className = 'col-xs-6';
				headerCol.nextElementSibling.className = 'col-xs-6';
			}
		}
		this.setHeaderColor = function(hex, alpha) {
			if (!headerCol) {
				_this.detectGlobalLogo();
			}
			headerCol.style.background = `rgba(${hex2rgb(hex).join(',')}, ${alpha})`;
		}
	})();

	var languageInfo = new (function() {
		const langLabelMap = {
			'simplified, prc' : 'zh-CN',
			'netherlands' : 'nl-NL',
			'english' : 'en',
			'germany' : 'de-DE',
			'brazil' : 'pt-BR',
			'russia' : 'ru-RU',
			'danish' : 'da',
			'japan' : 'ja-JP',
			'spain' : 'es-ES',
			'all' : 'All'
		};
		const flags = {
			'de-DE' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAIAAADdv/LVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAASSURBVBhXYwCBtzIqDP/PMAAADHgC+WifnsQAAAAASUVORK5CYII=)',
			'ja-JP' : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='600'%3E%3Cpath fill='%23fff' d='M0 0h900v600H0z'/%3E%3Ccircle fill='%23bc002d' cx='450' cy='300' r='180'/%3E%3C/svg%3E")`,
			'nl-NL' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAIAAADdv/LVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY1gro8Hw//9/BkW3bgAdYwThATJlswAAAABJRU5ErkJggg==)',
			'pt-BR' : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' version='1.0' width='1060' height='742' viewBox='-2100 -1470 1060 742'%3E%3Cpath fill='%23009b3a' fill-rule='evenodd' d='M-2100-1470h1060v742h-1060z'/%3E%3CclipPath id='a'%3E%3Ccircle r='735'/%3E%3C/clipPath%3E%3Cg transform='translate(-1570 -1099) scale(.25238)'%3E%3Cpath d='M-1743 0L0 1113 1743 0 0-1113z' fill='%23fedf00'/%3E%3Ccircle r='735' fill='%23002776'/%3E%3Cpath clip-path='url(%23a)' d='M-2205 1470a1785 1785 0 013570 0h-105a1680 1680 0 10-3360 0z' fill='%23fff'/%3E%3C/g%3E%3C/svg%3E")`,
			'ru-RU' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAIAAADdv/LVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY/j//z8Dg9EChluaMgAlNgTvjzhAAgAAAABJRU5ErkJggg==)',
			'es-ES' : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAECAIAAADAusJtAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAVSURBVBhXYzjGLcfw/wgDGB/jlgMALn4FZVcP3I0AAAAASUVORK5CYII=)',
			'zh-CN' : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='900' height='600' viewBox='0 0 30 20'%3E%3Cdefs%3E%3Cpath id='a' d='M0-1L.59.8-.95-.3h1.9L-.59.8z' fill='%23FF0'/%3E%3C/defs%3E%3Cpath fill='%23EE1C25' d='M0 0h30v20H0z'/%3E%3Cuse xlink:href='%23a' transform='matrix(3 0 0 3 5 5)'/%3E%3Cuse xlink:href='%23a' transform='rotate(23.04 .1 25.54)'/%3E%3Cuse xlink:href='%23a' transform='rotate(45.87 1.27 16.18)'/%3E%3Cuse xlink:href='%23a' transform='rotate(69.95 1 12.08)'/%3E%3Cuse xlink:href='%23a' transform='rotate(20.66 -19.69 31.93)'/%3E%3C/svg%3E")`,
			'da'    : 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAHCAIAAABV+fA3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAeSURBVBhXYzjOogtB////h7MhiGw5oBAuQH37WHQBOdFbVOTGyEYAAAAASUVORK5CYII=)',
			'en'    : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='15'%3E%3Cpath fill='%23FFF' d='M.03 14.98H26V.01H.03z'/%3E%3Cpath fill='%2300247D' d='M15.16 0v4.57L23.06 0zM2.92 15h7.9v-4.55zm12.24 0h7.9l-7.9-4.55zM2.92 0l7.9 4.57V0zm17.33 5H26V1.7zm.03 4.98l5.72 3.3v-3.3zM0 9.98v3.3l5.72-3.3zM0 5h5.72L0 1.7z'/%3E%3Cpath fill='%23CF142B' d='M11.71 0v6H.04V9h11.69V15h2.6V9.01H26V6H14.31V0z'/%3E%3Cpath fill='%23CF142B' d='M24.02 0l-8.63 5h1.97l8.61-5zM8.62 9.99L0 14.97h1.97l8.6-5zm8.73 0l8.65 5V13.9l-6.73-3.92zM0 0v1.09L6.73 5h1.92z'/%3E%3C/svg%3E")`,
			'All'   : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='600'%3E%3Cpath fill='%2300c' d='M1000 0H0v600h1000z'/%3E%3Cg transform='matrix(-.9174 .3977 .3977 .9174 663.16 -566.61)' fill='none' stroke='%23fff' stroke-width='20' stroke-linecap='round'%3E%3Cpath d='M494.44 920.22V540.39M684.44 730.3a190 109.7 0 01-95 95 190 109.7 0 01-190 0 190 109.7 0 01-95-95'/%3E%3Cpath d='M-793.35-575.2a109.67 189.95 0 01109.67 189.96A109.67 189.95 0 01-793.35-195.3' transform='rotate(-150)'/%3E%3Cpath d='M399.46 565.8a189.95 109.67 60 01189.95 109.67 189.95 109.67 60 010 219.34'/%3E%3Ccircle transform='rotate(-45)' cx='-166.78' cy='866.02' r='190'/%3E%3Cpath d='M304.44 730.3a190 155.13 0 01190-155.13 190 155.13 0 01190 155.13'/%3E%3Cpath d='M571.5 557.67a134.35 76.83 0 0151.07 86.04 134.35 76.83 0 01-128.13 53.73 134.35 76.83 0 01-128.14-53.73 134.35 76.83 0 0151.08-86.04M604.49 884.07a134.35 76.83 0 01-110.05 32.76 134.35 76.83 0 01-110.06-32.76'/%3E%3C/g%3E%3C/svg%3E")`
		};
		const headerFlagHolder = '.sc-globalHeader-loginInfo, .gh-account';
		const exm91Button = 'div[data-sc-id=LanguageSwitcher] button .sc-dropdownbutton-text';
		const exm93Button = 'exm-language-switcher > sc-dropdown > button';
		this.init = function() {
			let rightCol = document.querySelector(headerFlagHolder).parentElement;
				rightCol.style.height = '50px';
				rightCol.style.backgroundSize = '80px 100%';
				rightCol.style.backgroundRepeat = 'no-repeat';
				rightCol.style.imageRendering = 'crisp-edges'; // Gecko
				rightCol.style.imageRendering = 'pixelated';   // WebKit/Chromium
			if (contentEditor) {
				let curLang = document.querySelector('#scLanguage').value;
				document.querySelector('#showLang').innerHTML = curLang;
				rightCol.style.backgroundImage = flags[curLang];
				// observe to update language and flag
				langHiddenObserver.observe(document.querySelector('#scLanguage'), {attributes: true, childList: false, subtree: false});
			} else if (formsEditor) {
				// observe to update language and flag
				langHiddenObserver.observe(document.querySelector('div[data-sc-id=LanguageListControl] .sc-listcontrol-content'), {attributes: true, childList: false, subtree: true});
			} else if (exm91 && document.querySelector(exm91Button)) {
				if (document.querySelector(exm91Button).innerText.trim() !== '') {
					updateLang([]);
				}
				langHiddenObserver.observe(document.querySelector(exm91Button), {characterData: true, childList: true, subtree: true});
			} else if (exm93 && document.querySelector(exm93Button)) {
				rightCol.style.backgroundPositionX = '50%';
				if (document.querySelector(exm93Button).innerText.trim() !== '') {
					updateLang([]);
				}
				langHiddenObserver.observe(document.querySelector(exm93Button).parentElement, {characterData: true, childList: true, subtree: true});
			} else if (exm) {
				document.querySelector('#showLang').innerHTML = 'N/A';
			}
		}
		let langHiddenObserver = new MutationObserver(updateLang);
		function updateLang(mutationList) {
			let curLang;
			if (contentEditor && mutationList.filter(ml => ml.attributeName === 'value').length) {
				curLang = document.querySelector('#scLanguage').value;
			} else if (formsEditor && mutationList.filter(ml => ml.target.classList.contains('selected')).length) {
				curLang = getLangFrom('div[data-sc-id=LanguageListControl] .selected');
			} else if (exm91) {
				curLang = getLangFrom(exm91Button);
			} else if (exm93) {
				curLang = getLangFrom(exm93Button);
			} else {
				return;
			}

			document.querySelector('#showLang').innerHTML = curLang;
			let rightCol = document.querySelector(headerFlagHolder).parentElement;
				rightCol.style.backgroundImage = flags[curLang];
		}
		function getLangFrom(query) {
			return langLabelMap[
				document.querySelector(query)
					.innerText
					.trim()
					.match(/^(\S+).*?(?:\(([^)]+)|[^(]*$)/)
					.filter(m => m !== undefined)
					.pop()
					.toLowerCase()];
		}
	})();

	var continueFeature = new (function() {
		let rootFolder = '11111111111111111111111111111111';
		// This is the ID for the content-folder in Sitecore 8, 9 and 10 for both the Master and Core DB
		let contentFolder = '0DE95AE441AB4D019EB067441B7C2450';
		this.getButtons = function(dbName) {
			if (dbName === '' || exm) {
				return [false, false, false];
			}
			let currentHref = '';
			let continueQuery = '';
			if (!desktop) {
				currentHref = cleanHref(location.href.split(location.host)[1], true,
					'continueTo', 'ribbonTo', 'expandTo', 'scrollTreeTo', 'scrollPanelTo', 'clickTo', 'langTo', 'guidTo');
				continueQuery = '&' + generateUrlQuery({ 'continueTo' : currentHref });
			}
			let dbSwitch0 = document.createElement('a');
				dbSwitch0.setAttribute('href', currentHref);
				dbSwitch0.innerHTML = dbName;
				dbSwitch0.style.color = '#fff';
			let switchTo1 = dbName === 'master' ? 'core' : 'master';
			let dbSwitch1 = document.createElement('a');
				dbSwitch1.setAttribute('href', `/sitecore/shell/default.aspx?sc_content=${switchTo1}${continueQuery}`);
				dbSwitch1.innerHTML = `${switchTo1}`;
				dbSwitch1.style.color = '#fff';
				dbSwitch1.style.fontStyle = 'italic';
				dbSwitch1.style.fontSize = '18px';
				dbSwitch1.style.marginRight = '.5em';
			let switchTo2 = dbName === 'web' ? 'core' : 'web';
			let dbSwitch2 = document.createElement('a');
				dbSwitch2.setAttribute('href', `/sitecore/shell/default.aspx?sc_content=${switchTo2}${continueQuery}`);
				dbSwitch2.innerHTML = `${switchTo2} &rarr;`;
				dbSwitch2.style.color = '#fff';
				dbSwitch2.style.fontStyle = 'italic';
				dbSwitch2.style.fontSize = '18px';
			if (contentEditor) {
				dbSwitch0.onmouseover = dbSwitch0.onfocus = function() { setLinkHref(this, false); }
				dbSwitch1.onmouseover = dbSwitch1.onfocus = function() { setLinkHref(this, [switchTo1, dbName].indexOf('core') !== -1); }
				dbSwitch2.onmouseover = dbSwitch2.onfocus = function() { setLinkHref(this, [switchTo2, dbName].indexOf('core') !== -1); }
			}
			return [dbSwitch0, dbSwitch1, dbSwitch2];
		}
		function setLinkHref(dbSwitch, onlyRibbon) {
			let continueQuery = cleanHref(dbSwitch.href, true,
				'ribbonTo', 'expandTo', 'scrollTreeTo', 'scrollPanelTo', 'clickTo', 'langTo', 'guidTo');
			let qParams = {
				'ribbonTo' : document.querySelector('.scRibbonNavigatorButtonsContextualActive, .scRibbonNavigatorButtonsActive').id.split('Nav_')[1]
			};
			if (!onlyRibbon) {
				qParams.expandTo = q(`img[src*=treemenu_expanded][id]:not([id$='${rootFolder}']):not([id$='${contentFolder}'])`)
					.map(i => i.id.replace('Tree_Glyph_', ''))
					.join('!');
				qParams.scrollTreeTo = document.querySelector('#ContentTreeInnerPanel').scrollTop;
				qParams.scrollPanelTo = document.querySelector('.scEditorPanel').scrollTop;
				let toClick = document.querySelector('a.scContentTreeNodeActive[id]');
				if (toClick) {
					qParams.clickTo = toClick.id.replace('Tree_Node_', '');
				} else {
					let regexMatch = document.querySelector('#__CurrentItem').value.match(/\{[^\}]+\}/);
					let guid = !regexMatch ? null : regexMatch[0].replace(/[{}-]/g, '');
					if (guid !== null) {
						qParams.clickTo = guid;
					}
				}
				qParams.langTo = document.querySelector('#scLanguage').value;
			}
			dbSwitch.href = prepForQuery(continueQuery) + generateUrlQuery(qParams);
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
		this.init = function() {
			if (desktop && search.continueTo) {
				// we arrived at the desktop to switch databases and continue where we were
				let continueTo = search.continueTo;
				if (search.ribbonTo) {
					let qParams = {
						'ribbonTo' : search.ribbonTo
					};
					if (search.expandTo) {
						qParams.expandTo = search.expandTo;
						qParams.scrollTreeTo = search.scrollTreeTo;
						qParams.scrollPanelTo = search.scrollPanelTo;
						qParams.clickTo = search.clickTo;
						qParams.langTo = search.langTo;
					}
					// pass on all params needed to expand, scroll and click to the same position in the content editor
					continueTo = prepForQuery(continueTo) + generateUrlQuery(qParams);
				}
				// go to the page the user was using before switching database
				location.replace(continueTo);
				return false;
			}
			if (contentEditor) {
				if (search.expandTo) {
					// show spinner while expanding tree
					showSpinner();
					[rootFolder, contentFolder]
						.concat(search.expandTo.split('!'))
						.map(itemGuid => `#Tree_Glyph_${itemGuid}[src*=treemenu_collapsed]`)
						.map(itemSelector => () => expandTreeNode(itemSelector))
						.reduce((prom, fn) => prom.then(fn), Promise.resolve())
						.then(() => clickTreeNode(search.clickTo))
						.then((nodes) => openLangMenu(search.langTo, !!nodes.length))
						.then((nodes) => clickLang(search.langTo, !!nodes.length))
						.then(() => scrollTree(search.scrollTreeTo))
						.then(() => scrollPanel(search.scrollPanelTo))
						.then(() => clickRibbon(search.ribbonTo))
						.then(() => hideSpinner());
				} else if (search.ribbonTo) {
					clickRibbon(search.ribbonTo);
				}
				if (search.guidTo) {
					showSpinner();
					openGuid(search.guidTo)
						.then(() => openLangMenu(search.langTo, !!search.langTo))
						.then((nodes) => clickLang(search.langTo, !!nodes.length))
						.then(() => hideSpinner());
				}
			}
			return true;
		}

		function expandTreeNode(itemSelector) {
			let item = document.querySelector(itemSelector);
			if (!item) {
				return new Promise((resolve, reject) => resolve());
			}
			return mop(function() {
				item.click();
			},
			item.parentNode,
			'img[src*=treemenu_collapsed][id],img[src*=noexpand][id]',
			{attributes:false, childList: true, subtree: true});
		}

		function clickTreeNode(itemId) {
			return mop(function() {
				let nodeToClick = document.querySelector(`a#Tree_Node_${itemId}.scContentTreeNodeNormal`);
				if (!nodeToClick) {
					document.querySelector('#TreeSearch').value = itemId;
					return true;
				}
				nodeToClick.click();
			},
			document.querySelector('#ContentEditor'),
			'#EditorTabs .scEditorHeaderVersionsLanguage',
			{attributes:false, childList: true, subtree: true});
		}

		function openLangMenu(langTo, doAct) {
			let langLink = document.querySelector('.scEditorHeaderVersionsLanguage');
			return mop(function() {
				if (!doAct || langTo === document.querySelector('#scLanguage').value) {
					return true;
				}
				setTimeout(function() { langLink.click(); }, 500);
			},
			langLink,
			'#Header_Language_Gallery',
			{attributes:false, childList: true, subtree: true});
		}

		function clickLang(langTo, doAct) {
			return mop(function() {
				if (!doAct) {
					return true;
				}
				document.querySelector('#Header_Language_Gallery').onload = function() {
					this.contentWindow.document.querySelector(`div.scMenuPanelItem[onclick*="language=${langTo}"]`).click();
				}
			},
			document.querySelector('#EditorFrames'),
			'.scEditorPanel',
			{attributes:false, childList: true, subtree: true});
		}

		function scrollTree(scrollTreeTo) {
			if (scrollTreeTo > 0) {
				document.querySelector('#ContentTreeInnerPanel').scrollTop = scrollTreeTo;
			}
		}

		function scrollPanel(scrollPanelTo) {
			if (scrollPanelTo > 0) {
				document.querySelector('.scEditorPanel').scrollTop = scrollPanelTo;
			}
		}

		function clickRibbon(ribbonTo) {
			return new Promise((resolve, reject) => {
				let ribbon = document.querySelector(`[id$=${ribbonTo}]`);
				if (!ribbonTo || !ribbon) {
					resolve();
					return;
				}
				new MutationObserver((mutationList, observer) => {
					if (mutationList.filter(ml => ml.attributeName === 'class').length) {
						observer.disconnect();
						resolve();
					}
				}).observe(ribbon, {attributes: true, childList: false, subtree: false});
				ribbon.click();
				setTimeout(function() { ribbon.click() }, 100);
			});
		}

		function openGuid(guidTo) {
			return mop(function() {
				document.querySelector('#TreeSearch').value = search.guidTo;
				document.querySelector('.scSearchButton').click();
			},
			document.querySelector('#ContentEditor'),
			'#EditorTabs .scEditorHeaderVersionsLanguage',
			{attributes:false, childList: true, subtree: true});
		}
	})();

	var quickAccess = new (function() {
		let _this = this;
		this.getContainer = function() {
			let qaContainer = document.createElement('div');
				qaContainer.id = 'QuickAccess';
				qaContainer.style.float = 'right';
				qaContainer.style.imageRendering = 'auto'; // Gecko
				qaContainer.style.imageRendering = '-webkit-optimize-contrast';   // WebKit/Chromium
			return qaContainer;
		}
		this.render = function() {
			let qaBar = document.querySelector('#QuickAccess');
			let qaItems = GM_getJson('QuickAccessItems');
			if (!qaBar || !qaItems) {
				return;
			}
			qaBar.innerHTML = '';
			for (let i = 0; i < qaItems.length; i++) {
				let imgSrc = sc10 ? qaItems[i].sc10imgsrc : qaItems[i].imgsrc;
				let onErrorSrc = imgSrc.indexOf('/-/') === 0
					? imgSrc.substring(2)
					: `/-${imgSrc}`;
				let qaItem = document.createElement('a');
					qaItem.setAttribute('href', qaItems[i].href);
					qaItem.setAttribute('title', qaItems[i].title);
					qaItem.innerHTML = `<img src="${imgSrc}" onerror="this.src='${onErrorSrc}';this.onerror=null;" height="32" style="vertical-align:middle">`;
					qaItem.style.float = 'right';
					qaItem.style.marginLeft = '10px';
				if (sc10 && imgSrc.indexOf('launchpadicons') > -1) {
					qaItem.style.filter = 'invert(1) saturate(30) grayscale(1)';
				}
				qaBar.appendChild(qaItem);
			}
		}
		let checkboxes = [];
		let repositionTimeout;
		this.initCheckboxes = function() {
			let items = q('.sc-launchpad-item');
			let qaItems = GM_getJson('QuickAccessItems');
			if (sc10) {
				document.querySelector('div[data-sc-id="ColumnPanel1"]').style.position = 'initial';
			}
			for (let i = 0; i < items.length; i++) {
				let item = items[i];
				if (!sc10) {
					item.parentNode.style.position = 'relative';
				}
				let chck = document.createElement('input');
					chck.setAttribute('type', 'checkbox');
					chck.setAttribute('title', `Add ${item.getAttribute('title')} button to Quick Access in header`);
					chck.checked = qaItems.findIndex(qi => qi.href === item.getAttribute('href')) !== -1;
					chck.style.position = 'absolute';
					chck.style.zIndex = '1';
					chck.style.top = '12px';
					chck.onclick = setItemAsQuickAccess;
				item.parentNode.insertBefore(chck, item);
				checkboxes.push(chck);
			}

			if (sc10) {
				repositionCheckboxes();
				window.addEventListener('resize', function() {
					clearTimeout(repositionTimeout);
					repositionTimeout = setTimeout(repositionCheckboxes, 500);
				});
				copyMissingSrc(qaItems, 'imgsrc', 'sc10imgsrc');
			} else {
				copyMissingSrc(qaItems, 'sc10imgsrc', 'imgsrc');
			}
		}
		function repositionCheckboxes() {
			for (let i = 0; i < checkboxes.length; i++) {
				let rects = checkboxes[i].nextElementSibling.getClientRects()[0];
				checkboxes[i].style.top = (rects.y + window.scrollY - 3) + 'px';
				checkboxes[i].style.left = (rects.x + window.scrollX + 1) + 'px';
			}
		}
		function copyMissingSrc(qaItems, from, to) {
			let missingSrc = qaItems.filter(it => it[to] === undefined);
			for (let i = 0; i < missingSrc.length; i++) {
				let otherSrc = nullConditional(document,
					d => d.querySelector(`a[href="${missingSrc[i]['href']}"] img`),
					i => i.getAttribute('src'),
					s => missingSrc[i][to] = s);
			}
			GM_setJson('QuickAccessItems', qaItems);
		}
		function setItemAsQuickAccess() {
			let item = {
				'href' : this.nextElementSibling.getAttribute('href'),
				'title' : this.nextElementSibling.getAttribute('title')
			};
			if (sc10) {
				item['sc10imgsrc'] = this.nextElementSibling.querySelector('img').getAttribute('src');
			} else {
				item['imgsrc'] = this.nextElementSibling.querySelector('img').getAttribute('src');
			}
			let qaItems = GM_getJson('QuickAccessItems');
			let qaIndex = qaItems.findIndex(qi => qi.href === item.href);
			if (this.checked && qaIndex === -1) {
				qaItems.push(item);
			}
			if (!this.checked && qaIndex !== -1) {
				qaItems.splice(qaIndex, 1);
			}
			GM_setJson('QuickAccessItems', qaItems);
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
				scrollLink.style.marginLeft = '-.5em';
				scrollLink.style.marginRight = '-.5em';
				scrollLink.style.cursor = 'pointer';
				scrollLink.onclick = scrollToActive;
			let newCel = document.querySelector('#SearchPanel tr').insertCell(2);
				newCel.appendChild(scrollLink);
			// Add stay-at-bottom event listener
			document.querySelector('#ContentTreeInnerPanel').onscroll = function() {
				const nowScrolledToBottom = this.scrollHeight - this.clientHeight <= this.scrollTop + 10;

				if (nowScrolledToBottom && !wasScrolledToBottom) {
					wasScrolledToBottom = nowScrolledToBottom;
					scrollObserver.observe(this, {attributes: false, childList: true, subtree: true})
				} else if (!nowScrolledToBottom && wasScrolledToBottom) {
					wasScrolledToBottom = nowScrolledToBottom;
					scrollObserver.disconnect();
				}
			}
			searchObserver.observe(document.querySelector('#SearchResultHolder'), {attributes: true, childList: false, subtree: false});
			quickInfoObserver.observe(document.querySelector('#EditorFrames'), {attributes: false, childList: true, subtree: false});
			addDeepLinks([]);
		}
		let maxScroll;
		let scrollObserver = new MutationObserver(function(mutationList) {
			let spinner = searchMutationListFor(mutationList, 'img[src*=sc-spinner]');
			if (spinner && spinner[0].offsetTop > 0) {
				maxScroll = spinner[0].offsetTop;
			}
			if (!searchMutationListFor(mutationList, 'img[src*=treemenu_collapsed][id],img[src*=noexpand][id]')) {
				return;
			}
			setTimeout(function() {
				let tree = document.querySelector('#ContentTreeInnerPanel');
				let scrollTo = Math.min(maxScroll, tree.scrollHeight - tree.clientHeight);
				if (scrollTo > tree.scrollTop) {
					tree.scrollTop = scrollTo;
				}
			}, 200);
		});
		let searchObserver = new MutationObserver(function(mutationList) {
			if (!mutationList.filter(ml => ml.attributeName === 'style').length) {
				return;
			}
			if (document.querySelector('#SearchResultHolder').style.display !== 'none'
				&& document.querySelectorAll('#SearchResult .scSearchLink').length === 1) {
				searchScrollObserver.observe(document.querySelector('#ContentTreeActualSize'), {attributes: false, childList: true, subtree: true});
				document.querySelector('#SearchHeader .scElementHover').click();
			}
		});
		let searchScrollObserver = new MutationObserver(function(mutationList) {
			if (!searchMutationListFor(mutationList, 'a.scContentTreeNodeActive[id]')) {
				return;
			}
			searchScrollObserver.disconnect();
			scrollToActive();
		});
		function scrollToActive() {
			let activeNode = document.querySelector('a.scContentTreeNodeActive[id]');
			if (activeNode) {
				document.querySelector('#ContentTreeInnerPanel').scrollTop = Math.max(0, activeNode.offsetTop - document.querySelector('#ContentTreeInnerPanel').offsetHeight/2);
			}
		}
		let quickInfoObserver = new MutationObserver(addDeepLinks);
		function addDeepLinks(mutationList) {
			let nameCell = document.querySelector('.scEditorHeaderTitlePanel');
			let curItem = encodeURIComponent(document.querySelector('.scEditorHeaderQuickInfoInput').value);
			let curLang = document.querySelector('#scLanguage').value;
			let dbBrowserLink = document.createElement('a');
				dbBrowserLink.setAttribute('href', `/sitecore/admin/dbbrowser.aspx?db=${findDb()}&lang=${curLang}&id=${curItem}`);
				dbBrowserLink.innerHTML = '(Open in DB Browser &UpperRightArrow;)';
				dbBrowserLink.style.fontStyle = 'italic';
			let helpTitle = document.querySelector('.scEditorHeaderTitleHelp');
			if (helpTitle) {
				nameCell.insertBefore(dbBrowserLink, helpTitle);
			} else {
				nameCell.appendChild(dbBrowserLink);
			}
			let templateId = document.querySelector('.scEditorHeaderQuickInfoInputID').value;
			if (templateId === '{6ABEE1F2-4AB4-47F0-AD8B-BDB36F37F64C}') { // Form
				let formsLink = document.createElement('a');
					formsLink.setAttribute('href', `/sitecore/client/Applications/FormsBuilder/Pages/FormDesigner?sc_formmode=edit&formId=${curItem}&lang=${curLang}`);
					formsLink.innerHTML = '(Edit in Sitecore Forms &UpperRightArrow;)';
					formsLink.style.fontStyle = 'italic';
					formsLink.style.marginLeft = '15px';
				if (helpTitle) {
					nameCell.insertBefore(formsLink, helpTitle);
				} else {
					nameCell.appendChild(formsLink);
				}
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
						if (this.readyState !== 4
							|| (!designingForm && (this.responseURL.indexOf('/sitecore/api/ssc/forms/formdesign/formdesign/details?formId=') === -1 || !hasJsonStructure(this.responseText)))
							|| (designingForm && this.responseURL.indexOf('/sitecore/api/ssc/forms/formdesign/formdesign/save?sc_formmode=new') === -1)) {
							return;
						}
						let response = JSON.parse(this.responseText);
						if (!designingForm && response.length === 0) {
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
			if (designingForm) {
				if (search.formId) {
					addFormPencil(search.formId, search.lang);
				}
				addApplyButton();
			}
		}
		let formDetailObserver = new MutationObserver(function(mutationList) {
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
				if (i === 0) {
					query['guidTo'] = lastResponse[i].formId;
					let pathSpan = q('[data-sc-id="LocationValue"]')[0];
					let pathParent = pathSpan.parentNode;
					let oldLink = document.querySelector('#formIdLink');
					if (oldLink) {
						pathParent.removeChild(oldLink);
					} else {
						pathParent.style.position = 'relative';
					}
					let formPath = pathSpan.innerText.trim();
					let formName = q('.sc-listcontrol-icon.selected .sc-listcontrol-icon-description a')[0].title;
					var a = document.createElement('a');
						a.id = 'formIdLink';
						a.innerHTML = '<img src="/temp/iconcache/apps/16x16/pencil.png" />';
						a.setAttribute('href', `/sitecore/shell/Applications/Content%20Editor.aspx?sc_bw=1&${generateUrlQuery(query)}`);
						a.onclick = function(e) { e.stopPropagation(); };
						a.setAttribute('title', `Open [${formPath}/${formName}] in the Content Editor`);
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
		});
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
		var applyButton;
		var saveUponDisable = false;
		let propsBarObserver = new MutationObserver(function() {
			applyButton.disabled = document.querySelector('[data-sc-id=ContextForPropertyGrid]').style.display === 'none';
			if (saveUponDisable) {
				document.querySelector('[data-sc-id=SaveButton]').click();
				saveUponDisable = false;
			}
		});
		function addApplyButton() {
			let saveButton = document.querySelector('[data-sc-id=SaveButton]');
			applyButton = saveButton.cloneNode(true);
			applyButton.querySelector('span').innerText = 'Apply and Save';
			applyButton.querySelector('span').removeAttribute('data-bind');
			applyButton.setAttribute('data-sc-id', 'NiftyApplyButton');
			applyButton.removeAttribute('data-sc-presenter');
			applyButton.removeAttribute('data-sc-component');
			applyButton.removeAttribute('data-sc-properties');
			applyButton.removeAttribute('data-sc-require');
			applyButton.removeAttribute('data-bind');
			applyButton.style.marginLeft = '15px';
			applyButton.disabled = true;
			applyButton.onclick = function() {
				saveUponDisable = true;
				document.querySelector('[data-sc-id=PropertyGridApplyChangesButton]').click();
			}
			applyButton.removeChild(applyButton.querySelector('div'));
			saveButton.parentNode.appendChild(applyButton);
			propsBarObserver.observe(document.querySelector('[data-sc-id=ContextForPropertyGrid]'), {attributes:true, childList: false, subtree: false});
		}
	})();

	var customRibbonExchange = new (function() {
		var customizeGuid = '{D33A0641-9F1C-4984-8342-0655C3D0F123}';
		this.init = function() {
			let applyButton = document.createElement('button');
				applyButton.className = 'scButton';
				applyButton.type = 'button';
				applyButton.innerText = 'Apply';
			let buttonHolder = document.querySelector('.footerOkCancel');
			buttonHolder.insertBefore(applyButton, buttonHolder.firstElementChild);

			let ribbonInput = document.createElement('input');
				ribbonInput.style.display = 'inline-block';
				ribbonInput.style.width = 'calc(100vw - 300px)';
				ribbonInput.style.marginRight = '1em';
			buttonHolder.insertBefore(ribbonInput, applyButton);

			ribbonInput.onfocus = function() {
				this.value = getCurrentRibbon().join('|');
				this.select();
			}
			applyButton.onclick = function() {
				let expandPromises = q('#TreeList_all > div > div > img[src*=treemenu_collapsed], #TreeList_all > div > div > img[src*=spinner]')
					.map(img => () => expandItem(img));
				let addPromises = ribbonInput.value
					.split('|')
					.filter(guid => guid !== customizeGuid)
					.map(guid => () => addItem(guid));

				getCurrentRibbon()
					.filter(guid => guid !== customizeGuid)
					.map(guid => () => removeItem(guid))
					.concat(expandPromises)
					.concat(addPromises)
					.reduce((prom, fn) => prom.then(fn), Promise.resolve());
			}
		}

		function getCurrentRibbon() {
			return q('#TreeList_selected option').map(o => o.value.substring(o.value.indexOf('|')+1));
		}

		function expandItem(img) {
			return new Promise((resolve, reject) => {
				new MutationObserver((mutationList, observer) => {
					if (!mutationList.filter(ml => ml.attributeName === 'src').length) {
						return;
					}
					if (!mutationList.pop().target.src.match(/treemenu_expanded\.png/)) {
						return;
					}
					setTimeout(resolve, 10);
					observer.disconnect();
				}).observe(img, { attributes: true });
				img.click();
			});
		}

		var dblClickEvent = document.createEvent('MouseEvents');
		dblClickEvent.initMouseEvent('dblclick', true, true);
		function addItem(decoratedGuid) {
			return mop(function() {
				let bareGuid = decoratedGuid.replace(/[^A-F0-9]/g, '');
				document.querySelector(`#TreeList_all_${bareGuid} a`).click();
				document.querySelector(`#TreeList_all_${bareGuid} a`).dispatchEvent(dblClickEvent);
			},
			document.querySelector(`#TreeList_selected`).parentElement);
		}

		function removeItem(decoratedGuid) {
			return mop(function() {
				let select = document.querySelector(`#TreeList_selected`);
				select.selectedIndex = select.querySelector(`option[value$="${decoratedGuid}"]`).index;
				select.dispatchEvent(dblClickEvent);
			},
			document.querySelector(`#TreeList_selected`));
		}
	})();

	var niftySettings = new (function() {
		var redrawFunc;
		var settingsObj;
		this.init = function(settings, redraw) {
			settingsObj = settings;
			redrawFunc = redraw;
			
			getSettings(settingsObj);
			
			GM_registerMenuCommand("Show/hide Sitecore header info", toggleStealth, "s");
		}

		function toggleStealth() {
			setSetting('niftyHeader', !settingsObj['niftyHeader']);
			//redrawFunc();
		}

		function setSetting(key, value) {
			let settings = GM_getJson('NiftySettings');
			let i = settings.findIndex(s => s.key === key);
			if (i < 0) {
				settings.push({ 'key': key, 'value': value });
			} else {
				settings[i].value = value;
			}
			GM_setJson('NiftySettings', settings);
			settingsObj[key] = value;
		}

		function getSettings(obj) {
			GM_getJson('NiftySettings').reduce((obj, setting) => obj[setting.key] = setting.value, obj);
			
			setDefault(obj, 'niftyHeader', true);
		}
		
		function setDefault(obj, key, def) {
			if (!obj.hasOwnProperty(key)) {
				obj[key] = def;
			}
		}
	})();

	init();

	// Helper functions
	function GM_getJson(key) {
		return JSON.parse(GM_getValue(key, '[]'));
	}
	function GM_setJson(key, value) {
		GM_setValue(key, JSON.stringify(value));
	}
	function mop(trigger, watch, query, options, timeout) {
		return new Promise((resolve, reject) => {
			let timer;
			let observer = new MutationObserver((mutationList) => {
				let any = searchMutationListFor(mutationList, query || '*');
				if (query && !any) {
					return;
				}
				observer.disconnect();
				clearTimeout(timer);
				resolve(any);
			});
			observer.observe(watch, options || {attributes:false, childList: true, subtree: false});
			if (timeout) {
				timer = setTimeout(() => {
					observer.disconnect();
					reject(new Error('Timed out observing mutation'));
				}, timeout);
			}
			if (trigger()) {
				observer.disconnect();
				clearTimeout(timer);
				resolve([]);
			}
		});
	}
	function searchMutationListFor(mutationList, query) {
		if (!mutationList.length) {
			return false;
		}
		let foundNodes = [];
		function findNodes(addedNode) {
			if (addedNode.matches(query)) {
				foundNodes.push(addedNode);
			}
			foundNodes = foundNodes.concat(Array.from(addedNode.querySelectorAll(query)));
		}
		for (let m = 0; m < mutationList.length; m++) {
			if (!mutationList[m].addedNodes.length) continue;
			Array.from(mutationList[m].addedNodes)
				.filter(nod => nod.nodeType === 1)
				.forEach(findNodes);
		}
		if (!foundNodes.length) {
			return false;
		}
		return foundNodes;
	}
	function nullConditional(start, ...fns) {
		return fns.reduce((p, fn) => p === null ? null : fn(p), start);
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
	function hex2rgb(hex) {
		let f = (hex.length - 1) / 6;
		return ['0x' + hex[1 * f + .9 | 0] + hex[2 * f + .9 | 0] | 0,
				'0x' + hex[3 * f + .9 | 0] + hex[4 * f + .9 | 0] | 0,
				'0x' + hex[5 * f + .9 | 0] + hex[6 * f + .9 | 0] | 0];
	}
	function regEsc(str) {
		return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	}
	function isPage(url) {
		return location.pathname.match(new RegExp(regEsc(url), 'i'));
	}
	function q(query) {
		return Array.from(document.querySelectorAll(query));
	}
	function prepForQuery(inp) {
		return inp + (inp.indexOf('?') > -1 ? '&' : '?');
	}
	function generateUrlQuery(obj) {
		let retArray = [];
		for (let prop in obj) {
			retArray.push(`${prop}=${encodeURIComponent(obj[prop])}`);
		}
		return retArray.join('&');
	}
	function getSearch() {
		let returnVal = {};
		top.location.search
			.split(/\?|&/)
			.slice(1)
			.forEach(s => returnVal[s.split('=')[0]] = decodeURIComponent(s.split('=')[1]));
		return returnVal;
	}
	function findDb() {
		if (exm) {
			return 'master';
		}

		let dbNameDiv = document.querySelector('#DatabaseName, #DatabaseSelector, .scDatabaseName');
		if (dbNameDiv !== null && dbNameDiv.innerText.trim() !== '') {
			return dbNameDiv.innerText.trim();
		}
		let locMatch = location.search.match(/database=(\w+)/);
		if (ribbon && locMatch !== null) {
			return locMatch[1];
		}
		let meta = document.querySelector('meta[data-sc-name=sitecoreContentDatabase]');
		if (meta !== null) {
			return meta.getAttribute('data-sc-content');
		}
		let curEl = document.querySelector('#__CurrentItem');
		let match = curEl === null ? null : curEl.value.match(/sitecore:\/\/(\w+)/);
		if (match !== null) {
			return match[1];
		}
		let iframe = document.querySelector('iframe[src*="db="]');
		let regexMatch = iframe === null ? null : iframe.src.match(/db=(\w+)/);
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