// Test script to verify the 5 test cases for AI prompt generation

const SOFTWARE_KEYWORDS = [
  "pharmacy app", "medical software", "pos software", "billing software",
  "inventory management", "accounting software", "software", "app", "application",
  "pos", "crm", "billing", "erp", "saas", "dashboard", "portal", "system",
  "tally", "tallybook", "cloud software", "gst billing", "stock management", "fintech",
  "purchase bill", "medical store", "pharmacy store", "chemist"
];

const FOOTWEAR_KEYWORDS = [
  "footwear", "shoe", "shoes", "sneaker", "sneakers", "sandal", "sandals",
  "boots", "slippers", "heels", "loafers", "चप्पल", "जूते"
];

const GARMENT_KEYWORDS = [
  "garment", "garments", "clothing", "apparel", "dress", "saree", "shirt",
  "t-shirt", "jeans", "fabric", "textile", "fashion wear", "suit", "kurti", "कपड़े"
];

const MARKETING_APP_KEYWORDS = [
  "whatsapp marketing", "whatsapp", "social media post", "social media", "shree template",
  "post app", "marketing app", "bulk whatsapp", "bulk messenger", "poster maker",
  "campaign app", "social media app", "template app", "marketing software", "poster app"
];

const PHARMACY_KEYWORDS = [
  "pharmacy app", "medical software", "pharmacy store", "chemist", "medical store",
  "pharmacy billing", "medicine stock", "pharmacy", "medicine", "chemist shop",
  "prescription", "blister pack"
];

const POS_SOFTWARE_KEYWORDS = [
  "pos application", "pos software", "point of sale", "pos system", "pos",
  "retail pos", "billing software", "billing system", "retail billing",
  "store application", "retail store application", "inventory management",
  "accounting software", "barcode billing", "gst billing software", "billing app",
  "tallybook", "tally book"
];

const GENERAL_SOFTWARE_KEYWORDS = [
  "software", "app", "application", "erp", "crm", "saas", "dashboard",
  "portal", "system", "fintech", "cloud software", "gst billing", "tally"
];

function resolvePromptContext(opts) {
  const customRaw = (opts.customPrompt || "").trim();
  const customLower = customRaw.toLowerCase();
  const categoryRaw = (opts.productCategory || "").trim();
  const categoryLower = categoryRaw.toLowerCase();
  const businessRaw = (opts.businessType || "").trim();
  const businessLower = businessRaw.toLowerCase();

  let domain = "general";
  let softwareKind = undefined;

  // Priority 1: Custom Instructions (Absolute ground truth)
  if (MARKETING_APP_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "software";
    softwareKind = "marketing_app";
  } else if (PHARMACY_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "software";
    softwareKind = "pharmacy";
  } else if (POS_SOFTWARE_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "software";
    softwareKind = "pos_software";
  } else if (GENERAL_SOFTWARE_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "software";
    softwareKind = "general_saas";
  } else if (FOOTWEAR_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "footwear";
  } else if (GARMENT_KEYWORDS.some((kw) => customLower.includes(kw))) {
    domain = "garments";
  }
  // Priority 2: Product Category
  else if (MARKETING_APP_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "software";
    softwareKind = "marketing_app";
  } else if (PHARMACY_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "software";
    softwareKind = "pharmacy";
  } else if (POS_SOFTWARE_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "software";
    softwareKind = "pos_software";
  } else if (GENERAL_SOFTWARE_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "software";
    softwareKind = "general_saas";
  } else if (FOOTWEAR_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "footwear";
  } else if (GARMENT_KEYWORDS.some((kw) => categoryLower.includes(kw))) {
    domain = "garments";
  }
  // Priority 3: Business Type
  else if (businessLower.includes("pharmacy") || businessLower.includes("medical")) {
    domain = "software";
    softwareKind = "pharmacy";
  } else if (POS_SOFTWARE_KEYWORDS.some((kw) => businessLower.includes(kw))) {
    domain = "software";
    softwareKind = "pos_software";
  } else if (SOFTWARE_KEYWORDS.some((kw) => businessLower.includes(kw))) {
    domain = "software";
    softwareKind = "general_saas";
  } else if (businessLower.includes("footwear")) {
    domain = "footwear";
  } else if (businessLower.includes("clothing") || businessLower.includes("garment") || businessLower.includes("fashion")) {
    domain = "garments";
  }

  let brandOrProductName = "";
  if (customLower.includes("shree template")) {
    brandOrProductName = "Shree Template";
  } else if (customLower.includes("tallybook") || customLower.includes("tally book")) {
    brandOrProductName = "TallyBook POS";
  } else {
    const customBrandMatch = customRaw.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+(?:for|app|software|pos|billing|solutions)/i);
    if (customBrandMatch && customBrandMatch[1] && !/^(the|our|this|new|best|top|all)$/i.test(customBrandMatch[1])) {
      brandOrProductName = customBrandMatch[1];
    } else if (categoryRaw && categoryLower !== "other") {
      brandOrProductName = categoryRaw;
    } else if (businessRaw && businessLower !== "other") {
      brandOrProductName = businessRaw;
    }
  }

  if (!brandOrProductName) {
    if (softwareKind === "marketing_app") {
      brandOrProductName = "Shree Template";
    } else if (softwareKind === "pos_software") {
      brandOrProductName = "TallyBook POS";
    } else if (softwareKind === "pharmacy") {
      brandOrProductName = "Pharmacy Management";
    } else if (domain === "software") {
      brandOrProductName = "Smart Software Solutions";
    } else if (domain === "footwear") {
      brandOrProductName = "Premium Footwear";
    } else if (domain === "garments") {
      brandOrProductName = "Exclusive Fashion";
    } else {
      brandOrProductName = "Exclusive Store";
    }
  }

  let resolvedBusinessType = businessRaw;
  if (resolvedBusinessType.toLowerCase() === "other" || !resolvedBusinessType) {
    if (softwareKind === "marketing_app") {
      resolvedBusinessType = `${brandOrProductName} Application`;
    } else if (softwareKind === "pos_software") {
      resolvedBusinessType = `${brandOrProductName} Solutions`;
    } else if (softwareKind === "pharmacy") {
      resolvedBusinessType = `${brandOrProductName} Solutions`;
    } else if (domain === "software") {
      resolvedBusinessType = `${brandOrProductName} Solutions`;
    } else if (domain === "footwear") {
      resolvedBusinessType = "Premium Footwear Store";
    } else if (domain === "garments") {
      resolvedBusinessType = "Exclusive Fashion & Garments";
    } else {
      resolvedBusinessType = brandOrProductName || "Premium Retail Solutions";
    }
  }

  const isCustomOccasion = (opts.occasion || "").toLowerCase() === "custom" || !opts.occasion?.trim();
  let resolvedOccasion = (opts.occasion || "").trim();
  if (isCustomOccasion) {
    resolvedOccasion = "Special Promotional Showcase";
  }

  return {
    domain,
    softwareKind,
    brandOrProductName,
    productCategory: categoryRaw,
    resolvedBusinessType,
    resolvedOccasion,
    isCustomOccasion,
  };
}

function buildDomainImagePrompt(opts) {
  const ratioLabel = "Portrait 9:16 (1080x1920)";

  if (opts.domain === "software") {
    if (opts.softwareKind === "marketing_app") {
      const brandName = opts.brandOrProductName || "Shree Template";
      return [
        `Professional commercial SaaS application marketing poster visual for ${brandName} - WhatsApp Marketing & Social Media Post App.`,
        `Main Subject: Modern high-end smartphone mockup prominently displaying the ${brandName} application interface with colorful WhatsApp messaging campaigns, social media poster maker tools, and creative templates.`,
        `Visual Elements: Floating clean preview cards showcasing professional social media post templates, attractive promotional poster designs, WhatsApp marketing campaign metrics, and creative image and video marketing previews. Clean modern software dashboard UI in the background with subtle digital marketing workspace aesthetics.`,
        `Typography & Composition: Bold elegant headline "${brandName}" with subheadline "WhatsApp Marketing & Social Media Post App", clean visual hierarchy, ample negative space for text overlays.`,
        `Atmosphere & Palette: Vibrant emerald green, deep tech purple, cyan, and clean white accents. Crisp studio lighting, soft glassmorphism shadows, photorealistic 8k commercial quality, realistic smartphone reflections. Aspect ratio: ${ratioLabel}.`,
        `STRICT RESTRICTIONS: Absolutely NO pharmacy, NO pharmacist, NO medical store, NO medicines, NO hospital, NO golden curtains, NO fabric drape, NO shoes, NO garments. Do NOT burn Hindi script into the background visual.`
      ].join(" ");
    }

    if (opts.softwareKind === "pos_software") {
      const brandName = opts.brandOrProductName || "TallyBook POS";
      const occasionFestiveDetails = (!opts.isCustomOccasion && opts.occasion && opts.occasion.toLowerCase() !== "custom")
        ? `Setting subtly incorporates warm tasteful ${opts.occasion} festive celebration elements (warm ambient festive lights, subtle celebratory decorative accents in the background) while keeping the POS billing hardware and software screen as the prominent hero subject.`
        : `Setting features a clean, modern commercial retail aesthetic with realistic store lighting.`;

      return [
        `Professional photorealistic commercial advertisement photography for ${brandName} Retail POS and Store Management Software.`,
        `Main Subject: Modern Point of Sale (POS) computer billing workstation on a sleek, polished retail checkout counter. Crisp high-resolution desktop monitor prominently displaying an intuitive ${brandName} POS software dashboard with real-time sales analytics charts, inventory stock tracking, and fast billing interface.`,
        `Hardware & Counter Details: Ergonomic handheld laser barcode scanner, high-speed thermal receipt printer with a freshly printed GST receipt, and sleek digital payment card terminal neatly arranged on the counter.`,
        `Setting & Atmosphere: Professional Indian retail business owner or store manager professionally operating the POS billing system. Clean modern multi-category retail store environment in the background with subtle softly blurred retail displays (apparel racks, footwear shelves, or packaged retail goods). ${occasionFestiveDetails}`,
        `Lighting & Palette: Bright balanced commercial retail lighting, crisp reflections on screen and counter, sharp textures, high depth of field. Modern tech blue, slate gray, and clean crisp white color palette.`,
        `Composition: Premium commercial product photography with sharp focus on the POS hardware and dashboard interface. Clean ample negative space in the upper and center sections for promotional text overlays. Aspect ratio: ${ratioLabel}.`,
        `STRICT NEGATIVE RESTRICTIONS: Absolutely NO pharmacy, NO medicines, NO pills, NO blister packs, NO medical shelves, NO doctor, NO chemist shop. Absolutely NO festive golden curtains, NO decorative draped fabrics, NO floating fantasy holographic icons, NO fake unreadable gibberish text. Do NOT burn Hindi or text into the image.`
      ].join(" ");
    }

    if (opts.softwareKind === "pharmacy") {
      const brandName = opts.brandOrProductName || "TallyBook POS";
      return [
        `Professional photorealistic commercial advertisement photography for ${brandName} Pharmacy Management Software.`,
        `Setting: Modern Indian retail pharmacy store interior with neatly organized glass medicine shelves, authentic branded medicine cartons, blister packs, and syrup bottles.`,
        `Subjects & Action: Professional Indian pharmacist in clean formal attire at the modern retail billing counter, operating a desktop computer and tablet POS terminal. Handheld laser barcode scanner actively scanning a medicine package at the counter.`,
        `Workflow Concept: Organized purchase invoice papers, medicine stock management clipboard, and clean digital billing station.`,
        `Atmosphere & Palette: Modern medical blue, clean crisp white, and subtle healthcare mint green color palette. Bright balanced commercial pharmacy lighting, natural reflections, sharp textures, high depth of field.`,
        `Composition: Premium commercial product photography with ample clean negative space in the upper and center sections for promotional text overlays. Aspect ratio: ${ratioLabel}.`,
        `STRICT NEGATIVE RESTRICTIONS: Absolutely NO festive golden curtains, NO decorative fabrics, NO floating fantasy holographic icons, NO fake unreadable gibberish text, NO shoes, NO footwear, NO clothing, NO fashion accessories. Do NOT burn Hindi or text into the image.`
      ].join(" ");
    }

    const brandName = opts.brandOrProductName || "Smart SaaS Solutions";
    return [
      `Professional commercial SaaS application marketing visual for ${brandName}.`,
      `Main Subject: Modern sleek laptop and tablet mockup displaying intuitive cloud software dashboard with analytics charts, workflow automation cards, and responsive digital interface.`,
      `Setting: High-end minimalist tech office workspace with soft ambient studio lighting, deep blue and slate gray palette, crisp composition, ample negative space for promotional copy. Aspect ratio: ${ratioLabel}.`,
      `STRICT RESTRICTIONS: NO pharmacy, NO medicines, NO golden curtains, NO shoes, NO clothing.`
    ].join(" ");
  }

  if (opts.domain === "footwear") {
    const item = opts.productCategory || "Footwear";
    const brandName = opts.brandOrProductName || opts.businessType || "Premium Footwear";
    return [
      `High-end commercial studio product photography showcasing premium ${item} by ${brandName}.`,
      `Setting: Minimalist contemporary studio pedestal with dramatic cinematic rim lighting and polished reflective floor.`,
      `Details: Ultra-detailed footwear craftsmanship, rich material texture, precision stitching, clean sole ergonomics, dynamic 45-degree hero angle.`,
      `Atmosphere & Palette: Elegant commercial lighting with soft gradients and realistic contact shadows.`,
      `Composition: Clean negative space for marketing text and price badges. Aspect ratio: ${ratioLabel}.`,
      `STRICT NEGATIVE RESTRICTIONS: NO cluttered backgrounds, NO deformed geometry, NO random text.`
    ].join(" ");
  }

  if (opts.domain === "garments") {
    const item = opts.productCategory || "Apparel";
    const brandName = opts.brandOrProductName || opts.businessType || "Exclusive Fashion";
    return [
      `Luxury commercial fashion advertisement photography showcasing ${item} by ${brandName}.`,
      `Setting: High-end boutique showroom or minimalist editorial studio with elegant architectural lines.`,
      `Details: Premium garment craftsmanship, rich fabric textures, natural drape, sophisticated apparel presentation.`,
      `Atmosphere & Palette: Soft diffused studio illumination, warm elegant tones, subtle natural contrast.`,
      `Composition: Clean negative space for promotional headlines. Aspect ratio: ${ratioLabel}.`
    ].join(" ");
  }

  const brandName = opts.brandOrProductName || opts.businessType || "Exclusive Store";
  return [
    `Cinematic 4K commercial promotional advertisement visual featuring ${brandName}.`,
    `Setting: High-end commercial studio environment with elegant pedestal and professional multi-point lighting.`,
    `Atmosphere: Crisp commercial lighting, vivid natural colors, realistic shadows, premium product photography.`,
    `Composition: Clean composition with ample negative space for text overlays. Aspect ratio: ${ratioLabel}.`
  ].join(" ");
}

// RUN TESTS
const testCases = [
  {
    id: "Test Case A",
    name: "Other + POS Application + Custom",
    input: {
      businessType: "Other",
      productCategory: "POS Application",
      occasion: "Custom",
      customPrompt: "Tally Book POS for Garments, Footwear, Retail Store Application"
    },
    asserts: (ctx, prompt) => {
      if (ctx.domain !== "software") throw new Error("Test A domain must be software");
      if (ctx.softwareKind !== "pos_software") throw new Error("Test A softwareKind must be pos_software");
      if (ctx.brandOrProductName !== "TallyBook POS") throw new Error("Test A brand must be TallyBook POS");
      const [subject, negative] = prompt.split("STRICT NEGATIVE RESTRICTIONS:");
      if (subject.toLowerCase().includes("pharmacy")) throw new Error("Test A subject must NOT contain pharmacy");
      if (subject.toLowerCase().includes("golden curtain")) throw new Error("Test A subject must NOT contain golden curtain");
      if (!subject.toLowerCase().includes("pos")) throw new Error("Test A subject must contain POS");
      if (!subject.toLowerCase().includes("point of sale")) throw new Error("Test A subject must contain point of sale");
      if (!negative.includes("NO pharmacy")) throw new Error("Test A negative restrictions must contain NO pharmacy");
    }
  },
  {
    id: "Test Case B",
    name: "Garments + Garments + Custom",
    input: {
      businessType: "Garments",
      productCategory: "Garments",
      occasion: "Custom",
      customPrompt: ""
    },
    asserts: (ctx, prompt) => {
      if (ctx.domain !== "garments") throw new Error("Test B domain must be garments");
      const [subject] = prompt.split("STRICT");
      if (subject.toLowerCase().includes("pharmacy")) throw new Error("Test B subject must NOT contain pharmacy");
      if (!subject.toLowerCase().includes("fashion") && !subject.toLowerCase().includes("garment")) throw new Error("Test B subject must describe garments/fashion");
    }
  },
  {
    id: "Test Case C",
    name: "Footwear + Footwear + Custom",
    input: {
      businessType: "Footwear",
      productCategory: "Footwear",
      occasion: "Custom",
      customPrompt: ""
    },
    asserts: (ctx, prompt) => {
      if (ctx.domain !== "footwear") throw new Error("Test C domain must be footwear");
      const [subject] = prompt.split("STRICT");
      if (subject.toLowerCase().includes("pharmacy")) throw new Error("Test C subject must NOT contain pharmacy");
      if (!subject.toLowerCase().includes("footwear")) throw new Error("Test C subject must describe footwear");
    }
  },
  {
    id: "Test Case D",
    name: "Pharmacy + Pharmacy + Custom",
    input: {
      businessType: "Pharmacy",
      productCategory: "Pharmacy",
      occasion: "Custom",
      customPrompt: ""
    },
    asserts: (ctx, prompt) => {
      if (ctx.domain !== "software") throw new Error("Test D domain must be software");
      if (ctx.softwareKind !== "pharmacy") throw new Error("Test D softwareKind must be pharmacy");
      const [subject] = prompt.split("STRICT NEGATIVE RESTRICTIONS:");
      if (!subject.toLowerCase().includes("pharmacy")) throw new Error("Test D subject must describe pharmacy");
      if (subject.toLowerCase().includes("footwear")) throw new Error("Test D subject must NOT describe footwear as subject");
    }
  },
  {
    id: "Test Case E",
    name: "Other + POS Application + Diwali",
    input: {
      businessType: "Other",
      productCategory: "POS Application",
      occasion: "Diwali",
      customPrompt: "Tally Book POS for Retail Stores"
    },
    asserts: (ctx, prompt) => {
      if (ctx.domain !== "software") throw new Error("Test E domain must be software");
      if (ctx.softwareKind !== "pos_software") throw new Error("Test E softwareKind must be pos_software");
      const [subject] = prompt.split("STRICT NEGATIVE RESTRICTIONS:");
      if (!subject.toLowerCase().includes("diwali")) throw new Error("Test E subject must incorporate subtle Diwali festive celebration elements");
      if (!subject.toLowerCase().includes("pos")) throw new Error("Test E subject must keep POS as hero");
      if (subject.toLowerCase().includes("pharmacy")) throw new Error("Test E subject must NOT contain pharmacy");
    }
  }
];

console.log("=== RUNNING TEST SUITE ===");
let allPassed = true;
for (const tc of testCases) {
  const ctx = resolvePromptContext(tc.input);
  const prompt = buildDomainImagePrompt({
    domain: ctx.domain,
    softwareKind: ctx.softwareKind,
    brandOrProductName: ctx.brandOrProductName,
    productCategory: ctx.productCategory,
    businessType: ctx.resolvedBusinessType,
    occasion: ctx.resolvedOccasion,
    isCustomOccasion: ctx.isCustomOccasion,
    aspectRatio: "9:16",
  });

  try {
    tc.asserts(ctx, prompt);
    console.log(`\x1b[32m✔ ${tc.id}: ${tc.name} PASSED\x1b[0m`);
    console.log(`  Domain: ${ctx.domain}, softwareKind: ${ctx.softwareKind}, brand: ${ctx.brandOrProductName}`);
    console.log(`  Prompt preview: ${prompt.slice(0, 140)}...\n`);
  } catch (err) {
    allPassed = false;
    console.error(`\x1b[31m✖ ${tc.id}: ${tc.name} FAILED\x1b[0m`, err.message);
  }
}

if (allPassed) {
  console.log("\x1b[32mALL 5 TEST CASES PASSED CLEANLY!\x1b[0m");
} else {
  process.exit(1);
}
