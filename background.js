const defaultProfiles = {
  default: {
    name: "Anas Khan",
    name_first:"Anas",
    name_last:"Khan",
    email: "reyaz7753@gmail.com",
    phone: "9794540117",
    rollNo: "23073401300010",
    college: "Rajkiya Engineering College, Banda",
    university: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)",
    branch: "Information Technology (IT)",
    year: "3rd Year",
    graduation: "2027",
    city: "Banda",
    state: "Uttar Pradesh",
    pincode: "210201",
    gender: "Male",
    terms: true,
    linkedin: "https://linkedin.com/in/anaskhan02",
    github: "https://github.com/AnasKhan04",
    skills: "HTML/CSS/JS/React, DSA, MongoDB/Firebase, UI/UX",
    username: "anaskhan02",
    title: "Mr",
    age: "21",
    name_middle: "",
    name_suffix: "",
    address_line_1: "Rajkiya Engineering College , Atarra , 210201 , Banda ",
    address_line_2: "Harahua Dih , varanasi,221105",
    address_line_3: "",
    full_address: "Rajkiya Engineering College, Banda, UP",
    zip_code: "210201",
    country_code: "+91",
    country: "India",
    language: "English,Hindi",
    birth_day: "06",
    birth_month: "09",
    birth_year: "2004",
    company: "",
    occupation: "Student",
    
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
