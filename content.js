const AFP_STATE = { profiles: null, activeProfile: null, autoFillEnabled: false };

function normalizeText(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/[`'"\-_,.:;()\[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s) {
  return normalizeText(s).split(" ").filter(Boolean);
}

function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a, b) {
  a = normalizeText(a);
  b = normalizeText(b);
  const maxLen = Math.max(a.length, b.length) || 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  const first = parts[0] || "";
  const last = parts.slice(1).join(" ") || "";
  return { first, last };
}

const KEY_SYNONYMS = {
  name: ["name", "full name", "candidate name", "your name"],
  name_first: ["first name", "given name"],
  name_last: ["last name", "surname", "family name"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "mobile", "contact", "telephone", "tel", "whatsapp"],
  rollNo: ["roll number", "roll no", "roll no.", "roll #", "roll", "enrollment", "enrolment", "enrollment no", "registration number", "registration no", "reg no", "student id", "rollno", "rollnumber"],
  college: ["college", "institute", "school", "campus"],
  university: ["university", "uni"],
  branch: ["branch", "department", "major", "stream"],
  year: ["year", "academic year", "current year"],
  graduation: ["graduation", "grad year", "passout year", "expected graduation"],
  city: ["city", "town"],
  state: ["state", "province"],
  pincode: ["pincode", "postal code", "zip", "zipcode"],
  gender: ["gender", "sex", "identity"],
  terms: ["terms", "agree", "agreement", "accept", "consent", "policy", "privacy", "user agreement", "i agree", "acknowledge"],
  linkedin: ["linkedin", "linkedin url", "profile link"],
  github: ["github", "github url"],
  skills: ["skills", "expertise", "technologies", "stack"],
  username: ["username", "user name", "login id", "screen name", "handle"],
  title: ["title", "salutation", "honorific"],
  age: ["age", "how old"],
  name_middle: ["middle name", "middle initial"],
  name_suffix: ["suffix", "name suffix"],
  address_line_1: ["street line 1", "address line 1", "address 1", "street address", "flat no", "house no"],
  address_line_2: ["street line 2", "address line 2", "address 2", "apartment", "suite", "unit", "floor"],
  address_line_3: ["street line 3", "address line 3", "address 3"],
  full_address: ["full address", "complete address", "full street", "mailing address"],
  zip_code: ["zip code", "zip", "postal code", "postcode", "pin code"],
  country_code: ["country code", "dialing code", "idd"],
  country: ["country", "nation", "region"],
  language: ["language", "lang", "mother tongue", "preferred language"],
  birth_day: ["birth day", "day of birth", "dob day", "dd"],
  birth_month: ["birth month", "month of birth", "dob month", "mm"],
  birth_year: ["birth year", "year of birth", "dob year", "yyyy"],
  company: ["company", "organization", "business", "employer", "firm"],
  occupation: ["occupation", "job title", "profession", "designation", "role"]
};

function buildTokens(profile) {
  const t = {};
  Object.keys(KEY_SYNONYMS).forEach(k => {
    t[k] = KEY_SYNONYMS[k].map(tokenize);
  });
  // Add dynamic keys from profile
  if (profile) {
      Object.keys(profile).forEach(k => {
          if (!t[k]) {
              const s1 = k;
              const s2 = k.replace(/_/g, " ");
              const s3 = k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
              const unique = [...new Set([s1, s2, s3])];
              t[k] = unique.map(tokenize);
          }
      });
  }
  return t;
}

let KEY_TOKENS = buildTokens(null);

function scoreTokens(fieldTokens, key) {
  const syns = KEY_TOKENS[key];
  let max = 0;
  for (const syn of syns) {
    let matches = 0;
    for (const st of syn) {
      if (fieldTokens.includes(st)) { matches++; continue; }
      for (const ft of fieldTokens) {
        if (similarity(ft, st) >= 0.8) { matches++; break; }
      }
    }
    const s = matches / Math.max(1, syn.length);
    if (s > max) max = s;
  }
  return max;
}

function previousTexts(el) {
  const texts = [];
  let sib = el.previousElementSibling;
  for (let i = 0; i < 2 && sib; i++) {
    texts.push(sib.textContent || "");
    sib = sib.previousElementSibling;
  }
  return texts.join(" ");
}

function groupLabel(el) {
  // 1. Search for ARIA group
  const group = el.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const al = ariaLabel(group);
    if (al) return al;
    // If no aria label, check previous siblings of group
    return previousTexts(group);
  }

  // 2. Search for Fieldset/Legend
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend && legend.textContent) return legend.textContent;
  }

  // 3. Common Container Heuristics
  // Look up to 3 parents for a preceding label or header
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    const role = p.getAttribute("role");
    // Stop if we hit a clearly unrelated section
    if (p.tagName === "FORM" || p.tagName === "SECTION") break;
    
    // Check previous sibling for label-like text
    const sib = p.previousElementSibling;
    if (sib && ["LABEL", "H4", "H5", "H6", "STRONG", "SPAN", "DIV"].includes(sib.tagName)) {
       return sib.textContent || "";
    }
    p = p.parentElement;
  }
  return "";
}

function typeBoost(el, key) {
  const isNumericField = (el instanceof HTMLInputElement) && (el.type === "number" || /\d\*/.test(el.getAttribute("pattern") || "") || (el.getAttribute("inputmode") || "") === "numeric");
  if (!isNumericField) return 1;
  if (["phone","pincode","rollNo","graduation"].includes(key)) return 1.2;
  return 1;
}

function pickKey(candidates, el) {
  const keys = Object.keys(KEY_TOKENS);
  let bestKey = null;
  let bestScore = 0;
  for (const k of keys) {
    let localBest = 0;
    for (const c of candidates) {
      const tokens = tokenize(c.text || "");
      const s = scoreTokens(tokens, k) * (c.w || 1);
      if (s > localBest) localBest = s;
    }
    localBest = localBest * typeBoost(el, k);
    if (localBest > bestScore) { bestScore = localBest; bestKey = k; }
  }
  return bestScore >= 0.6 ? bestKey : null;
}

function nearestLabel(el) {
  const id = el.getAttribute("id");
  const byFor = id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  if (byFor && byFor.textContent) return byFor.textContent;
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    const lbl = p.querySelector("label");
    if (lbl && lbl.textContent) return lbl.textContent;
    p = p.parentElement;
  }
  return "";
}

function ariaLabel(el) {
  const a = el.getAttribute("aria-label") || "";
  const labelledby = el.getAttribute("aria-labelledby") || "";
  let text = a;
  if (labelledby) {
    const ids = labelledby.split(/\s+/);
    for (const i of ids) {
      const node = el.ownerDocument.getElementById(i);
      if (node && node.textContent) text += " " + node.textContent;
    }
  }
  return text;
}

function surroundingText(el) {
  let texts = [];
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    texts.push(p.textContent || "");
    p = p.parentElement;
  }
  return texts.join(" ");
}

function fieldCandidates(el) {
  const c = [];
  const role = (el.getAttribute && el.getAttribute("role")) || "";
  const isAriaChoice = role === "radio" || role === "checkbox";
  const labelW = isAriaChoice ? 0.9 : 1.0;
  const prevW = isAriaChoice ? 0.9 : 0.3;
  c.push({ text: nearestLabel(el), w: labelW });
  if (isAriaChoice) c.push({ text: groupLabel(el), w: 1.0 });
  c.push({ text: el.getAttribute("placeholder") || "", w: 0.8 });
  c.push({ text: el.getAttribute("name") || "", w: 0.8 });
  c.push({ text: el.getAttribute("id") || "", w: 0.8 });
  c.push({ text: ariaLabel(el), w: 0.7 });
  c.push({ text: previousTexts(el), w: prevW });
  return c;
}

function valueForKey(profile, key) {
  if (key === "name_first") return splitName(profile.name || "").first;
  if (key === "name_last") return splitName(profile.name || "").last;
  return profile[key] || "";
}

function tokenSet(s) {
  return new Set(tokenize(s));
}

function isTruthy(v) {
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1" || s === "y" || s === "agree";
}

function labelTextFor(el) {
  const id = el.getAttribute("id");
  const byFor = id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  if (byFor && byFor.textContent) return byFor.textContent;
  if (el.parentElement) {
    const l = el.parentElement.querySelector("label");
    if (l && l.textContent) return l.textContent;
  }
  return "";
}

function genderSynonymsSet(val) {
  const s = normalizeText(val);
  if (s.includes("male")) return new Set(["male","m","man","boy"]);
  if (s.includes("female")) return new Set(["female","f","woman","girl"]);
  return new Set(["other","o","third","nonbinary","non-binary"]);
}

function setRadio(el, v, key) {
  const role = el.getAttribute && el.getAttribute("role");
  const isGender = key === "gender";
  const targetTokens = isGender ? genderSynonymsSet(v) : tokenSet(v);
  const normalizedV = normalizeText(v);

  // Helper to check if a radio option matches the target
  const checkMatch = (label, value) => {
    const valStr = normalizeText(value || "");
    const lblStr = normalizeText(label || "");
    
    // 1. Exact Value/Label Match
    if (valStr === normalizedV || lblStr === normalizedV) return true;
    
    // 2. Token Set Match
    const candidateTokens = tokenSet(label + " " + (value || ""));
    for (const t of targetTokens) {
      if (candidateTokens.has(t)) return true;
    }
    return false;
  };

  if (role === "radio") {
    let root = el.closest('[role="radiogroup"]') || el.parentElement || document;
    const candidates = Array.from(root.querySelectorAll ? root.querySelectorAll('[role="radio"]') : []);
    
    for (const r of candidates) {
      const label = (r.getAttribute("aria-label") || "") + " " + (r.textContent || "");
      if (checkMatch(label, r.getAttribute("value"))) {
        const isOn = (r.getAttribute("aria-checked") || "").toLowerCase() === "true";
        if (!isOn && r.getAttribute("data-afp-locked") !== "1") {
          r.click();
          r.setAttribute("data-afp-locked", "1");
        }
        r.classList.add("afp-filled");
        return true;
      }
    }
    return false;
  }

  const name = el.getAttribute("name");
  if (!name) return false;
  const group = Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`));
  
  for (const r of group) {
    const label = labelTextFor(r);
    if (checkMatch(label, r.value)) {
      if (!r.checked) {
        r.click();
        r.checked = true; // Ensure explicit checked state in case click is intercepted
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }
      r.classList.add("afp-filled");
      return true;
    }
  }
  return false;
}

function setCheckbox(el, v) {
  const lt = labelTextFor(el);
  const targetTokens = tokenSet(String(v));
  const candidateTokens = tokenSet(lt + " " + (el.value || ""));
  const want = isTruthy(v) || Array.from(targetTokens).some(t => candidateTokens.has(t));
  if (want) {
    if (!el.checked) el.click();
    el.classList.add("afp-filled");
    return true;
  }
  return false;
}

function setAriaCheckbox(el, v) {
  const text = (el.getAttribute("aria-label") || "") + " " + (el.textContent || "");
  const targetTokens = tokenSet(String(v));
  const candidateTokens = tokenSet(text);
  const want = isTruthy(v) || Array.from(targetTokens).some(t => candidateTokens.has(t));
  if (want) {
    const ariaState = (el.getAttribute("aria-checked") || el.getAttribute("aria-pressed") || el.getAttribute("aria-selected") || "").toLowerCase();
    const isOn = ariaState === "true";
    const locked = el.getAttribute("data-afp-locked") === "1";
    if (!isOn && !locked) {
      el.click();
      el.setAttribute("data-afp-locked", "1");
    }
    el.classList.add("afp-filled");
    return true;
  }
  return false;
}

function setValue(el, v, key) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.type === "checkbox") {
      if (key === "terms" || isTruthy(v)) return setCheckbox(el, v);
      el.classList.add("afp-detected");
      return false;
    }
    if (el.type === "radio") {
      return setRadio(el, v, key);
    }
    const old = el.value;
    if (old && old === v) {
      el.classList.add("afp-filled");
      return true;
    }
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.classList.add("afp-filled");
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    let matched = false;
    const nv = String(v).toLowerCase().trim();
    for (const opt of el.options) {
      const ov = String(opt.value).toLowerCase().trim();
      const ot = String(opt.textContent || "").toLowerCase().trim();
      if (ov === nv || ot === nv || ot.includes(nv)) {
        el.value = opt.value;
        matched = true;
        break;
      }
    }
    if (matched) {
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.classList.add("afp-filled");
      return true;
    }
    el.classList.add("afp-detected");
    return false;
  }
  const role = el.getAttribute("role");
  const ce = el.getAttribute("contenteditable");
  if (role === "radio") {
    return setRadio(el, v, key);
  }
  if (role === "checkbox") {
    return setAriaCheckbox(el, v);
  }
  if (role === "textbox" && ce === "true") {
    el.textContent = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.classList.add("afp-filled");
    return true;
  }
  return false;
}

function shouldFill(el, force) {
  if (force) return true;
  if (el instanceof HTMLInputElement) {
    if (el.type === "radio" || el.type === "checkbox") return true;
    return !el.value;
  }
  if (el instanceof HTMLTextAreaElement) return !el.value;
  if (el instanceof HTMLSelectElement) return !el.value;
  const role = el.getAttribute("role");
  const ce = el.getAttribute("contenteditable");
  if (role === "radio" || role === "checkbox") return true;
  if (role === "textbox" && ce === "true") return !el.textContent?.trim();
  return false;
}

function eligibleFields() {
  const q = [
    "input[type=text]",
    "input[type=email]",
    "input[type=tel]",
    "input[type=number]",
    "input[type=url]",
    "input[type=radio]",
    "[role=radio]",
    "input[type=checkbox]",
    "[role=checkbox]",
    "input:not([type])",
    "textarea",
    "select",
    "[role=textbox][contenteditable=true]"
  ];
  return Array.from(document.querySelectorAll(q.join(", ")));
}

function fillAll(force) {
  const profile = AFP_STATE.profiles?.[AFP_STATE.activeProfile] || null;
  if (!profile) return { filled: 0, detected: 0 };
  let filled = 0;
  let detected = 0;
  let radiosAttempted = 0;
  let radiosMatched = 0;
  const fields = eligibleFields();
  for (const el of fields) {
    if (!(el instanceof Element)) continue;
    const isRadioEl = (el.getAttribute && el.getAttribute("type") === "radio") || (el.getAttribute && el.getAttribute("role") === "radio");
    if (isRadioEl) radiosAttempted++;
    const c = fieldCandidates(el);
    const key = pickKey(c, el);
    if (key) {
      const val = valueForKey(profile, key);
      if (!val) {
        el.classList.add("afp-unknown");
        detected++;
        continue;
      }
      if (!shouldFill(el, force)) continue;
      const ok = setValue(el, val, key);
      if (isRadioEl && ok) radiosMatched++;
      if (ok) filled++; else detected++;
    }
  }
  return { filled, detected, radiosAttempted, radiosMatched };
}

function loadState(cb) {
  chrome.storage.local.get(["profiles", "activeProfile", "autoFillEnabled"], r => {
    AFP_STATE.profiles = r.profiles || null;
    AFP_STATE.activeProfile = r.activeProfile || "default";
    AFP_STATE.autoFillEnabled = typeof r.autoFillEnabled === "undefined" ? false : !!r.autoFillEnabled;
    
    const p = AFP_STATE.profiles && AFP_STATE.activeProfile ? AFP_STATE.profiles[AFP_STATE.activeProfile] : null;
    KEY_TOKENS = buildTokens(p);
    
    cb && cb();
  });
}

function observe() {
  const fn = () => fillAll(false);
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      fn();
    }, 300);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
}

function clearAll() {
  const fields = eligibleFields();
  let cleared = 0;
  for (const el of fields) {
    if (!(el instanceof Element)) continue;
    
    // Clear the value based on type
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) {
          el.checked = false;
          el.removeAttribute("data-afp-locked");
          cleared++;
        }
      } else {
        if (el.value) {
          el.value = "";
          cleared++;
        }
      }
    } else if (el instanceof HTMLSelectElement) {
      if (el.selectedIndex !== -1) {
        el.selectedIndex = -1;
        cleared++;
      }
    } else if (el.isContentEditable) {
       if (el.textContent) {
         el.textContent = "";
         cleared++;
       }
    }

    // Always dispatch events to notify page scripts
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.classList.remove("afp-filled", "afp-detected", "afp-unknown");
  }
  return cleared;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "AFP_FILL_NOW") {
    loadState(() => {
      const res = fillAll(true);
      sendResponse(res);
    });
    return true;
  }
  if (msg && msg.type === "AFP_CLEAR_FIELDS") {
    const count = clearAll();
    sendResponse({ cleared: count });
    return true;
  }
});

loadState(() => {});
