import { connectDb, disconnectDb } from "../src/server/db.ts";
import { StaffUserModel } from "../src/server/models/staff.ts";
import { hashPassword, normaliseStaffEmail } from "../src/server/admin-auth.ts";

async function main() {
  await connectDb();
  try {
    const action = process.argv[2] ?? "list";

    if (action === "list") {
      const users = await StaffUserModel.find().select("email displayName role active bootstrapAdmin");
      console.log("STAFF_USERS_COUNT:", users.length);
      for (const u of users) {
        console.log(`- Email: ${u.email} | Name: ${u.displayName} | Role: ${u.role} | Active: ${u.active}`);
      }
      return;
    }

    if (action === "set") {
      const email = process.argv[3];
      const password = process.argv[4];
      const name = process.argv[5] || "Admin";

      if (!email || !password) {
        console.error("Usage: node scripts/manage-staff.ts set <email> <password> [name]");
        process.exitCode = 1;
        return;
      }

      if (password.length < 8) {
        console.error("Password must be at least 8 characters");
        process.exitCode = 1;
        return;
      }

      const normalisedEmail = normaliseStaffEmail(email);
      const passwordHash = await hashPassword(password);

      const existing = await StaffUserModel.findOne({ email: normalisedEmail });
      if (existing) {
        existing.passwordHash = passwordHash;
        existing.active = true;
        existing.role = "ADMIN";
        existing.authVersion = (existing.authVersion || 1) + 1;
        await existing.save();
        console.log(`Updated admin password for ${normalisedEmail}`);
      } else {
        const hasAdmin = await StaffUserModel.exists({ role: "ADMIN" });
        await StaffUserModel.create({
          email: normalisedEmail,
          displayName: name,
          passwordHash,
          role: "ADMIN",
          bootstrapAdmin: !hasAdmin,
          active: true,
          authVersion: 1,
        });
        console.log(`Created new ADMIN user: ${normalisedEmail}`);
      }
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exitCode = 1;
});
