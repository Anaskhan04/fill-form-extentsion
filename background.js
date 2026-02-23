const defaultProfiles = {
  default: {
    // Personal Details
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

    // Education
    college: "",
    university: "",
    course: "",
    branch: "",
    year: "",
    graduation: "",
    rollNo: "",

    // Address
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

    // Links
    linkedin: "",
    github: "",
    portfolio: "",

    // Skills
    skills: {
      programming: [],
      databases: [],
      tools: [],
      other: []
    },

    // Hackathon Details
    hackathon: {
      teamName: "",
      teamSize: "",
      projectTitle: "",
      theme: ""
    },

    // Professional
    company: "",
    occupation: "",

    // Misc
    language: "",
    birth_day: "",
    birth_month: "",
    birth_year: "",
    terms: false
  }
};


function initDefaults() {
  chrome.storage.local.get(["profiles", "activeProfile", "autoFillEnabled"], r => {
    const updates = {};
    if (!r.profiles) updates.profiles = defaultProfiles;
    if (!r.activeProfile) updates.activeProfile = "default";
    updates.autoFillEnabled = false;
    chrome.storage.local.set(updates);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  initDefaults();
  if (chrome.contextMenus) {
    // swallowing error in case menu already exists
    chrome.contextMenus.create({
      id: "fill_now",
      title: "AutoFill Now",
      contexts: ["all"]
    }, () => chrome.runtime.lastError);
  }
});

chrome.runtime.onStartup.addListener(() => {
  initDefaults();
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "fill_now" && tab.id) {
       // Suppress "Receiving end does not exist" error
      chrome.tabs.sendMessage(tab.id, { type: "AFP_FILL_NOW" }, () => chrome.runtime.lastError);
    }
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "fill_form") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        // Suppress "Receiving end does not exist" error
        chrome.tabs.sendMessage(tabs[0].id, { type: "AFP_FILL_NOW" }, () => chrome.runtime.lastError);
      }
    });
  }
});
