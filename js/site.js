/* Works when opened directly from disk; no network or external libraries. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // Open local news details as closable child windows and preserve the source page.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest('a');
    if (!link) return;
    if (link.closest('.news-detail-back')) {
      if (window.opener || window.name.indexOf('jiang-news-detail-') === 0) {
        event.preventDefault();
        try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (error) { /* The source window may have navigated away. */ }
        window.close();
        window.setTimeout(function () { if (!window.closed) window.location.assign(link.href); }, 150);
      }
      return;
    }
    var destination = new URL(link.href, window.location.href);
    if (link.target !== '_blank' || !link.closest('.home-news, .news-card') || !/\/pages\/news\/[^/]+\.html$/i.test(destination.pathname)) return;
    var child = window.open(destination.href, 'jiang-news-detail-' + Date.now());
    if (child) event.preventDefault();
  });

  var pageHeader = document.querySelector('.site-header');
  if (pageHeader) {
    var topButton = document.createElement('button');
    topButton.type = 'button';
    topButton.className = 'back-to-top';
    topButton.textContent = '顶部';
    topButton.title = '返回顶部';
    topButton.setAttribute('aria-label', '返回页面顶部');
    topButton.hidden = true;
    document.body.appendChild(topButton);
    var bottomButton = document.createElement('button');
    bottomButton.type = 'button';
    bottomButton.className = 'back-to-top back-to-bottom';
    bottomButton.textContent = '底部';
    bottomButton.title = '前往页面底部';
    bottomButton.setAttribute('aria-label', '滚动到页面底部');
    bottomButton.hidden = true;
    document.body.appendChild(bottomButton);

    function updateTopButton() {
      topButton.hidden = pageHeader.getBoundingClientRect().bottom > 0;
      bottomButton.hidden = topButton.hidden;
    }
    window.addEventListener('scroll', updateTopButton, { passive: true });
    window.addEventListener('resize', updateTopButton);
    window.addEventListener('pageshow', updateTopButton);
    updateTopButton();

    var topFrame = null;
    function stopTopScroll() {
      if (topFrame !== null) window.cancelAnimationFrame(topFrame);
      topFrame = null;
      window.removeEventListener('wheel', stopTopScroll);
      window.removeEventListener('touchstart', stopTopScroll);
      window.removeEventListener('keydown', stopTopScrollOnKey);
    }
    function stopTopScrollOnKey(event) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(event.key) !== -1) stopTopScroll();
    }
    function scrollToEdge(targetY) {
      stopTopScroll();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.scrollTo(0, targetY);
        updateTopButton();
        return;
      }
      var startY = window.scrollY;
      var startedAt = null;
      window.addEventListener('wheel', stopTopScroll, { passive: true });
      window.addEventListener('touchstart', stopTopScroll, { passive: true });
      window.addEventListener('keydown', stopTopScrollOnKey);
      function returnToTop(timestamp) {
        if (startedAt === null) startedAt = timestamp;
        var progress = Math.min((timestamp - startedAt) / 900, 1);
        // Quadratic easing accelerates the movement from slow to fast.
        window.scrollTo(0, startY + (targetY - startY) * progress * progress);
        updateTopButton();
        if (progress < 1) topFrame = window.requestAnimationFrame(returnToTop);
        else stopTopScroll();
      }
      topFrame = window.requestAnimationFrame(returnToTop);
    }
    topButton.addEventListener('click', function () { scrollToEdge(0); });
    bottomButton.addEventListener('click', function () {
      scrollToEdge(Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
    });
  }

  document.querySelectorAll('.home-llps .cta a').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      var destination = new URL(link.href);
      var sectionId = destination.hash.slice(1);
      if (sectionId !== 'llps-basics' && sectionId !== 'llps-research') return;
      destination.searchParams.set('scrollTo', sectionId);
      destination.hash = '';
      event.preventDefault();
      window.location.assign(destination.href);
    });
  });

  if (document.body.classList.contains('site-page-research')) {
    var researchUrl = new URL(window.location.href);
    var requestedSection = researchUrl.searchParams.get('scrollTo');
    if (requestedSection === 'llps-basics' || requestedSection === 'llps-research') {
      var scrollTarget = document.getElementById(requestedSection);
      if (scrollTarget) {
        // Load the diagrams before scrolling so their heights do not move the target.
        document.querySelectorAll('.llps-page img').forEach(function (img) { img.loading = 'eager'; });
        function revealResearchSection() {
          window.scrollTo(0, 0);
          var targetY = Math.min(
            scrollTarget.getBoundingClientRect().top + window.scrollY,
            Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          );
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            window.scrollTo(0, targetY);
          } else {
            var startedAt = null;
            var cancelled = false;
            function cancelScroll() { cancelled = true; }
            window.addEventListener('wheel', cancelScroll, { passive: true });
            window.addEventListener('touchstart', cancelScroll, { passive: true });
            window.addEventListener('keydown', cancelScroll);
            function animateScroll(timestamp) {
              if (startedAt === null) startedAt = timestamp;
              var progress = Math.min((timestamp - startedAt) / 900, 1);
              var eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
              if (!cancelled) window.scrollTo(0, targetY * eased);
              if (!cancelled && progress < 1) window.requestAnimationFrame(animateScroll);
              else {
                window.removeEventListener('wheel', cancelScroll);
                window.removeEventListener('touchstart', cancelScroll);
                window.removeEventListener('keydown', cancelScroll);
              }
            }
            window.requestAnimationFrame(animateScroll);
          }
          researchUrl.searchParams.delete('scrollTo');
          researchUrl.hash = requestedSection;
          try { window.history.replaceState(window.history.state, '', researchUrl.href); }
          catch (error) { /* Some local file browsers restrict history changes. */ }
        }
        if (document.readyState === 'complete') revealResearchSection();
        else window.addEventListener('load', revealResearchSection, { once: true });
      }
    }

    var bridgeActions = document.querySelector('.llps-bridge-actions');
    if (bridgeActions) {
      var bridgeFrame = null;
      var bridgeCancelled = false;
      function stopBridgeScroll() {
        bridgeCancelled = true;
        if (bridgeFrame !== null) window.cancelAnimationFrame(bridgeFrame);
        bridgeFrame = null;
        window.removeEventListener('wheel', stopBridgeScroll);
        window.removeEventListener('touchstart', stopBridgeScroll);
        window.removeEventListener('keydown', stopBridgeScroll);
      }
      function scrollBridgeTo(targetY, complete) {
        stopBridgeScroll();
        bridgeCancelled = false;
        targetY = Math.max(0, Math.min(targetY, document.documentElement.scrollHeight - window.innerHeight));
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(window.scrollY - targetY) < 2) {
          window.scrollTo(0, targetY);
          complete();
          return;
        }
        var startY = window.scrollY;
        var startedAt = null;
        window.addEventListener('wheel', stopBridgeScroll, { passive: true });
        window.addEventListener('touchstart', stopBridgeScroll, { passive: true });
        window.addEventListener('keydown', stopBridgeScroll);
        function move(timestamp) {
          if (bridgeCancelled) return;
          if (startedAt === null) startedAt = timestamp;
          var progress = Math.min((timestamp - startedAt) / 900, 1);
          var eased = progress * progress;
          window.scrollTo(0, startY + (targetY - startY) * eased);
          if (progress < 1) bridgeFrame = window.requestAnimationFrame(move);
          else {
            bridgeFrame = null;
            window.removeEventListener('wheel', stopBridgeScroll);
            window.removeEventListener('touchstart', stopBridgeScroll);
            window.removeEventListener('keydown', stopBridgeScroll);
            complete();
          }
        }
        bridgeFrame = window.requestAnimationFrame(move);
      }
      var contactAction = bridgeActions.querySelector('.btn-a');
      var basicsAction = bridgeActions.querySelector('.btn-b');
      if (contactAction) contactAction.addEventListener('click', function (event) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        var destination = contactAction.href;
        scrollBridgeTo(0, function () {
          var navContact = document.querySelector('.site-nav a[href$="contact.html"]');
          if (navContact) navContact.click();
          else window.location.assign(destination);
        });
      });
      if (basicsAction) basicsAction.addEventListener('click', function (event) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        var basics = document.getElementById('llps-basics');
        if (!basics) return;
        var targetY = basics.getBoundingClientRect().top + window.scrollY;
        scrollBridgeTo(targetY, function () {
          try { window.history.replaceState(window.history.state, '', '#llps-basics'); }
          catch (error) { /* Local file browsers may restrict history updates. */ }
        });
      });
    }
  }

  var nav = document.getElementById('site-nav');
  if (nav && (document.body.classList.contains('site-page-intro') || document.body.classList.contains('site-page-focus-detail'))) {
    var homeItem = nav.querySelector('.nav-list > li');
    if (homeItem) homeItem.classList.add('active');
  }
  var menuToggle = document.querySelector('.menu-toggle');
  var mobileQuery = window.matchMedia('(max-width: 1090px)');
  var submenuItems = nav ? Array.from(nav.querySelectorAll('.has-submenu')) : [];

  function setSubmenu(item, expanded) {
    item.classList.toggle('is-open', expanded);
    var button = item.querySelector('.submenu-toggle');
    if (button) button.setAttribute('aria-expanded', String(expanded));
  }

  function closeSubmenus(except) {
    submenuItems.forEach(function (item) {
      if (item !== except) setSubmenu(item, false);
    });
  }

  function setMenu(expanded) {
    if (!nav || !menuToggle) return;
    nav.classList.toggle('is-open', expanded);
    menuToggle.setAttribute('aria-expanded', String(expanded));
    if (!expanded) closeSubmenus();
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
    });
  }

  submenuItems.forEach(function (item, index) {
    var button = item.querySelector('.submenu-toggle');
    var submenu = item.querySelector('.submenu');
    if (!button || !submenu) return;
    if (!submenu.id) submenu.id = 'submenu-' + (index + 1);
    button.setAttribute('aria-controls', submenu.id);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function () {
      var expanded = button.getAttribute('aria-expanded') !== 'true';
      closeSubmenus(item);
      setSubmenu(item, expanded);
    });
    item.addEventListener('pointerenter', function (event) {
      if (mobileQuery.matches || event.pointerType !== 'mouse') return;
      closeSubmenus(item);
      setSubmenu(item, true);
    });
    item.addEventListener('pointerleave', function () {
      if (!mobileQuery.matches && !item.contains(document.activeElement)) setSubmenu(item, false);
    });
    item.addEventListener('focusin', function () {
      if (!mobileQuery.matches) {
        closeSubmenus(item);
        setSubmenu(item, true);
      }
    });
    item.addEventListener('focusout', function (event) {
      if (!item.contains(event.relatedTarget)) setSubmenu(item, false);
    });
    item.addEventListener('keydown', function (event) {
      var links = Array.from(submenu.querySelectorAll('a'));
      var linkIndex = links.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        button.focus();
        setSubmenu(item, false);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!links.length) return;
        event.preventDefault();
        closeSubmenus(item);
        setSubmenu(item, true);
        var next = event.key === 'ArrowDown' ? linkIndex + 1 : (linkIndex < 0 ? links.length - 1 : linkIndex - 1);
        links[(next + links.length) % links.length].focus();
      } else if (linkIndex >= 0 && (event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        links[event.key === 'Home' ? 0 : links.length - 1].focus();
      }
    });
  });

  document.addEventListener('click', function (event) {
    if (nav && !nav.contains(event.target) && (!menuToggle || !menuToggle.contains(event.target))) {
      closeSubmenus();
      if (mobileQuery.matches) setMenu(false);
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    closeSubmenus();
    if (nav && mobileQuery.matches && nav.classList.contains('is-open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });
  function handleResize() { setMenu(false); }
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleResize);
  else if (mobileQuery.addListener) mobileQuery.addListener(handleResize);

  document.querySelectorAll('.hero-carousel').forEach(function (carousel) {
    var slides = Array.from(carousel.querySelectorAll('.hero-slide'));
    if (!slides.length) return;
    var previous = carousel.querySelector('.carousel-prev');
    var next = carousel.querySelector('.carousel-next');
    var pause = carousel.querySelector('.carousel-pause');
    var count = carousel.querySelector('.carousel-count');
    var pageButtons = Array.from(carousel.querySelectorAll('.carousel-page'));
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var active = 0;
    var slideAnimations = [];
    var userPaused = motionQuery.matches;
    var pointerPaused = false;
    var focusPaused = false;
    var timer = null;

    carousel.classList.add('is-ready');
    carousel.setAttribute('role', 'region');
    carousel.setAttribute('aria-roledescription', 'carousel');
    if (!carousel.getAttribute('aria-label')) carousel.setAttribute('aria-label', 'Research highlights');
    slides.forEach(function (slide, index) {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', (index + 1) + ' of ' + slides.length);
    });

    function schedule() {
      window.clearTimeout(timer);
      timer = null;
      if (slides.length < 2 || userPaused || pointerPaused || focusPaused || document.hidden) return;
      timer = window.setTimeout(function () { show(active + 1, false); }, 3250);
    }

    function updatePause() {
      if (!pause) return;
      pause.textContent = userPaused ? 'Play slideshow' : 'Pause slideshow';
      pause.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
    }

    function show(index, manual) {
      var previousActive = active;
      slideAnimations.forEach(function (animation) { animation.cancel(); });
      slideAnimations = [];
      active = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        var selected = slideIndex === active;
        slide.hidden = false;
        slide.classList.toggle('is-active', selected);
        slide.setAttribute('aria-hidden', String(!selected));
        slide.inert = !selected;
      });
      if (active !== previousActive && !motionQuery.matches && typeof slides[active].animate === 'function') {
        var slideTiming = { duration: 500, easing: 'ease-in-out' };
        slideAnimations.push(slides[previousActive].animate([
          { transform: 'translateX(0)', opacity: 1 },
          { transform: 'translateX(-100%)', opacity: 0 }
        ], slideTiming));
        slideAnimations.push(slides[active].animate([
          { transform: 'translateX(100%)', opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 }
        ], slideTiming));
      }
      pageButtons.forEach(function (button, buttonIndex) {
        var selected = buttonIndex === active;
        button.classList.toggle('is-active', selected);
        if (selected) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
      if (count) {
        count.setAttribute('aria-live', manual ? 'polite' : 'off');
        count.textContent = (active + 1) + ' / ' + slides.length;
      }
      schedule();
    }

    if (previous) previous.addEventListener('click', function () { show(active - 1, true); });
    if (next) next.addEventListener('click', function () { show(active + 1, true); });
    pageButtons.forEach(function (button) {
      button.addEventListener('click', function () { show(Number(button.getAttribute('data-slide')), true); });
    });
    if (pause) pause.addEventListener('click', function () {
      userPaused = !userPaused;
      updatePause();
      schedule();
    });
    carousel.addEventListener('mouseenter', function () { pointerPaused = true; schedule(); });
    carousel.addEventListener('mouseleave', function () { pointerPaused = false; schedule(); });
    carousel.addEventListener('focusin', function () { focusPaused = true; schedule(); });
    carousel.addEventListener('focusout', function (event) {
      if (!carousel.contains(event.relatedTarget)) { focusPaused = false; schedule(); }
    });
    carousel.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(active + (event.key === 'ArrowRight' ? 1 : -1), true);
    });
    document.addEventListener('visibilitychange', schedule);
    function handleMotionPreference() {
      if (motionQuery.matches) userPaused = true;
      updatePause();
      schedule();
    }
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', handleMotionPreference);
    else if (motionQuery.addListener) motionQuery.addListener(handleMotionPreference);
    if (slides.length < 2) {
      var controls = carousel.querySelector('.carousel-controls');
      if (controls) controls.hidden = true;
    }
    updatePause();
    show(0, false);
  });
}());
