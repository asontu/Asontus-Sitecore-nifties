// ==UserScript==
// @name         Asontu's Sitecore nifties
// @namespace    https://asontu.github.io/
// @version      8.3
// @description  Add environment info to Sitecore header, extend functionality
// @author       Herman Scheele
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @updateURL    https://github.com/asontu/Asontus-Sitecore-nifties/raw/master/sitecore-nifties.user.js
// @downloadURL  https://github.com/asontu/Asontus-Sitecore-nifties/raw/master/sitecore-nifties.user.js
// ==/UserScript==
(function() {
	'use strict';
	// Constants and globals
	var scVersion = 0.0;
	const exm91 = isPage('/sitecore/client/Applications/ECM/Pages');
	const exm93 = !exm91 && isPage('/sitecore/shell/client/Applications/ECM');
	const exm = exm91 || exm93;
	const ribbon = isPage('ribbon.aspx');
	const adminDash = isPage('/sitecore/admin');
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
	var envColor;
	var envAlpha;

	function init() {
		if (loginScreen) {
			initFeatures();
			return;
		}

		let storedVersion = parseFloat(sessionStorage.getItem('__niftyScVersion') || '0.0');

		if (storedVersion > 0.0) {
			scVersion = storedVersion;
			initFeatures();
			initVersionSpecifics();
			return;
		}

		if (adminDash) {
			initFeatures();
			return;
		}

		GM_getDocument('/sitecore/shell/applications/about')
			.then((doc) => getSitecoreVersion(doc))
			.then(() => initVersionSpecifics())
			.catch((err) => console.error(err));

		initFeatures();
	}

	function getSitecoreVersion(doc) {
		scVersion = nullConditional(doc,
			d => d.querySelector('#VersionInfo .sc_about_font'),
			q => q.firstChild,
			f => f.textContent,
			t => t.match(/Sitecore(?:\.NET)?\s+(\d+\.\d+)/),
			m => m[1],
			g => parseFloat(g)) || scVersion;
		sessionStorage.setItem('__niftyScVersion', scVersion);
	}

	function initFeatures() {
		niftySettings.init(globalSettings, headerInfo.repaint);

		if (isPage('/sitecore/shell/default.aspx') && location.search === '?xmlcontrol=CustomizeRibbon') {
			customRibbonExchange.init();
		}

		globalLogo = headerInfo.detectGlobalLogo();
		if (!globalLogo) {
			// we're inside some non-Ribbon iframe we don't care about, exit
			return;
		}

		let styleSheets = recognizedDomain.styleSheet +
			headerInfo.styleSheet +
			quickAccess.styleSheet +
			niftySettings.styleSheet;

		var styleTag = document.createElement('style');

		styleTag.type = 'text/css';
		if (styleTag.styleSheet) {
			styleTag.styleSheet.cssText = styleSheets;
		} else {
			styleTag.appendChild(document.createTextNode(styleSheets));
		}

		(document.head || document.getElementsByTagName('head')[0]).appendChild(styleTag);

		if (contentEditor) {
			contentTreeTweaks.init();
		}
		if (!continueFeature.init()) {
			return;
		}
		if (launchPad) {
			if (globalSettings['addAdminTile']) {
				quickAccess.initExtraTiles();
			}
		}
		if (adminDash) {
			adminEnrichment.init();
		}
		let envName;
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
					quickAccess.render(scVersion >= 10.1);
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

	function initVersionSpecifics() {
		globalLogo = headerInfo.detectGlobalLogo();
		if (!globalLogo) {
			// we're inside some non-Ribbon iframe we don't care about, exit
			return;
		}
		headerInfo.versionSpecifics(globalLogo, envColor, envAlpha);
		if (launchPad) {
			quickAccess.initCheckboxes(scVersion >= 10.1);
		}
		quickAccess.render(scVersion >= 10.1);
	}

	var recognizedDomain = new (function() {
		let registeredDomains = GM_getJson('RegisteredDomains');
		let domainSettings = false;
		let menuCommandRegister = null;
		let menuCommandAdjust = null;
		let menuCommandForget = null;
		let colorsFn = null;
		this.init = function(headerColorsFn) {
			colorsFn = headerColorsFn;
			let domIndex = registeredDomains.findIndex(d => new RegExp(d.regex).test(location.host));
			if (domIndex > -1) {
				domainSettings = registeredDomains[domIndex];
			}
			if (!domainSettings) {
				if (!loginScreen) {
					registerMenuCommands(false);
				}
				return ['', '', ''];
			} else {
				registerMenuCommands(true);
				return [domainSettings.friendly, domainSettings.color, domainSettings.alpha || '.5'];
			}
		}
		this.styleSheet = `
		#domainRegex {
			display: inline-block;
			max-width: 80%;
			line-height: initial;
			color: #000;
		}
		#domainTitle {
			display: inline-block;
			width: 80%;
			line-height: initial;
			color: #000;
		}
		#domainAlpha {
			width: 100px;
			transform: rotate(-90deg) translate(-40px);
			display: inline-block;
			margin: 0 -45px;
		}
		`;
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
						title="The regex to recognize this domain/environment">`);
			addRegFormElement(ul, li,
				`<input type="text" id="domainTitle" placeholder="Friendly name" value="${prefilled.friendly}"
						title="Friendly name for this domain, will be placed in header and title">`);
			addRegFormElement(ul, li,
				`<input type="color" id="domainColor"
						title="Color to give the header on this domain" value="${prefilled.color}">`);
			addRegFormElement(ul, li,
				`<input type="range" id="domainAlpha" min="0" max="1" step=".1" value="${prefilled.alpha}"
						title="Transparency for the header color">`);
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
					domainSettings.regex = ul.querySelector('#domainRegex').value;
					domainSettings.friendly = ul.querySelector('#domainTitle').value;
					domainSettings.color = ul.querySelector('#domainColor').value;
					domainSettings.alpha = ul.querySelector('#domainAlpha').value;
				} else {
					domainSettings = {
						regex : ul.querySelector('#domainRegex').value,
						friendly : ul.querySelector('#domainTitle').value,
						color : ul.querySelector('#domainColor').value,
						alpha : ul.querySelector('#domainAlpha').value
					};

					registeredDomains.push(domainSettings);
					registerMenuCommands(true);
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
				domainSettings = false;
				registerMenuCommands(false);
			}
		}
		function registerMenuCommands(currentlyRegistered) {
			if (currentlyRegistered) {
				nullConditional(menuCommandRegister, GM_unregisterMenuCommand);
				menuCommandForget = GM_registerMenuCommand("Forget this domain", forgetDomain, "f");
				menuCommandAdjust = GM_registerMenuCommand("Adjust settings for this domain", showRegForm, "d");
			} else {
				nullConditional(menuCommandForget, GM_unregisterMenuCommand);
				nullConditional(menuCommandAdjust, GM_unregisterMenuCommand);
				menuCommandRegister = GM_registerMenuCommand("Register domain with user-script", showRegForm, "r");
			}
		}
	})();

	var headerInfo = new (function() {
		var _this = this;
		var headerCol;
		this.detectGlobalLogo = () => document.querySelector('#globalLogo, .sc-global-logo, [scgloballogo], .global-logo:not([style]), .logo-wrap img');
		this.repaint = function(globalLogo, envName, envColor, envAlpha, buttonsFn) {
			if (document.querySelector('#NiftyHeaderInfo') !== null) {
				return;
			}
			let logoContainer = globalLogo.parentElement;
			if (logoContainer.classList.contains('mat-toolbar-row')) {
				headerCol = logoContainer;
				headerCol.parentElement.style.background = 'rgba(0,0,0,.87)';
			} else {
				headerCol = logoContainer.parentElement;
			}
			headerCol.classList.add('niftyHeaderInfo');
			if (window.getComputedStyle(logoContainer).getPropertyValue('width') === '32px') {
				logoContainer = logoContainer.parentElement;
				logoContainer.style.lineHeight = '40px';
			} else if (!ribbon) {
				logoContainer.style.float = 'none';
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
				span.id = 'NiftyHeaderInfo';
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
				span.style.paddingLeft = '1rem';

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
					logoContainer.appendChild(quickAccess.getContainer());
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
			if (headerCol.classList.contains('col-md-6')) {
				headerCol.classList.replace('col-md-6', 'col-xs-6');
				headerCol.nextElementSibling.classList.replace('col-md-6', 'col-xs-6');
			}
		}
		this.versionSpecifics = function(globalLogo, envColor, envAlpha) {
			const sc10Launchpad = scVersion >= 10.1 && launchPad;
			headerCol.style.maxHeight = sc10Launchpad && scVersion < 10.4 ? '40px' : '50px';
			if (sc10Launchpad) {
				document.querySelector('.sc-applicationHeader-title').style.display = 'none';
				document.querySelector('.sc-applicationContent-main').style.minHeight = `calc(100vh - ${headerCol.style.maxHeight})`;
			}
			if (!exm93 && !sc10Launchpad && !marketingAutomation) {
				globalLogo.style.marginTop = '8.5px';
			}
			if (envColor) {
				_this.setHeaderColor(envColor, envAlpha);
			} else if (scVersion >= 10.4) {
				headerCol.style.color = '#000';
				headerCol.querySelectorAll('a').forEach(a => a.style.color = '#000');
			}
		}
		this.setHeaderColor = function(hex, alpha) {
			if (!headerCol) {
				_this.detectGlobalLogo();
			}
			
			const backgroundChannels = hex2rgb(hex);
			const contrastingColor = getContrastingColor(backgroundChannels, alpha);
			if (scVersion >= 10.4 && launchPad) {
				headerCol.style.background = `linear-gradient(#2b2b2b, #2b2b2b), rgba(${backgroundChannels.join(',')}, ${alpha})`;
				headerCol.style.backgroundBlendMode = 'overlay';
			} else {
				headerCol.style.background = `rgba(${backgroundChannels.join(',')}, ${alpha})`;
			}
			headerCol.style.color = contrastingColor;
			headerCol.querySelectorAll('a').forEach(a => a.style.color = contrastingColor);
			setTimeout(() => headerCol.style.transition = 'background 0.5s, color 0.5s', 0);
		}
		function getContrastingColor(colorChannels, alphaChannel) {
			const blended = colorChannels.map(colorChannel => Math.round(alphaChannel * colorChannel + (1 - alphaChannel) * 43));
			const [r, g, b] = blended.map((colorChannel) => {
				const normalized = colorChannel / 255;
				return normalized <= 0.03928
					? normalized / 12.92
					: Math.pow((normalized + 0.055) / 1.055, 2.4);
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b > .5 ? '#000' : '#fff';
		}
		this.styleSheet = `
			.niftyHeaderInfo {
				overflow: hidden;
				whiteSpace: nowrap;
			}
			.niftyHeaderInfo * {
				transition: color 0.5s;
			}
			.sc-globalHeader-startButton:not(:has(#NiftyHeaderInfo)) {
				background-color: rgba(255, 255, 255, .9);
			}
			.sc-globalHeader-startButton:not(:has(#NiftyHeaderInfo)):hover {
				background-color: rgba(255, 255, 255, .8);
			}
		`;
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
		const colorizedIcons = {
			"Email Experience Manager": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA8FJREFUeNrsmW9PGmkUxQ/DiCBEtnUBRQFt0j+72hdmkzUb3+432O+yn2yzafqiado3bZpmd6NtQcWVIgqODOAAMwMM9DkYG9oowlgsk3ATEzLz3HN+dxjm3md0dTodODkkODwmBUwKmBTg8JDV53/MmmenH7wed9TtdjsC2rIsGA3raHr2x59kUytu+32eqJOuOi+03+eO1rTiltRqY8GJzYzMzTaiUuTRhqxWDbTbbcfAk1XVDMwL9u6PeHF1E0XNRKvVGnt4MpJ1cW3zy6dQ7PEm1FoTjUZjbOHJVqpbXdZLH6NxcaJiStB1fezgdb3eZYut/da/D8RWf4XWklGtamMDTxatNdVlG6iRxVc3UG97US6Vvjs8GchCpqE6cXxtA6Y7AEU5+W7w9CYDWWyNEgmR2J6+g+Oj3K3DHwlPeif6wA80C1FACoSRyRzcGjy93MLzOviBhzkKzYQSSKd3R9rwqE0Pf3hlIPihptHYo18QjD7A7k6qO0yNYkCjNj2WHq6PZpym8FziZ6SSH9D8hg2PWtSk9jDwtvYDNAjfe4xk8j0Mw7gxPDWoRc1h4W1vaGi0cH9dXLX3qNWqtuGZSw1q2YG/0Y5s4d4qPF4/dlJJVCqVofOZw1xqUOtWt5RWU9yzr55gZTmB6OIS0ns7KJ6eDpzPtcxhLjWoRc1bKaBp6sLwb8QWwvB6vYhE5hGLJ3BwsI98/vjafK7hWuYwlxrUoia1R1pAQ68h/eYpEkuLmPJ4Ph8PhcKIJ5aRO8wim/14ZT7PcQ3XMuciqEVNatNjJAUY1Qoy/zxDXBhdtvm/KOKkkMf+/h56t6n8zGM89zV87z6X2vQwamfftgBdKyO3/RIxYSBJV6dcFFFSVeztnjc8/vEzj10F/xlGaNMjt/Wi6zlIuMzkn3139PUzFUrqtbhfI0NNkR/FPDMz4z/XqNeuhf86CoUCQg/FCDN71/43oKknKKXfDgXf+00Q3A48g570JkPfF1tXPqeVQxj5XczNzdl6vBHYLZ3/Vu7a1KB3JfcObauBYGhp8ALKhQxaxQyCweCNxgS74L1Bhqqyj7KYVH+IxK+/hdSjNDrlQwQCgbHZE5OlU8522foWUMymINcV+Hy+sXsrQSaykfHSAk7/38J0swJPT4MatyAbGRXB+kUBSvpfzLhMyLI89m/myOgXrEr6v/M+kPvr96Z/qiO7XC44Kdjdq02pJcFq5J0G373ygtllmXlpyh9cq+pmfhT73FEFWQXzMdldk390TwqYFDApYFLATeKTAAMA7/HPw5oJGwoAAAAASUVORK5CYII=",
			"Experience Analytics": "data:image/png;base64,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",
			"Forms": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABeElEQVRoge2YzytEURTHv28YJDbIJAulJkS28h8Ym1H+AAsTydJq/A3+gsFS2diQFCtW/AEyo2GneSZKiSJ5VrOQub/evc/pNuez/d7bPd/OO/ec+wCGlkAkjG9f5gDsAhiyOeDr5clmOxDgEUFqpboxf9hMTkm2WgfvhAgZRN8lkSwzQB98gwgZkSQz4AXtugtvCjNJxvGH7Nax1jrvM8AGqGED1LABarT7wMTOVawDrGchBd5ngA1QYz0LNWrD9azUMrOQdgZUiG4pvoUUOMtAnBrQ/c5ltE4GVJ2YayAm3huI3cjCt0+snVZQfn5vqtuSaCOLAGxe3GNpiv7XkdE1+vD6geHeTuxdh+hJt2EhO4Di+R0AuiI2MrB+dovcaD8OKnXs5yeTiskIIwOluTEsn5RRnB1BX1f6l0bVyIwMDHZ34Ghx2vpQl3Ajo8Z7A/wio4ZfZNTwi4wabmTUyAzU/i0KNXWRIDNQABC6j8WYGoBV6iAYET+XgnD58RROwAAAAABJRU5ErkJggg==",
			"Experience Profile": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA4RpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNi1jMDY3IDc5LjE1Nzc0NywgMjAxNS8wMy8zMC0yMzo0MDo0MiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpmZjgyZDc0Yy0zZjMzLWI1NDItYjQ2Ni1hYTgyNTc3Yzk1MzIiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RjVEOUIyN0U4OUUxMTFFNUE1MEFFMzc2OTJCODdENzgiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RjVEOUIyN0Q4OUUxMTFFNUE1MEFFMzc2OTJCODdENzgiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTUgKFdpbmRvd3MpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6NDkxYTQxNzctN2VjZC02MDQyLWJmZjgtY2QyYTQwNWE2M2YxIiBzdFJlZjpkb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6Y2UzNzliYzEtM2E4MC0xMWU1LWI5OGUtODQwYjBhODA1Mzc1Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+uwSIXwAABNpJREFUeNrsmXmIlHUYx+ed6527pItN2w0k6bAklVRa0w7Jk6SoKDvAIJJdQ4m1fzS6/smFtNKOPzog2iQWNUwlTaiULGGx6KDEpXYtLSvMOd65dmb6PPYObMPOzu83x0o0D3xYZtjf+z7f9/f8nuMdo1AoOP7LZjQFNAU0BTQFnFVzz912pGEXP3H8RMMFOOFxyENBgV9hE5xTb0dCodDlpmkeNQxD1ZeC3+/fLgKegxWQU7jPRdABB+CSejkfDAXvSSaTX6fT6YmEtFEx7g3DEQgENrJmqdP+7jW4DzKK95wMB2FKrc7jyItWwurJ5XJupZBxOgusWW1Z1upiCBVtCywFS/He42E/zKsqZMIhr8/nO4gjK1UTicvlyvkD/tsTicTG4WdguO2GW+EvRT/CsBMe1HS+LZPO/JxKpWYqZxu3O0XMz0jEE9tLD3GpSXzfCL8pXtsDb8ITivG+KGklj2QymQtUnfd4PKd8ft+keDzeN1IWGsm+hBtgQLWewFPwujyssvEeDDxDvO8g3r2qzntN70+mz2yNx+LHyqXRciYFYjZ8rxEdy2GHRElJyDjZ/o9wfq1KlikaZ+SQ1+udiPPx0erAaHbMFtGnIWI+fAIttvMXEu8DpLybdc4Jgns5IzNwPl+pkFWyP+Am2ylVmypptuXilislIRhOI6rc20iODwa6EXynaiVWMXFggR0eqtYmCSEcDs9Mp9JX8UR3K+b4FYTaGp1WQtWScAe8o7FmHOxhJ+7miS7Euc3yhMvk+CFy/GJy/Ku6vZCOZeEB2KyxxoR3EdFF0eqUKipPuiTHJ9mhaeT4XdrdaBVFVA5VJ5yCtRppdj0iWvm7ik8/ppKpXmkfPF7Pn6bXvJocX1Xr6nRUb+vgMbszVDUR3huJRPbyxK+jOB2gA22t1vlaBYg9D29rrpF+qxunD7MLs0mTVi0O1CpAOsL7Nde8D130/9eyA/upE4GzJeBpewcMjTUvSyaLRqPzyEqH2IF2ZoBBxLSMpQBx+CX7DKianJM1jJgd0dPRlTRz24r9fzaTPY+K24+Ia8ZCgNuO+U6NNWm4F+e7SaGbSKUb8vn8v3ZtaGjIz4700akubKQAH2yFZRprJNXOx/ktZJ1dON9RbniRHWFnPggGg480QkDEHnaWaFxbWvH2WCz2Ge3wtzzhBRULDDuDyFfohdbXU8D5sA/majh/GGbx5L/j77mFfCGifFjYIXqhLnbsvXoImACfwnQN5z+EOfJaSD6Q508ylLTh0D6d0JBulHngc5klqhVwmT1eXqFx3zdgMcSGfyk9PQ7dQmg8SzOnXLllHiBL9SMipCtgiv3GoU0jTT4JD0lSKfdPhMY6RCyh88wop7B0+lLa8UFEjFcVcD18bL/EUu1Ql9szcUWj49xJ2zyJUfF35RY4mx1H0TtKrZhWSYCMg3vk4CleW0JlEbylE9+E1ADnYoLEuOoaaoWPMPyCWnFbOQF32X2Kam9y3J6X91ZTQRGRIcZnjTbkjFArXFLFqRWPlgp4GHrkLYbi/b+RNAlf1fpq8cyQEwwsk7duSsPIP7XiBYRvKAqQ+VPGOJfC+l9AXuu1w6CjTsa56CHNTmY26FfJUmdqhWWtkrfTxpytPzgaZWPx+0DzJ6amgKaApoCmgP+3gL8FGABWrRJk09WNdAAAAABJRU5ErkJggg==",
			"Federated Experience Manager": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAykSURBVGhD1ZkJVNT1Fsf/LrilZblrLvnSeloefJ1Op14+NHMjNc2nqWmp5b6GiooC9oxcEkRHQbMSt1hkZxhAkH3f930Uq1fZxDIgy8Bw77v3N396JDrZiznveM+55zcMcw6fz/3+fr9hzkj/z7qabLfbPcV+vPzjo1dXUuzOuacd/MU9/ZMp8lOPVl1mgdSD6Jl+qNEz89Ay+elHp1jgGxLwSD+E1zIcWq9lHraRf/Vo1OWkAyRgj+5pn4BXhgNey/wMfLOPnY+Ksu8uv8Q0tW7dS2bGWkKpi/xSo9Um4JH2L/TK+BS9sw6jb84x9M85HqYqPfm4/LLOK0yXzO4U9Ly60WmqfvOJ6fqtzjP0207N0u84banfeeYt/S6X+Xrrswv0Dt4r9U4ha/Unw9brFeGb9GcitupdI7frz0Vb6b+M3aX/Om6P/mKCTfOl5P0tVzmBVE7gUzmBo+iX8zkE5jvm+OUdHyn/6T9feEvq1VohBVYV98CNJ6bhZufpuPXkTNymmI0kgFYuc3GX69t4yGs5OgavwRMhHyEJIAmgS8QWPBu5Hb+ItsIvY3YhCeDFhH1ICeDVFDveQuhpEEAW8M89joH5TqjMP/m9quDkZBnhfy9NkdRPXyFFttyUoLKIBBynwSYS2OI8A7YpZuEOhSWwwEH3d+GY8gP8XLkaWMA5dD0orm/E0+FbwDVyG56L/BhY4KtYa3AjgYuJB4AF6CCDZ8Yh2kYO4EMCtI0gMM8Jg/KdQVWoqFWVnLaUUf54aQulAfqbUgo1kgBWFvTADU7TUAicnIG0hUQC9u6L8UjACjwW9D4eD16NTpxA6DpkgTOUgOsNEoj6mBLYSQlYo1v8PryUtB/pvYASEFepSMAn+whvIQzMc0RlgTOqihQYUnymJbTYZaOM9PBVXyQNb1FLec3lErSUS9hcJsEveSTgOJUSeOPXBA5ceQc+81+Gh/3fAxbgBJxUH9I2WicnsBlY4GzkDjhPAl/FUALxeymB/XAlxZa2kT2wAJ0D8Mk6QtvoGASQQGD+CUrgFIYUnYawEle4XnZui4z2+9VYIo0l6PKWMgGOzaWG1uRyAlPpHJAAJWBzmfa97xJ08COBgPfwKCegXIUs4EwJnLq+gQUoga2UwA4UArG78QIJiASSbXkL0XsB3USZDsgCfnQTsUBQ/gkMZoHiMxhW7JKizHV5UsYzXroyaSJBf68rkYChdcW0lkjYVCSBJocEjk+FjZTAXre5cNB7Ef7LezE4+C3FzyiBo0EraRutAkeRwFo4FbaBttEmcCEBV05AHOTdwAJuCTZwmQQ4ARbwTP8U+CqlcwABfJDznEAIFCli/IuO9pPxjFdzsfQygWsYmMANXSR3ISWQZUhg94U5aOe1AA9eIwGfxZTAUkpgOR4NXElbaBU6qvgmWosscJpvIhJou4lEAnwTJdrg5WS6ie73XkACnACdg7DA9HN9ZDzj1VwgTaEpa5sKJWDgpgIJ6DE25tNaQGueBD9nmrVYf/2mer/HPLWtx3z1Qa+FahJQH/JbonbwX6Y+GrBSTedAfTx4jZpuIjUdZDUloKaDrD4buU19LspKfT5ml/pCrLWaDrKWBa4k24O4StMPgTcf5KwjIK7SPEd/ekPrKeP9fhGkgqfM0AzclC93noDHxlwJG3Klf8sv/9N1MX7fufu9F/BVSufA/Q//S0GgCgbmSTMwwYKAzqE1R8L6bAkasjtP4AIJ8EG+nGwnEqBtBEIg88hX9mjfVX7Zb8q+FB78LwaBKhhYNAGLziYB7iy5MztfQLwX8E1EAp6ZDgp8wP9StrfhbbsKOCz/2LEIVMHA9Vk0aYKtz6Q1U8K7GRLUZ9CaLsHdtM4U2GNIIMmW3pH5JvrkiPyrDsXwthWtTSTgKD/VsQhWIU+Z4ZGhRacbmuCxLrVzBcRNJATsbOWnOxTBz7O7DU12txEPGBOgCSvEpNNo4gRMsDxxrEuhNVXC2mQJalM6T+BrEhDvBUn7reSnOpT9LbA8UNHayPC2t1qBHhsRSJUUDMywolMMXZcsdxJJJHWiQJy1q1vivvXyjx3qgICHRtsKQHqM+6n33TQiQNNVMDBPmoEJFhham0CTT6Q1XgJtXOcJuCXajJAfdigDfGsjQ9uoW2GfuhX3luthT7kxgSRJwcCiCbg2gTpe7jhD18R0nsCD6kA5WNrcbG2kxr0ETtBoXdaKu8v0uLO0xYhAgqRgaJoyCNhYmnisgAZtDK3REtREmVZgb3mLJU26cS9B7ynTA0PvKmmBnSV6tCpuhh1FRgQIVlFLwAzNwKKjBTgSuKEjTSfA8NZl+kZq3F1K4NRWBP5xcQsSOG4vbMFtBTojAtGSgqGro2jSBF0dKSaO1TdojZSwKkICemwygd1lLZUMvbO4BawYurAZthM4QcPWgmbckqeDTXlGBAhYIU9ZNMEaOkLucJIIN50AbRFt+2kL6Pxm3Ey9Ka8ZN+bqcH2OMYEbkoKBCRIYuOo6rQRdGSYBPcbKUFpDTSewvaBZu62wGbfm64DBN+XqgKE35DQBgeO6rEb4MLPxwQKV4SRgmDLDGzpM7lAhgJUq0wlsztNpDdMmaMO0cV22DtdmN+FHWU34YWYTrk43JhAmKRhWnjT+EiJBZQitKlpV9GEmmD4TB5tOgCatFeDZTSCgM3niTbgmowFWZzTiB2kN8H5qvRGBEEkhpkzQogmam6ANraQOMp3A2uxG7VqaNE97DU+boFelEzj1+2kNuCK1AZcnGxHQqEiAJ60Uk0ZNEK0E/XMgfRYOpDWAPpEFmE6A9rd2jYBuAAGdWg8rCXpFcj28l9KAy5LuwtLEu0YElJJCnjLDI0OLDjD0z/4S3vEznQCBaz9Ia8SV8rQZenkyg9fju4n1uCShHv8ZZ0SAJq0Qk/aniRMwwYKA9qXVj1YfCX7yMZ3AytR67QoBXQ/LkuuRpg3vEvSSuDogcFwUUwcLY2qNCPhJCgYWTcCifYUAw4v+6ZrpBGjS2qXtpr04/i5PHBfF3sWFMXW4ILoO344yJuBDAgRLUwYB602rt4AGavzRSwJqkwksia/XCujYOmDod2JqaeICGuZH1eG8G1p464YRAQJXMLBoAmbon7zk9jT0Dx6mE3gn9q6W+r/Tpp4fVYtzI2uRwNEyohZnR9QYEbjSRSEm7UkTJ+gfPWjiDO1Oqwet30jwwxXTCSyM0moFdKQW5hH03AgxcZwTXgOzw7U4K6wGZoYaEfhu0bhXbk8xr6z4+yS8+eoLWP7KRCx9+a9Y/NJzWPi3cZhn/hfMnjS2NWPsM5rUMWM0yaNHaxJGjtTEjRihiRk6VBM5eLAmfOBATdiAAZrQp57SBPfvrwl6/HGN/2OPaXx699Z49+ql8erRQ+NhZqa50q2b5lKXLpqLdPm5UbvQ4wVB30P7ac8haAafeV2LM8JqcHpI9Z3pqmrj3xeoJ0+edHPy5B/U5uZYOmkSlLzwAhZMmAD5zz+POePHQ9azz2L62LGQ9swzmDxqFCSOHImxI0ZAzLBheGPIEIgYNAhJAEgAlf37Awmgf9++4NunD17r1QtIAL8xM4Or3bohCcAlSUJXSYJjtM4L+A7mRBD09RqYRdAzQ6vhTQM4TFNVf2sRqnlexjRe5ebm46hvlU2ahCxQOGECskDu+PHIAhljx2LamDGYMmoUsgAlgCwQOWQIssD1AQOQBSgBZIGAvn2RBSgBZAH37t3xateueLlLFzxL4AzPben/3a/TfjOUwWtwWkg1TlVVlVqEVI+R8R6uSl988WkSKCx+UAIkkMQJPP20SCD6ngRC2iXgd28C3bsDCxC8mPwReZ3t8y1MJ/A3VFU8cZyqrAILZXWOhfLOUBnrj1Wmufmg4okT09sSIIHfJEBbCBNIIG74cGSB9gmwQFsCtIU6JHCeBNom39YzvL+laVejRXA1/kNZha8HVSW+rqx5uO8EHlQ07SdIIIYFstslQIdYJMACscOHQ/TQoXhj8GCRQKiRBDxJ4EtK4DgJHL0ngTc8K2BKEIEHVMJrgVXhFl53+soYf67Shw3rk/fcc6r2CbBAWwIkgCxAtxBGDBzIW+jXBALvSeCCmRk60QFmgfbT57bwqMDXAqrw1YBKX4sLt3rJf75zymvChB4548Z53i+BmHYJ0DVqSODJJ0UCLNCWgFvPnuBMAo7dut03gdev3oJXfCsvWkRFmeabei9J6kbT/4KuUF3K6NG6pJEjdfEjRujoBtJFDRmiixw0SEcCOkpARwI65RNP6AL79dNRArpLvXvrTvbsqSMBHSWg+7xrVx1B/6anumaekhAf6lt+Q0nSfwBfyR4iWXPhyAAAAABJRU5ErkJggg==",
			"List Manager": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAa9JREFUeNpi/P//P8NQBkwMQxyw4JKIudjhCaTmArEkJRZ8f/2JUje+YmBkTFvr3LqRtBj4D3T8f6Dj/4PZA4nFGP79n0VyDAB1SlInkqmSx8TIzgP/8Yj9RxP7j0XuPxb5/0Ta95+SPPCfDE8w4HE8KfFCiieGbylEpbRLRXMoSEKD1/nDOQkhmhiMWMIRWQy/PM6WCiNSFDGSH1Us5CWC/wzLDauJsuDZs2dEqcu6Mmk0CaGFMX1bqeTax0KuhRHnW4hszH0ehDHwHykTEhCnOCZx2UUwBv6Tkbexif+nSvoavhUZ2U2JVUZ1VC1G0y/3D86mBK1jatAUowxUL0YJmBdytpEoC34MymKUDhXUaFOCsqzFSKBDiUstMS1dkpvT2ME6E+LyAKFiNOViD0Xdejp0KWlb1bEMbefjLUbxGx14unawF6PDvC00+IdV/g/zGNho1kpRMZp4oXNo5AFam092KUS5D/7TOgnhB34nq4grRt98GW2NjtDW6BCpyUaT0ECDkTA/QGlxP3BJ6PlgCWVG0Gw9GR5IAeIXg8D9L0BLDXB6bnS1ygADgAADAMf/2jaGWslPAAAAAElFTkSuQmCC",
			"Experience Optimization": "data:image/png;base64,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",
			"Marketing Automation": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABGdBTUEAALGPC/xhBQAAAehJREFUaAXtWb1OwzAQPic8RiU2JNYo7EhseQfWIPEEPAMzSxl5CTYkZip174aU10iMD7Bk0zvbSpy2QVepinO+736+S65nFUA+x2VA5XJ/+fTe9KDXxt6KsdlBAe3u/vqV2R8lLkahCFAkeESsYIBnAjpJlC2B7wDjoXDViSMZjZwJMC7mFUsC8/Ibty4VcDjqnDW3TNHhsKQ8XwVMjzceQgF2Jag7MgoRzsDAZrPR+J3BtGcy3yPkmT3czeITOBxVM3nKNo0+vt02eoC11vQ0qhR0Wqn24eblNKfRUPBIPiamtD7daZRj3n1yUnRc/ZT14l9iSSClzHPqSAUsu9gm7Zq7puhwWE6erQLY40MB4p4qQKZRrhLZ5TKNJlKa7R1I9JddLTjMHeJAEsqorutgfIhdfAXOQgzYvRQmrK692upNwVpboeviKyAJhMorewkMeG1qu902fd8H/2UpiqKtqmrvXPtxcd5obbDMmRhwFlJle7X73MNO8eu9A5HgkY/VMAzkuTYYPCJNYkaHxE7x6yWAAaKvyIfW4Zh3jfE6tE0Xy8T2NwEfsoA7SeDYRfp3FYieaw3jtE7CmRhbKVMxTu6qkzpeBbDHswH+mOrKsiTPtdjjAwHC7+8AiZ3i181Q1sLACAa+AHoSjNWx7rgiAAAAAElFTkSuQmCC",
			"Campaign Creator": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAABq9JREFUeNrUWWtsFFUUnrudbh9b11LZ0m7LFo12JW0TSCXWFloLqEhshBKqP3z+MPzQPxSlxFdSoyQEY0xM0GoUSDQxbUJIgFgNJTXG0odNCI8iQQq10rLpc1naTbvtjt9ZZ8p03LtzF7d0PcnNnJm5e+d893zn3HPvMul/IA0NDaU+n68yGAx+v3v37iv6dyyeDW9sbExIS0t7q6en5wMYLzPGhmVZrti5c+dFrY8lXo2/evVqeklJSWNvb+9e3CbSM0VRls7Ozjbo+8UlgJs3b5ZlZGR09/X1Vfv9/hBLLBYLowZ13f79+9fHJQDMsNXr9daDLi2gywOgjkJC7/BMoab22xF3AMbGxlYjUNtg3Hu4tQ4PD0sAw+u+ad++fffEBQAYagdlPgY9OnBbrFGlv79fTxujbkdbu6gAMNMyZvilxMTE86BGLd1rVCEZGBiYRxujDqlYNAAwfDPo0gEjDoHry43vYaA0NDRkNsxjd3UdoBmG0VVQ90BfA8O53x4fH6c1wGzIEXgvR/5jpUvYiAcv/nknKdEBg1/ArO8Ab90aDch+0onX2jNNHx0dJcBMy0Dh+kDNmJyczJYXYrY9Hk+a1WrdhI89h9unYUdqlBQLAVTt5wo88JAcA2pY4HJ7QkJCEfQSfHgDruW4pszlasvtUNMyiV43PoPXuH31Or7zLwD00S1oj6PlGoM8DN2S8TEXjHWSrvwjPJeH1Y3PaIBbt26FWGY2Bn1XD2Ad2iG0+3WFnmLQ5545fj0rMfn2YLEUFYCILNcAUE79QfUAr1rVdJbZfo7gC7lZRNc/o/EDgYDoGA4CYEM7SBTQaG3mgSAFV5RUEaUQqk1lampKiEKQewnA8zra8GZ9Ts/sOD8vfy+EBxwOhzQ4OCgSxEspSLeqs6voPMDT55Z03hIfrW58BuOUqqoqpbKykgw0GyOVAKwSjZjMn8/erVVbys/PlwoLC836JRKATJUeTEeV8HoSm6sKOVVi1Hqk90VFRRHHgIRWGCZMIXX5X0gK6XXsh5Xk5GRuHyo3CEBA2LVBJbTER6jDYi5Y4bnvYIciX5OtVKG5RbLQ4GefSO4drzOBtSJanfsee+JImWyWPNAuSqGpxu8kytNao2ALp1M9L9rod7yGTb0yMzMTiULTBODbqHwqQB+NZuHoZjQyErjOzk6zT/kIwCm0n4SyEOTCE2uFshAPEFWmZu369evS0aNHJTpSMfnOMAEIor2M1iOykNH13MYy0wzDm3URWnV1dSkTExOmmQzi1cplDxrt8r9E84sw6cKT6yK+N5zjhESlU2hS1D3C3FXTKbNgoyLIZjbIkGvnPexg3ywdXPF2HdQ3Ob9rU4s/EnvBj7+4QK4CfHw17u+LRepsbW2V6FhFQN6XjbV3gVQzXJ1U/fmIbWSXtqWjJU+dQcaCzOnIchxsamqaDb10Zms0YQMDA270WA8wz+CeXGSLtholPSUlRbQa7Qt7rHLktyO9MKAnLDVYMO/GjRvF4RaVnJyc351O54GsrKzN09PTLozxKl61UL6OxgN2u1206xVLBH4dZ6poXtCukC1mI+fl5Y0BzOFly5ZtlGW5EDP3KQD5RGqh9PR0pm1NeX1CXGDssiVCpXdCCz4tEHXXZ6M5FEN9fwlAalHX5NHZJ9pQpFoIHlCYru7inMz9hUka4RqRmpraiU4ezuuHy8rKVkYbnJjZMdDrw6SkpHzcfkQLUbh+FAP4vlkGOlNTUzPLBdDc3DyFTid5v0eRteVOs8ySJUvG4ZF3UXYUqpWAYlz4aFdmIqdNz0bhgeOcGCCp/q/pMjc3tx9AXoS6Abzu0fGbZWdnc2OATMEEtpgCsFqtJwHCb4wBVVZVVFSsiEXeh7Gt2MivgbqXCjTiODIad0sJ6fd6vWdMAbS0tIzQ2sbxgEU9BIuJuFwuP7zxDh2qUXahGEC88DzQVF9fPyN6vH6M4wFFPRCIqcDo06DHIyijD7vd7nD1TwBADgj/xYSBThiDTBcjj5aWljpjDQIB7AOFXrHZbK9BnzQE+Fe1tbW9wgDa2tou4XI5DIVIklB4bV6o7WRBQcHXWBMqkXavqcHdisy1Z965lOAxxwkOhci1W6UFlG3btnWh4KQ1ZyXqto11dXU+3n6WK+Xl5ZUU01pRp3MnFVYTgUDA1d7eProYf1cJeQCFGe2bR4wUUrODDS5+arH+LBQCgNn1Y+JPhaOQqr6xffv2hLgFoBp6LNI/hh6PZ9diABD+iwm5uRkgvjD+u6jd4l12cXFxand39+TdBPC3AAMA1zhcdfIUAywAAAAASUVORK5CYII=",
			"Path Analyzer": "data:image/png;base64,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",
			"Content Editor": "data:image/png;base64,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",
			"Marketing Control Panel": "data:image/png;base64,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",
			"Experience Editor": "data:image/png;base64,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",
			"Media Library": "data:image/png;base64,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",
			"Workbox": "data:image/png;base64,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",
			"Recycle Bin": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAACG5JREFUeNrMWgtUVVUa/vc+Jy8o5CNaKDNGLTVRFpPRyx405YAiGWmaLB3HIjFBFJVxla0UZ7KMVemidHVT8UFpYqs014BoDx/oErOi16SIgK9WyKiojWDCOXvPf869F869d5/LOXQb2q6fc85/9tn7+/f+9/f/e18JBLnM+rKur0TkXZxDnPZMsHAsvvWM+l8uN8Opw7WHWhznHt6T+9Q1O/3RoIKvPBlNQSrnjMeBhg2Fu6++4tFfvdgEpw/XAWtlw6+7ErHKbp9SsMDnHD4dAwz2IKibvUYa9JH2q6/pmxub4KevTwNXGVCKGkkaNiBx8pXaz96rsNovCQb42RV1twOVduKQ3ggCXwGBBVcvNpOz3//IGWM+dUHhhKaWPZtU9n8xYPbhk/djp//C294d+bqnNF9ogvPVDYSpjIvq4uUyl+DekrmJVb+pAdmH6kYh+A9RugNBH+BM4Cve+quNzXCh9j86XL+Z8Z6t41Rhw7fNT7z4mxiQfaBmPKd0I3puiNVvcMFevnSisaflTjh83CLXP1KSlaaYstDM/ccH2wU/80DdUxxIMTDuQCfmumjM4rk3SpueO9XmljickDMonEpUmxxuFD+dRJJCIer1gDTKgT4580DNa9bB1+YgorUITOJuOnRRIoDxuU10G3jBn2/okV30RPwZiUCqJMtXqCyB5CMiHTJTTtqqigzzOMAZIBH8PWt/zbKOwGeW1yzEwSxAjyb+1M5FdK+Vpc6EgblpQyL1p/ezEr6hEkyWZKpIAsAiod2klZM3fJEgngHm6hyBzcvcJzZiy9EGgu9ex3ovCkfZRLAsdCYMWOjbXvG0e0solXKphOAMIvk8G/QOjBMfTN30TbTAhbBoJMF0X503Y0+1lxHPHG2Qdp/9eRW+y0U3IZ66vsK9n1EB899+cOBSs9nc9OSdK3AWNAGPUMO9rx7XB8YY/lF68bc9vF1IDyRIX+2S6zFiysaG60j9zxvxdrqL9sC3brt43nH9X/aqhwYt78glQ2oP5lJZLsU1QXTRRttzb5Q2vTQMh7BI84g2Gp2++9hS7HCBIIK+iX4wEO9SAgUln3cKro6MNSNiiqySwiTn7rDQiMhy/G6YlcRPH3VClhSOj12sv8v49NhSHLYFllIAk7TAHVFagdOpaxJv3WKXljO2/RCF8WSUi/uJjG1RjoKoZXfj3fRXHGQEoCeg8jXJ6Zw0+BJWYCCChA364wcT/ARa8E9aYeKt2zsTFAvHxf6El/Wd+VbmzDwM+mP116FRzWjU+LUjY3ZBFxQZmL6U/VIK90iTgDoO/2VUTV2XFLsXuqjIXLNAhQ6TMD8dgcsY/FPWjYqtgC4s+gxw4ZoUuYtbR+ACmpK8NnnIV9DFhXIIvOUz0e0aeVNEJfwOiqzFMQLcHgtxmFxWd64RA8ocT45jtcytPDMJ6Xh+p9ByfQssGQA53TRKRBzk51teOs5n7ahtALtGFMT33zznqzN/woiywDdoWQ1k7YBIFHXTKPGTdsYx13Eyu/R4wxvG0G6lvHFH/+dxO5mv8QF3Zba6MJ/njvSYn1GqL2LhRkSgF+i0mSg9Zt+IN++Kfh6be9m7LTEWMz3XFzHnLdydTRoFLOpco8hmlVbVr7BrxIq7ohfhLC7RU3pdOLTfG8VMz0DLNU7hbOwXBzLioc8Wl44FWF8wuOTI2Yna9sGWEfdEL86uOKHdLjIESzAJrN5rgwfpXCgYJfvgiUJEM02M1CSJ5CRf/j2AzyqvSUB8T+gMJ04WTfQcutyArP21f8Hx/QgBhpke9QjyMl3NoGsNyCw/PhrX1YeIL0R3CO0sRXA4ZqZ35UJdVGbsrRmLI7sZwTuMLiFcwyZ60lUGTN9TnYbz/y4TuLAdFsI5czUwfXv13RjuBgneU5w9/06AXasf1Ke4ZEgksw1+d9VUjCdr0V9k7p9sme34TEjIPQKklZ1lhG1DVT8v6tKCryqms74/nL9by81s7X0/qX4GGHsL+3Ed5/iAEumw02L0/2N4s9h/VojrF5rVE2JOqyp/TFFYs9Kqgiaq+2oUL52i5qQXf5drHXxVDu6cnGg/tXw4xmANOdjrb2sSY/6JZi3yOzjDSNz2E9P6ibFfslZliqoqjKkqURUFtKtRfHWKqrw6pahyYkfgn9559DkkkQKcc6pxjS7MxTte4ta504dlSf17Z67Oi9R9oDAx5mVEnccN33ERt07a8MU8rLhMlMKKdfALV1ny5mnDy8Xgj+Th5R82j23y1iUPfcmkPe2o8kW3E+ULU4mJqw+uxNaybZwLXQSuPvB+ZsJRozJ9x5FXsJPnAhyEcd+1in/nrksZuiLgjJYdeQE/XYL1xQaMcW6RHbzfdmx+tKWNhU7V5BSujfu2z3uoXstKy+rOL0dr55ga7asngK5CM9anDLV0qpe+49/aTHQ3TeYez98azkJ6l+Nyuc3ayZz+rlKKCB1xfc/wfKS4GVZ3WbhVvYb9/LVoTNxWO6yWvvPbWwJmo2OWf/JHXFiH8PYPllpEG8L79WroFu6ItIGjCVfj4xtS4z7uTFDsMJ0e/WppPCh0L7pnWMAZoJSER/XiIT1DOz5fatdfwpDw6Dtj4w50Nqpb2g8kvVTyKGLYivhlECZbBHpF30gc4SGWEzHs+BxILPmd1Pivf01aYnlD83Dethwc/QLBwEOfWyIhpGcP6ycKhPyIW/WRG8feXgW/slj+rwYn9235/Kb7J/RBzr9H24ty/YcRDn0G9AXH9d1dRGRGUEayIaQGY9CITeOG1QTlZM5O5abQhlxFVUvUVkU3IGJgFISEhYp+YhL/9MThe5VJD24ad9vJYGW2tvfEd8xaGdbN0XtfVOzN8Y7w7nZO1T6XqJry7oQ7G4OZmv9PgAEApcMrlPtRcR4AAAAASUVORK5CYII=",
			"Control Panel": "data:image/png;base64,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",
			"Profile Experience Generator": "data:image/png;base64,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",
			"Update Center": "data:image/png;base64,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",
			"App Center": "data:image/png;base64,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",
			"Experience Generator": "data:image/png;base64,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",
			"Desktop": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAj9JREFUeNrsWktOwzAQ9Tg5B+y5Aov2FkgcgB1LJC7AEbgACw7BnmOwQRWbILFh16YmTmfcZ+ejftNGjFVjZ/x7M/MmVJ6Sc86MuVgz8qIKqAJ7lnw6nTrHkUxV6eujbJP5vl8UBS0WC7+2lleiWm6trafRqrjquZal47KfyNNzcphgNumjbNO1ZVnK2jC0XC4Ng69bViCs8+OsUNgPtw8e8H+O6QE+zAl4sSTII+vK3LZ+pwe2sei2HvBNlmVhCC0ploc29Nvmyt5iGy9qUOju6eWgQfb1/cvmJsOf+mBPDrK+5Wq5kox7ZQLtjCB8friJ8DYoNNjrA4+i1aMoRwAelRCr91Lo+MDXIUhmDdwYVCIGTxC2qTL54JbHVwh6ADoEACkdT/BaoZA7ybc6iikFaAPEiFrBA07eUGfxn5jAvgTPPT4zURCjS26vL3YC8fr+OWD8nw2FdiuI9yRBrB4AvOP/Oq0UUgophZRCSiGlkFJIKaQUUgr9bwo5vm10obrGjF4KYfm4uoye3+4f9wL3M5utr0igymWu1CzLGjK5bsT7IG94JMugMeAPxqP6WItA+TauNQYGv1oUJbBtq10K8nh3fuCEgdlQgHMIoYJSFIwxmUzcMT1QFIWZz+cRl7EvPIfrdQPX640YSBmTt72iZPAQCQ6/rCzLKMEheQDZ1ss4kOs+ZG+6EhxBqUFSTP4RArhNThAfCJCEUpLsSCk0WIop7YvlRcZAqbK+YxoFz/WdQ/pTA1VAFRh3+RNgAAiY71ijlFb/AAAAAElFTkSuQmCC",
			"PowerShell ISE": "data:image/png;base64,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",
			"PowerShell Reports": "data:image/png;base64,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",
			"Security Editor": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARKSURBVGhDzZjNb9NIGMbDHjjBOiRKEzWQYOLESfbQhgbHiSpR33tDAiQurLjsoZf9C/aynOG/2L1yaaEqBPGRlo+SNhRx2LJ8tYRWy2rrynvpxuYZa4KybdrYE0/cRxopceKZ5zfzzvh9HeimZql06XOlYjTL5T2t2/XOa2ulkvGuWDRWR0eN5UzGmBEEYzYUMu5GIkY1GjUexOPG40TCeCKKxmIqZSzhPy9l2XiVyxkr2az9Gffdey3Lx6kd91pX1SswZX0ql83drdv1zmsAMAFgrhYK5pIsmzPBoHUnHDbnhobMaixmAsAEgPlUFK3nqZRZz2TMRjZrruTz5stczmzI8kI9mQxSK2zyDSCbXaiPjPRnnsgngHlPzBMNGgBx7515IhiyAdw2bGJrvVSy3heL1p+FgrUsyxYBmA2HrbtDQ9b9WMx6GI9btUTCIgDYxBYA5vuO+d0a1AosnjnjvXmiAQHwMU/EG6B26tR8lZd5Iq4Aw8N8zRNxBKixmH8hSefrqdQP9GtvwZAN4LYdeApFIrWqILCZT6d1NIVe6i0OK8BkHrM+AYDtF+m06RvAdDDIZl6Wv5n3DWAll2OKeWIehr+Z9wXgzeho7S1DeoC0YgIptk5SDN8A3o+NMZtHYqeT0OsLAIZsALeNnkLM5lEP6Eip7dMLq/C/NpgVUNXHf4+NCbQbx4J5Dem0TgoaAtD3CjABMJrHhtUamPl2ReYLQLNSYTOfSmkwpneWlIMHYJz5Z8nkBNJp+7TxD4DR/DzMPz19Wu9W1HsCAJM2wEGNNWxQkU0gndbbFRk5YYjpV/m8hQef/Zn/KcQ48/ejUQ31gL7vW4lBhBDrzM/BPNJpvVtR7zlAU1UvdgVgnPm5cFhDPaDvKildASzKcpF211sb5XJlDwCj+duCoM2GQnqXmtgNQGtZkk7SLnvrg6qGkBbs9Gv+UTyuoR7Q9ynqnQNI0hcrEPiOdutMAFjqx/wfIyPaEh5Se2piBgDE/y3arXMhhH7Bhn3EYv7t2bPam0JBd/Jiy8kxCoCrtGvn2jh3LsZi/qOiaEin9X3fSrhdAYQPfjtGu+crrJi2pij6AW8lXAPUJek67Z6viHnsl+19inomAITOZiOROEGH4Ke2ebLpvQRA+FyjQ/ATMY8Ta5s8Nw58L+RyE2P2p3F0HqHD8FF75jsfel6sAADWGqIYpcPwUWfYeAzwL0rMCh2GjzrNewmAEPoPAJfpMHy0OT6e6TTvIUBrJZudosPwE9lY2Kw3PAZoAeBnOgR/UYhfEUq2+XZjOoXS6Z2GLP9Eux6sUDdMIZx2WFcAAMaiJF2g3fkjzPokVuIftwBPRHH9eTKp0m781afx8TxW47VTABT1tYV43HmBMgj9pSjfI5x+6wHQejA8fBMb9ii97fAJAD8ind7qAtCsRqOT9G+HW+8URQTALE6hrRlB2MIp9Pt0LBahP3uoQOArn910HxjY1ZsAAAAASUVORK5CYII=",
			"Exm Experience Generator": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAFe0lEQVR42u1Zb2gcVRC/2BixLWpDiBoUFRVsVCj1b0XFWkRF1KrUSlVEv6jol2jQGHK7e/+aK0lje5XSI4hUKZVroAqtEgo9tDF3V7SSIn6JQZpgSHJ3Mdar2pi4/qaZrZPt3V7udjcNkoVh997OzPv93ps3896ex7N4LV7uX5FI5CJN0yKQCYh+noT6jhCWkgkweH2BSKQcAhMLiMBEOQRmOVFVNYn7FW6HLvXBfc3q3y6BH/g+CFnlIvhV3AcN2DEnCdRAvuPn3yHrXQC/nn1TH0cglzlGgH+Tw15um4Y0OQi+iX2S7y8hS/NhsEWA25ZDDot3u8tKcbNT9W7hLwapssJgiwBdHR0dF6PtoFjcPZDaUv2TDdmKfjpjsdiSuWCwRYDfVaHzLqHzs9/vv3WuvkmXbIR9u67rFaVgsEWA31dCPhYzcdLn8z1ezC/pkK7w31IuBlsEWOcCgNkldKcgjRb6jaxzJhHA9k27GGwb09RDZ6sp7X5oWoxV3Ga8/xsz8aJTGBwxhp7PROIrrh81/Gy0/wnwT7qBoWxjAhmNRi9ESLwD+UfYDrCcXSe4P0gZKBQKXb4gCADM7dAZwv01XqRviKIk91IZyJ1itgbJ9rwSAIAX8P4PSFimQZB4WSxWkl8gt5jWTZhsyYdbBI4XSaM1APo6ZGOBdLmRqjbuD7e2tq4ooNPAs9VuLmJlEYDiJXD6DMUn732GChSySq6ktfRs5TMYDF4Dn09RBS80i5BJ+OmGVNslYOxzBmhE0LEXzz+ZAF2NtqPC+SEQvrLQgFDss94ei+L2KN7nIP2o0jfbIdBvGMDpOtxvohCggmUatU1Cb62MbTnSvEaMRfx1kWRwNy/0k8Z2vRwCW0WHuyRgCRK/PxXO3zeN5tvC3+dCr7FY/4FAYCX0TvC6UEomQKMgjNIULtw+gt8hqp64H8hzZt2Ld8/j/gFklMHXU9HiwaDacO0cB/EqcQIsjQCntxNsdIpCiPfsuRIO4Dmy4dE8xW2pEjNgtTg8lZZGaUFhxP6CUbOueyr0uFa52e9fg8ozVgw86QSD2j1kQ7bkA/IbFuZdtKAhv87LVwleuMvHU95N40nls+FvtaWUaXw+dRtk+BzgPm3Ur2k7tqhqHemSDdmSDwZfZVoP7n8XoiubVPogOuR4OqE9MBNmngpKdQEUMb9ffSsU0lYbWQqg7xM2fWLRd837lzkAXs1ApPyYSahbsr3aI2fCK7ZhSTqprM0m1QCRNOuTj3n9HkolnyrxzOh7lTwEzspIX+OysV71Bisd8sEh+RiFk2vAxebqNCTOBLqtwKV71Lp00ntbEQLdnFXilJFkjXAa/HYRd1GO/0ErcJlEy8rMUWWdNQFlkAlEReV+z+kvYu2mhdPEBCYtwaW8azIJ7ekiBE5zH8rsrOXQTHB6k4ePvcbuEp1PW4LDQkaIvFKEwLT4lnRI9DPm5AzsZ6efyK1xJqWMWYEbT3qfy6aUBsswgw/TB7EveGux0+k1UG1uB8C4JYGU8irSp68Iyfhc+nL0Qnw+RAf08YTyriW4mffbiumQLxS+O+alDoh90BMj36i1AJErPLrKZszARxYEcuSDfBn7Ibf/GaGvbMPGvzE03VYxjvjeiRDZXzhLKQ28jTD+bfnebQL3iywxSlWZtgvZlNqZvw6oezALh/ODVzvJls/WxpZaxxb7RjcJ7BAEtv+38DwVmZS3mXK6qcoexCwcM4GfJF2yEX73Cb/NbhIYEh3de+7OVKsHwC7IFIPtgQzw89TMO60+zynvWeE35SYB4z+wfvMhXl4TqZbrEN8qAMcgR+iZ2grpt7W1LaPjKfs+4BoB+saDLPQS7nVO+0bsX0/n6XA4fKln8fofXP8C5UJoRJ84KzcAAAAASUVORK5CYII=",
			"Access Viewer": "data:image/png;base64,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",
			"Domain Manager": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAPFSURBVGhD7ZpNSFRRFMfHCqMyiiBqESEVtGmXtCoiCjJKc1J3kuWicnTGtCytnEtUm2o2bcqvWogJrkRnzIUgFFnNG8tktFQiCKP8gJqcFMfePd3zuq9ewzN9el8zD/zD4WwO87/n/O6beQfGJloAjYnyeFWYjldPy6OeaTpQOC2zgEEX8JL4FjZAw9WTEK4GGPMADDgBD2+ZBoJBhYDSgDx6m2IDcr+T/tcGHD5aWOCjH4xGXv2noZM1waGpUC3VI1BEyFpuYZ7yvXSfwydPFbQCOLwyNZLzHg7T47VvQW0gmkDirrs9a/bXb+FW4nX6ESSzSQ7jYeYTeQ0jgA1Evt0H3WdgZyXsyH/ynhBYwi3F6VQzrMz3yhIeZK4Tj86zEThw/Q1lHqG9HbCM2woSQAK793V4iIXEvwhca/+o1DCfEBHdgMNLi9nVoXOd9ExZlwA7fHHrxO864Q1kN8JSdng/Giw0tAR+jNcoky9opX/VmEKA3f/NzGhotgnPlrUEQl/qdOtMaQCV74Wd+OFoNN/QElAa8P09fQzTGkCdaaHp7DpF9CY3lxxTAqocj6gLH2g0NBoxJ6CKTcrDnonv7Ds7bCSfqB/+nlPZMzEVqokdART+UuY10dWODkgyFI3DSW2dbevwZS6mBBYivg/8akCHANbEfQO4D+gR4CXxrZkIKC9zVlA0AQf7JcbDW6oBlYDLN6VM/ke/yzoEgkGiEJgMPfg1ee0+YBVFvlVF9PaB9KaC7kOtJd12vztwTCKBOWfJ3ZkhXd7KP95cLXemfJ4MVepuZKktZ+FIeykcCxDjIZHu7CBJ4jbmaNXF3eFEZwpMfL2nu5GlNhdRbIBNluKhjOYMyd1gA1sCtxOvtM5LkHw7DUwh8CfKuJ144aTYfYWadzdpZLxKOAHMdolEMvwVh7ilWKGJYsSaKOu9ASOfbplBAGMsq4ts47biFD2x3ICbBvpKhBJQsz3g9nBbccIPj47SV5eFE2DX6HFWZ/EKbitOepPCBsQScPdnvSxfzy3FCk2iQygByT2a5b+ynduJl97ERBGwB8jE0UDFHm5ljtAsOrQEDra45MPt52X2LWUo2LWZzuwiOdzGPOlNTkug6vWFTfbnxHBkvyAbuYW50k5eDS0BXhafSntWvgEzHnomAkphPCt1wLkcc6ZElAYsRUBVI1to/J/vTOa+umo9Aih1Jx77eg8qeq9bj4C6E+PrdGTEQ5/2nbMmAb19gJfEt7QEovcBXhLfWiQQay0SiLU4AeXvNpT/3YYOOk36u43N9hMm6XfQWJLjbgAAAABJRU5ErkJggg==",
			"User Manager": "data:image/png;base64,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",
			"Role Manager": "data:image/png;base64,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",
			"Horizon": "data:image/png;base64,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",
			"Admin Tools": "data:image/png;base64,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"
		}
		this.getContainer = function() {
			let qaContainer = document.createElement('div');
				qaContainer.id = 'QuickAccess';
			return qaContainer;
		}
		this.render = function(sc10) {
			let qaBar = document.querySelector('#QuickAccess');
			let qaItems = GM_getJson('QuickAccessItems');
			if (!qaBar || !qaItems) {
				return;
			}
			qaBar.innerHTML = '';
			for (let i = 0; i < qaItems.length; i++) {
				let imgSrc = sc10 ? qaItems[i].sc10imgsrc : qaItems[i].imgsrc;
				let onError = '';
				if (imgSrc.indexOf('launchpadicons') > -1 && globalSettings['colorizeLaunchPadIcons']) {
					imgSrc = colorizedIcons[qaItems[i].title];
				} else {
					let onErrorSrc = imgSrc.indexOf('/-/') === 0
						? imgSrc.substring(2)
						: `/-${imgSrc}`;
					onError = `onerror="this.src='${onErrorSrc}'; this.onerror=null;"`;
				}
				let qaItem = document.createElement('a');
					qaItem.setAttribute('href', qaItems[i].href);
					qaItem.setAttribute('title', qaItems[i].title);
					qaItem.innerHTML = `<img src="${imgSrc}" ${onError} height="32" style="vertical-align:middle">`;
				qaBar.appendChild(qaItem);
			}
		}
		this.styleSheet = `
		#QuickAccess {
			float: right;
			imageRendering: auto;
			imageRendering: -webkit-optimize-contrast;
		}
		#QuickAccess a {
			float: right;
			margin-left: 10px;
		}
		#QuickAccess img[src*=launchpadicons] {
			filter: invert(1) saturate(30) grayscale(1);
		}
		.sc-launchpad input[type=checkbox] {
			position: absolute;
			z-index: 1;
			top: 12px;
		}
		.sc-launchpad-item {
			grid-template-columns: 90px 1fr;
		}
		.sc-launchpad-item .icon {
			height: 78px;
			width: 78px;
			margin: 0;
		}
		.sc-launchpad-item .icon img {
			width: 48px;
			height: 48px;
			margin: 16px;
		}
		`;
		let checkboxes = [];
		let repositionTimeout;
		this.initExtraTiles = function() {
			let lastControlPanelTile = nullConditional(q('header.sc-launchpad-group-title'),
				q => q.filter(h => h.innerText.trim() == 'Control Panel'),
				f => f[0],
				n => n.parentNode.querySelectorAll('a.sc-launchpad-item'),
				a => Array.from(a).pop());

			if (lastControlPanelTile == null) {
				return;
			}

			let newTileParent = lastControlPanelTile.parentNode;

			if (newTileParent.classList.contains('sc-launchpad-group-row') &&
				newTileParent.querySelectorAll('a.sc-launchpad-item').length % 2 == 0) {
				let tileRow = document.createElement('div');
					tileRow.className = 'sc-launchpad-group-row';
				newTileParent.parentNode.appendChild(tileRow);
				newTileParent = tileRow;
			}

			let adminTile = lastControlPanelTile.cloneNode(true);
				adminTile.href = '/sitecore/admin';
				adminTile.title = 'Admin Tools';
				adminTile.querySelector('.sc-launchpad-text').innerText = 'Admin Tools';
			let adminIcon = adminTile.querySelector('img');
				adminIcon.alt = 'Admin Tools';
				adminIcon.src = colorizedIcons['Admin Tools'];

			newTileParent.appendChild(adminTile);
		}
		this.initCheckboxes = function(sc10) {
			let items = q('a.sc-launchpad-item');
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
					chck.onclick = setItemAsQuickAccess;
				item.parentNode.insertBefore(chck, item);
				checkboxes.push(chck);
				if (sc10) {
					let img = item.querySelector('img');
					img.setAttribute('data-nifty-src', img.getAttribute('src'));
					if (globalSettings['colorizeLaunchPadIcons'] && img.src.indexOf('launchpadicons') > -1) {
						img.src = colorizedIcons[item.getAttribute('title')];
					}
				}
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
			if (scVersion >= 10.1) {
				item['sc10imgsrc'] = this.nextElementSibling.querySelector('img').getAttribute('data-nifty-src');
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
			_this.render(scVersion >= 10.1);
		}
	})();

	var adminEnrichment = new (function() {
		this.init = function() {
			let buttonToClone = document.querySelector('.mat-card div:last-of-type');
			let kickUserButton = buttonToClone.cloneNode(true);
				kickUserButton.querySelector('a').href = '/sitecore/client/Applications/LicenseOptions/KickUser.aspx';
				kickUserButton.querySelector('a span').innerText = 'Kick User';
				kickUserButton.querySelector('p').innerText = 'View logged in users and kick them out';

			buttonToClone.parentElement.appendChild(kickUserButton);
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
			} else if (globalSettings['autoLangSwitch'] && curLang !== 'en' && templateId === '{AB86861A-6030-46C5-B394-E8F99E8B87DB}') { // Template
				showSpinner();
				openLangMenu('en', true)
					.then((nodes) => clickLang('en', !!nodes.length))
					.then(() => hideSpinner());
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

			GM_registerMenuCommand("Adjust nifty settings", showSettingsWindow, "a");
		}
		this.styleSheet = `
		#niftySettingsWindow {
			position: fixed;
			inset: 0;
			background: rgb(255 255 255 / .5);
			z-index: 800;
		}
		#niftySettingsWindow label {
			display: block;
		}
		#niftySettingsWindow button {
			margin-top: 2rem;
		}
		#niftySettingsWindow div {
			position: fixed;
			z-index: 900;
			inset: 30vh 30vw;
			padding: 3rem;
			background: #fff;
			border: 2px solid rgb(0 0 0 / 15%);
			box-shadow: 0px 3px 8px rgb(0 0 0 / 15%);
			border-radius: 10px;
		}
		#closeNiftySettings {
			cursor: pointer;
			position: absolute;
			top: 0px;
			right: 15px;
			font-weight: 900;
			font-size: 3rem;
		}
		`;

		function toggleStealth() {
			setSetting('niftyHeader', !settingsObj['niftyHeader']);
			//redrawFunc();
		}

		function showSettingsWindow() {
			let settingsWindow = document.createRange().createContextualFragment(`
			<div id="niftySettingsWindow">
				<div>
					<span id="closeNiftySettings">&times;</span>
					<label><input type="checkbox" id="niftyHeader" ${settingsObj['niftyHeader'] ? 'checked' : ''} /> Enable header color and info</label>
					<label><input type="checkbox" id="colorizeLaunchPadIcons" ${settingsObj['colorizeLaunchPadIcons'] ? 'checked' : ''} /> Use old (colorized) launchpad icons in Sitecore 10.1+</label>
					<label><input type="checkbox" id="addAdminTile" ${settingsObj['addAdminTile'] ? 'checked' : ''} /> Add launchpad tile to Admin Tools</label>
					<label><input type="checkbox" id="autoLangSwitch" ${settingsObj['autoLangSwitch'] ? 'checked' : ''} /> Automatically switch to language <strong>en</strong> when opening a template</label>
					<button id="saveNiftySettings">Save</button>
				</div>
			</div>
			`);

			document.body.appendChild(settingsWindow);
			document.querySelector('#closeNiftySettings').onclick = closeSettingsWindow;
			document.querySelector('#saveNiftySettings').onclick = function() {
				setSetting('niftyHeader', document.querySelector('#niftyHeader').checked);
				setSetting('colorizeLaunchPadIcons', document.querySelector('#colorizeLaunchPadIcons').checked);
				setSetting('addAdminTile', document.querySelector('#addAdminTile').checked);
				setSetting('autoLangSwitch', document.querySelector('#autoLangSwitch').checked);
				closeSettingsWindow();
			}
		}

		function closeSettingsWindow() {
			document.body.removeChild(document.querySelector('#niftySettingsWindow'));
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
			GM_getJson('NiftySettings').forEach(setting => obj[setting.key] = setting.value);

			setDefault(obj, 'niftyHeader', true);
			setDefault(obj, 'colorizeLaunchPadIcons', false);
			setDefault(obj, 'addAdminTile', false);
			setDefault(obj, 'autoLangSwitch', true);
		}

		function setDefault(obj, key, def) {
			if (!obj.hasOwnProperty(key)) {
				obj[key] = def;
			}
		}
	})();

	init();

	// Helper functions
    var langInterval;
	function openLangMenu(langTo, doAct) {
		let langLink = document.querySelector('.scEditorHeaderVersionsLanguage');
		return mop(function() {
			if (!doAct || langTo === document.querySelector('#scLanguage').value) {
				return true;
			}
			langInterval = setInterval(function() { langLink.click() }, 100);
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
			clearInterval(langInterval);
			document.querySelector('#Header_Language_Gallery').onload = function() {
				this.contentWindow.document.querySelector(`div.scMenuPanelItem[onclick*="language=${langTo}"]`).click();
			}
		},
		document.querySelector('#EditorFrames'),
		'.scEditorPanel',
		{attributes:false, childList: true, subtree: true});
	}
	function GM_getJson(key) {
		return JSON.parse(GM_getValue(key, '[]'));
	}
	function GM_setJson(key, value) {
		GM_setValue(key, JSON.stringify(value));
	}
	function GM_getDocument(url) {
		return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function(response)
                {
                    if (response.readyState !== 4) {
						return;
					}

					if (response.status === 200 || response.status === 304) {
						let doc = (new DOMParser()).parseFromString(response.responseText, 'text/html');
						resolve(doc);
					} else {
						reject(new Error(`${response.status} ${response.statusText}`));
					}
                }
            });
		});
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
		return !!location.pathname.match(new RegExp(regEsc(url), 'i'));
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