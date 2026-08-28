const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("./dist/generated/prisma/client.js");
const url = require("fs").readFileSync("C:/Users/Windows 10/Documents/projetde_memoire/backend/.env", "utf8").match(/DATABASE_URL="([^"]+)"/)[1];
const id = Number(process.argv[2]);
const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
c.utilisateur
  .update({
    where: { id },
    data: { resetTokenExpiresAt: new Date(Date.now() - 3600000) },
  })
  .then(() => c.utilisateur.findUnique({ where: { id }, select: { resetTokenExpiresAt: true } }))
  .then((u) => {
    console.log("set_past=" + u.resetTokenExpiresAt.toISOString() + " expired_now=" + (u.resetTokenExpiresAt.getTime() < Date.now()));
    return c.$disconnect();
  })
  .catch((e) => { console.error(e.message); process.exit(1); });