import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { prisma } from "./client.js";

function loadEnv(): void {
  const file = path.resolve(process.cwd(), "../../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const DEFAULT_SETTINGS = {
  companyName: "Верстакофф",
  inn: "",
  kpp: "",
  address: "",
  phone: "",
  email: "",
  site: "https://werstakoff.ru",
  managerName: "",
  paymentTerms: "Оплата по счёту. Предоплата 50%, остаток после уведомления о готовности.",
  deliveryTerms: "Доставка по России. Срок и стоимость согласовываются с менеджером.",
  offerValidityDays: 14,
  disclaimer: "Предложение не является публичной офертой.",
  logoFileId: null,
};

async function main() {
  const login = process.env.ADMIN_LOGIN ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  const passwordHash = await hash(password);

  await prisma.adminUser.upsert({
    where: { login },
    update: { passwordHash },
    create: { login, passwordHash },
  });

  await prisma.setting.upsert({
    where: { key: "company" },
    update: {},
    create: { key: "company", valueJson: DEFAULT_SETTINGS },
  });

  console.log(`Seed OK: admin="${login}", settings=company`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
