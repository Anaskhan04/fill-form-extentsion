function getStorage(keys) {
  return new Promise(r => chrome.storage.local.get(keys, r));
}

function setStorage(obj) {
  return new Promise(r => chrome.storage.local.set(obj, r));
}

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
});
