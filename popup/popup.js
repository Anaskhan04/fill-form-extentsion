function getStorage(keys) {
  return new Promise(r => chrome.storage.local.get(keys, r));
}

function setStorage(obj) {
  return new Promise(r => chrome.storage.local.set(obj, r));
}

function renderForm(container, profile) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";
  const fields = Object.keys(profile);
  for (const k of fields) {
    const l = document.createElement("label");
    l.textContent = k;
    let input;
    if (k === "skills") {
      input = document.createElement("textarea");
      input.value = profile[k] || "";
    } else if (k === "gender") {
      input = document.createElement("select");
      ["Male","Female","Other"].forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; input.appendChild(o); });
      input.value = profile[k] || "Male";
    } else if (k === "terms") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!profile[k];
    } else {
      input = document.createElement("input");
      input.value = profile[k] || "";
      input.type = (k === "email") ? "email" : (k === "phone") ? "tel" : (k === "github" || k === "linkedin") ? "url" : "text";
    }
    input.name = k;
    grid.appendChild(l);
    grid.appendChild(input);
  }
  container.appendChild(grid);
}

async function init() {
  const state = await getStorage(["profiles", "activeProfile"]);
  const profiles = state.profiles || {};
  const profileSelect = document.getElementById("profileSelect");
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    profileSelect.appendChild(opt);
  });
  profileSelect.value = state.activeProfile || Object.keys(profiles)[0] || "";
  renderForm(document.getElementById("form"), profiles[profileSelect.value] || {});
}

function gatherProfile() {
  const inputs = document.querySelectorAll("#form input, #form textarea, #form select");
  const p = {};
  inputs.forEach(i => {
    if (i.type === "checkbox") p[i.name] = i.checked;
    else p[i.name] = i.value;
  });
  return p;
}

document.addEventListener("DOMContentLoaded", () => {
  init();
  document.getElementById("profileSelect").addEventListener("change", async e => {
    const name = e.target.value;
    const s = await getStorage(["profiles"]);
    renderForm(document.getElementById("form"), s.profiles[name] || {});
    await setStorage({ activeProfile: name });
  });
  document.getElementById("saveProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const p = gatherProfile();
    s.profiles[s.activeProfile] = p;
    await setStorage({ profiles: s.profiles });
    document.getElementById("status").textContent = "Profile saved.";
  });
  document.getElementById("addProfile").addEventListener("click", async () => {
    const name = document.getElementById("newProfileName").value.trim();
    if (!name) return;
    const s = await getStorage(["profiles"]);
    const baseName = Object.keys(s.profiles)[0];
    const base = s.profiles[baseName];
    s.profiles[name] = { ...base };
    await setStorage({ profiles: s.profiles, activeProfile: name });
    const sel = document.getElementById("profileSelect");
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
    sel.value = name;
    renderForm(document.getElementById("form"), s.profiles[name]);
    document.getElementById("newProfileName").value = "";
    document.getElementById("status").textContent = "Profile added.";
  });
  document.getElementById("deleteProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const names = Object.keys(s.profiles);
    if (names.length <= 1) return;
    delete s.profiles[s.activeProfile];
    const next = names.find(n => n !== s.activeProfile) || names[0];
    await setStorage({ profiles: s.profiles, activeProfile: next });
    const sel = document.getElementById("profileSelect");
    Array.from(sel.options).forEach(o => { if (o.value === s.activeProfile) o.remove(); });
    sel.value = next;
    renderForm(document.getElementById("form"), s.profiles[next]);
    document.getElementById("status").textContent = "Profile deleted.";
  });
  document.getElementById("fillNow").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    
    // Check if we can inject/message the tab
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        document.getElementById("status").textContent = "Cannot fill system pages.";
        return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "AFP_FILL_NOW" }, res => {
      if (chrome.runtime.lastError) {
        document.getElementById("status").textContent = "Error: Refresh the page and try again.";
        console.error(chrome.runtime.lastError);
        return;
      }
      const s = res ? `Filled ${res.filled}, detected ${res.detected}. Radios: ${res.radiosMatched || 0}/${res.radiosAttempted || 0}` : "Triggered.";
      document.getElementById("status").textContent = s;
    });
  });

  document.getElementById("clearFields").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const tab = tabs[0];
    if (!tab || !tab.id) return;

     if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        document.getElementById("status").textContent = "Cannot clear system pages.";
        return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "AFP_CLEAR_FIELDS" }, res => {
      if (chrome.runtime.lastError) {
        document.getElementById("status").textContent = "Error: Refresh the page.";
        return;
      }
      document.getElementById("status").textContent = res ? `Cleared ${res.cleared} fields.` : "Cleared.";
    });
  });
});
