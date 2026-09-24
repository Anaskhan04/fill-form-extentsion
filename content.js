const AFP_STATE = { profiles: null, activeProfile: null, autoFillEnabled: false };

function normalizeText(s) {
  if (!s) return "";
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, "$1 $2")
    .toLowerCase()
    .replace(/[`'"\-_,.:;()\[\]{}\/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  // 1. More Specific Fields First (to prevent generic "name" or "text" matches)
  college: ["college", "institute", "school", "campus"],
  university: ["university", "uni"],
  branch: ["branch", "department", "major", "stream"],
  company: ["company", "organization", "business", "employer", "firm"],
  occupation: ["occupation", "job title", "profession", "designation", "role"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "mobile", "contact", "telephone", "tel", "whatsapp", "cell", "cell phone", "phone number", "mobile number"],
  rollNo: ["roll number", "roll no", "roll no.", "roll #", "roll", "enrollment", "enrolment", "enrollment no", "registration number", "registration no", "reg no", "student id", "rollno", "rollnumber"],
  year: ["year", "academic year", "current year"],
  graduation: ["graduation", "grad year", "passout year", "expected graduation"],
  city: ["city", "town"],
  state: ["state", "province"],
  pincode: ["pincode", "postal code", "zip", "zipcode"],
  zip_code: ["zip code", "zip", "postal code", "postcode", "pin code"],
  address_line_1: ["street line 1", "address line 1", "address 1", "street address", "flat no", "house no", "street", "address line1"],
  address_line_2: ["street line 2", "address line 2", "address 2", "apartment", "suite", "unit", "floor", "address line2"],
  address_line_3: ["street line 3", "address line 3", "address 3"],
  full_address: ["full address", "complete address", "full street", "mailing address"],
  country: ["country", "nation", "region"],
  country_code: ["country code", "dialing code", "idd"],
  linkedin: ["linkedin", "linked in", "linkedin url", "profile link"],
  github: ["github", "git hub", "github url", "git hub url"],
  portfolio: ["portfolio", "website", "personal website", "portfolio website", "portfolio url", "site", "web link", "personal site"],
  skills: ["skills", "expertise", "technologies", "stack"],
  username: ["username", "user name", "login id", "screen name", "handle"],
  gender: ["gender", "sex", "identity"],
  age: ["age", "how old"],
  title: ["title", "salutation", "honorific"],
  language: ["language", "lang", "mother tongue", "preferred language"],
  birth_date: ["birth day month year", "date of birth", "dob", "birth date", "birthday", "bday"],
  birth_day: ["birth day", "day of birth", "dob day", "dd"],
  birth_month: ["birth month", "month of birth", "dob month", "mm"],
  birth_year: ["birth year", "year of birth", "dob year", "yyyy"],
  terms: ["terms", "agree", "agreement", "accept", "consent", "policy", "privacy", "user agreement", "i agree", "acknowledge"],

  // 2. Generic Name Fields Last (so "College Name" matches "College" first)
  name_first: ["first name", "given name", "first", "fname", "forename"],
  name_last: ["last name", "surname", "family name", "last", "lname"],
  name_middle: ["middle name", "middle initial"],
  name_suffix: ["suffix", "name suffix"],
  name: ["name", "full name", "candidate name", "your name"]
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
        if (st.length > 5 && similarity(ft, st) >= 0.8) { matches++; break; }
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

const AUTOCOMPLETE_MAP = {
  "name": "name",
  "given-name": "name_first",
  "additional-name": "name_middle",
  "family-name": "name_last",
  "honorific-prefix": "title",
  "honorific-suffix": "name_suffix",
  "nickname": "username",
  "username": "username",
  "email": "email",
  "tel": "phone",
  "tel-national": "phone",
  "tel-country-code": "country_code",
  "street-address": "address_line_1",
  "address-line1": "address_line_1",
  "address-line2": "address_line_2",
  "address-line3": "address_line_3",
  "address-level2": "city",
  "address-level1": "state",
  "postal-code": "pincode",
  "country": "country",
  "country-name": "country",
  "organization": "company",
  "organization-title": "occupation",
  "bday-day": "birth_day",
  "bday-month": "birth_month",
  "bday-year": "birth_year",
  "sex": "gender"
};

function matchAutocomplete(el) {
  if (!(el instanceof Element)) return null;
  const raw = el.getAttribute ? el.getAttribute("autocomplete") : null;
  if (!raw) return null;
  const tokens = String(raw).toLowerCase().trim().split(/\s+/);
  for (const token of tokens) {
    if (AUTOCOMPLETE_MAP[token]) {
      return AUTOCOMPLETE_MAP[token];
    }
  }
  return null;
}

const KINSHIP_TOKENS = new Set([
  "father", "fathers", "mother", "mothers", "parent", "parents",
  "spouse", "spouses", "guardian", "guardians", "emergency",
  "manager", "managers", "reference", "references", "referee",
  "friend", "nominee", "nominees", "employer", "employers"
]);

const SEARCH_TOKENS = new Set([
  "search", "query", "find", "filter", "lookup"
]);

function hasVeto(candidates, el, key) {
  if (el instanceof HTMLInputElement) {
    const t = (el.type || "").toLowerCase();
    if (t === "password" || t === "search") return true;
  }
  const role = el.getAttribute ? (el.getAttribute("role") || "").toLowerCase() : "";
  if (role === "search") return true;

  const rawAutocomplete = el.getAttribute ? (el.getAttribute("autocomplete") || "").toLowerCase() : "";
  if (rawAutocomplete.includes("one-time-code") || rawAutocomplete.includes("password") || rawAutocomplete.includes("cc-")) {
    return true;
  }

  // Check candidate texts
  for (const c of candidates) {
    const text = (c.text || "").toLowerCase();
    const tokens = tokenize(text);
    
    // Check search intent
    for (const st of tokens) {
      if (SEARCH_TOKENS.has(st)) return true;
    }

    // Check security / PIN intent
    const isSecurityField = tokens.some(t => ["password", "passwd", "otp", "cvv", "cvc", "passcode", "passphrase"].includes(t)) ||
      text.includes("atm") || text.includes("security code") || text.includes("verification code") ||
      text.includes("card number") || text.includes("card pin") || text.includes("atm pin") ||
      text.includes("secret code");
    if (isSecurityField) return true;

    // Check PIN disambiguation: if it's "pin", but also has "atm", "card", "bank", "account" -> veto pincode
    if (key === "pincode" || key === "zip_code") {
      if (tokens.includes("atm") || tokens.includes("bank") || tokens.includes("card") || tokens.includes("security") || tokens.includes("account")) {
        return true;
      }
    }

    // Kinship / third-party veto for personal identity fields
    if (["name", "name_first", "name_last", "name_middle", "email", "phone"].includes(key)) {
      if (tokens.some(t => KINSHIP_TOKENS.has(t))) {
        return true;
      }
      
      // Phase 2.1: Third-Party Contact Context Detection
      if (tokens.includes("contact") || tokens.includes("person") || tokens.includes("relationship") || tokens.includes("relation")) {
        const container = el.closest ? (el.closest("fieldset, form, section") || el.ownerDocument.body) : el;
        let sectionText = (container.textContent || "").toLowerCase();
        
        if (container.querySelectorAll) {
          const inputs = container.querySelectorAll("input, select, textarea");
          for (const inp of inputs) {
            sectionText += " " + (inp.name || "") + " " + (inp.placeholder || "") + " " + (inp.getAttribute("aria-label") || "");
          }
        }
        sectionText = sectionText.toLowerCase();
        
        const thirdPartyKeywords = ["relationship", "relation to", "contact person", "emergency", "reference", "sponsor", "guarantor"];
        if (thirdPartyKeywords.some(k => sectionText.includes(k))) {
           return true;
        }
      }
    }

    // If field mentions phone/email/contact, do not fill company
    if (key === "company") {
      if (tokens.some(t => ["phone", "tel", "mobile", "email", "mail", "contact"].includes(t))) {
        return true;
      }
    }

    // Disambiguate academic "year" vs "birth_year": veto academic "year" if candidate indicates birth/dob
    if (key === "year") {
      if (tokens.some(t => ["birth", "born", "dob", "bday", "birthday"].includes(t))) {
        return true;
      }
    }
  }

  return false;
}

function typeBoost(el, key) {
  if (!(el instanceof HTMLInputElement)) return 1;
  const t = (el.type || "").toLowerCase();
  
  // Security & search vetoes
  if (t === "password" || t === "search") return 0;
  
  if (t === "email") {
    if (key === "email") return 1.5;
    if (["phone", "pincode", "zip_code", "rollNo", "graduation", "birth_year"].includes(key)) return 0;
    return 1;
  }
  if (t === "tel") {
    if (key === "phone" || key === "country_code") return 1.5;
    if (["email", "name_first", "name_last", "college", "company"].includes(key)) return 0;
    return 1;
  }
  if (t === "url") {
    if (["linkedin", "github", "portfolio"].includes(key)) return 1.5;
    if (["email", "phone", "name_first", "name_last"].includes(key)) return 0;
    return 1;
  }
  if (t === "date") {
    if (["birth_date", "birth_day", "birth_month", "birth_year", "graduation", "year"].includes(key)) return 1.5;
    if (["name", "name_first", "email", "phone", "company"].includes(key)) return 0;
    return 1;
  }
  
  const isNumericField = t === "number" || /\d\*/.test(el.getAttribute("pattern") || "") || (el.getAttribute("inputmode") || "") === "numeric";
  if (isNumericField) {
    if (["phone", "pincode", "zip_code", "rollNo", "graduation", "birth_day", "birth_year", "age"].includes(key)) return 1.2;
    if (["name", "name_first", "name_last", "email", "full_address"].includes(key)) return 0.5;
  }
  return 1;
}

function pickKey(candidates, el) {
  // 1. Check autocomplete attribute as highest-fidelity signal
  const autoKey = matchAutocomplete(el);
  if (autoKey && KEY_TOKENS[autoKey]) {
    if (!hasVeto(candidates, el, autoKey)) {
      return autoKey;
    }
  }

  const keys = Object.keys(KEY_TOKENS);
  let bestKey = null;
  let bestScore = 0;
  for (const k of keys) {
    const boost = typeBoost(el, k);
    if (boost === 0) continue;
    if (hasVeto(candidates, el, k)) continue;

    let localBest = 0;
    for (const c of candidates) {
      const tokens = tokenize(c.text || "");
      const s = scoreTokens(tokens, k) * (c.w || 1);
      if (s > localBest) localBest = s;
    }
    localBest = localBest * boost;
    if (localBest > bestScore) { bestScore = localBest; bestKey = k; }
  }
  return bestScore >= 0.6 ? bestKey : null;
}

function nearestLabel(el) {
  if (!(el instanceof Element)) return "";
  const id = el.getAttribute ? el.getAttribute("id") : null;
  if (id && el.ownerDocument) {
    try {
      const byFor = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (byFor && byFor.textContent?.trim()) return byFor.textContent.trim();
    } catch (e) {}
  }
  const wrapping = el.closest ? el.closest("label") : null;
  if (wrapping && wrapping.textContent?.trim()) return wrapping.textContent.trim();

  // Check immediate previous sibling (e.g. <label>Name</label><input>)
  let prev = el.previousElementSibling;
  while (prev && (prev.tagName === "SPAN" || prev.tagName === "SMALL" || prev.tagName === "BR") && !prev.textContent?.trim()) {
    prev = prev.previousElementSibling;
  }
  if (prev) {
    if (prev.tagName === "LABEL" && prev.textContent?.trim()) return prev.textContent.trim();
    const innerLabel = prev.querySelector ? prev.querySelector("label") : null;
    if (innerLabel && innerLabel.textContent?.trim()) return innerLabel.textContent.trim();
  }

  // Check immediate next sibling (common for checkboxes/radios: <input><label>Agree</label>)
  let next = el.nextElementSibling;
  if (next) {
    if (next.tagName === "LABEL" && next.textContent?.trim()) return next.textContent.trim();
    const innerLabel = next.querySelector ? next.querySelector("label") : null;
    if (innerLabel && innerLabel.textContent?.trim()) return innerLabel.textContent.trim();
  }

  // Carefully bounded parent context: only if parent has 1 input and 1 label
  let p = el.parentElement;
  for (let i = 0; i < 3 && p; i++) {
    if (p.tagName === "FORM" || p.tagName === "SECTION" || p.tagName === "FIELDSET") break;
    const labels = p.querySelectorAll ? p.querySelectorAll("label") : [];
    const inputs = p.querySelectorAll ? p.querySelectorAll("input, select, textarea, [role=textbox]") : [];
    if (labels.length === 1 && inputs.length === 1) {
      if (labels[0].textContent?.trim()) return labels[0].textContent.trim();
    }
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

function contextText(el) {
  if (!(el instanceof Element)) return "";
  const texts = [];
  // 1. Fieldset legend
  const fieldset = el.closest ? el.closest("fieldset") : null;
  if (fieldset) {
    const legend = fieldset.querySelector ? fieldset.querySelector("legend") : null;
    if (legend && legend.textContent?.trim()) texts.push(legend.textContent.trim());
  }
  // 2. Form identity
  if (el.form) {
    const formLabel = el.form.getAttribute ? el.form.getAttribute("aria-label") : "";
    const formId = el.form.id || "";
    const formName = el.form.name || "";
    if (formLabel) texts.push(formLabel);
    if (formName) texts.push(formName);
    if (formId) texts.push(formId);
  }
  // 3. Nearby heading
  let p = el;
  for (let i = 0; i < 3 && p; i++) {
    if (p.tagName === "FORM" || p.tagName === "SECTION" || p.tagName === "FIELDSET") break;
    let sib = p.previousElementSibling;
    let found = false;
    while (sib) {
      if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(sib.tagName)) {
        if (sib.textContent?.trim()) texts.push(sib.textContent.trim());
        found = true;
        break;
      }
      sib = sib.previousElementSibling;
    }
    if (found) break;
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
  c.push({ text: contextText(el), w: 0.4 });
  return c;
}

function valueForKey(profile, key) {
  if (!profile) return "";

  if (key === "name_first") {
    const n = profile.name_first || profile.personal?.name_first || profile.personal?.first_name || profile.first_name || "";
    if (n) return n;
    return splitName(profile.name || profile.personal?.name || "").first;
  }
  if (key === "name_last") {
    const n = profile.name_last || profile.personal?.name_last || profile.personal?.last_name || profile.last_name || "";
    if (n) return n;
    return splitName(profile.name || profile.personal?.name || "").last;
  }

  // Handle Address fields (clean readable strings, NEVER raw JSON objects)
  if (key === "address" || key === "full_address" || key === "address_line_1") {
    if (typeof profile.full_address === "string" && profile.full_address.trim()) {
      return profile.full_address.trim();
    }
    if (typeof profile.address === "string" && profile.address.trim()) {
      return profile.address.trim();
    }
    const addrObj = (profile.address && typeof profile.address === "object") ? profile.address : profile;
    if (addrObj) {
      if (typeof addrObj.full_address === "string" && addrObj.full_address.trim()) {
        return addrObj.full_address.trim();
      }
      const parts = [
        addrObj.address_line_1,
        addrObj.address_line_2,
        addrObj.city,
        addrObj.state,
        addrObj.pincode || addrObj.zip_code,
        addrObj.country
      ].filter(p => typeof p === "string" && p.trim());
      if (parts.length > 0) return parts.join(", ");
    }
  }

  // Handle nested Skills object
  if (profile.skills && typeof profile.skills === 'object' && !Array.isArray(profile.skills)) {
    if (key === "skills") {
      return Object.values(profile.skills).flat().join(", ");
    }
  }

  // Handle nested Hackathon object
  if (profile.hackathon && key in profile.hackathon) {
    return profile.hackathon[key];
  }

  // Direct lookup
  let val = profile[key];

  // Fallbacks in nested objects (personal, contact, address, education, professional, work)
  if (!val || typeof val === "object") {
    const sections = ["personal", "contact", "address", "education", "professional", "work"];
    for (const sec of sections) {
      if (profile[sec] && typeof profile[sec] === "object") {
        if (profile[sec][key] && typeof profile[sec][key] !== "object") {
          val = profile[sec][key];
          break;
        }
      }
    }
  }

  if (key === "birth_date") {
    if (profile.birth_date) return profile.birth_date;
    if (profile.dob) return profile.dob;
    if (profile.date_of_birth) return profile.date_of_birth;
    if (profile.personal?.birth_date) return profile.personal.birth_date;
    if (profile.personal?.dob) return profile.personal.dob;
    const y = profile.birth_year || profile.personal?.birth_year;
    const m = profile.birth_month || profile.personal?.birth_month;
    const d = profile.birth_day || profile.personal?.birth_day;
    if (y && m && d) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${dd}/${mm}/${y}`;
    }
    if (y && m) {
      const mm = String(m).padStart(2, "0");
      return `${mm}/${y}`;
    }
    if (y) return String(y);
  }

  // Common aliases
  if (!val) {
    if (key === "phone") {
      val = profile.phone || profile.mobile || profile.contact?.phone || profile.contact?.mobile || profile.personal?.phone || "";
    } else if (key === "email") {
      val = profile.email || profile.personal?.email || profile.contact?.email || "";
    } else if (key === "name") {
      val = profile.name || profile.personal?.name || profile.full_name || "";
    } else if (key === "city") {
      val = profile.city || profile.address?.city || "";
    } else if (key === "state") {
      val = profile.state || profile.address?.state || "";
    } else if (key === "pincode" || key === "zip_code") {
      val = profile.pincode || profile.zip_code || profile.address?.pincode || profile.address?.zip_code || "";
    } else if (key === "country") {
      val = profile.country || profile.address?.country || "";
    } else if (key === "portfolio" || key === "website") {
      val = profile.portfolio || profile.website || profile.personal_website || profile.portfolio_url || profile.site || profile.links?.portfolio || profile.links?.website || "";
    } else if (key === "linkedin") {
      val = profile.linkedin || profile.linkedin_url || profile.links?.linkedin || "";
    } else if (key === "github") {
      val = profile.github || profile.github_url || profile.links?.github || "";
    }
  }

  // Safety: NEVER return raw JSON object string to web form inputs
  if (typeof val === "object" && val !== null) {
    return "";
  }

  return val || "";
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

function normalizeOrdinalOrNumber(token) {
  const t = String(token || "").toLowerCase().trim();
  if (t === "1" || t === "1st" || t === "first" || t === "i") return "1";
  if (t === "2" || t === "2nd" || t === "second" || t === "ii") return "2";
  if (t === "3" || t === "3rd" || t === "third" || t === "iii") return "3";
  if (t === "4" || t === "4th" || t === "fourth" || t === "iv" || t === "final") return "4";
  return t;
}

function setRadio(el, v, key) {
  const role = el.getAttribute && el.getAttribute("role");
  const isGender = key === "gender";
  const targetTokens = isGender ? genderSynonymsSet(v) : tokenSet(v);
  const normalizedV = normalizeText(v);

  // Extract year/number from target if key is year/graduation
  let targetNumber = null;
  if (key === "year" || key === "graduation") {
    for (const t of targetTokens) {
      const norm = normalizeOrdinalOrNumber(t);
      if (["1", "2", "3", "4"].includes(norm)) {
        targetNumber = norm;
        break;
      }
    }
  }

  // Scoring function across all radio options
  const scoreOption = (label, value) => {
    const valStr = normalizeText(value || "");
    const lblStr = normalizeText(label || "");

    // 1. Exact Value or Label match
    if (valStr === normalizedV || lblStr === normalizedV) return 100;

    const fullCandidateStr = label + " " + (value || "");
    const candidateTokens = tokenSet(fullCandidateStr);

    // 2. Year-specific number matching
    if (key === "year" || key === "graduation") {
      let candNumber = null;
      for (const ct of candidateTokens) {
        const norm = normalizeOrdinalOrNumber(ct);
        if (["1", "2", "3", "4"].includes(norm)) {
          candNumber = norm;
          break;
        }
      }

      if (targetNumber && candNumber) {
        if (targetNumber === candNumber) return 90; // Exactly matching year number
        return -100; // Explicit year mismatch
      }
      if (!targetNumber && candNumber) {
        return -100; // Profile doesn't specify 1/2/3/4, don't blindly select
      }
    }

    // 3. Gender matching
    if (isGender) {
      for (const t of targetTokens) {
        if (candidateTokens.has(t)) return 80;
      }
      return 0;
    }

    // 4. Token set matching (excluding category stopword)
    let score = 0;
    for (const t of targetTokens) {
      if (t === key || t === "year" || t === "option" || t === "choice") continue;
      if (candidateTokens.has(t)) {
        score += 10;
      }
    }
    return score;
  };

  if (role === "radio") {
    let root = el.closest('[role="radiogroup"]') || el.parentElement || document;
    const candidates = Array.from(root.querySelectorAll ? root.querySelectorAll('[role="radio"]') : []);

    let bestScore = 0;
    let bestCandidate = null;

    for (const r of candidates) {
      const label = (r.getAttribute("aria-label") || "") + " " + (r.textContent || "");
      const s = scoreOption(label, r.getAttribute("value"));
      if (s > bestScore) {
        bestScore = s;
        bestCandidate = r;
      }
    }

    if (bestCandidate && bestScore > 0) {
      const isOn = (bestCandidate.getAttribute("aria-checked") || "").toLowerCase() === "true";
      if (!isOn && bestCandidate.getAttribute("data-afp-locked") !== "1") {
        bestCandidate.click();
        bestCandidate.setAttribute("data-afp-locked", "1");
      }
      bestCandidate.classList.add("afp-filled");
      return true;
    }
    return false;
  }

  const name = el.getAttribute("name");
  if (!name) return false;
  const group = Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`));

  let bestScore = 0;
  let bestCandidate = null;

  for (const r of group) {
    const label = labelTextFor(r);
    const s = scoreOption(label, r.value);
    if (s > bestScore) {
      bestScore = s;
      bestCandidate = r;
    }
  }

  if (bestCandidate && bestScore > 0) {
    if (!bestCandidate.checked) {
      bestCandidate.click();
      bestCandidate.checked = true;
      bestCandidate.dispatchEvent(new Event("change", { bubbles: true }));
    }
    bestCandidate.classList.add("afp-filled");
    return true;
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

function setNativeValue(el, val) {
  let prototype;
  if (el instanceof HTMLInputElement) prototype = window.HTMLInputElement.prototype;
  else if (el instanceof HTMLTextAreaElement) prototype = window.HTMLTextAreaElement.prototype;
  else if (el instanceof HTMLSelectElement) prototype = window.HTMLSelectElement.prototype;
  else return;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  const nativeSet = descriptor ? descriptor.set : null;
  
  if (nativeSet) {
    nativeSet.call(el, val);
  } else {
    el.value = val;
  }
}

function formatDateForInput(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const month = m1[2].padStart(2, "0");
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m2) {
    const year = m2[1];
    const month = m2[2].padStart(2, "0");
    const day = m2[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return s;
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
    let finalVal = v;
    if (el.type === "date") {
      finalVal = formatDateForInput(v);
    }
    const old = el.value;
    if (old && old === finalVal) {
      el.classList.add("afp-filled");
      return true;
    }
    setNativeValue(el, finalVal);
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
        setNativeValue(el, opt.value);
        matched = true;
        break;
      }
    }
    if (matched) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
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
    "input[type=date]",
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

function showPageToast(message, type = "info") {
  let toast = document.getElementById("afp-toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "afp-toast-notification";
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 380px;
      pointer-events: none;
    `;
    (document.body || document.documentElement).appendChild(toast);
  }

  if (type === "success") {
    toast.style.backgroundColor = "#10b981";
  } else if (type === "warning") {
    toast.style.backgroundColor = "#f59e0b";
  } else {
    toast.style.backgroundColor = "#2563eb";
  }

  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 3500);
}

function fillAll(force) {
  const profile = AFP_STATE.profiles?.[AFP_STATE.activeProfile] || null;
  if (!profile) {
    if (force) {
      showPageToast("⚠️ AutoForm Pro: No profile found. Open settings to add your data.", "warning");
    }
    return { filled: 0, detected: 0 };
  }
  let filled = 0;
  let detected = 0;
  let radiosAttempted = 0;
  let radiosMatched = 0;
  const fields = eligibleFields();
  for (const el of fields) {
    if (!(el instanceof Element)) continue;
    if (!shouldFill(el, force)) continue;
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
      const ok = setValue(el, val, key);
      if (isRadioEl && ok) radiosMatched++;
      if (ok) filled++; else detected++;
    }
  }

  if (force) {
    if (filled > 0) {
      showPageToast(`⚡ AutoForm Pro: Successfully filled ${filled} field(s)!`, "success");
    } else if (detected > 0) {
      showPageToast(`ℹ️ AutoForm Pro: Detected ${detected} field(s), but profile values are empty.`, "warning");
    } else {
      showPageToast("ℹ️ AutoForm Pro: No fillable fields detected on this page.", "info");
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
    
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) {
          el.checked = false;
          el.removeAttribute("data-afp-locked");
          cleared++;
        }
      } else {
        if (el.value) {
          setNativeValue(el, "");
          cleared++;
        }
      }
    } else if (el instanceof HTMLSelectElement) {
      if (el.selectedIndex !== -1) {
        setNativeValue(el, "");
        cleared++;
      }
    } else if (el.isContentEditable) {
       if (el.textContent) {
         el.textContent = "";
         cleared++;
       }
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.classList.remove("afp-filled", "afp-detected", "afp-unknown");
  }

  showPageToast(`🧹 AutoForm Pro: Cleared ${cleared} field(s).`, "info");
  return cleared;
}

let observerActive = false;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "AFP_FILL_NOW") {
    loadState(() => {
      const res = fillAll(true);
      if (!observerActive) {
        observe();
        observerActive = true;
      }
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
