const app = document.querySelector("#app");
const runtimeConfig = window.__GOOES_H5_CONFIG__ || {};
let h5SessionToken = "";
let miniProgramReturnPath = "";
let miniProgramReturnMethod = "navigateBack";

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  backgroundColor: "#f7f3ea",
  textColor: "#1f2933",
};

const FIELD_LABELS = {
  name: "姓名",
  phone: "手机号",
  community: "小区",
  city: "城市",
};
const IMAGE_VIEWER_SLIDE_GAP = 22;

function getApiBaseUrl() {
  if (runtimeConfig.apiBaseUrl) {
    return String(runtimeConfig.apiBaseUrl).replace(/\/+$/, "");
  }

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return location.origin;
}

function getSlugFromPath() {
  const match = location.pathname.match(/^\/p\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getH5TokenFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("token") || params.get("t") || "";
}

function decodeUrlParam(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getMiniProgramReturnPathFromUrl() {
  const params = new URLSearchParams(location.search);
  return decodeUrlParam(params.get("returnPath") || params.get("return_path") || params.get("miniPath") || "");
}

function getMiniProgramReturnMethodFromUrl() {
  const params = new URLSearchParams(location.search);
  const method = params.get("returnMethod") || params.get("return_method") || "";
  const allowedMethods = new Set(["navigateBack", "redirectTo", "navigateTo", "switchTab", "reLaunch"]);
  return allowedMethods.has(method) ? method : "navigateBack";
}

function stripH5TokenFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has("token") && !url.searchParams.has("t")) return;

  url.searchParams.delete("token");
  url.searchParams.delete("t");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildApiUrl(path) {
  return `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPhoneIcon() {
  return `
    <svg class="phone-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.8a2 2 0 0 1-.45 2.11L8.05 9.9a16 16 0 0 0 6.05 6.05l1.27-1.27a2 2 0 0 1 2.11-.45c.9.31 1.84.53 2.8.66A2 2 0 0 1 22 16.92Z" />
    </svg>
  `;
}

function normalizeBlocks(config) {
  return Array.isArray(config?.blocks) ? config.blocks : [];
}

function setTheme(theme = {}) {
  const merged = { ...DEFAULT_THEME, ...theme };
  document.documentElement.style.setProperty("--page-primary", merged.primaryColor);
  document.documentElement.style.setProperty("--page-bg", merged.backgroundColor);
  document.documentElement.style.setProperty("--page-text", merged.textColor);
}

function renderState(title, text, actionHtml = "") {
  app.innerHTML = `
    <section class="state">
      <div class="state-card">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(text)}</p>
        ${actionHtml}
      </div>
    </section>
  `;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getLeadCacheKey(slug) {
  return `gooes:h5:lead:${slug}`;
}

function readLeadCache(slug) {
  const cacheKey = getLeadCacheKey(slug);

  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data?.expiresAt || new Date(data.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return data;
  } catch {
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // Ignore cache cleanup failures in restricted web-view contexts.
    }
    return null;
  }
}

function writeLeadCache(slug, leadResult) {
  const submittedAt = new Date();
  const cache = {
    slug,
    leadId: leadResult?.lead_id || leadResult?.lead?.id || null,
    phoneTail: leadResult?.phone_tail || "",
    submittedAt: submittedAt.toISOString(),
    expiresAt: addHours(submittedAt, 24).toISOString(),
  };

  try {
    localStorage.setItem(getLeadCacheKey(slug), JSON.stringify(cache));
  } catch {
    // localStorage may be unavailable in restricted web-view contexts.
  }

  return cache;
}

async function requestJson(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `请求失败(${response.status})`);
  }

  return payload.data;
}

function trackEvent(slug, eventName, blockId, payload = {}) {
  return requestJson(`/public/marketing-pages/${encodeURIComponent(slug)}/events`, {
    method: "POST",
    body: JSON.stringify({
      event_name: eventName,
      block_id: blockId || null,
      payload,
      token: h5SessionToken || undefined,
    }),
  }).catch(() => null);
}

function waitForEvent(promise, timeoutMs = 300) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function isWeChatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent || "");
}

function getMiniProgramBridge() {
  return window.wx?.miniProgram || null;
}

function waitForMiniProgramBridge(timeoutMs = 1600) {
  const currentBridge = getMiniProgramBridge();
  if (currentBridge || !isWeChatBrowser()) {
    return Promise.resolve(currentBridge);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const bridge = getMiniProgramBridge();
      if (bridge || Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(bridge || null);
      }
    }, 80);
  });
}

function callMiniProgramRoute(method, payload = {}) {
  const miniProgram = getMiniProgramBridge();
  const route = miniProgram?.[method];
  if (typeof route !== "function") return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      route.call(miniProgram, {
        ...payload,
        success: () => finish(true),
        fail: () => finish(false),
      });

      window.setTimeout(() => finish(true), 700);
    } catch {
      finish(false);
    }
  });
}

async function returnToMiniProgram() {
  const bridge = await waitForMiniProgramBridge();
  if (bridge) {
    if (miniProgramReturnPath && miniProgramReturnMethod !== "navigateBack") {
      if (await callMiniProgramRoute(miniProgramReturnMethod, { url: miniProgramReturnPath })) {
        return true;
      }
    }

    if (await callMiniProgramRoute("navigateBack", { delta: 1 })) {
      return true;
    }
  }

  if (history.length > 1) {
    history.back();
    return true;
  }

  return false;
}

function createSection(block, className, innerHtml) {
  const section = document.createElement("section");
  section.className = `block ${className}`;
  section.dataset.blockId = block.id;
  section.innerHTML = innerHtml;
  return section;
}

function getActionLabel(action) {
  if (!action || typeof action !== "object") return "none";
  return action.type || "unknown";
}

function handleAction(slug, block, action) {
  trackEvent(slug, action?.type === "phone" ? "phone_click" : "button_click", block.id, {
    action: getActionLabel(action),
  });

  if (!action || typeof action !== "object") return;

  if (action.type === "scroll_to_form") {
    document.querySelector("[data-form-block='true']")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    return;
  }

  if (action.type === "anchor" && action.blockId) {
    document.querySelector(`[data-block-id='${CSS.escape(action.blockId)}']`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    return;
  }

  if (action.type === "phone" && action.phone) {
    location.href = `tel:${action.phone}`;
    return;
  }

  if (action.type === "link" && action.url) {
    location.href = action.url;
  }
}

function renderHero(block, slug) {
  const props = block.props || {};
  const title = props.title || "营销活动";
  const subtitle = props.subtitle || "";
  const imageUrl = props.imageUrl || props.image || "";
  const buttonText = props.buttonText || "";
  const node = createSection(block, "hero-block", `
    ${imageUrl ? `<img class="hero-image" src="${escapeHtml(imageUrl)}" alt="" />` : ""}
    <div class="hero-content">
      <p class="hero-kicker">${escapeHtml(props.kicker || "GOODCMS H5")}</p>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="hero-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      ${buttonText ? `<button class="primary-action" type="button">${escapeHtml(buttonText)}</button>` : ""}
    </div>
  `);

  node.querySelector("button")?.addEventListener("click", () => {
    handleAction(slug, block, props.buttonAction || { type: "scroll_to_form" });
  });

  return node;
}

function renderImage(block, slug) {
  const props = block.props || {};
  const imageUrl = props.imageUrl || props.image || "";
  const node = createSection(block, "image-block", `
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(props.alt || "")}" loading="lazy" />` : ""}
    ${props.caption ? `<p>${escapeHtml(props.caption)}</p>` : ""}
  `);

  if (props.action) {
    node.classList.add("is-clickable");
    node.addEventListener("click", () => handleAction(slug, block, props.action));
  }

  return node;
}

function renderText(block) {
  const props = block.props || {};
  const align = props.align === "center" || props.align === "right" ? props.align : "left";
  return createSection(block, `text-block align-${align}`, `
    ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : ""}
    ${props.content ? `<p>${escapeHtml(props.content)}</p>` : ""}
  `);
}

function renderButton(block, slug) {
  const props = block.props || {};
  const node = createSection(block, "button-block", `
    <button class="primary-action" type="button">${escapeHtml(props.text || "立即咨询")}</button>
  `);
  node.querySelector("button")?.addEventListener("click", () => {
    handleAction(slug, block, props.action || { type: "scroll_to_form" });
  });
  return node;
}

function renderImageText(block, slug) {
  const props = block.props || {};
  const imageUrl = props.imageUrl || props.image || "";
  const node = createSection(block, "image-text-block", `
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : ""}
    <div>
      ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : ""}
      ${props.content ? `<p>${escapeHtml(props.content)}</p>` : ""}
      ${props.buttonText ? `<button class="text-action" type="button">${escapeHtml(props.buttonText)}</button>` : ""}
    </div>
  `);

  node.querySelector("button")?.addEventListener("click", () => {
    handleAction(slug, block, props.buttonAction || props.action || { type: "scroll_to_form" });
  });

  return node;
}

function normalizeCaseImageUrls(item = {}) {
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  return Array.from(new Set([
    ...imageUrls,
    item.imageUrl || "",
  ].map((url) => String(url || "").trim()).filter(Boolean)));
}

let caseImageViewerState = null;

function closeCaseImageViewer() {
  if (!caseImageViewerState) return;

  caseImageViewerState.overlay.remove();
  document.removeEventListener("keydown", caseImageViewerState.onKeyDown);
  document.body.classList.remove("image-viewer-open");
  caseImageViewerState = null;
}

function openCaseImageViewer(images, initialIndex = 0) {
  if (!Array.isArray(images) || images.length === 0) return;
  closeCaseImageViewer();

  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  overlay.innerHTML = `
    <button class="image-viewer__close" type="button" aria-label="关闭图片浏览">×</button>
    <button class="image-viewer__nav image-viewer__nav--prev" type="button" aria-label="上一张图片">‹</button>
    <div class="image-viewer__viewport">
      <div class="image-viewer__track">
        <div class="image-viewer__slide"><img alt="" /></div>
        <div class="image-viewer__slide"><img alt="" /></div>
        <div class="image-viewer__slide"><img alt="" /></div>
      </div>
    </div>
    <button class="image-viewer__nav image-viewer__nav--next" type="button" aria-label="下一张图片">›</button>
    <span class="image-viewer__count"></span>
  `;

  const viewport = overlay.querySelector(".image-viewer__viewport");
  const track = overlay.querySelector(".image-viewer__track");
  const slideImages = Array.from(overlay.querySelectorAll(".image-viewer__slide img"));
  const count = overlay.querySelector(".image-viewer__count");
  const prevButton = overlay.querySelector(".image-viewer__nav--prev");
  const nextButton = overlay.querySelector(".image-viewer__nav--next");
  let currentIndex = Math.min(Math.max(initialIndex, 0), images.length - 1);
  let touchStartX = null;
  let touchDeltaX = 0;
  let isAnimating = false;

  const getImageAt = (index) => images[index] || "";
  const canSwitchImage = (direction) => (
    images.length > 1
    && !isAnimating
    && currentIndex + direction >= 0
    && currentIndex + direction < images.length
  );

  const setTrackOffset = (offset, animated) => {
    track.style.transition = animated
      ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    track.style.transform = `translate3d(calc(-100% - ${IMAGE_VIEWER_SLIDE_GAP}px + ${offset}px), 0, 0)`;
  };

  const renderSlides = () => {
    const slideSources = [
      getImageAt(currentIndex - 1),
      getImageAt(currentIndex),
      getImageAt(currentIndex + 1),
    ];

    slideImages.forEach((image, index) => {
      image.setAttribute("src", slideSources[index] || "");
    });
  };

  const render = () => {
    renderSlides();
    count.textContent = `${currentIndex + 1}/${images.length}`;
    const hasMultipleImages = images.length > 1;
    prevButton.hidden = !hasMultipleImages || currentIndex <= 0;
    nextButton.hidden = !hasMultipleImages || currentIndex >= images.length - 1;
    count.hidden = !hasMultipleImages;
    setTrackOffset(0, false);
  };

  const switchImage = (direction) => {
    if (!canSwitchImage(direction)) {
      setTrackOffset(0, true);
      return;
    }

    isAnimating = true;
    const width = (viewport.clientWidth || window.innerWidth) + IMAGE_VIEWER_SLIDE_GAP;
    setTrackOffset(direction > 0 ? -width : width, true);

    window.setTimeout(() => {
      currentIndex += direction;
      isAnimating = false;
      render();
    }, 270);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      closeCaseImageViewer();
      return;
    }

    if (event.key === "ArrowLeft") {
      switchImage(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      switchImage(1);
    }
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeCaseImageViewer();
    }
  });
  overlay.querySelector(".image-viewer__close")?.addEventListener("click", closeCaseImageViewer);
  prevButton?.addEventListener("click", () => switchImage(-1));
  nextButton?.addEventListener("click", () => switchImage(1));
  overlay.addEventListener("touchstart", (event) => {
    if (images.length <= 1 || isAnimating) return;
    touchStartX = event.touches[0]?.clientX ?? null;
    touchDeltaX = 0;
    setTrackOffset(0, false);
  }, { passive: true });
  overlay.addEventListener("touchmove", (event) => {
    if (touchStartX === null || images.length <= 1 || isAnimating) return;

    const currentX = event.touches[0]?.clientX ?? touchStartX;
    touchDeltaX = currentX - touchStartX;
    setTrackOffset(touchDeltaX, false);
    event.preventDefault();
  }, { passive: false });
  overlay.addEventListener("touchend", (event) => {
    if (touchStartX === null || images.length <= 1) {
      touchStartX = null;
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = touchDeltaX || touchEndX - touchStartX;
    touchStartX = null;
    touchDeltaX = 0;
    if (Math.abs(deltaX) < 40) {
      setTrackOffset(0, true);
      return;
    }

    const direction = deltaX < 0 ? 1 : -1;
    if (!canSwitchImage(direction)) {
      setTrackOffset(0, true);
      return;
    }

    switchImage(direction);
  }, { passive: true });
  overlay.addEventListener("touchcancel", () => {
    touchStartX = null;
    touchDeltaX = 0;
    setTrackOffset(0, true);
  }, { passive: true });

  caseImageViewerState = { overlay, onKeyDown };
  document.body.appendChild(overlay);
  document.body.classList.add("image-viewer-open");
  document.addEventListener("keydown", onKeyDown);
  render();
}

function renderCaseList(block) {
  const props = block.props || {};
  const cases = Array.isArray(props.items) ? props.items : [];
  const caseImageSets = cases.map(normalizeCaseImageUrls);
  const itemsHtml = cases.map((item, index) => {
    const imageUrls = caseImageSets[index] || [];

    return `
    <article class="case-card" data-case-index="${index}">
      <div class="case-image-stage" ${imageUrls[0] ? `data-case-image-open="true" role="button" tabindex="0"` : ""}>
        ${imageUrls[0] ? `<img src="${escapeHtml(imageUrls[0])}" alt="" loading="lazy" data-case-image="true" />` : ""}
        ${imageUrls.length > 1 ? `
          <span class="case-image-count" data-case-image-count="true">1/${imageUrls.length}</span>
        ` : ""}
      </div>
      <div>
        <h3>${escapeHtml(item.title || "装修案例")}</h3>
        ${item.subtitle ? `<p>${escapeHtml(item.subtitle)}</p>` : ""}
      </div>
    </article>
  `;
  }).join("");

  const node = createSection(block, "case-list-block", `
    ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : ""}
    <div class="case-list">${itemsHtml || "<p class='muted'>暂无案例</p>"}</div>
  `);

  node.querySelectorAll("[data-case-image-open='true']").forEach((stage) => {
    const openViewer = () => {
      const card = stage.closest("[data-case-index]");
      const caseIndex = Number(card?.dataset.caseIndex);
      const images = Number.isInteger(caseIndex) ? caseImageSets[caseIndex] || [] : [];
      openCaseImageViewer(images, 0);
    };

    stage.addEventListener("click", openViewer);
    stage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      openViewer();
    });
  });

  return node;
}

function renderCountdown(block) {
  const props = block.props || {};
  const node = createSection(block, "countdown-block", `
    ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : ""}
    <div class="countdown-grid" aria-live="polite">
      <span><strong data-unit="days">0</strong><em>天</em></span>
      <span><strong data-unit="hours">0</strong><em>时</em></span>
      <span><strong data-unit="minutes">0</strong><em>分</em></span>
      <span><strong data-unit="seconds">0</strong><em>秒</em></span>
    </div>
  `);
  const target = new Date(props.endAt || props.end_at || Date.now()).getTime();

  const update = () => {
    const diff = Math.max(0, target - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    node.querySelector("[data-unit='days']").textContent = String(days);
    node.querySelector("[data-unit='hours']").textContent = String(hours).padStart(2, "0");
    node.querySelector("[data-unit='minutes']").textContent = String(minutes).padStart(2, "0");
    node.querySelector("[data-unit='seconds']").textContent = String(seconds).padStart(2, "0");
  };

  update();
  const timer = setInterval(update, 1000);
  node.addEventListener("DOMNodeRemoved", () => clearInterval(timer), { once: true });
  return node;
}

function normalizeLeadFormFields(value) {
  const rawFields = Array.isArray(value) && value.length
    ? value
    : ["name", "phone", "community"];
  const fields = rawFields
    .map((field) => String(field || "").trim())
    .filter(Boolean);

  if (!fields.includes("phone")) {
    fields.splice(Math.min(fields.length, 1), 0, "phone");
  }

  return Array.from(new Set(fields));
}

function renderLeadForm(block, slug) {
  const props = block.props || {};
  const fields = normalizeLeadFormFields(props.fields);
  const cachedLead = readLeadCache(slug);
  let isSubmitting = false;
  let isSubmitted = Boolean(cachedLead);
  const node = createSection(block, "lead-form-block", `
    <form data-form-block="true" novalidate>
      ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : "<h2>预约咨询</h2>"}
      ${props.description ? `<p class="form-desc">${escapeHtml(props.description)}</p>` : ""}
      <div class="lead-success ${cachedLead ? "" : "is-hidden"}" data-lead-success="true" ${cachedLead ? "" : "hidden"} role="status">
        <h3>${escapeHtml(props.successTitle || "预约已提交")}</h3>
        <p>${escapeHtml(props.successText || "顾问会尽快与您联系，请保持电话畅通")}</p>
        <p class="lead-success__phone" data-lead-phone>${cachedLead?.phoneTail ? `已提交手机号：****${escapeHtml(cachedLead.phoneTail)}` : ""}</p>
        <div class="lead-success__actions">
          <button class="secondary-action" type="button" data-return-mini-program="true">返回小程序</button>
          <button class="secondary-action" type="button" data-continue-browsing="true">继续浏览活动</button>
          <button class="text-action" type="button" data-edit-lead="true">修改信息</button>
        </div>
      </div>
      <div class="lead-form-content ${cachedLead ? "is-hidden" : ""}" data-lead-form-content="true" ${cachedLead ? "hidden" : ""}>
      <div class="form-fields">
        ${fields.map((field) => `
          <label>
            <span>${escapeHtml(FIELD_LABELS[field] || field)}</span>
            <input name="${escapeHtml(field)}" inputmode="${field === "phone" ? "tel" : "text"}" ${field === "phone" ? "maxlength='11'" : ""} />
          </label>
        `).join("")}
      </div>
      <button class="primary-action" type="submit">${escapeHtml(props.submitText || "提交预约")}</button>
      <p class="form-message" role="status"></p>
      </div>
    </form>
  `);

  const form = node.querySelector("form");
  const successPanel = node.querySelector("[data-lead-success='true']");
  const formContent = node.querySelector("[data-lead-form-content='true']");
  const phoneText = node.querySelector("[data-lead-phone]");
  const submitButton = node.querySelector("button[type='submit']");

  const setFormControlsDisabled = (disabled) => {
    formContent.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = disabled;
    });
  };

  const showSuccess = (leadResult = {}, cache = null) => {
    const phoneTail = leadResult.phone_tail || cache?.phoneTail || "";
    isSubmitted = true;
    phoneText.textContent = phoneTail ? `已提交手机号：****${phoneTail}` : "";
    successPanel.hidden = false;
    formContent.hidden = true;
    successPanel.classList.remove("is-hidden");
    formContent.classList.add("is-hidden");
    setFormControlsDisabled(true);
  };

  const showForm = () => {
    isSubmitted = false;
    successPanel.hidden = true;
    formContent.hidden = false;
    successPanel.classList.add("is-hidden");
    formContent.classList.remove("is-hidden");
    setFormControlsDisabled(false);
    if (submitButton) {
      submitButton.disabled = false;
    }
  };

  node.querySelector("[data-return-mini-program='true']")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "返回中...";
    await waitForEvent(trackEvent(slug, "button_click", block.id, { action: "return_miniprogram_click" }));
    const returned = await returnToMiniProgram();
    if (!returned) {
      button.textContent = "关闭页面后查看";
      button.disabled = true;
      return;
    }
    button.textContent = originalText;
    window.setTimeout(() => {
      if (document.hidden) return;
      button.disabled = false;
    }, 1200);
  });

  node.querySelector("[data-continue-browsing='true']")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  node.querySelector("[data-edit-lead='true']")?.addEventListener("click", () => {
    showForm();
  });

  if (cachedLead) {
    setFormControlsDisabled(true);
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const message = form.querySelector(".form-message");
    const formData = Object.fromEntries(new FormData(form).entries());
    const phone = String(formData.phone || "").trim();
    formData.phone = phone;

    if (isSubmitting || isSubmitted) {
      if (isSubmitted) {
        showSuccess({}, readLeadCache(slug));
      }
      return;
    }

    if (!phone) {
      message.textContent = "请输入有效的手机号";
      message.className = "form-message is-error";
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      message.textContent = "请输入有效的手机号";
      message.className = "form-message is-error";
      return;
    }

    isSubmitting = true;
    button.disabled = true;
    message.textContent = "提交中...";
    message.className = "form-message";

    try {
      trackEvent(slug, "form_submit", block.id, { phase: "submit" });
      const leadResult = await requestJson(`/public/marketing-pages/${encodeURIComponent(slug)}/leads`, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name || null,
          phone,
          community: formData.community || null,
          city: formData.city || null,
          form_data: formData,
          token: h5SessionToken || undefined,
        }),
      });
      trackEvent(slug, "form_submit", block.id, {
        phase: "success",
        lead_id: leadResult?.lead_id || null,
        already_submitted: Boolean(leadResult?.already_submitted),
      });
      const cache = writeLeadCache(slug, leadResult);
      form.reset();
      message.textContent = leadResult?.message || props.successText || "预约已提交";
      message.className = "form-message is-success";
      showSuccess(leadResult, cache);
    } catch (error) {
      message.textContent = error.message || "提交失败，请稍后重试";
      message.className = "form-message is-error";
    } finally {
      isSubmitting = false;
      button.disabled = isSubmitted;
    }
  });

  return node;
}

function renderPhoneCta(block, slug) {
  const props = block.props || {};
  const phone = props.phone || "";
  const node = createSection(block, "phone-cta-block", `
    <button class="secondary-action phone-cta-button" type="button">
      <span class="phone-cta-label">${renderPhoneIcon()}<span>${escapeHtml(props.text || "电话咨询")}</span></span>
      ${phone ? `<strong>${escapeHtml(phone)}</strong>` : ""}
    </button>
  `);
  node.querySelector("button")?.addEventListener("click", () => {
    handleAction(slug, block, { type: "phone", phone });
  });
  return node;
}

function renderFloatingPhoneCta(block, slug) {
  const props = block.props || {};
  const phone = props.phone || "";
  const side = props.side === "left" ? "left" : "right";
  const bottom = Number.isFinite(Number(props.bottom))
    ? Math.min(Math.max(Number(props.bottom), 24), 520)
    : 96;
  const node = createSection(block, "floating-phone-cta-block", `
    <button class="floating-phone-cta" type="button">
      ${renderPhoneIcon()}
      <span>${escapeHtml(props.text || "电话咨询")}</span>
    </button>
  `);
  node.classList.add(`is-${side}`);
  node.style.setProperty("--floating-phone-bottom", `${bottom}px`);
  node.querySelector("button")?.addEventListener("click", () => {
    handleAction(slug, block, { type: "phone", phone });
  });
  return node;
}

function renderFooter(block) {
  const props = block.props || {};
  return createSection(block, "footer-block", `
    ${props.logo ? `<img src="${escapeHtml(props.logo)}" alt="" loading="lazy" />` : ""}
    <p>${escapeHtml(props.text || "GoodCMS")}</p>
  `);
}

function renderUnknown(block) {
  return createSection(block, "unknown-block", `
    <p>暂不支持的模块：${escapeHtml(block.type)}</p>
  `);
}

const renderers = {
  hero: renderHero,
  image: renderImage,
  text: renderText,
  button: renderButton,
  image_text: renderImageText,
  case_list: renderCaseList,
  countdown: renderCountdown,
  lead_form: renderLeadForm,
  phone_cta: renderPhoneCta,
  floating_phone_cta: renderFloatingPhoneCta,
  footer: renderFooter,
};

function renderPage(slug, response) {
  const config = response.config || response.version?.config || {};
  const page = response.page || {};
  const blocks = normalizeBlocks(config);
  setTheme(config.theme);
  document.title = config.title || page.title || "活动页";

  const root = document.createElement("div");
  root.className = "marketing-page";

  if (!blocks.length) {
    root.innerHTML = `
      <section class="state">
        <div class="state-card">
          <h1>${escapeHtml(page.title || "活动页")}</h1>
          <p>页面已发布，但还没有配置内容。</p>
        </div>
      </section>
    `;
  } else {
    blocks.forEach((block) => {
      const renderer = renderers[block.type] || renderUnknown;
      root.appendChild(renderer(block, slug));
    });
  }

  app.replaceChildren(root);
}

async function boot() {
  const slug = getSlugFromPath();
  if (!slug) {
    renderState("页面地址无效", "请使用 /p/活动路径 访问 H5 页面。");
    return;
  }

  h5SessionToken = getH5TokenFromUrl();
  miniProgramReturnPath = getMiniProgramReturnPathFromUrl();
  miniProgramReturnMethod = getMiniProgramReturnMethodFromUrl();
  if (h5SessionToken) {
    stripH5TokenFromUrl();
  }

  try {
    const data = await requestJson(`/public/marketing-pages/${encodeURIComponent(slug)}`);
    renderPage(slug, data);
    trackEvent(slug, "page_view", null, {
      path: location.pathname,
      referrer: document.referrer || null,
    });
  } catch (error) {
    renderState("页面暂不可访问", error.message || "活动页不存在或尚未发布。");
  }
}

boot();
