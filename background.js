const defaultProfiles = {
  default: {
    name: "John Doe",
    name_first: "John",
    name_last: "Doe",
    email: "example@email.com",
    phone: "1234567890",
    rollNo: "000000",
    college: "Your College Name",
    university: "Your University",
    branch: "Computer Science",
    year: "1st Year",
    graduation: "2028",
    city: "New York",
    state: "NY",
    pincode: "10001",
    gender: "Male",
    terms: true,
    linkedin: "https://linkedin.com/in/username",
    github: "https://github.com/username",
    skills: "HTML, CSS, JavaScript",
    username: "johndoe",
    title: "Mr",
    age: "25",
    name_middle: "",
    name_suffix: "",
    address_line_1: "123 Main St",
    address_line_2: "",
    address_line_3: "",
    full_address: "123 Main St, New York, NY",
    zip_code: "10001",
    country_code: "+1",
    country: "USA",
    language: "English",
    birth_day: "01",
    birth_month: "01",
    birth_year: "2000",
    company: "Example Corp",
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
