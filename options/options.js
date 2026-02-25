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

async function init() {
  const s = await getStorage(["profiles", "activeProfile"]);
  const sel = document.getElementById("profileSelect");
  sel.innerHTML = "";
  Object.keys(s.profiles || {}).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = s.activeProfile || Object.keys(s.profiles || {})[0] || "";
}

document.addEventListener("DOMContentLoaded", () => {
  init();
  document.getElementById("profileSelect").addEventListener("change", async e => {
    await setStorage({ activeProfile: e.target.value });
    document.getElementById("status").textContent = "Saved.";
  });

  document.getElementById("addProfile").addEventListener("click", async () => {
    const name = document.getElementById("newProfileName").value.trim();
    if (!name) return;
    const s = await getStorage(["profiles"]);
    const profiles = s.profiles || {};
    // Initialize new profile with standard fields
    const newProfile = {};
    STANDARD_FIELDS.forEach(f => newProfile[f] = "");
    profiles[name] = newProfile;
    await setStorage({ profiles: profiles, activeProfile: name });
    document.getElementById("newProfileName").value = "";
    await init();
    document.getElementById("status").textContent = "Profile added.";
  });

  document.getElementById("deleteProfile").addEventListener("click", async () => {
    const s = await getStorage(["profiles", "activeProfile"]);
    const profiles = s.profiles || {};
    const names = Object.keys(profiles);
    if (names.length <= 1) {
      document.getElementById("status").textContent = "Cannot delete the only profile.";
      return;
    }
    delete profiles[s.activeProfile];
    const next = names.find(n => n !== s.activeProfile) || names[0];
    await setStorage({ profiles: profiles, activeProfile: next });
    await init();
    document.getElementById("status").textContent = "Profile deleted.";
  });

  document.getElementById("exportProfiles").addEventListener("click", async () => {
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
  });
  document.getElementById("importProfiles").addEventListener("click", async () => {
    const fileInput = document.getElementById("importFile");
    const f = fileInput.files[0];
    if (!f) return;
    const text = await f.text();
    let obj = {};
    try { obj = JSON.parse(text); } catch (_) { return; }
    const s = await getStorage(["profiles"]);
    await setStorage({ profiles: { ...s.profiles, ...obj } });
    await init();
    document.getElementById("status").textContent = "Imported.";
  });

  // Display selected file name
  document.getElementById("importFile").addEventListener("change", (e) => {
    const fileName = e.target.files[0]?.name || "No file chosen";
    document.getElementById("fileNameDisplay").textContent = fileName;
  });
});
