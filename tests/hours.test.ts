import { test } from "node:test";
import assert from "node:assert/strict";
import { PREP_MINUTES, SLOT_STEP_MINUTES } from "../src/data/site.ts";
import { getOpenStatus, getPickupSlots } from "../src/lib/hours.ts";

const opts = { prepMinutes: 25, lastBeforeClose: 15, step: 15 };

// 2026-10-22 is a Thursday; Stockholm is UTC+2 (CEST) until 25 Oct.
const at = (utc: string) => new Date(`2026-10-22T${utc}:00Z`);

test("open during winter Thursday afternoon", () => {
  const s = getOpenStatus(at("10:00"), "vinter"); // 12:00 local
  assert.equal(s.isOpen, true);
  assert.match(s.label, /stänger 21:00/);
});

test("closed before opening, reports opening time", () => {
  const s = getOpenStatus(at("06:00"), "vinter"); // 08:00 local
  assert.equal(s.isOpen, false);
  assert.match(s.label, /öppnar 11:00/);
});

test("closed after closing, reports tomorrow", () => {
  const s = getOpenStatus(at("19:30"), "vinter"); // 21:30 local
  assert.equal(s.isOpen, false);
  assert.match(s.label, /imorgon 11:00/);
});

test("Sunday opens at 12:00", () => {
  const s = getOpenStatus(new Date("2026-10-25T08:00:00Z"), "vinter"); // 25 Oct, 09:00 or 10:00 local
  assert.equal(s.isOpen, false);
  assert.match(s.label, /öppnar 12:00/);
});

test("pickup slots start after prep time and round up to the step", () => {
  const slots = getPickupSlots(at("10:00"), "vinter", opts); // 12:00 + 25min -> 12:30 (rounded up from 12:25)
  assert.equal(slots[0], "12:30");
  assert.equal(slots.at(-1), "20:45"); // close 21:00 minus 15
});

test("the configured earliest pickup is within 10 to 15 minutes", () => {
  const slots = getPickupSlots(at("10:00"), "vinter", {
    prepMinutes: PREP_MINUTES,
    lastBeforeClose: 15,
    step: SLOT_STEP_MINUTES,
  });
  assert.equal(slots[0], "12:10");
});

test("before opening, first slot is at opening time", () => {
  const slots = getPickupSlots(at("06:00"), "vinter", opts);
  assert.equal(slots[0], "11:00");
});

test("no slots once the last pickup has passed", () => {
  assert.deepEqual(getPickupSlots(at("18:50"), "vinter", opts), []); // 20:50 local
});
