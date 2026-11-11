/*
 * One More Shot: web ad layer (provider-agnostic). The game calls, via JavaScriptBridge:
 *   OMS_ADS.insets()        -> {top, left, right, bottom, viewH} CSS px to keep clear (notch)
 *                              (the page's own OMS_PAGE.insets(); kept here for older shells)
 *   OMS_ADS.banner(on)      bottom banner may show (menus/lobby/results) or must hide (play)
 *   OMS_ADS.breakPoint(k)   'match_end' | 'menu': a full-screen ad MAY show here
 *   OMS_ADS.showing()       true while a full-screen ad is up (the game freezes)
 *
 * ---------------------------------------------------------------------------------
 * TO GO LIVE WITH GOOGLE ADS, fill in OMS_ADS_CONFIG below (nothing else changes):
 *   provider:          'adsense'
 *   adsenseClient:     your AdSense publisher ID, 'ca-pub-XXXXXXXXXXXXXXXX'
 *   adsenseBannerSlot: the numeric ad-unit ID of a 320x50 display unit for the banner
 *   adsenseTestMode:   true while testing (H5 Games Ads test ads), false when approved
 * Full-screen ads use Google's H5 Games Ads (adBreak / adConfig), which needs the site
 * approved for H5 Games Ads in your AdSense account. Until then keep provider 'none'
 * (no ads, no strip). 'test' shows labelled placeholders and only runs on localhost.
 *
 * Launch policy:
 *   - at most ONE full-screen ad per session (interstitialMaxPerSession),
 *   - never before the first finished match,
 *   - no banner unless `banner: true`.
 * The game decides WHEN a break is offered (after the player leaves a result, see
 * ads.gd); this file only decides whether one is due.
 * URL overrides for checking, honoured on localhost only: ?ads=none|test|adsense
 *   ?adbanner=1 (banner on)  ?adgap=0 (no minimum gap)  ?admax=N (ads per session)
 *   ?adnow=1 (no gap, no first-match rule: the next break shows one)
 * ---------------------------------------------------------------------------------
 */
window.OMS_ADS_CONFIG = Object.assign({
	provider: 'none',               // 'none' | 'test' (localhost only) | 'adsense'
	adsenseClient: '',              // 'ca-pub-XXXXXXXXXXXXXXXX'
	adsenseBannerSlot: '',          // e.g. '1234567890'
	adsenseTestMode: true,
	banner: false,                  // bottom banner on menus / lobby / results
	bannerHeight: 56,               // CSS px reserved at the bottom for a 320x50 banner
	interstitialMaxPerSession: 1,   // at most this many full-screen ads per session ...
	interstitialMinGapSec: 120,     // ... never closer together than this ...
	interstitialAfterMatches: 1,    // ... and none before the first finished match
}, window.OMS_ADS_CONFIG || {});

(function () {
	const cfg = window.OMS_ADS_CONFIG;
	// Placement overrides are a development aid: honoured on localhost only, so nobody
	// can switch ads on, off or into test mode on the live site with a query string.
	const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
	if (local) {
		const q = new URLSearchParams(window.location.search);
		if (q.has('ads')) cfg.provider = q.get('ads');
		if (q.has('adbanner')) cfg.banner = true;
		if (q.has('adgap')) cfg.interstitialMinGapSec = Number(q.get('adgap')) || 0;
		if (q.has('admax')) cfg.interstitialMaxPerSession = Number(q.get('admax')) || 0;
		if (q.has('adnow')) { cfg.interstitialMinGapSec = 0; cfg.interstitialAfterMatches = 0; }   // placement check
	}
	if (['none', 'test', 'adsense'].indexOf(cfg.provider) < 0) cfg.provider = 'none';
	if (cfg.provider === 'test' && !local) cfg.provider = 'none';                  // placeholders never ship
	if (cfg.provider === 'adsense' && !cfg.adsenseClient) cfg.provider = 'none';   // never run with a made-up ID
	const on = cfg.provider !== 'none';
	const bannerOn = on && !!cfg.banner;
	document.documentElement.style.setProperty('--oms-ad-h', (bannerOn ? cfg.bannerHeight : 0) + 'px');

	let showing = false;
	let matches = 0;
	let shown = 0;                    // full-screen ads shown this session
	let lastAd = performance.now();   // the cap also counts from the start of the session
	let bannerMade = false;

	if (cfg.provider === 'adsense') {
		const s = document.createElement('script');
		s.async = true;
		s.crossOrigin = 'anonymous';
		s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsenseClient);
		if (cfg.adsenseTestMode) s.setAttribute('data-adbreak-test', 'on');
		document.head.appendChild(s);
		window.adsbygoogle = window.adsbygoogle || [];
		window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
		window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
	}

	function $(id) { return document.getElementById(id); }

	function makeBanner() {
		const slot = $('ad-banner') && $('ad-banner').querySelector('.oms-ad-slot');
		if (!slot || bannerMade) return;
		bannerMade = true;
		if (cfg.provider === 'test') {
			slot.innerHTML = '<div class="oms-test-ad">AD \u00b7 TEST BANNER 320\u00d750</div>';
		} else if (cfg.provider === 'adsense' && cfg.adsenseBannerSlot) {
			slot.innerHTML = '<ins class="adsbygoogle" style="display:inline-block;width:320px;height:50px"' +
				' data-ad-client="' + cfg.adsenseClient + '" data-ad-slot="' + cfg.adsenseBannerSlot + '"></ins>';
			(window.adsbygoogle = window.adsbygoogle || []).push({});
		}
	}

	function testInterstitial() {
		const box = $('ad-interstitial');
		if (!box) return;
		showing = true;
		let left = 3;
		box.innerHTML = '<div class="oms-test-box"><div>AD</div><div>FULL-SCREEN TEST PLACEHOLDER</div></div>' +
			'<button disabled>CLOSE IN ' + left + '</button>';
		const btn = box.querySelector('button');
		box.classList.add('on');
		const t = setInterval(() => {
			left -= 1;
			if (left > 0) { btn.textContent = 'CLOSE IN ' + left; return; }
			clearInterval(t);
			btn.disabled = false;
			btn.textContent = 'CLOSE';
		}, 1000);
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			box.classList.remove('on');
			box.innerHTML = '';
			showing = false;
		});
	}

	// The canvas size and the safe-area insets are the page's own job (shell.html,
	// window.OMS_PAGE), so the game fills the screen even when this file is blocked.
	// Only a shell from before that still relies on the copies below.
	const page = window.OMS_PAGE || null;
	function fitCanvas() {
		if (page) { page.fitCanvas(); return; }
		const c = $('canvas');
		if (!c) return;
		const dpr = window.devicePixelRatio || 1;
		const strip = $('ad-banner') ? $('ad-banner').getBoundingClientRect().height : 0;
		const w = window.innerWidth;
		const h = Math.max(1, window.innerHeight - strip);
		c.style.position = 'absolute';
		c.style.left = '0px';
		c.style.top = '0px';
		c.style.width = w + 'px';
		c.style.height = h + 'px';
		const pw = Math.round(w * dpr);
		const ph = Math.round(h * dpr);
		if (c.width !== pw || c.height !== ph) {
			c.width = pw;
			c.height = ph;
		}
	}
	if (!page) {
		window.addEventListener('resize', fitCanvas);
		window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));
		if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCanvas);
		document.addEventListener('DOMContentLoaded', fitCanvas);
		setInterval(fitCanvas, 500);   // cheap safety net (browser UI bars sliding in and out)
	}
	fitCanvas();   // the banner strip's height was just set above

	window.OMS_ADS = {
		fitCanvas,
		insets() {
			if (page) return page.insets();
			const p = $('oms-safe-probe');
			const cs = p ? getComputedStyle(p) : null;
			const px = (v) => (cs ? parseFloat(cs[v]) || 0 : 0);
			return {
				top: px('paddingTop'), left: px('paddingLeft'), right: px('paddingRight'),
				bottom: 0,   // the banner strip and home bar are outside the canvas
				viewH: $('canvas') ? $('canvas').getBoundingClientRect().height : window.innerHeight,
			};
		},
		banner(visible) {
			if (!bannerOn) return;
			makeBanner();
			const b = $('ad-banner');
			if (b) b.classList.toggle('on', !!visible);
		},
		breakPoint(kind) {
			if (!on || showing) return;
			if (kind === 'match_end') matches += 1;
			if (shown >= cfg.interstitialMaxPerSession) return;
			if (matches < cfg.interstitialAfterMatches) return;
			const now = performance.now();
			if (now - lastAd < cfg.interstitialMinGapSec * 1000) return;
			lastAd = now;
			shown += 1;
			if (cfg.provider === 'test') {
				testInterstitial();
			} else if (cfg.provider === 'adsense') {
				window.adBreak({
					type: kind === 'menu' ? 'browse' : 'next',
					name: 'oms_' + kind,
					beforeAd() { showing = true; },
					afterAd() { showing = false; },
					adBreakDone() { showing = false; },
				});
			}
		},
		showing() { return showing; },
	};
}());
