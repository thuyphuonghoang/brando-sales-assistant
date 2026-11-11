import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { syncSheetsToFirestore } from "@/server/google/sheets";

export const POST = handle(async () => {
  const user = await requireUser(["admin"]);
  return await syncSheetsToFirestore(user.uid);
});
