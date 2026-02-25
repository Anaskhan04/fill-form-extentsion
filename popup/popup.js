function getStorage(keys) {
  return new Promise(r => chrome.storage.local.get(keys, r));
}

function setStorage(obj) {
  return new Promise(r => chrome.storage.local.set(obj, r));
}

const DEFAULT_PROFILE_TEMPLATE = {
  name: "",
  name_first: "",
  name_middle: "",
  name_last: "",
  name_suffix: "",
  email: "",
  phone: "",
  username: "",
  gender: "",
  age: "",
  title: "",
  college: "",
  university: "",
  course: "",
  branch: "",
  year: "",
  graduation: "",
  rollNo: "",
  city: "",
  state: "",
  pincode: "",
  address_line_1: "",
  address_line_2: "",
  address_line_3: "",
  full_address: "",
  zip_code: "",
  country: "",
  country_code: "",
  linkedin: "",
  github: "",
  portfolio: "",
  skills: {
    programming: [],
    databases: [],
    tools: [],
    other: []
  },
  hackathon: {
    teamName: "",
    teamSize: "",
    projectTitle: "",
    theme: ""
  },
  company: "",
  occupation: "",
  language: "",
  birth_day: "",
  birth_month: "",
  birth_year: "",
  terms: false
};

const FIELD_GROUPS = [
  {
    title: "Personal Details",
    fields: ["name", "name_first", "name_middle", "name_last", "name_suffix", "email", "phone", "username", "gender", "age", "title"]
  },
  {
    title: "Education",
    fields: ["college", "university", "course", "branch", "year", "graduation", "rollNo"]
  },
  {
    title: "Address",
    fields: ["city", "state", "pincode", "address_line_1", "address_line_2", "address_line_3", "full_address", "zip_code", "country", "country_code"]
  },
  {
    title: "Links",
    fields: ["linkedin", "github", "portfolio"]
  },
  {
    title: "Skills",
    fields: ["skills.programming", "skills.databases", "skills.tools", "skills.other"]
  },
  {
    title: "Hackathon Details",
    fields: ["hackathon.teamName", "hackathon.teamSize", "hackathon.projectTitle", "hackathon.theme"]
  },
  {
    title: "Professional",
    fields: ["company", "occupation"]
  },
  {
    title: "Misc",
    fields: ["language", "birth_day", "birth_month", "birth_year", "terms"]
  }
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getValueByPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function setValueByPath(obj, path, value) {
  const keys = path.split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (typeof cursor[key] !== "object" || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function formatLabel(keyPath) {
  const key = keyPath.split(".").pop();
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

function inputTypeFor(path) {
  if (path === "email") return "email";
  if (path === "phone") return "tel";
  if (["linkedin", "github", "portfolio"].includes(path)) return "url";
  return "text";
}

function createInput(path, value) {
  if (path === "gender") {
    const select = document.createElement("select");
    ["", "Male", "Female", "Other"].forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v || "Select";
      select.appendChild(o);
    });
    select.value = value || "";
    select.name = path;
    return select;
  }

  if (path === "terms") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!value;
    checkbox.name = path;
    return checkbox;
  }

  const isArrayField = path.startsWith("skills.");
  if (isArrayField) {
    const textarea = document.createElement("textarea");
    textarea.value = Array.isArray(value) ? value.join(", ") : "";
    textarea.placeholder = "Comma separated values";
    textarea.name = path;
    return textarea;
  }

  const input = document.createElement("input");
  input.type = inputTypeFor(path);
  input.value = value || "";
  input.name = path;
  return input;
}

function renderForm(container, profile) {
  container.innerHTML = "";

  FIELD_GROUPS.forEach(section => {
    const sectionEl = document.createElement("section");
    sectionEl.className = "form-section";

    const heading = document.createElement("h2");
    heading.textContent = section.title;
    sectionEl.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "grid";

    section.fields.forEach(path => {
      const label = document.createElement("label");
      label.textContent = formatLabel(path);

      const val = getValueByPath(profile, path);
      const input = createInput(path, val);

      grid.appendChild(label);
      grid.appendChild(input);
    });

    sectionEl.appendChild(grid);
    container.appendChild(sectionEl);
  });

  const knownPaths = new Set(FIELD_GROUPS.flatMap(group => group.fields));
  const extraKeys = Object.keys(profile).filter(k => !knownPaths.has(k) && !["skills", "hackathon"].includes(k));

  if (extraKeys.length) {
    const sectionEl = document.createElement("section");
    sectionEl.className = "form-section";
    const heading = document.createElement("h2");
    heading.textContent = "Custom Fields";
    sectionEl.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "grid";
    extraKeys.sort().forEach(k => {
      const label = document.createElement("label");
      label.textContent = formatLabel(k);
      const input = document.createElement("input");
      input.name = k;
      input.value = profile[k] || "";
      grid.appendChild(label);
      grid.appendChild(input);
    });

    sectionEl.appendChild(grid);
    container.appendChild(sectionEl);
  }
}

function isEmptyValue(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return value === false;
  if (value && typeof value === "object") return Object.values(value).every(isEmptyValue);
  return !value;
}

function shouldShowOnboarding(profiles, activeProfile) {
  const names = Object.keys(profiles || {});
  if (names.length !== 1 || names[0] !== "default" || activeProfile !== "default") {
    return false;
  }
  return isEmptyValue(profiles.default || {});
}

function gatherProfile() {
  const inputs = document.querySelectorAll("#form input, #form textarea, #form select");
  const profile = deepClone(DEFAULT_PROFILE_TEMPLATE);

  inputs.forEach(i => {
    let value;
    if (i.type === "checkbox") {
      value = i.checked;
    } else if (i.name.startsWith("skills.")) {
      value = i.value
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
    } else {
      value = i.value;
    }
    setValueByPath(profile, i.name, value);
  });

  return profile;
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function refreshView(profiles, activeProfile) {
  const onboardingVisible = shouldShowOnboarding(profiles, activeProfile);
  document.getElementById("onboarding").classList.toggle("hidden", !onboardingVisible);
  document.getElementById("editor").classList.toggle("hidden", onboardingVisible);

  const profileSelect = document.getElementById("profileSelect");
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    profileSelect.appendChild(option);
  });

  if (!onboardingVisible) {
    profileSelect.value = activeProfile || Object.keys(profiles)[0] || "";
    renderForm(document.getElementById("form"), profiles[profileSelect.value] || deepClone(DEFAULT_PROFILE_TEMPLATE));
  }
}

async function ensureState() {
  const state = await getStorage(["profiles", "activeProfile"]);
  const profiles = state.profiles || { default: deepClone(DEFAULT_PROFILE_TEMPLATE) };
  const activeProfile = state.activeProfile || Object.keys(profiles)[0] || "default";
  await setStorage({ profiles, activeProfile });
  return { profiles, activeProfile };
}

async function createProfile(nameInputId) {
  const name = document.getElementById(nameInputId).value.trim();
  if (!name) {
    setStatus("Please enter a profile name.");
    return;
  }

  const state = await ensureState();
  if (state.profiles[name]) {
    setStatus("Profile name already exists.");
    return;
  }

  state.profiles[name] = deepClone(DEFAULT_PROFILE_TEMPLATE);
  await setStorage({ profiles: state.profiles, activeProfile: name });
  document.getElementById(nameInputId).value = "";
  refreshView(state.profiles, name);
  setStatus("Profile added.");
}

document.addEventListener("DOMContentLoaded", async () => {
  const state = await ensureState();
  refreshView(state.profiles, state.activeProfile);

  document.getElementById("profileSelect").addEventListener("change", async e => {
    const activeProfile = e.target.value;
    const s = await getStorage(["profiles"]);
    renderForm(document.getElementById("form"), s.profiles[activeProfile] || deepClone(DEFAULT_PROFILE_TEMPLATE));
    await setStorage({ activeProfile });
  });

  document.getElementById("saveProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    if (!s.activeProfile) {
      setStatus("Select a profile first.");
      return;
    }
    s.profiles[s.activeProfile] = gatherProfile();
    await setStorage({ profiles: s.profiles });
    setStatus("Profile saved.");
  });

  document.getElementById("addProfile").addEventListener("click", async () => createProfile("newProfileName"));
  document.getElementById("addProfileEditor").addEventListener("click", async () => createProfile("newProfileNameEditor"));

  document.getElementById("deleteProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const names = Object.keys(s.profiles || {});
    if (names.length <= 1) {
      setStatus("At least one profile is required.");
      return;
    }

    delete s.profiles[s.activeProfile];
    const nextProfile = Object.keys(s.profiles)[0];
    await setStorage({ profiles: s.profiles, activeProfile: nextProfile });
    refreshView(s.profiles, nextProfile);
    setStatus("Profile deleted.");
  });

  document.getElementById("addFieldBtn").addEventListener("click", async () => {
    const key = document.getElementById("newFieldKey").value.trim();
    const val = document.getElementById("newFieldValue").value.trim();
    if (!key) {
      setStatus("Field name is required.");
      return;
    }

    const s = await getStorage(["profiles", "activeProfile"]);
    if (!s.activeProfile || !s.profiles[s.activeProfile]) {
      setStatus("No active profile to add to.");
      return;
    }

    s.profiles[s.activeProfile][key] = val;
    await setStorage({ profiles: s.profiles });
    renderForm(document.getElementById("form"), s.profiles[s.activeProfile]);
    document.getElementById("newFieldKey").value = "";
    document.getElementById("newFieldValue").value = "";
    setStatus(`Field '${key}' added.`);
  });

  document.getElementById("fillNow").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const tab = tabs[0];
    if (!tab || !tab.id) return;

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      setStatus("Cannot fill system pages.");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "AFP_FILL_NOW" }, res => {
      if (chrome.runtime.lastError) {
        setStatus("Error: Refresh the page and try again.");
        return;
      }
      const status = res
        ? `Filled ${res.filled}, detected ${res.detected}. Radios: ${res.radiosMatched || 0}/${res.radiosAttempted || 0}`
        : "Triggered.";
      setStatus(status);
    });
  });

  document.getElementById("clearFields").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const tab = tabs[0];
    if (!tab || !tab.id) return;

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      setStatus("Cannot clear system pages.");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "AFP_CLEAR_FIELDS" }, res => {
      if (chrome.runtime.lastError) {
        setStatus("Error: Refresh the page.");
        return;
      }
      setStatus(res ? `Cleared ${res.cleared} fields.` : "Cleared.");
    });
  });
});
