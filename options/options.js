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

function showStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  el.style.color = isError ? "#dc2626" : "#2563eb";
  el.style.backgroundColor = isError ? "#fef2f2" : "#eff6ff";
  el.style.borderColor = isError ? "#fca5a5" : "#bfdbfe";
  setTimeout(() => {
    el.classList.remove("show");
  }, 4000);
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
        } else if (!result.portfolio && (lowerKey === "portfolio" || lowerKey === "website" || lowerKey.includes("portfolio"))) {
          result.portfolio = strVal;
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

function renderOptionsForm(profile) {
  const container = document.getElementById("optionsFormContainer");
  if (!container) return;
  container.innerHTML = "";

  const allKeys = Object.keys(profile || {});
  const sortedKeys = allKeys.sort((a, b) => {
    const idxA = STANDARD_FIELDS.indexOf(a);
    const idxB = STANDARD_FIELDS.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  if (sortedKeys.length === 0) {
    container.innerHTML = "<p style='grid-column: span 2; color: #64748b;'>No fields in this profile yet.</p>";
    return;
  }

  sortedKeys.forEach(k => {
    const group = document.createElement("div");
    group.className = "field-group";

    const header = document.createElement("div");
    header.className = "field-group-header";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = k.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "✖";
    removeBtn.title = "Delete field";
    removeBtn.onclick = async () => {
      if (confirm(`Remove field '${k}'?`)) {
        const s = await getStorage(["profiles", "activeProfile"]);
        if (s.activeProfile && s.profiles && s.profiles[s.activeProfile]) {
          delete s.profiles[s.activeProfile][k];
          await setStorage({ profiles: s.profiles });
          renderOptionsForm(s.profiles[s.activeProfile]);
          showStatus(`Field '${k}' removed.`);
        }
      }
    };

    header.appendChild(label);
    header.appendChild(removeBtn);
    group.appendChild(header);

    let val = profile[k];
    if (typeof val === "object" && val !== null) {
      val = JSON.stringify(val);
    }

    let input;
    if (k === "skills" || k === "hackathon" || k === "full_address") {
      input = document.createElement("textarea");
      input.value = val || "";
    } else if (k === "gender") {
      input = document.createElement("select");
      ["Male", "Female", "Other"].forEach(optVal => {
        const o = document.createElement("option");
        o.value = optVal;
        o.textContent = optVal;
        input.appendChild(o);
      });
      input.value = profile[k] || "Male";
    } else if (k === "terms") {
      const checkboxWrap = document.createElement("div");
      checkboxWrap.style.display = "flex";
      checkboxWrap.style.alignItems = "center";
      checkboxWrap.style.gap = "8px";

      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!profile[k];
      input.style.width = "auto";

      const cbLabel = document.createElement("span");
      cbLabel.textContent = "Agree to Terms & Conditions";
      cbLabel.style.fontSize = "12px";

      checkboxWrap.appendChild(input);
      checkboxWrap.appendChild(cbLabel);
      group.appendChild(checkboxWrap);
      input.name = k;
      container.appendChild(group);
      return;
    } else {
      input = document.createElement("input");
      input.type = (k === "email") ? "email" : (k === "phone") ? "tel" : "text";
      input.value = val || "";
    }

    input.name = k;
    group.appendChild(input);
    container.appendChild(group);
  });
}

function gatherProfileFromForm() {
  const container = document.getElementById("optionsFormContainer");
  if (!container) return {};
  const inputs = container.querySelectorAll("input, select, textarea");
  const p = {};
  inputs.forEach(i => {
    if (i.name) {
      if (i.type === "checkbox") {
        p[i.name] = i.checked;
      } else if (i.name === "hackathon" || i.name === "skills") {
        try { p[i.name] = JSON.parse(i.value); } catch (_) { p[i.name] = i.value; }
      } else {
        p[i.name] = i.value;
      }
    }
  });
  return p;
}

async function saveCurrentProfileData() {
  const s = await getStorage(["profiles", "activeProfile"]);
  if (!s.activeProfile || !s.profiles) return;
  const currentData = gatherProfileFromForm();
  s.profiles[s.activeProfile] = { ...s.profiles[s.activeProfile], ...currentData };
  await setStorage({ profiles: s.profiles });
}

async function init() {
  const s = await getStorage(["profiles", "activeProfile"]);
  let profiles = s.profiles;

  // Fallback: If profiles object is empty/missing, initialize default profile
  if (!profiles || Object.keys(profiles).length === 0) {
    profiles = { default: {} };
    STANDARD_FIELDS.forEach(f => profiles.default[f] = "");
    await setStorage({ profiles: profiles, activeProfile: "default" });
  }

  const active = s.activeProfile && profiles[s.activeProfile] ? s.activeProfile : Object.keys(profiles)[0];
  if (active !== s.activeProfile) {
    await setStorage({ activeProfile: active });
  }

  const sel = document.getElementById("profileSelect");
  sel.innerHTML = "";
  Object.keys(profiles).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = active;

  renderOptionsForm(profiles[active] || {});
}

document.addEventListener("DOMContentLoaded", () => {
  init();

  // Profile select change
  document.getElementById("profileSelect").addEventListener("change", async e => {
    await saveCurrentProfileData();
    const newActive = e.target.value;
    await setStorage({ activeProfile: newActive });
    const s = await getStorage(["profiles"]);
    renderOptionsForm(s.profiles?.[newActive] || {});
    showStatus(`Switched to profile '${newActive}'.`);
  });

  // Add new profile
  document.getElementById("addProfile").addEventListener("click", async () => {
    const nameInput = document.getElementById("newProfileName");
    const name = nameInput.value.trim();
    if (!name) {
      showStatus("Please enter a profile name.", true);
      return;
    }

    await saveCurrentProfileData();
    const s = await getStorage(["profiles"]);
    const profiles = s.profiles || {};

    if (profiles[name]) {
      showStatus(`Profile '${name}' already exists.`, true);
      return;
    }

    const newProfile = {};
    STANDARD_FIELDS.forEach(f => newProfile[f] = "");
    profiles[name] = newProfile;

    await setStorage({ profiles: profiles, activeProfile: name });
    nameInput.value = "";
    await init();
    showStatus(`Profile '${name}' created.`);
  });

  // Delete active profile
  document.getElementById("deleteProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const profiles = s.profiles || {};
    const names = Object.keys(profiles);

    if (names.length <= 1) {
      showStatus("Cannot delete the only remaining profile.", true);
      return;
    }

    if (!confirm(`Are you sure you want to delete profile '${s.activeProfile}'?`)) return;

    delete profiles[s.activeProfile];
    const nextActive = Object.keys(profiles)[0];
    await setStorage({ profiles: profiles, activeProfile: nextActive });
    await init();
    showStatus(`Profile deleted. Active profile is now '${nextActive}'.`);
  });

  // Save fields button
  document.getElementById("saveFieldsBtn").addEventListener("click", async () => {
    await saveCurrentProfileData();
    showStatus("Saved all profile changes successfully!");
  });

  // Add custom field button
  document.getElementById("addFieldBtn").addEventListener("click", async () => {
    const keyInput = document.getElementById("newFieldKey");
    const valInput = document.getElementById("newFieldValue");
    const key = keyInput.value.trim().toLowerCase().replace(/\s+/g, "_");
    const val = valInput.value.trim();

    if (!key) {
      showStatus("Field name is required.", true);
      return;
    }

    const s = await getStorage(["profiles", "activeProfile"]);
    if (!s.activeProfile || !s.profiles[s.activeProfile]) {
      showStatus("No active profile.", true);
      return;
    }

    // Save current inputs first
    const currentFormData = gatherProfileFromForm();
    s.profiles[s.activeProfile] = { ...s.profiles[s.activeProfile], ...currentFormData, [key]: val };

    await setStorage({ profiles: s.profiles });
    renderOptionsForm(s.profiles[s.activeProfile]);
    keyInput.value = "";
    valInput.value = "";
    showStatus(`Custom field '${key}' added.`);
  });

  // Export profiles
  document.getElementById("exportProfiles").addEventListener("click", async () => {
    await saveCurrentProfileData();
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
    showStatus("Exported profiles JSON successfully.");
  });

  // Import profiles
  document.getElementById("importProfiles").addEventListener("click", async () => {
    const fileInput = document.getElementById("importFile");
    const f = fileInput.files[0];
    if (!f) {
      showStatus("Please choose a JSON file to import.", true);
      return;
    }

    try {
      const text = await f.text();
      const importedProfiles = parseImportedJson(text);
      const s = await getStorage(["profiles"]);
      const existing = s.profiles || {};
      const updated = { ...existing, ...importedProfiles };
      const importedNames = Object.keys(importedProfiles);
      const activeName = importedNames[0] || Object.keys(updated)[0] || "";

      await setStorage({ profiles: updated, activeProfile: activeName });
      await init();
      showStatus(`Imported profile(s): ${importedNames.join(", ")}`);
    } catch (err) {
      showStatus(`Import failed: ${err.message}`, true);
    }
  });

  // File choice text display
  document.getElementById("importFile").addEventListener("change", e => {
    const name = e.target.files[0]?.name || "No file chosen";
    document.getElementById("fileNameDisplay").textContent = name;
  });
});
