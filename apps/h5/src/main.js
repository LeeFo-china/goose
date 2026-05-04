const app = document.querySelector("#app");
const runtimeConfig = window.__GOOES_H5_CONFIG__ || {};

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

function getApiBaseUrl() {
  if (runtimeConfig.apiBaseUrl) {
    return String(runtimeConfig.apiBaseUrl).replace(/\/+$/, "");
  }

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return "https://goodcms.cn";
}

function getSlugFromPath() {
  const match = location.pathname.match(/^\/p\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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
    }),
  }).catch(() => null);
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

function renderCaseList(block) {
  const props = block.props || {};
  const cases = Array.isArray(props.items) ? props.items : [];
  const itemsHtml = cases.map((item) => `
    <article class="case-card">
      ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" />` : ""}
      <div>
        <h3>${escapeHtml(item.title || "装修案例")}</h3>
        ${item.subtitle ? `<p>${escapeHtml(item.subtitle)}</p>` : ""}
      </div>
    </article>
  `).join("");

  return createSection(block, "case-list-block", `
    ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : ""}
    <div class="case-list">${itemsHtml || "<p class='muted'>暂无案例</p>"}</div>
  `);
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

function renderLeadForm(block, slug) {
  const props = block.props || {};
  const fields = Array.isArray(props.fields) && props.fields.length
    ? props.fields
    : ["name", "phone", "community"];
  const node = createSection(block, "lead-form-block", `
    <form data-form-block="true" novalidate>
      ${props.title ? `<h2>${escapeHtml(props.title)}</h2>` : "<h2>预约咨询</h2>"}
      ${props.description ? `<p class="form-desc">${escapeHtml(props.description)}</p>` : ""}
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
    </form>
  `);

  node.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const message = form.querySelector(".form-message");
    const formData = Object.fromEntries(new FormData(form).entries());

    if (formData.phone && !/^1[3-9]\d{9}$/.test(String(formData.phone))) {
      message.textContent = "请输入有效的手机号";
      message.className = "form-message is-error";
      return;
    }

    button.disabled = true;
    message.textContent = "提交中...";
    message.className = "form-message";

    try {
      await requestJson(`/public/marketing-pages/${encodeURIComponent(slug)}/leads`, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name || null,
          phone: formData.phone || null,
          community: formData.community || null,
          city: formData.city || null,
          form_data: formData,
        }),
      });
      await trackEvent(slug, "form_submit", block.id, { fields });
      form.reset();
      message.textContent = props.successText || "提交成功，我们会尽快联系您";
      message.className = "form-message is-success";
    } catch (error) {
      message.textContent = error.message || "提交失败，请稍后重试";
      message.className = "form-message is-error";
    } finally {
      button.disabled = false;
    }
  });

  return node;
}

function renderPhoneCta(block, slug) {
  const props = block.props || {};
  const phone = props.phone || "";
  const node = createSection(block, "phone-cta-block", `
    <button class="secondary-action" type="button">
      <span>${escapeHtml(props.text || "电话咨询")}</span>
      ${phone ? `<strong>${escapeHtml(phone)}</strong>` : ""}
    </button>
  `);
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
