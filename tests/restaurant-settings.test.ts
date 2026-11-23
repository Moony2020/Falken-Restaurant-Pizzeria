import assert from "node:assert/strict";
import { test } from "node:test";
import {
  derivePhoneHref,
  isAllowedImageForSlot,
  isValidFacebookUrl,
  isValidInstagramUrl,
  isValidMapsUrl,
  isValidPhoneNumber,
  resolveEffectiveSettings,
  restaurantSettingsEditSchema,
  settingsEditFingerprint,
} from "../src/server/restaurant-settings-service.ts";

test("derivePhoneHref derives E.164 tel: URI from local Swedish and international phone numbers", () => {
  assert.equal(derivePhoneHref("019 29 48 98"), "tel:+4619294898");
  assert.equal(derivePhoneHref("019-29 48 98"), "tel:+4619294898");
  assert.equal(derivePhoneHref("019294898"), "tel:+4619294898");
  assert.equal(derivePhoneHref("+46 19 29 48 98"), "tel:+4619294898");
  assert.equal(derivePhoneHref("0046 19 29 48 98"), "tel:+4619294898");
  assert.equal(derivePhoneHref(""), "tel:+4619294898"); // fallback default
});

test("isValidPhoneNumber validates Swedish and standard phone shapes", () => {
  assert.equal(isValidPhoneNumber("019 29 48 98"), true);
  assert.equal(isValidPhoneNumber("+4619294898"), true);
  assert.equal(isValidPhoneNumber("070-123 45 67"), true);
  assert.equal(isValidPhoneNumber("123"), false); // too short
  assert.equal(isValidPhoneNumber("abc-def-ghij"), false);
  assert.equal(isValidPhoneNumber("019<script>"), false);
});

test("isValidMapsUrl strictly restricts to Google Maps over HTTPS without credentials", () => {
  assert.equal(
    isValidMapsUrl("https://www.google.com/maps/search/?api=1&query=Restaurang+Falken"),
    true,
  );
  assert.equal(isValidMapsUrl("https://maps.google.com/?q=Skolgatan+4"), true);

  // Shortened URLs (goo.gl) and non-maps Google URLs rejected
  assert.equal(isValidMapsUrl("https://maps.app.goo.gl/xyz123"), false); // shortener rejected
  assert.equal(isValidMapsUrl("https://goo.gl/maps/xyz123"), false); // shortener rejected
  assert.equal(isValidMapsUrl("https://www.google.com/search?q=test"), false); // non-maps path rejected

  // Insecure or unapproved domains
  assert.equal(isValidMapsUrl("http://maps.google.com/"), false); // http rejected
  assert.equal(isValidMapsUrl("https://evil.com/maps"), false);
  assert.equal(isValidMapsUrl("https://google.com.evil.com/maps"), false);
  assert.equal(isValidMapsUrl("https://user:pass@maps.google.com/"), false); // credentials rejected
  assert.equal(isValidMapsUrl("javascript:alert(1)"), false);
  assert.equal(isValidMapsUrl("data:text/html,test"), false);
});

test("isValidFacebookUrl and isValidInstagramUrl enforce HTTPS and legitimate domains", () => {
  assert.equal(isValidFacebookUrl("https://www.facebook.com/FalkenVintrosa/"), true);
  assert.equal(isValidFacebookUrl("https://facebook.com/FalkenVintrosa/"), true);
  assert.equal(isValidFacebookUrl("http://facebook.com/FalkenVintrosa/"), false);
  assert.equal(isValidFacebookUrl("https://facebook.com.phishing.com/"), false);
  assert.equal(isValidFacebookUrl("https://user:pass@facebook.com/"), false);

  assert.equal(isValidInstagramUrl("https://www.instagram.com/falkenvintrosa/"), true);
  assert.equal(isValidInstagramUrl("https://instagram.com/falkenvintrosa/"), true);
  assert.equal(isValidInstagramUrl("http://instagram.com/falkenvintrosa/"), false);
  assert.equal(isValidInstagramUrl("https://instagram.com.attacker.com/"), false);
});

test("isAllowedImageForSlot enforces server-owned allowlist per slot", () => {
  assert.equal(isAllowedImageForSlot("hero", "/images/hero/Hero-image.webp"), true);
  assert.equal(isAllowedImageForSlot("hero", "/images/gallery/restaurant1.webp"), true);
  assert.equal(isAllowedImageForSlot("hero", "/images/dishes/pizza/margherita.webp"), false); // not in hero slot
  assert.equal(isAllowedImageForSlot("hero", "/uploads/avatar.png"), false); // arbitrary upload rejected
  assert.equal(isAllowedImageForSlot("hero", "https://evil.com/img.jpg"), false);

  assert.equal(isAllowedImageForSlot("menuHero", "/images/menu/menu-hero.webp"), true);
  assert.equal(isAllowedImageForSlot("menuHero", "/images/dishes/pizza/falken-special.webp"), true);
  assert.equal(isAllowedImageForSlot("menuHero", "/images/hero/Hero-image.webp"), false);

  assert.equal(isAllowedImageForSlot("contactHero", "/images/gallery/restaurant1.webp"), true);
  assert.equal(isAllowedImageForSlot("contactHero", "/images/hero/falken-kontakt-hero.webp"), true);
  assert.equal(isAllowedImageForSlot("contactHero", "/images/dishes/kebab/kebabpizza.webp"), false);
});

test("restaurantSettingsEditSchema validates input and rejects malformed values or unknown keys", () => {
  const valid = {
    expectedRevision: 1,
    name: "Falken",
    legalName: "Restaurang & Pizzeria Falken AB",
    tagline: "Klassisk restaurang & pizzeria",
    phone: "019 29 48 98",
    email: "kontakt@restaurangfalken.se",
    address: {
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
    },
    prepMinutes: 15,
    lastPickupBeforeClose: 20,
  };
  const parseResult = restaurantSettingsEditSchema.safeParse(valid);
  assert.equal(parseResult.success, true);

  // Rejection of unknown keys (strict)
  const unknownKey = { ...valid, unknownField: "hacker" };
  assert.equal(restaurantSettingsEditSchema.safeParse(unknownKey).success, false);

  // Rejection of phoneHref in input (phoneHref must be derived server-side)
  const withPhoneHref = { ...valid, phoneHref: "tel:123" };
  assert.equal(restaurantSettingsEditSchema.safeParse(withPhoneHref).success, false);

  // Rejection of invalid email
  const badEmail = { ...valid, email: "not-an-email" };
  assert.equal(restaurantSettingsEditSchema.safeParse(badEmail).success, false);

  // Rejection of out-of-bounds prepMinutes (< 5 or > 60)
  const tooLowPrep = { ...valid, prepMinutes: 2 };
  assert.equal(restaurantSettingsEditSchema.safeParse(tooLowPrep).success, false);
  const tooHighPrep = { ...valid, prepMinutes: 120 };
  assert.equal(restaurantSettingsEditSchema.safeParse(tooHighPrep).success, false);

  // Rejection of unapproved image
  const unapprovedImage = { ...valid, heroImage: "/images/dishes/random.webp" };
  assert.equal(restaurantSettingsEditSchema.safeParse(unapprovedImage).success, false);
});

test("settingsEditFingerprint produces deterministic SHA-256 and detects changes", () => {
  const base = {
    expectedRevision: 2,
    name: "Falken",
    phone: "019 29 48 98",
  };
  const fp1 = settingsEditFingerprint(base);
  const fp2 = settingsEditFingerprint({ ...base });
  assert.equal(fp1, fp2);

  const fpChanged = settingsEditFingerprint({ ...base, name: "Falken Pizzeria" });
  assert.notEqual(fp1, fpChanged);
});

test("resolveEffectiveSettings provides complete safe fallbacks when database is empty", () => {
  const fallback = resolveEffectiveSettings(null);
  assert.equal(fallback.name, "Falken");
  assert.equal(fallback.phone, "019 29 48 98");
  assert.equal(fallback.phoneHref, "tel:+4619294898");
  assert.equal(fallback.address.street, "Skolgatan 4");
  assert.equal(fallback.address.zip, "719 30");
  assert.equal(fallback.address.city, "Vintrosa");
  assert.equal(fallback.prepMinutes, 10);
  assert.equal(fallback.lastPickupBeforeClose, 15);
  assert.equal(fallback.revision, 0);

  // Partial override
  const partial = resolveEffectiveSettings({
    name: "Nytt Falken Namn",
    phone: "019 12 34 56",
    prepMinutes: 20,
    __v: 3,
  });
  assert.equal(partial.name, "Nytt Falken Namn");
  assert.equal(partial.phone, "019 12 34 56");
  assert.equal(partial.phoneHref, "tel:+4619123456"); // derived dynamically
  assert.equal(partial.address.street, "Skolgatan 4"); // falls back to Skolgatan 4
  assert.equal(partial.prepMinutes, 20);
  assert.equal(partial.revision, 3);
});
