"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { derivePhoneHref, notifySettingsChange, type PublicRestaurantSettings } from "@/lib/use-restaurant-settings";

type AdminSettingsData = {
  settings: PublicRestaurantSettings;
  allowlists: {
    hero: readonly string[];
    menuHero: readonly string[];
    galleryHero: readonly string[];
    contactHero: readonly string[];
  };
};

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("falken_admin_csrf="));
  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

export function AdminSettingsTab({ adminEmail = "admin@restaurangfalken.se" }: { adminEmail?: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  // Raw server data
  const [serverData, setServerData] = useState<AdminSettingsData | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [menuHeroImage, setMenuHeroImage] = useState("");
  const [galleryHeroImage, setGalleryHeroImage] = useState("");
  const [contactHeroImage, setContactHeroImage] = useState("");
  const [prepMinutes, setPrepMinutes] = useState(10);
  const [lastPickupBeforeClose, setLastPickupBeforeClose] = useState(15);
  const [expectedRevision, setExpectedRevision] = useState(0);

  // Password change state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  // Fetch settings on mount
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/restaurant/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("Kunde inte hämta restauranginställningar");
        const data = (await res.json()) as AdminSettingsData;
        if (active) {
          setServerData(data);
          populateForm(data.settings);
        }
      } catch {
        if (active) {
          setFeedback({
            type: "error",
            message: "Kunde inte ladda inställningarna från servern. Kontrollera anslutningen.",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  function populateForm(s: PublicRestaurantSettings) {
    setName(s.name || "");
    setLegalName(s.legalName || "");
    setTagline(s.tagline || "");
    setPhone(s.phone || "");
    setEmail(s.email || "");
    setStreet(s.address.street || "");
    setZip(s.address.zip || "");
    setCity(s.address.city || "");
    setMapsUrl(s.mapsUrl || "");
    setFacebook(s.social.facebook || "");
    setInstagram(s.social.instagram || "");
    setHeroImage(s.heroImage || "");
    setMenuHeroImage(s.menuHeroImage || "");
    setGalleryHeroImage(s.galleryHeroImage || "");
    setContactHeroImage(s.contactHeroImage || "/images/gallery/restaurant1.webp");
    setPrepMinutes(s.prepMinutes ?? 10);
    setLastPickupBeforeClose(s.lastPickupBeforeClose ?? 15);
    setExpectedRevision(s.revision ?? 0);
  }

  function handleReset() {
    if (serverData) {
      populateForm(serverData.settings);
      setFeedback(null);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);

    try {
      const csrf = getCsrfToken();
      const idempotencyKey = `settings-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const payload = {
        expectedRevision,
        name: name.trim(),
        legalName: legalName.trim(),
        tagline: tagline.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: {
          street: street.trim(),
          zip: zip.trim(),
          city: city.trim(),
          country: "Sverige",
        },
        mapsUrl: mapsUrl.trim(),
        social: {
          facebook: facebook.trim(),
          instagram: instagram.trim(),
        },
        heroImage: heroImage.trim(),
        menuHeroImage: menuHeroImage.trim(),
        galleryHeroImage: galleryHeroImage.trim(),
        contactHeroImage: contactHeroImage.trim() || undefined,
        prepMinutes: Number(prepMinutes),
        lastPickupBeforeClose: Number(lastPickupBeforeClose),
      };

      const res = await fetch("/api/admin/restaurant/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 409 && data.error === "stale_settings") {
        setFeedback({
          type: "warning",
          message: "Inställningarna har uppdaterats av en annan administratör. Ladda om för att se de senaste ändringarna.",
        });
        if (data.settings) {
          setServerData((prev) => (prev ? { ...prev, settings: data.settings } : prev));
          setExpectedRevision(data.settings.revision);
        }
        return;
      }

      if (!res.ok) {
        const errorMsg = data.message || data.details || "Kunde inte spara inställningarna.";
        throw new Error(typeof errorMsg === "string" ? errorMsg : "Ett valideringsfel inträffade.");
      }

      const updatedSettings = data.settings as PublicRestaurantSettings;
      setExpectedRevision(updatedSettings.revision);
      setServerData((prev) => (prev ? { ...prev, settings: updatedSettings } : prev));
      notifySettingsChange(updatedSettings);

      setFeedback({
        type: "success",
        message: "Restauranginställningarna har sparats och uppdaterats på hela webbplatsen!",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Ett oväntat fel inträffade vid sparande.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg("De nya lösenorden matchar inte.");
      return;
    }
    if (newPw.length < 8) {
      setPwMsg("Nytt lösenord måste vara minst 8 tecken.");
      return;
    }

    try {
      setPasswordBusy(true);
      const csrf = getCsrfToken();
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg(data.error === "invalid_current_password" ? "Felaktigt nuvarande lösenord." : "Kunde inte uppdatera lösenordet.");
        return;
      }
      setPwMsg("success:Lösenordet har uppdaterats framgångsrikt!");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch {
      setPwMsg("Nätverksfel vid byte av lösenord.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#e7e1d5] bg-white p-12 text-center shadow-xs">
        <p className="text-sm font-medium text-[#7c828d]">Laddar restauranginställningar…</p>
      </div>
    );
  }

  const allowlists = serverData?.allowlists;
  const derivedPhoneLink = phone ? derivePhoneHref(phone) : "";

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div className="border-b border-[#e8e2d5] pb-4">
        <h2 className="font-serif text-2xl font-bold text-[#1f2328]">Restauranginställningar &amp; Identitet</h2>
        <p className="text-xs text-[#7c828d]">
          Hantera restaurangens information, kontaktuppgifter, foton och driftsparametrar.
        </p>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`rounded-2xl p-4 text-xs font-medium border flex items-center justify-between gap-3 ${
            feedback.type === "success"
              ? "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]"
              : feedback.type === "warning"
                ? "bg-[#fffbeb] text-[#b45309] border-[#fde68a]"
                : "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[0.7rem] uppercase tracking-wider font-bold opacity-75 hover:opacity-100"
          >
            Stäng
          </button>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* CARD 1: IDENTITET */}
        <section aria-labelledby="section-identity" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-[#f1ede3] pb-3">
            <h3 id="section-identity" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              1. Restaurangidentitet
            </h3>
            <p className="text-xs text-[#7c828d]">Visningsnamn och beskrivande text för webbplatsen och logotypen.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="setting-name" className="block text-xs font-semibold text-[#1f2328]">
                Restaurangnamn (Kort/Logotyp) <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-name"
                type="text"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Falken"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-legal" className="block text-xs font-semibold text-[#1f2328]">
                Juridiskt / Fullständigt namn <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-legal"
                type="text"
                required
                maxLength={100}
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Restaurang & Pizzeria Falken"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="setting-tagline" className="block text-xs font-semibold text-[#1f2328]">
                Slogan / Undertitel
              </label>
              <input
                id="setting-tagline"
                type="text"
                maxLength={100}
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Restaurang & Pizzeria"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>
          </div>
        </section>

        {/* CARD 2: KONTAKT OCH ADRESS */}
        <section aria-labelledby="section-contact" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-[#f1ede3] pb-3">
            <h3 id="section-contact" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              2. Kontaktuppgifter &amp; Adress
            </h3>
            <p className="text-xs text-[#7c828d]">Visas i sidfoten, kontaktsidan och på kvitton.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="setting-phone" className="block text-xs font-semibold text-[#1f2328]">
                Telefonnummer <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-phone"
                type="text"
                required
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="019 29 48 98"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              {derivedPhoneLink && (
                <p className="text-[0.68rem] text-[#7c828d]">
                  Härledd samtalslänk på servern: <code className="bg-[#f2ece0] px-1 py-0.5 rounded text-[#1f2328]">{derivedPhoneLink}</code>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-email" className="block text-xs font-semibold text-[#1f2328]">
                E-postadress <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-email"
                type="email"
                required
                maxLength={100}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="djan_ibrahim@hotmail.com"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-street" className="block text-xs font-semibold text-[#1f2328]">
                Gatuadress <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-street"
                type="text"
                required
                maxLength={100}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Skolgatan 4"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor="setting-zip" className="block text-xs font-semibold text-[#1f2328]">
                  Postnummer <span className="text-[#a78347]">*</span>
                </label>
                <input
                  id="setting-zip"
                  type="text"
                  required
                  maxLength={20}
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="719 30"
                  className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="setting-city" className="block text-xs font-semibold text-[#1f2328]">
                  Postort <span className="text-[#a78347]">*</span>
                </label>
                <input
                  id="setting-city"
                  type="text"
                  required
                  maxLength={50}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Vintrosa"
                  className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="setting-maps" className="block text-xs font-semibold text-[#1f2328]">
                Google Maps Länk (måste vara https://google.com/maps eller maps.app.goo.gl)
              </label>
              <input
                id="setting-maps"
                type="url"
                maxLength={500}
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                placeholder="https://www.google.com/maps/search/?api=1&query=..."
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-fb" className="block text-xs font-semibold text-[#1f2328]">
                Facebook URL (https://www.facebook.com/...)
              </label>
              <input
                id="setting-fb"
                type="url"
                maxLength={300}
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://www.facebook.com/FalkenVintrosa/"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-ig" className="block text-xs font-semibold text-[#1f2328]">
                Instagram URL (https://www.instagram.com/...)
              </label>
              <input
                id="setting-ig"
                type="url"
                maxLength={300}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="https://www.instagram.com/falkenvintrosa/"
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
            </div>
          </div>
        </section>

        {/* CARD 3: BILDER OCH BANNERS (ASSET-SELECTION ONLY) */}
        <section aria-labelledby="section-images" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-[#f1ede3] pb-3">
            <h3 id="section-images" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              3. Bilder &amp; Banners
            </h3>
            <p className="text-xs text-[#7c828d]">
              Välj från serverns godkända foton. Kontakt-sidans bakgrundsbild och design är låst och skyddad.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Startsida Hero */}
            <div className="space-y-2">
              <label htmlFor="setting-img-hero" className="block text-xs font-semibold text-[#1f2328]">
                Startsida Hero
              </label>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-[#e4ded2] bg-[#1c1f24]">
                {heroImage ? (
                  <Image src={heroImage} alt="Startsida hero" fill className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[0.7rem] text-[#7c828d]">Ingen bild vald</div>
                )}
              </div>
              <select
                id="setting-img-hero"
                value={heroImage}
                onChange={(e) => setHeroImage(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3 py-2 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              >
                {allowlists?.hero.map((path) => (
                  <option key={path} value={path}>
                    {path.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>

            {/* Meny Hero */}
            <div className="space-y-2">
              <label htmlFor="setting-img-menu" className="block text-xs font-semibold text-[#1f2328]">
                Menysida Banner
              </label>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-[#e4ded2] bg-[#1c1f24]">
                {menuHeroImage ? (
                  <Image src={menuHeroImage} alt="Menysida hero" fill className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[0.7rem] text-[#7c828d]">Ingen bild vald</div>
                )}
              </div>
              <select
                id="setting-img-menu"
                value={menuHeroImage}
                onChange={(e) => setMenuHeroImage(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3 py-2 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              >
                {allowlists?.menuHero.map((path) => (
                  <option key={path} value={path}>
                    {path.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>

            {/* Galleri Hero */}
            <div className="space-y-2">
              <label htmlFor="setting-img-gallery" className="block text-xs font-semibold text-[#1f2328]">
                Gallerisida Banner
              </label>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-[#e4ded2] bg-[#1c1f24]">
                {galleryHeroImage ? (
                  <Image src={galleryHeroImage} alt="Gallerisida hero" fill className="object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[0.7rem] text-[#7c828d]">Ingen bild vald</div>
                )}
              </div>
              <select
                id="setting-img-gallery"
                value={galleryHeroImage}
                onChange={(e) => setGalleryHeroImage(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3 py-2 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              >
                {allowlists?.galleryHero.map((path) => (
                  <option key={path} value={path}>
                    {path.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Kontakt Hero Notice */}
          <div className="rounded-xl border border-[#e8e2d5] bg-[#faf8f4] p-3 text-xs text-[#555a64] flex items-center justify-between">
            <span>
              <strong>Kontaktsidans Hero:</strong> Låst till den godkända interiörbilden (<code>restaurant1.webp</code>) och glaskortsdesignen.
            </span>
            <span className="rounded-full bg-[#15803d]/10 text-[#15803d] px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider">
              Skyddad
            </span>
          </div>
        </section>

        {/* CARD 4: DRIFT OCH TILLAGNINGSTID */}
        <section aria-labelledby="section-operations" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-[#f1ede3] pb-3">
            <h3 id="section-operations" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              4. Kökstider &amp; Avhämtning
            </h3>
            <p className="text-xs text-[#7c828d]">
              Inställningar för tillagningstid och sista beställningsmöjlighet före stängning.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="setting-prep" className="block text-xs font-semibold text-[#1f2328]">
                Normal tillagningstid (minuter) <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-prep"
                type="number"
                required
                min={5}
                max={60}
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              <p className="text-[0.68rem] text-[#7c828d]">Visas för kunden vid beräkning av hämtningstid (standard 10 min).</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-cutoff" className="block text-xs font-semibold text-[#1f2328]">
                Sista avhämtning före stängning (minuter) <span className="text-[#a78347]">*</span>
              </label>
              <input
                id="setting-cutoff"
                type="number"
                required
                min={0}
                max={60}
                value={lastPickupBeforeClose}
                onChange={(e) => setLastPickupBeforeClose(Number(e.target.value))}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              <p className="text-[0.68rem] text-[#7c828d]">Hur långt före stängning sista hämtningstiden kan bokas (standard 15 min).</p>
            </div>
          </div>
        </section>

        {/* ACTION BUTTONS */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="rounded-xl border border-[#d8d0c2] bg-white px-5 py-2.5 text-xs font-semibold text-[#555a64] transition hover:bg-[#faf8f4] hover:text-[#1f2328] disabled:opacity-50"
          >
            Återställ ändringar
          </button>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#a78347] px-7 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#96743b] disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Sparar inställningar…" : "Spara restauranginställningar"}
          </button>
        </div>
      </form>

      {/* CARD 5: ADMIN KONTO & LÖSENORD (PRESERVED FUNCTIONALITY) */}
      <section aria-labelledby="section-security" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
        <div className="border-b border-[#f1ede3] pb-3">
          <h3 id="section-security" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
            5. Administratörskonto &amp; Säkerhet
          </h3>
          <p className="text-xs text-[#7c828d]">Byt lösenord för inloggat administratörskonto ({adminEmail}).</p>
        </div>

        {pwMsg && (
          <div
            className={`rounded-xl p-3 text-xs font-medium ${
              pwMsg.startsWith("success:")
                ? "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]"
                : "bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]"
            }`}
          >
            {pwMsg.replace("success:", "")}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label htmlFor="pw-current" className="block text-xs font-semibold text-[#1f2328]">
              Nuvarande lösenord
            </label>
            <div className="relative">
              <input
                id="pw-current"
                type={showCurrentPw ? "text" : "password"}
                required
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                aria-label={showCurrentPw ? "Dölj lösenord" : "Visa lösenord"}
              >
                {showCurrentPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pw-new" className="block text-xs font-semibold text-[#1f2328]">
              Nytt lösenord
            </label>
            <div className="relative">
              <input
                id="pw-new"
                type={showNewPw ? "text" : "password"}
                required
                placeholder="Minst 8 tecken"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                aria-label={showNewPw ? "Dölj lösenord" : "Visa lösenord"}
              >
                {showNewPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className="block text-xs font-semibold text-[#1f2328]">
              Bekräfta nytt lösenord
            </label>
            <div className="relative">
              <input
                id="pw-confirm"
                type={showConfirmPw ? "text" : "password"}
                required
                placeholder="Upprepa lösenordet"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                aria-label={showConfirmPw ? "Dölj lösenord" : "Visa lösenord"}
              >
                {showConfirmPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordBusy}
            className="rounded-xl bg-[#a78347] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#96743b] transition disabled:opacity-50"
          >
            {passwordBusy ? "Uppdaterar…" : "Uppdatera lösenord"}
          </button>
        </form>
      </section>
    </div>
  );
}
