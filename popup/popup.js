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
  "linkedin", "github", "username",
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
    const profileRow = profileSelect.closest(".row");
    profileSelect.innerHTML = "";
    profileNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      profileSelect.appendChild(opt);
    });

    if (profileNames.length <= 1) {
      profileRow.classList.add("hidden");
    } else {
      profileRow.classList.remove("hidden");
    }

    profileSelect.value = state.activeProfile || profileNames[0] || "";
    renderForm(document.getElementById("form"), profiles[profileSelect.value] || {});
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

  document.getElementById("profileSelect").addEventListener("change", async e => {
    const name = e.target.value;
    const s = await getStorage(["profiles"]);
    renderForm(document.getElementById("form"), s.profiles[name] || {});
    await setStorage({ activeProfile: name });
    // Keep edit container hidden when switching profiles unless already open?
    // Let's hide it for a clean switch
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
    document.getElementById("status").textContent = "Profile saved.";
  });

  document.getElementById("addFieldBtn").addEventListener("click", async () => {
    const key = document.getElementById("newFieldKey").value.trim();
    const val = document.getElementById("newFieldValue").value.trim();
    if (!key) {
      document.getElementById("status").textContent = "Field name is required.";
      return;
    }
    
    // Get current state
    const s = await getStorage(["profiles", "activeProfile"]);
    if (!s.activeProfile || !s.profiles[s.activeProfile]) {
        document.getElementById("status").textContent = "No active profile to add to.";
        return;
    }

    // Update profile in memory
    s.profiles[s.activeProfile][key] = val;

    // Save to storage
    await setStorage({ profiles: s.profiles });

    // Re-render
    renderForm(document.getElementById("form"), s.profiles[s.activeProfile]);

    // Clear inputs and feedback
    document.getElementById("newFieldKey").value = "";
    document.getElementById("newFieldValue").value = "";
    document.getElementById("status").textContent = `Field '${key}' added.`;
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
