function getStorage(keys) {
  return new Promise(r => chrome.storage.local.get(keys, r));
}

function setStorage(obj) {
  return new Promise(r => chrome.storage.local.set(obj, r));
}

const STANDARD_FIELDS = [
  // Personal
  "name", "name_first", "name_middle", "name_last", "name_suffix", "gender", "age", "title",
  // Contact
  "email", "phone",
  // Address
  "address_line_1", "address_line_2", "address_line_3", "full_address", "city", "state", "pincode", "zip_code", "country", "country_code",
  // Education
  "college", "university", "branch", "year", "graduation", "rollNo",
  // Professional
  "company", "occupation",
  // Social/Links
  "linkedin", "github", "portfolio", "username",
  // Others
  "skills", "language", "birth_day", "birth_month", "birth_year", "terms"
];

function renderForm(container, profile) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid edit-mode";
  
  // Sort keys based on STANDARD_FIELDS order, then alphabetically for custom fields
  const allKeys = Object.keys(profile);
  const sortedKeys = allKeys.sort((a, b) => {
    const idxA = STANDARD_FIELDS.indexOf(a);
    const idxB = STANDARD_FIELDS.indexOf(b);
    
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const k of sortedKeys) {
    const l = document.createElement("label");
    // Format label to be more readable (e.g., address_line_1 -> Address Line 1)
    l.textContent = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let input;
    
    // Get the value, handling nested objects for the UI
    let val = profile[k];
    if (k === "skills" && typeof val === 'object') {
      val = Object.values(val).flat().join(", ");
    } else if (k === "hackathon" && typeof val === 'object') {
      // This allows editing hackathon as a JSON string in the popup
      val = JSON.stringify(val);
    }

    if (k === "skills" || k === "hackathon") {
      input = document.createElement("textarea");
      input.value = val || "";
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
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-field-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Remove Field";
    removeBtn.onclick = async () => {
      if (confirm(`Remove field "${k}"?`)) {
        const s = await getStorage(["profiles", "activeProfile"]);
        delete s.profiles[s.activeProfile][k];
        // If it's a standard field, we just want to clear its value in storage
        // but it will still show up in the UI because it's in STANDARD_FIELDS
        // However, if the user explicitly wants to "remove" it, they might mean
        // they don't want to see it. But for now, let's just clear the value
        // and if it's a custom field, it will actually disappear.
        await setStorage({ profiles: s.profiles });
        renderForm(container, s.profiles[s.activeProfile]);
      }
    };

    grid.appendChild(l);
    grid.appendChild(input);
    grid.appendChild(removeBtn);
  }
  container.appendChild(grid);
}

function updateProfilePreview(profile) {
  const nameEl = document.getElementById("previewName");
  const emailEl = document.getElementById("previewEmail");
  const phoneEl = document.getElementById("previewPhone");
  const addressEl = document.getElementById("previewAddress");

  if (!profile || typeof profile !== "object") {
    if (nameEl) nameEl.textContent = "—";
    if (emailEl) emailEl.textContent = "—";
    if (phoneEl) phoneEl.textContent = "—";
    if (addressEl) addressEl.textContent = "—";
    return;
  }

  const name = profile.name || [profile.name_first, profile.name_last].filter(Boolean).join(" ") || profile.full_name || "";
  const email = profile.email || profile.email_address || "";
  const phone = profile.phone || profile.mobile || profile.cell || "";
  const address = profile.full_address || profile.address || [profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "";

  if (nameEl) nameEl.textContent = name || "(Not set)";
  if (emailEl) emailEl.textContent = email || "(Not set)";
  if (phoneEl) phoneEl.textContent = phone || "(Not set)";
  if (addressEl) addressEl.textContent = address || "(Not set)";
}

async function init() {
  const state = await getStorage(["profiles", "activeProfile"]);
  const profiles = state.profiles || {};
  const profileNames = Object.keys(profiles);

  const setupView = document.getElementById("setupView");
  const mainView = document.getElementById("mainView");

  if (profileNames.length === 0) {
    setupView.classList.remove("hidden");
    mainView.classList.add("hidden");
  } else {
    setupView.classList.add("hidden");
    mainView.classList.remove("hidden");
    
    const profileSelect = document.getElementById("profileSelect");
    profileSelect.innerHTML = "";
    profileNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      profileSelect.appendChild(opt);
    });

    const active = (state.activeProfile && profiles[state.activeProfile]) ? state.activeProfile : profileNames[0];
    profileSelect.value = active;

    const currentProfile = profiles[active] || {};
    updateProfilePreview(currentProfile);
    renderForm(document.getElementById("form"), currentProfile);
  }
}

function gatherProfile() {
  const inputs = document.querySelectorAll("#form input, #form textarea, #form select");
  const p = {};
  inputs.forEach(i => {
    if (i.type === "checkbox") {
      p[i.name] = i.checked;
    } else if (i.name === "hackathon") {
      try { p[i.name] = JSON.parse(i.value); } catch(e) { p[i.name] = i.value; }
    } else {
      p[i.name] = i.value;
    }
  });
  return p;
}

function deepExtractFields(obj) {
  const result = {};
  if (!obj || typeof obj !== "object") return result;

  const scan = (current, depth = 0) => {
    if (!current || typeof current !== "object" || depth > 5) return;
    for (const [key, val] of Object.entries(current)) {
      if (val === null || val === undefined) continue;
      const lowerKey = key.toLowerCase().replace(/[\-_]/g, "");

      if (typeof val === "object" && !Array.isArray(val)) {
        scan(val, depth + 1);
      } else if (typeof val !== "object") {
        const strVal = String(val).trim();
        if (!strVal) continue;

        if (!result.name && (lowerKey === "name" || lowerKey === "fullname" || lowerKey === "candidatename")) {
          result.name = strVal;
        } else if (!result.name_first && (lowerKey === "firstname" || lowerKey === "fname" || lowerKey === "givenname")) {
          result.name_first = strVal;
        } else if (!result.name_last && (lowerKey === "lastname" || lowerKey === "lname" || lowerKey === "surname")) {
          result.name_last = strVal;
        } else if (!result.email && (lowerKey === "email" || lowerKey === "emailaddress" || lowerKey === "mail")) {
          result.email = strVal;
        } else if (!result.phone && (lowerKey === "phone" || lowerKey === "phonenumber" || lowerKey === "mobile" || lowerKey === "tel")) {
          result.phone = strVal;
        } else if (!result.city && lowerKey === "city") {
          result.city = strVal;
        } else if (!result.state && (lowerKey === "state" || lowerKey === "province")) {
          result.state = strVal;
        } else if (!result.country && lowerKey === "country") {
          result.country = strVal;
        } else if (!result.pincode && (lowerKey === "pincode" || lowerKey === "zipcode" || lowerKey === "postalcode" || lowerKey === "zip")) {
          result.pincode = strVal;
        } else if (!result.full_address && (lowerKey === "fulladdress" || lowerKey === "completeaddress" || lowerKey === "address")) {
          result.full_address = strVal;
        } else if (!result.college && (lowerKey === "college" || lowerKey === "university" || lowerKey === "institute" || lowerKey === "school")) {
          result.college = strVal;
        } else if (!result.company && (lowerKey === "company" || lowerKey === "organization" || lowerKey === "employer")) {
          result.company = strVal;
        } else if (!result.linkedin && lowerKey.includes("linkedin")) {
          result.linkedin = strVal;
        } else if (!result.github && lowerKey.includes("github")) {
          result.github = strVal;
        } else {
          if (result[key] === undefined) {
            result[key] = strVal;
          }
        }
      }
    }
  };

  scan(obj);

  // Synthesize address if full_address is still missing
  if (!result.full_address) {
    const parts = [
      result.address_line_1,
      result.city,
      result.state,
      result.pincode,
      result.country
    ].filter(Boolean);
    if (parts.length > 0) result.full_address = parts.join(", ");
  }
  if (result.full_address && !result.address) {
    result.address = result.full_address;
  }

  // Synthesize name if name_first and name_last exist
  if (!result.name && (result.name_first || result.name_last)) {
    result.name = [result.name_first, result.name_last].filter(Boolean).join(" ");
  }

  return result;
}

function parseImportedJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON syntax.");
  }

  if (parsed === null || parsed === undefined) {
    throw new Error("JSON file is empty.");
  }

  // 1. Array of profile objects: [ { ... } ]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error("JSON array is empty.");
    const result = {};
    parsed.forEach((item, idx) => {
      const extracted = deepExtractFields(item);
      const pName = extracted.name || `Profile ${idx + 1}`;
      result[pName] = extracted;
    });
    return result;
  }

  if (typeof parsed !== "object") {
    throw new Error("JSON must be an object.");
  }

  const topKeys = Object.keys(parsed);
  if (topKeys.length === 0) {
    throw new Error("JSON file is empty.");
  }

  // 2. Single root wrapper like { "profile": { ... } } or { "data": { ... } } or { "user": { ... } }
  if (topKeys.length === 1 && typeof parsed[topKeys[0]] === "object" && !Array.isArray(parsed[topKeys[0]])) {
    const singleObj = parsed[topKeys[0]];
    const extracted = deepExtractFields(singleObj);
    const pName = extracted.name || topKeys[0];
    return { [pName]: extracted };
  }

  // 3. True multi-profile file: multiple profile keys where each contains personal details
  let isMultiProfile = false;
  const nonSectionKeys = topKeys.filter(k => !["personal", "contact", "address", "education", "professional", "work", "skills", "hackathon", "data", "profile", "user"].includes(k.toLowerCase()));

  if (nonSectionKeys.length >= 2) {
    let profileCount = 0;
    for (const k of nonSectionKeys) {
      if (parsed[k] && typeof parsed[k] === "object" && !Array.isArray(parsed[k])) {
        const sub = deepExtractFields(parsed[k]);
        if (sub.name || sub.email || sub.phone) profileCount++;
      }
    }
    if (profileCount >= 2 && profileCount === nonSectionKeys.length) {
      isMultiProfile = true;
    }
  }

  if (isMultiProfile) {
    const result = {};
    for (const k of nonSectionKeys) {
      result[k] = deepExtractFields(parsed[k]);
    }
    return result;
  }

  // 4. Single profile (flat or structured with sections like personal, address, etc.)
  const extracted = deepExtractFields(parsed);
  const pName = extracted.name || parsed.profile_name || "Profile";
  return { [pName]: extracted };
}

async function handleJsonFileImport(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const importedProfiles = parseImportedJson(text);
    const s = await getStorage(["profiles"]);
    const existing = s.profiles || {};
    const updated = { ...existing, ...importedProfiles };
    const importedNames = Object.keys(importedProfiles);
    const activeName = importedNames[0] || Object.keys(updated)[0] || "";

    await setStorage({ profiles: updated, activeProfile: activeName });
    await init();
    document.getElementById("status").textContent = `Loaded profile: "${activeName}"`;
  } catch (err) {
    document.getElementById("status").textContent = `Import failed: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
    init();

    document.getElementById("createFirstProfile").addEventListener("click", async () => {
    const name = document.getElementById("initialProfileName").value.trim();
    if (!name) {
      document.getElementById("status").textContent = "Please enter a profile name.";
      return;
    }
    const profiles = {};
    const newProfile = {};
    STANDARD_FIELDS.forEach(f => newProfile[f] = "");
    profiles[name] = newProfile;
    await setStorage({ profiles: profiles, activeProfile: name });
    init(); // Refresh UI to show mainView
  });

  // Setup view import button
  const setupImportBtn = document.getElementById("setupImportBtn");
  const setupImportFile = document.getElementById("setupImportFile");
  if (setupImportBtn && setupImportFile) {
    setupImportBtn.addEventListener("click", () => setupImportFile.click());
    setupImportFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleJsonFileImport(e.target.files[0]);
      }
    });
  }

  // Main view import & export buttons
  const importJsonBtn = document.getElementById("importJsonBtn");
  const mainImportFile = document.getElementById("mainImportFile");
  if (importJsonBtn && mainImportFile) {
    importJsonBtn.addEventListener("click", () => mainImportFile.click());
    mainImportFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleJsonFileImport(e.target.files[0]);
      }
    });
  }

  const exportJsonBtn = document.getElementById("exportJsonBtn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      const s = await getStorage(["profiles"]);
      const blob = new Blob([JSON.stringify(s.profiles || {}, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "autoform-pro-profiles.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("status").textContent = "Exported profiles JSON.";
    });
  }

  document.getElementById("profileSelect").addEventListener("change", async e => {
    const name = e.target.value;
    const s = await getStorage(["profiles"]);
    const prof = s.profiles[name] || {};
    updateProfilePreview(prof);
    renderForm(document.getElementById("form"), prof);
    await setStorage({ activeProfile: name });
    document.getElementById("editContainer").classList.add("hidden");
    document.getElementById("saveProfile").classList.add("hidden");
    document.getElementById("toggleEdit").textContent = "Edit Fields";
  });

  document.getElementById("toggleEdit").addEventListener("click", () => {
    const container = document.getElementById("editContainer");
    const saveBtn = document.getElementById("saveProfile");
    const isHidden = container.classList.toggle("hidden");
    saveBtn.classList.toggle("hidden", isHidden);
    document.getElementById("toggleEdit").textContent = isHidden ? "Edit Fields" : "Hide Fields";
  });

  document.getElementById("saveProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const p = gatherProfile();
    s.profiles[s.activeProfile] = p;
    await setStorage({ profiles: s.profiles });
    updateProfilePreview(p);
    document.getElementById("status").textContent = "Profile saved.";
  });

  document.getElementById("addFieldBtn").addEventListener("click", async () => {
    const key = document.getElementById("newFieldKey").value.trim();
    const val = document.getElementById("newFieldValue").value.trim();
    if (!key) {
      document.getElementById("status").textContent = "Field name is required.";
      return;
    }
    
    const s = await getStorage(["profiles", "activeProfile"]);
    if (!s.activeProfile || !s.profiles[s.activeProfile]) {
        document.getElementById("status").textContent = "No active profile to add to.";
        return;
    }

    s.profiles[s.activeProfile][key] = val;
    await setStorage({ profiles: s.profiles });
    renderForm(document.getElementById("form"), s.profiles[s.activeProfile]);

    document.getElementById("newFieldKey").value = "";
    document.getElementById("newFieldValue").value = "";
    document.getElementById("status").textContent = `Field '${key}' added.`;
  });

  async function executeTabAction(tab, actionType) {
    if (!tab || !tab.id) return;
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      document.getElementById("status").textContent = "Cannot run on Chrome system pages.";
      return;
    }

    const trySendMessage = () => {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: actionType }, res => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve({ result: res });
          }
        });
      });
    };

    let outcome = await trySendMessage();

    // If message failed (content script not injected yet), attempt dynamic injection!
    if (outcome.error) {
      try {
        await new Promise((resolve, reject) => {
          chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        });
        await new Promise(r => setTimeout(r, 100));
        outcome = await trySendMessage();
      } catch (err) {
        if (tab.url.startsWith("file://")) {
          document.getElementById("status").textContent = "Please enable 'Allow access to file URLs' in extension details page.";
          return;
        }
        document.getElementById("status").textContent = "Please refresh the webpage (F5) once to connect.";
        return;
      }
    }

    if (outcome.error) {
      document.getElementById("status").textContent = "Please refresh the webpage (F5) once.";
      return;
    }

    const res = outcome.result;
    if (actionType === "AFP_FILL_NOW") {
      if (!res) {
        document.getElementById("status").textContent = "Fill command sent.";
      } else if (res.filled > 0) {
        document.getElementById("status").textContent = `Filled ${res.filled} field(s) successfully!`;
      } else if (res.detected > 0) {
        document.getElementById("status").textContent = `Detected ${res.detected} field(s), but profile values are empty.`;
      } else {
        document.getElementById("status").textContent = "No fillable fields found on page.";
      }
    } else if (actionType === "AFP_CLEAR_FIELDS") {
      document.getElementById("status").textContent = res ? `Cleared ${res.cleared} field(s).` : "Fields cleared.";
    }
  }

  document.getElementById("fillNow").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    executeTabAction(tabs[0], "AFP_FILL_NOW");
  });

  document.getElementById("clearFields").addEventListener("click", async () => {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    executeTabAction(tabs[0], "AFP_CLEAR_FIELDS");
  });
});
